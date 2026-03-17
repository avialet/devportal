import type { AuthResponse, ApiError } from '@devportal/shared';

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('devportal_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

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
  environments: string[];
  apps: { env: string; uuid: string; fqdn: string | null; status: string }[];
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

export interface ProjectDetailResponse {
  uuid: string;
  name: string;
  description: string | null;
  githubUrl: string | null;
  portalManaged: boolean;
  monitors: { development: number | null; staging: number | null; production: number | null } | null;
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
  getAppLogs(appUuid: string) {
    return request<{ logs: string }>(`/apps/${appUuid}/logs`);
  },

  // Monitors
  getMonitors() {
    return request<MonitorsResponse>('/monitors');
  },
};

export interface MonitorInfo {
  id: number;
  name: string;
  status: 'up' | 'down' | 'pending';
  ping: number | null;
}

export interface MonitorsResponse {
  connected: boolean;
  monitors: MonitorInfo[];
}
