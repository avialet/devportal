import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { queryAll } from '../db/database.js';

const router = Router();
router.use(authMiddleware);

// Get recent activity
router.get('/', (_req: AuthRequest, res: Response): void => {
  const activities = queryAll<{
    id: number;
    user_id: number | null;
    project_id: number | null;
    action: string;
    details: string | null;
    created_at: string;
  }>(`
    SELECT a.*, u.display_name as user_name
    FROM activity_log a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT 50
  `);

  res.json(activities.map(a => ({
    id: a.id,
    action: a.action,
    details: a.details,
    userName: (a as any).user_name || 'System',
    createdAt: a.created_at,
  })));
});

export default router;
