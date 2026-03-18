import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import * as coolify from '../services/coolify.service.js';
import { runWizard } from '../services/project-wizard.service.js';
import * as monitoring from '../services/monitoring.service.js';
import { queryAll, queryOne, runQuery, logActivity } from '../db/database.js';
import { buildFqdn, ENV_NAMES, type EnvName } from '@devportal/shared';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { generateCoolifyWorkflow } from '../services/github.service.js';

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
  dev_monitor_id: number | null;
  staging_monitor_id: number | null;
  prod_monitor_id: number | null;
  created_at: string;
}

const router = Router();

router.use(authMiddleware);

/**
 * @openapi
 * /projects:
 *   get:
 *     tags: [Projects]
 *     summary: List all projects
 *     responses:
 *       200:
 *         description: Array of projects with environments and apps
 */
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const coolifyProjects = await coolify.listProjects();
    const portalProjects = queryAll<DbProject>('SELECT * FROM portal_projects');

    const portalMap = new Map(portalProjects.map(p => [p.coolify_project_uuid, p]));

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Fetch each project sequentially to avoid Coolify rate limiting
    // (with 30s cache, only the first load is slow — subsequent loads are instant)
    const projects = [];
    for (const cp of coolifyProjects) {
      const portal = portalMap.get(cp.uuid);

      // Fetch full project to get environments list
      let envs: coolify.CoolifyEnvironment[] = [];
      try {
        const fullProject = await coolify.getProject(cp.uuid);
        envs = fullProject.environments ?? [];
      } catch { /* skip */ }

      // For each environment, fetch apps sequentially with small delay
      const apps: { env: string; uuid: string; fqdn: string | null; status: string }[] = [];
      for (const env of envs) {
        try {
          const detail = await coolify.getEnvironmentDetail(cp.uuid, env.name);
          if (detail.applications) {
            for (const app of detail.applications) {
              apps.push({
                env: env.name,
                uuid: app.uuid,
                fqdn: app.fqdn,
                status: app.status,
              });
            }
          }
        } catch { /* skip */ }
        await delay(150); // Small delay between API calls to avoid rate limiting
      }

      // Monitor status per env (local DB only, no Coolify calls)
      const projectMonitorList = portal
        ? monitoring.getMonitorsForProject(portal.id)
        : [];
      const monitorStatus: Record<string, { status: 'up' | 'down' | 'pending'; uptime: number | null }> = {};
      for (const m of projectMonitorList) {
        const s = monitoring.getMonitorStatus(m.id);
        const uptime = monitoring.getUptimePercent(m.id, 24);
        monitorStatus[m.environment ?? 'unknown'] = { status: s.status, uptime };
      }

      projects.push({
        uuid: cp.uuid,
        name: cp.name,
        description: cp.description,
        githubUrl: portal?.github_url ?? null,
        portalManaged: !!portal,
        portalId: portal?.id ?? null,
        environments: envs.map(e => e.name),
        apps,
        monitorStatus,
        createdAt: portal?.created_at ?? null,
      });
    }

    res.json(projects);
  } catch (err) {
    console.error('Error listing projects:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de contacter Coolify' });
  }
});

/**
 * @openapi
 * /projects/{uuid}:
 *   get:
 *     tags: [Projects]
 *     summary: Get project detail
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project detail with environments
 */
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

    // Fetch monitors from monitors table instead of portal_projects columns
    const projectMonitors = portal
      ? monitoring.getMonitorsForProject(portal.id)
      : [];

    res.json({
      uuid: project.uuid,
      name: project.name,
      description: project.description,
      githubUrl: portal?.github_url ?? null,
      portalManaged: !!portal,
      monitors: projectMonitors.map(m => ({
        id: m.id,
        name: m.name,
        url: m.url,
        environment: m.environment,
        status: monitoring.getMonitorStatus(m.id).status,
        ping: monitoring.getMonitorStatus(m.id).ping,
      })),
      environments,
    });
  } catch (err) {
    console.error('Error getting project:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer le projet' });
  }
});

// Screenshot endpoint - fetch via microlink and cache locally
router.get('/:uuid/screenshot', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uuid = param(req, 'uuid');

    // Find target URL - prefer portal project (use buildFqdn), else Coolify fqdn
    let targetUrl: string | null = null;
    const portal = queryOne<DbProject>('SELECT * FROM portal_projects WHERE coolify_project_uuid = ?', [uuid]);
    if (portal) {
      targetUrl = buildFqdn(portal.name, 'production');
    } else {
      try {
        const project = await coolify.getProject(uuid);
        const envs = project.environments ?? [];
        const prodEnv = envs.find(e => e.name === 'production') ?? envs[0];
        if (prodEnv) {
          const detail = await coolify.getEnvironmentDetail(uuid, prodEnv.name);
          const app = detail.applications?.[0];
          if (app?.fqdn) {
            targetUrl = app.fqdn.startsWith('http') ? app.fqdn : `https://${app.fqdn}`;
          }
        }
      } catch { /* skip */ }
    }

    if (!targetUrl) {
      res.status(404).json({ error: 'no_url' });
      return;
    }

    // Check cache - permanent (never re-fetch unless ?refresh=1)
    const cacheDir = join(config.dataDir, 'screenshots');
    const cachePath = join(cacheDir, `${uuid}.png`);
    const forceRefresh = req.query['refresh'] === '1';
    try {
      if (!forceRefresh && existsSync(cachePath)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(readFileSync(cachePath));
        return;
      }
    } catch { /* cache miss */ }

    // Fetch screenshot from microlink
    const mlRes = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}&screenshot=true&meta=false`,
      { signal: AbortSignal.timeout(30_000) }
    );
    const mlData = await mlRes.json() as { status: string; data?: { screenshot?: { url: string } } };

    if (mlData.status === 'success' && mlData.data?.screenshot?.url) {
      const imgRes = await fetch(mlData.data.screenshot.url, { signal: AbortSignal.timeout(15_000) });
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cachePath, buffer);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buffer);
    } else {
      res.status(503).json({ error: 'screenshot_failed' });
    }
  } catch (err: any) {
    console.error('[Screenshot]', err.message);
    res.status(500).json({ error: 'error', message: err.message });
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
    // Fetch user's GitHub token if available
    const dbUser = queryOne<{ github_token: string | null }>('SELECT github_token FROM users WHERE id = ?', [req.user!.id]);

    const result = await runWizard(
      {
        name,
        githubUrl,
        gitBranch,
        portsExposes,
        userId: req.user!.id,
        githubToken: dbUser?.github_token ?? null,
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

/**
 * @openapi
 * /projects/{uuid}/monitors:
 *   post:
 *     tags: [Projects]
 *     summary: Add monitors for a project (auto-create for all envs)
 */
router.post('/:uuid/monitors', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uuid = param(req, 'uuid');
    const portal = queryOne<DbProject>('SELECT * FROM portal_projects WHERE coolify_project_uuid = ?', [uuid]);
    if (!portal) {
      res.status(404).json({ error: 'not_found', message: 'Projet non gere par le portal' });
      return;
    }

    const { environment, url, name: monitorName } = req.body;

    // If a specific env+url is given, create one monitor
    if (environment && url) {
      const id = monitoring.addMonitor(
        monitorName || `${environment}-${portal.name}`,
        url,
        60,
        portal.id,
        environment
      );
      res.json({ id, status: 'created' });
      return;
    }

    // Otherwise auto-create monitors for all 3 envs based on project name
    const created: { environment: string; id: number; url: string }[] = [];
    const existingMonitors = monitoring.getMonitorsForProject(portal.id);
    const existingEnvs = new Set(existingMonitors.map(m => m.environment));

    for (const envName of ENV_NAMES) {
      if (existingEnvs.has(envName)) continue;
      const fqdn = buildFqdn(portal.name, envName as EnvName);
      const id = monitoring.addMonitor(`${envName}-${portal.name}`, fqdn, 60, portal.id, envName);
      created.push({ environment: envName, id, url: fqdn });
    }

    res.json({ status: 'created', monitors: created });
  } catch (err: any) {
    console.error('Error creating project monitors:', err);
    res.status(500).json({ error: 'error', message: err.message });
  }
});

/**
 * @openapi
 * /projects/{uuid}/env-compare:
 *   get:
 *     tags: [Projects]
 *     summary: Compare env vars across environments
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Env var comparison across environments
 */
router.get('/:uuid/env-compare', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uuid = param(req, 'uuid');
    const project = await coolify.getProject(uuid);
    const envs = project.environments ?? [];

    // Fetch env vars for each environment's apps in parallel
    const envVarsByEnv: Record<string, { key: string; value: string; is_build_time: boolean }[]> = {};

    for (const env of envs) {
      const detail = await coolify.getEnvironmentDetail(uuid, env.name);
      const apps = detail.applications ?? [];
      if (apps.length > 0) {
        // Use first app in each environment
        try {
          const vars = await coolify.getEnvVars(apps[0].uuid);
          envVarsByEnv[env.name] = vars.map((v: { key: string; value: string; is_build_time: boolean }) => ({ key: v.key, value: v.value, is_build_time: v.is_build_time }));
        } catch {
          envVarsByEnv[env.name] = [];
        }
      }
    }

    // Build unified comparison
    const allKeys = new Set<string>();
    for (const vars of Object.values(envVarsByEnv)) {
      for (const v of vars) allKeys.add(v.key);
    }

    const envNames = Object.keys(envVarsByEnv);
    const comparison = Array.from(allKeys).sort().map(key => {
      const values: Record<string, string | null> = {};
      for (const envName of envNames) {
        const found = envVarsByEnv[envName]?.find(v => v.key === key);
        values[envName] = found?.value ?? null;
      }

      // Check if values differ
      const uniqueValues = new Set(Object.values(values).filter(v => v !== null));
      const hasDiff = uniqueValues.size > 1 || Object.values(values).some(v => v === null);

      return { key, values, hasDiff };
    });

    res.json({ environments: envNames, comparison });
  } catch (err) {
    console.error('Error comparing envs:', err);
    res.status(502).json({ error: 'error', message: 'Erreur lors de la comparaison' });
  }
});

// Get scan config for a project
router.get('/:uuid/scan-config', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uuid = param(req, 'uuid');
    const portal = queryOne<{ id: number }>('SELECT id FROM portal_projects WHERE coolify_project_uuid = ?', [uuid]);
    if (!portal) {
      res.json([]);
      return;
    }
    const configs = queryAll<{ environment: string; tool: string; enabled: number }>(
      'SELECT environment, tool, enabled FROM project_scan_config WHERE project_id = ?',
      [portal.id]
    );
    res.json(configs.map(c => ({ environment: c.environment, tool: c.tool, enabled: !!c.enabled })));
  } catch (err) {
    console.error('Error getting scan config:', err);
    res.status(500).json({ error: 'error', message: 'Erreur' });
  }
});

// Update scan config for a project
router.put('/:uuid/scan-config', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uuid = param(req, 'uuid');
    const portal = queryOne<{ id: number }>('SELECT id FROM portal_projects WHERE coolify_project_uuid = ?', [uuid]);
    if (!portal) {
      res.status(404).json({ error: 'not_found', message: 'Projet non gere par le portal' });
      return;
    }
    const { environment, tool, enabled } = req.body;
    if (!environment) {
      res.status(400).json({ error: 'bad_request', message: 'environment requis' });
      return;
    }
    runQuery(
      'INSERT INTO project_scan_config (project_id, environment, tool, enabled) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, environment) DO UPDATE SET tool = excluded.tool, enabled = excluded.enabled',
      [portal.id, environment, tool || 'nuclei', enabled ? 1 : 0]
    );
    res.json({ status: 'updated' });
  } catch (err) {
    console.error('Error updating scan config:', err);
    res.status(500).json({ error: 'error', message: 'Erreur' });
  }
});

// Get project members
router.get('/:uuid/members', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uuid = param(req, 'uuid');
    const portal = queryOne<{ id: number }>('SELECT id FROM portal_projects WHERE coolify_project_uuid = ?', [uuid]);
    if (!portal) { res.json([]); return; }
    const members = queryAll<{ id: number; user_id: number; role: string; display_name: string; email: string }>(
      `SELECT pm.id, pm.user_id, pm.role, u.display_name, u.email
       FROM project_members pm JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = ?`,
      [portal.id]
    );
    res.json(members);
  } catch (err) {
    console.error('Error getting members:', err);
    res.status(500).json({ error: 'error', message: 'Erreur' });
  }
});

// Add project member
router.post('/:uuid/members', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uuid = param(req, 'uuid');
    const portal = queryOne<{ id: number }>('SELECT id FROM portal_projects WHERE coolify_project_uuid = ?', [uuid]);
    if (!portal) { res.status(404).json({ error: 'not_found' }); return; }
    const { userId, role } = req.body;
    runQuery(
      'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role',
      [portal.id, userId, role || 'viewer']
    );
    res.json({ status: 'added' });
  } catch (err) {
    console.error('Error adding member:', err);
    res.status(500).json({ error: 'error', message: 'Erreur' });
  }
});

// Remove project member
// GitHub Actions workflow YAML for a portal-managed project
router.get('/:uuid/workflow', (req: AuthRequest, res: Response): void => {
  const uuid = param(req, 'uuid');
  const portal = queryOne<DbProject>('SELECT * FROM portal_projects WHERE coolify_project_uuid = ?', [uuid]);
  if (!portal) { res.status(404).json({ error: 'not_found' }); return; }
  const yaml = generateCoolifyWorkflow(
    config.coolifyApiUrl,
    portal.dev_app_uuid,
    portal.staging_app_uuid,
    portal.prod_app_uuid
  );
  res.json({ yaml, coolifyApiUrl: config.coolifyApiUrl });
});

router.delete('/:uuid/members/:memberId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    runQuery('DELETE FROM project_members WHERE id = ?', [parseInt(param(req, 'memberId'))]);
    res.json({ status: 'removed' });
  } catch (err) {
    console.error('Error removing member:', err);
    res.status(500).json({ error: 'error', message: 'Erreur' });
  }
});

/**
 * Fix private repo access:
 * 1. Clean broken git_repository URLs (remove embedded oauth2 tokens)
 * 2. Add Coolify's SSH deploy key to the GitHub repo
 * 3. Reset git_repository to clean owner/repo format
 */
router.post('/:uuid/fix-git-auth', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uuid = param(req, 'uuid');
    const dbUser = queryOne<{ github_token: string | null }>('SELECT github_token FROM users WHERE id = ?', [req.user!.id]);
    if (!dbUser?.github_token) {
      res.status(400).json({ error: 'no_token', message: 'Configurez votre token GitHub dans Profil d\'abord' });
      return;
    }

    const { addDeployKey } = await import('../services/github.service.js');
    const project = await coolify.getProject(uuid);
    const envs = project.environments ?? [];
    const patched: string[] = [];

    // Get Coolify's SSH deploy key for private repos
    const deployKey = await coolify.getGitDeployKey();
    const deployKeyAdded = new Set<string>();

    for (const env of envs) {
      try {
        const detail = await coolify.getEnvironmentDetail(uuid, env.name);
        for (const app of detail.applications ?? []) {
          let repo = app.git_repository ?? '';
          if (!repo) continue;

          // Extract clean owner/repo from any broken format
          let cleanRepo = repo
            .replace(/https:\/\/oauth2:[^@]+@github\.com\//, '')
            .replace('https://github.com/', '')
            .replace(/\.git$/, '');

          const needsFix = repo !== cleanRepo;
          const [owner, repoName] = cleanRepo.split('/');

          // Add deploy key to GitHub repo
          if (deployKey && owner && repoName && !deployKeyAdded.has(cleanRepo)) {
            try {
              await addDeployKey(dbUser.github_token!, owner, repoName, deployKey.publicKey);
              deployKeyAdded.add(cleanRepo);
              console.log(`[fix-git-auth] Deploy key added to ${cleanRepo}`);
            } catch (e: any) {
              console.warn(`[fix-git-auth] Could not add deploy key to ${cleanRepo}:`, e?.message);
            }
          }

          // Reset git_repository to clean owner/repo format
          if (needsFix && cleanRepo.includes('/')) {
            console.log(`[fix-git-auth] Cleaning ${app.uuid}: ${repo} -> ${cleanRepo}`);
            await coolify.updateApplication(app.uuid, { git_repository: cleanRepo });
            patched.push(`${env.name}/${app.uuid}`);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      } catch (e: any) {
        console.error(`[fix-git-auth] Error on env ${env.name}:`, e?.message);
      }
    }

    coolify.invalidateCache();
    res.json({
      status: 'ok',
      patched,
      deployKeysAdded: Array.from(deployKeyAdded),
    });
  } catch (err) {
    res.status(502).json({ error: 'error', message: String(err) });
  }
});

/**
 * @openapi
 * /projects/{uuid}:
 *   delete:
 *     tags: [Projects]
 *     summary: Delete project from portal
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project deleted
 */
router.delete('/:uuid', async (req: AuthRequest, res: Response): Promise<void> => {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  try {
    const uuid = param(req, 'uuid');
    const errors: string[] = [];

    // --- Phase 1: Stop all apps gracefully before any deletion ---
    let allApps: { uuid: string; env: string }[] = [];
    try {
      const project = await coolify.getProject(uuid);
      const envs = project.environments ?? [];
      for (const env of envs) {
        try {
          const detail = await coolify.getEnvironmentDetail(uuid, env.name);
          for (const app of detail.applications ?? []) {
            allApps.push({ uuid: app.uuid, env: env.name });
          }
        } catch (e: any) {
          errors.push(`env ${env.name}: ${e?.message ?? 'skip'}`);
        }
      }
    } catch (e: any) {
      // Coolify project may not exist — proceed to clean portal DB
      console.warn(`Coolify project ${uuid} not found, cleaning portal DB only:`, e?.message);
    }

    // Stop each app one by one with generous pauses for Coolify rate limits
    for (const app of allApps) {
      try {
        await coolify.stopApplication(app.uuid);
        console.log(`Stopped app ${app.uuid} (${app.env})`);
      } catch { /* app may already be stopped */ }
      await delay(4000);
    }

    // --- Phase 2: Delete apps one by one with retries ---
    for (const app of allApps) {
      let deleted = false;
      for (let attempt = 1; attempt <= 3 && !deleted; attempt++) {
        try {
          await coolify.deleteApplication(app.uuid);
          console.log(`Deleted app ${app.uuid} (attempt ${attempt})`);
          deleted = true;
        } catch (e: any) {
          if (attempt < 3) {
            console.warn(`Retry ${attempt}/3 deleting app ${app.uuid}: ${e?.message}`);
            await delay(10000 * attempt);
          } else {
            errors.push(`app ${app.uuid}: ${e?.message ?? 'delete failed'}`);
          }
        }
      }
      await delay(4000);
    }

    // --- Phase 3: Delete the Coolify project shell ---
    if (allApps.length > 0 || errors.length === 0) {
      await delay(2000);
      try {
        await coolify.deleteProject(uuid);
        console.log(`Deleted Coolify project ${uuid}`);
      } catch (e: any) {
        // Not critical — project shell can be cleaned up later
        errors.push(`project: ${e?.message ?? 'delete failed'}`);
      }
    }

    // --- Phase 4: Clean portal DB (monitors + project record) ---
    const portal = queryOne<DbProject>('SELECT * FROM portal_projects WHERE coolify_project_uuid = ?', [uuid]);
    if (portal) {
      const monitors = monitoring.getMonitorsForProject(portal.id);
      for (const m of monitors) {
        monitoring.deleteMonitor(m.id);
      }
    }
    runQuery('DELETE FROM portal_projects WHERE coolify_project_uuid = ?', [uuid]);

    logActivity(req.user?.id ?? null, null, 'delete_project', uuid);
    res.json({ status: 'deleted', warnings: errors.length > 0 ? errors : undefined });
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(502).json({ error: 'error', message: 'Erreur lors de la suppression' });
  }
});

export default router;
