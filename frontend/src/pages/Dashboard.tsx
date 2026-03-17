import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, type ProjectSummary, type DashboardStats, type ActivityItem } from '../api/client';

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
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'a l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return `il y a ${Math.floor(diff / 86400)}j`;
}

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
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
            <div className="text-2xs text-txt-muted uppercase tracking-wider">Monitors</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-lg font-semibold text-status-ok">{stats.monitors.up}</span>
              <span className="text-2xs text-txt-muted">/ {stats.monitors.total}</span>
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

      {/* Projects header + table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-txt-primary">Projets</h1>
            <span className="text-2xs text-txt-muted">{projects.length} total</span>
          </div>
          <Link to="/new" className="btn-primary">+ Nouveau</Link>
        </div>

        {projects.length === 0 ? (
          <div className="panel text-center py-12 text-txt-muted text-xs">Aucun projet</div>
        ) : (
          <div className="panel overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Projet</th>
                  <th className="table-header">Source</th>
                  <th className="table-header">Envs</th>
                  <th className="table-header">Services</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(project => (
                  <tr key={project.uuid} className="hover:bg-surface-2/50 transition-colors">
                    <td className="table-cell">
                      <Link to={`/projects/${project.uuid}`} className="text-accent hover:text-accent-hover font-medium">
                        {project.name}
                      </Link>
                      {project.portalManaged && (
                        <span className="ml-1.5 text-2xs bg-accent/10 text-accent px-1 py-0.5">portal</span>
                      )}
                    </td>
                    <td className="table-cell font-mono text-2xs text-txt-muted truncate max-w-[200px]">
                      {project.githubUrl ? project.githubUrl.replace('https://github.com/', '') : '—'}
                    </td>
                    <td className="table-cell text-txt-secondary">{project.environments.length}</td>
                    <td className="table-cell text-txt-secondary">{project.apps.length}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        {project.apps.length > 0 ? (
                          project.apps.map(app => (
                            <span key={app.uuid} className="inline-flex items-center gap-1" title={`${app.env}: ${statusLabel(app.status)}`}>
                              <span className={`w-1.5 h-1.5 ${statusDot(app.status)}`} />
                              <span className="text-2xs text-txt-muted">{app.env}</span>
                            </span>
                          ))
                        ) : (
                          <span className="text-2xs text-txt-muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity + Scans row */}
      <div className="grid grid-cols-2 gap-3">
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
