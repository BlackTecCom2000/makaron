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
router.post('/piecework-logs', authenticate, requireRole(['ADMIN', 'WORKER', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const { workerId, workerName, stationId, operationType, volumeKg, tariffPerKg, shiftId } = req.body;

  const vol = Number(volumeKg) || 0;
  const tariff = Number(tariffPerKg) || 0.35;
  const totalAmount = Math.round(vol * tariff * 100) / 100;

  const id = `pw-${Date.now().toString().slice(-6)}`;
  const newLog: ServerPieceworkLog = {
    id,
    workerId: workerId || req.user?.sub || 'usr-wrk-1',
    workerName: workerName || req.user?.fullName || 'Работник',
    stationId: stationId || 'LINE-PACKAGING-01',
    operationType: operationType || 'PACKING',
    volumeKg: vol,
    tariffPerKg: tariff,
    totalAmount,
    currency: 'TJS',
    shiftId,
    createdAt: new Date().toISOString()
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
    `Сдельная выработка: ${vol} кг x ${tariff} TJS = ${totalAmount} TJS (${newLog.operationType})`
  );

  res.status(201).json({ success: true, data: newLog });
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
