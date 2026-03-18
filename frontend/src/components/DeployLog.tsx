import { useState, useEffect, useRef } from 'react';
import { api, type Deployment } from '../api/client';

interface Props {
  appUuid: string;
  deploymentUuid: string;
  onClose: () => void;
  onFinished?: () => void;
}

function parseLogs(raw: string): string {
  if (!raw) return '';
  // Coolify returns logs as JSON array: [{ output, type, timestamp }]
  try {
    const entries = JSON.parse(raw);
    if (Array.isArray(entries)) {
      return entries
        .filter((e: any) => e.output && !e.hidden)
        .map((e: any) => e.output)
        .join('\n');
    }
  } catch { /* not JSON, treat as plain text */ }
  return raw;
}

export default function DeployLog({ appUuid, deploymentUuid, onClose, onFinished }: Props) {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTerminal = deployment?.status === 'finished' || deployment?.status === 'failed' || deployment?.status === 'cancelled';

  async function fetchDeployment() {
    try {
      const dep = await api.getDeployment(deploymentUuid);
      setDeployment(dep);
      if (dep.status === 'finished' || dep.status === 'failed' || dep.status === 'cancelled') {
        // Stop polling
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (dep.status === 'finished' && onFinished) onFinished();
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetchDeployment();
    pollRef.current = setInterval(fetchDeployment, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [deploymentUuid]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [deployment?.logs]);

  const statusColor = deployment?.status === 'finished'
    ? 'text-status-ok'
    : deployment?.status === 'failed'
    ? 'text-status-error'
    : 'text-status-warn';

  const statusIcon = deployment?.status === 'finished'
    ? '✓'
    : deployment?.status === 'failed'
    ? '✗'
    : '';

  return (
    <div className="mt-2 border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-surface-1 border-b border-border">
        <div className="flex items-center gap-2">
          {!isTerminal && (
            <div className="w-3 h-3 border border-accent border-t-transparent animate-spin" />
          )}
          {isTerminal && (
            <span className={`text-xs font-bold ${statusColor}`}>{statusIcon}</span>
          )}
          <span className="text-2xs font-medium text-txt-primary">
            Build {deployment?.status ?? 'loading...'}
          </span>
          {deployment?.commit && (
            <span className="text-2xs text-txt-muted font-mono">{deployment.commit.slice(0, 7)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {deployment?.created_at && (
            <span className="text-2xs text-txt-muted">
              {new Date(deployment.created_at).toLocaleTimeString('fr-FR')}
            </span>
          )}
          <button
            onClick={onClose}
            className="text-txt-muted hover:text-txt-primary transition-colors p-0.5"
            title="Fermer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Logs */}
      {loading ? (
        <div className="p-3 text-2xs text-txt-muted flex items-center gap-2">
          <div className="w-3 h-3 border border-accent border-t-transparent animate-spin" />
          Connexion aux logs de build...
        </div>
      ) : (
        <pre
          ref={containerRef}
          className="p-2 bg-[#0d1117] text-2xs text-[#c9d1d9] font-mono max-h-80 overflow-auto whitespace-pre-wrap break-all leading-relaxed"
        >
          {deployment?.logs
            ? parseLogs(deployment.logs)
            : 'En attente des logs...'}
        </pre>
      )}

      {/* Footer status */}
      {isTerminal && (
        <div className={`px-2 py-1.5 border-t border-border text-2xs flex items-center justify-between ${
          deployment?.status === 'finished' ? 'bg-green-900/10' : 'bg-red-900/10'
        }`}>
          <span className={statusColor}>
            {deployment?.status === 'finished' ? 'Deploiement termine avec succes' : `Deploiement echoue (${deployment?.status})`}
          </span>
          {deployment?.finished_at && deployment?.created_at && (
            <span className="text-txt-muted">
              Duree: {Math.round((new Date(deployment.finished_at).getTime() - new Date(deployment.created_at).getTime()) / 1000)}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}
