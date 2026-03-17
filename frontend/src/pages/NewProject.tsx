import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WIZARD_STEPS } from '@devportal/shared';
import { api, type GitHubRepoInfo, type GitHubStatus, type GitHubOrgsResponse } from '../api/client';

interface StepStatus {
  step: number;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

type RepoMode = 'new' | 'existing' | 'manual';

export default function NewProject() {
  const navigate = useNavigate();

  // GitHub integration state
  const [ghStatus, setGhStatus] = useState<GitHubStatus | null>(null);
  const [ghToken, setGhToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [orgsData, setOrgsData] = useState<GitHubOrgsResponse | null>(null);
  const [repos, setRepos] = useState<GitHubRepoInfo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Form state
  const [repoMode, setRepoMode] = useState<RepoMode>('new');
  const [name, setName] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [portsExposes, setPortsExposes] = useState('3000');
  const [isPrivate, setIsPrivate] = useState(true);
  const [creatingRepo, setCreatingRepo] = useState(false);

  // Wizard state
  const [creating, setCreating] = useState(false);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [resultUuid, setResultUuid] = useState('');

  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Load GitHub status on mount
  useEffect(() => {
    api.getGitHubStatus().then(setGhStatus).catch(() => setGhStatus({ configured: false }));
  }, []);

  // Load orgs when GitHub is configured
  useEffect(() => {
    if (ghStatus?.configured) {
      api.getGitHubOrgs().then(setOrgsData).catch(() => {});
    }
  }, [ghStatus?.configured]);

  // Load repos when org changes
  useEffect(() => {
    if (!ghStatus?.configured || repoMode === 'manual') return;
    setLoadingRepos(true);
    api.getGitHubRepos(selectedOrg || undefined)
      .then(setRepos)
      .catch(() => setRepos([]))
      .finally(() => setLoadingRepos(false));
  }, [ghStatus?.configured, selectedOrg, repoMode]);

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

  async function handleCreateRepo() {
    if (!name) return;
    setCreatingRepo(true);
    setError('');
    try {
      const repo = await api.createGitHubRepo({
        name: slug,
        org: selectedOrg || undefined,
        description: `Projet ${name} - DevPortal`,
        isPrivate,
      });
      setGithubUrl(repo.htmlUrl);
      // Auto-proceed to wizard
      startWizard(repo.htmlUrl);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la creation du repo');
      setCreatingRepo(false);
    }
  }

  function handleSelectExistingRepo() {
    if (!selectedRepo) return;
    const repo = repos.find(r => r.htmlUrl === selectedRepo);
    if (repo) {
      setGithubUrl(repo.htmlUrl);
      if (!name) setName(repo.name);
      startWizard(repo.htmlUrl);
    }
  }

  function handleManualUrl(e: FormEvent) {
    e.preventDefault();
    if (!name || !githubUrl) return;
    startWizard(githubUrl);
  }

  function startWizard(repoUrl: string) {
    setCreating(true);
    setCreatingRepo(false);
    setError('');
    setSteps(WIZARD_STEPS.map((label, i) => ({ step: i + 1, label, status: 'pending' })));

    fetch('/api/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name,
        githubUrl: repoUrl,
        portsExposes: portsExposes || '3000',
      }),
    }).then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming non supporte');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const update = JSON.parse(line.slice(6)) as StepStatus;

            if (update.step === 0 && update.label === 'complete') {
              setDone(true);
              try {
                const result = JSON.parse(update.detail ?? '{}');
                setResultUuid(result.projectUuid);
              } catch { /* ignore */ }
              continue;
            }

            if (update.step === 0 && update.label === 'error') {
              setError(update.detail ?? 'Erreur inconnue');
              continue;
            }

            setSteps(prev => prev.map(s =>
              s.step === update.step ? { ...s, ...update } : s
            ));
          } catch { /* ignore parse errors */ }
        }
      }
    }).catch((err: unknown) => {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Erreur';
      setError(msg);
    }).finally(() => {
      setCreating(false);
    });
  }

  function stepIcon(status: string) {
    if (status === 'done') return <span className="text-status-ok text-xs">&#10003;</span>;
    if (status === 'running') return <div className="w-3 h-3 border border-accent border-t-transparent animate-spin" />;
    if (status === 'error') return <span className="text-status-error text-xs">&#10007;</span>;
    return <div className="w-3 h-3 border border-surface-4" />;
  }

  // --- GitHub token setup ---
  if (ghStatus && !ghStatus.configured) {
    return (
      <div className="max-w-lg">
        <Link to="/" className="text-accent hover:text-accent-hover text-xs mb-2 inline-block">&larr; Retour</Link>
        <h1 className="text-sm font-semibold text-txt-primary mb-1">Nouveau projet</h1>

        <div className="panel p-3 mt-3">
          <div className="panel-header -mx-3 -mt-3 mb-3">Configurer GitHub</div>
          <p className="text-2xs text-txt-muted mb-3">
            Un token GitHub (Personal Access Token) avec les droits <code className="bg-surface-2 px-1">repo</code> est necessaire pour creer des depots et lister vos repos.
            {' '}<a href="https://github.com/settings/tokens/new?scopes=repo,read:org&description=DevPortal" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">Creer un token</a>
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={ghToken}
              onChange={e => setGhToken(e.target.value)}
              placeholder="ghp_..."
              className="input-field flex-1"
            />
            <button onClick={handleSaveToken} disabled={savingToken || !ghToken.trim()} className="btn-primary disabled:opacity-50">
              {savingToken ? '...' : 'Enregistrer'}
            </button>
          </div>
          {tokenError && <p className="text-2xs text-status-error mt-2">{tokenError}</p>}

          <div className="mt-3 border-t border-border pt-3">
            <button
              onClick={() => setGhStatus({ configured: true })}
              className="text-2xs text-txt-muted hover:text-txt-secondary"
            >
              Passer cette etape (URL manuelle uniquement)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Wizard progress ---
  if (creating || done) {
    return (
      <div className="max-w-lg">
        <Link to="/" className="text-accent hover:text-accent-hover text-xs mb-2 inline-block">&larr; Retour</Link>
        <h1 className="text-sm font-semibold text-txt-primary mb-1">Nouveau projet</h1>

        <div className="panel p-3 mt-3">
          <div className="panel-header -mx-3 -mt-3 mb-3">
            {done ? 'Projet cree' : 'Creation...'}
          </div>

          <div className="space-y-1.5">
            {steps.map(step => (
              <div key={step.step} className="flex items-center gap-2">
                {stepIcon(step.status)}
                <div className="flex-1">
                  <span className={`text-xs ${
                    step.status === 'done' ? 'text-txt-primary' :
                    step.status === 'error' ? 'text-status-error' :
                    step.status === 'running' ? 'text-accent font-medium' :
                    'text-txt-muted'
                  }`}>
                    {step.label}
                  </span>
                  {step.detail && step.status === 'done' && (
                    <span className="text-2xs text-txt-muted ml-2">{step.detail}</span>
                  )}
                  {step.detail && step.status === 'error' && (
                    <p className="text-2xs text-status-error mt-0.5">{step.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-3 bg-red-900/20 border border-status-error/30 text-status-error px-3 py-2 text-xs">{error}</div>
          )}

          {done && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => navigate(resultUuid ? `/projects/${resultUuid}` : '/')}
                className="btn-primary py-1.5"
              >
                Voir le projet
              </button>
              <Link to="/" className="btn-secondary py-1.5">
                Dashboard
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Main form ---
  const hasGitHub = ghStatus?.configured && ghStatus?.login;

  return (
    <div className="max-w-lg">
      <Link to="/" className="text-accent hover:text-accent-hover text-xs mb-2 inline-block">&larr; Retour</Link>

      <h1 className="text-sm font-semibold text-txt-primary mb-1">Nouveau projet</h1>
      <p className="text-2xs text-txt-muted mb-4">
        Creation auto: repo Git + 3 envs + domaines + monitoring
      </p>

      {/* GitHub status */}
      {hasGitHub && (
        <div className="panel px-3 py-2 mb-3 flex items-center justify-between">
          <span className="text-2xs text-txt-muted">
            GitHub: <span className="text-txt-primary font-medium">{ghStatus.login}</span>
          </span>
          <button
            onClick={async () => {
              await api.removeGitHubToken();
              setGhStatus({ configured: false });
            }}
            className="text-2xs text-txt-muted hover:text-status-error"
          >
            Deconnecter
          </button>
        </div>
      )}

      {/* Repo mode selector */}
      <div className="flex items-center gap-2 mb-4">
        {hasGitHub && (
          <>
            <button
              onClick={() => setRepoMode('new')}
              className={`text-2xs px-2.5 py-1.5 ${repoMode === 'new' ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-surface-2 text-txt-muted border border-border'}`}
            >
              Nouveau depot
            </button>
            <button
              onClick={() => setRepoMode('existing')}
              className={`text-2xs px-2.5 py-1.5 ${repoMode === 'existing' ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-surface-2 text-txt-muted border border-border'}`}
            >
              Depot existant
            </button>
          </>
        )}
        <button
          onClick={() => setRepoMode('manual')}
          className={`text-2xs px-2.5 py-1.5 ${repoMode === 'manual' ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-surface-2 text-txt-muted border border-border'}`}
        >
          URL manuelle
        </button>
      </div>

      <div className="space-y-3">
        {/* Project name */}
        <div>
          <label className="block text-2xs text-txt-muted mb-1">Nom du projet *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            pattern="[a-zA-Z0-9-]+"
            className="input-field w-full"
            placeholder="mon-app"
          />
          {slug && (
            <div className="mt-1 text-2xs text-txt-muted font-mono space-y-0.5">
              <p>dev-{slug}.51.254.131.12.nip.io</p>
              <p>staging-{slug}.51.254.131.12.nip.io</p>
              <p>{slug}.51.254.131.12.nip.io</p>
            </div>
          )}
        </div>

        {/* --- MODE: New repo --- */}
        {repoMode === 'new' && hasGitHub && (
          <>
            {/* Org selector */}
            {orgsData && (
              <div>
                <label className="block text-2xs text-txt-muted mb-1">Owner</label>
                <select
                  value={selectedOrg}
                  onChange={e => setSelectedOrg(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="">{orgsData.user.login} (perso)</option>
                  {orgsData.orgs.map(o => (
                    <option key={o.login} value={o.login}>{o.login} (org)</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-2xs text-txt-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={e => setIsPrivate(e.target.checked)}
                  className="accent-accent"
                />
                Depot prive
              </label>
            </div>

            <div>
              <label className="block text-2xs text-txt-muted mb-1">Port</label>
              <input
                type="text"
                value={portsExposes}
                onChange={e => setPortsExposes(e.target.value)}
                className="input-field w-full"
                placeholder="3000"
              />
            </div>

            <p className="text-2xs text-txt-muted">
              Un depot <code className="bg-surface-2 px-1">{selectedOrg || ghStatus?.login}/{slug || '...'}</code> sera
              cree avec les branches <code className="bg-surface-2 px-1">main</code>, <code className="bg-surface-2 px-1">dev</code> et <code className="bg-surface-2 px-1">staging</code>.
            </p>

            {error && (
              <div className="bg-red-900/20 border border-status-error/30 text-status-error px-3 py-2 text-xs">{error}</div>
            )}

            <button
              onClick={handleCreateRepo}
              disabled={!name || creatingRepo}
              className="w-full btn-primary py-2 disabled:opacity-50"
            >
              {creatingRepo ? 'Creation du repo...' : 'Creer le depot + deployer'}
            </button>
          </>
        )}

        {/* --- MODE: Existing repo --- */}
        {repoMode === 'existing' && hasGitHub && (
          <>
            {orgsData && (
              <div>
                <label className="block text-2xs text-txt-muted mb-1">Filtrer par owner</label>
                <select
                  value={selectedOrg}
                  onChange={e => setSelectedOrg(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="">{orgsData.user.login} (mes repos)</option>
                  {orgsData.orgs.map(o => (
                    <option key={o.login} value={o.login}>{o.login} (org)</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-2xs text-txt-muted mb-1">Depot</label>
              {loadingRepos ? (
                <div className="input-field w-full flex items-center gap-2 text-txt-muted text-2xs">
                  <div className="w-3 h-3 border border-accent border-t-transparent animate-spin" />
                  Chargement...
                </div>
              ) : (
                <select
                  value={selectedRepo}
                  onChange={e => setSelectedRepo(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="">-- Choisir un depot --</option>
                  {repos.map(r => (
                    <option key={r.htmlUrl} value={r.htmlUrl}>
                      {r.fullName} {r.isPrivate ? '(prive)' : '(public)'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-2xs text-txt-muted mb-1">Port</label>
              <input
                type="text"
                value={portsExposes}
                onChange={e => setPortsExposes(e.target.value)}
                className="input-field w-full"
                placeholder="3000"
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-status-error/30 text-status-error px-3 py-2 text-xs">{error}</div>
            )}

            <button
              onClick={handleSelectExistingRepo}
              disabled={!selectedRepo || !name}
              className="w-full btn-primary py-2 disabled:opacity-50"
            >
              Deployer ce depot
            </button>
          </>
        )}

        {/* --- MODE: Manual URL --- */}
        {repoMode === 'manual' && (
          <form onSubmit={handleManualUrl} className="space-y-3">
            <div>
              <label className="block text-2xs text-txt-muted mb-1">URL GitHub *</label>
              <input
                type="url"
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                required
                className="input-field w-full"
                placeholder="https://github.com/user/repo"
              />
            </div>

            <div>
              <label className="block text-2xs text-txt-muted mb-1">Port</label>
              <input
                type="text"
                value={portsExposes}
                onChange={e => setPortsExposes(e.target.value)}
                className="input-field w-full"
                placeholder="3000"
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-status-error/30 text-status-error px-3 py-2 text-xs">{error}</div>
            )}

            <button type="submit" disabled={!name || !githubUrl} className="w-full btn-primary py-2 disabled:opacity-50">
              Creer le projet
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
