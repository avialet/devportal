import { useState, useEffect, useRef } from 'react';

interface Props {
  appUuid: string;
}

export default function LogViewer({ appUuid }: Props) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const containerRef = useRef<HTMLPreElement>(null);

  async function fetchLogs() {
    try {
      const res = await fetch(`/api/apps/${appUuid}/logs`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || 'Aucun log disponible');
      }
    } catch { setLogs('Erreur de chargement des logs'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetchLogs();
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [appUuid, autoRefresh]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="mt-2 border border-border">
      <div className="flex items-center justify-between px-2 py-1 bg-surface-1 border-b border-border">
        <span className="text-2xs font-medium text-txt-primary">Runtime Logs</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-2xs text-txt-muted">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="accent-accent"
            />
            Auto-refresh
          </label>
          <button onClick={fetchLogs} className="btn-secondary">Refresh</button>
        </div>
      </div>
      {loading ? (
        <div className="p-2 text-2xs text-txt-muted">Chargement...</div>
      ) : (
        <pre
          ref={containerRef}
          className="p-2 bg-surface-0 text-2xs text-txt-secondary font-mono max-h-60 overflow-auto whitespace-pre-wrap break-all"
        >
          {logs}
        </pre>
      )}
    </div>
  );
}
