import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type ProjectSummary, type DashboardStats, type ActivityItem } from '../api/client';

function statusDot(status: string): string {
  if (status === 'running') return 'bg-status-ok';
  if (status === 'stopped' || status === 'exited') return 'bg-status-error';
  if (status.includes('progress') || status.includes('building')) return 'bg-status-warn';
  return 'bg-txt-muted';
}

function monitorDot(status: 'up' | 'down' | 'pending'): string {
  if (status === 'up') return 'bg-status-ok';
  if (status === 'down') return 'bg-status-error';
  return 'bg-status-warn';
}

function actionLabel(action: string): { label: string; color: string } {
  switch (action) {
    case 'deploy': return { label: 'Deploiement', color: 'text-accent' };
    case 'restart': return { label: 'Redemarrage', color: 'text-status-warn' };
    case 'stop': return { label: 'Arret', color: 'text-status-error' };
    case 'login': return { label: 'Connexion', color: 'text-status-ok' };
    case 'delete_project': return { label: 'Suppression projet', color: 'text-status-error' };
    default: return { label: action, color: 'text-txt-secondary' };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'a l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return `il y a ${Math.floor(diff / 86400)}j`;
}

function uptimeColor(pct: number | null): string {
  if (pct === null) return 'text-txt-muted';
  if (pct >= 99) return 'text-status-ok';
  if (pct >= 90) return 'text-status-warn';
  return 'text-status-error';
}

// --- Screenshot with lazy load + skeleton ---
function ProjectScreenshot({ uuid, name }: { uuid: string; name: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');

  return (
    <div className="relative bg-surface-3 overflow-hidden" style={{ aspectRatio: '16/9' }}>
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-pulse w-full h-full bg-surface-3" />
          <div className="absolute inset-0 bg-gradient-to-br from-surface-2 to-surface-3" />
          <div className="absolute text-2xs text-txt-muted opacity-50">capture...</div>
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
          <div className="text-center">
            <div className="text-3xl opacity-20">🌐</div>
            <div className="text-2xs text-txt-muted mt-1">{name}</div>
          </div>
        </div>
      )}
      <img
        src={`/api/projects/${uuid}/screenshot`}
        alt={name}
        className={`w-full h-full object-cover object-top transition-opacity duration-300 ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
      />
    </div>
  );
}

// --- Per-env health indicator ---
function EnvHealth({ env, monitorData, appStatus }: {
  env: string;
  monitorData?: { status: 'up' | 'down' | 'pending'; uptime: number | null };
  appStatus?: string;
}) {
  const label = env === 'development' ? 'dev' : env === 'production' ? 'prod' : 'stg';
  const dot = monitorData
    ? monitorDot(monitorData.status)
    : appStatus ? statusDot(appStatus) : 'bg-txt-muted';

  return (
    <span className="inline-flex items-center gap-1" title={`${env}${monitorData?.uptime != null ? ` — uptime ${monitorData.uptime}%` : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="text-2xs text-txt-muted">{label}</span>
      {monitorData?.uptime != null && (
        <span className={`text-2xs font-mono ${uptimeColor(monitorData.uptime)}`}>{monitorData.uptime}%</span>
      )}
    </span>
  );
}

// --- Project Card ---
function ProjectCard({ project }: { project: ProjectSummary }) {
  const navigate = useNavigate();
  const envOrder = ['development', 'staging', 'production'];
  const sortedEnvs = [...project.environments].sort((a, b) => envOrder.indexOf(a) - envOrder.indexOf(b));

  const hasMonitors = Object.keys(project.monitorStatus ?? {}).length > 0;
  const allUp = hasMonitors && Object.values(project.monitorStatus).every(m => m.status === 'up');
  const anyDown = hasMonitors && Object.values(project.monitorStatus).some(m => m.status === 'down');

  return (
    <div
      className="panel overflow-hidden hover:border-accent/40 transition-all cursor-pointer group"
      onClick={() => navigate(`/projects/${project.uuid}`)}
    >
      {/* Screenshot */}
      <div className="relative">
        <ProjectScreenshot uuid={project.uuid} name={project.name} />
        {/* Status pill overlay */}
        <div className="absolute top-1.5 left-1.5">
          {project.portalManaged && (
            <span className="bg-accent/80 text-white text-2xs px-1.5 py-0.5 backdrop-blur-sm">portal</span>
          )}
        </div>
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          {hasMonitors && (
            <span className={`text-2xs px-1.5 py-0.5 backdrop-blur-sm ${allUp ? 'bg-status-ok/80 text-white' : anyDown ? 'bg-status-error/80 text-white' : 'bg-status-warn/80 text-white'}`}>
              {allUp ? '✓ UP' : anyDown ? '✗ DOWN' : '~ PEND'}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-2.5">
        {/* Name */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-txt-primary group-hover:text-accent transition-colors truncate">{project.name}</span>
          {project.githubUrl && (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-txt-muted hover:text-accent ml-2 shrink-0"
              title={project.githubUrl}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
          )}
        </div>

        {/* GitHub repo name */}
        {project.githubUrl && (
          <div className="text-2xs text-txt-muted font-mono mb-2 truncate opacity-70">
            {project.githubUrl.replace('https://github.com/', '')}
          </div>
        )}

        {/* Env health row */}
        {sortedEnvs.length > 0 && (
          <div className="flex items-center gap-3 mb-2">
            {sortedEnvs.map(env => {
              const monitorData = project.monitorStatus?.[env];
              const appStatus = project.apps.find(a => a.env === env)?.status;
              return (
                <EnvHealth
                  key={env}
                  env={env}
                  monitorData={monitorData}
                  appStatus={appStatus}
                />
              );
            })}
          </div>
        )}

        {/* Meta footer */}
        <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
          <div className="flex items-center gap-2 text-2xs text-txt-muted">
            <span>{project.environments.length} envs</span>
            <span>·</span>
            <span>{project.apps.length} services</span>
          </div>
          {project.createdAt && (
            <span className="text-2xs text-txt-muted">{timeAgo(project.createdAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main Dashboard ---
export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'cards' | 'table'>('cards');

  useEffect(() => {
    Promise.all([
      api.listProjects(),
      api.getStats().catch(() => null),
      api.getActivity().catch(() => []),
    ])
      .then(([projs, st, act]) => {
        setProjects(projs);
        setStats(st);
        setActivity(act);
      })
      .catch(err => setError(err.message ?? 'Erreur de chargement'))
      .finally(() => setLoading(false));
  }, []);

  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-status-error/30 text-status-error px-3 py-2 text-xs">
        <span className="font-medium">Erreur</span> — {error}
      </div>
    );
  }

  const globalUptime = stats && stats.monitors.total > 0
    ? Math.round((stats.monitors.up / stats.monitors.total) * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="panel px-3 py-2">
            <div className="text-2xs text-txt-muted uppercase tracking-wider">Projets</div>
            <div className="text-lg font-semibold text-txt-primary mt-0.5">{stats.projects}</div>
          </div>
          <div className="panel px-3 py-2">
            <div className="text-2xs text-txt-muted uppercase tracking-wider">Services</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-lg font-semibold text-status-ok">{stats.services.running}</span>
              <span className="text-2xs text-txt-muted">/ {stats.services.total}</span>
              {stats.services.stopped > 0 && (
                <span className="text-2xs text-status-error">{stats.services.stopped} down</span>
              )}
            </div>
          </div>
          <div className="panel px-3 py-2">
            <div className="text-2xs text-txt-muted uppercase tracking-wider">Uptime global</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              {globalUptime !== null ? (
                <>
                  <span className={`text-lg font-semibold ${uptimeColor(globalUptime)}`}>{globalUptime}%</span>
                  <span className="text-2xs text-txt-muted">{stats.monitors.up}/{stats.monitors.total} up</span>
                </>
              ) : (
                <span className="text-lg font-semibold text-txt-muted">—</span>
              )}
              {stats.monitors.down > 0 && (
                <span className="text-2xs text-status-error">{stats.monitors.down} down</span>
              )}
            </div>
          </div>
          <div className="panel px-3 py-2">
            <div className="text-2xs text-txt-muted uppercase tracking-wider">Scans recents</div>
            <div className="text-lg font-semibold text-txt-primary mt-0.5">{stats.recentScans.length}</div>
          </div>
        </div>
      )}

      {/* Projects header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-txt-primary">Projets</h1>
          <span className="text-2xs text-txt-muted">{projects.length} total</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex border border-border overflow-hidden">
            <button
              onClick={() => setView('cards')}
              className={`px-2 py-1 text-2xs transition-colors ${view === 'cards' ? 'bg-accent text-white' : 'text-txt-muted hover:text-txt-primary'}`}
              title="Vue cartes"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                <rect x="1" y="1" width="6" height="6" rx="0.5" /><rect x="9" y="1" width="6" height="6" rx="0.5" />
                <rect x="1" y="9" width="6" height="6" rx="0.5" /><rect x="9" y="9" width="6" height="6" rx="0.5" />
              </svg>
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-2 py-1 text-2xs transition-colors ${view === 'table' ? 'bg-accent text-white' : 'text-txt-muted hover:text-txt-primary'}`}
              title="Vue tableau"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 16 16">
                <line x1="1" y1="4" x2="15" y2="4" strokeWidth="1.5" />
                <line x1="1" y1="8" x2="15" y2="8" strokeWidth="1.5" />
                <line x1="1" y1="12" x2="15" y2="12" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
          <Link to="/new" className="btn-primary">+ Nouveau</Link>
        </div>
      </div>

      {/* Projects content */}
      {projects.length === 0 ? (
        <div className="panel text-center py-12 text-txt-muted text-xs">Aucun projet</div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {projects.map(project => (
            <ProjectCard key={project.uuid} project={project} />
          ))}
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Projet</th>
                <th className="table-header">Source</th>
                <th className="table-header">Sante</th>
                <th className="table-header">Services</th>
                <th className="table-header hidden lg:table-cell">Envs</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(project => {
                const envOrder = ['development', 'staging', 'production'];
                const sortedEnvs = [...project.environments].sort((a, b) => envOrder.indexOf(a) - envOrder.indexOf(b));
                return (
                  <tr key={project.uuid} className="hover:bg-surface-2/50 transition-colors cursor-pointer" onClick={() => navigate(`/projects/${project.uuid}`)}>
                    <td className="table-cell">
                      <span className="text-accent font-medium">{project.name}</span>
                      {project.portalManaged && <span className="ml-1.5 text-2xs bg-accent/10 text-accent px-1 py-0.5">portal</span>}
                    </td>
                    <td className="table-cell font-mono text-2xs text-txt-muted truncate max-w-[160px]">
                      {project.githubUrl ? project.githubUrl.replace('https://github.com/', '') : '—'}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        {sortedEnvs.map(env => {
                          const m = project.monitorStatus?.[env];
                          const appSt = project.apps.find(a => a.env === env)?.status;
                          return <EnvHealth key={env} env={env} monitorData={m} appStatus={appSt} />;
                        })}
                        {sortedEnvs.length === 0 && <span className="text-2xs text-txt-muted">—</span>}
                      </div>
                    </td>
                    <td className="table-cell text-txt-secondary text-xs">{project.apps.length}</td>
                    <td className="table-cell hidden lg:table-cell text-txt-secondary text-xs">{project.environments.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Activity + Scans row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Recent Activity */}
        <div className="panel">
          <div className="px-3 py-2 border-b border-border">
            <h2 className="text-xs font-semibold text-txt-primary">Activite recente</h2>
          </div>
          {activity.length === 0 ? (
            <div className="px-3 py-6 text-center text-2xs text-txt-muted">Aucune activite</div>
          ) : (
            <div className="divide-y divide-border">
              {activity.slice(0, 10).map(a => {
                const al = actionLabel(a.action);
                return (
                  <div key={a.id} className="px-3 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-2xs font-medium ${al.color}`}>{al.label}</span>
                      {a.details && <span className="text-2xs text-txt-muted font-mono truncate max-w-[120px]">{a.details}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-2xs text-txt-muted shrink-0">
                      <span>{a.userName}</span>
                      <span>{timeAgo(a.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Scans */}
        <div className="panel">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <h2 className="text-xs font-semibold text-txt-primary">Derniers scans</h2>
            <Link to="/security" className="text-2xs text-accent hover:text-accent-hover">Voir tout</Link>
          </div>
          {!stats || stats.recentScans.length === 0 ? (
            <div className="px-3 py-6 text-center text-2xs text-txt-muted">Aucun scan</div>
          ) : (
            <div className="divide-y divide-border">
              {stats.recentScans.map(s => (
                <div key={s.id} className="px-3 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 ${s.status === 'completed' ? 'bg-status-ok' : s.status === 'failed' ? 'bg-status-error' : 'bg-status-warn'}`} />
                    <span className="text-2xs text-txt-primary truncate max-w-[150px]">{s.targetUrl.replace('https://', '')}</span>
                    <span className="text-2xs text-txt-muted">{s.tool}</span>
                  </div>
                  <span className="text-2xs text-txt-muted shrink-0">{timeAgo(s.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
