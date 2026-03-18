import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import * as coolify from '../services/coolify.service.js';
import { logActivity } from '../db/database.js';
import { parseDeploymentStages } from '../services/pipeline.service.js';
import { triggerAutoScan } from '../services/auto-scan.service.js';

function param(req: AuthRequest, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

const router = Router();

router.use(authMiddleware);

/**
 * @openapi
 * /apps/{uuid}:
 *   get:
 *     tags: [Apps]
 *     summary: Get application details
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Application details
 */
router.get('/:uuid', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const app = await coolify.getApplication(param(req, 'uuid'));
    res.json(app);
  } catch (err) {
    console.error('Error getting app:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer l\'application' });
  }
});

/**
 * @openapi
 * /apps/{uuid}/deploy:
 *   post:
 *     tags: [Apps]
 *     summary: Deploy application
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deployment triggered
 */
router.post('/:uuid/deploy', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const appUuid = param(req, 'uuid');
    const result = await coolify.deployApplication(appUuid);
    logActivity(req.user?.id ?? null, null, 'deploy', appUuid);

    // Coolify may return deployment_uuid in various formats or not at all
    let deploymentUuid = result.deployment_uuid
      || (result as any).deploymentUuid
      || (result as any).uuid;

    // If no deployment_uuid in response, fetch latest deployment
    if (!deploymentUuid) {
      try {
        // Wait a moment for Coolify to register the deployment
        await new Promise(r => setTimeout(r, 1500));
        const deployments = await coolify.getDeployments(appUuid);
        if (deployments.length > 0) {
          deploymentUuid = deployments[0].uuid;
        }
      } catch { /* ignore */ }
    }

    console.log('[Deploy] Coolify response:', JSON.stringify(result), '-> deployment_uuid:', deploymentUuid);
    res.json({ ...result, deployment_uuid: deploymentUuid });
    triggerAutoScan(appUuid, req.user?.id ?? null).catch(() => {});
  } catch (err) {
    console.error('Error deploying:', err);
    res.status(502).json({ error: 'coolify_error', message: String(err) });
  }
});

/**
 * @openapi
 * /apps/{uuid}/stop:
 *   post:
 *     tags: [Apps]
 *     summary: Stop application
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Application stopped
 */
router.post('/:uuid/stop', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await coolify.stopApplication(param(req, 'uuid'));
    logActivity(req.user?.id ?? null, null, 'stop', param(req, 'uuid'));
    res.json({ status: 'stopped' });
  } catch (err) {
    console.error('Error stopping:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Erreur lors de l\'arret' });
  }
});

/**
 * @openapi
 * /apps/{uuid}/restart:
 *   post:
 *     tags: [Apps]
 *     summary: Restart application
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Application restarted
 */
router.post('/:uuid/restart', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const appUuid = param(req, 'uuid');
    const result = await coolify.restartApplication(appUuid);
    logActivity(req.user?.id ?? null, null, 'restart', appUuid);

    let deploymentUuid = (result as any).deployment_uuid
      || (result as any).deploymentUuid
      || (result as any).uuid;

    if (!deploymentUuid) {
      try {
        await new Promise(r => setTimeout(r, 1500));
        const deployments = await coolify.getDeployments(appUuid);
        if (deployments.length > 0) deploymentUuid = deployments[0].uuid;
      } catch { /* ignore */ }
    }

    res.json({ ...result, deployment_uuid: deploymentUuid });
  } catch (err) {
    console.error('Error restarting:', err);
    res.status(502).json({ error: 'coolify_error', message: String(err) });
  }
});

/**
 * @openapi
 * /apps/{uuid}/deployments:
 *   get:
 *     tags: [Apps]
 *     summary: Get deployment history
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of deployments
 */
router.get('/:uuid/deployments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deployments = await coolify.getDeployments(param(req, 'uuid'));
    res.json(deployments);
  } catch (err) {
    console.error('Error getting deployments:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer les deploiements' });
  }
});

/**
 * @openapi
 * /apps/deployments/{deploymentUuid}:
 *   get:
 *     tags: [Apps]
 *     summary: Get deployment detail with logs
 *     parameters:
 *       - name: deploymentUuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deployment detail
 */
router.get('/deployments/:deploymentUuid', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deployment = await coolify.getDeployment(param(req, 'deploymentUuid'));
    res.json(deployment);
  } catch (err) {
    console.error('Error getting deployment:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer le deploiement' });
  }
});

/**
 * @openapi
 * /apps/{uuid}/logs:
 *   get:
 *     tags: [Apps]
 *     summary: Get runtime logs
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: since
 *         in: query
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Application logs
 */
router.get('/:uuid/logs', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const since = req.query.since ? parseInt(req.query.since as string) : undefined;
    const logs = await coolify.getAppLogs(param(req, 'uuid'), since);
    res.json({ logs });
  } catch (err) {
    console.error('Error getting logs:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer les logs' });
  }
});

/**
 * @openapi
 * /apps/{uuid}/envs:
 *   get:
 *     tags: [Apps]
 *     summary: Get environment variables
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of environment variables
 */
router.get('/:uuid/envs', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const envs = await coolify.getEnvVars(param(req, 'uuid'));
    res.json(envs);
  } catch (err) {
    console.error('Error getting envs:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer les variables' });
  }
});

/**
 * @openapi
 * /apps/{uuid}/envs:
 *   post:
 *     tags: [Apps]
 *     summary: Create environment variable
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Variable created
 */
router.post('/:uuid/envs', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { key, value, is_build_time } = req.body;
    await coolify.createEnvVar(param(req, 'uuid'), key, value, is_build_time);
    res.json({ status: 'created' });
  } catch (err) {
    console.error('Error creating env:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Erreur lors de la creation' });
  }
});

/**
 * @openapi
 * /apps/{uuid}/envs/{envUuid}:
 *   delete:
 *     tags: [Apps]
 *     summary: Delete environment variable
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: envUuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Variable deleted
 */
router.delete('/:uuid/envs/:envUuid', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await coolify.deleteEnvVar(param(req, 'uuid'), param(req, 'envUuid'));
    res.json({ status: 'deleted' });
  } catch (err) {
    console.error('Error deleting env:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Erreur lors de la suppression' });
  }
});

/**
 * @openapi
 * /apps/{uuid}/envs/{envUuid}:
 *   patch:
 *     tags: [Apps]
 *     summary: Update environment variable
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: envUuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Variable updated
 */
router.patch('/:uuid/envs/:envUuid', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { key, value, is_build_time } = req.body;
    await coolify.updateEnvVar(param(req, 'uuid'), param(req, 'envUuid'), { key, value, is_build_time });
    res.json({ status: 'updated' });
  } catch (err) {
    console.error('Error updating env:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Erreur lors de la mise a jour' });
  }
});

/**
 * @openapi
 * /apps/{uuid}/rollback:
 *   post:
 *     tags: [Apps]
 *     summary: Rollback to a specific deployment
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Rollback initiated
 */
router.post('/:uuid/rollback', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const appUuid = param(req, 'uuid');
    const { deploymentUuid } = req.body;

    if (!deploymentUuid) {
      res.status(400).json({ error: 'bad_request', message: 'deploymentUuid requis' });
      return;
    }

    // Get the deployment to find its commit SHA
    const deployment = await coolify.getDeployment(deploymentUuid);
    if (!deployment.commit) {
      res.status(400).json({ error: 'bad_request', message: 'Ce deploiement n\'a pas de commit SHA' });
      return;
    }

    // Pin the application to this commit and deploy
    await coolify.updateApplication(appUuid, { git_commit_sha: deployment.commit });
    const result = await coolify.deployApplication(appUuid);

    logActivity(req.user?.id ?? null, null, 'rollback', `${appUuid} -> ${deployment.commit.slice(0, 7)}`);

    res.json({ status: 'rolling_back', deployment_uuid: result.deployment_uuid, commit: deployment.commit });
  } catch (err) {
    console.error('Error rolling back:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Erreur lors du rollback' });
  }
});

/**
 * @openapi
 * /apps/{uuid}/unpin:
 *   post:
 *     tags: [Apps]
 *     summary: Unpin commit (resume auto-deploy from latest)
 *     parameters:
 *       - name: uuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Commit unpinned
 */
router.post('/:uuid/unpin', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await coolify.updateApplication(param(req, 'uuid'), { git_commit_sha: '' });
    res.json({ status: 'unpinned' });
  } catch (err) {
    console.error('Error unpinning:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Erreur lors du depin' });
  }
});

/**
 * @openapi
 * /apps/deployments/{deploymentUuid}/pipeline:
 *   get:
 *     tags: [Apps]
 *     summary: Get pipeline stages for a deployment
 *     parameters:
 *       - name: deploymentUuid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pipeline stages
 */
router.get('/deployments/:deploymentUuid/pipeline', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deployment = await coolify.getDeployment(param(req, 'deploymentUuid'));
    const stages = parseDeploymentStages(deployment.status, deployment.logs || '');
    res.json({
      deploymentUuid: deployment.uuid,
      status: deployment.status,
      commit: deployment.commit,
      createdAt: deployment.created_at,
      finishedAt: deployment.finished_at,
      stages,
    });
  } catch (err) {
    console.error('Error getting pipeline:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer le pipeline' });
  }
});

export default router;
