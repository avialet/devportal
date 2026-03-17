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
          setHtmlUrl(api.getScanReportUrl(scan.id, 'html'));
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    loadReport();
  }, [scan.id, scan.tool]);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-txt-primary mb-2">Rapport — {scan.tool}</h2>
        <div className="text-2xs text-txt-secondary space-y-0.5 font-mono">
          <p>cible: {scan.targetUrl}</p>
          <p>date: {new Date(scan.createdAt).toLocaleString('fr-FR')}</p>
          {scan.startedAt && scan.finishedAt && (
            <p>duree: {formatDuration(scan.startedAt, scan.finishedAt)}</p>
          )}
        </div>
        {scan.findingsSummary && (
          <div className="mt-3 flex gap-2">
            <SeverityCard label="CRIT" count={scan.findingsSummary.critical} color="bg-status-critical" />
            <SeverityCard label="HIGH" count={scan.findingsSummary.high} color="bg-status-error" />
            <SeverityCard label="MED" count={scan.findingsSummary.medium} color="bg-orange-500" />
            <SeverityCard label="LOW" count={scan.findingsSummary.low} color="bg-status-warn" />
            <SeverityCard label="INFO" count={scan.findingsSummary.info} color="bg-status-info" />
          </div>
        )}
      </div>

      {/* Nuclei findings table */}
      {scan.tool === 'nuclei' && nucleiEntries.length > 0 && (
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Sev</th>
                <th className="table-header">Nom</th>
                <th className="table-header">URL</th>
                <th className="table-header">Tags</th>
              </tr>
            </thead>
            <tbody>
              {nucleiEntries.map((entry, i) => (
                <tr key={i} className="hover:bg-surface-2/50 transition-colors">
                  <td className="table-cell">
                    <SeverityLabel severity={entry.info?.severity || 'info'} />
                  </td>
                  <td className="table-cell font-medium text-txt-primary">{entry.info?.name || '-'}</td>
                  <td className="table-cell font-mono text-2xs text-txt-muted truncate max-w-[250px]">{entry['matched-at'] || entry.host || '-'}</td>
                  <td className="table-cell text-2xs text-txt-muted">{entry.info?.tags?.join(', ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scan.tool === 'nuclei' && nucleiEntries.length === 0 && (
        <div className="panel p-6 text-center text-txt-muted text-xs">Aucun finding</div>
      )}

      {/* ZAP HTML report */}
      {htmlUrl && (
        <div className="panel overflow-hidden">
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
    <div className={`${color} text-white px-3 py-1.5 text-center min-w-[60px]`}>
      <div className="text-lg font-bold font-mono">{count}</div>
      <div className="text-2xs opacity-80">{label}</div>
    </div>
  );
}

function SeverityLabel({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-purple-900/40 text-status-critical',
    high: 'bg-red-900/30 text-status-error',
    medium: 'bg-orange-900/30 text-orange-400',
    low: 'bg-yellow-900/30 text-status-warn',
    info: 'bg-blue-900/30 text-status-info',
  };
  return (
    <span className={`px-1.5 py-0.5 text-2xs font-medium font-mono ${styles[severity.toLowerCase()] || 'bg-surface-3 text-txt-muted'}`}>
      {severity.toUpperCase()}
    </span>
  );
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}
