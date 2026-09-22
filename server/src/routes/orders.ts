import { Router } from 'express';
import { serverDb, type ServerOrder, type ServerOrderItem } from '../db';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth';
import { broadcastEvent } from '../websocket';

const router = Router();

// GET /api/v1/orders
router.get('/', authenticate, (req: AuthenticatedRequest, res) => {
  const { supplyMode, status, pointId, agentId } = req.query;
  let orders = [...serverDb.orders];

  // RBAC scope filtering
  if (req.user?.role === 'POINT' && req.user.pointId) {
    orders = orders.filter(o => o.pointId === req.user?.pointId);
  } else if (req.user?.role === 'AGENT' && req.user.agentId) {
    orders = orders.filter(o => o.agentId === req.user?.agentId);
  }

  if (supplyMode) orders = orders.filter(o => o.supplyMode === supplyMode);
  if (status) orders = orders.filter(o => o.status === status);
  if (pointId) orders = orders.filter(o => o.pointId === pointId);
  if (agentId) orders = orders.filter(o => o.agentId === agentId);

  res.json({
    success: true,
    data: orders,
    meta: { count: orders.length }
  });
});

// GET /api/v1/orders/:id
router.get('/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const order = serverDb.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({
      success: false,
      error: { code: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} not found`, status: 404 }
    });
  }
  res.json({ success: true, data: order });
});

// POST /api/v1/orders
router.post('/', authenticate, (req: AuthenticatedRequest, res) => {
  const { supplyMode, pointId, shopId, shopName, agentId, agentName, items, notes } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'EMPTY_ORDER', message: 'Заказ должен содержать хотя бы одну позицию', status: 400 }
    });
  }

  // Supply Mode validation
  if (supplyMode === 'MODE_1_POINT' && !pointId) {
    return res.status(400).json({
      success: false,
      error: { code: 'POINT_REQUIRED', message: 'Для Режима 1 (Точка) обязателен pointId', status: 400 }
    });
  }

  // Strict weight and sum calculation
  let calculatedWeight = 0;
  let calculatedSum = 0;
  const processedItems: ServerOrderItem[] = items.map((it: any) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.price) || 0;
    const weight = Number(it.weightPerUnitKg) || 0;
    calculatedWeight += qty * weight;
    calculatedSum += qty * price;
    return {
      productId: it.productId,
      productName: it.productName || 'Товар',
      quantity: qty,
      price: price,
      weightPerUnitKg: weight
    };
  });

  const orderId = `ord-${Date.now().toString().slice(-6)}`;
  const orderNumber = `ORD-${Date.now().toString().slice(-5)}`;
  const initialStatus = (supplyMode === 'MODE_1_POINT' || req.user?.role === 'SUPERVISOR') ? 'CONFIRMED' : 'CONFIRMED';

  const newOrder: ServerOrder = {
    id: orderId,
    orderNumber,
    supplyMode: supplyMode || 'MODE_1_POINT',
    pointId,
    shopId,
    shopName,
    agentId: agentId || req.user?.agentId,
    agentName: agentName || (req.user?.role === 'AGENT' ? req.user.fullName : undefined),
    status: initialStatus,
    items: processedItems,
    totalWeightKg: Math.round(calculatedWeight * 100) / 100,
    totalSum: Math.round(calculatedSum * 100) / 100,
    currency: 'TJS',
    notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1
  };

  serverDb.orders.unshift(newOrder);
  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'anonymous',
    req.user?.fullName || 'Система',
    req.user?.role || 'UNKNOWN',
    'ORDER',
    newOrder.id,
    'CREATE_ORDER',
    `Заказ ${orderNumber} создан. Позиций: ${processedItems.length}, Вес: ${newOrder.totalWeightKg} кг, Сумма: ${newOrder.totalSum} TJS`
  );

  broadcastEvent('ORDER_CREATED', newOrder);

  res.status(201).json({
    success: true,
    data: newOrder
  });
});

// PATCH /api/v1/orders/:id/status
router.patch('/:id/status', authenticate, (req: AuthenticatedRequest, res) => {
  const { status } = req.body;
  const order = serverDb.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({
      success: false,
      error: { code: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} not found`, status: 404 }
    });
  }

  const prevStatus = order.status;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  order.version += 1;
  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'system',
    req.user?.fullName || 'Система',
    req.user?.role || 'SYSTEM',
    'ORDER',
    order.id,
    'STATUS_TRANSITION',
    `Статус изменен: ${prevStatus} -> ${status}`
  );

  broadcastEvent('ORDER_UPDATED', order);

  res.json({
    success: true,
    data: order
  });
});

// POST /api/v1/orders/:id/confirm-delivery (3 methods)
router.post('/:id/confirm-delivery', authenticate, (req: AuthenticatedRequest, res) => {
  const order = serverDb.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({
      success: false,
      error: { code: 'ORDER_NOT_FOUND', message: `Order ${req.params.id} not found`, status: 404 }
    });
  }

  const { confirmationMethod, signatureData, photoUrl, watermarkMeta, geoLat, geoLng } = req.body;

  if (!['E_BUTTON', 'CANVAS_SIGNATURE', 'PHOTO_PROOF'].includes(confirmationMethod)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_CONFIRMATION_METHOD', message: 'Недопустимый метод подтверждения доставки', status: 400 }
    });
  }

  if (confirmationMethod === 'CANVAS_SIGNATURE' && !signatureData) {
    return res.status(400).json({
      success: false,
      error: { code: 'SIGNATURE_REQUIRED', message: 'Для метода CANVAS_SIGNATURE требуется цифровая роспись', status: 400 }
    });
  }

  if (confirmationMethod === 'PHOTO_PROOF' && !photoUrl) {
    return res.status(400).json({
      success: false,
      error: { code: 'PHOTO_REQUIRED', message: 'Для метода PHOTO_PROOF требуется фотофиксация', status: 400 }
    });
  }

  order.status = 'DELIVERED';
  order.confirmationMethod = confirmationMethod;
  order.signatureData = signatureData;
  order.photoUrl = photoUrl;
  order.watermarkMeta = watermarkMeta;
  order.geoLat = geoLat;
  order.geoLng = geoLng;
  order.deliveryConfirmedAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  order.version += 1;
  serverDb.persist();

  serverDb.logAudit(
    req.user?.sub || 'driver',
    req.user?.fullName || 'Водитель',
    req.user?.role || 'TAXSIMOT',
    'ORDER',
    order.id,
    'DELIVERY_CONFIRMED',
    `Доставка заказа ${order.orderNumber} подтверждена методом ${confirmationMethod}. Geo: [${geoLat || 'N/A'}, ${geoLng || 'N/A'}]`
  );

  broadcastEvent('ORDER_UPDATED', order);

  res.json({
    success: true,
    data: order
  });
});

export default router;
