import { useState, useEffect } from 'react';

interface ScanConfig {
  environment: string;
  tool: string;
  enabled: boolean;
}

interface Props {
  projectUuid: string;
}

export default function AutoScanConfig({ projectUuid }: Props) {
  const [configs, setConfigs] = useState<ScanConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const environments = ['development', 'staging', 'production'];

  async function loadConfigs() {
    try {
      const res = await fetch(`/api/projects/${projectUuid}/scan-config`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        // Merge with all environments
        const merged = environments.map(env => {
          const existing = data.find((c: ScanConfig) => c.environment === env);
          return existing || { environment: env, tool: 'nuclei', enabled: false };
        });
        setConfigs(merged);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { loadConfigs(); }, [projectUuid]);

  async function toggleConfig(env: string, enabled: boolean) {
    const config = configs.find(c => c.environment === env);
    try {
      await fetch(`/api/projects/${projectUuid}/scan-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ environment: env, tool: config?.tool || 'nuclei', enabled }),
      });
      setConfigs(prev => prev.map(c => c.environment === env ? { ...c, enabled } : c));
    } catch { /* ignore */ }
  }

  if (loading) return <div className="text-2xs text-txt-muted">Chargement...</div>;

  return (
    <div className="mt-2 border border-border">
      <div className="px-2 py-1.5 bg-surface-1 border-b border-border">
        <span className="text-2xs font-medium text-txt-primary">Scan automatique post-deploy</span>
      </div>
      <div className="divide-y divide-border">
        {configs.map(c => (
          <div key={c.environment} className="px-2 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xs text-txt-primary capitalize">{c.environment}</span>
              <span className="text-2xs text-txt-muted">{c.tool}</span>
            </div>
            <label className="flex items-center gap-1 text-2xs">
              <input
                type="checkbox"
                checked={c.enabled}
                onChange={e => toggleConfig(c.environment, e.target.checked)}
                className="accent-accent"
              />
              <span className="text-txt-muted">{c.enabled ? 'Actif' : 'Inactif'}</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
