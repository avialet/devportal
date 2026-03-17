function env(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function envRequired(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  port: parseInt(env('PORT', '3000')),
  jwtSecret: env('PORTAL_JWT_SECRET', 'dev-secret-change-me'),
  coolifyApiUrl: env('COOLIFY_API_URL', 'http://localhost:8000/api/v1'),
  coolifyApiToken: isProduction ? envRequired('COOLIFY_API_TOKEN') : env('COOLIFY_API_TOKEN', 'dev-token'),
  uptimeKumaUrl: env('UPTIME_KUMA_URL', 'http://localhost:3001'),
  uptimeKumaUser: env('UPTIME_KUMA_USERNAME', ''),
  uptimeKumaPass: env('UPTIME_KUMA_PASSWORD', ''),
  adminEmail: env('PORTAL_ADMIN_EMAIL', 'admin@portal.local'),
  adminPassword: env('PORTAL_ADMIN_PASSWORD', 'admin'),
  dataDir: env('DATA_DIR', './data'),
} as const;
