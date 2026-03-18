import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config.js';
import { queryOne, runQuery, logActivity } from '../db/database.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { getOidcConfig, buildLoginUrl, handleCallback, mapGroupsToRole, isOidcConfigured, getEndSessionUrl } from '../services/oidc.service.js';
import type { User } from '@devportal/shared';

interface DbUser {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  oidc_sub: string | null;
  created_at: string;
}

const router = Router();

// Legacy email/password login (kept for transition)
router.post('/login', async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'bad_request', message: 'Email et mot de passe requis' });
    return;
  }

  const row = queryOne<DbUser>('SELECT * FROM users WHERE email = ?', [email]);
  if (!row) {
    res.status(401).json({ error: 'unauthorized', message: 'Identifiants invalides' });
    return;
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'unauthorized', message: 'Identifiants invalides' });
    return;
  }

  const user: User = {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role as 'admin' | 'developer',
    createdAt: row.created_at,
  };

  const token = jwt.sign(user, config.jwtSecret, { expiresIn: '24h' });
  res.json({ token, user });
});

// OIDC: redirect to Authentik
router.get('/login', async (_req: AuthRequest, res: Response): Promise<void> => {
  if (!isOidcConfigured()) {
    res.status(501).json({ error: 'OIDC not configured' });
    return;
  }

  try {
    await getOidcConfig();
    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(32).toString('hex');

    _req.session.oidcState = state;
    _req.session.oidcNonce = nonce;

    const url = buildLoginUrl(state, nonce);
    // Force session save before redirect to ensure cookie is set
    _req.session.save(() => {
      res.redirect(url);
    });
  } catch (err) {
    console.error('OIDC login error:', err);
    res.status(500).json({ error: 'OIDC login failed' });
  }
});

// OIDC: callback from Authentik
router.get('/callback', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const state = req.session.oidcState;
    const nonce = req.session.oidcNonce;
    if (!state || !nonce) {
      res.status(400).json({ error: 'Missing OIDC session state' });
      return;
    }

    // Build the full callback URL as received by the browser
    const callbackUrl = new URL(`${config.oidcRedirectUri}?${new URLSearchParams(req.query as Record<string, string>).toString()}`);

    const userInfo = await handleCallback(callbackUrl, state, nonce);
    const role = mapGroupsToRole(userInfo.groups);

    // Clean up OIDC session data
    delete req.session.oidcState;
    delete req.session.oidcNonce;

    // Find or create user
    let dbUser = queryOne<DbUser>('SELECT * FROM users WHERE oidc_sub = ?', [userInfo.sub]);

    if (!dbUser) {
      // Try matching by email (migration of existing local user)
      dbUser = queryOne<DbUser>('SELECT * FROM users WHERE email = ? AND oidc_sub IS NULL', [userInfo.email]);
      if (dbUser) {
        // Link existing user to OIDC
        runQuery('UPDATE users SET oidc_sub = ?, display_name = ?, role = ? WHERE id = ?', [userInfo.sub, userInfo.name, role, dbUser.id]);
        dbUser.oidc_sub = userInfo.sub;
        dbUser.display_name = userInfo.name;
        dbUser.role = role;
      } else {
        // Create new user
        runQuery(
          'INSERT INTO users (email, password_hash, display_name, role, oidc_sub) VALUES (?, ?, ?, ?, ?)',
          [userInfo.email, '', userInfo.name, role, userInfo.sub]
        );
        dbUser = queryOne<DbUser>('SELECT * FROM users WHERE oidc_sub = ?', [userInfo.sub]);
      }
    } else {
      // Update role and display name from Authentik groups
      if (dbUser.role !== role || dbUser.display_name !== userInfo.name) {
        runQuery('UPDATE users SET display_name = ?, role = ? WHERE id = ?', [userInfo.name, role, dbUser.id]);
        dbUser.display_name = userInfo.name;
        dbUser.role = role;
      }
    }

    if (!dbUser) {
      res.status(500).json({ error: 'Failed to create user' });
      return;
    }

    // Store user in session
    const user: User = {
      id: dbUser.id,
      email: dbUser.email,
      displayName: dbUser.display_name,
      role: dbUser.role as 'admin' | 'developer',
      createdAt: dbUser.created_at,
    };
    req.session.user = user;
    req.session.idToken = userInfo.idToken;
    logActivity(user.id, null, 'login', user.email);

    // Redirect to frontend
    res.redirect(config.portalUrl);
  } catch (err) {
    console.error('OIDC callback error:', err);
    res.redirect(`${config.portalUrl}/login?error=auth_failed`);
  }
});

// Logout — destroy session + return Authentik end_session URL if OIDC
router.post('/logout', async (req: AuthRequest, res: Response): Promise<void> => {
  const idToken = req.session.idToken;
  let logoutUrl: string | null = null;

  if (isOidcConfigured()) {
    // Ensure OIDC config is loaded (may be null after server restart)
    try {
      await getOidcConfig();
    } catch { /* ignore */ }
    logoutUrl = getEndSessionUrl(idToken);
  }

  req.session.destroy(() => {
    res.json({ ok: true, logoutUrl });
  });
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user info
 *     responses:
 *       200:
 *         description: Current authenticated user
 */
router.get('/me', authMiddleware, (req: AuthRequest, res: Response): void => {
  res.json({ user: req.user });
});

// Check if OIDC is available
router.get('/providers', (_req: AuthRequest, res: Response): void => {
  res.json({ oidc: isOidcConfigured() });
});

// Update profile (display_name + optional password change)
router.put('/profile', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }
  const { displayName, currentPassword, newPassword } = req.body;

  if (newPassword) {
    const dbUser = queryOne<DbUser>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!dbUser?.password_hash) {
      res.status(400).json({ error: 'bad_request', message: 'Changement de mot de passe non disponible' });
      return;
    }
    const valid = await bcrypt.compare(currentPassword ?? '', dbUser.password_hash);
    if (!valid) {
      res.status(400).json({ error: 'bad_request', message: 'Mot de passe actuel incorrect' });
      return;
    }
    const hash = await bcrypt.hash(newPassword, 10);
    runQuery('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
  }

  if (displayName?.trim()) {
    runQuery('UPDATE users SET display_name = ? WHERE id = ?', [displayName.trim(), userId]);
    if (req.session?.user) {
      req.session.user = { ...req.session.user, displayName: displayName.trim() };
    }
  }

  const updated = queryOne<DbUser>('SELECT * FROM users WHERE id = ?', [userId]);
  res.json({
    user: {
      id: updated!.id,
      email: updated!.email,
      displayName: updated!.display_name,
      role: updated!.role,
      createdAt: updated!.created_at,
    },
  });
});

export default router;
