import { Router } from 'express';
import { serverDb } from '../db';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth';

const router = Router();

// GET /api/v1/system/backups
router.get('/backups', authenticate, requireRole(['ADMIN', 'DIRECTOR', 'AUDITOR']), (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    data: serverDb.backups
  });
});

// POST /api/v1/system/backup (Create snapshot)
router.post('/backup', authenticate, requireRole(['ADMIN', 'DIRECTOR']), (req: AuthenticatedRequest, res) => {
  const { description } = req.body;
  try {
    const backup = serverDb.createBackup(description);
    serverDb.logAudit(
      req.user?.sub || 'admin',
      req.user?.fullName || 'Администратор',
      req.user?.role || 'ADMIN',
      'SYSTEM',
      backup.id,
      'CREATE_BACKUP',
      `Создана резервная копия ${backup.filename} (${backup.sizeBytes} байт). Checksum SHA256: ${backup.checksum.slice(0, 12)}...`
    );

    res.status(201).json({
      success: true,
      data: backup
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'BACKUP_FAILED', message: err.message, status: 500 }
    });
  }
});

// POST /api/v1/system/restore (Restore snapshot with integrity verification)
router.post('/restore', authenticate, requireRole(['ADMIN']), (req: AuthenticatedRequest, res) => {
  const { backupId } = req.body;
  if (!backupId) {
    return res.status(400).json({
      success: false,
      error: { code: 'BACKUP_ID_REQUIRED', message: 'Укажите идентификатор бэкапа (backupId)', status: 400 }
    });
  }

  try {
    const result = serverDb.restoreBackup(backupId);
    serverDb.logAudit(
      req.user?.sub || 'admin',
      req.user?.fullName || 'Администратор',
      req.user?.role || 'ADMIN',
      'SYSTEM',
      backupId,
      'RESTORE_BACKUP',
      `База данных успешно восстановлена из бэкапа ${backupId} с полной проверкой целостности`
    );

    res.json({
      success: true,
      message: 'База данных успешно восстановлена из резервной копии',
      data: result
    });
  } catch (err: any) {
    res.status(422).json({
      success: false,
      error: { code: 'RESTORE_FAILED', message: err.message, status: 422 }
    });
  }
});

export default router;
