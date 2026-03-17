import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { config } from './config.js';
import { initDatabase } from './db/database.js';
import authRoutes from './routes/auth.routes.js';
import projectRoutes from './routes/project.routes.js';
import appRoutes from './routes/app.routes.js';
import monitorRoutes from './routes/monitor.routes.js';
import userRoutes from './routes/user.routes.js';
import { initUptimeKuma } from './services/uptimekuma.service.js';
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

// Session middleware (for OIDC)
app.use(session({
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

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/apps', appRoutes);
app.use('/api/monitors', monitorRoutes);
app.use('/api/users', userRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Serve frontend in production
const frontendDist = join(__dirname, '../../frontend/dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

async function main() {
  await initDatabase();
  await initUptimeKuma();
  app.listen(config.port, () => {
    console.log(`DevPortal backend running on port ${config.port}`);
  });
}

main().catch(console.error);
