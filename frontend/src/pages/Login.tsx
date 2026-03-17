interface Props {
  onLoginOidc: () => void;
  oidcAvailable: boolean;
}

export default function Login({ onLoginOidc, oidcAvailable }: Props) {
  const error = new URLSearchParams(window.location.search).get('error');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <img src="/plannet-logo.svg" alt="plan.net" className="w-16 h-16 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900">DevPortal</h1>
            <p className="text-gray-500 mt-2">Plateforme de deploiement interne</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
              Erreur d'authentification. Veuillez reessayer.
            </div>
          )}

          {oidcAvailable ? (
            <button
              onClick={onLoginOidc}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Se connecter avec Authentik
            </button>
          ) : (
            <p className="text-center text-gray-500 text-sm">
              Authentification SSO non configuree.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
