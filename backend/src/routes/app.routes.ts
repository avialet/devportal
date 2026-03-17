import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import * as coolify from '../services/coolify.service.js';
import { logActivity } from '../db/database.js';

function param(req: AuthRequest, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

const router = Router();

router.use(authMiddleware);

// Get application details
router.get('/:uuid', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const app = await coolify.getApplication(param(req, 'uuid'));
    res.json(app);
  } catch (err) {
    console.error('Error getting app:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer l\'application' });
  }
});

// Deploy application
router.post('/:uuid/deploy', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await coolify.deployApplication(param(req, 'uuid'));
    logActivity(req.user?.id ?? null, null, 'deploy', param(req, 'uuid'));
    res.json(result);
  } catch (err) {
    console.error('Error deploying:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Erreur lors du deploiement' });
  }
});

// Stop application
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

// Restart application
router.post('/:uuid/restart', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await coolify.restartApplication(param(req, 'uuid'));
    logActivity(req.user?.id ?? null, null, 'restart', param(req, 'uuid'));
    res.json(result);
  } catch (err) {
    console.error('Error restarting:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Erreur lors du redemarrage' });
  }
});

// Get deployment history
router.get('/:uuid/deployments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deployments = await coolify.getDeployments(param(req, 'uuid'));
    res.json(deployments);
  } catch (err) {
    console.error('Error getting deployments:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer les deploiements' });
  }
});

// Get deployment detail (logs)
router.get('/deployments/:deploymentUuid', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deployment = await coolify.getDeployment(param(req, 'deploymentUuid'));
    res.json(deployment);
  } catch (err) {
    console.error('Error getting deployment:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer le deploiement' });
  }
});

// Get runtime logs
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

// Get environment variables
router.get('/:uuid/envs', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const envs = await coolify.getEnvVars(param(req, 'uuid'));
    res.json(envs);
  } catch (err) {
    console.error('Error getting envs:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Impossible de recuperer les variables' });
  }
});

// Create environment variable
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

// Delete environment variable
router.delete('/:uuid/envs/:envUuid', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await coolify.deleteEnvVar(param(req, 'uuid'), param(req, 'envUuid'));
    res.json({ status: 'deleted' });
  } catch (err) {
    console.error('Error deleting env:', err);
    res.status(502).json({ error: 'coolify_error', message: 'Erreur lors de la suppression' });
  }
});

// Update environment variable
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

export default router;
