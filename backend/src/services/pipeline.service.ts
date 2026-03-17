export interface PipelineStage {
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending';
  startedAt?: string;
  duration?: number; // seconds
}

export function parseDeploymentStages(status: string, logs: string): PipelineStage[] {
  const stages: PipelineStage[] = [];
  const logLower = logs.toLowerCase();

  // Clone stage
  const hasClone = logLower.includes('git') || logLower.includes('clone') || logLower.includes('checkout');
  if (hasClone || status !== 'queued') {
    stages.push({
      name: 'Clone',
      status: status === 'failed' && !logLower.includes('build') ? 'failed' : 'success',
    });
  }

  // Build stage
  const hasBuild = logLower.includes('build') || logLower.includes('docker') || logLower.includes('nixpacks');
  if (hasBuild) {
    const buildFailed = status === 'failed' && (logLower.includes('build failed') || logLower.includes('error'));
    stages.push({
      name: 'Build',
      status: buildFailed ? 'failed' : status === 'in_progress' ? 'running' : 'success',
    });
  } else if (status !== 'queued') {
    stages.push({ name: 'Build', status: status === 'in_progress' ? 'running' : 'pending' });
  }

  // Deploy stage
  if (status === 'finished') {
    stages.push({ name: 'Deploy', status: 'success' });
  } else if (status === 'in_progress' && hasBuild) {
    stages.push({ name: 'Deploy', status: 'running' });
  } else if (status === 'failed' && hasBuild && !logLower.includes('build failed')) {
    stages.push({ name: 'Deploy', status: 'failed' });
  } else {
    stages.push({ name: 'Deploy', status: 'pending' });
  }

  return stages;
}
