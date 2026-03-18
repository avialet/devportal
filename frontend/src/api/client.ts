import type { AuthResponse, ApiError, SecurityScan, ScanTool, ScanProgressEvent } from '@devportal/shared';

const BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' });

  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({
      error: 'unknown',
      message: `HTTP ${res.status}`,
    }));
    throw err;
  }

  return res.json();
}

// --- Project types from API ---
export interface ProjectSummary {
  uuid: string;
  name: string;
  description: string | null;
  githubUrl: string | null;
  portalManaged: boolean;
  portalId: number | null;
  environments: string[];
  apps: { env: string; uuid: string; fqdn: string | null; status: string }[];
  monitorStatus: Record<string, { status: 'up' | 'down' | 'pending'; uptime: number | null }>;
  createdAt: string | null;
}

export interface ProjectDetailEnv {
  name: string;
  apps: {
    uuid: string;
    name: string;
    fqdn: string | null;
    status: string;
    gitRepository: string;
    gitBranch: string;
    buildPack: string;
  }[];
}

export interface ProjectMonitorInfo {
  id: number;
  name: string;
  url: string;
  environment: string | null;
  status: 'up' | 'down' | 'pending';
  ping: number | null;
}

export interface ProjectDetailResponse {
  uuid: string;
  name: string;
  description: string | null;
  githubUrl: string | null;
  portalManaged: boolean;
  monitors: ProjectMonitorInfo[];
  environments: ProjectDetailEnv[];
}

export interface Deployment {
  id: number;
  uuid: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  commit: string | null;
  logs: string;
}

export const api = {
  // Auth
  login(email: string, password: string) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  me() {
    return request<{ user: AuthResponse['user'] }>('/auth/me');
  },
  logout() {
    return request<{ ok: boolean; logoutUrl?: string }>('/auth/logout', { method: 'POST' });
  },
  getProviders() {
    return request<{ oidc: boolean }>('/auth/providers');
  },

  // Projects
  listProjects() {
    return request<ProjectSummary[]>('/projects');
  },
  getProject(uuid: string) {
    return request<ProjectDetailResponse>(`/projects/${uuid}`);
  },

  // Apps
  deployApp(uuid: string) {
    return request<{ deployment_uuid: string }>(`/apps/${uuid}/deploy`, { method: 'POST' });
  },
  stopApp(uuid: string) {
    return request<{ status: string }>(`/apps/${uuid}/stop`, { method: 'POST' });
  },
  restartApp(uuid: string) {
    return request<{ deployment_uuid: string }>(`/apps/${uuid}/restart`, { method: 'POST' });
  },
  getDeployments(appUuid: string) {
    return request<Deployment[]>(`/apps/${appUuid}/deployments`);
  },
  getDeployment(deploymentUuid: string) {
    return request<Deployment>(`/apps/deployments/${deploymentUuid}`);
  },
  rollbackApp(appUuid: string, deploymentUuid: string) {
    return request<{ status: string; deployment_uuid: string; commit: string }>(`/apps/${appUuid}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ deploymentUuid }),
    });
  },
  unpinApp(appUuid: string) {
    return request<{ status: string }>(`/apps/${appUuid}/unpin`, { method: 'POST' });
  },
  getPipeline(deploymentUuid: string) {
    return request<{ deploymentUuid: string; status: string; commit: string | null; stages: { name: string; status: string }[] }>(`/apps/deployments/${deploymentUuid}/pipeline`);
  },
  getAppLogs(appUuid: string, since?: number) {
    const qs = since ? `?since=${since}` : '';
    return request<{ logs: string }>(`/apps/${appUuid}/logs${qs}`);
  },

  // Dashboard
  getStats() {
    return request<DashboardStats>('/stats');
  },
  getActivity() {
    return request<ActivityItem[]>('/activity');
  },

  // Env comparison
  getEnvCompare(projectUuid: string) {
    return request<EnvCompareResponse>(`/projects/${projectUuid}/env-compare`);
  },

  // Projects (delete)
  deleteProject(uuid: string) {
    return request<{ status: string }>(`/projects/${uuid}`, { method: 'DELETE' });
  },
  fixGitAuth(uuid: string) {
    return request<{ status: string; patched: string[] }>(`/projects/${uuid}/fix-git-auth`, { method: 'POST' });
  },

  // Monitors
  getMonitors() {
    return request<MonitorsResponse>('/monitors');
  },
  createMonitor(data: { name: string; url: string; intervalSeconds?: number; projectId?: number; environment?: string }) {
    return request<{ id: number; status: string }>('/monitors', { method: 'POST', body: JSON.stringify(data) });
  },
  deleteMonitor(id: number) {
    return request<{ status: string }>(`/monitors/${id}`, { method: 'DELETE' });
  },
  createProjectMonitors(projectUuid: string) {
    return request<{ status: string; monitors: { environment: string; id: number; url: string }[] }>(`/projects/${projectUuid}/monitors`, { method: 'POST', body: JSON.stringify({}) });
  },

  // Security scans
  listScans(projectId?: number) {
    const qs = projectId ? `?projectId=${projectId}` : '';
    return request<{ scans: SecurityScan[]; running: number }>(`/security/scans${qs}`);
  },
  getScan(id: string) {
    return request<SecurityScan>(`/security/scans/${id}`);
  },
  deleteScan(id: string) {
    return request<{ status: string }>(`/security/scans/${id}`, { method: 'DELETE' });
  },
  startScan(targetUrl: string, tool: ScanTool, projectId?: number): EventSource {
    // SSE via fetch — we use a custom approach since EventSource doesn't support POST
    // Instead, we POST and read the stream manually
    // Return a fake EventSource-like interface
    const body = JSON.stringify({ targetUrl, tool, projectId });
    const es = new EventTarget();
    fetch(`${BASE}/security/scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body,
    }).then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              es.dispatchEvent(new CustomEvent('message', { detail: data }));
            } catch { /* skip */ }
          }
        }
      }
      es.dispatchEvent(new CustomEvent('done'));
    }).catch((err) => {
      es.dispatchEvent(new CustomEvent('error', { detail: err }));
    });
    return es as unknown as EventSource;
  },
  getScanReportUrl(id: string, format?: string) {
    const qs = format ? `?format=${format}` : '';
    return `${BASE}/security/scans/${id}/report${qs}`;
  },

  // GitHub
  getGitHubStatus() {
    return request<GitHubStatus>('/github/status');
  },
  saveGitHubToken(token: string) {
    return request<{ status: string; login: string }>('/github/token', { method: 'PUT', body: JSON.stringify({ token }) });
  },
  removeGitHubToken() {
    return request<{ status: string }>('/github/token', { method: 'DELETE' });
  },
  getGitHubOrgs() {
    return request<GitHubOrgsResponse>('/github/orgs');
  },
  getGitHubRepos(org?: string) {
    const qs = org ? `?org=${org}` : '';
    return request<GitHubRepoInfo[]>(`/github/repos${qs}`);
  },
  createGitHubRepo(data: { name: string; org?: string; description?: string; isPrivate?: boolean }) {
    return request<GitHubRepoInfo>('/github/repos', { method: 'POST', body: JSON.stringify(data) });
  },

  // Profile
  updateProfile(data: { displayName?: string; currentPassword?: string; newPassword?: string }) {
    return request<{ user: { id: number; email: string; displayName: string; role: string } }>('/auth/profile', {
      method: 'PUT', body: JSON.stringify(data),
    });
  },

  // Config (alert webhooks)
  getConfig() {
    return request<Record<string, string>>('/config');
  },
  updateConfig(data: Record<string, string>) {
    return request<{ status: string }>('/config', { method: 'PUT', body: JSON.stringify(data) });
  },
  testWebhook(url: string, type: string) {
    return request<{ status: string }>('/config/test-webhook', {
      method: 'POST', body: JSON.stringify({ url, type }),
    });
  },

  // GitHub Actions workflow
  getProjectWorkflow(uuid: string) {
    return request<{ yaml: string; coolifyApiUrl: string }>(`/projects/${uuid}/workflow`);
  },

  // Health
  getHealth() {
    return request<HealthResponse>('/health');
  },
  getBackups() {
    return request<{ backups: BackupInfo[] }>('/health/backups');
  },
  createBackup() {
    return request<{ status: string; path: string; size: number }>('/health/backups', { method: 'POST' });
  },
};

export interface EnvCompareResponse {
  environments: string[];
  comparison: { key: string; values: Record<string, string | null>; hasDiff: boolean }[];
}

export interface DashboardStats {
  projects: number;
  services: { running: number; stopped: number; deploying: number; total: number };
  monitors: { up: number; down: number; total: number };
  recentScans: { id: string; targetUrl: string; tool: string; status: string; findings: any; createdAt: string }[];
}

export interface ActivityItem {
  id: number;
  action: string;
  details: string | null;
  userName: string;
  createdAt: string;
}

export interface MonitorInfo {
  id: number;
  name: string;
  url: string;
  status: 'up' | 'down' | 'pending';
  ping: number | null;
  environment: string | null;
  projectId: number | null;
}

export interface MonitorsResponse {
  connected: boolean;
  monitors: MonitorInfo[];
}

export interface HealthCheck {
  status: string;
  latency?: number;
  error?: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  timestamp: string;
  checks: Record<string, HealthCheck>;
}

export interface BackupInfo {
  name: string;
  size: number;
  createdAt: string;
}

export interface GitHubStatus {
  configured: boolean;
  login?: string;
  avatarUrl?: string;
  error?: string;
}

export interface GitHubOrgsResponse {
  user: { login: string; avatarUrl: string };
  orgs: { login: string; avatarUrl: string; description: string | null }[];
}

export interface GitHubRepoInfo {
  fullName: string;
  htmlUrl: string;
  name: string;
  isPrivate: boolean;
  defaultBranch: string;
  description: string | null;
  owner: string;
}

