import { io, type Socket } from 'socket.io-client';
import { config } from '../config.js';

let socket: Socket | null = null;
let authenticated = false;
let connectPromise: Promise<void> | null = null;

// Cache of monitor statuses
const monitorStatuses = new Map<number, {
  status: number; // 0=down, 1=up, 2=pending
  ping: number | null;
  name: string;
}>();

function getSocket(): Socket {
  if (socket?.connected) return socket;

  if (connectPromise) return socket!;

  socket = io(config.uptimeKumaUrl, {
    reconnection: true,
    reconnectionDelay: 5000,
    transports: ['websocket'],
  });

  connectPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Uptime Kuma connection timeout'));
    }, 10000);

    socket!.on('connect', () => {
      console.log('Connected to Uptime Kuma');

      if (config.uptimeKumaUser && config.uptimeKumaPass) {
        socket!.emit('login', {
          username: config.uptimeKumaUser,
          password: config.uptimeKumaPass,
          token: '',
        }, (result: { ok: boolean; msg?: string }) => {
          clearTimeout(timeout);
          if (result.ok) {
            authenticated = true;
            console.log('Authenticated with Uptime Kuma');
            resolve();
          } else {
            reject(new Error(`Uptime Kuma auth failed: ${result.msg}`));
          }
        });
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });

    socket!.on('connect_error', (err) => {
      clearTimeout(timeout);
      console.error('Uptime Kuma connection error:', err.message);
      reject(err);
    });
  });

  // Listen to heartbeat events to maintain status cache
  socket.on('heartbeat', (data: { monitorID: number; status: number; ping: number }) => {
    const existing = monitorStatuses.get(data.monitorID);
    monitorStatuses.set(data.monitorID, {
      status: data.status,
      ping: data.ping,
      name: existing?.name ?? '',
    });
  });

  // Listen to monitor list updates
  socket.on('monitorList', (monitors: Record<string, { id: number; name: string; active: boolean }>) => {
    for (const m of Object.values(monitors)) {
      const existing = monitorStatuses.get(m.id);
      monitorStatuses.set(m.id, {
        status: existing?.status ?? 2,
        ping: existing?.ping ?? null,
        name: m.name,
      });
    }
  });

  return socket;
}

async function ensureConnected(): Promise<Socket> {
  const s = getSocket();
  if (connectPromise) await connectPromise;
  return s;
}

export async function addMonitor(name: string, url: string, interval = 60): Promise<number> {
  const s = await ensureConnected();

  return new Promise((resolve, reject) => {
    s.emit('add', {
      type: 'http',
      name,
      url,
      method: 'GET',
      interval,
      retryInterval: 60,
      maxretries: 3,
      accepted_statuscodes: ['200-299'],
      notificationIDList: {},
      ignoreTls: false,
      upsideDown: false,
      maxredirects: 10,
      expiryNotification: false,
    }, (result: { ok: boolean; msg?: string; monitorID?: number }) => {
      if (result.ok && result.monitorID) {
        monitorStatuses.set(result.monitorID, { status: 2, ping: null, name });
        resolve(result.monitorID);
      } else {
        reject(new Error(`Failed to add monitor: ${result.msg}`));
      }
    });
  });
}

export async function deleteMonitor(monitorId: number): Promise<void> {
  const s = await ensureConnected();

  return new Promise((resolve, reject) => {
    s.emit('deleteMonitor', monitorId, (result: { ok: boolean; msg?: string }) => {
      if (result.ok) {
        monitorStatuses.delete(monitorId);
        resolve();
      } else {
        reject(new Error(`Failed to delete monitor: ${result.msg}`));
      }
    });
  });
}

export function getMonitorStatus(monitorId: number): { status: 'up' | 'down' | 'pending'; ping: number | null; name: string } {
  const cached = monitorStatuses.get(monitorId);
  if (!cached) return { status: 'pending', ping: null, name: '' };

  return {
    status: cached.status === 1 ? 'up' : cached.status === 0 ? 'down' : 'pending',
    ping: cached.ping,
    name: cached.name,
  };
}

export function getAllMonitorStatuses(): { id: number; name: string; status: 'up' | 'down' | 'pending'; ping: number | null }[] {
  const result: { id: number; name: string; status: 'up' | 'down' | 'pending'; ping: number | null }[] = [];
  for (const [id, data] of monitorStatuses) {
    result.push({
      id,
      name: data.name,
      status: data.status === 1 ? 'up' : data.status === 0 ? 'down' : 'pending',
      ping: data.ping,
    });
  }
  return result;
}

export async function initUptimeKuma(): Promise<void> {
  if (!config.uptimeKumaUser || !config.uptimeKumaPass) {
    console.log('Uptime Kuma credentials not set, skipping connection');
    return;
  }
  try {
    await ensureConnected();
  } catch (err) {
    console.warn('Could not connect to Uptime Kuma:', (err as Error).message);
  }
}

export function isConnected(): boolean {
  return authenticated && !!socket?.connected;
}
