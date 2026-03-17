import { useState, useEffect } from 'react';

interface Member {
  id: number;
  user_id: number;
  role: string;
  display_name: string;
  email: string;
}

interface Props {
  projectUuid: string;
}

export default function ProjectMembers({ projectUuid }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadMembers() {
    try {
      const res = await fetch(`/api/projects/${projectUuid}/members`, { credentials: 'include' });
      if (res.ok) setMembers(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { loadMembers(); }, [projectUuid]);

  async function removeMember(id: number) {
    if (!window.confirm('Retirer ce membre ?')) return;
    try {
      await fetch(`/api/projects/${projectUuid}/members/${id}`, { method: 'DELETE', credentials: 'include' });
      await loadMembers();
    } catch { /* ignore */ }
  }

  if (loading) return <div className="text-2xs text-txt-muted">Chargement...</div>;

  return (
    <div className="mt-2 border border-border">
      <div className="px-2 py-1.5 bg-surface-1 border-b border-border">
        <span className="text-2xs font-medium text-txt-primary">Membres du projet</span>
      </div>
      {members.length === 0 ? (
        <div className="px-2 py-3 text-center text-2xs text-txt-muted">Aucun membre (admins ont toujours acces)</div>
      ) : (
        <div className="divide-y divide-border">
          {members.map(m => (
            <div key={m.id} className="px-2 py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xs text-txt-primary">{m.display_name}</span>
                <span className="text-2xs text-txt-muted">{m.email}</span>
                <span className="text-2xs bg-accent/10 text-accent px-1 py-0.5">{m.role}</span>
              </div>
              <button onClick={() => removeMember(m.id)} className="text-2xs text-status-error hover:text-red-300">&times;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
