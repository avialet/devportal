import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { User } from '@devportal/shared';

export interface AuthRequest extends Request {
  user?: User;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  // 1) Session cookie (OIDC)
  if (req.session?.user) {
    req.user = req.session.user as User;
    next();
    return;
  }

  // 2) JWT Bearer fallback (legacy / API)
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret) as User;
      req.user = payload;
      next();
      return;
    } catch {
      // fall through
    }
  }

  res.status(401).json({ error: 'unauthorized', message: 'Non authentifie' });
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'forbidden', message: 'Admin requis' });
    return;
  }
  next();
}
