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
  const [visibleValues, setVisibleValues] = useState<Set<string>>(new Set());
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');

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

  function toggleVisibility(envUuid: string) {
    setVisibleValues(prev => {
      const next = new Set(prev);
      if (next.has(envUuid)) next.delete(envUuid);
      else next.add(envUuid);
      return next;
    });
  }

  function startEditing(env: EnvVar) {
    setEditingUuid(env.uuid);
    setEditValue(env.value);
  }

  function cancelEditing() {
    setEditingUuid(null);
    setEditValue('');
  }

  async function saveEdit(envUuid: string) {
    setError('');
    try {
      const res = await fetch(`/api/apps/${appUuid}/envs/${envUuid}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ value: editValue }),
      });
      if (res.ok) {
        setEditingUuid(null);
        setEditValue('');
        await loadEnvVars();
      } else {
        setError('Erreur lors de la mise a jour');
      }
    } catch { setError('Erreur reseau'); }
  }

  async function handleBulkImport() {
    if (!bulkText.trim()) return;
    setSaving(true);
    setError('');
    const lines = bulkText.split('\n').filter(l => l.trim() && l.includes('='));
    let hasError = false;
    for (const line of lines) {
      const eqIndex = line.indexOf('=');
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      if (!key) continue;
      try {
        const res = await fetch(`/api/apps/${appUuid}/envs`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ key, value, is_build_time: false }),
        });
        if (!res.ok) hasError = true;
      } catch { hasError = true; }
    }
    if (hasError) {
      setError('Certaines variables n\'ont pas pu etre importees');
    } else {
      setBulkText('');
      setBulkMode(false);
    }
    await loadEnvVars();
    setSaving(false);
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
              {editingUuid === env.uuid ? (
                <>
                  <input
                    type="text"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="input-field flex-1 text-2xs font-mono"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEdit(env.uuid);
                      if (e.key === 'Escape') cancelEditing();
                    }}
                  />
                  <button onClick={() => saveEdit(env.uuid)} className="btn-primary" title="Sauvegarder">
                    &#10003;
                  </button>
                  <button onClick={cancelEditing} className="btn-secondary" title="Annuler">
                    &#10005;
                  </button>
                </>
              ) : (
                <>
                  <span className="text-txt-secondary truncate max-w-[180px]">
                    {visibleValues.has(env.uuid) ? env.value : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                  </span>
                  <button
                    onClick={() => toggleVisibility(env.uuid)}
                    className="text-txt-muted hover:text-txt-primary transition-colors"
                    title={visibleValues.has(env.uuid) ? 'Masquer' : 'Afficher'}
                  >
                    {visibleValues.has(env.uuid) ? (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878l4.242 4.242M15.12 15.12L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => startEditing(env)}
                    className="text-txt-muted hover:text-txt-primary transition-colors"
                    title="Modifier"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </>
              )}
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

      {bulkMode ? (
        <div className="space-y-1.5">
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            placeholder={'KEY=value\nKEY2=value2\nKEY3=value3'}
            className="input-field w-full font-mono text-2xs h-24 resize-y"
          />
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleBulkImport}
              disabled={saving || !bulkText.trim()}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? '...' : 'Importer'}
            </button>
            <button onClick={() => { setBulkMode(false); setBulkText(''); }} className="btn-secondary">
              Annuler
            </button>
          </div>
        </div>
      ) : (
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
          <button onClick={() => setBulkMode(true)} className="btn-secondary" title="Import en masse">
            Bulk
          </button>
        </div>
      )}

      {error && <p className="text-2xs text-status-error">{error}</p>}
    </div>
  );
}
