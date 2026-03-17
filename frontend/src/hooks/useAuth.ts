import { useState, useEffect, useCallback } from 'react';
import type { User } from '@devportal/shared';
import { api } from '../api/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [oidcAvailable, setOidcAvailable] = useState(false);

  useEffect(() => {
    // Check session (cookie-based) or providers
    Promise.all([
      api.me().then(({ user }) => setUser(user)).catch(() => {}),
      api.getProviders().then(({ oidc }) => setOidcAvailable(oidc)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const loginWithOidc = useCallback(() => {
    // Redirect to backend OIDC login endpoint
    window.location.href = '/api/auth/login';
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  return { user, loading, oidcAvailable, loginWithOidc, logout };
}
