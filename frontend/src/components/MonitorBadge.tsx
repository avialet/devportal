interface Props {
  status: 'up' | 'down' | 'pending' | 'unknown';
  ping?: number | null;
  showPing?: boolean;
}

export default function MonitorBadge({ status, ping, showPing = true }: Props) {
  const config = {
    up: { dot: 'bg-status-ok', label: 'UP', style: 'text-status-ok' },
    down: { dot: 'bg-status-error', label: 'DOWN', style: 'text-status-error' },
    pending: { dot: 'bg-status-warn', label: 'WAIT', style: 'text-status-warn' },
    unknown: { dot: 'bg-txt-muted', label: '—', style: 'text-txt-muted' },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 text-2xs font-mono ${config.style}`}>
      <span className={`w-1.5 h-1.5 ${config.dot}`} />
      {config.label}
      {showPing && ping != null && (
        <span className="text-txt-muted">{ping}ms</span>
      )}
    </span>
  );
}
