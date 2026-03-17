import { useState, useEffect } from 'react';

interface PipelineStage {
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending';
}

interface PipelineData {
  deploymentUuid: string;
  status: string;
  commit: string | null;
  createdAt: string;
  finishedAt: string | null;
  stages: PipelineStage[];
}

interface Props {
  deploymentUuid: string;
}

function stageColor(status: string): string {
  switch (status) {
    case 'success': return 'bg-status-ok';
    case 'failed': return 'bg-status-error';
    case 'running': return 'bg-status-warn animate-pulse';
    default: return 'bg-surface-3';
  }
}

function stageTextColor(status: string): string {
  switch (status) {
    case 'success': return 'text-status-ok';
    case 'failed': return 'text-status-error';
    case 'running': return 'text-status-warn';
    default: return 'text-txt-muted';
  }
}

export default function PipelineView({ deploymentUuid }: Props) {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/apps/deployments/${deploymentUuid}/pipeline`, { credentials: 'include' });
        if (res.ok) setData(await res.json());
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
    // Poll if not finished
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/apps/deployments/${deploymentUuid}/pipeline`, { credentials: 'include' });
        if (res.ok) {
          const d = await res.json();
          setData(d);
          if (d.status === 'finished' || d.status === 'failed') clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [deploymentUuid]);

  if (loading || !data) return null;

  return (
    <div className="flex items-center gap-1 mt-1">
      {data.stages.map((stage, i) => (
        <div key={stage.name} className="flex items-center gap-1">
          {i > 0 && <div className="w-4 h-px bg-border" />}
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 ${stageColor(stage.status)}`} />
            <span className={`text-2xs font-medium ${stageTextColor(stage.status)}`}>{stage.name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
