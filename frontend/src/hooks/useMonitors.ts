import { useState, useEffect } from 'react';
import { api, type MonitorInfo } from '../api/client';

export function useMonitors(pollInterval = 30000) {
  const [monitors, setMonitors] = useState<Map<number, MonitorInfo>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const data = await api.getMonitors();
        if (!active) return;
        setConnected(data.connected);
        const map = new Map<number, MonitorInfo>();
        for (const m of data.monitors) {
          map.set(m.id, m);
        }
        setMonitors(map);
      } catch {
        // ignore
      }
    }

    poll();
    const interval = setInterval(poll, pollInterval);
    return () => { active = false; clearInterval(interval); };
  }, [pollInterval]);

  function getStatus(monitorId: number | null | undefined): 'up' | 'down' | 'pending' | 'unknown' {
    if (!monitorId) return 'unknown';
    return monitors.get(monitorId)?.status ?? 'unknown';
  }

  function getPing(monitorId: number | null | undefined): number | null {
    if (!monitorId) return null;
    return monitors.get(monitorId)?.ping ?? null;
  }

  return { monitors, connected, getStatus, getPing };
}
