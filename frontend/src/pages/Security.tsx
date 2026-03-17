import { useState, useEffect, useCallback } from 'react';
import { api, type ProjectSummary } from '../api/client';
import type { SecurityScan, ScanTool, FindingsSummary } from '@devportal/shared';
import ScanReportViewer from '../components/ScanReportViewer';

const TOOL_LABELS: Record<ScanTool, string> = {
  'nuclei': 'Nuclei (scan rapide)',
  'zap-baseline': 'ZAP Baseline (moyen)',
  'zap-full': 'ZAP Full (approfondi)',
};

export default function Security() {
  const [scans, setScans] = useState<SecurityScan[]>([]);
  const [running, setRunning] = useState(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
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
        setProgress(prev => [...prev, `ERREUR: ${data.message}`]);
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

  // Build quick URL list from project apps
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
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (selectedScan) {
    const scan = scans.find(s => s.id === selectedScan);
    return (
      <div>
        <button onClick={() => setSelectedScan(null)} className="text-blue-400 hover:text-blue-300 mb-4 flex items-center gap-1">
          <span>&larr;</span> Retour
        </button>
        {scan && <ScanReportViewer scan={scan} />}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Scans de securite</h1>
        <span className="text-sm text-gray-500">{running}/2 scans en cours</span>
      </div>

      {/* Launch form */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold text-lg">Lancer un scan</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL cible</label>
            <input
              type="url"
              value={targetUrl}
              onChange={e => setTargetUrl(e.target.value)}
              placeholder="https://mon-app.51.254.131.12.nip.io"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              list="app-urls"
            />
            {appUrls.length > 0 && (
              <datalist id="app-urls">
                {appUrls.map(u => <option key={u} value={u} />)}
              </datalist>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outil</label>
            <select
              value={tool}
              onChange={e => setTool(e.target.value as ScanTool)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
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
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scanning ? 'Scan en cours...' : 'Lancer le scan'}
            </button>
          </div>
        </div>

        {/* Progress console */}
        {progress.length > 0 && (
          <div className="bg-gray-900 rounded-lg p-4 max-h-48 overflow-y-auto font-mono text-xs text-green-400">
            {progress.map((line, i) => (
              <div key={i} className={line.startsWith('ERREUR') ? 'text-red-400' : ''}>{line}</div>
            ))}
          </div>
        )}
      </div>

      {/* Scan history */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-lg">Historique des scans</h2>
        </div>
        {scans.length === 0 ? (
          <div className="p-6 text-center text-gray-500">Aucun scan effectue</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Cible</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Outil</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Statut</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Resultats</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Date</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {scans.map(scan => (
                <tr key={scan.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-mono text-xs truncate max-w-[200px]">{scan.targetUrl}</td>
                  <td className="px-6 py-3">{scan.tool}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={scan.status} />
                  </td>
                  <td className="px-6 py-3">
                    {scan.findingsSummary && <FindingsBadges findings={scan.findingsSummary} />}
                    {scan.error && <span className="text-red-500 text-xs">{scan.error}</span>}
                  </td>
                  <td className="px-6 py-3 text-gray-500 text-xs">
                    {new Date(scan.createdAt).toLocaleString('fr-FR')}
                  </td>
                  <td className="px-6 py-3 text-right space-x-2">
                    {scan.status === 'completed' && (
                      <button onClick={() => setSelectedScan(scan.id)} className="text-blue-600 hover:underline text-xs">
                        Rapport
                      </button>
                    )}
                    <button onClick={() => handleDelete(scan.id)} className="text-red-600 hover:underline text-xs">
                      {scan.status === 'running' ? 'Annuler' : 'Supprimer'}
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
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600',
    running: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>
      {status}
    </span>
  );
}

function FindingsBadges({ findings }: { findings: FindingsSummary }) {
  const items: { label: string; count: number; color: string }[] = [
    { label: 'C', count: findings.critical, color: 'bg-purple-600' },
    { label: 'H', count: findings.high, color: 'bg-red-600' },
    { label: 'M', count: findings.medium, color: 'bg-orange-500' },
    { label: 'L', count: findings.low, color: 'bg-yellow-500' },
    { label: 'I', count: findings.info, color: 'bg-blue-500' },
  ];
  const total = findings.critical + findings.high + findings.medium + findings.low + findings.info;
  if (total === 0) return <span className="text-gray-400 text-xs">Aucun finding</span>;

  return (
    <div className="flex gap-1">
      {items.filter(i => i.count > 0).map(i => (
        <span key={i.label} className={`${i.color} text-white text-xs px-1.5 py-0.5 rounded font-mono`}>
          {i.label}:{i.count}
        </span>
      ))}
    </div>
  );
}
