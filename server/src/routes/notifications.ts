import { Router } from 'express';
import { serverDb } from '../db';
import { authenticate, type AuthenticatedRequest } from '../auth';

const router = Router();

// GET /api/v1/notifications
router.get('/', authenticate, (req: AuthenticatedRequest, res) => {
  const userRole = req.user?.role;
  const userId = req.user?.sub;

  const userNotifs = serverDb.notifications.filter(n => {
    if (n.userId && n.userId === userId) return true;
    if (n.targetRole && n.targetRole === userRole) return true;
    if (!n.userId && !n.targetRole) return true;
    return false;
  });

  res.json({
    success: true,
    data: userNotifs,
    unreadCount: userNotifs.filter(n => !n.isRead).length
  });
});

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', authenticate, (req: AuthenticatedRequest, res) => {
  const notif = serverDb.notifications.find(n => n.id === req.params.id);
  if (!notif) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Уведомление не найдено', status: 404 }
    });
  }

  notif.isRead = true;
  serverDb.persist();

  res.json({ success: true, data: notif });
});

// POST /api/v1/notifications/read-all
router.post('/read-all', authenticate, (req: AuthenticatedRequest, res) => {
  const userRole = req.user?.role;
  const userId = req.user?.sub;

  serverDb.notifications.forEach(n => {
    if (n.userId === userId || n.targetRole === userRole) {
      n.isRead = true;
    }
  });

  serverDb.persist();
  res.json({ success: true });
});

export default router;
