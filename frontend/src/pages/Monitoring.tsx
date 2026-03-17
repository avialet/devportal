import { useMonitors } from '../hooks/useMonitors';
import MonitorBadge from '../components/MonitorBadge';

export default function Monitoring() {
  const { monitors, connected } = useMonitors(15000);
  const monitorList = Array.from(monitors.values());

  const upCount = monitorList.filter(m => m.status === 'up').length;
  const downCount = monitorList.filter(m => m.status === 'down').length;
  const pendingCount = monitorList.filter(m => m.status === 'pending').length;
  const total = monitorList.length;
  const upPct = total > 0 ? (upCount / total) * 100 : 0;
  const downPct = total > 0 ? (downCount / total) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-txt-primary">Monitoring</h1>
          <span className="inline-flex items-center gap-1.5 text-2xs">
            <span className={`w-1.5 h-1.5 ${connected ? 'bg-status-ok' : 'bg-status-error'}`} />
            <span className="text-txt-muted">{connected ? 'Uptime Kuma connecte' : 'Deconnecte'}</span>
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="panel px-3 py-2">
          <div className="text-2xs text-txt-muted uppercase tracking-wider">Total</div>
          <div className="text-lg font-semibold text-txt-primary mt-0.5">{total}</div>
        </div>
        <div className="panel px-3 py-2">
          <div className="text-2xs text-txt-muted uppercase tracking-wider">UP</div>
          <div className="text-lg font-semibold text-status-ok mt-0.5">{upCount}</div>
        </div>
        <div className="panel px-3 py-2">
          <div className="text-2xs text-txt-muted uppercase tracking-wider">DOWN</div>
          <div className="text-lg font-semibold text-status-error mt-0.5">{downCount}</div>
        </div>
      </div>

      {/* Status bar */}
      {total > 0 && (
        <div className="panel px-3 py-2">
          <div className="text-2xs text-txt-muted mb-1">Disponibilite</div>
          <div className="h-2 w-full bg-surface-3 flex overflow-hidden">
            {upPct > 0 && <div className="bg-status-ok h-full" style={{ width: `${upPct}%` }} />}
            {downPct > 0 && <div className="bg-status-error h-full" style={{ width: `${downPct}%` }} />}
          </div>
          <div className="flex items-center gap-4 mt-1 text-2xs text-txt-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-status-ok" /> {upCount} up ({Math.round(upPct)}%)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-status-error" /> {downCount} down</span>
            {pendingCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 bg-status-warn" /> {pendingCount} pending</span>}
          </div>
        </div>
      )}

      {/* Monitor table */}
      {monitorList.length === 0 ? (
        <div className="panel text-center py-12 text-txt-muted text-xs">Aucun monitor configure</div>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Monitor</th>
                <th className="table-header">Status</th>
                <th className="table-header">Ping</th>
              </tr>
            </thead>
            <tbody>
              {monitorList.map(m => (
                <tr key={m.id} className="hover:bg-surface-2/50 transition-colors">
                  <td className="table-cell font-medium text-txt-primary">{m.name}</td>
                  <td className="table-cell">
                    <MonitorBadge status={m.status} showPing={false} />
                  </td>
                  <td className="table-cell font-mono text-txt-secondary">
                    {m.ping != null ? `${m.ping}ms` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
