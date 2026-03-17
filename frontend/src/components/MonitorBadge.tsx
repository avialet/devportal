interface Props {
  status: 'up' | 'down' | 'pending' | 'unknown';
  ping?: number | null;
  showPing?: boolean;
}

export default function MonitorBadge({ status, ping, showPing = true }: Props) {
  const config = {
    up: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', label: 'UP' },
    down: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', label: 'DOWN' },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500', label: 'PENDING' },
    unknown: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400', label: '—' },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
      {showPing && ping != null && (
        <span className="text-gray-400 ml-0.5">{ping}ms</span>
      )}
    </span>
  );
}
