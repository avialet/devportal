import { queryOne } from '../db/database.js';

interface ConfigRow { value: string }

function getCfg(key: string): string | null {
  return queryOne<ConfigRow>('SELECT value FROM config WHERE key = ?', [key])?.value ?? null;
}

export async function sendMonitorAlert(
  monitorName: string,
  monitorUrl: string,
  oldStatus: 'up' | 'down' | 'pending',
  newStatus: 'up' | 'down' | 'pending',
  ping: number | null
): Promise<void> {
  const webhookUrl = getCfg('alert_webhook_url');
  if (!webhookUrl || !webhookUrl.trim()) return;

  const type = getCfg('alert_webhook_type') ?? 'discord';
  const isDown = newStatus === 'down';

  let body: string;

  if (type === 'discord') {
    body = JSON.stringify({
      username: 'DevPortal Monitor',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/1374/1374894.png',
      embeds: [{
        title: isDown ? `🔴 Service DOWN — ${monitorName}` : `🟢 Service UP — ${monitorName}`,
        description: monitorUrl,
        color: isDown ? 0xed4245 : 0x57f287,
        fields: [
          { name: 'Status', value: `${oldStatus} → **${newStatus}**`, inline: true },
          { name: 'Ping', value: ping != null ? `${ping}ms` : '—', inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'DevPortal' },
      }],
    });
  } else if (type === 'slack') {
    body = JSON.stringify({
      text: isDown
        ? `🔴 *${monitorName}* est DOWN\n${monitorUrl}`
        : `🟢 *${monitorName}* est de nouveau UP\n${monitorUrl}`,
    });
  } else {
    // Generic JSON
    body = JSON.stringify({
      event: isDown ? 'monitor_down' : 'monitor_up',
      monitor: { name: monitorName, url: monitorUrl },
      status: { from: oldStatus, to: newStatus },
      ping,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: any) {
    console.error('[Alert] Webhook error:', err.message);
  }
}

export async function testWebhook(webhookUrl: string, type: string): Promise<void> {
  let body: string;
  if (type === 'discord') {
    body = JSON.stringify({
      username: 'DevPortal Monitor',
      embeds: [{
        title: '✅ Test — DevPortal Alertes',
        description: 'Configuration webhook valide !',
        color: 0x57f287,
        timestamp: new Date().toISOString(),
        footer: { text: 'DevPortal' },
      }],
    });
  } else if (type === 'slack') {
    body = JSON.stringify({ text: '✅ *Test DevPortal* — Configuration webhook valide !' });
  } else {
    body = JSON.stringify({ event: 'test', message: 'DevPortal webhook test OK', timestamp: new Date().toISOString() });
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
}
