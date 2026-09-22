import { Router } from 'express';
import { serverDb, type SyncMutationRecord } from '../db';
import { broadcastEvent } from '../websocket';

const router = Router();

// POST /api/v1/sync/push (Batch mutation ingestion with idempotency check)
router.post('/push', (req, res) => {
  const { deviceId, clientBatchId, clientTimestamp, mutations } = req.body;

  if (!mutations || !Array.isArray(mutations)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_MUTATIONS_BATCH', message: 'Поле mutations должно быть массивом', status: 400 }
    });
  }

  const results: Array<{ uuid: string; status: string; serverId?: string; serverVersion?: number; error?: string }> = [];

  for (const mut of mutations) {
    const { uuid, entityType, action, payload } = mut;

    // 1. Idempotency Check: UUID must be unique
    const existing = serverDb.syncMutations.find(m => m.uuid === uuid);
    if (existing) {
      results.push({
        uuid,
        status: 'DUPLICATE',
        serverVersion: existing.serverVersion
      });
      continue;
    }

    try {
      let serverId = payload?.id;
      let serverVersion = 1;

      // 2. Apply Entity Mutation
      if (entityType === 'orders' || entityType === 'order') {
        if (action === 'CREATE') {
          const newOrder = {
            ...payload,
            version: 1,
            createdAt: payload.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          serverDb.orders.unshift(newOrder);
          serverId = newOrder.id;
          serverVersion = newOrder.version;
          broadcastEvent('ORDER_CREATED', newOrder);
        } else if (action === 'UPDATE_STATUS' || action === 'CONFIRM_DELIVERY' || action === 'UPDATE') {
          const target = serverDb.orders.find(o => o.id === payload.id || o.id === payload.orderId);
          if (target) {
            Object.assign(target, payload);
            target.version += 1;
            target.updatedAt = new Date().toISOString();
            serverId = target.id;
            serverVersion = target.version;
            broadcastEvent('ORDER_UPDATED', target);
          }
        }
      } else if (entityType === 'loadings' || entityType === 'loading') {
        const targetLoading = serverDb.loadings.find(l => l.id === payload.id);
        if (targetLoading) {
          Object.assign(targetLoading, payload);
          targetLoading.version += 1;
          targetLoading.updatedAt = new Date().toISOString();
          serverId = targetLoading.id;
          serverVersion = targetLoading.version;
          broadcastEvent('LOADING_UPDATED', targetLoading);
        }
      } else if (entityType === 'piecework' || entityType === 'pieceworkLogs' || entityType === 'workerWorkLogs') {
        if (action === 'CREATE') {
          const vol = Number(payload.volumeKg) || 0;
          const op = payload.operationType || 'Комплектация';
          const activeRate = serverDb.rates.find(
            r => (r.operationType.toLowerCase() === op.toLowerCase() ||
                 (op.toLowerCase().includes('комплект') && r.operationType === 'PACKING')) &&
                 r.isActive
          );
          const tariff = activeRate ? activeRate.ratePerKg : ((op.toLowerCase().includes('комплект') || op === 'LOADING') ? 0.15 : 0.35);
          const totalAmount = Math.round(vol * tariff * 100) / 100;

          const pieceworkRecord = {
            ...payload,
            volumeKg: vol,
            operationType: op,
            tariffPerKg: tariff,
            totalAmount,
            isLocked: true,
            lockedAt: payload.lockedAt || new Date().toISOString()
          };
          serverDb.pieceworkLogs.unshift(pieceworkRecord);
          serverId = pieceworkRecord.id;
        } else if (action === 'UPDATE' || action === 'DELETE') {
          const isExec = req.user?.role === 'ADMIN' || req.user?.role === 'DIRECTOR';
          if (!isExec) {
            throw new Error('FORBIDDEN_IMMUTABLE_LOG: Зафиксированные записи выработки защищены от изменений завскладом');
          }
          if (action === 'UPDATE') {
            const target = serverDb.pieceworkLogs.find(l => l.id === payload.id);
            if (target) {
              Object.assign(target, payload);
              target.totalAmount = Math.round((target.volumeKg || 0) * (target.tariffPerKg || 0.15) * 100) / 100;
              serverId = target.id;
            }
          } else if (action === 'DELETE') {
            const idx = serverDb.pieceworkLogs.findIndex(l => l.id === payload.id);
            if (idx !== -1) {
              serverDb.pieceworkLogs.splice(idx, 1);
            }
          }
        }
      }

      // 3. Record in Idempotency Registry
      const rec: SyncMutationRecord = {
        uuid,
        deviceId: deviceId || 'unknown-device',
        entityType,
        action,
        status: 'APPLIED',
        serverVersion,
        receivedAt: new Date().toISOString()
      };
      serverDb.syncMutations.unshift(rec);

      serverDb.logAudit(
        deviceId || 'sync-engine',
        `Device ${deviceId || 'N/A'}`,
        'OFFLINE_SYNC',
        entityType.toUpperCase(),
        serverId || uuid,
        `SYNC_${action}`,
        `Офлайн-мутация ${uuid} успешно применена сервером (действие: ${action})`
      );

      results.push({
        uuid,
        status: 'APPLIED',
        serverId,
        serverVersion
      });
    } catch (err: any) {
      results.push({
        uuid,
        status: 'ERROR',
        error: err.message || 'Ошибка обработки мутации'
      });
    }
  }

  serverDb.persist();

  res.json({
    success: true,
    processed: results.length,
    results,
    serverTimestamp: new Date().toISOString()
  });
});

// POST /api/v1/sync/pull (Fetch server delta updates)
router.post('/pull', (req, res) => {
  const { lastSyncedAt, subscribedEntities } = req.body;
  const sinceTime = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0;

  const ordersDelta = serverDb.orders.filter(o => new Date(o.updatedAt).getTime() > sinceTime);
  const loadingsDelta = serverDb.loadings.filter(l => new Date(l.updatedAt).getTime() > sinceTime);

  res.json({
    success: true,
    serverTimestamp: new Date().toISOString(),
    hasMore: false,
    changes: {
      orders: ordersDelta,
      loadings: loadingsDelta,
      pieceworkLogs: serverDb.pieceworkLogs.slice(0, 50)
    }
  });
});

// GET /api/v1/sync/status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      totalMutationsReceived: serverDb.syncMutations.length,
      totalOrders: serverDb.orders.length,
      totalLoadings: serverDb.loadings.length,
      serverTime: new Date().toISOString()
    }
  });
});

export default router;
