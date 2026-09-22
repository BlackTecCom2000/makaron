import { Router } from 'express';
import { serverDb } from '../db';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth';

const router = Router();

// GET /api/v1/audit/logs (Restricted to AUDITOR, DIRECTOR, ADMIN)
router.get('/logs', authenticate, requireRole(['ADMIN', 'DIRECTOR', 'AUDITOR']), (req: AuthenticatedRequest, res) => {
  const { entityType, entityId, limit } = req.query;
  let logs = [...serverDb.auditLogs];

  if (entityType) logs = logs.filter(l => l.entityType === entityType);
  if (entityId) logs = logs.filter(l => l.entityId === entityId);

  const take = Number(limit) || 100;
  res.json({
    success: true,
    data: logs.slice(0, take),
    meta: {
      total: logs.length,
      returned: Math.min(logs.length, take)
    }
  });
});

export default router;
