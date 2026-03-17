import { useState, useEffect } from 'react';

interface EnvVar {
  uuid: string;
  key: string;
  value: string;
  is_build_time: boolean;
}

interface Props {
  appUuid: string;
}

export default function EnvVarEditor({ appUuid }: Props) {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [isBuildTime, setIsBuildTime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('devportal_token');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  async function loadEnvVars() {
    try {
      const res = await fetch(`/api/apps/${appUuid}/envs`, { headers });
      if (res.ok) {
        const data = await res.json();
        setEnvVars(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { loadEnvVars(); }, [appUuid]);

  async function handleAdd() {
    if (!newKey.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/apps/${appUuid}/envs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key: newKey, value: newValue, is_build_time: isBuildTime }),
      });
      if (res.ok) {
        setNewKey('');
        setNewValue('');
        setIsBuildTime(false);
        await loadEnvVars();
      } else {
        setError('Erreur lors de l\'ajout');
      }
    } catch { setError('Erreur reseau'); }
    finally { setSaving(false); }
  }

  async function handleDelete(envUuid: string) {
    try {
      await fetch(`/api/apps/${appUuid}/envs/${envUuid}`, { method: 'DELETE', headers });
      await loadEnvVars();
    } catch { /* ignore */ }
  }

  if (loading) {
    return <div className="text-2xs text-txt-muted py-1">Chargement...</div>;
  }

  return (
    <div className="mt-2 space-y-1.5">
      {envVars.length > 0 && (
        <div className="bg-surface-0 border border-border p-2 space-y-1 font-mono text-2xs">
          {envVars.map(env => (
            <div key={env.uuid} className="flex items-center gap-1.5">
              <span className="text-txt-primary font-medium">{env.key}</span>
              <span className="text-txt-muted">=</span>
              <span className="text-txt-secondary truncate max-w-[180px]">{env.value}</span>
              {env.is_build_time && (
                <span className="text-2xs bg-status-critical/20 text-status-critical px-1 py-0.5">build</span>
              )}
              <button
                onClick={() => handleDelete(env.uuid)}
                className="ml-auto text-status-error hover:text-red-300 transition-colors"
                title="Supprimer"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <input
          type="text"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          placeholder="KEY"
          className="input-field w-24"
        />
        <input
          type="text"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          placeholder="value"
          className="input-field flex-1"
        />
        <label className="flex items-center gap-1 text-2xs text-txt-muted">
          <input
            type="checkbox"
            checked={isBuildTime}
            onChange={e => setIsBuildTime(e.target.checked)}
            className="accent-accent"
          />
          build
        </label>
        <button
          onClick={handleAdd}
          disabled={saving || !newKey.trim()}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? '...' : '+'}
        </button>
      </div>

      {error && <p className="text-2xs text-status-error">{error}</p>}
    </div>
  );
}
