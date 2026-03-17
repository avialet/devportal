import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WIZARD_STEPS, buildDomain } from '@devportal/shared';

interface StepStatus {
  step: number;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

export default function NewProject() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const [portsExposes, setPortsExposes] = useState('3000');
  const [creating, setCreating] = useState(false);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [resultUuid, setResultUuid] = useState('');

  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    setSteps(WIZARD_STEPS.map((label, i) => ({ step: i + 1, label, status: 'pending' })));

    const token = localStorage.getItem('devportal_token');

    try {
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          githubUrl,
          gitBranch: gitBranch || undefined,
          portsExposes: portsExposes || '3000',
        }),
      });

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
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Erreur';
      setError(msg);
    } finally {
      setCreating(false);
    }
  }

  function stepIcon(status: string) {
    if (status === 'done') return <span className="text-status-ok text-xs">&#10003;</span>;
    if (status === 'running') return <div className="w-3 h-3 border border-accent border-t-transparent animate-spin" />;
    if (status === 'error') return <span className="text-status-error text-xs">&#10007;</span>;
    return <div className="w-3 h-3 border border-surface-4" />;
  }

  return (
    <div className="max-w-lg">
      <Link to="/" className="text-accent hover:text-accent-hover text-xs mb-2 inline-block">&larr; Retour</Link>

      <h1 className="text-sm font-semibold text-txt-primary mb-1">Nouveau projet</h1>
      <p className="text-2xs text-txt-muted mb-4">
        Creation auto: projet + 3 envs + domaines + monitoring
      </p>

      {!creating && !done && (
        <form onSubmit={handleSubmit} className="space-y-3">
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-2xs text-txt-muted mb-1">Branche</label>
              <input
                type="text"
                value={gitBranch}
                onChange={e => setGitBranch(e.target.value)}
                className="input-field w-full"
                placeholder="auto"
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
          </div>

          {error && (
            <div className="bg-red-900/20 border border-status-error/30 text-status-error px-3 py-2 text-xs">{error}</div>
          )}

          <button type="submit" className="w-full btn-primary py-2">
            Creer le projet
          </button>
        </form>
      )}

      {(creating || done) && (
        <div className="panel p-3">
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
      )}
    </div>
  );
}
