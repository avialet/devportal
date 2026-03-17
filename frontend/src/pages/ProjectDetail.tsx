import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type ProjectDetailResponse, type Deployment } from '../api/client';
import { useMonitors } from '../hooks/useMonitors';
import MonitorBadge from '../components/MonitorBadge';
import EnvVarEditor from '../components/EnvVarEditor';

function statusColor(status: string): string {
  if (status === 'running') return 'bg-green-500';
  if (status === 'stopped' || status === 'exited') return 'bg-red-500';
  if (status.includes('progress') || status.includes('building')) return 'bg-yellow-500';
  return 'bg-gray-400';
}

function statusBadge(status: string): { bg: string; text: string; label: string } {
  if (status === 'running') return { bg: 'bg-green-100', text: 'text-green-700', label: 'En ligne' };
  if (status === 'stopped' || status === 'exited') return { bg: 'bg-red-100', text: 'text-red-700', label: 'Arrete' };
  if (status.includes('progress') || status.includes('building')) return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Deploiement...' };
  return { bg: 'bg-gray-100', text: 'text-gray-600', label: status || 'Inconnu' };
}

function envLabel(name: string): string {
  if (name === 'production') return 'Production';
  if (name === 'staging') return 'Staging';
  if (name === 'development') return 'Development';
  return name;
}

function envBorderColor(name: string): string {
  if (name === 'production') return 'border-l-red-500';
  if (name === 'staging') return 'border-l-yellow-500';
  return 'border-l-blue-500';
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
    try {
      await api.deployApp(appUuid);
      setTimeout(loadProject, 2000);
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  }

  async function handleStop(appUuid: string) {
    setActionLoading(appUuid);
    try {
      await api.stopApp(appUuid);
      setTimeout(loadProject, 2000);
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  }

  async function handleRestart(appUuid: string) {
    setActionLoading(appUuid);
    try {
      await api.restartApp(appUuid);
      setTimeout(loadProject, 2000);
    } catch { /* ignore */ }
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
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div>
        <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">&larr; Retour</Link>
        <div className="bg-red-50 text-red-700 px-6 py-4 rounded-xl">
          <p>{error || 'Projet introuvable'}</p>
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
      <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">&larr; Retour aux projets</Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
        {project.githubUrl && (
          <p className="text-gray-400 mt-1 text-sm">{project.githubUrl}</p>
        )}
      </div>

      <div className="space-y-6">
        {sortedEnvs.map(env => (
          <div key={env.name} className={`bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${envBorderColor(env.name)} overflow-hidden`}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{envLabel(env.name)}</h2>
                {project.monitors && (
                  <MonitorBadge
                    status={getStatus(project.monitors[env.name as keyof typeof project.monitors])}
                    ping={getPing(project.monitors[env.name as keyof typeof project.monitors])}
                  />
                )}
              </div>

              {env.apps.length === 0 ? (
                <p className="text-gray-400 text-sm">Aucune application</p>
              ) : (
                <div className="space-y-4">
                  {env.apps.map(app => {
                    const badge = statusBadge(app.status);
                    const isLoading = actionLoading === app.uuid;
                    const appDeployments = deployments[app.uuid] ?? [];
                    const isShowingLogs = showLogs === app.uuid;

                    return (
                      <div key={app.uuid}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`w-2.5 h-2.5 rounded-full ${statusColor(app.status)}`} />
                            <div>
                              <span className="font-medium text-gray-900">{app.name}</span>
                              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                                {badge.label}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDeploy(app.uuid)}
                              disabled={isLoading}
                              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                            >
                              {isLoading ? '...' : 'Deployer'}
                            </button>
                            <button
                              onClick={() => handleRestart(app.uuid)}
                              disabled={isLoading}
                              className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
                            >
                              Restart
                            </button>
                            <button
                              onClick={() => handleStop(app.uuid)}
                              disabled={isLoading}
                              className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                            >
                              Stop
                            </button>
                            <button
                              onClick={() => loadDeployments(app.uuid)}
                              className="text-xs bg-gray-50 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
                            >
                              {isShowingLogs ? 'Masquer' : 'Logs'}
                            </button>
                            <button
                              onClick={() => setShowEnvs(showEnvs === app.uuid ? null : app.uuid)}
                              className="text-xs bg-gray-50 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
                            >
                              {showEnvs === app.uuid ? 'Masquer' : 'Env vars'}
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                          {app.fqdn && (
                            <a
                              href={app.fqdn}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline"
                            >
                              {app.fqdn.replace('https://', '')}
                            </a>
                          )}
                          <span>{app.gitBranch}</span>
                          <span>{app.buildPack}</span>
                        </div>

                        {isShowingLogs && appDeployments.length > 0 && (
                          <div className="mt-3 bg-gray-900 rounded-lg p-4 max-h-60 overflow-auto">
                            {appDeployments.slice(0, 5).map(dep => (
                              <div key={dep.uuid} className="mb-3 last:mb-0">
                                <div className="flex items-center gap-2 text-xs mb-1">
                                  <span className={`w-2 h-2 rounded-full ${
                                    dep.status === 'finished' ? 'bg-green-500' :
                                    dep.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                                  }`} />
                                  <span className="text-gray-400">{dep.status}</span>
                                  <span className="text-gray-600">{new Date(dep.created_at).toLocaleString('fr-FR')}</span>
                                  {dep.commit && <span className="text-gray-600 font-mono">{dep.commit.slice(0, 7)}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {showEnvs === app.uuid && (
                          <EnvVarEditor appUuid={app.uuid} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
