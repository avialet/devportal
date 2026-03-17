import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, type ProjectSummary } from '../api/client';

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

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listProjects()
      .then(setProjects)
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
        <span className="font-medium">Erreur Coolify</span> — {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-txt-primary">Projets</h1>
          <span className="text-2xs text-txt-muted">{projects.length} total</span>
        </div>
        <Link to="/new" className="btn-primary">
          + Nouveau
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="panel text-center py-12 text-txt-muted text-xs">
          Aucun projet
        </div>
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
                  <td className="table-cell text-txt-secondary">
                    {project.environments.length}
                  </td>
                  <td className="table-cell text-txt-secondary">
                    {project.apps.length}
                  </td>
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
  );
}
