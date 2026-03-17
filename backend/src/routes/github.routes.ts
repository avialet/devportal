import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import * as github from '../services/github.service.js';
import { queryOne, runQuery } from '../db/database.js';

const router = Router();
router.use(authMiddleware);

function getUserToken(req: AuthRequest): string | null {
  const row = queryOne<{ github_token: string | null }>(
    'SELECT github_token FROM users WHERE id = ?',
    [req.user!.id]
  );
  return row?.github_token ?? null;
}

/**
 * Save GitHub token to user profile
 */
router.put('/token', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: 'bad_request', message: 'Token requis' });
      return;
    }

    // Validate the token
    const validation = await github.validateToken(token);
    if (!validation.valid) {
      res.status(400).json({ error: 'invalid_token', message: `Token invalide: ${validation.error}` });
      return;
    }

    runQuery('UPDATE users SET github_token = ? WHERE id = ?', [token, req.user!.id]);
    res.json({ status: 'saved', login: validation.login });
  } catch (err: any) {
    console.error('Error saving GitHub token:', err);
    res.status(500).json({ error: 'error', message: err.message });
  }
});

/**
 * Remove GitHub token
 */
router.delete('/token', async (req: AuthRequest, res: Response): Promise<void> => {
  runQuery('UPDATE users SET github_token = NULL WHERE id = ?', [req.user!.id]);
  res.json({ status: 'removed' });
});

/**
 * Check if user has a GitHub token configured
 */
router.get('/status', async (req: AuthRequest, res: Response): Promise<void> => {
  const token = getUserToken(req);
  if (!token) {
    res.json({ configured: false });
    return;
  }
  try {
    const user = await github.getUser(token);
    res.json({ configured: true, login: user.login, avatarUrl: user.avatar_url });
  } catch {
    res.json({ configured: false, error: 'Token invalide' });
  }
});

/**
 * List orgs + user account (for repo owner selection)
 */
router.get('/orgs', async (req: AuthRequest, res: Response): Promise<void> => {
  const token = getUserToken(req);
  if (!token) {
    res.status(400).json({ error: 'no_token', message: 'Pas de token GitHub configure' });
    return;
  }
  try {
    const [orgs, user] = await Promise.all([
      github.listOrgs(token),
      github.getUser(token),
    ]);
    res.json({
      user: { login: user.login, avatarUrl: user.avatar_url },
      orgs: orgs.map(o => ({ login: o.login, avatarUrl: o.avatar_url, description: o.description })),
    });
  } catch (err: any) {
    console.error('Error listing GitHub orgs:', err);
    res.status(502).json({ error: 'github_error', message: err.message });
  }
});

/**
 * List repos for an org or the user
 */
router.get('/repos', async (req: AuthRequest, res: Response): Promise<void> => {
  const token = getUserToken(req);
  if (!token) {
    res.status(400).json({ error: 'no_token', message: 'Pas de token GitHub configure' });
    return;
  }
  try {
    const org = req.query.org as string | undefined;
    const repos = await github.listRepos(token, org);
    res.json(repos.map(r => ({
      fullName: r.full_name,
      htmlUrl: r.html_url,
      name: r.name,
      isPrivate: r.private,
      defaultBranch: r.default_branch,
      description: r.description,
      owner: r.owner.login,
    })));
  } catch (err: any) {
    console.error('Error listing GitHub repos:', err);
    res.status(502).json({ error: 'github_error', message: err.message });
  }
});

/**
 * Create a new repo with dev + staging + main branches
 */
router.post('/repos', async (req: AuthRequest, res: Response): Promise<void> => {
  const token = getUserToken(req);
  if (!token) {
    res.status(400).json({ error: 'no_token', message: 'Pas de token GitHub configure' });
    return;
  }
  try {
    const { name, org, description, isPrivate } = req.body;
    if (!name) {
      res.status(400).json({ error: 'bad_request', message: 'Nom du repo requis' });
      return;
    }

    const repo = await github.createRepoWithBranches(token, name, { org, description, isPrivate });
    res.json({
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      name: repo.name,
      owner: repo.owner.login,
      defaultBranch: repo.default_branch,
    });
  } catch (err: any) {
    console.error('Error creating GitHub repo:', err);
    res.status(502).json({ error: 'github_error', message: err.message });
  }
});

export default router;
