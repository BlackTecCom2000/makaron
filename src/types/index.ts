export type RoleCode = 
  | 'ADMIN' 
  | 'ZAVSKLAD' 
  | 'WORKER' 
  | 'PICKER' 
  | 'AGENT' 
  | 'SUPERVISOR' 
  | 'TAXSIMOT' 
  | 'POINT' 
  | 'DIRECTOR' 
  | 'AUDITOR';

export interface User {
  id: string;
  username: string;
  fullName: string;
  phone: string;
  role: RoleCode;
  regionId: string;
  warehouseId?: string;
  pointId?: string;
  avatarUrl?: string;
  isActive: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string;
  geoLat: number;
  geoLng: number;
  managerUserId: string;
  managerName?: string;
  isActive: boolean;
}

export interface CompanyPoint {
  id: string;
  warehouseId: string;
  name: string;
  pointCode: string;
  address: string;
  geoLat: number;
  geoLng: number;
  contactName: string;
  contactPhone: string;
  isActive: boolean;
}

export interface Shop {
  id: string;
  registeredByAgentId: string;
  registeredByAgentName?: string;
  name: string;
  shopType: 'Мини-маркет' | 'Продуктовый магазин' | 'Оптовая точка' | 'Супермаркет';
  address: string;
  geoLat: number;
  geoLng: number;
  ownerName: string;
  phone: string;
  storefrontPhotoUrl?: string;
  openingHours: string;
  status: 'ACTIVE' | 'PENDING_REVIEW' | 'BLOCKED';
  hasActiveOrder?: boolean;
  hasDraftOrder?: boolean;
  createdAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string; // e.g. Вермишель, Макароны, Лапша, Рожки, Спагетти
  sku: string;
  description?: string;
}

export interface ProductPackage {
  id: string;
  productId: string;
  productName: string;
  packageWeightKg: number; // 5, 10, 15, 23, 25, 50
  unitType: 'мешок' | 'коробка' | 'пачка' | 'паллета';
  barcode?: string;
  isActive: boolean;
}

export interface Stock {
  id: string;
  warehouseId: string;
  productPackageId: string;
  productName: string;
  packageWeightKg: number;
  quantityPhysical: number; // физический остаток (мешков)
  quantityReserved: number; // зарезервировано под сборку
  minCriticalLevel: number; // порог безопасности (Safety Stock)
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  warehouseId: string;
  productPackageId: string;
  productName: string;
  movementType: 'PRODUCTION_RECEIPT' | 'ORDER_RESERVE' | 'ORDER_RELEASE' | 'DISPATCH_LOADING' | 'RETURN_INCOME' | 'WRITE_OFF';
  deltaQuantity: number;
  balanceAfter: number;
  referenceId: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

export type OrderMode = 'MODE_1_DIRECT' | 'MODE_2_AGENT';

export type OrderStatus = 
  | 'DRAFT' 
  | 'SUBMITTED' 
  | 'SUPERVISOR_REVIEW' 
  | 'WAREHOUSE_REVIEW' 
  | 'PARTIALLY_APPROVED' 
  | 'APPROVED' 
  | 'PICKING' 
  | 'READY_FOR_LOADING' 
  | 'LOADED' 
  | 'IN_TRANSIT' 
  | 'ARRIVED' 
  | 'DELIVERED' 
  | 'CONFIRMED' 
  | 'COMPLETED' 
  | 'PROBLEM';

export interface OrderItem {
  id: string;
  orderId: string;
  productPackageId: string;
  productName: string;
  packageWeightKg: number;
  unitType: string;
  requestedQty: number; // Запрошено
  approvedSupervisorQty: number; // Одобрено супервайзером
  approvedWarehouseQty: number; // Подтверждено завскладом
  finalDeliveredQty?: number; // Фактически передано
  unitWeightKg: number;
}

export interface OrderVersion {
  id: string;
  orderId: string;
  versionNumber: number;
  authorUserId: string;
  authorName: string;
  authorRole: RoleCode;
  changeType: 'CREATED' | 'SUPERVISOR_ADJUSTMENT' | 'WAREHOUSE_ADJUSTMENT' | 'SUPERVISOR_ACCEPT' | 'DISPATCH' | 'PROBLEM';
  reasonCategory?: string;
  reasonComment?: string;
  diffSummary: string;
  timestamp: string;
}

export interface OrderComment {
  id: string;
  orderId: string;
  authorUserId: string;
  authorName: string;
  authorRole: RoleCode;
  commentText: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string; // e.g. #000152
  mode: OrderMode;
  status: OrderStatus;
  shopId?: string;
  pointId?: string;
  destinationName: string;
  destinationAddress: string;
  destinationLat: number;
  destinationLng: number;
  createdByUserId: string;
  createdByName: string;
  createdByRole: RoleCode;
  supervisorUserId?: string;
  supervisorName?: string;
  zavskladUserId?: string;
  zavskladName?: string;
  totalWeightKg: number;
  totalItemsCount: number;
  clientUuid: string;
  items: OrderItem[];
  history: OrderVersion[];
  comments: OrderComment[];
  createdAt: string;
  updatedAt: string;
}

export interface PickingItem {
  id: string;
  productPackageId: string;
  productName: string;
  packageWeightKg: number;
  requiredQty: number;
  pickedQty: number;
  isCompleted: boolean;
}

export interface PickingTask {
  id: string;
  orderId: string;
  orderNumber: string;
  destinationName: string;
  warehouseId: string;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';
  assignedWorkerIds: string[];
  assignedWorkerNames: string[];
  items: PickingItem[];
  createdAt: string;
  completedAt?: string;
}

export interface Worker {
  id: string;
  warehouseId: string;
  fullName: string;
  position: 'Комплектовщик' | 'Грузчик' | 'Оператор рампы' | 'Карщик';
  phone: string;
  hireDate: string;
  avatarUrl?: string;
  isActive: boolean;
}

export type AttendanceStatus = 'PRESENT' | 'SICK' | 'VACATION' | 'DAY_OFF' | 'ABSENT';

export interface WorkerAttendance {
  id: string;
  workerId: string;
  workerName: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  reason?: string;
  recordedByUserId: string;
  recordedByName: string;
  recordedAt: string;
}

export interface WorkerWorkLog {
  id: string;
  workerId: string;
  workerName: string;
  date: string; // YYYY-MM-DD
  operationType: string;
  volumeKg: number;
  taskId?: string;
  tariffRatePerKg: number; // устанавливается исключительно Главным Руководителем
  calculatedAmount: number; // Volume * Tariff
  recordedByUserId: string;
  recordedByName: string;
  createdAt: string;
  isLocked?: boolean; // Блокировка от изменений Завскладом
  lockedAt?: string;
}

export interface WorkerTariff {
  id: string;
  operationType: string;
  ratePerKg: number;
  description: string;
}

export interface LoadingOperation {
  id: string;
  routeId: string;
  routeNumber: string;
  warehouseId: string;
  vehicleId: string;
  vehicleName: string;
  driverUserId: string;
  driverName: string;
  zavskladUserId: string;
  zavskladName: string;
  totalPackagesCount: number;
  totalWeightKg: number;
  warehouseWeightKg: number;
  driverWeightKg: number;
  status: 'PREPARING' | 'WAITING_DRIVER_CONFIRM' | 'LOCKED_DISCREPANCY' | 'CONFIRMED_READY';
  zavskladConfirmedAt?: string;
  driverConfirmedAt?: string;
  isDiscrepancy: boolean;
  discrepancyWeightKg: number;
  discrepancyNotes?: string;
}

export interface Vehicle {
  id: string;
  name: string; // e.g. Автомобиль №3 (ГАЗель)
  plateNumber: string; // 01 234 ABC
  capacityKg: number; // 2500 kg
  driverUserId?: string;
  driverName?: string;
  isActive: boolean;
}

export type RoutePointStatus = 'PENDING' | 'ARRIVED' | 'DELIVERED' | 'RETURNED' | 'SKIPPED' | 'PROBLEM';

export interface RoutePoint {
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
  status: RoutePointStatus;
  packagesCount: number;
  totalWeightKg: number;
  eta?: string;
  arrivedAt?: string;
  departedAt?: string;
  deviationReason?: string;
}

export interface RouteVersion {
  id: string;
  routeId: string;
  versionNumber: number;
  reason: string;
  modifiedByUserId: string;
  modifiedByName: string;
  pointsSnapshot: RoutePoint[];
  createdAt: string;
}

export interface Route {
  id: string;
  routeNumber: string; // e.g. Рейс №00521
  vehicleId: string;
  vehicleName: string;
  driverUserId: string;
  driverName: string;
  supervisorUserId: string;
  supervisorName: string;
  date: string;
  status: 'PLANNED' | 'LOCKED' | 'IN_TRANSIT' | 'COMPLETED';
  currentVersion: number;
  lockedAt?: string;
  startedAt?: string;
  completedAt?: string;
  points: RoutePoint[];
  history: RouteVersion[];
}

export interface Delivery {
  id: string;
  routePointId: string;
  orderId: string;
  orderNumber: string;
  targetName: string;
  confirmationType: 'E_BUTTON' | 'SIGNATURE' | 'PHOTO' | 'COMBO';
  receiverName: string;
  receiverPhone?: string;
  confirmedAt: string;
  geoLat: number;
  geoLng: number;
  deviceFingerprint: string;
  signatureDataUrl?: string;
  photoUrl?: string;
  comment?: string;
}

export interface ProductReturn {
  id: string;
  orderId: string;
  orderNumber: string;
  deliveryId: string;
  targetName: string;
  productPackageId: string;
  productName: string;
  packageWeightKg: number;
  returnQty: number;
  reasonCode: 'DAMAGED_PACKAGE' | 'DEFECT' | 'SHOP_REFUSED' | 'EXCESS_DELIVERY' | 'EXPIRED';
  reasonText: string;
  photoUrl?: string;
  warehouseReceiptStatus: 'IN_TRANSIT' | 'ACCEPTED_INTO_STOCK';
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  roleCode: RoleCode;
  actionType: string;
  entityName: string;
  entityId: string;
  oldValuesJson?: any;
  newValuesJson?: any;
  diffSummary: string;
  reason?: string;
  ipAddress: string;
  deviceInfo: string;
  geoLat?: number;
  geoLng?: number;
  timestamp: string;
}

export type SyncStatus = 'LOCAL' | 'QUEUED' | 'SYNCING' | 'SYNCED' | 'CONFLICT';

export interface SyncQueueItem {
  uuid: string;
  entityType: 'order' | 'shop' | 'attendance' | 'workLog' | 'loading' | 'delivery' | 'return';
  action: 'CREATE' | 'UPDATE' | 'CONFIRM' | 'STATUS_CHANGE';
  payload: any;
  clientTimestamp: string;
  deviceId: string;
  syncStatus: SyncStatus;
  retryCount: number;
  error?: string;
  serverConflictData?: any;
}

export interface AppNotification {
  id: string;
  targetRole?: RoleCode;
  targetUserId?: string;
  title: string;
  message: string;
  orderId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface CashAccount {
  id: string;
  code: string;
  name: string;
  openingBalance: number;
  currentBalance: number;
  currency: string;
  isDefault: boolean;
  updatedAt: string;
}

export interface CashTransaction {
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

export interface ProductionOperation {
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

export interface Rate {
  id: string;
  operationType: string;
  ratePerKg: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string;
  version: number;
  isActive: boolean;
}

