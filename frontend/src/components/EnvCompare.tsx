import { useState, useEffect } from 'react';
import { api, type EnvCompareResponse } from '../api/client';

interface Props {
  projectUuid: string;
}

export default function EnvCompare({ projectUuid }: Props) {
  const [data, setData] = useState<EnvCompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getEnvCompare(projectUuid)
      .then(setData)
      .catch((err) => {
        const msg = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : 'Erreur';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [projectUuid]);

  function toggleVisibility(key: string) {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <div className="animate-spin w-4 h-4 border-2 border-accent border-t-transparent" />
        <span className="text-2xs text-txt-muted">Chargement de la comparaison...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-status-error/30 text-status-error px-3 py-2 text-xs">
        {error}
      </div>
    );
  }

  if (!data || data.environments.length === 0) {
    return (
      <div className="text-2xs text-txt-muted py-2">
        Aucun environnement avec des applications trouve.
      </div>
    );
  }

  const rows = onlyDiffs ? data.comparison.filter(r => r.hasDiff) : data.comparison;

  return (
    <div className="mt-3 panel">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-txt-primary">Comparaison des variables d'environnement</span>
        <label className="flex items-center gap-1.5 text-2xs text-txt-muted cursor-pointer">
          <input
            type="checkbox"
            checked={onlyDiffs}
            onChange={e => setOnlyDiffs(e.target.checked)}
            className="accent-accent"
          />
          Differences uniquement
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="px-3 py-2 text-2xs text-txt-muted">
          {onlyDiffs ? 'Aucune difference trouvee.' : 'Aucune variable trouvee.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-2xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-1.5 text-left text-txt-muted font-medium uppercase tracking-wider">Variable</th>
                {data.environments.map(env => (
                  <th key={env} className="px-3 py-1.5 text-left text-txt-muted font-medium uppercase tracking-wider">
                    {env}
                  </th>
                ))}
                <th className="px-2 py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(row => {
                const isVisible = visibleKeys.has(row.key);
                return (
                  <tr
                    key={row.key}
                    className={row.hasDiff ? 'bg-yellow-900/10' : ''}
                  >
                    <td className="px-3 py-1.5 font-mono font-medium text-txt-primary whitespace-nowrap">
                      {row.key}
                      {row.hasDiff && (
                        <span className="ml-1.5 text-2xs text-status-warn font-sans">diff</span>
                      )}
                    </td>
                    {data.environments.map(env => {
                      const val = row.values[env];
                      return (
                        <td key={env} className="px-3 py-1.5 font-mono text-txt-secondary max-w-[200px] truncate">
                          {val === null ? (
                            <span className="text-txt-muted italic">--</span>
                          ) : isVisible ? (
                            val
                          ) : (
                            '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => toggleVisibility(row.key)}
                        className="text-txt-muted hover:text-txt-primary transition-colors"
                        title={isVisible ? 'Masquer' : 'Afficher'}
                      >
                        {isVisible ? (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878l4.242 4.242M15.12 15.12L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
