import { Router } from 'express';
import { serverDb, type ServerLoading } from '../db';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth';
import { broadcastEvent } from '../websocket';

const router = Router();

// GET /api/v1/loadings
router.get('/', authenticate, (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    data: serverDb.loadings
  });
});

// GET /api/v1/loadings/:id
router.get('/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const loading = serverDb.loadings.find(l => l.id === req.params.id);
  if (!loading) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Loading sheet ${req.params.id} not found`, status: 404 }
    });
  }
  res.json({ success: true, data: loading });
});

// POST /api/v1/loadings (Create new loading sheet)
router.post('/', authenticate, requireRole(['ADMIN', 'SUPERVISOR', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const { routeId, vehiclePlate, driverId, driverName, orderIds } = req.body;

  const id = `load-${Date.now().toString().slice(-6)}`;
  const loadingNumber = `LOAD-${Date.now().toString().slice(-5)}`;

  const newLoading: ServerLoading = {
    id,
    loadingNumber,
    routeId: routeId || 'rt-001',
    vehiclePlate: vehiclePlate || '01 000 TJ 01',
    driverId: driverId || 'usr-drv-1',
    driverName: driverName || 'Водитель Доставки',
    orderIds: orderIds || [],
    status: 'DRAFT',
    totalPackagesWarehouse: 0,
    totalWeightWarehouseKg: 0,
    totalPackagesDriver: 0,
    totalWeightDriverKg: 0,
    weightDeltaKg: 0,
    packageDelta: 0,
    canStartRoute: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1
  };

  serverDb.loadings.unshift(newLoading);
  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'system',
    req.user?.fullName || 'Система',
    req.user?.role || 'SYSTEM',
    'LOADING',
    newLoading.id,
    'CREATE_LOADING',
    `Погрузочный лист ${loadingNumber} создан для авто ${newLoading.vehiclePlate}`
  );

  broadcastEvent('LOADING_UPDATED', newLoading);

  res.status(201).json({ success: true, data: newLoading });
});

// POST /api/v1/loadings/:id/warehouse-verify (Step 1)
router.post('/:id/warehouse-verify', authenticate, requireRole(['ADMIN', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const loading = serverDb.loadings.find(l => l.id === req.params.id);
  if (!loading) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Loading not found', status: 404 }
    });
  }

  const { totalPackages, totalWeightKg } = req.body;
  loading.warehouseVerifiedBy = req.user?.sub;
  loading.warehouseVerifiedAt = new Date().toISOString();
  loading.totalPackagesWarehouse = Number(totalPackages) || 0;
  loading.totalWeightWarehouseKg = Number(totalWeightKg) || 0;
  loading.status = 'WAREHOUSE_VERIFIED';
  loading.updatedAt = new Date().toISOString();
  loading.version += 1;
  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'zavsklad',
    req.user?.fullName || 'Завсклад',
    req.user?.role || 'ZAVSKLAD',
    'LOADING',
    loading.id,
    'WAREHOUSE_VERIFIED',
    `Склад подтвердил погрузку ${loading.loadingNumber}: ${loading.totalPackagesWarehouse} уп., ${loading.totalWeightWarehouseKg} кг`
  );

  broadcastEvent('LOADING_UPDATED', loading);

  res.json({ success: true, data: loading });
});

// POST /api/v1/loadings/:id/driver-verify (Step 2)
router.post('/:id/driver-verify', authenticate, requireRole(['ADMIN', 'TAXSIMOT']), (req: AuthenticatedRequest, res) => {
  const loading = serverDb.loadings.find(l => l.id === req.params.id);
  if (!loading) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Loading not found', status: 404 }
    });
  }

  const { totalPackages, totalWeightKg } = req.body;
  loading.driverVerifiedAt = new Date().toISOString();
  loading.totalPackagesDriver = Number(totalPackages) || 0;
  loading.totalWeightDriverKg = Number(totalWeightKg) || 0;
  loading.status = 'DRIVER_VERIFIED';
  loading.updatedAt = new Date().toISOString();
  loading.version += 1;

  // Auto trigger reconcile logic
  const weightDelta = Math.abs(loading.totalWeightWarehouseKg - loading.totalWeightDriverKg);
  const pkgDelta = Math.abs(loading.totalPackagesWarehouse - loading.totalPackagesDriver);
  loading.weightDeltaKg = Math.round(weightDelta * 100) / 100;
  loading.packageDelta = pkgDelta;

  const isMatched = (weightDelta <= 0.5) && (pkgDelta === 0);
  if (isMatched) {
    loading.status = 'MATCH';
    loading.canStartRoute = true;
    loading.reconciledAt = new Date().toISOString();
  } else {
    loading.status = 'MISMATCH';
    loading.canStartRoute = false;
    loading.discrepancyReason = `Расхождение: вес склад ${loading.totalWeightWarehouseKg} кг vs водитель ${loading.totalWeightDriverKg} кг (дельта ${weightDelta.toFixed(2)} кг), уп. склад ${loading.totalPackagesWarehouse} vs ${loading.totalPackagesDriver}`;
  }

  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'driver',
    req.user?.fullName || 'Водитель',
    req.user?.role || 'TAXSIMOT',
    'LOADING',
    loading.id,
    'DRIVER_VERIFIED_AND_RECONCILED',
    `Водитель принял ${loading.loadingNumber}: ${loading.totalPackagesDriver} уп., ${loading.totalWeightDriverKg} кг. Результат: ${loading.status}`
  );

  broadcastEvent('LOADING_UPDATED', loading);

  res.json({
    success: true,
    data: loading,
    matched: isMatched
  });
});

// POST /api/v1/loadings/:id/reconcile (Explicit reconciliation check)
router.post('/:id/reconcile', authenticate, (req: AuthenticatedRequest, res) => {
  const loading = serverDb.loadings.find(l => l.id === req.params.id);
  if (!loading) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Loading not found', status: 404 }
    });
  }

  const weightDelta = Math.abs(loading.totalWeightWarehouseKg - loading.totalWeightDriverKg);
  const pkgDelta = Math.abs(loading.totalPackagesWarehouse - loading.totalPackagesDriver);
  loading.weightDeltaKg = Math.round(weightDelta * 100) / 100;
  loading.packageDelta = pkgDelta;

  const isMatched = (weightDelta <= 0.5) && (pkgDelta === 0);

  if (isMatched) {
    loading.status = 'MATCH';
    loading.canStartRoute = true;
    loading.reconciledAt = new Date().toISOString();
  } else {
    loading.status = 'MISMATCH';
    loading.canStartRoute = false;
    loading.discrepancyReason = `Блокировка старта рейса: расхождение веса ${weightDelta.toFixed(2)} кг, упаковок ${pkgDelta} шт.`;
  }

  serverDb.persist();
  broadcastEvent('LOADING_UPDATED', loading);

  if (!isMatched) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'LOADING_MISMATCH_BLOCKING',
        message: loading.discrepancyReason,
        status: 422,
        data: loading
      }
    });
  }

  res.json({
    success: true,
    data: loading
  });
});

// POST /api/v1/loadings/:id/resolve-discrepancy (Supervisor / Zavsklad override)
router.post('/:id/resolve-discrepancy', authenticate, requireRole(['ADMIN', 'SUPERVISOR', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const loading = serverDb.loadings.find(l => l.id === req.params.id);
  if (!loading) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Loading not found', status: 404 }
    });
  }

  const { finalWeightKg, finalPackages, overrideNotes } = req.body;
  if (!overrideNotes) {
    return res.status(400).json({
      success: false,
      error: { code: 'NOTES_REQUIRED', message: 'Для снятия расхождения обязательно обоснование (overrideNotes)', status: 400 }
    });
  }

  loading.totalWeightWarehouseKg = Number(finalWeightKg) || loading.totalWeightWarehouseKg;
  loading.totalWeightDriverKg = Number(finalWeightKg) || loading.totalWeightDriverKg;
  loading.totalPackagesWarehouse = Number(finalPackages) || loading.totalPackagesWarehouse;
  loading.totalPackagesDriver = Number(finalPackages) || loading.totalPackagesDriver;
  loading.weightDeltaKg = 0;
  loading.packageDelta = 0;
  loading.status = 'MATCH';
  loading.canStartRoute = true;
  loading.overrideBy = req.user?.fullName;
  loading.overrideNotes = overrideNotes;
  loading.updatedAt = new Date().toISOString();
  loading.version += 1;
  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'supervisor',
    req.user?.fullName || 'Супервайзер',
    req.user?.role || 'SUPERVISOR',
    'LOADING',
    loading.id,
    'RESOLVE_DISCREPANCY_OVERRIDE',
    `Расхождение снято: ${overrideNotes}. Установлен вес: ${loading.totalWeightDriverKg} кг, уп.: ${loading.totalPackagesDriver}`
  );

  broadcastEvent('LOADING_UPDATED', loading);

  res.json({ success: true, data: loading });
});

// POST /api/v1/loadings/:id/start-route (Guarded)
router.post('/:id/start-route', authenticate, requireRole(['ADMIN', 'TAXSIMOT']), (req: AuthenticatedRequest, res) => {
  const loading = serverDb.loadings.find(l => l.id === req.params.id);
  if (!loading) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Loading not found', status: 404 }
    });
  }

  if (loading.status !== 'MATCH' || !loading.canStartRoute) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'START_ROUTE_BLOCKED',
        message: 'Старт рейса заблокирован! Погрузка находится в статусе MISMATCH или не прошла двухэтапную сверку.',
        status: 422
      }
    });
  }

  loading.status = 'DISPATCHED';
  loading.updatedAt = new Date().toISOString();
  loading.version += 1;
  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'driver',
    req.user?.fullName || 'Водитель',
    req.user?.role || 'TAXSIMOT',
    'LOADING',
    loading.id,
    'START_ROUTE',
    `Водитель ${loading.driverName} выехал на маршрут. Авто: ${loading.vehiclePlate}`
  );

  broadcastEvent('LOADING_UPDATED', loading);

  res.json({ success: true, data: loading });
});

export default router;
