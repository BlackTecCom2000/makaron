import { Router } from 'express';
import { serverDb, type ServerRoute, type ServerRouteVersion } from '../db';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth';
import { broadcastEvent } from '../websocket';

const router = Router();

// GET /api/v1/routes
router.get('/', authenticate, (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: serverDb.routes });
});

// GET /api/v1/routes/:id
router.get('/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const route = serverDb.routes.find(r => r.id === req.params.id);
  if (!route) {
    return res.status(404).json({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: 'Маршрут не найден', status: 404 }
    });
  }
  res.json({ success: true, data: route });
});

// POST /api/v1/routes
router.post('/', authenticate, requireRole(['ADMIN', 'SUPERVISOR']), (req: AuthenticatedRequest, res) => {
  const { vehiclePlate, driverId, driverName, date, points } = req.body;

  const id = `rt-${Date.now().toString().slice(-6)}`;
  const routeNumber = `ROUTE-${Date.now().toString().slice(-5)}`;

  const newRoute: ServerRoute = {
    id,
    routeNumber,
    vehiclePlate: vehiclePlate || '01 000 TJ 01',
    driverId: driverId || 'usr-drv-1',
    driverName: driverName || 'Водитель Доставки',
    supervisorId: req.user?.sub || 'usr-sup-1',
    supervisorName: req.user?.fullName || 'Супервайзер',
    date: date || new Date().toISOString().split('T')[0],
    status: 'PLANNED',
    currentVersion: 1,
    points: Array.isArray(points) ? points : [],
    versions: [
      {
        id: `rv-${id}-1`,
        routeId: id,
        versionNumber: 1,
        reason: 'Базовое утверждение рейса v1',
        modifiedByUserId: req.user?.sub || 'usr-sup-1',
        modifiedByName: req.user?.fullName || 'Супервайзер',
        pointsSnapshot: Array.isArray(points) ? JSON.parse(JSON.stringify(points)) : [],
        createdAt: new Date().toISOString()
      }
    ]
  };

  serverDb.routes.unshift(newRoute);
  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'sup',
    req.user?.fullName || 'Супервайзер',
    req.user?.role || 'SUPERVISOR',
    'ROUTE',
    newRoute.id,
    'CREATE_ROUTE',
    `Маршрут ${routeNumber} (v1) создан. Точек: ${newRoute.points.length}`
  );

  broadcastEvent('ROUTE_CREATED', newRoute);
  res.status(201).json({ success: true, data: newRoute });
});

// POST /api/v1/routes/:id/versions (Route Versioning v1 -> v2, п. 32, 71, 84)
router.post('/:id/versions', authenticate, requireRole(['ADMIN', 'SUPERVISOR']), (req: AuthenticatedRequest, res) => {
  const route = serverDb.routes.find(r => r.id === req.params.id);
  if (!route) {
    return res.status(404).json({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: 'Маршрут не найден', status: 404 }
    });
  }

  const { reason, points } = req.body;
  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VERSION_REASON_REQUIRED',
        message: 'Для создания новой версии маршрута (v2+) обязательна причина корректировки (п. 32 ТЗ)',
        status: 400
      }
    });
  }

  if (!points || !Array.isArray(points)) {
    return res.status(400).json({
      success: false,
      error: { code: 'POINTS_REQUIRED', message: 'Не передан массив обновленных точек маршрута', status: 400 }
    });
  }

  const nextVersion = route.currentVersion + 1;
  const versionRecord: ServerRouteVersion = {
    id: `rv-${route.id}-${nextVersion}`,
    routeId: route.id,
    versionNumber: nextVersion,
    reason,
    modifiedByUserId: req.user?.sub || 'usr-sup-1',
    modifiedByName: req.user?.fullName || 'Супервайзер',
    pointsSnapshot: JSON.parse(JSON.stringify(route.points)),
    createdAt: new Date().toISOString()
  };

  route.versions.unshift(versionRecord);
  route.points = points;
  route.currentVersion = nextVersion;
  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'sup',
    req.user?.fullName || 'Супервайзер',
    req.user?.role || 'SUPERVISOR',
    'ROUTE',
    route.id,
    'UPDATE_ROUTE_VERSION',
    `Маршрут ${route.routeNumber} обновлен до версии v${nextVersion}. Причина: ${reason}`
  );

  broadcastEvent('ROUTE_UPDATED', route);
  res.json({ success: true, data: { route, version: versionRecord } });
});

// POST /api/v1/routes/:id/start
router.post('/:id/start', authenticate, requireRole(['ADMIN', 'TAXSIMOT']), (req: AuthenticatedRequest, res) => {
  const route = serverDb.routes.find(r => r.id === req.params.id);
  if (!route) {
    return res.status(404).json({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: 'Маршрут не найден', status: 404 }
    });
  }

  route.status = 'IN_TRANSIT';
  route.startedAt = new Date().toISOString();
  serverDb.persist();

  broadcastEvent('ROUTE_UPDATED', route);
  res.json({ success: true, data: route });
});

// POST /api/v1/routes/:id/complete
router.post('/:id/complete', authenticate, requireRole(['ADMIN', 'TAXSIMOT', 'SUPERVISOR']), (req: AuthenticatedRequest, res) => {
  const route = serverDb.routes.find(r => r.id === req.params.id);
  if (!route) {
    return res.status(404).json({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: 'Маршрут не найден', status: 404 }
    });
  }

  route.status = 'COMPLETED';
  route.completedAt = new Date().toISOString();
  serverDb.persist();

  broadcastEvent('ROUTE_UPDATED', route);
  res.json({ success: true, data: route });
});

export default router;
