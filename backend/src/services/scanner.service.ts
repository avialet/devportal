import { spawn, execSync, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import os from 'os';
import { config } from '../config.js';
import { runQuery, queryOne, queryAll } from '../db/database.js';
import type { SecurityScan, ScanTool, FindingsSummary, ScanStatus } from '@devportal/shared';

const ALLOWED_IMAGES = ['projectdiscovery/nuclei:latest', 'zaproxy/zap-stable'];
const MAX_CONCURRENT = 2;

// Active scan processes
const activeScans = new Map<string, ChildProcess>();

function getReportsDir(): string {
  const dir = config.reportsDir || join(config.dataDir, 'reports');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getScanDir(scanId: string): string {
  const dir = join(getReportsDir(), scanId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

interface DbScan {
  id: string;
  project_id: number | null;
  target_url: string;
  tool: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  report_path: string | null;
  findings_summary: string | null;
  error: string | null;
  triggered_by: number;
  created_at: string;
}

function dbToScan(row: DbScan): SecurityScan {
  return {
    id: row.id,
    projectId: row.project_id,
    targetUrl: row.target_url,
    tool: row.tool as ScanTool,
    status: row.status as ScanStatus,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    reportPath: row.report_path,
    findingsSummary: row.findings_summary ? JSON.parse(row.findings_summary) : null,
    error: row.error,
    triggeredBy: row.triggered_by,
    createdAt: row.created_at,
  };
}

export function getRunningCount(): number {
  return activeScans.size;
}

export function listScans(projectId?: number): SecurityScan[] {
  const sql = projectId
    ? 'SELECT * FROM security_scans WHERE project_id = ? ORDER BY created_at DESC'
    : 'SELECT * FROM security_scans ORDER BY created_at DESC';
  const params = projectId ? [projectId] : [];
  return queryAll<DbScan>(sql, params).map(dbToScan);
}

export function getScan(id: string): SecurityScan | undefined {
  const row = queryOne<DbScan>('SELECT * FROM security_scans WHERE id = ?', [id]);
  return row ? dbToScan(row) : undefined;
}

export function getScanReportPath(id: string): string | null {
  const scan = queryOne<DbScan>('SELECT report_path FROM security_scans WHERE id = ?', [id]);
  return scan?.report_path || null;
}

export function validateTargetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function startScan(
  targetUrl: string,
  tool: ScanTool,
  triggeredBy: number,
  projectId: number | null,
  onProgress: (msg: string) => void,
  onComplete: (scan: SecurityScan) => void,
  onError: (err: string) => void,
): string {
  if (getRunningCount() >= MAX_CONCURRENT) {
    throw new Error('TOO_MANY_SCANS');
  }

  const scanId = crypto.randomUUID();
  const scanDir = getScanDir(scanId);

  // Create DB record
  runQuery(
    'INSERT INTO security_scans (id, project_id, target_url, tool, status, triggered_by) VALUES (?, ?, ?, ?, ?, ?)',
    [scanId, projectId, targetUrl, tool, 'pending', triggeredBy],
  );

  // Start async scan
  setImmediate(() => runScan(scanId, targetUrl, tool, scanDir, onProgress, onComplete, onError));

  return scanId;
}

function runScan(
  scanId: string,
  targetUrl: string,
  tool: ScanTool,
  scanDir: string,
  onProgress: (msg: string) => void,
  onComplete: (scan: SecurityScan) => void,
  onError: (err: string) => void,
): void {
  runQuery('UPDATE security_scans SET status = ?, started_at = datetime(\'now\') WHERE id = ?', ['running', scanId]);

  const args = buildDockerArgs(tool, targetUrl, scanDir);
  onProgress(`Demarrage du scan ${tool} sur ${targetUrl}...`);

  const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  activeScans.set(scanId, child);

  let output = '';

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    output += text;
    // Send last line as progress
    const lines = text.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    if (lastLine) onProgress(lastLine);
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    output += text;
  });

  child.on('close', (code) => {
    activeScans.delete(scanId);

    if (code === null) {
      // Process was killed (cancelled)
      runQuery('UPDATE security_scans SET status = ?, finished_at = datetime(\'now\') WHERE id = ?', ['cancelled', scanId]);
      onError('Scan annule');
      return;
    }

    // Save raw output
    writeFileSync(join(scanDir, 'output.txt'), output);

    try {
      const { reportPath, findings } = parseResults(tool, scanDir, output);

      runQuery(
        'UPDATE security_scans SET status = ?, finished_at = datetime(\'now\'), report_path = ?, findings_summary = ? WHERE id = ?',
        ['completed', reportPath, JSON.stringify(findings), scanId],
      );

      const scan = getScan(scanId);
      if (scan) onComplete(scan);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      runQuery(
        'UPDATE security_scans SET status = ?, finished_at = datetime(\'now\'), error = ? WHERE id = ?',
        ['failed', errMsg, scanId],
      );
      onError(errMsg);
    }
  });

  child.on('error', (err) => {
    activeScans.delete(scanId);
    runQuery(
      'UPDATE security_scans SET status = ?, finished_at = datetime(\'now\'), error = ? WHERE id = ?',
      ['failed', err.message, scanId],
    );
    onError(err.message);
  });
}

/**
 * Auto-detect the host-side path of DATA_DIR by inspecting the current container's mounts.
 * When running Docker-in-Docker, volume mounts (-v) are resolved from the HOST.
 * We use `docker inspect` on our own container to find where /app/data maps on the host.
 * Cached after first successful detection.
 */
let cachedHostDataDir: string | null = null;

function detectHostDataDir(): string | null {
  if (cachedHostDataDir !== null) return cachedHostDataDir || null;

  // First check explicit config (fallback)
  if (config.dockerHostDataDir) {
    cachedHostDataDir = config.dockerHostDataDir;
    return cachedHostDataDir;
  }

  try {
    // Container ID = hostname in Docker
    const containerId = os.hostname();
    const mountsJson = execSync(
      `docker inspect ${containerId} --format '{{json .Mounts}}'`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    const mounts = JSON.parse(mountsJson) as { Source: string; Destination: string }[];
    const dataMount = mounts.find((m) => m.Destination === config.dataDir);
    if (dataMount) {
      cachedHostDataDir = dataMount.Source;
      console.log(`[scanner] Auto-detected host data dir: ${cachedHostDataDir}`);
      return cachedHostDataDir;
    }
  } catch {
    // Not in a container or Docker not available
  }

  cachedHostDataDir = ''; // empty = dev mode, no translation
  return null;
}

function toHostPath(scanDir: string): string {
  const hostDataDir = detectHostDataDir();
  if (!hostDataDir) return scanDir; // dev mode: not in container
  const dataDir = config.dataDir;
  if (scanDir.startsWith(dataDir)) {
    return hostDataDir + scanDir.slice(dataDir.length);
  }
  return scanDir;
}

function buildDockerArgs(tool: ScanTool, targetUrl: string, scanDir: string): string[] {
  const base = ['run', '--rm', '--network', 'coolify'];
  const hostScanDir = toHostPath(scanDir);

  switch (tool) {
    case 'nuclei':
      return [
        ...base,
        '-v', `${hostScanDir}:/output`,
        'projectdiscovery/nuclei:latest',
        '-u', targetUrl,
        '-jsonl', '-o', '/output/report.jsonl',
        '-silent',
      ];
    case 'zap-baseline':
      return [
        ...base,
        '-v', `${hostScanDir}:/zap/wrk:rw`,
        'zaproxy/zap-stable',
        'zap-baseline.py',
        '-t', targetUrl,
        '-J', 'report.json',
        '-r', 'report.html',
      ];
    case 'zap-full':
      return [
        ...base,
        '-v', `${hostScanDir}:/zap/wrk:rw`,
        'zaproxy/zap-stable',
        'zap-full-scan.py',
        '-t', targetUrl,
        '-J', 'report.json',
        '-r', 'report.html',
      ];
  }
}

function parseResults(tool: ScanTool, scanDir: string, _output: string): { reportPath: string; findings: FindingsSummary } {
  const findings: FindingsSummary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  if (tool === 'nuclei') {
    const reportFile = join(scanDir, 'report.jsonl');
    const reportPath = reportFile;
    if (existsSync(reportFile)) {
      const lines = readFileSync(reportFile, 'utf-8').trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const sev = (entry.info?.severity || 'info').toLowerCase();
          if (sev in findings) findings[sev as keyof FindingsSummary]++;
        } catch { /* skip malformed lines */ }
      }
    }
    return { reportPath, findings };
  }

  // ZAP (baseline or full)
  const jsonReport = join(scanDir, 'report.json');
  const htmlReport = join(scanDir, 'report.html');
  const reportPath = existsSync(htmlReport) ? htmlReport : jsonReport;

  if (existsSync(jsonReport)) {
    try {
      const data = JSON.parse(readFileSync(jsonReport, 'utf-8'));
      // ZAP JSON report has site[].alerts[]
      const alerts = data.site?.flatMap((s: { alerts?: { riskdesc?: string }[] }) => s.alerts || []) || [];
      for (const alert of alerts) {
        const risk = (alert.riskdesc || '').toLowerCase();
        if (risk.startsWith('high')) findings.high++;
        else if (risk.startsWith('medium')) findings.medium++;
        else if (risk.startsWith('low')) findings.low++;
        else findings.info++;
      }
    } catch { /* ignore parse errors */ }
  }

  return { reportPath, findings };
}

export function startScanBackground(
  targetUrl: string,
  tool: ScanTool,
  triggeredBy: number | null,
  projectId: number | null,
): string {
  if (getRunningCount() >= MAX_CONCURRENT) {
    throw new Error('TOO_MANY_SCANS');
  }

  const scanId = crypto.randomUUID();
  const scanDir = getScanDir(scanId);

  // Create DB record
  runQuery(
    'INSERT INTO security_scans (id, project_id, target_url, tool, status, triggered_by) VALUES (?, ?, ?, ?, ?, ?)',
    [scanId, projectId, targetUrl, tool, 'pending', triggeredBy],
  );

  // Run scan in background with no-op callbacks
  setImmediate(() =>
    runScan(
      scanId,
      targetUrl,
      tool,
      scanDir,
      () => {},
      () => {},
      () => {},
    ),
  );

  return scanId;
}

export function cancelScan(scanId: string): boolean {
  const child = activeScans.get(scanId);
  if (child) {
    child.kill('SIGTERM');
    return true;
  }
  return false;
}

export function deleteScan(scanId: string): void {
  cancelScan(scanId);
  runQuery('DELETE FROM security_scans WHERE id = ?', [scanId]);
}
