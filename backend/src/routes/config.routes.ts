import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { queryAll, runQuery } from '../db/database.js';
import { testWebhook } from '../services/alert.service.js';

const router = Router();
router.use(authMiddleware);

interface ConfigRow { key: string; value: string }

const PUBLIC_KEYS = [
  'alert_webhook_url',
  'alert_webhook_type',
];

// GET /api/config - return all public config keys
router.get('/', (_req: AuthRequest, res: Response): void => {
  const rows = queryAll<ConfigRow>(
    `SELECT key, value FROM config WHERE key IN (${PUBLIC_KEYS.map(() => '?').join(',')})`,
    PUBLIC_KEYS
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

// PUT /api/config - update config keys (admin only)
router.put('/', (req: AuthRequest, res: Response): void => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const updates = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(updates)) {
    if (!PUBLIC_KEYS.includes(key)) continue;
    runQuery(
      `INSERT INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );
  }
  res.json({ status: 'updated' });
});

// POST /api/config/test-webhook - send test notification
router.post('/test-webhook', async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const { url, type } = req.body;
  if (!url) {
    res.status(400).json({ error: 'bad_request', message: 'url requis' });
    return;
  }
  try {
    await testWebhook(url, type ?? 'discord');
    res.json({ status: 'ok' });
  } catch (err: any) {
    res.status(502).json({ error: 'webhook_error', message: err.message });
  }
});

export default router;
