import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import * as monitoring from '../services/monitoring.service.js';

const router = Router();

router.use(authMiddleware);

/**
 * @openapi
 * /monitors:
 *   get:
 *     tags: [Monitoring]
 *     summary: Get all monitor statuses
 */
router.get('/', (_req: AuthRequest, res: Response): void => {
  res.json({
    connected: monitoring.isConnected(),
    monitors: monitoring.getAllMonitorStatuses(),
  });
});

/**
 * @openapi
 * /monitors:
 *   post:
 *     tags: [Monitoring]
 *     summary: Create a new monitor
 */
router.post('/', (req: AuthRequest, res: Response): void => {
  const { name, url, intervalSeconds, projectId, environment } = req.body;
  if (!name || !url) {
    res.status(400).json({ error: 'bad_request', message: 'name et url requis' });
    return;
  }
  try {
    const id = monitoring.addMonitor(name, url, intervalSeconds ?? 60, projectId, environment);
    res.json({ id, status: 'created' });
  } catch (err: any) {
    res.status(500).json({ error: 'error', message: err.message });
  }
});

/**
 * @openapi
 * /monitors/{id}:
 *   get:
 *     tags: [Monitoring]
 *     summary: Get single monitor with history
 */
router.get('/:id', (req: AuthRequest, res: Response): void => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'bad_request', message: 'ID invalide' });
    return;
  }
  const status = monitoring.getMonitorStatus(id);
  const history = monitoring.getMonitorHistory(id, 20);
  res.json({ ...status, history });
});

/**
 * @openapi
 * /monitors/{id}:
 *   delete:
 *     tags: [Monitoring]
 *     summary: Delete a monitor
 */
router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'bad_request', message: 'ID invalide' });
    return;
  }
  try {
    monitoring.deleteMonitor(id);
    res.json({ status: 'deleted' });
  } catch (err: any) {
    res.status(500).json({ error: 'error', message: err.message });
  }
});

export default router;
