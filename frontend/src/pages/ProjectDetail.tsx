import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, type ProjectDetailResponse, type Deployment } from '../api/client';
import MonitorBadge from '../components/MonitorBadge';
import EnvVarEditor from '../components/EnvVarEditor';
import LogViewer from '../components/LogViewer';
import PipelineView from '../components/PipelineView';
import AutoScanConfig from '../components/AutoScanConfig';
import ProjectMembers from '../components/ProjectMembers';
import EnvCompare from '../components/EnvCompare';

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

type EnvName = 'production' | 'staging' | 'development';

const ENV_CONFIG: Record<EnvName, { label: string; borderColor: string; headerBg: string; badgeCls: string; textCls: string; emptyBorder: string }> = {
  production: {
    label: 'PROD',
    borderColor: 'border-status-error',
    headerBg: 'bg-red-900/10',
    badgeCls: 'bg-red-900/25 text-status-error',
    textCls: 'text-status-error',
    emptyBorder: 'border-status-error',
  },
  staging: {
    label: 'STAGING',
    borderColor: 'border-status-warn',
    headerBg: 'bg-yellow-900/10',
    badgeCls: 'bg-yellow-900/25 text-status-warn',
    textCls: 'text-status-warn',
    emptyBorder: 'border-status-warn',
  },
  development: {
    label: 'DEV',
    borderColor: 'border-accent',
    headerBg: 'bg-accent/5',
    badgeCls: 'bg-accent/15 text-accent',
    textCls: 'text-accent',
    emptyBorder: 'border-accent',
  },
};

const FALLBACK_ENV = {
  label: 'ENV',
  borderColor: 'border-border',
  headerBg: '',
  badgeCls: 'bg-surface-3 text-txt-muted',
  textCls: 'text-txt-muted',
  emptyBorder: 'border-border',
};

export default function ProjectDetail() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<Record<string, Deployment[]>>({});
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [showEnvs, setShowEnvs] = useState<string | null>(null);
  const [showRuntimeLogs, setShowRuntimeLogs] = useState<string | null>(null);
  const [showEnvCompare, setShowEnvCompare] = useState(false);

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

  async function handleDeleteProject() {
    if (!uuid || !window.confirm('Supprimer ce projet du portal ? (Le projet Coolify ne sera pas supprime)')) return;
    try {
      await api.deleteProject(uuid);
      navigate('/');
    } catch { /* ignore */ }
  }

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

  const totalApps = sortedEnvs.reduce((acc, env) => acc + env.apps.length, 0);
  const runningApps = sortedEnvs.reduce((acc, env) => acc + env.apps.filter(a => a.status === 'running').length, 0);

  return (
    <div className="space-y-3">
      <Link to="/" className="text-accent hover:text-accent-hover text-xs inline-flex items-center gap-1">
        &larr; Projets
      </Link>

      {/* Project header card */}
      <div className="panel overflow-hidden">
        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-bold text-txt-primary">{project.name}</h1>
              {project.portalManaged && (
                <span className="px-1.5 py-0.5 text-2xs bg-accent/15 text-accent font-medium tracking-wide">portal</span>
              )}
            </div>
            {project.githubUrl && (
              <a
                href={project.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-2xs text-txt-muted hover:text-accent font-mono transition-colors"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                </svg>
                {project.githubUrl.replace('https://github.com/', '')}
              </a>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {project.portalManaged && (!project.monitors || project.monitors.length === 0) && (
              <button
                onClick={async () => {
                  if (!uuid) return;
                  try { await api.createProjectMonitors(uuid); loadProject(); } catch { /* ignore */ }
                }}
                className="btn-secondary"
              >
                + Monitors
              </button>
            )}
            <button onClick={() => setShowEnvCompare(!showEnvCompare)} className="btn-secondary">
              {showEnvCompare ? 'Fermer' : 'Comparer'}
            </button>
            <button onClick={handleDeleteProject} className="btn-danger">Supprimer</button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="border-t border-border px-4 py-2 bg-surface-0/60 flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 ${runningApps > 0 ? 'bg-status-ok' : 'bg-txt-muted'}`} />
            <span className="text-2xs text-txt-muted">
              <span className="text-txt-primary font-medium">{runningApps}</span>/{totalApps} apps running
            </span>
          </div>
          <div className="flex items-center gap-3">
            {sortedEnvs.map(env => {
              const cfg = ENV_CONFIG[env.name as EnvName] ?? FALLBACK_ENV;
              const monitor = project.monitors?.find(m => m.environment === env.name);
              const running = env.apps.filter(a => a.status === 'running').length;
              return (
                <div key={env.name} className="flex items-center gap-1.5">
                  <span className={`text-2xs font-mono font-semibold ${cfg.textCls}`}>{cfg.label}</span>
                  <span className="text-2xs text-txt-muted">{running}/{env.apps.length}</span>
                  {monitor && <MonitorBadge status={monitor.status} ping={monitor.ping} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Environments */}
      <div className="space-y-2">
        {sortedEnvs.map(env => {
          const cfg = ENV_CONFIG[env.name as EnvName] ?? FALLBACK_ENV;
          const envMonitor = project.monitors?.find(m => m.environment === env.name);

          return (
            <div key={env.name} className={`panel border-l-2 ${cfg.borderColor} overflow-hidden`}>
              {/* Env header */}
              <div className={`px-3 py-2 border-b border-border flex items-center justify-between ${cfg.headerBg}`}>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-2xs font-bold tracking-widest font-mono ${cfg.badgeCls}`}>
                    {cfg.label}
                  </span>
                  {envMonitor && <MonitorBadge status={envMonitor.status} ping={envMonitor.ping} />}
                </div>
                <span className="text-2xs text-txt-muted">
                  {env.apps.length} app{env.apps.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Empty state */}
              {env.apps.length === 0 ? (
                <div className="px-4 py-8 flex flex-col items-center justify-center gap-2 text-center">
                  <div className={`w-8 h-8 border-2 ${cfg.emptyBorder} opacity-15`} />
                  <div>
                    <p className="text-xs text-txt-muted">Aucune application</p>
                    <p className="text-2xs text-txt-muted/50 mt-0.5">Creez ce projet via le wizard pour deployer automatiquement</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {env.apps.map(app => {
                    const isLoading = actionLoading === app.uuid;
                    const appDeployments = deployments[app.uuid] ?? [];
                    const isShowingLogs = showLogs === app.uuid;

                    return (
                      <div key={app.uuid} className="px-3 py-2.5">
                        {/* App row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          {/* App identity */}
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 flex-shrink-0 ${statusDot(app.status)}`} />
                              <span className="text-xs font-semibold text-txt-primary truncate">{app.name}</span>
                              <span className={`text-2xs font-mono px-1 py-0.5 ${
                                app.status === 'running' ? 'bg-green-900/20 text-status-ok' :
                                app.status === 'stopped' || app.status === 'exited' ? 'bg-red-900/20 text-status-error' :
                                'bg-yellow-900/20 text-status-warn'
                              }`}>
                                {statusLabel(app.status)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 pl-4">
                              {app.fqdn && (
                                <a
                                  href={app.fqdn}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-2xs text-accent hover:text-accent-hover font-mono truncate max-w-xs"
                                >
                                  {app.fqdn.replace('https://', '')}
                                </a>
                              )}
                              {app.gitBranch && (
                                <span className="text-2xs text-txt-muted font-mono flex items-center gap-1">
                                  <span className="opacity-50">&#8943;</span> {app.gitBranch}
                                </span>
                              )}
                              {app.buildPack && (
                                <span className="text-2xs text-txt-muted/60">{app.buildPack}</span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-wrap pl-4 sm:pl-0">
                            <button onClick={() => handleDeploy(app.uuid)} disabled={isLoading} className="btn-primary disabled:opacity-50">
                              {isLoading ? '...' : 'Deploy'}
                            </button>
                            <button onClick={() => handleRestart(app.uuid)} disabled={isLoading} className="btn-secondary disabled:opacity-50">
                              Restart
                            </button>
                            <button onClick={() => handleStop(app.uuid)} disabled={isLoading} className="btn-danger disabled:opacity-50">
                              Stop
                            </button>
                            <div className="w-px h-4 bg-border mx-0.5" />
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

                        {/* Deployments log */}
                        {isShowingLogs && appDeployments.length > 0 && (
                          <div className="mt-2 bg-surface-0 border border-border p-2 max-h-40 overflow-auto font-mono text-2xs">
                            {appDeployments.slice(0, 5).map((dep, idx) => (
                              <div key={dep.uuid} className="flex items-center gap-2 py-0.5">
                                <span className={`w-1.5 h-1.5 flex-shrink-0 ${
                                  dep.status === 'finished' ? 'bg-status-ok' :
                                  dep.status === 'failed' ? 'bg-status-error' : 'bg-status-warn'
                                }`} />
                                <span className="text-txt-muted">{dep.status}</span>
                                <span className="text-txt-muted">{new Date(dep.created_at).toLocaleString('fr-FR')}</span>
                                {dep.commit && <span className="text-txt-muted">{dep.commit.slice(0, 7)}</span>}
                                {dep.status === 'finished' && dep.commit && idx > 0 && (
                                  <button
                                    onClick={async () => {
                                      if (!window.confirm(`Rollback vers le commit ${dep.commit?.slice(0, 7)} ?`)) return;
                                      try {
                                        await api.rollbackApp(app.uuid, dep.uuid);
                                        setTimeout(loadProject, 2000);
                                      } catch { /* ignore */ }
                                    }}
                                    className="ml-auto text-2xs text-accent hover:text-accent-hover"
                                  >
                                    Rollback
                                  </button>
                                )}
                              </div>
                            ))}
                            {appDeployments.length > 0 && (
                              <PipelineView deploymentUuid={appDeployments[0].uuid} />
                            )}
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

      {showEnvCompare && uuid && (
        <EnvCompare projectUuid={uuid} />
      )}

      {project.portalManaged && uuid && (
        <div className="mt-2">
          <AutoScanConfig projectUuid={uuid} />
        </div>
      )}

      {project.portalManaged && uuid && (
        <div className="mt-2">
          <ProjectMembers projectUuid={uuid} />
        </div>
      )}
    </div>
  );
}
