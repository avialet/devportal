import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { queryOne } from '../db/database.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import type { User } from '@devportal/shared';

interface DbUser {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  created_at: string;
}

const router = Router();

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

router.get('/me', authMiddleware, (req: AuthRequest, res: Response): void => {
  res.json({ user: req.user });
});

export default router;
