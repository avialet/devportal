import { Router, type Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';
import {
  startScan,
  listScans,
  getScan,
  getScanReportPath,
  deleteScan,
  cancelScan,
  validateTargetUrl,
  getRunningCount,
} from '../services/scanner.service.js';
import type { ScanTool } from '@devportal/shared';

const router = Router();
const VALID_TOOLS: ScanTool[] = ['nuclei', 'zap-baseline', 'zap-full'];

function paramStr(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

// All security routes require admin
router.use(authMiddleware, adminOnly);

/**
 * @openapi
 * /security/scans:
 *   post:
 *     tags: [Security]
 *     summary: Start a security scan (SSE response)
 *     responses:
 *       200:
 *         description: SSE stream with scan progress
 */
router.post('/scans', (req: AuthRequest, res: Response): void => {
  const { targetUrl, tool, projectId } = req.body;

  if (!targetUrl || !tool) {
    res.status(400).json({ error: 'bad_request', message: 'targetUrl et tool requis' });
    return;
  }

  if (!VALID_TOOLS.includes(tool)) {
    res.status(400).json({ error: 'bad_request', message: `Outil invalide. Choix: ${VALID_TOOLS.join(', ')}` });
    return;
  }

  if (!validateTargetUrl(targetUrl)) {
    res.status(400).json({ error: 'bad_request', message: 'URL invalide (HTTP/HTTPS uniquement)' });
    return;
  }

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sendEvent = (type: string, data: unknown) => {
    res.write(`data: ${JSON.stringify({ type, ...data as object })}\n\n`);
  };

  try {
    const scanId = startScan(
      targetUrl,
      tool as ScanTool,
      req.user!.id,
      projectId || null,
      (message) => sendEvent('progress', { scanId, message }),
      (scan) => {
        sendEvent('complete', { scanId, findingsSummary: scan.findingsSummary });
        res.end();
      },
      (error) => {
        sendEvent('error', { scanId, message: error });
        res.end();
      },
    );

    sendEvent('started', { scanId });
  } catch (err) {
    if (err instanceof Error && err.message === 'TOO_MANY_SCANS') {
      // Can't use res.status() after writeHead, so send error event
      sendEvent('error', { message: 'Trop de scans en cours (max 2). Reessayez plus tard.' });
      res.end();
    } else {
      sendEvent('error', { message: 'Erreur interne' });
      res.end();
    }
  }

  req.on('close', () => {
    // Client disconnected — scan continues in background
  });
});

/**
 * @openapi
 * /security/scans:
 *   get:
 *     tags: [Security]
 *     summary: List all security scans
 *     parameters:
 *       - name: projectId
 *         in: query
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Array of scans
 */
router.get('/scans', (req: AuthRequest, res: Response): void => {
  const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
  const scans = listScans(projectId);
  res.json({ scans, running: getRunningCount() });
});

/**
 * @openapi
 * /security/scans/{id}:
 *   get:
 *     tags: [Security]
 *     summary: Get scan detail
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Scan detail
 */
router.get('/scans/:id', (req: AuthRequest, res: Response): void => {
  const scan = getScan(paramStr(req.params.id));
  if (!scan) {
    res.status(404).json({ error: 'not_found', message: 'Scan non trouve' });
    return;
  }
  res.json(scan);
});

/**
 * @openapi
 * /security/scans/{id}/report:
 *   get:
 *     tags: [Security]
 *     summary: Get raw scan report
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: format
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Scan report content
 */
router.get('/scans/:id/report', (req: AuthRequest, res: Response): void => {
  const reportPath = getScanReportPath(paramStr(req.params.id));
  if (!reportPath || !existsSync(reportPath)) {
    res.status(404).json({ error: 'not_found', message: 'Rapport non disponible' });
    return;
  }

  const format = req.query.format as string || 'auto';
  const content = readFileSync(reportPath, 'utf-8');

  if (reportPath.endsWith('.html') || format === 'html') {
    res.setHeader('Content-Type', 'text/html');
    res.send(content);
  } else if (reportPath.endsWith('.jsonl')) {
    // Parse JSONL into JSON array
    const lines = content.trim().split('\n').filter(Boolean);
    const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    res.json(entries);
  } else {
    res.json(JSON.parse(content));
  }
});

/**
 * @openapi
 * /security/scans/{id}:
 *   delete:
 *     tags: [Security]
 *     summary: Cancel or delete a scan
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Scan cancelled or deleted
 */
router.delete('/scans/:id', (req: AuthRequest, res: Response): void => {
  const scan = getScan(paramStr(req.params.id));
  if (!scan) {
    res.status(404).json({ error: 'not_found', message: 'Scan non trouve' });
    return;
  }

  if (scan.status === 'running') {
    cancelScan(paramStr(req.params.id));
    res.json({ status: 'cancelled' });
  } else {
    deleteScan(paramStr(req.params.id));
    res.json({ status: 'deleted' });
  }
});

export default router;
