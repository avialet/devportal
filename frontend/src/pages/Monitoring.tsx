import { useMonitors } from '../hooks/useMonitors';
import MonitorBadge from '../components/MonitorBadge';

export default function Monitoring() {
  const { monitors, connected } = useMonitors(15000);

  const monitorList = Array.from(monitors.values());

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Monitoring</h1>
        <p className="text-gray-500 mt-1">
          {connected ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Connecte a Uptime Kuma
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Uptime Kuma non connecte
            </span>
          )}
        </p>
      </div>

      {monitorList.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Aucun monitor configure</p>
          <p className="text-sm mt-2">Les monitors sont crees automatiquement lors de la creation d'un projet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Monitor</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Ping</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monitorList.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{m.name}</td>
                  <td className="px-6 py-4">
                    <MonitorBadge status={m.status} showPing={false} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
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
