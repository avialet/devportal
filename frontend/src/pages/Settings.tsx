import { useState, useEffect } from 'react';
import { api, type HealthResponse, type BackupInfo } from '../api/client';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Settings() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getHealth().catch(() => null),
      api.getBackups().then(r => r.backups).catch(() => []),
    ]).then(([h, b]) => {
      setHealth(h);
      setBackups(b);
    }).finally(() => setLoading(false));
  }, []);

  async function handleCreateBackup() {
    setCreating(true);
    try {
      await api.createBackup();
      const r = await api.getBackups();
      setBackups(r.backups);
    } catch { /* ignore */ }
    finally { setCreating(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-sm font-semibold text-txt-primary">Systeme</h1>

      {/* Health checks */}
      {health && (
        <div className="panel">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <h2 className="text-xs font-semibold text-txt-primary">Health Check</h2>
            <div className="flex items-center gap-2 text-2xs">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 font-medium ${
                health.status === 'healthy' ? 'bg-green-900/30 text-status-ok' : 'bg-yellow-900/30 text-status-warn'
              }`}>
                {health.status}
              </span>
              <span className="text-txt-muted">uptime: {formatUptime(health.uptime)}</span>
              <span className="text-txt-muted">v{health.version}</span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {Object.entries(health.checks).map(([name, check]) => (
              <div key={name} className="px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 ${
                    check.status === 'ok' ? 'bg-status-ok' :
                    check.status === 'degraded' ? 'bg-status-warn' :
                    check.status === 'not_configured' ? 'bg-txt-muted' :
                    'bg-status-error'
                  }`} />
                  <span className="text-xs text-txt-primary capitalize">{name.replace(/([A-Z])/g, ' $1')}</span>
                </div>
                <div className="flex items-center gap-2 text-2xs text-txt-muted">
                  <span className={
                    check.status === 'ok' ? 'text-status-ok' :
                    check.status === 'degraded' ? 'text-status-warn' :
                    check.status === 'error' ? 'text-status-error' :
                    'text-txt-muted'
                  }>
                    {check.status}
                  </span>
                  {check.latency != null && <span>{check.latency}ms</span>}
                  {check.error && <span className="text-status-error truncate max-w-[200px]">{check.error}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backups */}
      <div className="panel">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <h2 className="text-xs font-semibold text-txt-primary">Backups DB</h2>
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="btn-primary disabled:opacity-50"
          >
            {creating ? 'Creation...' : 'Creer un backup'}
          </button>
        </div>
        {backups.length === 0 ? (
          <div className="px-3 py-6 text-center text-2xs text-txt-muted">Aucun backup</div>
        ) : (
          <div className="divide-y divide-border">
            {backups.map(b => (
              <div key={b.name} className="px-3 py-1.5 flex items-center justify-between">
                <span className="text-2xs text-txt-primary font-mono">{b.name}</span>
                <div className="flex items-center gap-3 text-2xs text-txt-muted">
                  <span>{formatBytes(b.size)}</span>
                  <span>{new Date(b.createdAt).toLocaleString('fr-FR')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="px-3 py-1.5 text-2xs text-txt-muted border-t border-border">
          Backup automatique toutes les 6h. 10 backups max conserves.
        </div>
      </div>
    </div>
  );
}
