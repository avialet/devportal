import express from 'express';
import cors from 'cors';
import session from 'express-session';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';
import { config } from './config.js';
import { initDatabase } from './db/database.js';
import { SqliteSessionStore } from './db/session-store.js';
import authRoutes from './routes/auth.routes.js';
import projectRoutes from './routes/project.routes.js';
import appRoutes from './routes/app.routes.js';
import monitorRoutes from './routes/monitor.routes.js';
import securityRoutes from './routes/security.routes.js';
import statsRoutes from './routes/stats.routes.js';
import activityRoutes from './routes/activity.routes.js';
import healthRoutes from './routes/health.routes.js';
import { initMonitoring } from './services/monitoring.service.js';
import { startAutoBackup } from './services/backup.service.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// Trust reverse proxy (Traefik) for secure cookies behind HTTPS
app.set('trust proxy', 1);

app.use(cors({
  origin: config.portalUrl,
  credentials: true,
}));
app.use(express.json());

async function main() {
  await initDatabase();

  // Session middleware (for OIDC) - must be after DB init for SQLite store
  app.use(session({
    store: new SqliteSessionStore(),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.portalUrl.startsWith('https'),
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24h
      sameSite: 'lax',
    },
  }));

  // Swagger API docs
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customCss: '.swagger-ui .topbar { display: none }' }));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

  // API routes (must be after session middleware)
  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/apps', appRoutes);
  app.use('/api/monitors', monitorRoutes);
  app.use('/api/security', securityRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/activity', activityRoutes);

  app.use('/api/health', healthRoutes);

  // Serve frontend in production
  const frontendDist = join(__dirname, '../../frontend/dist');
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => {
      res.sendFile(join(frontendDist, 'index.html'));
    });
  }

  await initMonitoring();
  startAutoBackup();
  app.listen(config.port, () => {
    console.log(`DevPortal backend running on port ${config.port}`);
  });
}

main().catch(console.error);
