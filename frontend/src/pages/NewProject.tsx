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
    if (status === 'done') return (
      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
    if (status === 'running') return (
      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    );
    if (status === 'error') return (
      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
    return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">&larr; Retour</Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Nouveau projet</h1>
      <p className="text-gray-500 mb-8">
        Le wizard va automatiquement creer le projet, 3 environnements et configurer les domaines.
      </p>

      {!creating && !done && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom du projet *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              pattern="[a-zA-Z0-9-]+"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="mon-app"
            />
            {slug && (
              <div className="mt-2 text-xs text-gray-400 space-y-1">
                <p>dev-{slug}.51.254.131.12.nip.io</p>
                <p>staging-{slug}.51.254.131.12.nip.io</p>
                <p>{slug}.51.254.131.12.nip.io (prod)</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL du repo GitHub *
            </label>
            <input
              type="url"
              value={githubUrl}
              onChange={e => setGithubUrl(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="https://github.com/user/repo"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branche Git
              </label>
              <input
                type="text"
                value={gitBranch}
                onChange={e => setGitBranch(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="auto (dev/staging/main)"
              />
              <p className="text-xs text-gray-400 mt-1">Vide = branches auto par env</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Port expose
              </label>
              <input
                type="text"
                value={portsExposes}
                onChange={e => setPortsExposes(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="3000"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Creer le projet
          </button>
        </form>
      )}

      {(creating || done) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {done ? 'Projet cree !' : 'Creation en cours...'}
          </h2>

          <div className="space-y-3">
            {steps.map(step => (
              <div key={step.step} className="flex items-center gap-3">
                {stepIcon(step.status)}
                <div className="flex-1">
                  <span className={`text-sm ${step.status === 'done' ? 'text-gray-900' : step.status === 'error' ? 'text-red-600' : step.status === 'running' ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                  {step.detail && step.status === 'done' && (
                    <span className="text-xs text-gray-400 ml-2">{step.detail}</span>
                  )}
                  {step.detail && step.status === 'error' && (
                    <p className="text-xs text-red-500 mt-0.5">{step.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          {done && (
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => navigate(resultUuid ? `/projects/${resultUuid}` : '/')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
              >
                Voir le projet
              </button>
              <Link
                to="/"
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition"
              >
                Retour au dashboard
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
