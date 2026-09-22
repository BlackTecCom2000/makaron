import { Router } from 'express';
import { serverDb, type ServerWarehouseAdjustment, type ServerOrderVersion, type ServerPickingTask } from '../db';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth';
import { broadcastEvent } from '../websocket';

const router = Router();

// GET /api/v1/warehouse/stock (and /api/warehouse/stock)
router.get('/stock', authenticate, (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    data: serverDb.stock
  });
});

// POST /api/v1/warehouse/stock/receipt
router.post('/stock/receipt', authenticate, requireRole(['ADMIN', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const { warehouseId, productPackageId, quantity, referenceId } = req.body;
  const qty = Number(quantity) || 0;
  if (qty <= 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_QUANTITY', message: 'Количество должно быть больше нуля', status: 400 }
    });
  }

  const targetWh = warehouseId || 'wh-main-01';
  const item = serverDb.stock.find(s => s.warehouseId === targetWh && s.productPackageId === productPackageId);
  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'STOCK_ITEM_NOT_FOUND', message: `Товар ${productPackageId} не найден на складе`, status: 404 }
    });
  }

  item.quantityPhysical += qty;
  item.availableQuantity = item.quantityPhysical - item.quantityReserved;
  item.updatedAt = new Date().toISOString();

  serverDb.stockMovements.unshift({
    id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    warehouseId: targetWh,
    productPackageId,
    productName: item.productName,
    type: 'PRODUCTION_RECEIPT',
    deltaQuantity: qty,
    balanceAfter: item.availableQuantity,
    referenceId: referenceId || `REC-${Date.now()}`,
    actorId: req.user?.sub || 'usr-zav-1',
    actorName: req.user?.fullName || 'Завсклад',
    createdAt: new Date().toISOString()
  });

  serverDb.logAudit(
    req.user?.sub || 'usr-zav-1',
    req.user?.fullName || 'Завсклад',
    req.user?.role || 'ZAVSKLAD',
    'STOCK',
    item.id,
    'PRODUCTION_RECEIPT',
    `Оприходовано ${qty} шт. товара ${item.productName}. Новый доступный остаток: ${item.availableQuantity} шт.`
  );

  serverDb.persist();
  broadcastEvent('STOCK_UPDATED', item);

  res.json({ success: true, data: item });
});

// GET /api/v1/warehouse/movements
router.get('/movements', authenticate, (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    data: serverDb.stockMovements.slice(0, 100)
  });
});

// POST /api/v1/warehouse/orders/:id/partial (п. 18.2, 19, 63, 82, 114)
router.post('/orders/:id/partial', authenticate, requireRole(['ADMIN', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const order = serverDb.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({
      success: false,
      error: { code: 'ORDER_NOT_FOUND', message: `Заказ ${req.params.id} не найден`, status: 404 }
    });
  }

  const { adjustments, reasonCode, comment } = req.body;
  if (!reasonCode || !comment) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'REASON_REQUIRED',
        message: 'Для частичного утверждения заказа обязательны reasonCode и подробный comment (п. 18.2, 19 ТЗ)',
        status: 400
      }
    });
  }

  if (!adjustments || !Array.isArray(adjustments) || adjustments.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'ADJUSTMENTS_REQUIRED', message: 'Не передан список корректировок позиций (adjustments)', status: 400 }
    });
  }

  // Preserve original requested values, compute delta and new approved amounts
  let newTotalWeight = 0;
  let newTotalSum = 0;

  for (const adj of adjustments) {
    const item = order.items.find(it => it.productId === adj.productId);
    if (!item) continue;

    const requested = item.quantity;
    const approved = Number(adj.approvedQuantity);
    if (approved < 0 || approved > requested) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_APPROVED_QUANTITY',
          message: `Одобренное количество (${approved}) не может быть отрицательным или превышать запрошенное (${requested})`,
          status: 400
        }
      });
    }

    const deltaQty = approved - requested;
    const deltaWeightKg = Math.round(deltaQty * item.weightPerUnitKg * 100) / 100;

    item.approvedQuantity = approved;
    newTotalWeight += approved * item.weightPerUnitKg;
    newTotalSum += approved * item.price;

    const adjRecord: ServerWarehouseAdjustment = {
      id: `adj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      productId: item.productId,
      productName: item.productName,
      requestedQuantity: requested,
      approvedQuantity: approved,
      deltaQuantity: deltaQty,
      deltaWeightKg,
      reasonCode,
      comment,
      createdByUserId: req.user?.sub || 'usr-zav-1',
      createdByName: req.user?.fullName || 'Завсклад',
      createdAt: new Date().toISOString()
    };
    serverDb.warehouseAdjustments.unshift(adjRecord);

    // Reserve stock for approved quantity
    try {
      serverDb.reserveStock(
        order.pointId ? 'wh-main-01' : 'wh-main-01',
        item.productId,
        approved,
        order.id,
        { id: req.user?.sub || 'usr-zav-1', name: req.user?.fullName || 'Завсклад' }
      );
    } catch (stockErr: any) {
      return res.status(422).json({
        success: false,
        error: { code: 'STOCK_RESERVATION_FAILED', message: stockErr.message, status: 422 }
      });
    }
  }

  order.totalWeightKg = Math.round(newTotalWeight * 100) / 100;
  order.totalSum = Math.round(newTotalSum * 100) / 100;
  order.status = 'PARTIALLY_APPROVED';
  order.version += 1;
  order.updatedAt = new Date().toISOString();

  // Create Order Version Snapshot
  const versionRecord: ServerOrderVersion = {
    id: `ver-${order.id}-${order.version}`,
    orderId: order.id,
    versionNumber: order.version,
    changedByUserId: req.user?.sub || 'usr-zav-1',
    changedByName: req.user?.fullName || 'Завсклад',
    changedByRole: req.user?.role || 'ZAVSKLAD',
    changeType: 'WAREHOUSE_PARTIAL_APPROVAL',
    reasonCategory: reasonCode,
    reasonComment: comment,
    snapshot: JSON.parse(JSON.stringify(order)),
    createdAt: new Date().toISOString()
  };
  serverDb.orderVersions.unshift(versionRecord);

  // Automatically generate Picking Task for warehouse team
  const pickingTask: ServerPickingTask = {
    id: `pick-${Date.now().toString().slice(-6)}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    destinationName: order.shopName || order.pointId || 'Точка назначения',
    warehouseId: 'wh-main-01',
    status: 'CREATED',
    assignedWorkerId: 'usr-pck-1',
    assignedWorkerName: 'Собир Комплектовщик',
    items: order.items.map(it => ({
      id: `pi-${Math.random().toString(36).substring(2, 7)}`,
      productId: it.productId,
      productName: it.productName,
      packageWeightKg: it.weightPerUnitKg,
      requiredQty: it.approvedQuantity !== undefined ? it.approvedQuantity : it.quantity,
      pickedQty: 0,
      isCompleted: false
    })),
    createdAt: new Date().toISOString()
  };
  serverDb.pickingTasks.unshift(pickingTask);

  // Log Audit
  serverDb.logAudit(
    req.user?.sub || 'usr-zav-1',
    req.user?.fullName || 'Завсклад',
    req.user?.role || 'ZAVSKLAD',
    'ORDER',
    order.id,
    'WAREHOUSE_PARTIAL_APPROVED',
    `Заказ ${order.orderNumber} утвержден частично. Причина: [${reasonCode}] ${comment}. Сформировано задание на сборку ${pickingTask.id}`
  );

  serverDb.persist();
  broadcastEvent('ORDER_UPDATED', order);
  broadcastEvent('PICKING_TASK_CREATED', pickingTask);

  res.json({
    success: true,
    data: {
      order,
      pickingTask,
      version: versionRecord
    }
  });
});

// POST /api/v1/warehouse/orders/:id/approve (100% confirmation)
router.post('/orders/:id/approve', authenticate, requireRole(['ADMIN', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const order = serverDb.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({
      success: false,
      error: { code: 'ORDER_NOT_FOUND', message: `Заказ ${req.params.id} не найден`, status: 404 }
    });
  }

  // Reserve full stock
  for (const it of order.items) {
    it.approvedQuantity = it.quantity;
    try {
      serverDb.reserveStock(
        'wh-main-01',
        it.productId,
        it.quantity,
        order.id,
        { id: req.user?.sub || 'usr-zav-1', name: req.user?.fullName || 'Завсклад' }
      );
    } catch (stockErr: any) {
      return res.status(422).json({
        success: false,
        error: { code: 'STOCK_RESERVATION_FAILED', message: stockErr.message, status: 422 }
      });
    }
  }

  order.status = 'CONFIRMED';
  order.version += 1;
  order.updatedAt = new Date().toISOString();

  const pickingTask: ServerPickingTask = {
    id: `pick-${Date.now().toString().slice(-6)}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    destinationName: order.shopName || order.pointId || 'Точка назначения',
    warehouseId: 'wh-main-01',
    status: 'CREATED',
    assignedWorkerId: 'usr-pck-1',
    assignedWorkerName: 'Собир Комплектовщик',
    items: order.items.map(it => ({
      id: `pi-${Math.random().toString(36).substring(2, 7)}`,
      productId: it.productId,
      productName: it.productName,
      packageWeightKg: it.weightPerUnitKg,
      requiredQty: it.quantity,
      pickedQty: 0,
      isCompleted: false
    })),
    createdAt: new Date().toISOString()
  };
  serverDb.pickingTasks.unshift(pickingTask);

  serverDb.logAudit(
    req.user?.sub || 'usr-zav-1',
    req.user?.fullName || 'Завсклад',
    req.user?.role || 'ZAVSKLAD',
    'ORDER',
    order.id,
    'WAREHOUSE_100_APPROVED',
    `Заказ ${order.orderNumber} подтвержден на 100%. Передан в комплектацию.`
  );

  serverDb.persist();
  broadcastEvent('ORDER_UPDATED', order);
  broadcastEvent('PICKING_TASK_CREATED', pickingTask);

  res.json({ success: true, data: { order, pickingTask } });
});

export default router;
