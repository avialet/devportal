import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { SecurityScan } from '@devportal/shared';

interface Props {
  scan: SecurityScan;
}

interface NucleiEntry {
  info?: { name?: string; severity?: string; description?: string; tags?: string[] };
  'matched-at'?: string;
  'matcher-name'?: string;
  type?: string;
  host?: string;
}

export default function ScanReportViewer({ scan }: Props) {
  const [nucleiEntries, setNucleiEntries] = useState<NucleiEntry[]>([]);
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReport() {
      setLoading(true);
      try {
        if (scan.tool === 'nuclei') {
          const res = await fetch(api.getScanReportUrl(scan.id), { credentials: 'include' });
          const data = await res.json();
          setNucleiEntries(Array.isArray(data) ? data : []);
        } else {
          // ZAP — try HTML report
          setHtmlUrl(api.getScanReportUrl(scan.id, 'html'));
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    loadReport();
  }, [scan.id, scan.tool]);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-xl font-bold mb-2">Rapport — {scan.tool}</h2>
        <div className="text-sm text-gray-600 space-y-1">
          <p><span className="font-medium">Cible :</span> {scan.targetUrl}</p>
          <p><span className="font-medium">Date :</span> {new Date(scan.createdAt).toLocaleString('fr-FR')}</p>
          {scan.startedAt && scan.finishedAt && (
            <p><span className="font-medium">Duree :</span> {formatDuration(scan.startedAt, scan.finishedAt)}</p>
          )}
        </div>
        {scan.findingsSummary && (
          <div className="mt-4 flex gap-4">
            <SeverityCard label="Critical" count={scan.findingsSummary.critical} color="bg-purple-600" />
            <SeverityCard label="High" count={scan.findingsSummary.high} color="bg-red-600" />
            <SeverityCard label="Medium" count={scan.findingsSummary.medium} color="bg-orange-500" />
            <SeverityCard label="Low" count={scan.findingsSummary.low} color="bg-yellow-500" />
            <SeverityCard label="Info" count={scan.findingsSummary.info} color="bg-blue-500" />
          </div>
        )}
      </div>

      {/* Nuclei findings table */}
      {scan.tool === 'nuclei' && nucleiEntries.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Severite</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">URL</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {nucleiEntries.map((entry, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <SeverityLabel severity={entry.info?.severity || 'info'} />
                  </td>
                  <td className="px-4 py-3 font-medium">{entry.info?.name || '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs truncate max-w-[300px]">{entry['matched-at'] || entry.host || '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{entry.info?.tags?.join(', ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scan.tool === 'nuclei' && nucleiEntries.length === 0 && (
        <div className="bg-white rounded-xl border p-6 text-center text-gray-500">Aucun finding detecte</div>
      )}

      {/* ZAP HTML report */}
      {htmlUrl && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <iframe
            src={htmlUrl}
            title="Rapport ZAP"
            className="w-full border-0"
            style={{ height: '80vh' }}
            sandbox="allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}

function SeverityCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`${color} text-white rounded-lg px-4 py-2 text-center min-w-[80px]`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}

function SeverityLabel({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-purple-100 text-purple-800',
    high: 'bg-red-100 text-red-800',
    medium: 'bg-orange-100 text-orange-800',
    low: 'bg-yellow-100 text-yellow-800',
    info: 'bg-blue-100 text-blue-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[severity.toLowerCase()] || 'bg-gray-100'}`}>
      {severity}
    </span>
  );
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}min ${s % 60}s`;
}
