import { Router } from 'express';
import { serverDb, type ServerPieceworkLog } from '../db.js';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth.js';
import { broadcastWsEvent } from '../websocket.js';

export const productionRouter = Router();

// GET /api/v1/production/operations - журнал выпуска партий готовой продукции
productionRouter.get('/operations', authenticate, (req: AuthenticatedRequest, res) => {
  const { date, shift } = req.query;
  let ops = serverDb.productionOperations;

  if (date) {
    ops = ops.filter(o => o.date === String(date));
  }
  if (shift) {
    ops = ops.filter(o => o.shift === String(shift));
  }

  const totalWeightKg = Number(ops.reduce((sum, o) => sum + o.totalWeightKg, 0).toFixed(2));
  const totalPackages = ops.reduce((sum, o) => sum + o.quantity, 0);

  res.json({
    success: true,
    data: {
      operations: ops,
      totalWeightKg,
      totalPackages
    }
  });
});

// POST /api/v1/production/operations - регистрация выпуска партии (BR-PROD-001, BR-PROD-003)
productionRouter.post('/operations', authenticate, requireRole(['ADMIN', 'DIRECTOR', 'WORKER', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const {
    date = new Date().toISOString().split('T')[0],
    shift = 'SHIFT_1',
    lineId = 'LINE-01',
    productPackageId,
    productName,
    packageWeightKg,
    quantity,
    workerIds = [],
    workerNames = []
  } = req.body;

  if (!productPackageId) {
    return res.status(400).json({ error: 'Не указан идентификатор фасовки товара' });
  }

  if (typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({ error: 'Количество должно быть положительным числом' });
  }

  // Определение веса упаковки из справочника или параметров
  let weight = packageWeightKg;
  let name = productName;

  if (!weight || !name) {
    const existingStock = serverDb.stock.find(s => s.productPackageId === productPackageId);
    if (existingStock) {
      weight = weight || existingStock.packageWeightKg;
      name = name || existingStock.productName;
    } else {
      weight = weight || 23.0;
      name = name || 'Макаронные изделия 23кг';
    }
  }

  try {
    const actorUser = req.user;
    const op = serverDb.recordProductionBatch({
      date,
      shift,
      lineId,
      productPackageId,
      productName: name,
      packageWeightKg: weight,
      quantity,
      workerIds,
      workerNames,
      createdByUserId: actorUser?.sub || 'usr-admin',
      createdByName: actorUser?.fullName || 'Мастер производства'
    });

    broadcastWsEvent('production', 'PRODUCTION_BATCH_RECORDED', {
      batchId: op.id,
      batchNumber: op.batchNumber,
      totalWeightKg: op.totalWeightKg,
      quantity: op.quantity
    });

    res.status(201).json({
      success: true,
      data: op
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Ошибка регистрации производственной партии' });
  }
});

// GET /api/v1/production/rates - реестр версионируемых тарифов
productionRouter.get('/rates', authenticate, (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    data: serverDb.rates
  });
});

// POST /api/v1/production/rates - создание / версионирование тарифа (BR-RATE-001)
productionRouter.post('/rates', authenticate, requireRole(['ADMIN', 'DIRECTOR']), (req: AuthenticatedRequest, res) => {
  const { operationType, ratePerKg, currency = 'TJS', effectiveFrom } = req.body;

  if (!operationType || typeof ratePerKg !== 'number' || ratePerKg <= 0 || !effectiveFrom) {
    return res.status(400).json({ error: 'Некорректные параметры тарифа (operationType, ratePerKg > 0, effectiveFrom обязательны)' });
  }

  try {
    const rate = serverDb.createRate({
      operationType,
      ratePerKg,
      currency,
      effectiveFrom
    });

    res.status(201).json({
      success: true,
      data: rate
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Ошибка создания тарифа' });
  }
});

// GET /api/v1/production/attendance - табель выходов сотрудников (BR-ATT-001)
productionRouter.get('/attendance', authenticate, (req: AuthenticatedRequest, res) => {
  const { date, shift, workerId } = req.query;
  let att = serverDb.workerAttendance;

  if (date) {
    att = att.filter(a => a.date === String(date));
  }
  if (shift) {
    att = att.filter(a => a.shift === String(shift));
  }
  if (workerId) {
    att = att.filter(a => a.workerId === String(workerId));
  }

  res.json({
    success: true,
    data: att
  });
});

// POST /api/v1/production/attendance - фиксация статуса в табеле
productionRouter.post('/attendance', authenticate, requireRole(['ADMIN', 'DIRECTOR', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const {
    workerId,
    workerName,
    date = new Date().toISOString().split('T')[0],
    shift = 'SHIFT_1',
    status,
    reason
  } = req.body;

  if (!workerId || !workerName || !status) {
    return res.status(400).json({ error: 'workerId, workerName и status обязательны' });
  }

  const validStatuses = ['PRESENT', 'SICK', 'VACATION', 'OFF', 'ABSENT'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Недопустимый статус. Разрешены: ${validStatuses.join(', ')}` });
  }

  try {
    const actorUser = req.user;
    const rec = serverDb.recordAttendance({
      workerId,
      workerName,
      date,
      shift,
      status,
      reason,
      recordedByUserId: actorUser?.sub || 'usr-zav-1',
      recordedByName: actorUser?.fullName || 'Начальник смены'
    });

    res.status(201).json({
      success: true,
      data: rec
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Ошибка отметки в табеле' });
  }
});

// --- Сдельная выработка и сводный расчет зарплаты (Piecework & Payroll) ---

// GET /api/v1/production/piecework-logs
productionRouter.get('/piecework-logs', authenticate, (req: AuthenticatedRequest, res) => {
  let logs = [...serverDb.pieceworkLogs];
  if (req.user?.role === 'WORKER') {
    logs = logs.filter(l => l.workerId === req.user?.sub);
  }
  res.json({ success: true, data: logs });
});

// POST /api/v1/production/piecework-logs (Formula: Volume * Tariff = Amount)
productionRouter.post('/piecework-logs', authenticate, requireRole(['ADMIN', 'WORKER', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const { workerId, workerName, stationId, operationType, volumeKg, tariffPerKg, shiftId } = req.body;

  const vol = Number(volumeKg) || 0;
  // Get active tariff rate from rates if not provided
  let tariff = Number(tariffPerKg);
  if (!tariff || isNaN(tariff)) {
    const activeRate = serverDb.rates.find(r => r.operationType === (operationType || 'PACKING') && r.isActive);
    tariff = activeRate ? activeRate.ratePerKg : 0.35;
  }
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
productionRouter.get('/payroll-summary', authenticate, requireRole(['ADMIN', 'DIRECTOR', 'AUDITOR', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
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

export default productionRouter;
