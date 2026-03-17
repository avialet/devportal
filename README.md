# DevPortal - plan.net

Portail developpeur interne pour gerer les projets deployes sur Coolify (PaaS) avec monitoring Uptime Kuma.

## Architecture

```
Developpeur (navigateur)
        |
        v
   Authentik ──── authentik.51.254.131.12.nip.io
   (Identity Provider - OAuth2/OIDC)
      |              |
      v              v
  DevPortal       Coolify
  (OAuth2)       (OAuth2 natif)

  DevPortal React --- portal.51.254.131.12.nip.io
        | API calls (session cookie)
        v
  Backend Node.js (Express)
      |-- Authentik OIDC (openid-client v6)
      |-- Coolify API (http://coolify:8080/api/v1)
      |-- Uptime Kuma (http://uptime-kuma:3001 via Socket.IO)
      |-- SQLite (donnees locales)
```

### Stack technique

| Composant | Technologie | Raison |
|-----------|-------------|--------|
| Frontend | React + Vite + TypeScript + Tailwind | Stack moderne, rapide a dev |
| Backend | Express + TypeScript | Simple, proxy API suffisant |
| BDD | SQLite (sql.js WASM) | Zero ops, donnees minimales |
| Auth | Authentik SSO (OIDC) + session cookie | Auth centralisee, memes credentials DevPortal + Coolify |
| Monitoring | Uptime Kuma via Socket.IO | Pas de REST API, Socket.IO natif |
| Deploiement | Dockerfile multi-stage sur Coolify | Self-hosted, meme workflow que les autres projets |
| Reseau | Docker network `coolify` | Communication container-to-container |

### Structure du monorepo

```
portal/
├── package.json              # npm workspaces
├── Dockerfile                # Multi-stage build (node:20-alpine)
├── tsconfig.base.json        # Config TypeScript partagee
├── .env.example              # Variables d'environnement
├── packages/shared/src/      # Types + constantes partages
│   ├── types.ts
│   ├── constants.ts
│   └── index.ts
├── backend/src/
│   ├── index.ts              # Express entry point
│   ├── config.ts             # Lecture env vars
│   ├── middleware/auth.ts     # Hybrid auth: session cookie (OIDC) + JWT fallback
│   ├── db/database.ts        # SQLite (sql.js WASM), schema inline
│   ├── routes/
│   │   ├── auth.routes.ts    # OIDC login/callback/logout + legacy POST /login
│   │   ├── project.routes.ts # CRUD projets (via Coolify API)
│   │   ├── app.routes.ts     # Deploy/stop/restart, logs, env vars
│   │   ├── monitor.routes.ts # Statuts Uptime Kuma
│   │   └── user.routes.ts    # Gestion utilisateurs (admin only)
│   └── services/
│       ├── coolify.service.ts         # Client HTTP Coolify API
│       ├── uptimekuma.service.ts      # Client Socket.IO Uptime Kuma
│       ├── project-wizard.service.ts  # Orchestration creation projet
│       └── oidc.service.ts            # OIDC discovery, login URL, callback, group→role mapping
└── frontend/src/
    ├── main.tsx
    ├── App.tsx               # Routes + auth guard
    ├── api/client.ts         # Fetch wrapper avec session cookie
    ├── hooks/
    │   ├── useAuth.ts        # Gestion session OIDC (cookie-based)
    │   └── useMonitors.ts    # Polling statuts monitoring
    ├── pages/
    │   ├── Login.tsx
    │   ├── Dashboard.tsx     # Liste projets avec statuts
    │   ├── NewProject.tsx    # Wizard creation (SSE progress)
    │   ├── ProjectDetail.tsx # 3 envs, deploy/logs/env vars
    │   ├── Monitoring.tsx    # Table monitors Uptime Kuma
    │   └── Users.tsx         # Admin: gestion utilisateurs
    └── components/
        ├── Layout.tsx        # Sidebar avec logo plan.net
        ├── MonitorBadge.tsx  # Badge UP/DOWN/PENDING
        └── EnvVarEditor.tsx  # Editeur variables d'env par app
```

## Fonctionnalite cle : Creation automatique de projet

Le developpeur entre **nom** + **URL GitHub** → le backend execute automatiquement :

1. Creer le projet Coolify
2. Creer les environnements dev + staging (prod existe par defaut)
3. Creer 1 application par env avec domaine automatique :
   - `dev-{nom}.51.254.131.12.nip.io`
   - `staging-{nom}.51.254.131.12.nip.io`
   - `{nom}.51.254.131.12.nip.io` (prod)
4. Creer 3 sondes Uptime Kuma
5. Sauvegarder le mapping (UUIDs + monitor IDs) en SQLite
6. Declencher le premier deploiement sur dev

La progression est streamee en temps reel via **Server-Sent Events (SSE)**.

## Variables d'environnement

| Variable | Description | Defaut |
|----------|-------------|--------|
| `PORT` | Port du serveur | `3000` |
| `NODE_ENV` | Environnement | `production` |
| `PORTAL_JWT_SECRET` | Secret JWT | requis en prod |
| `PORTAL_ADMIN_EMAIL` | Email admin initial | `admin@portal.local` |
| `PORTAL_ADMIN_PASSWORD` | Mot de passe admin initial | `admin` |
| `COOLIFY_API_URL` | URL API Coolify | `http://coolify:8080/api/v1` |
| `COOLIFY_API_TOKEN` | Token API Coolify | requis en prod |
| `UPTIME_KUMA_URL` | URL Uptime Kuma | `http://uptime-kuma:3001` |
| `UPTIME_KUMA_USERNAME` | User Uptime Kuma | - |
| `UPTIME_KUMA_PASSWORD` | Password Uptime Kuma | - |
| `DATA_DIR` | Repertoire donnees SQLite | `/app/data` |
| `OIDC_ISSUER` | URL publique du provider OIDC | - |
| `OIDC_ISSUER_INTERNAL` | URL interne (container-to-container) | - |
| `OIDC_CLIENT_ID` | Client ID OAuth2 (Authentik) | - |
| `OIDC_CLIENT_SECRET` | Client Secret OAuth2 | - |
| `OIDC_REDIRECT_URI` | Callback URL apres login | - |
| `SESSION_SECRET` | Secret pour les cookies de session | requis en prod |
| `PORTAL_URL` | URL publique du portail (pour redirects) | `http://localhost:5173` |

## Authentification centralisee (Authentik SSO)

L'authentification est centralisee via **Authentik** (Identity Provider OAuth2/OIDC), deploye sur Coolify.

- **URL Authentik** : `https://authentik.51.254.131.12.nip.io`
- **Admin Authentik** : `akadmin`
- Un seul login pour DevPortal et Coolify

### Gestion des utilisateurs

Les utilisateurs se gerent dans **Authentik Admin > Directory > Users**. Les groupes Authentik determinent les roles :

| Groupe Authentik | Role DevPortal |
|-----------------|----------------|
| `portal-admins` | admin |
| `portal-developers` | developer |

### Flow d'authentification

1. Utilisateur clique "Se connecter avec Authentik"
2. Redirect vers Authentik (OIDC authorization code flow)
3. Login sur Authentik
4. Redirect callback vers DevPortal avec code
5. Backend echange le code pour un ID token + access token
6. Extraction des claims (sub, email, name, groups)
7. Mapping groupes → role, creation/mise a jour user en DB
8. Session cookie posee, redirect vers le dashboard

### Decisions techniques

- **openid-client v6** : client OIDC moderne base sur `oauth4webapi`
- **express-session** avec MemoryStore (suffisant pour un seul container)
- **allowInsecureRequests** pour le discovery interne HTTP (container-to-container)
- **trust proxy** active pour les cookies Secure derriere Traefik
- **session.save()** force avant redirect pour garantir la persistence du state
- **Auth hybride** : session cookie (OIDC) en priorite, JWT Bearer en fallback (transition)

## Deploiement sur Coolify

Le portail est deploye sur Coolify lui-meme (self-hosted) :

- **Projet Coolify** : DevPortal (UUID: `mvhvgpsdlrfn65c9tbw3r3dw`)
- **Application** : devportal (UUID: `tu30m8ble4j9bjsbmfxkt8yx`)
- **Domaine** : `https://portal.51.254.131.12.nip.io`
- **Reseau Docker** : `coolify` (via `custom_docker_run_options`)
- **Volume persistant** : `devportal-data:/app/data` (SQLite)
- **Build** : Dockerfile multi-stage, `NODE_ENV=development` en build stage

### Decisions de deploiement

- Le Dockerfile force `ENV NODE_ENV=development` dans le stage builder pour que `npm ci` installe les devDependencies (typescript, vite). Coolify injecte `NODE_ENV=production` en build-time par defaut.
- Le stage de production utilise `npm ci --omit=dev` pour un container leger.
- Le reseau Docker `coolify` permet la communication directe avec Coolify et Uptime Kuma sans exposer de ports.

## Developpement local

```bash
# Install
npm install

# Build shared package
npm run build -w packages/shared

# Dev (2 terminaux)
npm run dev -w backend     # http://localhost:3000
npm run dev -w frontend    # http://localhost:5173 (proxy -> 3000)
```

## Roles utilisateur

- **admin** : acces complet (gestion users, tous les projets, toutes les env vars)
- **developer** : consultation projets, deploiement, logs

## API Coolify - Endpoints utilises

| Action | Methode | Endpoint |
|--------|---------|----------|
| Lister projets | GET | `/projects` |
| Detail projet | GET | `/projects/{uuid}` |
| Creer projet | POST | `/projects` |
| Creer environnement | POST | `/projects/{uuid}/environments` |
| Detail environnement | GET | `/projects/{uuid}/{env}` |
| Creer app publique | POST | `/applications/public` |
| Modifier app | PATCH | `/applications/{uuid}` |
| Deployer | POST | `/deploy` avec `{"uuid": "..."}` |
| Stopper app | POST | `/applications/{uuid}/stop` |
| Redemarrer app | POST | `/applications/{uuid}/restart` |
| Lister serveurs | GET | `/servers` |
| Env vars | GET/POST/DELETE | `/applications/{uuid}/envs` |
| Deploiements | GET | `/deployments/{uuid}` |

> Note : L'endpoint de deploy est `POST /deploy` avec le body `{"uuid": "app_uuid"}`, pas `POST /applications/{uuid}/deploy`.
