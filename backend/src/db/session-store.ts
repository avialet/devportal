import session from 'express-session';
import { runQuery, queryOne } from './database.js';

interface SessionRow {
  sid: string;
  sess: string;
  expired_at: number;
}

const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000; // 24h
const CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes

export class SqliteSessionStore extends session.Store {
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    super();
    // Periodic cleanup of expired sessions
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL);
    // Run initial cleanup
    this.cleanup();
  }

  get(sid: string, callback: (err?: Error | null, session?: session.SessionData | null) => void): void {
    try {
      const row = queryOne<SessionRow>(
        'SELECT sess FROM sessions WHERE sid = ? AND expired_at > ?',
        [sid, Date.now()]
      );
      if (!row) {
        return callback(null, null);
      }
      const sess = JSON.parse(row.sess) as session.SessionData;
      callback(null, sess);
    } catch (err) {
      callback(err as Error);
    }
  }

  set(sid: string, sess: session.SessionData, callback?: (err?: Error | null) => void): void {
    try {
      const maxAge = sess.cookie?.maxAge ?? DEFAULT_MAX_AGE;
      const expiredAt = Date.now() + maxAge;
      runQuery(
        'REPLACE INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)',
        [sid, JSON.stringify(sess), expiredAt]
      );
      callback?.(null);
    } catch (err) {
      callback?.(err as Error);
    }
  }

  destroy(sid: string, callback?: (err?: Error | null) => void): void {
    try {
      runQuery('DELETE FROM sessions WHERE sid = ?', [sid]);
      callback?.(null);
    } catch (err) {
      callback?.(err as Error);
    }
  }

  touch(sid: string, sess: session.SessionData, callback?: (err?: Error | null) => void): void {
    try {
      const maxAge = sess.cookie?.maxAge ?? DEFAULT_MAX_AGE;
      const expiredAt = Date.now() + maxAge;
      runQuery(
        'UPDATE sessions SET expired_at = ? WHERE sid = ?',
        [expiredAt, sid]
      );
      callback?.(null);
    } catch (err) {
      callback?.(err as Error);
    }
  }

  private cleanup(): void {
    try {
      runQuery('DELETE FROM sessions WHERE expired_at < ?', [Date.now()]);
    } catch {
      // Silently ignore cleanup errors
    }
  }

  stopCleanup(): void {
    clearInterval(this.cleanupTimer);
  }
}
