import * as coolify from './coolify.service.js';
import { runQuery } from '../db/database.js';
import { buildFqdn, ENV_NAMES, type EnvName } from '@devportal/shared';

export interface WizardInput {
  name: string;
  githubUrl: string;
  gitBranch?: string;
  portsExposes?: string;
  userId: number;
}

export interface WizardStepUpdate {
  step: number;
  label: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
}

export type OnProgress = (update: WizardStepUpdate) => void;

interface WizardResult {
  projectUuid: string;
  apps: Record<EnvName, { uuid: string; fqdn: string }>;
}

const ENV_BRANCHES: Record<EnvName, string> = {
  development: 'dev',
  staging: 'staging',
  production: 'main',
};

export async function runWizard(
  input: WizardInput,
  onProgress: OnProgress
): Promise<WizardResult> {
  const { name, githubUrl, gitBranch, portsExposes = '3000', userId } = input;
  const serverUuid = await coolify.getServerUuid();

  // Step 1: Create Coolify project
  onProgress({ step: 1, label: 'Creation du projet Coolify', status: 'running' });
  let project: coolify.CoolifyProject;
  try {
    project = await coolify.createProject(name, `Cree via DevPortal`);
    onProgress({ step: 1, label: 'Creation du projet Coolify', status: 'done', detail: project.uuid });
  } catch (err) {
    onProgress({ step: 1, label: 'Creation du projet Coolify', status: 'error', detail: String(err) });
    throw err;
  }

  // Step 2: Create environments (production exists by default, create dev + staging)
  onProgress({ step: 2, label: 'Creation des environnements', status: 'running' });
  try {
    const existingEnvs = await coolify.getProjectEnvironments(project.uuid);
    const existingNames = new Set(existingEnvs.map(e => e.name));

    for (const envName of ENV_NAMES) {
      if (!existingNames.has(envName)) {
        await coolify.createEnvironment(project.uuid, envName);
      }
    }
    onProgress({ step: 2, label: 'Creation des environnements', status: 'done', detail: '3 environnements' });
  } catch (err) {
    onProgress({ step: 2, label: 'Creation des environnements', status: 'error', detail: String(err) });
    throw err;
  }

  // Steps 3-5: Create apps for each environment
  const apps: Partial<Record<EnvName, { uuid: string; fqdn: string }>> = {};

  for (let i = 0; i < ENV_NAMES.length; i++) {
    const envName = ENV_NAMES[i];
    const stepNum = 3 + i;
    const branch = gitBranch ?? ENV_BRANCHES[envName];
    const fqdn = buildFqdn(name, envName);

    onProgress({ step: stepNum, label: `Deploiement app ${envName}`, status: 'running' });
    try {
      const app = await coolify.createPublicApp({
        project_uuid: project.uuid,
        server_uuid: serverUuid,
        environment_name: envName,
        git_repository: githubUrl,
        git_branch: branch,
        build_pack: 'nixpacks',
        ports_exposes: portsExposes,
      });

      await coolify.updateApplication(app.uuid, { fqdn });

      apps[envName] = { uuid: app.uuid, fqdn };
      onProgress({
        step: stepNum,
        label: `Deploiement app ${envName}`,
        status: 'done',
        detail: fqdn,
      });
    } catch (err) {
      onProgress({
        step: stepNum,
        label: `Deploiement app ${envName}`,
        status: 'error',
        detail: String(err),
      });
      throw err;
    }
  }

  // Step 6: Monitor creation (placeholder for Phase 4)
  onProgress({ step: 6, label: 'Configuration des monitors', status: 'running' });
  onProgress({ step: 6, label: 'Configuration des monitors', status: 'done', detail: 'Phase 4' });

  // Step 7: Save to portal database
  onProgress({ step: 7, label: 'Sauvegarde', status: 'running' });
  try {
    runQuery(
      `INSERT INTO portal_projects (name, coolify_project_uuid, github_url, created_by, dev_app_uuid, staging_app_uuid, prod_app_uuid)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        project.uuid,
        githubUrl,
        userId,
        apps.development?.uuid ?? null,
        apps.staging?.uuid ?? null,
        apps.production?.uuid ?? null,
      ]
    );
    onProgress({ step: 7, label: 'Sauvegarde', status: 'done' });
  } catch (err) {
    onProgress({ step: 7, label: 'Sauvegarde', status: 'error', detail: String(err) });
    throw err;
  }

  // Trigger initial dev deployment
  if (apps.development) {
    try {
      await coolify.deployApplication(apps.development.uuid);
    } catch {
      // Non-blocking
    }
  }

  return {
    projectUuid: project.uuid,
    apps: apps as Record<EnvName, { uuid: string; fqdn: string }>,
  };
}
