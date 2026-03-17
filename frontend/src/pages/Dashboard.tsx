import type { User } from '@devportal/shared';

interface Props {
  user: User;
}

export default function Dashboard({ user }: Props) {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Bienvenue, {user.displayName}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-500">Projets</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">-</div>
          <p className="text-sm text-gray-400 mt-1">Phase 2</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-500">Deploiements</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">-</div>
          <p className="text-sm text-gray-400 mt-1">Phase 2</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-500">Monitoring</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">-</div>
          <p className="text-sm text-gray-400 mt-1">Phase 4</p>
        </div>
      </div>

      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions rapides</h2>
        <div className="flex gap-3">
          <button
            disabled
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium opacity-50 cursor-not-allowed"
          >
            + Nouveau projet
          </button>
          <span className="self-center text-sm text-gray-400">Disponible en Phase 3</span>
        </div>
      </div>
    </div>
  );
}
