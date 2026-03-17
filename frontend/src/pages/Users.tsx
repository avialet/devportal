import { useState, useEffect } from 'react';
import { api, type UserInfo } from '../api/client';

export default function Users() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', displayName: '', password: '', role: 'developer' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadUsers() {
    try {
      const data = await api.listUsers();
      setUsers(data);
    } catch {
      setError('Impossible de charger les utilisateurs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleCreate() {
    if (!form.email || !form.displayName || !form.password) return;
    setSaving(true);
    setError('');
    try {
      await api.createUser(form);
      setForm({ email: '', displayName: '', password: '', role: 'developer' });
      setShowForm(false);
      await loadUsers();
    } catch {
      setError('Erreur lors de la creation');
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(id: number, newRole: string) {
    try {
      await api.updateUserRole(id, newRole);
      await loadUsers();
    } catch {
      setError('Erreur lors du changement de role');
    }
  }

  async function handleDelete(id: number, email: string) {
    if (!confirm(`Supprimer ${email} ?`)) return;
    try {
      await api.deleteUser(id);
      await loadUsers();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : 'Erreur';
      setError(msg);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-sm font-semibold text-txt-primary">Utilisateurs</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Annuler' : '+ Utilisateur'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-status-error/30 text-status-error px-3 py-2 text-xs mb-3">{error}</div>
      )}

      {showForm && (
        <div className="panel p-3 mb-3">
          <div className="panel-header -mx-3 -mt-3 mb-3">Nouvel utilisateur</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Nom d'affichage"
              value={form.displayName}
              onChange={e => setForm({ ...form, displayName: e.target.value })}
              className="input-field"
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="input-field"
            />
            <input
              type="password"
              placeholder="Mot de passe"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              className="input-field"
            />
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              className="input-field"
            >
              <option value="developer">developer</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={saving || !form.email || !form.displayName || !form.password}
            className="mt-2 btn-primary disabled:opacity-50"
          >
            {saving ? 'Creation...' : 'Creer'}
          </button>
        </div>
      )}

      <div className="panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Utilisateur</th>
              <th className="table-header">Email</th>
              <th className="table-header">Role</th>
              <th className="table-header">Cree le</th>
              <th className="table-header text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="hover:bg-surface-2/50 transition-colors">
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-accent/20 text-accent flex items-center justify-center text-2xs font-bold">
                      {u.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-txt-primary">{u.displayName}</span>
                  </div>
                </td>
                <td className="table-cell text-txt-secondary">{u.email}</td>
                <td className="table-cell">
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u.id, e.target.value)}
                    className="input-field py-0.5 px-1.5"
                  >
                    <option value="developer">developer</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="table-cell text-txt-muted">
                  {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                </td>
                <td className="table-cell text-right">
                  <button
                    onClick={() => handleDelete(u.id, u.email)}
                    className="text-2xs text-status-error hover:text-red-300 transition-colors"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
