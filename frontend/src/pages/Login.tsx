interface Props {
  onLoginOidc: () => void;
  oidcAvailable: boolean;
}

export default function Login({ onLoginOidc, oidcAvailable }: Props) {
  const error = new URLSearchParams(window.location.search).get('error');

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0">
      <div className="w-full max-w-sm">
        <div className="panel p-6">
          <div className="text-center mb-6">
            <img src="/plannet-logo.svg" alt="plan.net" className="w-10 h-10 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-txt-primary">DevPortal</h1>
            <p className="text-2xs text-txt-muted mt-1 uppercase tracking-wider">Operations Platform</p>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-status-error/30 text-status-error px-3 py-2 text-xs mb-4">
              Erreur d'authentification. Veuillez reessayer.
            </div>
          )}

          {oidcAvailable ? (
            <button
              onClick={onLoginOidc}
              className="w-full btn-primary py-2.5 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Se connecter avec Authentik
            </button>
          ) : (
            <p className="text-center text-txt-muted text-xs">
              Authentification SSO non configuree.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
