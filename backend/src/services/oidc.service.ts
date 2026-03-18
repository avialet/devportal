import * as client from 'openid-client';
import { config } from '../config.js';

let oidcConfig: client.Configuration | null = null;

export async function getOidcConfig(): Promise<client.Configuration> {
  if (oidcConfig) return oidcConfig;

  const issuerUrl = config.oidcIssuerInternal || config.oidcIssuer;
  if (!issuerUrl) throw new Error('OIDC_ISSUER not configured');

  // allowInsecureRequests needed for internal HTTP container-to-container communication
  const useHttp = issuerUrl.startsWith('http://');
  oidcConfig = await client.discovery(
    new URL(issuerUrl),
    config.oidcClientId,
    config.oidcClientSecret,
    undefined,
    useHttp ? { execute: [client.allowInsecureRequests] } : undefined,
  );

  return oidcConfig;
}

export function buildLoginUrl(state: string, nonce: string): string {
  if (!oidcConfig) throw new Error('OIDC not initialized');

  // Build authorization URL using the public issuer (browser-facing)
  const publicIssuer = config.oidcIssuer;
  const serverMeta = oidcConfig.serverMetadata();
  // Replace internal host with public host in the authorization endpoint
  let authEndpoint = serverMeta.authorization_endpoint!;
  if (config.oidcIssuerInternal && publicIssuer) {
    const internalOrigin = new URL(config.oidcIssuerInternal).origin;
    const publicOrigin = new URL(publicIssuer).origin;
    authEndpoint = authEndpoint.replace(internalOrigin, publicOrigin);
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.oidcClientId,
    redirect_uri: config.oidcRedirectUri,
    scope: 'openid email profile',
    state,
    nonce,
  });

  return `${authEndpoint}?${params.toString()}`;
}

export interface OidcUserInfo {
  sub: string;
  email: string;
  name: string;
  groups: string[];
}

export async function handleCallback(callbackUrl: URL, expectedState: string, expectedNonce: string): Promise<OidcUserInfo & { idToken?: string }> {
  if (!oidcConfig) throw new Error('OIDC not initialized');

  const tokenResponse = await client.authorizationCodeGrant(oidcConfig, callbackUrl, {
    expectedState,
    expectedNonce,
    idTokenExpected: true,
  });

  const claims = tokenResponse.claims()!;
  const accessToken = tokenResponse.access_token;
  const idToken = tokenResponse.id_token;

  // Fetch userinfo for groups (custom scope mapping in Authentik)
  const userinfo = await client.fetchUserInfo(oidcConfig, accessToken, claims.sub);

  return {
    sub: claims.sub,
    email: (userinfo.email || claims.email) as string,
    name: (userinfo.name || claims.name || claims.email) as string,
    groups: (userinfo.groups || []) as string[],
    idToken,
  };
}

export function mapGroupsToRole(groups: string[]): 'admin' | 'developer' {
  if (groups.includes('portal-admins')) return 'admin';
  return 'developer';
}

export function isOidcConfigured(): boolean {
  return !!(config.oidcIssuer && config.oidcClientId && config.oidcClientSecret);
}

export function getEndSessionUrl(idTokenHint?: string): string | null {
  if (!oidcConfig) return null;
  const meta = oidcConfig.serverMetadata();
  let endSessionEndpoint = meta.end_session_endpoint;
  if (!endSessionEndpoint) return null;

  // Replace internal host with public host for browser redirect
  if (config.oidcIssuerInternal && config.oidcIssuer) {
    const internalOrigin = new URL(config.oidcIssuerInternal).origin;
    const publicOrigin = new URL(config.oidcIssuer).origin;
    endSessionEndpoint = endSessionEndpoint.replace(internalOrigin, publicOrigin);
  }

  const params = new URLSearchParams({
    post_logout_redirect_uri: config.portalUrl,
    client_id: config.oidcClientId,
  });
  if (idTokenHint) params.set('id_token_hint', idTokenHint);

  return `${endSessionEndpoint}?${params.toString()}`;
}
