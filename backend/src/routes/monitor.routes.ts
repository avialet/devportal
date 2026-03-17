import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import * as kuma from '../services/uptimekuma.service.js';

const router = Router();

router.use(authMiddleware);

/**
 * @openapi
 * /monitors:
 *   get:
 *     tags: [Monitoring]
 *     summary: Get all monitor statuses
 *     responses:
 *       200:
 *         description: Monitor statuses from Uptime Kuma
 */
router.get('/', (_req: AuthRequest, res: Response): void => {
  res.json({
    connected: kuma.isConnected(),
    monitors: kuma.getAllMonitorStatuses(),
  });
});

// Get specific monitor status
router.get('/:id', (req: AuthRequest, res: Response): void => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'bad_request', message: 'ID invalide' });
    return;
  }
  res.json(kuma.getMonitorStatus(id));
});

export default router;
