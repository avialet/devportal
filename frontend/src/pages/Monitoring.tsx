import { useMonitors } from '../hooks/useMonitors';
import MonitorBadge from '../components/MonitorBadge';

export default function Monitoring() {
  const { monitors, connected } = useMonitors(15000);
  const monitorList = Array.from(monitors.values());

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-txt-primary">Monitoring</h1>
          <span className="inline-flex items-center gap-1.5 text-2xs">
            <span className={`w-1.5 h-1.5 ${connected ? 'bg-status-ok' : 'bg-status-error'}`} />
            <span className="text-txt-muted">{connected ? 'Uptime Kuma connecte' : 'Deconnecte'}</span>
          </span>
        </div>
      </div>

      {monitorList.length === 0 ? (
        <div className="panel text-center py-12 text-txt-muted text-xs">
          Aucun monitor configure
        </div>
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
