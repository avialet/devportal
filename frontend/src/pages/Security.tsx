import { useState, useEffect, useCallback } from 'react';
import { api, type ProjectSummary } from '../api/client';
import type { SecurityScan, ScanTool, FindingsSummary } from '@devportal/shared';
import ScanReportViewer from '../components/ScanReportViewer';

const TOOL_LABELS: Record<ScanTool, string> = {
  'nuclei': 'Nuclei (rapide)',
  'zap-baseline': 'ZAP Baseline',
  'zap-full': 'ZAP Full',
};

export default function Security() {
  const [scans, setScans] = useState<SecurityScan[]>([]);
  const [running, setRunning] = useState(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [targetUrl, setTargetUrl] = useState('');
  const [tool, setTool] = useState<ScanTool>('nuclei');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [selectedScan, setSelectedScan] = useState<string | null>(null);

  const loadScans = useCallback(async () => {
    try {
      const data = await api.listScans();
      setScans(data.scans);
      setRunning(data.running);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    Promise.all([
      loadScans(),
      api.listProjects().then(setProjects).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [loadScans]);

  function handleStartScan() {
    if (!targetUrl || scanning) return;
    setScanning(true);
    setProgress([]);

    const es = api.startScan(targetUrl, tool);

    es.addEventListener('message', ((e: CustomEvent) => {
      const data = e.detail;
      if (data.type === 'progress') {
        setProgress(prev => [...prev.slice(-50), data.message]);
      } else if (data.type === 'complete') {
        setScanning(false);
        loadScans();
      } else if (data.type === 'error') {
        setProgress(prev => [...prev, `ERR: ${data.message}`]);
        setScanning(false);
        loadScans();
      } else if (data.type === 'started') {
        setProgress(prev => [...prev, `Scan ${data.scanId} demarre`]);
      }
    }) as EventListener);

    es.addEventListener('done', () => {
      setScanning(false);
      loadScans();
    });
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteScan(id);
      loadScans();
    } catch { /* ignore */ }
  }

  const appUrls: string[] = [];
  for (const p of projects) {
    for (const app of p.apps) {
      if (app.fqdn) {
        const url = app.fqdn.startsWith('http') ? app.fqdn : `https://${app.fqdn}`;
        appUrls.push(url);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (selectedScan) {
    const scan = scans.find(s => s.id === selectedScan);
    return (
      <div>
        <button onClick={() => setSelectedScan(null)} className="text-accent hover:text-accent-hover mb-3 flex items-center gap-1 text-xs">
          <span>&larr;</span> Retour
        </button>
        {scan && <ScanReportViewer scan={scan} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-txt-primary">Securite</h1>
          <span className="text-2xs text-txt-muted">{running}/2 en cours</span>
        </div>
      </div>

      {/* Launch form */}
      <div className="panel p-3">
        <div className="panel-header -mx-3 -mt-3 mb-3">Lancer un scan</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="block text-2xs text-txt-muted mb-1">URL cible</label>
            <input
              type="url"
              value={targetUrl}
              onChange={e => setTargetUrl(e.target.value)}
              placeholder="https://app.51.254.131.12.nip.io"
              className="input-field w-full"
              list="app-urls"
            />
            {appUrls.length > 0 && (
              <datalist id="app-urls">
                {appUrls.map(u => <option key={u} value={u} />)}
              </datalist>
            )}
          </div>
          <div>
            <label className="block text-2xs text-txt-muted mb-1">Outil</label>
            <select
              value={tool}
              onChange={e => setTool(e.target.value as ScanTool)}
              className="input-field w-full"
            >
              {(Object.entries(TOOL_LABELS) as [ScanTool, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleStartScan}
              disabled={!targetUrl || scanning || running >= 2}
              className="w-full btn-primary py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scanning ? 'En cours...' : 'Lancer'}
            </button>
          </div>
        </div>

        {progress.length > 0 && (
          <div className="bg-surface-0 border border-border mt-3 p-2 max-h-36 overflow-y-auto font-mono text-2xs text-status-ok">
            {progress.map((line, i) => (
              <div key={i} className={line.startsWith('ERR') ? 'text-status-error' : ''}>{line}</div>
            ))}
          </div>
        )}
      </div>

      {/* Scan history */}
      <div className="panel overflow-hidden">
        <div className="panel-header">Historique</div>
        {scans.length === 0 ? (
          <div className="p-6 text-center text-txt-muted text-xs">Aucun scan</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Cible</th>
                <th className="table-header">Outil</th>
                <th className="table-header">Statut</th>
                <th className="table-header">Resultats</th>
                <th className="table-header">Date</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {scans.map(scan => (
                <tr key={scan.id} className="hover:bg-surface-2/50 transition-colors">
                  <td className="table-cell font-mono text-2xs text-txt-secondary truncate max-w-[180px]">{scan.targetUrl}</td>
                  <td className="table-cell text-txt-secondary">{scan.tool}</td>
                  <td className="table-cell">
                    <StatusBadge status={scan.status} />
                  </td>
                  <td className="table-cell">
                    {scan.findingsSummary && <FindingsBadges findings={scan.findingsSummary} />}
                    {scan.error && <span className="text-status-error text-2xs">{scan.error}</span>}
                  </td>
                  <td className="table-cell text-txt-muted text-2xs">
                    {new Date(scan.createdAt).toLocaleString('fr-FR')}
                  </td>
                  <td className="table-cell text-right space-x-2">
                    {scan.status === 'completed' && (
                      <button onClick={() => setSelectedScan(scan.id)} className="text-accent hover:text-accent-hover text-2xs">
                        Rapport
                      </button>
                    )}
                    <button onClick={() => handleDelete(scan.id)} className="text-status-error hover:text-red-300 text-2xs">
                      {scan.status === 'running' ? 'Stop' : 'Del'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-surface-3 text-txt-muted',
    running: 'bg-accent/15 text-accent',
    completed: 'bg-green-900/30 text-status-ok',
    failed: 'bg-red-900/30 text-status-error',
    cancelled: 'bg-yellow-900/30 text-status-warn',
  };
  return (
    <span className={`px-1.5 py-0.5 text-2xs font-medium ${styles[status] || 'bg-surface-3 text-txt-muted'}`}>
      {status}
    </span>
  );
}

function FindingsBadges({ findings }: { findings: FindingsSummary }) {
  const items: { label: string; count: number; color: string }[] = [
    { label: 'C', count: findings.critical, color: 'bg-status-critical' },
    { label: 'H', count: findings.high, color: 'bg-status-error' },
    { label: 'M', count: findings.medium, color: 'bg-orange-500' },
    { label: 'L', count: findings.low, color: 'bg-status-warn' },
    { label: 'I', count: findings.info, color: 'bg-status-info' },
  ];
  const total = findings.critical + findings.high + findings.medium + findings.low + findings.info;
  if (total === 0) return <span className="text-txt-muted text-2xs">0 findings</span>;

  return (
    <div className="flex gap-0.5">
      {items.filter(i => i.count > 0).map(i => (
        <span key={i.label} className={`${i.color} text-white text-2xs px-1 py-0.5 font-mono`}>
          {i.label}:{i.count}
        </span>
      ))}
    </div>
  );
}
