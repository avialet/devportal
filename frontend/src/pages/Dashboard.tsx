import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, type ProjectSummary } from '../api/client';

function statusColor(status: string): string {
  if (status === 'running') return 'bg-green-500';
  if (status === 'stopped' || status === 'exited') return 'bg-red-500';
  if (status.includes('progress') || status.includes('building')) return 'bg-yellow-500';
  return 'bg-gray-400';
}

function statusLabel(status: string): string {
  if (status === 'running') return 'En ligne';
  if (status === 'stopped' || status === 'exited') return 'Arrete';
  if (status.includes('progress') || status.includes('building')) return 'Deploiement...';
  return status || 'Inconnu';
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
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 px-6 py-4 rounded-xl">
        <p className="font-medium">Erreur de connexion a Coolify</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projets</h1>
          <p className="text-gray-500 mt-1">{projects.length} projet(s) sur Coolify</p>
        </div>
        <Link
          to="/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition opacity-50 cursor-not-allowed pointer-events-none"
        >
          + Nouveau projet
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Aucun projet pour le moment</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(project => (
            <Link
              key={project.uuid}
              to={`/projects/${project.uuid}`}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition block"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-lg">{project.name}</h3>
                {project.portalManaged && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Portal</span>
                )}
              </div>

              {project.githubUrl && (
                <p className="text-sm text-gray-400 mb-3 truncate">{project.githubUrl}</p>
              )}

              <div className="text-sm text-gray-500 mb-4">
                {project.environments.length} environnement(s)
              </div>

              {project.apps.length > 0 ? (
                <div className="space-y-2">
                  {project.apps.map(app => (
                    <div key={app.uuid} className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full ${statusColor(app.status)}`} />
                      <span className="text-gray-600">{app.env}</span>
                      <span className="text-gray-400">-</span>
                      <span className="text-gray-500">{statusLabel(app.status)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Pas d'applications</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
