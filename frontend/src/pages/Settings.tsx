import { useState, useEffect } from 'react';
import { api, type HealthResponse, type BackupInfo, type GitHubStatus } from '../api/client';
import type { User } from '@devportal/shared';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Settings({ user }: { user?: User }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // GitHub token state
  const [ghStatus, setGhStatus] = useState<GitHubStatus | null>(null);
  const [ghToken, setGhToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [tokenError, setTokenError] = useState('');

  // Alert webhook state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookType, setWebhookType] = useState('discord');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState('');

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  useEffect(() => {
    Promise.all([
      api.getHealth().catch(() => null),
      api.getBackups().then(r => r.backups).catch(() => []),
      api.getGitHubStatus().catch(() => ({ configured: false } as GitHubStatus)),
      api.getConfig().catch(() => ({})),
    ]).then(([h, b, gh, cfg]) => {
      setHealth(h);
      setBackups(b);
      setGhStatus(gh);
      if (cfg['alert_webhook_url']) setWebhookUrl(cfg['alert_webhook_url']);
      if (cfg['alert_webhook_type']) setWebhookType(cfg['alert_webhook_type']);
    }).finally(() => setLoading(false));
  }, []);

  async function handleSaveToken() {
    if (!ghToken.trim()) return;
    setSavingToken(true);
    setTokenError('');
    try {
      const result = await api.saveGitHubToken(ghToken.trim());
      setGhStatus({ configured: true, login: result.login });
      setGhToken('');
    } catch (err: any) {
      setTokenError(err?.message || 'Token invalide');
    } finally {
      setSavingToken(false);
    }
  }

  async function handleRemoveToken() {
    await api.removeGitHubToken();
    setGhStatus({ configured: false });
  }

  async function handleSaveWebhook() {
    setSavingWebhook(true);
    setWebhookMsg('');
    try {
      await api.updateConfig({ alert_webhook_url: webhookUrl, alert_webhook_type: webhookType });
      setWebhookMsg('✓ Sauvegarde');
    } catch { setWebhookMsg('Erreur lors de la sauvegarde'); }
    finally { setSavingWebhook(false); }
  }

  async function handleTestWebhook() {
    setTestingWebhook(true);
    setWebhookMsg('');
    try {
      await api.testWebhook(webhookUrl, webhookType);
      setWebhookMsg('✓ Notification test envoyee !');
    } catch (err: any) {
      setWebhookMsg(`Erreur: ${err?.message ?? 'echec'}`);
    } finally { setTestingWebhook(false); }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileMsg('');
    try {
      await api.updateProfile({
        displayName: displayName || undefined,
        currentPassword: currentPwd || undefined,
        newPassword: newPwd || undefined,
      });
      setProfileMsg('✓ Profil mis a jour');
      setCurrentPwd('');
      setNewPwd('');
    } catch (err: any) {
      setProfileMsg(err?.message ?? 'Erreur');
    } finally { setSavingProfile(false); }
  }

  async function handleCreateBackup() {
    setCreating(true);
    try {
      await api.createBackup();
      const r = await api.getBackups();
      setBackups(r.backups);
    } catch { /* ignore */ }
    finally { setCreating(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-sm font-semibold text-txt-primary">Parametres</h1>

      {/* Profile */}
      <div className="panel">
        <div className="px-3 py-2 border-b border-border">
          <h2 className="text-xs font-semibold text-txt-primary">Profil</h2>
        </div>
        <div className="px-3 py-3 space-y-3">
          <div>
            <label className="block text-2xs text-txt-muted mb-1">Nom d'affichage</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder={user?.displayName} className="input-field w-full" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-2xs text-txt-muted mb-1">Mot de passe actuel</label>
              <input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)}
                placeholder="••••••" className="input-field w-full" />
            </div>
            <div>
              <label className="block text-2xs text-txt-muted mb-1">Nouveau mot de passe</label>
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                placeholder="••••••" className="input-field w-full" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveProfile} disabled={savingProfile}
              className="btn-primary disabled:opacity-50">
              {savingProfile ? '...' : 'Enregistrer'}
            </button>
            {profileMsg && <span className={`text-2xs ${profileMsg.startsWith('✓') ? 'text-status-ok' : 'text-status-error'}`}>{profileMsg}</span>}
          </div>
        </div>
      </div>

      {/* Alert webhooks */}
      <div className="panel">
        <div className="px-3 py-2 border-b border-border">
          <h2 className="text-xs font-semibold text-txt-primary">Alertes monitoring</h2>
        </div>
        <div className="px-3 py-3 space-y-3">
          <p className="text-2xs text-txt-muted">
            Notification Discord/Slack quand un monitor change d'etat (UP ↔ DOWN).
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-2xs text-txt-muted mb-1">URL webhook</label>
              <input type="text" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..." className="input-field w-full" />
            </div>
            <div className="w-28">
              <label className="block text-2xs text-txt-muted mb-1">Type</label>
              <select value={webhookType} onChange={e => setWebhookType(e.target.value)} className="input-field w-full">
                <option value="discord">Discord</option>
                <option value="slack">Slack</option>
                <option value="webhook">JSON</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSaveWebhook} disabled={savingWebhook || !webhookUrl}
              className="btn-primary disabled:opacity-50">
              {savingWebhook ? '...' : 'Sauvegarder'}
            </button>
            <button onClick={handleTestWebhook} disabled={testingWebhook || !webhookUrl}
              className="btn-secondary disabled:opacity-50">
              {testingWebhook ? '...' : 'Tester'}
            </button>
            {webhookMsg && <span className={`text-2xs ${webhookMsg.startsWith('✓') ? 'text-status-ok' : 'text-status-error'}`}>{webhookMsg}</span>}
          </div>
        </div>
      </div>

      {/* GitHub token */}
      <div className="panel">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <h2 className="text-xs font-semibold text-txt-primary">Compte GitHub</h2>
          {ghStatus?.configured && ghStatus.login && (
            <span className="text-2xs text-status-ok">@{ghStatus.login}</span>
          )}
        </div>
        <div className="px-3 py-3">
          {ghStatus?.configured ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-status-ok" />
                <span className="text-2xs text-txt-primary">Token configure pour <span className="font-medium">@{ghStatus.login}</span></span>
              </div>
              <button onClick={handleRemoveToken} className="text-2xs text-status-error hover:text-red-300">
                Deconnecter
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-2xs text-txt-muted">
                Token GitHub (Personal Access Token) avec les droits <code className="bg-surface-2 px-1">repo</code> et <code className="bg-surface-2 px-1">read:org</code>.{' '}
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,read:org&description=DevPortal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-hover underline"
                >
                  Creer un token
                </a>
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={ghToken}
                  onChange={e => setGhToken(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveToken()}
                  placeholder="ghp_..."
                  className="input-field flex-1"
                />
                <button
                  onClick={handleSaveToken}
                  disabled={savingToken || !ghToken.trim()}
                  className="btn-primary disabled:opacity-50"
                >
                  {savingToken ? '...' : 'Enregistrer'}
                </button>
              </div>
              {tokenError && <p className="text-2xs text-status-error">{tokenError}</p>}
            </div>
          )}
        </div>
      </div>

      <h2 className="text-xs font-semibold text-txt-muted uppercase tracking-wider">Systeme</h2>

      {/* Health checks */}
      {health && (
        <div className="panel">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <h2 className="text-xs font-semibold text-txt-primary">Health Check</h2>
            <div className="flex items-center gap-2 text-2xs">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 font-medium ${
                health.status === 'healthy' ? 'bg-green-900/30 text-status-ok' : 'bg-yellow-900/30 text-status-warn'
              }`}>
                {health.status}
              </span>
              <span className="text-txt-muted">uptime: {formatUptime(health.uptime)}</span>
              <span className="text-txt-muted">v{health.version}</span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {Object.entries(health.checks).map(([name, check]) => (
              <div key={name} className="px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 ${
                    check.status === 'ok' ? 'bg-status-ok' :
                    check.status === 'degraded' ? 'bg-status-warn' :
                    check.status === 'not_configured' ? 'bg-txt-muted' :
                    'bg-status-error'
                  }`} />
                  <span className="text-xs text-txt-primary capitalize">{name.replace(/([A-Z])/g, ' $1')}</span>
                </div>
                <div className="flex items-center gap-2 text-2xs text-txt-muted">
                  <span className={
                    check.status === 'ok' ? 'text-status-ok' :
                    check.status === 'degraded' ? 'text-status-warn' :
                    check.status === 'error' ? 'text-status-error' :
                    'text-txt-muted'
                  }>
                    {check.status}
                  </span>
                  {check.latency != null && <span>{check.latency}ms</span>}
                  {check.error && <span className="text-status-error truncate max-w-[200px]">{check.error}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backups */}
      <div className="panel">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <h2 className="text-xs font-semibold text-txt-primary">Backups DB</h2>
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="btn-primary disabled:opacity-50"
          >
            {creating ? 'Creation...' : 'Creer un backup'}
          </button>
        </div>
        {backups.length === 0 ? (
          <div className="px-3 py-6 text-center text-2xs text-txt-muted">Aucun backup</div>
        ) : (
          <div className="divide-y divide-border">
            {backups.map(b => (
              <div key={b.name} className="px-3 py-1.5 flex items-center justify-between">
                <span className="text-2xs text-txt-primary font-mono">{b.name}</span>
                <div className="flex items-center gap-3 text-2xs text-txt-muted">
                  <span>{formatBytes(b.size)}</span>
                  <span>{new Date(b.createdAt).toLocaleString('fr-FR')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="px-3 py-1.5 text-2xs text-txt-muted border-t border-border">
          Backup automatique toutes les 6h. 10 backups max conserves.
        </div>
      </div>
    </div>
  );
}
