import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

const BACKUP_DIR = join(config.dataDir, 'backups');
const MAX_BACKUPS = 10;
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function ensureBackupDir(): void {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

export function createBackup(): { path: string; size: number } {
  ensureBackupDir();
  const dbPath = join(config.dataDir, 'portal.db');
  if (!existsSync(dbPath)) {
    throw new Error('Database file not found');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, `portal-${timestamp}.db`);
  copyFileSync(dbPath, backupPath);

  const stats = statSync(backupPath);

  // Cleanup old backups
  pruneOldBackups();

  return { path: backupPath, size: stats.size };
}

function pruneOldBackups(): void {
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('portal-') && f.endsWith('.db'))
    .map(f => ({
      name: f,
      path: join(BACKUP_DIR, f),
      mtime: statSync(join(BACKUP_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime); // newest first

  // Keep only MAX_BACKUPS
  for (const file of files.slice(MAX_BACKUPS)) {
    try { unlinkSync(file.path); } catch { /* ignore */ }
  }
}

export function listBackups(): { name: string; size: number; createdAt: string }[] {
  ensureBackupDir();
  return readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('portal-') && f.endsWith('.db'))
    .map(f => {
      const s = statSync(join(BACKUP_DIR, f));
      return { name: f, size: s.size, createdAt: s.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

let backupTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoBackup(): void {
  // Create initial backup on startup
  try {
    createBackup();
    console.log('[Backup] Initial backup created');
  } catch (err) {
    console.error('[Backup] Initial backup failed:', err);
  }

  // Schedule periodic backups
  backupTimer = setInterval(() => {
    try {
      const { path, size } = createBackup();
      console.log(`[Backup] Auto backup created: ${path} (${(size / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.error('[Backup] Auto backup failed:', err);
    }
  }, BACKUP_INTERVAL_MS);
}

export function stopAutoBackup(): void {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}
