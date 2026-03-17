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
    return <div className="text-sm text-gray-400 py-2">Chargement...</div>;
  }

  return (
    <div className="mt-3 space-y-2">
      {envVars.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
          {envVars.map(env => (
            <div key={env.uuid} className="flex items-center gap-2 text-xs font-mono">
              <span className="text-gray-700 font-medium">{env.key}</span>
              <span className="text-gray-400">=</span>
              <span className="text-gray-500 truncate max-w-[200px]">{env.value}</span>
              {env.is_build_time && (
                <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">build</span>
              )}
              <button
                onClick={() => handleDelete(env.uuid)}
                className="ml-auto text-red-400 hover:text-red-600 transition"
                title="Supprimer"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          type="text"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          placeholder="CLE"
          className="w-28 px-2 py-1.5 text-xs border border-gray-300 rounded font-mono focus:ring-1 focus:ring-blue-500 outline-none"
        />
        <input
          type="text"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          placeholder="valeur"
          className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded font-mono focus:ring-1 focus:ring-blue-500 outline-none"
        />
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={isBuildTime}
            onChange={e => setIsBuildTime(e.target.checked)}
            className="rounded"
          />
          build
        </label>
        <button
          onClick={handleAdd}
          disabled={saving || !newKey.trim()}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving ? '...' : '+'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
