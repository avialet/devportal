import { runQuery, queryAll, queryOne } from '../db/database.js';

interface MonitorRow {
  id: number;
  name: string;
  url: string;
  interval_seconds: number;
  project_id: number | null;
  environment: string | null;
  enabled: number;
  created_at: string;
}

interface MonitorCheckRow {
  id: number;
  monitor_id: number;
  status_code: number;
  response_time_ms: number | null;
  error: string | null;
  checked_at: string;
}

// In-memory cache of latest status per monitor
const statusCache = new Map<number, {
  status: 'up' | 'down' | 'pending';
  ping: number | null;
  name: string;
  url: string;
  lastCheck: number; // timestamp ms
}>();

let checkTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// --- Public API ---

export function addMonitor(
  name: string,
  url: string,
  intervalSeconds = 60,
  projectId?: number | null,
  environment?: string | null
): number {
  runQuery(
    'INSERT INTO monitors (name, url, interval_seconds, project_id, environment) VALUES (?, ?, ?, ?, ?)',
    [name, url, intervalSeconds, projectId ?? null, environment ?? null]
  );
  const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
  const id = row?.id ?? 0;

  // Initialize cache
  statusCache.set(id, {
    status: 'pending',
    ping: null,
    name,
    url,
    lastCheck: 0,
  });

  return id;
}

export function deleteMonitor(monitorId: number): void {
  runQuery('DELETE FROM monitor_checks WHERE monitor_id = ?', [monitorId]);
  runQuery('DELETE FROM monitors WHERE id = ?', [monitorId]);
  statusCache.delete(monitorId);
}

export function getMonitorStatus(monitorId: number): {
  status: 'up' | 'down' | 'pending';
  ping: number | null;
  name: string;
} {
  const cached = statusCache.get(monitorId);
  if (!cached) return { status: 'pending', ping: null, name: '' };
  return { status: cached.status, ping: cached.ping, name: cached.name };
}

export function getAllMonitorStatuses(): {
  id: number;
  name: string;
  url: string;
  status: 'up' | 'down' | 'pending';
  ping: number | null;
  environment: string | null;
  projectId: number | null;
}[] {
  // Query all monitors from DB to include metadata
  const monitors = queryAll<MonitorRow>('SELECT * FROM monitors WHERE enabled = 1');
  return monitors.map(m => {
    const cached = statusCache.get(m.id);
    return {
      id: m.id,
      name: m.name,
      url: m.url,
      status: cached?.status ?? 'pending',
      ping: cached?.ping ?? null,
      environment: m.environment,
      projectId: m.project_id,
    };
  });
}

export function getMonitorHistory(monitorId: number, limit = 50): MonitorCheckRow[] {
  return queryAll<MonitorCheckRow>(
    'SELECT * FROM monitor_checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT ?',
    [monitorId, limit]
  );
}

export function getMonitorsForProject(projectId: number): MonitorRow[] {
  return queryAll<MonitorRow>('SELECT * FROM monitors WHERE project_id = ? AND enabled = 1', [projectId]);
}

export function getUptimePercent(monitorId: number, hours = 24): number | null {
  const rows = queryAll<{ total: number; up: number }>(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 ELSE 0 END) as up
     FROM monitor_checks
     WHERE monitor_id = ? AND checked_at > datetime('now', '-${hours} hours')`,
    [monitorId]
  );
  const row = rows[0];
  if (!row || row.total === 0) return null;
  return Math.round((row.up / row.total) * 100);
}

export function isConnected(): boolean {
  return checkTimer !== null;
}

// --- Check engine ---

async function checkMonitor(monitor: MonitorRow): Promise<void> {
  const start = Date.now();
  let statusCode = 0;
  let responseTime: number | null = null;
  let error: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(monitor.url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'DevPortal-Monitor/1.0' },
    });

    clearTimeout(timeout);
    statusCode = resp.status;
    responseTime = Date.now() - start;
  } catch (err: any) {
    responseTime = Date.now() - start;
    error = err.name === 'AbortError' ? 'Timeout (10s)' : (err.message || 'Unknown error');
  }

  // Determine status
  const isUp = statusCode >= 200 && statusCode < 400;

  // Save to DB
  runQuery(
    'INSERT INTO monitor_checks (monitor_id, status_code, response_time_ms, error) VALUES (?, ?, ?, ?)',
    [monitor.id, statusCode, responseTime, error]
  );

  // Update cache
  statusCache.set(monitor.id, {
    status: isUp ? 'up' : 'down',
    ping: responseTime,
    name: monitor.name,
    url: monitor.url,
    lastCheck: Date.now(),
  });
}

async function runCheckCycle(): Promise<void> {
  const monitors = queryAll<MonitorRow>('SELECT * FROM monitors WHERE enabled = 1');

  const now = Date.now();
  const tasks: Promise<void>[] = [];

  for (const monitor of monitors) {
    const cached = statusCache.get(monitor.id);
    const elapsed = cached ? now - cached.lastCheck : Infinity;

    // Only check if enough time has passed
    if (elapsed >= monitor.interval_seconds * 1000) {
      tasks.push(
        checkMonitor(monitor).catch(err => {
          console.error(`[Monitor] Error checking ${monitor.name}:`, err);
        })
      );
    }
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}

function cleanupOldChecks(): void {
  // Delete checks older than 7 days
  try {
    runQuery(
      "DELETE FROM monitor_checks WHERE checked_at < datetime('now', '-7 days')"
    );
  } catch (err) {
    console.error('[Monitor] Cleanup error:', err);
  }
}

// --- Init ---

export async function initMonitoring(): Promise<void> {
  // Load existing monitor statuses from last checks
  const monitors = queryAll<MonitorRow>('SELECT * FROM monitors WHERE enabled = 1');
  for (const m of monitors) {
    const lastCheck = queryOne<MonitorCheckRow>(
      'SELECT * FROM monitor_checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 1',
      [m.id]
    );
    const isUp = lastCheck && lastCheck.status_code >= 200 && lastCheck.status_code < 400;
    statusCache.set(m.id, {
      status: lastCheck ? (isUp ? 'up' : 'down') : 'pending',
      ping: lastCheck?.response_time_ms ?? null,
      name: m.name,
      url: m.url,
      lastCheck: lastCheck ? new Date(lastCheck.checked_at).getTime() : 0,
    });
  }

  console.log(`[Monitor] Loaded ${monitors.length} monitors`);

  // Run first check immediately
  runCheckCycle().catch(console.error);

  // Check cycle every 15 seconds
  checkTimer = setInterval(() => {
    runCheckCycle().catch(console.error);
  }, 15_000);

  // Cleanup old checks every hour
  cleanupTimer = setInterval(cleanupOldChecks, 3600_000);
}

export function stopMonitoring(): void {
  if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
}
