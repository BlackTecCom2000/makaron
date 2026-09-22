import { Router } from 'express';
import { serverDb, type ServerPieceworkLog } from '../db';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth';

const router = Router();

// GET /api/v1/production/piecework-logs
router.get('/piecework-logs', authenticate, (req: AuthenticatedRequest, res) => {
  let logs = [...serverDb.pieceworkLogs];
  if (req.user?.role === 'WORKER') {
    logs = logs.filter(l => l.workerId === req.user?.sub);
  }
  res.json({ success: true, data: logs });
});

// POST /api/v1/production/piecework-logs (Formula: Volume * Tariff = Amount)
// Завсклад фиксирует выработку (кг), тариф и сумму определяет исключительно Главный Руководитель
router.post('/piecework-logs', authenticate, requireRole(['ADMIN', 'WORKER', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const { workerId, workerName, stationId, operationType, volumeKg, tariffPerKg, shiftId } = req.body;

  const vol = Number(volumeKg) || 0;
  const op = operationType || 'Комплектация';

  const isExecutive = req.user?.role === 'ADMIN' || req.user?.role === 'DIRECTOR';
  let tariff: number;

  const activeRate = serverDb.rates.find(
    r => (r.operationType.toLowerCase() === op.toLowerCase() ||
         (op.toLowerCase().includes('комплект') && r.operationType.toLowerCase().includes('комплект'))) &&
         r.isActive
  );

  if (isExecutive && typeof tariffPerKg === 'number' && tariffPerKg > 0) {
    tariff = tariffPerKg;
  } else if (activeRate) {
    tariff = activeRate.ratePerKg;
  } else {
    tariff = (op.toLowerCase().includes('комплект') || op === 'LOADING') ? 0.15 : 0.35;
  }

  const totalAmount = Math.round(vol * tariff * 100) / 100;

  const id = `pw-${Date.now().toString().slice(-6)}`;
  const newLog: ServerPieceworkLog = {
    id,
    workerId: workerId || req.user?.sub || 'usr-wrk-1',
    workerName: workerName || req.user?.fullName || 'Работник',
    stationId: stationId || 'LINE-PACKAGING-01',
    operationType: op,
    volumeKg: vol,
    tariffPerKg: tariff,
    totalAmount,
    currency: 'TJS',
    shiftId,
    createdAt: new Date().toISOString(),
    isLocked: true,
    lockedAt: new Date().toISOString(),
    lockedBy: req.user?.fullName || 'Завсклад'
  };

  serverDb.pieceworkLogs.unshift(newLog);
  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'worker',
    req.user?.fullName || 'Работник',
    req.user?.role || 'WORKER',
    'PIECEWORK',
    newLog.id,
    'LOG_PIECEWORK',
    `Сдельная выработка зафиксирована: ${vol} кг x ${tariff} TJS (тариф Руководства) = ${totalAmount} TJS (${newLog.operationType}). Запись заблокирована от изменений завскладом.`
  );

  res.status(201).json({ success: true, data: newLog });
});

// PATCH /api/v1/production/piecework-logs/:id (Только Руководитель)
router.patch('/piecework-logs/:id', authenticate, (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'DIRECTOR') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_IMMUTABLE_LOG',
        message: 'Зафиксированная запись выработки заблокирована для завсклада. Редактирование разрешено исключительно Главному Руководителю.',
        status: 403
      }
    });
  }

  const { id } = req.params;
  const target = serverDb.pieceworkLogs.find(l => l.id === id);
  if (!target) {
    return res.status(404).json({ success: false, error: { code: 'LOG_NOT_FOUND', message: 'Запись выработки не найдена' } });
  }

  const { volumeKg, tariffPerKg, operationType, reason } = req.body;
  if (volumeKg !== undefined) target.volumeKg = Number(volumeKg) || 0;
  if (tariffPerKg !== undefined) target.tariffPerKg = Number(tariffPerKg) || target.tariffPerKg;
  if (operationType !== undefined) target.operationType = operationType;

  target.totalAmount = Math.round(target.volumeKg * target.tariffPerKg * 100) / 100;
  target.modifiedBy = req.user?.fullName || 'Главный Руководитель';
  target.modifiedAt = new Date().toISOString();

  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'admin',
    req.user?.fullName || 'Главный Руководитель',
    req.user?.role || 'ADMIN',
    'PIECEWORK',
    target.id,
    'ADJUST_PIECEWORK',
    `Главный Руководитель скорректировал выработку ${target.id}: ${target.volumeKg} кг x ${target.tariffPerKg} TJS = ${target.totalAmount} TJS. Причина: ${reason || 'Корректировка Руководства'}`
  );

  res.json({ success: true, data: target });
});

// DELETE /api/v1/production/piecework-logs/:id (Только Руководитель)
router.delete('/piecework-logs/:id', authenticate, (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'DIRECTOR') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_IMMUTABLE_LOG',
        message: 'Удаление зафиксированных записей выработки заблокировано для завсклада. Аннулирование разрешено исключительно Главному Руководителю.',
        status: 403
      }
    });
  }

  const { id } = req.params;
  const idx = serverDb.pieceworkLogs.findIndex(l => l.id === id);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: { code: 'LOG_NOT_FOUND', message: 'Запись выработки не найдена' } });
  }

  const [removed] = serverDb.pieceworkLogs.splice(idx, 1);
  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'admin',
    req.user?.fullName || 'Главный Руководитель',
    req.user?.role || 'ADMIN',
    'PIECEWORK',
    removed.id,
    'ANNUL_PIECEWORK',
    `Главный Руководитель аннулировал выработку ${removed.id} сотрудника ${removed.workerName} (${removed.volumeKg} кг, ${removed.totalAmount} TJS). Причина: ${req.body?.reason || 'Аннулирование Руководством'}`
  );

  res.json({ success: true, message: 'Запись выработки успешно аннулирована Главным Руководителем' });
});

// GET /api/v1/production/payroll-summary
router.get('/payroll-summary', authenticate, requireRole(['ADMIN', 'DIRECTOR', 'AUDITOR', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const summary: Record<string, { workerName: string; totalKg: number; totalEarnings: number; operationsCount: number }> = {};

  for (const log of serverDb.pieceworkLogs) {
    if (!summary[log.workerId]) {
      summary[log.workerId] = {
        workerName: log.workerName,
        totalKg: 0,
        totalEarnings: 0,
        operationsCount: 0
      };
    }
    summary[log.workerId].totalKg += log.volumeKg;
    summary[log.workerId].totalEarnings += log.totalAmount;
    summary[log.workerId].operationsCount += 1;
  }

  res.json({
    success: true,
    data: Object.entries(summary).map(([workerId, val]) => ({
      workerId,
      ...val,
      totalKg: Math.round(val.totalKg * 100) / 100,
      totalEarnings: Math.round(val.totalEarnings * 100) / 100
    }))
  });
});

export default router;
