import { config } from '../config.js';

const BASE = config.coolifyApiUrl;
const TOKEN = config.coolifyApiToken;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── In-memory cache for GET requests (30s TTL) ───
const apiCache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 30_000; // 30 seconds

export function invalidateCache(): void {
  apiCache.clear();
}

async function request<T>(path: string, options: RequestInit = {}, retries = 5): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const url = `${BASE}${path}`;

  // Invalidate cache on any write operation
  if (method !== 'GET') {
    apiCache.clear();
  }

  // Serve from cache for GET requests (exclude action endpoints like /deploy)
  const isActionGet = path.startsWith('/deploy');
  if (method === 'GET' && !isActionGet) {
    const cached = apiCache.get(path);
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> ?? {}),
      },
    });

    // Rate limited — wait longer each retry (10s, 20s, 30s, 40s, 50s)
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10);
      const waitMs = retryAfter ? retryAfter * 1000 : 10000 * attempt;
      console.warn(`Coolify 429 on ${path}, retry ${attempt}/${retries} in ${Math.round(waitMs / 1000)}s`);
      if (attempt < retries) {
        await delay(waitMs);
        continue;
      }
    }

    // Server errors — also retry with backoff
    if (res.status >= 500 && attempt < retries) {
      const waitMs = 5000 * attempt;
      console.warn(`Coolify ${res.status} on ${path}, retry ${attempt}/${retries} in ${Math.round(waitMs / 1000)}s`);
      await delay(waitMs);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Coolify API ${res.status}: ${text}`);
    }

    const text = await res.text();
    const result = text ? JSON.parse(text) : {} as T;

    // Store in cache for GET requests (exclude action endpoints)
    if (method === 'GET' && !isActionGet) {
      apiCache.set(path, { data: result, expires: Date.now() + CACHE_TTL });
    }

    return result as T;
  }

  throw new Error(`Coolify API: max retries reached for ${path}`);
}

// --- Projects ---

export interface CoolifyProject {
  uuid: string;
  name: string;
  description: string | null;
  environments?: CoolifyEnvironment[];
}

export interface CoolifyEnvironment {
  id: number;
  uuid: string;
  name: string;
  project_id: number;
  applications?: CoolifyApp[];
}

export interface CoolifyApp {
  uuid: string;
  name: string;
  fqdn: string | null;
  status: string;
  git_repository: string;
  git_branch: string;
  build_pack: string;
  description: string | null;
}

export async function listProjects(): Promise<CoolifyProject[]> {
  return request<CoolifyProject[]>('/projects');
}

export async function getProject(uuid: string): Promise<CoolifyProject> {
  return request<CoolifyProject>(`/projects/${uuid}`);
}

export async function deleteProject(uuid: string): Promise<void> {
  await request(`/projects/${uuid}`, { method: 'DELETE' });
}

export async function createProject(name: string, description?: string): Promise<CoolifyProject> {
  return request<CoolifyProject>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

export async function getProjectEnvironments(projectUuid: string): Promise<CoolifyEnvironment[]> {
  const project = await request<CoolifyProject>(`/projects/${projectUuid}`);
  return project.environments ?? [];
}

export async function getEnvironmentDetail(projectUuid: string, envName: string): Promise<CoolifyEnvironment> {
  return request<CoolifyEnvironment>(`/projects/${projectUuid}/${envName}`);
}

export async function createEnvironment(projectUuid: string, name: string): Promise<CoolifyEnvironment> {
  return request<CoolifyEnvironment>(`/projects/${projectUuid}/environments`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// --- Applications ---

export async function listApplications(): Promise<CoolifyApp[]> {
  return request<CoolifyApp[]>('/applications');
}

export async function getApplication(uuid: string): Promise<CoolifyApp> {
  return request<CoolifyApp>(`/applications/${uuid}`);
}

export interface CreateAppParams {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  git_repository: string;
  git_branch: string;
  build_pack: string;
  ports_exposes: string;
}

export async function createPublicApp(params: CreateAppParams): Promise<CoolifyApp> {
  return request<CoolifyApp>('/applications/public', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface CreatePrivateKeyAppParams extends CreateAppParams {
  private_key_uuid: string;
}

export async function createPrivateKeyApp(params: CreatePrivateKeyAppParams): Promise<CoolifyApp> {
  return request<CoolifyApp>('/applications/private-deploy-key', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// Get the first git-related SSH key from Coolify
export async function getGitDeployKey(): Promise<{ uuid: string; publicKey: string } | null> {
  const keys = await request<{ uuid: string; public_key: string; is_git_related: boolean }[]>('/security/keys');
  const gitKey = keys.find(k => k.is_git_related);
  return gitKey ? { uuid: gitKey.uuid, publicKey: gitKey.public_key } : null;
}

export async function deleteApplication(uuid: string): Promise<void> {
  await request(`/applications/${uuid}`, { method: 'DELETE' });
}

export async function updateApplication(uuid: string, data: Record<string, unknown>): Promise<void> {
  await request(`/applications/${uuid}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deployApplication(uuid: string): Promise<{ deployment_uuid: string }> {
  // Coolify GET /deploy returns { deployments: [{ deployment_uuid, message, resource_uuid }] }
  const result = await request<{ deployments: { deployment_uuid: string }[] }>(`/deploy?uuid=${uuid}&force=true`);
  const dep = result.deployments?.[0];
  return { deployment_uuid: dep?.deployment_uuid ?? '' };
}

export async function startApplication(uuid: string): Promise<void> {
  await request(`/applications/${uuid}/start`, { method: 'POST' });
}

export async function stopApplication(uuid: string): Promise<void> {
  await request(`/applications/${uuid}/stop`, { method: 'POST' });
}

export async function restartApplication(uuid: string): Promise<{ deployment_uuid: string }> {
  return request<{ deployment_uuid: string }>(`/applications/${uuid}/restart`, { method: 'POST' });
}

// --- Deployments ---

export interface CoolifyDeployment {
  id: number;
  uuid: string;
  deployment_uuid: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  commit: string | null;
  logs: string;
}

// Normalize: Coolify uses deployment_uuid, our frontend expects uuid
function normalizeDep(d: any): CoolifyDeployment {
  return {
    ...d,
    uuid: d.deployment_uuid || d.uuid || '',
  };
}

export async function getDeployments(appUuid: string): Promise<CoolifyDeployment[]> {
  // Coolify returns { count, deployments: [...] }
  const result = await request<{ deployments: any[] } | any[]>(`/deployments/applications/${appUuid}`);
  const list = Array.isArray(result) ? result : (result as any).deployments ?? [];
  return list.map(normalizeDep);
}

export async function getDeployment(deploymentUuid: string): Promise<CoolifyDeployment> {
  const dep = await request<any>(`/deployments/${deploymentUuid}`);
  return normalizeDep(dep);
}

// --- Application Logs ---

export async function getAppLogs(appUuid: string, since?: number): Promise<string> {
  const params = since ? `?since=${since}` : '';
  const data = await request<{ logs: string }>(`/applications/${appUuid}/logs${params}`);
  return data.logs ?? '';
}

// --- Environment Variables ---

export interface CoolifyEnvVar {
  uuid: string;
  key: string;
  value: string;
  is_build_time: boolean;
  is_preview: boolean;
}

export async function getEnvVars(appUuid: string): Promise<CoolifyEnvVar[]> {
  return request<CoolifyEnvVar[]>(`/applications/${appUuid}/envs`);
}

export async function createEnvVar(appUuid: string, key: string, value: string, isBuildTime = false): Promise<void> {
  await request(`/applications/${appUuid}/envs`, {
    method: 'POST',
    body: JSON.stringify({ key, value, is_build_time: isBuildTime }),
  });
}

export async function deleteEnvVar(appUuid: string, envUuid: string): Promise<void> {
  await request(`/applications/${appUuid}/envs/${envUuid}`, { method: 'DELETE' });
}

export async function updateEnvVar(appUuid: string, envUuid: string, data: { key?: string; value?: string; is_build_time?: boolean }): Promise<void> {
  await request(`/applications/${appUuid}/envs/${envUuid}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// --- Servers ---

export interface CoolifyServer {
  uuid: string;
  name: string;
  ip: string;
}

let cachedServerUuid: string | null = null;

export async function getServerUuid(): Promise<string> {
  if (cachedServerUuid) return cachedServerUuid;
  const servers = await request<CoolifyServer[]>('/servers');
  const server = servers[0];
  if (!server) throw new Error('No servers found in Coolify');
  cachedServerUuid = server.uuid;
  return server.uuid;
}
