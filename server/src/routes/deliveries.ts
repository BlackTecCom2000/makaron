import { Router } from 'express';
import { serverDb, type ServerReturn } from '../db';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth';
import { broadcastEvent } from '../websocket';

const router = Router();

// POST /api/v1/deliveries/:id/arrive (п. 34, 86)
router.post('/:id/arrive', authenticate, requireRole(['ADMIN', 'TAXSIMOT']), (req: AuthenticatedRequest, res) => {
  const { geoLat, geoLng } = req.body;
  const pointId = req.params.id;

  // Find in routes
  let foundPoint: any = null;
  for (const r of serverDb.routes) {
    const pt = r.points.find(p => p.id === pointId || p.orderId === pointId);
    if (pt) {
      pt.status = 'ARRIVED';
      pt.arrivedAt = new Date().toISOString();
      pt.geoLat = geoLat || pt.geoLat;
      pt.geoLng = geoLng || pt.geoLng;
      foundPoint = pt;
      break;
    }
  }

  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'driver',
    req.user?.fullName || 'Водитель',
    req.user?.role || 'TAXSIMOT',
    'DELIVERY',
    pointId,
    'ARRIVE_POINT',
    `Таксимот прибыл на точку доставки. Geo: [${geoLat || 'N/A'}, ${geoLng || 'N/A'}]`
  );

  res.json({ success: true, data: foundPoint });
});

// POST /api/v1/deliveries/:id/problem (п. 40, 86)
router.post('/:id/problem', authenticate, requireRole(['ADMIN', 'TAXSIMOT']), (req: AuthenticatedRequest, res) => {
  const { problemReason, photoUrl } = req.body;
  const pointId = req.params.id;

  let foundPoint: any = null;
  for (const r of serverDb.routes) {
    const pt = r.points.find(p => p.id === pointId || p.orderId === pointId);
    if (pt) {
      pt.status = 'PROBLEM';
      foundPoint = pt;
      break;
    }
  }

  // Update order if found
  const order = serverDb.orders.find(o => o.id === pointId);
  if (order) {
    order.status = 'PROBLEM' as any;
    order.notes = `ПРОБЛЕМА ДОСТАВКИ: ${problemReason}`;
    order.updatedAt = new Date().toISOString();
    broadcastEvent('ORDER_UPDATED', order);
  }

  serverDb.addNotification(
    'DELIVERY_PROBLEM',
    'Проблема на точке доставки',
    `Водитель ${req.user?.fullName} сообщил о проблеме: ${problemReason}`,
    'SUPERVISOR',
    undefined,
    'DELIVERY',
    pointId
  );

  serverDb.persist();
  res.json({ success: true, data: { pointId, problemReason, photoUrl } });
});

// POST /api/v1/deliveries/:id/return (п. 41, 76, 86 — Return Waybill Generation)
router.post('/:id/return', authenticate, requireRole(['ADMIN', 'TAXSIMOT', 'SUPERVISOR']), (req: AuthenticatedRequest, res) => {
  const orderId = req.params.id;
  const { items, reasonCode, reasonText, photoUrl, shopName } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'ITEMS_REQUIRED', message: 'Для оформления возврата укажите возвращаемые позиции', status: 400 }
    });
  }

  const order = serverDb.orders.find(o => o.id === orderId);
  const returnNumber = `RET-${Date.now().toString().slice(-5)}`;
  const returnId = `ret-${Date.now().toString().slice(-6)}`;

  let totalWeightKg = 0;
  const returnItems = items.map((it: any) => {
    const qty = Number(it.returnQty) || 0;
    const weight = Number(it.packageWeightKg) || 1.0;
    totalWeightKg += qty * weight;
    return {
      productId: it.productId,
      productName: it.productName || 'Товар',
      packageWeightKg: weight,
      returnQty: qty,
      reasonCode: it.reasonCode || reasonCode || 'DEFECT',
      reasonText: it.reasonText || reasonText || 'Возврат по рекламации'
    };
  });

  const newReturn: ServerReturn = {
    id: returnId,
    returnNumber,
    deliveryId: `del-${orderId}`,
    orderId,
    orderNumber: order?.orderNumber || `ORD-${orderId}`,
    shopName: shopName || order?.shopName || 'Магазин',
    driverId: req.user?.sub || 'usr-drv-1',
    driverName: req.user?.fullName || 'Водитель Доставки',
    items: returnItems,
    totalWeightKg: Math.round(totalWeightKg * 100) / 100,
    photoUrl,
    status: 'PENDING_WAREHOUSE_RECEIPT',
    waybillUrl: `/api/v1/reports/waybill/${returnNumber}.pdf`,
    createdAt: new Date().toISOString()
  };

  serverDb.returns.unshift(newReturn);

  if (order) {
    order.status = 'RETURNED' as any;
    order.updatedAt = new Date().toISOString();
    broadcastEvent('ORDER_UPDATED', order);
  }

  serverDb.addNotification(
    'RETURN_REGISTERED',
    'Сформирован возвратный акт',
    `Водитель ${newReturn.driverName} оформил накладную возврата ${returnNumber} (${newReturn.totalWeightKg} кг)`,
    'ZAVSKLAD',
    undefined,
    'RETURN',
    newReturn.id
  );

  serverDb.logAudit(
    req.user?.sub || 'driver',
    req.user?.fullName || 'Водитель',
    req.user?.role || 'TAXSIMOT',
    'RETURN',
    newReturn.id,
    'CREATE_RETURN_WAYBILL',
    `Сформирована возвратная накладная ${returnNumber} на сумму возврата веса ${newReturn.totalWeightKg} кг. Причина: [${reasonCode}] ${reasonText}`
  );

  serverDb.persist();
  broadcastEvent('RETURN_CREATED', newReturn);

  res.status(201).json({
    success: true,
    data: newReturn
  });
});

// GET /api/v1/deliveries/returns
router.get('/returns/list', authenticate, (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: serverDb.returns });
});

export default router;
