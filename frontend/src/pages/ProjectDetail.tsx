import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type ProjectDetailResponse, type Deployment } from '../api/client';
import { useMonitors } from '../hooks/useMonitors';
import MonitorBadge from '../components/MonitorBadge';
import EnvVarEditor from '../components/EnvVarEditor';
import LogViewer from '../components/LogViewer';

function statusDot(status: string): string {
  if (status === 'running') return 'bg-status-ok';
  if (status === 'stopped' || status === 'exited') return 'bg-status-error';
  if (status.includes('progress') || status.includes('building')) return 'bg-status-warn';
  return 'bg-txt-muted';
}

function statusLabel(status: string): string {
  if (status === 'running') return 'running';
  if (status === 'stopped' || status === 'exited') return 'stopped';
  if (status.includes('progress') || status.includes('building')) return 'deploying';
  return status || 'unknown';
}

function envTag(name: string): { color: string; label: string } {
  if (name === 'production') return { color: 'border-status-error', label: 'prod' };
  if (name === 'staging') return { color: 'border-status-warn', label: 'staging' };
  return { color: 'border-accent', label: name };
}

export default function ProjectDetail() {
  const { uuid } = useParams<{ uuid: string }>();
  const { getStatus, getPing } = useMonitors();
  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<Record<string, Deployment[]>>({});
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [showEnvs, setShowEnvs] = useState<string | null>(null);
  const [showRuntimeLogs, setShowRuntimeLogs] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    if (!uuid) return;
    try {
      const data = await api.getProject(uuid);
      setProject(data);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : 'Erreur';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [uuid]);

  useEffect(() => { loadProject(); }, [loadProject]);

  async function handleDeploy(appUuid: string) {
    setActionLoading(appUuid);
    try { await api.deployApp(appUuid); setTimeout(loadProject, 2000); }
    catch { /* ignore */ }
    finally { setActionLoading(null); }
  }

  async function handleStop(appUuid: string) {
    setActionLoading(appUuid);
    try { await api.stopApp(appUuid); setTimeout(loadProject, 2000); }
    catch { /* ignore */ }
    finally { setActionLoading(null); }
  }

  async function handleRestart(appUuid: string) {
    setActionLoading(appUuid);
    try { await api.restartApp(appUuid); setTimeout(loadProject, 2000); }
    catch { /* ignore */ }
    finally { setActionLoading(null); }
  }

  async function loadDeployments(appUuid: string) {
    if (showLogs === appUuid) { setShowLogs(null); return; }
    setShowLogs(appUuid);
    try {
      const deps = await api.getDeployments(appUuid);
      setDeployments(prev => ({ ...prev, [appUuid]: deps }));
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div>
        <Link to="/" className="text-accent hover:text-accent-hover text-xs mb-3 inline-block">&larr; Retour</Link>
        <div className="bg-red-900/20 border border-status-error/30 text-status-error px-3 py-2 text-xs">
          {error || 'Projet introuvable'}
        </div>
      </div>
    );
  }

  const envOrder = ['production', 'staging', 'development'];
  const sortedEnvs = [...project.environments].sort(
    (a, b) => envOrder.indexOf(a.name) - envOrder.indexOf(b.name)
  );

  return (
    <div>
      <Link to="/" className="text-accent hover:text-accent-hover text-xs mb-2 inline-block">&larr; Projets</Link>

      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-sm font-semibold text-txt-primary">{project.name}</h1>
        {project.githubUrl && (
          <span className="text-2xs text-txt-muted font-mono">{project.githubUrl.replace('https://github.com/', '')}</span>
        )}
      </div>

      <div className="space-y-2">
        {sortedEnvs.map(env => {
          const tag = envTag(env.name);
          return (
            <div key={env.name} className={`panel border-l-2 ${tag.color}`}>
              <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                <span className="text-xs font-semibold text-txt-primary uppercase">{tag.label}</span>
                {project.monitors && (
                  <MonitorBadge
                    status={getStatus(project.monitors[env.name as keyof typeof project.monitors])}
                    ping={getPing(project.monitors[env.name as keyof typeof project.monitors])}
                  />
                )}
              </div>

              {env.apps.length === 0 ? (
                <div className="px-3 py-2 text-txt-muted text-2xs">Aucune application</div>
              ) : (
                <div className="divide-y divide-border">
                  {env.apps.map(app => {
                    const isLoading = actionLoading === app.uuid;
                    const appDeployments = deployments[app.uuid] ?? [];
                    const isShowingLogs = showLogs === app.uuid;

                    return (
                      <div key={app.uuid} className="px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 ${statusDot(app.status)}`} />
                            <span className="text-xs font-medium text-txt-primary">{app.name}</span>
                            <span className="text-2xs text-txt-muted">{statusLabel(app.status)}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDeploy(app.uuid)} disabled={isLoading} className="btn-primary disabled:opacity-50">
                              {isLoading ? '...' : 'Deploy'}
                            </button>
                            <button onClick={() => handleRestart(app.uuid)} disabled={isLoading} className="btn-secondary disabled:opacity-50">
                              Restart
                            </button>
                            <button onClick={() => handleStop(app.uuid)} disabled={isLoading} className="btn-danger disabled:opacity-50">
                              Stop
                            </button>
                            <button onClick={() => loadDeployments(app.uuid)} className="btn-secondary">
                              {isShowingLogs ? 'Hide' : 'Deploys'}
                            </button>
                            <button onClick={() => setShowRuntimeLogs(showRuntimeLogs === app.uuid ? null : app.uuid)} className="btn-secondary">
                              {showRuntimeLogs === app.uuid ? 'Hide Logs' : 'Logs'}
                            </button>
                            <button onClick={() => setShowEnvs(showEnvs === app.uuid ? null : app.uuid)} className="btn-secondary">
                              {showEnvs === app.uuid ? 'Hide' : 'Env'}
                            </button>
                          </div>
                        </div>

                        <div className="mt-1 flex items-center gap-3 text-2xs text-txt-muted">
                          {app.fqdn && (
                            <a href={app.fqdn} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">
                              {app.fqdn.replace('https://', '')}
                            </a>
                          )}
                          {app.gitBranch && <span className="font-mono">{app.gitBranch}</span>}
                          {app.buildPack && <span>{app.buildPack}</span>}
                        </div>

                        {isShowingLogs && appDeployments.length > 0 && (
                          <div className="mt-2 bg-surface-0 border border-border p-2 max-h-40 overflow-auto font-mono text-2xs">
                            {appDeployments.slice(0, 5).map(dep => (
                              <div key={dep.uuid} className="flex items-center gap-2 py-0.5">
                                <span className={`w-1.5 h-1.5 ${
                                  dep.status === 'finished' ? 'bg-status-ok' :
                                  dep.status === 'failed' ? 'bg-status-error' : 'bg-status-warn'
                                }`} />
                                <span className="text-txt-muted">{dep.status}</span>
                                <span className="text-txt-muted">{new Date(dep.created_at).toLocaleString('fr-FR')}</span>
                                {dep.commit && <span className="text-txt-muted">{dep.commit.slice(0, 7)}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {showRuntimeLogs === app.uuid && <LogViewer appUuid={app.uuid} />}

                        {showEnvs === app.uuid && <EnvVarEditor appUuid={app.uuid} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
