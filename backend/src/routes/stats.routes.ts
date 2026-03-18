import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import * as coolify from '../services/coolify.service.js';
import * as monitoring from '../services/monitoring.service.js';
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
    // Use listApplications() instead of iterating projects+envs (1 API call vs N×4)
    const [projects, apps] = await Promise.all([
      coolify.listProjects(),
      coolify.listApplications(),
    ]);

    const monitors = monitoring.getAllMonitorStatuses();

    // Count services by status from the flat apps list
    let running = 0, stopped = 0, deploying = 0;
    for (const app of apps) {
      const status = app.status ?? '';
      if (status.startsWith('running')) running++;
      else if (status.includes('progress') || status.includes('building')) deploying++;
      else stopped++;
    }

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
      services: { running, stopped, deploying, total: apps.length },
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
