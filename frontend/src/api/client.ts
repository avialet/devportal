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
  logout() {
    return request<{ ok: boolean }>('/auth/logout', { method: 'POST' });
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
  getAppLogs(appUuid: string) {
    return request<{ logs: string }>(`/apps/${appUuid}/logs`);
  },

  // Monitors
  getMonitors() {
    return request<MonitorsResponse>('/monitors');
  },

  // Users
  listUsers() {
    return request<UserInfo[]>('/users');
  },
  createUser(data: { email: string; displayName: string; password: string; role?: string }) {
    return request<{ status: string }>('/users', { method: 'POST', body: JSON.stringify(data) });
  },
  updateUserRole(id: number, role: string) {
    return request<{ status: string }>(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
  },
  deleteUser(id: number) {
    return request<{ status: string }>(`/users/${id}`, { method: 'DELETE' });
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

export interface UserInfo {
  id: number;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
}
