export const VPS_IP = '51.254.131.12';
export const BASE_DOMAIN = `${VPS_IP}.nip.io`;

export const ENV_NAMES = ['development', 'staging', 'production'] as const;
export type EnvName = (typeof ENV_NAMES)[number];

export function buildDomain(appName: string, env: EnvName): string {
  const slug = appName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  switch (env) {
    case 'development':
      return `dev-${slug}.${BASE_DOMAIN}`;
    case 'staging':
      return `staging-${slug}.${BASE_DOMAIN}`;
    case 'production':
      return `${slug}.${BASE_DOMAIN}`;
  }
}

export function buildFqdn(appName: string, env: EnvName): string {
  return `https://${buildDomain(appName, env)}`;
}

export const WIZARD_STEPS = [
  'Création du projet Coolify',
  'Création des environnements',
  'Déploiement app dev',
  'Déploiement app staging',
  'Déploiement app production',
  'Configuration des monitors',
  'Sauvegarde',
] as const;
