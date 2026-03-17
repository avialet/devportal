import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import * as coolify from '../services/coolify.service.js';
import { runWizard } from '../services/project-wizard.service.js';
import { queryAll, queryOne } from '../db/database.js';

function param(req: AuthRequest, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

interface DbProject {
  id: number;
  name: string;
  coolify_project_uuid: string;
  github_url: string;
  created_by: number;
  dev_app_uuid: string | null;
  staging_app_uuid: string | null;
  prod_app_uuid: string | null;
  created_at: string;
}

const router = Router();

router.use(authMiddleware);

// List all projects (Coolify projects enriched with portal data)
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const coolifyProjects = await coolify.listProjects();
    const portalProjects = queryAll<DbProject>('SELECT * FROM portal_projects');

    const portalMap = new Map(portalProjects.map(p => [p.coolify_project_uuid, p]));

    const projects = await Promise.all(
      coolifyProjects.map(async (cp) => {
        const portal = portalMap.get(cp.uuid);
        const envs = cp.environments ?? [];

        // Collect app statuses from environments
        const apps: { env: string; uuid: string; fqdn: string | null; status: string }[] = [];
        for (const env of envs) {
          if (env.applications) {
            for (const app of env.applications) {
              apps.push({
                env: env.name,
                uuid: app.uuid,
                fqdn: app.fqdn,
                status: app.status,
              });
            }
          }
        }

        return {
          uuid: cp.uuid,
          name: cp.name,
          description: cp.description,
          githubUrl: portal?.github_url ?? null,
          portalManaged: !!portal,
          environments: envs.map(e => e.name),
          apps,
          createdAt: portal?.created_at ?? null,
        };
      })
    );

    res.json(projects);
  } catch (err) {
    console.error('Error listing projects:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de contacter Coolify' });
  }
});

// Get project detail with environments and apps
router.get('/:uuid', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uuid = param(req, 'uuid');
    const project = await coolify.getProject(uuid);
    const portal = queryOne<DbProject>(
      'SELECT * FROM portal_projects WHERE coolify_project_uuid = ?',
      [uuid]
    );

    const environments = [];
    const envs = project.environments ?? [];

    for (const env of envs) {
      const detail = await coolify.getEnvironmentDetail(uuid, env.name);
      const apps = detail.applications ?? [];

      environments.push({
        name: env.name,
        apps: apps.map(app => ({
          uuid: app.uuid,
          name: app.name,
          fqdn: app.fqdn,
          status: app.status,
          gitRepository: app.git_repository,
          gitBranch: app.git_branch,
          buildPack: app.build_pack,
        })),
      });
    }

    res.json({
      uuid: project.uuid,
      name: project.name,
      description: project.description,
      githubUrl: portal?.github_url ?? null,
      portalManaged: !!portal,
      environments,
    });
  } catch (err) {
    console.error('Error getting project:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer le projet' });
  }
});

// Create project via wizard (SSE for real-time progress)
router.post('/create', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, githubUrl, gitBranch, portsExposes } = req.body;

  if (!name || !githubUrl) {
    res.status(400).json({ error: 'bad_request', message: 'name et githubUrl requis' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const result = await runWizard(
      {
        name,
        githubUrl,
        gitBranch,
        portsExposes,
        userId: req.user!.id,
      },
      (update) => {
        res.write(`data: ${JSON.stringify(update)}\n\n`);
      }
    );

    res.write(`data: ${JSON.stringify({ step: 0, label: 'complete', status: 'done', detail: JSON.stringify(result) })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ step: 0, label: 'error', status: 'error', detail: String(err) })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
