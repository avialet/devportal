import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import * as coolify from '../services/coolify.service.js';
import * as kuma from '../services/uptimekuma.service.js';
import { queryAll } from '../db/database.js';

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /stats:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get dashboard statistics
 *     responses:
 *       200:
 *         description: KPI metrics
 */
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const projects = await coolify.listProjects();
    const monitors = kuma.getAllMonitorStatuses();

    // Count services by status — need to fetch each project's environments + apps
    let running = 0, stopped = 0, deploying = 0;
    await Promise.all(
      projects.map(async (p) => {
        try {
          const fullProject = await coolify.getProject(p.uuid);
          const envs = fullProject.environments ?? [];
          await Promise.all(
            envs.map(async (env) => {
              try {
                const detail = await coolify.getEnvironmentDetail(p.uuid, env.name);
                for (const app of detail.applications ?? []) {
                  if (app.status === 'running') running++;
                  else if (app.status === 'stopped' || app.status === 'exited') stopped++;
                  else if (app.status?.includes('progress') || app.status?.includes('building')) deploying++;
                  else stopped++;
                }
              } catch { /* skip */ }
            })
          );
        } catch { /* skip */ }
      })
    );

    // Recent scans
    const recentScans = queryAll<{
      id: string;
      target_url: string;
      tool: string;
      status: string;
      findings_summary: string | null;
      created_at: string;
    }>('SELECT id, target_url, tool, status, findings_summary, created_at FROM security_scans ORDER BY created_at DESC LIMIT 5');

    // Monitors
    const monitorsUp = monitors.filter(m => m.status === 'up').length;
    const monitorsDown = monitors.filter(m => m.status === 'down').length;

    res.json({
      projects: projects.length,
      services: { running, stopped, deploying, total: running + stopped + deploying },
      monitors: { up: monitorsUp, down: monitorsDown, total: monitors.length },
      recentScans: recentScans.map(s => ({
        id: s.id,
        targetUrl: s.target_url,
        tool: s.tool,
        status: s.status,
        findings: s.findings_summary ? JSON.parse(s.findings_summary) : null,
        createdAt: s.created_at,
      })),
    });
  } catch (err) {
    console.error('Error getting stats:', err);
    res.status(502).json({ error: 'stats_error', message: 'Erreur lors du chargement des statistiques' });
  }
});

export default router;
