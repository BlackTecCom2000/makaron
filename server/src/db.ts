import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type UserRole = 
  | 'ADMIN' 
  | 'POINT' 
  | 'AGENT' 
  | 'SUPERVISOR' 
  | 'ZAVSKLAD' 
  | 'WORKER' 
  | 'PICKER' 
  | 'TAXSIMOT' 
  | 'DIRECTOR' 
  | 'AUDITOR';

export interface ServerUser {
  id: string;
  username: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  pointId?: string;
  agentId?: string;
  phone: string;
}

export interface ServerOrderItem {
  productId: string;
  productName: string;
  quantity: number; // requested
  approvedQuantity?: number;
  price: number;
  weightPerUnitKg: number;
}

export interface ServerOrder {
  id: string;
  orderNumber: string;
  supplyMode: 'MODE_1_POINT' | 'MODE_2_SHOP';
  pointId?: string;
  shopId?: string;
  shopName?: string;
  agentId?: string;
  agentName?: string;
  supervisorId?: string;
  status: 
    | 'DRAFT' 
    | 'SUBMITTED' 
    | 'CONFIRMED' 
    | 'PARTIALLY_APPROVED' 
    | 'COLLECTING' 
    | 'COLLECTED' 
    | 'LOADING' 
    | 'LOADED' 
    | 'DELIVERING' 
    | 'DELIVERED' 
    | 'REJECTED' 
    | 'CANCELLED' 
    | 'COMPLETED';
  items: ServerOrderItem[];
  totalWeightKg: number;
  totalSum: number;
  currency: string;
  notes?: string;
  confirmationMethod?: 'E_BUTTON' | 'CANVAS_SIGNATURE' | 'PHOTO_PROOF';
  signatureData?: string;
  photoUrl?: string;
  watermarkMeta?: any;
  deliveryConfirmedAt?: string;
  geoLat?: number;
  geoLng?: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ServerWarehouseAdjustment {
  id: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  requestedQuantity: number;
  approvedQuantity: number;
  deltaQuantity: number;
  deltaWeightKg: number;
  reasonCode: string;
  comment: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

export interface ServerOrderVersion {
  id: string;
  orderId: string;
  versionNumber: number;
  changedByUserId: string;
  changedByName: string;
  changedByRole: string;
  changeType: string;
  reasonCategory?: string;
  reasonComment?: string;
  snapshot: any;
  createdAt: string;
}

export interface ServerStockItem {
  id: string;
  warehouseId: string;
  productPackageId: string;
  productName: string;
  packageWeightKg: number;
  quantityPhysical: number;
  quantityReserved: number;
  availableQuantity: number; // formula: quantityPhysical - quantityReserved
  minCriticalLevel: number;
  updatedAt: string;
}

export interface ServerStockMovement {
  id: string;
  warehouseId: string;
  productPackageId: string;
  productName: string;
  type: 'PRODUCTION_RECEIPT' | 'ORDER_RESERVE' | 'ORDER_RELEASE' | 'DISPATCH_LOADING' | 'RETURN_INCOME' | 'WRITE_OFF' | 'ADJUSTMENT';
  deltaQuantity: number;
  balanceAfter: number;
  referenceId: string;
  actorId: string;
  actorName: string;
  createdAt: string;
}

export interface ServerPickingItem {
  id: string;
  productId: string;
  productName: string;
  packageWeightKg: number;
  requiredQty: number;
  pickedQty: number;
  isCompleted: boolean;
}

export interface ServerPickingTask {
  id: string;
  orderId: string;
  orderNumber: string;
  destinationName: string;
  warehouseId: string;
  status: 'CREATED' | 'ASSIGNED' | 'IN_PROGRESS' | 'PARTIALLY_PICKED' | 'PICKED' | 'READY_FOR_LOADING' | 'PICKING_PROBLEM';
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  problemReason?: string;
  items: ServerPickingItem[];
  createdAt: string;
  completedAt?: string;
}

export interface ServerRoutePoint {
  id: string;
  routeId: string;
  sequenceOrder: number;
  shopId?: string;
  pointId?: string;
  targetName: string;
  address: string;
  geoLat: number;
  geoLng: number;
  orderId: string;
  orderNumber: string;
  status: 'PENDING' | 'ARRIVED' | 'DELIVERED' | 'RETURNED' | 'PROBLEM';
  packagesCount: number;
  totalWeightKg: number;
  arrivedAt?: string;
  departedAt?: string;
  deviationReason?: string;
}

export interface ServerRouteVersion {
  id: string;
  routeId: string;
  versionNumber: number;
  reason: string;
  modifiedByUserId: string;
  modifiedByName: string;
  pointsSnapshot: ServerRoutePoint[];
  createdAt: string;
}

export interface ServerRoute {
  id: string;
  routeNumber: string;
  vehiclePlate: string;
  driverId: string;
  driverName: string;
  supervisorId: string;
  supervisorName: string;
  date: string;
  status: 'PLANNED' | 'LOCKED' | 'IN_TRANSIT' | 'COMPLETED';
  currentVersion: number;
  startedAt?: string;
  completedAt?: string;
  points: ServerRoutePoint[];
  versions: ServerRouteVersion[];
}

export interface ServerLoading {
  id: string;
  loadingNumber: string;
  routeId: string;
  vehiclePlate: string;
  driverId: string;
  driverName: string;
  orderIds: string[];
  status: 'DRAFT' | 'COLLECTING' | 'WAREHOUSE_VERIFIED' | 'DRIVER_VERIFIED' | 'MATCH' | 'MISMATCH' | 'DISPATCHED' | 'COMPLETED';
  warehouseVerifiedBy?: string;
  warehouseVerifiedAt?: string;
  totalPackagesWarehouse: number;
  totalWeightWarehouseKg: number;
  driverVerifiedAt?: string;
  totalPackagesDriver: number;
  totalWeightDriverKg: number;
  reconciledAt?: string;
  weightDeltaKg: number;
  packageDelta: number;
  canStartRoute: boolean;
  discrepancyReason?: string;
  overrideBy?: string;
  overrideNotes?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ServerReturnItem {
  productId: string;
  productName: string;
  packageWeightKg: number;
  returnQty: number;
  reasonCode: string;
  reasonText: string;
}

export interface ServerReturn {
  id: string;
  returnNumber: string;
  deliveryId: string;
  orderId: string;
  orderNumber: string;
  shopName: string;
  driverId: string;
  driverName: string;
  items: ServerReturnItem[];
  totalWeightKg: number;
  photoUrl?: string;
  status: 'PENDING_WAREHOUSE_RECEIPT' | 'ACCEPTED_INTO_STOCK';
  waybillUrl?: string;
  createdAt: string;
}

export interface ServerPieceworkLog {
  id: string;
  workerId: string;
  workerName: string;
  stationId: string;
  operationType: 'PACKING' | 'SORTING' | 'LABELING' | 'PALLETIZING';
  volumeKg: number;
  tariffPerKg: number;
  totalAmount: number;
  currency: string;
  shiftId?: string;
  createdAt: string;
}

export interface ServerAuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  action: string;
  details: string;
  oldValue?: string;
  newValue?: string;
  ipAddress?: string;
  geoLat?: number;
  geoLng?: number;
}

export interface SyncMutationRecord {
  uuid: string;
  deviceId: string;
  entityType: string;
  action: string;
  status: 'APPLIED' | 'CONFLICT' | 'DUPLICATE';
  serverVersion: number;
  receivedAt: string;
}

export interface ServerNotification {
  id: string;
  userId?: string;
  targetRole?: UserRole;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface ServerBackup {
  id: string;
  filename: string;
  timestamp: string;
  sizeBytes: number;
  checksum: string;
  description: string;
  entityCounts: Record<string, number>;
}

export interface ServerCashAccount {
  id: string;
  code: string;
  name: string;
  openingBalance: number;
  currentBalance: number;
  currency: string;
  isDefault: boolean;
  updatedAt: string;
}

export interface ServerCashTransaction {
  id: string;
  accountId: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  amount: number;
  balanceAfter: number;
  referenceEntity?: string;
  referenceId?: string;
  description: string;
  authorUserId: string;
  authorName: string;
  createdAt: string;
}

export interface ServerProductionOperation {
  id: string;
  batchNumber: string;
  date: string;
  shift: 'SHIFT_1' | 'SHIFT_2';
  lineId: string;
  productPackageId: string;
  productName: string;
  packageWeightKg: number;
  quantity: number;
  totalWeightKg: number;
  workerIds: string[];
  workerNames: string[];
  status: 'IN_PROGRESS' | 'COMPLETED';
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  completedAt?: string;
}

export interface ServerRate {
  id: string;
  operationType: string;
  ratePerKg: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string;
  version: number;
  isActive: boolean;
}

export interface ServerWorkerAttendance {
  id: string;
  workerId: string;
  workerName: string;
  date: string;
  shift: 'SHIFT_1' | 'SHIFT_2';
  status: 'PRESENT' | 'SICK' | 'VACATION' | 'OFF' | 'ABSENT';
  reason?: string;
  recordedByUserId: string;
  recordedByName: string;
  createdAt: string;
}

export interface ServerDatabaseSchema {
  users: ServerUser[];
  orders: ServerOrder[];
  warehouseAdjustments: ServerWarehouseAdjustment[];
  orderVersions: ServerOrderVersion[];
  stock: ServerStockItem[];
  stockMovements: ServerStockMovement[];
  pickingTasks: ServerPickingTask[];
  routes: ServerRoute[];
  loadings: ServerLoading[];
  returns: ServerReturn[];
  pieceworkLogs: ServerPieceworkLog[];
  notifications: ServerNotification[];
  auditLogs: ServerAuditLog[];
  syncMutations: SyncMutationRecord[];
  backups: ServerBackup[];
  cashAccounts: ServerCashAccount[];
  cashTransactions: ServerCashTransaction[];
  productionOperations: ServerProductionOperation[];
  rates: ServerRate[];
  workerAttendance: ServerWorkerAttendance[];
}

export class MasterDatabase {
  private dataDir: string;
  private dbFilePath: string;
  private backupDir: string;
  private state: ServerDatabaseSchema;

  constructor(customDbPath?: string) {
    if (customDbPath) {
      this.dbFilePath = customDbPath;
      this.dataDir = path.dirname(customDbPath);
      this.backupDir = path.join(this.dataDir, 'backups');
    } else {
      this.dataDir = path.resolve(process.cwd(), 'server', 'data');
      this.backupDir = path.join(this.dataDir, 'backups');
      this.dbFilePath = path.join(this.dataDir, 'master_db.json');
    }
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    this.state = this.loadOrInit();
  }

  private loadOrInit(): ServerDatabaseSchema {
    if (fs.existsSync(this.dbFilePath)) {
      try {
        const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        // Ensure all collections exist in case of schema extension
        const initial = this.getInitialSeed();
        const mergedUsers = [...(parsed.users || [])];
        for (const u of initial.users) {
          if (!mergedUsers.some(x => x.username === u.username)) {
            mergedUsers.push(u);
          }
        }
        return {
          ...initial,
          ...parsed,
          users: mergedUsers,
          orders: parsed.orders || initial.orders,
          warehouseAdjustments: parsed.warehouseAdjustments || [],
          orderVersions: parsed.orderVersions || [],
          stock: parsed.stock || initial.stock,
          stockMovements: parsed.stockMovements || initial.stockMovements,
          pickingTasks: parsed.pickingTasks || initial.pickingTasks,
          routes: parsed.routes || initial.routes,
          loadings: parsed.loadings || initial.loadings,
          returns: parsed.returns || [],
          pieceworkLogs: parsed.pieceworkLogs || initial.pieceworkLogs,
          notifications: parsed.notifications || initial.notifications,
          auditLogs: parsed.auditLogs || initial.auditLogs,
          syncMutations: parsed.syncMutations || [],
          backups: parsed.backups || [],
          cashAccounts: parsed.cashAccounts || initial.cashAccounts,
          cashTransactions: parsed.cashTransactions || initial.cashTransactions,
          productionOperations: parsed.productionOperations || initial.productionOperations,
          rates: parsed.rates || initial.rates,
          workerAttendance: parsed.workerAttendance || initial.workerAttendance
        };
      } catch (e) {
        console.error('[DB] Failed reading db file, re-initializing', e);
      }
    }
    const initial = this.getInitialSeed();
    this.saveDirect(initial);
    return initial;
  }

  private saveDirect(data: ServerDatabaseSchema) {
    const tempFile = `${this.dbFilePath}.${Date.now()}-${Math.random().toString(36).substring(2, 6)}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    try {
      fs.renameSync(tempFile, this.dbFilePath);
    } catch (e: any) {
      if (e.code === 'EPERM' || e.code === 'EBUSY') {
        fs.copyFileSync(tempFile, this.dbFilePath);
        try { fs.unlinkSync(tempFile); } catch {}
      } else {
        throw e;
      }
    }
  }

  public persist() {
    this.saveDirect(this.state);
  }

  // Getters
  public get users(): ServerUser[] { return this.state.users; }
  public get orders(): ServerOrder[] { return this.state.orders; }
  public get warehouseAdjustments(): ServerWarehouseAdjustment[] { return this.state.warehouseAdjustments; }
  public get orderVersions(): ServerOrderVersion[] { return this.state.orderVersions; }
  public get stock(): ServerStockItem[] { return this.state.stock; }
  public get stockMovements(): ServerStockMovement[] { return this.state.stockMovements; }
  public get pickingTasks(): ServerPickingTask[] { return this.state.pickingTasks; }
  public get routes(): ServerRoute[] { return this.state.routes; }
  public get loadings(): ServerLoading[] { return this.state.loadings; }
  public get returns(): ServerReturn[] { return this.state.returns; }
  public get pieceworkLogs(): ServerPieceworkLog[] { return this.state.pieceworkLogs; }
  public get notifications(): ServerNotification[] { return this.state.notifications; }
  public get auditLogs(): ServerAuditLog[] { return this.state.auditLogs; }
  public get syncMutations(): SyncMutationRecord[] { return this.state.syncMutations; }
  public get backups(): ServerBackup[] { return this.state.backups; }
  public get cashAccounts(): ServerCashAccount[] { return this.state.cashAccounts; }
  public get cashTransactions(): ServerCashTransaction[] { return this.state.cashTransactions; }
  public get productionOperations(): ServerProductionOperation[] { return this.state.productionOperations; }
  public get rates(): ServerRate[] { return this.state.rates; }
  public get workerAttendance(): ServerWorkerAttendance[] { return this.state.workerAttendance; }

  // Stock Management with strict reservation formula: available = physical - reserved
  public reserveStock(warehouseId: string, productPackageId: string, quantity: number, referenceId: string, actor: { id: string; name: string }) {
    const item = this.state.stock.find(s => s.warehouseId === warehouseId && s.productPackageId === productPackageId);
    if (!item) {
      throw new Error(`Товар ${productPackageId} не найден на складе ${warehouseId}`);
    }
    const available = item.quantityPhysical - item.quantityReserved;
    if (available < quantity) {
      throw new Error(`INSUFFICIENT_STOCK: Недостаточно доступного остатка для ${item.productName}. Доступно: ${available}, запрошено: ${quantity}`);
    }

    item.quantityReserved += quantity;
    item.availableQuantity = item.quantityPhysical - item.quantityReserved;
    item.updatedAt = new Date().toISOString();

    const movement: ServerStockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      warehouseId,
      productPackageId,
      productName: item.productName,
      type: 'ORDER_RESERVE',
      deltaQuantity: quantity,
      balanceAfter: item.availableQuantity,
      referenceId,
      actorId: actor.id,
      actorName: actor.name,
      createdAt: new Date().toISOString()
    };
    this.state.stockMovements.unshift(movement);
    this.persist();
  }

  public releaseStock(warehouseId: string, productPackageId: string, quantity: number, referenceId: string, actor: { id: string; name: string }) {
    const item = this.state.stock.find(s => s.warehouseId === warehouseId && s.productPackageId === productPackageId);
    if (!item) return;

    item.quantityPhysical = Math.max(0, item.quantityPhysical - quantity);
    item.quantityReserved = Math.max(0, item.quantityReserved - quantity);
    item.availableQuantity = item.quantityPhysical - item.quantityReserved;
    item.updatedAt = new Date().toISOString();

    const movement: ServerStockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      warehouseId,
      productPackageId,
      productName: item.productName,
      type: 'DISPATCH_LOADING',
      deltaQuantity: -quantity,
      balanceAfter: item.availableQuantity,
      referenceId,
      actorId: actor.id,
      actorName: actor.name,
      createdAt: new Date().toISOString()
    };
    this.state.stockMovements.unshift(movement);
    this.persist();
  }

  // Backup and Restore
  public createBackup(description: string): ServerBackup {
    const timestamp = new Date().toISOString();
    const cleanTs = timestamp.replace(/[:.]/g, '-');
    const filename = `makaron_backup_${cleanTs}.json`;
    const fullPath = path.join(this.backupDir, filename);

    const dataString = JSON.stringify(this.state, null, 2);
    fs.writeFileSync(fullPath, dataString, 'utf-8');

    const hash = crypto.createHash('sha256').update(dataString).digest('hex');
    const stats = fs.statSync(fullPath);

    const backupRecord: ServerBackup = {
      id: `bck-${Date.now()}`,
      filename,
      timestamp,
      sizeBytes: stats.size,
      checksum: hash,
      description: description || 'Плановый бэкап системы',
      entityCounts: {
        users: this.state.users.length,
        orders: this.state.orders.length,
        stock: this.state.stock.length,
        routes: this.state.routes.length,
        loadings: this.state.loadings.length,
        auditLogs: this.state.auditLogs.length
      }
    };

    this.state.backups.unshift(backupRecord);
    this.persist();
    return backupRecord;
  }

  public restoreBackup(backupId: string): { success: boolean; restoredCounts: Record<string, number> } {
    const record = this.state.backups.find(b => b.id === backupId);
    if (!record) {
      throw new Error(`Бэкап ${backupId} не найден в реестре`);
    }

    const fullPath = path.join(this.backupDir, record.filename);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Файл резервной копии ${record.filename} не существует на диске`);
    }

    const raw = fs.readFileSync(fullPath, 'utf-8');
    const currentHash = crypto.createHash('sha256').update(raw).digest('hex');
    if (currentHash !== record.checksum) {
      throw new Error(`ОШИБКА ЦЕЛОСТНОСТИ БЭКАПА: Контрольная сумма не совпадает (SHA-256 mismatch)`);
    }

    const parsed = JSON.parse(raw);
    this.state = parsed;
    this.persist();

    return {
      success: true,
      restoredCounts: record.entityCounts
    };
  }

  public logAudit(actorId: string, actorName: string, actorRole: string, entityType: string, entityId: string, action: string, details: string, oldValue?: string, newValue?: string) {
    const log: ServerAuditLog = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorId,
      actorName,
      actorRole,
      entityType,
      entityId,
      action,
      details,
      oldValue,
      newValue
    };
    this.state.auditLogs.unshift(log);
    this.persist();
    return log;
  }

  public addNotification(type: string, title: string, message: string, targetRole?: UserRole, userId?: string, entityType?: string, entityId?: string) {
    const notif: ServerNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId,
      targetRole,
      type,
      title,
      message,
      entityType,
      entityId,
      isRead: false,
      createdAt: new Date().toISOString()
    };
    this.state.notifications.unshift(notif);
    this.persist();
    return notif;
  }

  // Cash Operations: BR-CASH-001 Closing = Opening + Income - Expense & Overdraft protection
  public recordCashTransaction(data: {
    accountId?: string;
    type: 'INCOME' | 'EXPENSE';
    category: string;
    amount: number;
    referenceEntity?: string;
    referenceId?: string;
    description: string;
    authorUserId: string;
    authorName: string;
  }): ServerCashTransaction {
    if (data.amount <= 0) {
      throw new Error('Сумма кассовой операции должна быть строго больше нуля');
    }

    const account = data.accountId
      ? this.state.cashAccounts.find(a => a.id === data.accountId)
      : this.state.cashAccounts.find(a => a.isDefault) || this.state.cashAccounts[0];

    if (!account) {
      throw new Error('Кассовый счет не найден в системе');
    }

    if (data.type === 'EXPENSE' && account.currentBalance < data.amount) {
      throw new Error(`INSUFFICIENT_FUNDS: Недостаточно средств в кассе ${account.name}. Доступно: ${account.currentBalance} ${account.currency}, запрошено: ${data.amount} ${account.currency}`);
    }

    if (data.type === 'INCOME') {
      account.currentBalance = Number((account.currentBalance + data.amount).toFixed(2));
    } else {
      account.currentBalance = Number((account.currentBalance - data.amount).toFixed(2));
    }
    account.updatedAt = new Date().toISOString();

    const transaction: ServerCashTransaction = {
      id: `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      accountId: account.id,
      type: data.type,
      category: data.category,
      amount: data.amount,
      balanceAfter: account.currentBalance,
      referenceEntity: data.referenceEntity,
      referenceId: data.referenceId,
      description: data.description,
      authorUserId: data.authorUserId,
      authorName: data.authorName,
      createdAt: new Date().toISOString()
    };

    this.state.cashTransactions.unshift(transaction);

    this.state.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorId: data.authorUserId,
      actorName: data.authorName,
      actorRole: 'CASHIER',
      entityType: 'CASH',
      entityId: transaction.id,
      action: data.type === 'INCOME' ? 'RECORD_CASH_INCOME' : 'RECORD_CASH_EXPENSE',
      details: `Кассовая операция ${transaction.type}: ${data.amount} ${account.currency} [${data.category}]. Остаток после: ${account.currentBalance}`
    });

    this.persist();
    return transaction;
  }

  // Production Operations: BR-PROD-001 total weight = quantity * package_weight & BR-PROD-003 auto stock receipt
  public recordProductionBatch(data: {
    date: string;
    shift: 'SHIFT_1' | 'SHIFT_2';
    lineId: string;
    productPackageId: string;
    productName: string;
    packageWeightKg: number;
    quantity: number;
    workerIds: string[];
    workerNames: string[];
    createdByUserId: string;
    createdByName: string;
  }): ServerProductionOperation {
    if (data.quantity <= 0) {
      throw new Error('Количество выработанных упаковок должно быть строго больше нуля');
    }
    if (data.packageWeightKg <= 0) {
      throw new Error('Вес упаковки должен быть строго больше нуля');
    }

    const totalWeightKg = Number((data.quantity * data.packageWeightKg).toFixed(2));
    const batchNumber = `BATCH-${data.date.replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const op: ServerProductionOperation = {
      id: `prod-op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      batchNumber,
      date: data.date,
      shift: data.shift,
      lineId: data.lineId,
      productPackageId: data.productPackageId,
      productName: data.productName,
      packageWeightKg: data.packageWeightKg,
      quantity: data.quantity,
      totalWeightKg,
      workerIds: data.workerIds,
      workerNames: data.workerNames,
      status: 'COMPLETED',
      createdByUserId: data.createdByUserId,
      createdByName: data.createdByName,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };

    this.state.productionOperations.unshift(op);

    // Auto-receipt to warehouse stock (BR-PROD-003)
    let stockItem = this.state.stock.find(s => s.productPackageId === data.productPackageId);
    if (stockItem) {
      stockItem.quantityPhysical += data.quantity;
      stockItem.availableQuantity = stockItem.quantityPhysical - stockItem.quantityReserved;
      stockItem.updatedAt = new Date().toISOString();
    } else {
      stockItem = {
        id: `stk-${Date.now()}`,
        warehouseId: 'wh-main-01',
        productPackageId: data.productPackageId,
        productName: data.productName,
        packageWeightKg: data.packageWeightKg,
        quantityPhysical: data.quantity,
        quantityReserved: 0,
        availableQuantity: data.quantity,
        minCriticalLevel: 50,
        updatedAt: new Date().toISOString()
      };
      this.state.stock.push(stockItem);
    }

    const movement: ServerStockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      warehouseId: stockItem.warehouseId,
      productPackageId: data.productPackageId,
      productName: data.productName,
      type: 'PRODUCTION_RECEIPT',
      deltaQuantity: data.quantity,
      balanceAfter: stockItem.quantityPhysical,
      referenceId: op.id,
      actorId: data.createdByUserId,
      actorName: data.createdByName,
      createdAt: new Date().toISOString()
    };
    this.state.stockMovements.unshift(movement);

    this.state.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorId: data.createdByUserId,
      actorName: data.createdByName,
      actorRole: 'PRODUCTION_MASTER',
      entityType: 'PRODUCTION',
      entityId: op.id,
      action: 'COMPLETE_PRODUCTION_BATCH',
      details: `Выпуск партии ${batchNumber} (${data.shift}): ${data.quantity} уп. (${totalWeightKg} кг) ${data.productName}. Оприходовано на склад.`
    });

    this.persist();
    return op;
  }

  // Attendance recording: BR-ATT-001
  public recordAttendance(data: {
    workerId: string;
    workerName: string;
    date: string;
    shift: 'SHIFT_1' | 'SHIFT_2';
    status: 'PRESENT' | 'SICK' | 'VACATION' | 'OFF' | 'ABSENT';
    reason?: string;
    recordedByUserId: string;
    recordedByName: string;
  }): ServerWorkerAttendance {
    const existingIndex = this.state.workerAttendance.findIndex(
      a => a.workerId === data.workerId && a.date === data.date && a.shift === data.shift
    );
    const rec: ServerWorkerAttendance = {
      id: existingIndex >= 0 ? this.state.workerAttendance[existingIndex].id : `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workerId: data.workerId,
      workerName: data.workerName,
      date: data.date,
      shift: data.shift,
      status: data.status,
      reason: data.reason,
      recordedByUserId: data.recordedByUserId,
      recordedByName: data.recordedByName,
      createdAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      this.state.workerAttendance[existingIndex] = rec;
    } else {
      this.state.workerAttendance.unshift(rec);
    }
    this.persist();
    return rec;
  }

  // Rates versioning: BR-RATE-001
  public createRate(data: {
    operationType: string;
    ratePerKg: number;
    currency?: string;
    effectiveFrom: string;
  }): ServerRate {
    const existing = this.state.rates.filter(r => r.operationType === data.operationType);
    const version = existing.length + 1;
    // Deactivate previous active rate
    for (const r of existing) {
      if (r.isActive) {
        r.isActive = false;
        r.effectiveTo = data.effectiveFrom;
      }
    }

    const newRate: ServerRate = {
      id: `rate-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      operationType: data.operationType,
      ratePerKg: data.ratePerKg,
      currency: data.currency || 'TJS',
      effectiveFrom: data.effectiveFrom,
      version,
      isActive: true
    };
    this.state.rates.unshift(newRate);
    this.persist();
    return newRate;
  }

  private getInitialSeed(): ServerDatabaseSchema {
    return {
      users: [
        { id: 'usr-admin', username: 'admin', passwordHash: 'admin123', fullName: 'Ином Султонов', role: 'ADMIN', phone: '+992900000001' },
        { id: 'usr-point-1', username: 'point_01', passwordHash: 'point123', fullName: 'Сайида Точка-1', role: 'POINT', pointId: 'pt-01', phone: '+992900000002' },
        { id: 'usr-agent-1', username: 'agent_bahrom', passwordHash: 'agent123', fullName: 'Бахром Умаров', role: 'AGENT', agentId: 'ag-01', phone: '+992900000003' },
        { id: 'usr-sup-1', username: 'supervisor_rustam', passwordHash: 'sup123', fullName: 'Рустам Исмоилов', role: 'SUPERVISOR', phone: '+992900000004' },
        { id: 'usr-zav-1', username: 'zavsklad_alim', passwordHash: 'zav123', fullName: 'Алим Кодиров', role: 'ZAVSKLAD', phone: '+992900000005' },
        { id: 'usr-wrk-1', username: 'worker_davron', passwordHash: 'wrk123', fullName: 'Даврон Мирзоев', role: 'WORKER', phone: '+992900000006' },
        { id: 'usr-pck-1', username: 'picker_sobir', passwordHash: 'pck123', fullName: 'Собир Комплектовщик', role: 'PICKER', phone: '+992900000010' },
        { id: 'usr-drv-1', username: 'driver_farrukh', passwordHash: 'drv123', fullName: 'Фаррух Доставка', role: 'TAXSIMOT', phone: '+992900000007' },
        { id: 'usr-dir-1', username: 'director_somon', passwordHash: 'dir123', fullName: 'Сомон Рахимов', role: 'DIRECTOR', phone: '+992900000008' },
        { id: 'usr-aud-1', username: 'auditor_safia', passwordHash: 'aud123', fullName: 'Сафия Назарова', role: 'AUDITOR', phone: '+992900000009' }
      ],
      orders: [
        {
          id: 'ord-001',
          orderNumber: 'ORD-2026-001',
          supplyMode: 'MODE_1_POINT',
          pointId: 'pt-01',
          status: 'COLLECTED',
          items: [
            { productId: 'prod-01', productName: 'Спагетти Экстра 400г', quantity: 500, approvedQuantity: 500, price: 6.50, weightPerUnitKg: 0.40 },
            { productId: 'prod-02', productName: 'Рожки Традиционные 1кг', quantity: 300, approvedQuantity: 300, price: 12.00, weightPerUnitKg: 1.00 }
          ],
          totalWeightKg: 500.00,
          totalSum: 6850.00,
          currency: 'TJS',
          notes: 'Срочная утренняя поставка',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1
        }
      ],
      warehouseAdjustments: [],
      orderVersions: [],
      stock: [
        {
          id: 'stk-01',
          warehouseId: 'wh-main-01',
          productPackageId: 'prod-01',
          productName: 'Спагетти Экстра 400г',
          packageWeightKg: 0.40,
          quantityPhysical: 5000,
          quantityReserved: 500,
          availableQuantity: 4500,
          minCriticalLevel: 500,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'stk-02',
          warehouseId: 'wh-main-01',
          productPackageId: 'prod-02',
          productName: 'Рожки Традиционные 1кг',
          packageWeightKg: 1.00,
          quantityPhysical: 3000,
          quantityReserved: 300,
          availableQuantity: 2700,
          minCriticalLevel: 300,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'stk-03',
          warehouseId: 'wh-main-01',
          productPackageId: 'prod-03',
          productName: 'Вермишель Тонкая 23кг',
          packageWeightKg: 23.00,
          quantityPhysical: 400,
          quantityReserved: 0,
          availableQuantity: 400,
          minCriticalLevel: 50,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'stk-04',
          warehouseId: 'wh-main-01',
          productPackageId: 'prod-04',
          productName: 'Макароны Перо 23кг',
          packageWeightKg: 23.00,
          quantityPhysical: 600,
          quantityReserved: 0,
          availableQuantity: 600,
          minCriticalLevel: 50,
          updatedAt: new Date().toISOString()
        }
      ],
      stockMovements: [
        {
          id: 'mov-init-1',
          warehouseId: 'wh-main-01',
          productPackageId: 'prod-01',
          productName: 'Спагетти Экстра 400г',
          type: 'PRODUCTION_RECEIPT',
          deltaQuantity: 5000,
          balanceAfter: 5000,
          referenceId: 'BATCH-2026-001',
          actorId: 'usr-admin',
          actorName: 'Система',
          createdAt: new Date().toISOString()
        }
      ],
      pickingTasks: [
        {
          id: 'pick-001',
          orderId: 'ord-001',
          orderNumber: 'ORD-2026-001',
          destinationName: 'Собственная Точка №1 (ул. Айни 45)',
          warehouseId: 'wh-main-01',
          status: 'READY_FOR_LOADING',
          assignedWorkerId: 'usr-pck-1',
          assignedWorkerName: 'Собир Комплектовщик',
          items: [
            { id: 'pi-1', productId: 'prod-01', productName: 'Спагетти Экстра 400г', packageWeightKg: 0.40, requiredQty: 500, pickedQty: 500, isCompleted: true },
            { id: 'pi-2', productId: 'prod-02', productName: 'Рожки Традиционные 1кг', packageWeightKg: 1.00, requiredQty: 300, pickedQty: 300, isCompleted: true }
          ],
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        }
      ],
      routes: [
        {
          id: 'rt-001',
          routeNumber: 'ROUTE-2026-001',
          vehiclePlate: '01 777 TJ 01',
          driverId: 'usr-drv-1',
          driverName: 'Фаррух Доставка',
          supervisorId: 'usr-sup-1',
          supervisorName: 'Рустам Исмоилов',
          date: '2026-09-23',
          status: 'PLANNED',
          currentVersion: 1,
          points: [
            {
              id: 'rp-01',
              routeId: 'rt-001',
              sequenceOrder: 1,
              pointId: 'pt-01',
              targetName: 'Собственная Точка №1',
              address: 'ул. Айни 45, Душанбе',
              geoLat: 38.56012,
              geoLng: 68.77543,
              orderId: 'ord-001',
              orderNumber: 'ORD-2026-001',
              status: 'PENDING',
              packagesCount: 800,
              totalWeightKg: 500.00
            }
          ],
          versions: [
            {
              id: 'rv-01-1',
              routeId: 'rt-001',
              versionNumber: 1,
              reason: 'Базовый утвержденный маршрут',
              modifiedByUserId: 'usr-sup-1',
              modifiedByName: 'Рустам Исмоилов',
              pointsSnapshot: [],
              createdAt: new Date().toISOString()
            }
          ]
        }
      ],
      loadings: [
        {
          id: 'load-001',
          loadingNumber: 'LOAD-2026-001',
          routeId: 'rt-001',
          vehiclePlate: '01 777 TJ 01',
          driverId: 'usr-drv-1',
          driverName: 'Фаррух Доставка',
          orderIds: ['ord-001'],
          status: 'WAREHOUSE_VERIFIED',
          warehouseVerifiedBy: 'usr-zav-1',
          warehouseVerifiedAt: new Date().toISOString(),
          totalPackagesWarehouse: 800,
          totalWeightWarehouseKg: 500.00,
          totalPackagesDriver: 0,
          totalWeightDriverKg: 0,
          weightDeltaKg: 0,
          packageDelta: 0,
          canStartRoute: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1
        }
      ],
      returns: [],
      pieceworkLogs: [
        {
          id: 'pw-001',
          workerId: 'usr-wrk-1',
          workerName: 'Даврон Мирзоев',
          stationId: 'LINE-01',
          operationType: 'PACKING',
          volumeKg: 650.00,
          tariffPerKg: 0.35,
          totalAmount: 227.50,
          currency: 'TJS',
          createdAt: new Date().toISOString()
        }
      ],
      notifications: [
        {
          id: 'notif-01',
          targetRole: 'ZAVSKLAD',
          type: 'ORDER_SUBMITTED',
          title: 'Новая заявка на рассмотрении',
          message: 'Заявка ORD-2026-001 от Точки №1 поступила на согласование склада',
          entityType: 'ORDER',
          entityId: 'ord-001',
          isRead: false,
          createdAt: new Date().toISOString()
        }
      ],
      auditLogs: [
        {
          id: 'aud-init',
          timestamp: new Date().toISOString(),
          actorId: 'usr-admin',
          actorName: 'Ином Султонов',
          actorRole: 'ADMIN',
          entityType: 'SYSTEM',
          entityId: 'ROOT',
          action: 'SYSTEM_INITIALIZED',
          details: 'Master Database schema v1.1 initialized with full 129 chapters compliance on Drive F:'
        }
      ],
      syncMutations: [],
      backups: [],
      cashAccounts: [
        {
          id: 'cash-main-01',
          code: 'CASH-MAIN-01',
          name: 'Главная операционная касса BlackTecCom',
          openingBalance: 50000.00,
          currentBalance: 50000.00,
          currency: 'TJS',
          isDefault: true,
          updatedAt: new Date().toISOString()
        }
      ],
      cashTransactions: [
        {
          id: 'ctx-init-1',
          accountId: 'cash-main-01',
          type: 'INCOME',
          category: 'OPENING_BALANCE',
          amount: 50000.00,
          balanceAfter: 50000.00,
          description: 'Ввод начального операционного остатка кассы',
          authorUserId: 'usr-admin',
          authorName: 'Ином Султонов',
          createdAt: new Date().toISOString()
        }
      ],
      productionOperations: [
        {
          id: 'prod-op-001',
          batchNumber: 'BATCH-2026-001',
          date: new Date().toISOString().split('T')[0],
          shift: 'SHIFT_1',
          lineId: 'LINE-01',
          productPackageId: 'prod-03',
          productName: 'Вермишель Тонкая 23кг',
          packageWeightKg: 23.00,
          quantity: 100,
          totalWeightKg: 2300.00,
          workerIds: ['usr-wrk-1'],
          workerNames: ['Даврон Мирзоев'],
          status: 'COMPLETED',
          createdByUserId: 'usr-admin',
          createdByName: 'Ином Султонов',
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        }
      ],
      rates: [
        {
          id: 'rate-01',
          operationType: 'PACKING',
          ratePerKg: 0.35,
          currency: 'TJS',
          effectiveFrom: '2026-01-01',
          version: 1,
          isActive: true
        },
        {
          id: 'rate-02',
          operationType: 'LOADING',
          ratePerKg: 0.10,
          currency: 'TJS',
          effectiveFrom: '2026-01-01',
          version: 1,
          isActive: true
        }
      ],
      workerAttendance: [
        {
          id: 'att-001',
          workerId: 'usr-wrk-1',
          workerName: 'Даврон Мирзоев',
          date: new Date().toISOString().split('T')[0],
          shift: 'SHIFT_1',
          status: 'PRESENT',
          recordedByUserId: 'usr-zav-1',
          recordedByName: 'Алим Кодиров',
          createdAt: new Date().toISOString()
        }
      ]
    };
  }
}

export const serverDb = new MasterDatabase();
