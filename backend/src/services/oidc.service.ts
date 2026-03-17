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

export async function handleCallback(callbackUrl: URL, expectedState: string, expectedNonce: string): Promise<OidcUserInfo> {
  if (!oidcConfig) throw new Error('OIDC not initialized');

  const tokenResponse = await client.authorizationCodeGrant(oidcConfig, callbackUrl, {
    expectedState,
    expectedNonce,
    idTokenExpected: true,
  });

  const claims = tokenResponse.claims()!;
  const accessToken = tokenResponse.access_token;

  // Fetch userinfo for groups (custom scope mapping in Authentik)
  const userinfo = await client.fetchUserInfo(oidcConfig, accessToken, claims.sub);

  return {
    sub: claims.sub,
    email: (userinfo.email || claims.email) as string,
    name: (userinfo.name || claims.name || claims.email) as string,
    groups: (userinfo.groups || []) as string[],
  };
}

export function mapGroupsToRole(groups: string[]): 'admin' | 'developer' {
  if (groups.includes('portal-admins')) return 'admin';
  return 'developer';
}

export function isOidcConfigured(): boolean {
  return !!(config.oidcIssuer && config.oidcClientId && config.oidcClientSecret);
}
