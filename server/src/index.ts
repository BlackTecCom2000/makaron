import http from 'node:http';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import ordersRoutes from './routes/orders';
import loadingsRoutes from './routes/loadings';
import pieceworkRoutes from './routes/piecework';
import syncRoutes from './routes/sync';
import auditRoutes from './routes/audit';
import warehouseRoutes from './routes/warehouse';
import pickingRoutes from './routes/picking';
import routesRoutes from './routes/routes';
import deliveriesRoutes from './routes/deliveries';
import notificationsRoutes from './routes/notifications';
import backupRoutes from './routes/backup';
import { initWebSocketServer } from './websocket';
import { serverDb } from './db';

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Idempotency-Key', 'X-Client-Timestamp', 'X-Simulate-Role']
}));
app.use(express.json({ limit: '15mb' }));

// Health Check
app.get(['/api/v1/health', '/api/health'], (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'BlackTecCom MAKARON Enterprise Server',
    version: '1.1.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      ordersCount: serverDb.orders.length,
      loadingsCount: serverDb.loadings.length,
      pickingTasksCount: serverDb.pickingTasks.length,
      stockItemsCount: serverDb.stock.length,
      routesCount: serverDb.routes.length,
      returnsCount: serverDb.returns.length,
      auditRecordsCount: serverDb.auditLogs.length
    }
  });
});

// Digital Passport Endpoint (Section 9, 129)
app.get(['/api/v1/orders/:id/digital-passport', '/api/orders/:id/digital-passport'], (req, res) => {
  const order = serverDb.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({
      success: false,
      error: { code: 'ORDER_NOT_FOUND', message: 'Заказ не найден', status: 404 }
    });
  }

  const adjustments = serverDb.warehouseAdjustments.filter(a => a.orderId === order.id);
  const versions = serverDb.orderVersions.filter(v => v.orderId === order.id);
  const pickingTask = serverDb.pickingTasks.find(p => p.orderId === order.id);
  const loading = serverDb.loadings.find(l => l.orderIds.includes(order.id));
  const returns = serverDb.returns.filter(r => r.orderId === order.id);
  const auditTrail = serverDb.auditLogs.filter(a => a.entityId === order.id);

  res.json({
    success: true,
    data: {
      order,
      milestones: {
        created: { timestamp: order.createdAt, by: order.agentName || order.pointId || 'Клиент' },
        warehouseAdjustments: adjustments,
        versions,
        pickingTask,
        loadingOperation: loading,
        reconciliation: loading ? {
          warehouseVerifiedAt: loading.warehouseVerifiedAt,
          driverVerifiedAt: loading.driverVerifiedAt,
          status: loading.status,
          weightDeltaKg: loading.weightDeltaKg
        } : null,
        delivery: {
          confirmedAt: order.deliveryConfirmedAt,
          method: order.confirmationMethod,
          geoLat: order.geoLat,
          geoLng: order.geoLng,
          hasSignature: !!order.signatureData,
          hasPhoto: !!order.photoUrl
        },
        returns,
        auditTrail
      }
    }
  });
});

// Mount /api/v1 Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/warehouse', warehouseRoutes);
app.use('/api/v1/picking', pickingRoutes);
app.use('/api/v1/routes', routesRoutes);
app.use('/api/v1/loadings', loadingsRoutes);
app.use('/api/v1/deliveries', deliveriesRoutes);
app.use('/api/v1/production', pieceworkRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/system', backupRoutes);

// Mount /api Aliases for Strict Chapter 79 Matching
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/picking', pickingRoutes);
app.use('/api/routes', routesRoutes);
app.use('/api/loading', loadingsRoutes);
app.use('/api/deliveries', deliveriesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/audit', auditRoutes);

// RFC 7807 Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[SERVER ERROR]', err);
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Внутренняя ошибка сервера',
      status: err.status || 500,
      timestamp: new Date().toISOString()
    }
  });
});

// Create HTTP and WebSocket Server
const httpServer = http.createServer(app);
initWebSocketServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` BlackTecCom MAKARON Enterprise Server Running v1.1.0!`);
  console.log(` REST API: http://localhost:${PORT}/api/v1`);
  console.log(` WebSockets: ws://localhost:${PORT}/ws/v1`);
  console.log(` Drive: F:/ANTIGRAVITY/MAKARON/`);
  console.log(`====================================================`);
});

export { app, httpServer };
