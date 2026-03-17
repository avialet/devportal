import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import bcrypt from 'bcryptjs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'developer',
  oidc_sub TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS portal_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  coolify_project_uuid TEXT UNIQUE NOT NULL,
  github_url TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  dev_app_uuid TEXT,
  staging_app_uuid TEXT,
  prod_app_uuid TEXT,
  dev_monitor_id INTEGER,
  staging_monitor_id INTEGER,
  prod_monitor_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  project_id INTEGER REFERENCES portal_projects(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS security_scans (
  id TEXT PRIMARY KEY,
  project_id INTEGER REFERENCES portal_projects(id),
  target_url TEXT NOT NULL,
  tool TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at DATETIME,
  finished_at DATETIME,
  report_path TEXT,
  findings_summary TEXT,
  error TEXT,
  triggered_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_scan_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES portal_projects(id),
  environment TEXT NOT NULL,
  tool TEXT NOT NULL DEFAULT 'nuclei',
  enabled BOOLEAN NOT NULL DEFAULT 0,
  UNIQUE(project_id, environment)
);

CREATE TABLE IF NOT EXISTS project_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES portal_projects(id),
  user_id INTEGER REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'viewer',
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expired_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL DEFAULT 60,
  project_id INTEGER REFERENCES portal_projects(id),
  environment TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monitor_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL REFERENCES monitors(id),
  status_code INTEGER NOT NULL DEFAULT 0,
  response_time_ms INTEGER,
  error TEXT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

let db: Database;

function getDbPath(): string {
  const dir = config.dataDir;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'portal.db');
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();
  const dbPath = getDbPath();

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  for (const stmt of SCHEMA.split(';').filter(s => s.trim())) {
    db.run(stmt);
  }

  // Migration: add oidc_sub column if missing (existing DBs)
  try {
    db.run('SELECT oidc_sub FROM users LIMIT 1');
  } catch {
    db.run('ALTER TABLE users ADD COLUMN oidc_sub TEXT UNIQUE');
  }

  // Migration: make password_hash optional for OIDC users
  // (handled by DEFAULT '' in schema for new DBs)

  saveDb();

  await seedAdmin();
}

function saveDb(): void {
  const data = db.export();
  writeFileSync(getDbPath(), Buffer.from(data));
}

async function seedAdmin(): Promise<void> {
  const row = db.exec("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (row.length > 0 && row[0].values.length > 0) return;

  const hash = await bcrypt.hash(config.adminPassword, 10);
  db.run(
    'INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
    [config.adminEmail, hash, 'Admin', 'admin']
  );
  saveDb();
  console.log(`Admin user created: ${config.adminEmail}`);
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function runQuery(sql: string, params: unknown[] = []): void {
  db.run(sql, params as (string | number | null)[]);
  saveDb();
}

export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params as (string | number | null)[]);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const results = queryAll<T>(sql, params);
  return results[0];
}

export function logActivity(userId: number | null, projectId: number | null, action: string, details?: string): void {
  runQuery(
    'INSERT INTO activity_log (user_id, project_id, action, details) VALUES (?, ?, ?, ?)',
    [userId, projectId, action, details ?? null]
  );
}
