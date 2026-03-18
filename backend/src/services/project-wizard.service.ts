import * as coolify from './coolify.service.js';
import * as monitoring from './monitoring.service.js';
import { createWorkflowFile, isRepoPrivate, addDeployKey, branchExists, createBranch, repoExists } from './github.service.js';
import { runQuery, queryOne } from '../db/database.js';
import { buildFqdn, ENV_NAMES, type EnvName } from '@devportal/shared';
import { config } from '../config.js';

export interface WizardInput {
  name: string;
  githubUrl: string;
  gitBranch?: string;
  portsExposes?: string;
  userId: number;
  githubToken?: string | null;
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

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

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
        await pause(3000);
      }
    }
    onProgress({ step: 2, label: 'Creation des environnements', status: 'done', detail: 'dev + staging + production' });
  } catch (err) {
    onProgress({ step: 2, label: 'Creation des environnements', status: 'error', detail: String(err) });
    throw err;
  }

  // Steps 3-5: Create apps for each environment with auto-deploy config
  const apps: Partial<Record<EnvName, { uuid: string; fqdn: string }>> = {};

  // Extract owner/repo from GitHub URL (e.g. https://github.com/avialet/paperFlow -> avialet/paperFlow)
  const repoPath = githubUrl.replace('https://github.com/', '').replace(/\.git$/, '');
  const [repoOwner, repoName] = repoPath.split('/');

  // Verify repo exists before proceeding
  let usePrivateKey = false;
  let deployKeyUuid: string | null = null;
  if (input.githubToken && repoOwner && repoName) {
    const exists = await repoExists(input.githubToken, repoOwner, repoName);
    if (!exists) {
      const errMsg = `Le repo GitHub ${repoOwner}/${repoName} n'existe pas ou n'est pas accessible avec votre token.`;
      onProgress({ step: 2, label: 'Verification du repo', status: 'error', detail: errMsg });
      throw new Error(errMsg);
    }

    const isPrivate = await isRepoPrivate(input.githubToken, repoOwner, repoName);
    if (isPrivate) {
      const deployKey = await coolify.getGitDeployKey();
      if (deployKey) {
        // Add Coolify's SSH deploy key to the GitHub repo
        await addDeployKey(input.githubToken, repoOwner, repoName, deployKey.publicKey);
        deployKeyUuid = deployKey.uuid;
        usePrivateKey = true;
        onProgress({ step: 2, label: 'Repo prive detecte, deploy key SSH ajoutee', status: 'done' });
      }
    }

    // Ensure dev and staging branches exist (for existing repos that may only have main)
    for (const branch of ['dev', 'staging']) {
      try {
        const exists = await branchExists(input.githubToken, repoOwner, repoName, branch);
        if (!exists) {
          await createBranch(input.githubToken, repoOwner, repoName, branch, 'main');
          onProgress({ step: 2, label: `Branche ${branch} creee`, status: 'done' });
        }
      } catch (err) {
        console.warn(`[Wizard] Could not create branch ${branch}:`, err);
      }
    }
  }

  // git_repository format depends on app type:
  // - public apps: owner/repo (Coolify adds https://github.com/ prefix)
  // - private-deploy-key apps: git@github.com:owner/repo.git (SSH URL required)
  const gitRepoPublic = repoPath;
  const gitRepoPrivate = `git@github.com:${repoPath}.git`;

  for (let i = 0; i < ENV_NAMES.length; i++) {
    const envName = ENV_NAMES[i];
    const stepNum = 3 + i;
    const branch = gitBranch ?? ENV_BRANCHES[envName];
    const fqdn = buildFqdn(name, envName);
    onProgress({ step: stepNum, label: `App ${envName} (${branch})`, status: 'running' });
    try {
      const baseParams: coolify.CreateAppParams = {
        project_uuid: project.uuid,
        server_uuid: serverUuid,
        environment_name: envName,
        git_repository: usePrivateKey ? gitRepoPrivate : gitRepoPublic,
        git_branch: branch,
        build_pack: 'nixpacks',
        ports_exposes: portsExposes,
      };

      const app = usePrivateKey && deployKeyUuid
        ? await coolify.createPrivateKeyApp({ ...baseParams, private_key_uuid: deployKeyUuid })
        : await coolify.createPublicApp(baseParams);

      // Set domain + remove default memory limits (Coolify defaults cause Docker "Minimum memory" errors)
      await coolify.updateApplication(app.uuid, {
        domains: fqdn,
        limits_memory: '0',
        limits_memory_swap: '0',
        limits_memory_reservation: '0',
      });

      apps[envName] = { uuid: app.uuid, fqdn };

      onProgress({
        step: stepNum,
        label: `App ${envName} (${branch})`,
        status: 'done',
        detail: fqdn,
      });

      // Pause between app creations to avoid Coolify rate limiting
      await pause(4000);
    } catch (err) {
      onProgress({
        step: stepNum,
        label: `App ${envName} (${branch})`,
        status: 'error',
        detail: String(err),
      });
      throw err;
    }
  }

  // Step 6: Save to portal database (before monitors so we have project_id)
  onProgress({ step: 6, label: 'Sauvegarde en base', status: 'running' });
  let portalProjectId: number;
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
    const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
    portalProjectId = row?.id ?? 0;
    onProgress({ step: 6, label: 'Sauvegarde en base', status: 'done' });
  } catch (err) {
    onProgress({ step: 6, label: 'Sauvegarde en base', status: 'error', detail: String(err) });
    throw err;
  }

  // Step 7: Create monitors for all 3 environments
  onProgress({ step: 7, label: 'Creation des monitors', status: 'running' });
  try {
    for (const envName of ENV_NAMES) {
      const fqdn = buildFqdn(name, envName);
      monitoring.addMonitor(`${envName}-${name}`, fqdn, 60, portalProjectId, envName);
    }
    onProgress({ step: 7, label: 'Creation des monitors', status: 'done', detail: '3 monitors actifs' });
  } catch (err) {
    // Non-blocking
    onProgress({ step: 7, label: 'Creation des monitors', status: 'done', detail: `Warning: ${err}` });
  }

  // Step 7b: Create GitHub Actions workflow if user has GitHub token
  if (input.githubToken) {
    try {
      const urlParts = githubUrl.replace('https://github.com/', '').split('/');
      const [owner, repoName] = urlParts;
      if (owner && repoName) {
        await createWorkflowFile(
          input.githubToken,
          owner, repoName,
          config.coolifyApiUrl,
          apps.development?.uuid,
          apps.staging?.uuid,
          apps.production?.uuid
        );
      }
    } catch { /* Non-blocking */ }
  }

  // Trigger initial deployments on dev + staging
  for (const envName of ['development', 'staging'] as EnvName[]) {
    if (apps[envName]) {
      try {
        await coolify.deployApplication(apps[envName]!.uuid);
        await pause(4000);
      } catch {
        // Non-blocking
      }
    }
  }

  return {
    projectUuid: project.uuid,
    apps: apps as Record<EnvName, { uuid: string; fqdn: string }>,
  };
}
