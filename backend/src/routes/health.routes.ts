import { Router } from 'express';
import { getDb } from '../db/database.js';
import { config } from '../config.js';
import { createBackup, listBackups } from '../services/backup.service.js';

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Enriched health check
 *     tags: [Health]
 */
router.get('/', async (_req, res) => {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  // DB check
  const dbStart = Date.now();
  try {
    const db = getDb();
    const result = db.exec('SELECT COUNT(*) as c FROM users');
    const userCount = result[0]?.values[0]?.[0] ?? 0;
    checks.database = { status: 'ok', latency: Date.now() - dbStart };
  } catch (err: any) {
    checks.database = { status: 'error', latency: Date.now() - dbStart, error: err.message };
  }

  // Coolify API check
  const coolifyStart = Date.now();
  try {
    const resp = await fetch(`${config.coolifyApiUrl}/version`, {
      headers: { Authorization: `Bearer ${config.coolifyApiToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const data = await resp.text();
      checks.coolify = { status: 'ok', latency: Date.now() - coolifyStart };
    } else {
      checks.coolify = { status: 'degraded', latency: Date.now() - coolifyStart, error: `HTTP ${resp.status}` };
    }
  } catch (err: any) {
    checks.coolify = { status: 'error', latency: Date.now() - coolifyStart, error: err.message };
  }

  // Uptime Kuma check
  const kumaStart = Date.now();
  try {
    if (config.uptimeKumaUrl) {
      const resp = await fetch(`${config.uptimeKumaUrl}/api/entry-page`, {
        signal: AbortSignal.timeout(5000),
      });
      checks.uptimeKuma = { status: resp.ok ? 'ok' : 'degraded', latency: Date.now() - kumaStart };
    } else {
      checks.uptimeKuma = { status: 'not_configured' };
    }
  } catch (err: any) {
    checks.uptimeKuma = { status: 'error', latency: Date.now() - kumaStart, error: err.message };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok' || c.status === 'not_configured');
  const overallStatus = allOk ? 'healthy' : 'degraded';

  res.json({
    status: overallStatus,
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * @swagger
 * /api/health/backups:
 *   get:
 *     summary: List database backups
 *     tags: [Health]
 */
router.get('/backups', (_req, res) => {
  try {
    const backups = listBackups();
    res.json({ backups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/health/backups:
 *   post:
 *     summary: Create a manual database backup
 *     tags: [Health]
 */
router.post('/backups', (_req, res) => {
  try {
    const { path, size } = createBackup();
    res.json({ status: 'ok', path, size });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
