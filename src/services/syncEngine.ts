import { db } from '../db/database';
import type { SyncQueueItem } from '../types';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const WS_URL = 'ws://localhost:3001/ws/v1';

class SyncEngineService {
  private _isSimulatedOffline: boolean = false;
  private _listeners: Array<(online: boolean, pendingCount: number) => void> = [];
  private _socket: WebSocket | null = null;
  private _deviceId: string;

  constructor() {
    this._deviceId = 'device-pwa-' + (typeof window !== 'undefined' ? window.navigator.userAgent.substring(0, 15).replace(/\W/g, '') : 'client');
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange());
      window.addEventListener('offline', () => this.handleNetworkChange());
      this.initWebSocket();
    }
  }

  public get isOnline(): boolean {
    if (this._isSimulatedOffline) return false;
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  public setSimulatedOffline(offline: boolean) {
    this._isSimulatedOffline = offline;
    this.notify();
    if (!offline) {
      this.triggerSync();
    }
  }

  public toggleSimulation(): boolean {
    this.setSimulatedOffline(!this._isSimulatedOffline);
    return this.isOnline;
  }

  public subscribe(callback: (online: boolean, pendingCount: number) => void) {
    this._listeners.push(callback);
    this.notify();
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  }

  private async notify() {
    const count = await this.getPendingCount();
    const online = this.isOnline;
    this._listeners.forEach(cb => cb(online, count));
  }

  private handleNetworkChange() {
    this.notify();
    if (this.isOnline) {
      this.triggerSync();
      this.initWebSocket();
    } else {
      if (this._socket) {
        this._socket.close();
        this._socket = null;
      }
    }
  }

  private initWebSocket() {
    if (!this.isOnline || this._socket) return;
    try {
      this._socket = new WebSocket(WS_URL);
      this._socket.onopen = () => {
        console.log('[SyncEngine] Realtime WebSocket connected to server');
      };
      this._socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('[SyncEngine] WebSocket broadcast received:', msg.event);
        } catch {
          // ignore
        }
      };
      this._socket.onclose = () => {
        this._socket = null;
      };
      this._socket.onerror = () => {
        this._socket = null;
      };
    } catch (e) {
      // WS connection fallback
    }
  }

  public async getPendingCount(): Promise<number> {
    try {
      return await db.syncQueue
        .where('syncStatus')
        .anyOf('QUEUED', 'LOCAL', 'SYNCING', 'CONFLICT')
        .count();
    } catch {
      return 0;
    }
  }

  public async queueMutation(
    entityType: SyncQueueItem['entityType'],
    action: SyncQueueItem['action'],
    payload: any
  ): Promise<string> {
    const uuid = crypto.randomUUID ? crypto.randomUUID() : 'uuid-' + Math.random().toString(36).substring(2, 9);
    const item: SyncQueueItem = {
      uuid,
      entityType,
      action,
      payload,
      clientTimestamp: new Date().toISOString(),
      deviceId: this._deviceId,
      syncStatus: this.isOnline ? 'SYNCING' : 'QUEUED',
      retryCount: 0
    };

    await db.syncQueue.add(item);
    this.notify();

    if (this.isOnline) {
      this.processSingle(uuid);
    }

    return uuid;
  }

  private async processSingle(uuid: string) {
    if (!this.isOnline) return;
    try {
      const item = await db.syncQueue.get(uuid);
      if (!item) return;

      const res = await fetch(`${API_BASE_URL}/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this._deviceId,
          clientBatchId: `batch-${Date.now()}`,
          clientTimestamp: new Date().toISOString(),
          mutations: [{
            uuid: item.uuid,
            entityType: item.entityType,
            action: item.action,
            clientTimestamp: item.clientTimestamp,
            payload: item.payload
          }]
        })
      });

      if (res.ok) {
        await db.syncQueue.update(uuid, {
          syncStatus: 'SYNCED',
          retryCount: item.retryCount + 1
        });
      } else {
        const errJson = await res.json().catch(() => ({}));
        await db.syncQueue.update(uuid, {
          syncStatus: 'CONFLICT',
          error: errJson.error?.message || `HTTP ${res.status}`
        });
      }
      this.notify();
    } catch (e: any) {
      // Network failure: keep queued for next sync attempt
      const item = await db.syncQueue.get(uuid);
      if (item) {
        await db.syncQueue.update(uuid, {
          syncStatus: 'QUEUED',
          retryCount: (item.retryCount || 0) + 1,
          error: e.message || 'Сетевая ошибка'
        });
      }
      this.notify();
    }
  }

  public async triggerSync(): Promise<{ synced: number; conflicts: number }> {
    if (!this.isOnline) return { synced: 0, conflicts: 0 };

    const pending = await db.syncQueue
      .where('syncStatus')
      .anyOf('QUEUED', 'LOCAL', 'CONFLICT')
      .toArray();

    if (pending.length === 0) {
      this.notify();
      return { synced: 0, conflicts: 0 };
    }

    let synced = 0;
    let conflicts = 0;

    // Send batch to server
    try {
      const mutations = pending.map(it => ({
        uuid: it.uuid,
        entityType: it.entityType,
        action: it.action,
        clientTimestamp: it.clientTimestamp,
        payload: it.payload
      }));

      const res = await fetch(`${API_BASE_URL}/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this._deviceId,
          clientBatchId: `batch-${Date.now()}`,
          clientTimestamp: new Date().toISOString(),
          mutations
        })
      });

      if (res.ok) {
        const data = await res.json();
        const appliedUuids = new Set(data.results?.filter((r: any) => r.status === 'APPLIED' || r.status === 'DUPLICATE').map((r: any) => r.uuid));

        for (const item of pending) {
          if (appliedUuids.has(item.uuid)) {
            await db.syncQueue.update(item.uuid, { syncStatus: 'SYNCED' });
            synced++;
          } else {
            await db.syncQueue.update(item.uuid, { syncStatus: 'CONFLICT', error: 'Server conflict' });
            conflicts++;
          }
        }
      } else {
        // Server returned error status
        for (const item of pending) {
          await db.syncQueue.update(item.uuid, { syncStatus: 'QUEUED', retryCount: item.retryCount + 1 });
        }
      }
    } catch (networkErr: any) {
      // Backend not reached, leave items queued
      for (const item of pending) {
        await db.syncQueue.update(item.uuid, {
          syncStatus: 'QUEUED',
          retryCount: item.retryCount + 1,
          error: networkErr.message || 'Ошибка связи'
        });
      }
    }

    this.notify();
    return { synced, conflicts };
  }
}

export const syncEngine = new SyncEngineService();
