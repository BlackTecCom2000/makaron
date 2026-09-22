import { Router } from 'express';
import { serverDb, type ServerPickingTask } from '../db';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth';
import { broadcastEvent } from '../websocket';

const router = Router();

// GET /api/v1/picking/tasks
router.get('/tasks', authenticate, (req: AuthenticatedRequest, res) => {
  let tasks = [...serverDb.pickingTasks];
  if (req.user?.role === 'PICKER') {
    // Pickers see tasks assigned to them or unassigned
    tasks = tasks.filter(t => !t.assignedWorkerId || t.assignedWorkerId === req.user?.sub);
  }
  res.json({ success: true, data: tasks });
});

// POST /api/v1/picking/tasks/:id/start
router.post('/tasks/:id/start', authenticate, requireRole(['ADMIN', 'PICKER', 'WORKER', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const task = serverDb.pickingTasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Задание на комплектацию не найдено', status: 404 }
    });
  }

  task.status = 'IN_PROGRESS';
  task.assignedWorkerId = req.user?.sub;
  task.assignedWorkerName = req.user?.fullName;
  serverDb.persist();

  broadcastEvent('PICKING_TASK_UPDATED', task);
  res.json({ success: true, data: task });
});

// PATCH /api/v1/picking/items/:id (1-tap increment / update picked count)
router.patch('/items/:id', authenticate, requireRole(['ADMIN', 'PICKER', 'WORKER', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  let foundItem: any = null;
  let parentTask: ServerPickingTask | null = null;

  for (const t of serverDb.pickingTasks) {
    const item = t.items.find(i => i.id === req.params.id);
    if (item) {
      foundItem = item;
      parentTask = t;
      break;
    }
  }

  if (!foundItem || !parentTask) {
    return res.status(404).json({
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: 'Позиция комплектации не найдена', status: 404 }
    });
  }

  const { pickedQty, increment } = req.body;
  if (increment !== undefined) {
    foundItem.pickedQty = Math.min(foundItem.requiredQty, foundItem.pickedQty + Number(increment));
  } else if (pickedQty !== undefined) {
    foundItem.pickedQty = Number(pickedQty);
  }

  foundItem.isCompleted = foundItem.pickedQty >= foundItem.requiredQty;

  // Check if all items in task are complete
  const allComplete = parentTask.items.every(i => i.isCompleted);
  if (allComplete) {
    parentTask.status = 'PICKED';
  } else if (parentTask.items.some(i => i.pickedQty > 0)) {
    parentTask.status = 'PARTIALLY_PICKED';
  }

  serverDb.persist();
  broadcastEvent('PICKING_TASK_UPDATED', parentTask);

  res.json({ success: true, data: { item: foundItem, task: parentTask } });
});

// POST /api/v1/picking/tasks/:id/complete
router.post('/tasks/:id/complete', authenticate, requireRole(['ADMIN', 'PICKER', 'WORKER', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const task = serverDb.pickingTasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Задание на комплектацию не найдено', status: 404 }
    });
  }

  // Force all items to complete if worker clicks finish
  task.items.forEach(i => {
    i.pickedQty = i.requiredQty;
    i.isCompleted = true;
  });

  task.status = 'READY_FOR_LOADING';
  task.completedAt = new Date().toISOString();

  // Update related order status
  const order = serverDb.orders.find(o => o.id === task.orderId);
  if (order) {
    order.status = 'COLLECTED';
    order.updatedAt = new Date().toISOString();
    order.version += 1;
    broadcastEvent('ORDER_UPDATED', order);
  }

  serverDb.logAudit(
    req.user?.sub || 'picker',
    req.user?.fullName || 'Комплектовщик',
    req.user?.role || 'PICKER',
    'PICKING',
    task.id,
    'COMPLETE_PICKING',
    `Заказ ${task.orderNumber} скомплектован (${task.items.length} позиций) и передан на рампу к погрузке`
  );

  serverDb.persist();
  broadcastEvent('PICKING_TASK_UPDATED', task);

  res.json({ success: true, data: task });
});

// POST /api/v1/picking/tasks/:id/problem
router.post('/tasks/:id/problem', authenticate, requireRole(['ADMIN', 'PICKER', 'WORKER', 'ZAVSKLAD']), (req: AuthenticatedRequest, res) => {
  const task = serverDb.pickingTasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Задание не найдено', status: 404 }
    });
  }

  const { problemReason } = req.body;
  task.status = 'PICKING_PROBLEM';
  task.problemReason = problemReason || 'Проблема при сборке (дефект упаковки/дефицит на полке)';

  serverDb.addNotification(
    'PICKING_PROBLEM',
    'Проблема комплектации',
    `Сборщик ${req.user?.fullName} сообщил о проблеме по заказу ${task.orderNumber}: ${task.problemReason}`,
    'ZAVSKLAD',
    undefined,
    'PICKING',
    task.id
  );

  serverDb.persist();
  broadcastEvent('PICKING_TASK_UPDATED', task);

  res.json({ success: true, data: task });
});

export default router;
