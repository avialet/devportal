import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';
import { queryAll, runQuery } from '../db/database.js';

interface DbUser {
  id: number;
  email: string;
  display_name: string;
  role: string;
  created_at: string;
}

const router = Router();

router.use(authMiddleware);

// List all users (admin only)
router.get('/', adminOnly, (_req: AuthRequest, res: Response): void => {
  const users = queryAll<DbUser>('SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at DESC');
  res.json(users.map(u => ({
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    createdAt: u.created_at,
  })));
});

// Create user (admin only)
router.post('/', adminOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, displayName, password, role } = req.body;
  if (!email || !displayName || !password) {
    res.status(400).json({ error: 'bad_request', message: 'email, displayName et password requis' });
    return;
  }

  const validRole = role === 'admin' ? 'admin' : 'developer';
  const hash = await bcrypt.hash(password, 10);

  try {
    runQuery(
      'INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
      [email, hash, displayName, validRole]
    );
    res.json({ status: 'created' });
  } catch (err) {
    res.status(409).json({ error: 'conflict', message: 'Cet email existe deja' });
  }
});

// Update user role (admin only)
router.patch('/:id/role', adminOnly, (req: AuthRequest, res: Response): void => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { role } = req.body;
  if (!role || !['admin', 'developer'].includes(role)) {
    res.status(400).json({ error: 'bad_request', message: 'role doit etre admin ou developer' });
    return;
  }
  runQuery('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  res.json({ status: 'updated' });
});

// Delete user (admin only)
router.delete('/:id', adminOnly, (req: AuthRequest, res: Response): void => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: 'bad_request', message: 'Impossible de se supprimer soi-meme' });
    return;
  }
  runQuery('DELETE FROM users WHERE id = ?', [id]);
  res.json({ status: 'deleted' });
});

export default router;
