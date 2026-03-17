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

export const api = {
  login(email: string, password: string) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  me() {
    return request<{ user: AuthResponse['user'] }>('/auth/me');
  },

  health() {
    return request<{ status: string }>('/health');
  },
};
