import Dexie, { type Table } from 'dexie';
import type {
  User,
  Warehouse,
  CompanyPoint,
  Shop,
  ProductCategory,
  Product,
  ProductPackage,
  Stock,
  StockMovement,
  Order,
  PickingTask,
  Worker,
  WorkerAttendance,
  WorkerWorkLog,
  WorkerTariff,
  LoadingOperation,
  Vehicle,
  Route,
  Delivery,
  ProductReturn,
  AuditLog,
  SyncQueueItem,
  AppNotification
} from '../types';

export class MakaronDatabase extends Dexie {
  users!: Table<User, string>;
  warehouses!: Table<Warehouse, string>;
  companyPoints!: Table<CompanyPoint, string>;
  shops!: Table<Shop, string>;
  productCategories!: Table<ProductCategory, string>;
  products!: Table<Product, string>;
  productPackages!: Table<ProductPackage, string>;
  stock!: Table<Stock, string>;
  stockMovements!: Table<StockMovement, string>;
  orders!: Table<Order, string>;
  pickingTasks!: Table<PickingTask, string>;
  workers!: Table<Worker, string>;
  workerAttendance!: Table<WorkerAttendance, string>;
  workerWorkLogs!: Table<WorkerWorkLog, string>;
  workerTariffs!: Table<WorkerTariff, string>;
  loadingOperations!: Table<LoadingOperation, string>;
  vehicles!: Table<Vehicle, string>;
  routes!: Table<Route, string>;
  deliveries!: Table<Delivery, string>;
  returns!: Table<ProductReturn, string>;
  auditLogs!: Table<AuditLog, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  notifications!: Table<AppNotification, string>;

  constructor() {
    super('BlackTecComMakaronDB');
    this.version(1).stores({
      users: 'id, role, username, warehouseId, pointId',
      warehouses: 'id, code',
      companyPoints: 'id, warehouseId, pointCode',
      shops: 'id, registeredByAgentId, status',
      productCategories: 'id, code',
      products: 'id, categoryId, sku',
      productPackages: 'id, productId, packageWeightKg',
      stock: 'id, warehouseId, productPackageId',
      stockMovements: 'id, warehouseId, productPackageId, movementType, createdAt',
      orders: 'id, orderNumber, mode, status, shopId, pointId, createdByUserId, createdAt',
      pickingTasks: 'id, orderId, status',
      workers: 'id, warehouseId, isActive',
      workerAttendance: 'id, workerId, date, status',
      workerWorkLogs: 'id, workerId, date',
      workerTariffs: 'id, operationType',
      loadingOperations: 'id, routeId, status',
      vehicles: 'id, plateNumber',
      routes: 'id, routeNumber, driverUserId, status, date',
      deliveries: 'id, routePointId, orderId',
      returns: 'id, orderId, warehouseReceiptStatus',
      auditLogs: 'id, userId, roleCode, actionType, timestamp',
      syncQueue: 'uuid, entityType, syncStatus, clientTimestamp',
      notifications: 'id, targetRole, isRead, createdAt'
    });
  }
}

export const db = new MakaronDatabase();

export async function seedInitialData() {
  const usersCount = await db.users.count();
  if (usersCount > 0) return; // Уже инициализировано

  // 1. Склады
  const wh1: Warehouse = {
    id: 'wh-1',
    name: 'Центральный производственный склад №1',
    code: 'WH-MAIN-01',
    address: 'г. Душанбе, ул. Саноат 14',
    geoLat: 38.5358,
    geoLng: 68.7790,
    managerUserId: 'user-zavsklad-1',
    managerName: 'Каримов Назир Завсклад',
    isActive: true
  };
  const wh2: Warehouse = {
    id: 'wh-2',
    name: 'Региональный распределительный склад №2',
    code: 'WH-REG-02',
    address: 'г. Худжанд, ул. Ленина 120',
    geoLat: 40.2826,
    geoLng: 69.6222,
    managerUserId: 'user-zavsklad-2',
    managerName: 'Собиров Рахим Завсклад',
    isActive: true
  };
  await db.warehouses.bulkAdd([wh1, wh2]);

  // 2. Пользователи всех 9 ролей
  const initialUsers: User[] = [
    {
      id: 'user-admin',
      username: 'admin',
      fullName: 'Рустамов Джамшед (Администратор)',
      phone: '+992 900 11 22 33',
      role: 'ADMIN',
      regionId: 'reg-all',
      isActive: true
    },
    {
      id: 'user-director',
      username: 'director',
      fullName: 'Саидов Бахром (Генеральный директор)',
      phone: '+992 900 00 00 01',
      role: 'DIRECTOR',
      regionId: 'reg-all',
      isActive: true
    },
    {
      id: 'user-zavsklad-1',
      username: 'zavsklad',
      fullName: 'Каримов Назир (Завсклад №1)',
      phone: '+992 900 22 33 44',
      role: 'ZAVSKLAD',
      regionId: 'reg-dushanbe',
      warehouseId: 'wh-1',
      isActive: true
    },
    {
      id: 'user-supervisor-1',
      username: 'supervisor',
      fullName: 'Бобоев Фарход (Супервайзер сектора №1)',
      phone: '+992 900 33 44 55',
      role: 'SUPERVISOR',
      regionId: 'reg-dushanbe',
      isActive: true
    },
    {
      id: 'user-agent-1',
      username: 'agent',
      fullName: 'Алиев Сардор (Торговый агент №1)',
      phone: '+992 900 44 55 66',
      role: 'AGENT',
      regionId: 'reg-dushanbe',
      isActive: true
    },
    {
      id: 'user-taxsimot-1',
      username: 'taxsimot',
      fullName: 'Рахимов Рустам (Таксимот / Водитель №3)',
      phone: '+992 900 55 66 77',
      role: 'TAXSIMOT',
      regionId: 'reg-dushanbe',
      isActive: true
    },
    {
      id: 'user-point-1',
      username: 'point',
      fullName: 'Точка «Магазин №4» (Фирменная точка)',
      phone: '+992 900 66 77 88',
      role: 'POINT',
      regionId: 'reg-dushanbe',
      pointId: 'point-1',
      warehouseId: 'wh-1',
      isActive: true
    },
    {
      id: 'user-worker-1',
      username: 'worker',
      fullName: 'Иванов Иван Иванович (Рабочий производства)',
      phone: '+992 900 77 88 99',
      role: 'WORKER',
      regionId: 'reg-dushanbe',
      warehouseId: 'wh-1',
      isActive: true
    },
    {
      id: 'user-picker-1',
      username: 'picker',
      fullName: 'Собир Комплектовщик (Сборочный цех)',
      phone: '+992 900 77 11 22',
      role: 'PICKER',
      regionId: 'reg-dushanbe',
      warehouseId: 'wh-1',
      isActive: true
    },
    {
      id: 'user-auditor',
      username: 'auditor',
      fullName: 'Хасанов Тимур (Главный аудитор)',
      phone: '+992 900 88 99 00',
      role: 'AUDITOR',
      regionId: 'reg-all',
      isActive: true
    }
  ];
  await db.users.bulkAdd(initialUsers);

  // 3. Фирменные точки предприятия (Режим 1)
  const points: CompanyPoint[] = [
    {
      id: 'point-1',
      warehouseId: 'wh-1',
      name: 'Фирменная точка «Магазин №4»',
      pointCode: 'POINT-004',
      address: 'г. Душанбе, ул. Негмата Карабаева 28',
      geoLat: 38.5280,
      geoLng: 68.7690,
      contactName: 'Мавлонова Зарина',
      contactPhone: '+992 918 11 22 33',
      isActive: true
    },
    {
      id: 'point-2',
      warehouseId: 'wh-1',
      name: 'Фирменная точка «Магазин №12»',
      pointCode: 'POINT-012',
      address: 'г. Душанбе, пр. Саади Шерози 16',
      geoLat: 38.5410,
      geoLng: 68.7610,
      contactName: 'Шарипов Далер',
      contactPhone: '+992 918 44 55 66',
      isActive: true
    }
  ];
  await db.companyPoints.bulkAdd(points);

  // 4. Внешние розничные магазины (Режим 2)
  const shops: Shop[] = [
    {
      id: 'shop-1',
      registeredByAgentId: 'user-agent-1',
      registeredByAgentName: 'Алиев Сардор',
      name: 'Мини-маркет «Анис»',
      shopType: 'Мини-маркет',
      address: 'г. Душанбе, ул. Рудаки 45',
      geoLat: 38.5615,
      geoLng: 68.7840,
      ownerName: 'Холов Мухаммад',
      phone: '+992 927 10 20 30',
      openingHours: '08:00 - 22:00',
      status: 'ACTIVE',
      hasActiveOrder: false,
      hasDraftOrder: false,
      createdAt: '2026-09-10T08:00:00Z'
    },
    {
      id: 'shop-2',
      registeredByAgentId: 'user-agent-1',
      registeredByAgentName: 'Алиев Сардор',
      name: 'Супермаркет «Фаровон»',
      shopType: 'Супермаркет',
      address: 'г. Душанбе, пр. Исмоили Сомони 12',
      geoLat: 38.5800,
      geoLng: 68.7710,
      ownerName: 'Юсупова Нигина',
      phone: '+992 927 40 50 60',
      openingHours: '08:00 - 23:00',
      status: 'ACTIVE',
      hasActiveOrder: false,
      hasDraftOrder: false,
      createdAt: '2026-09-12T09:30:00Z'
    },
    {
      id: 'shop-3',
      registeredByAgentId: 'user-agent-1',
      registeredByAgentName: 'Алиев Сардор',
      name: 'Продуктовый магазин «Баракат»',
      shopType: 'Продуктовый магазин',
      address: 'г. Душанбе, ул. С. Айни 88',
      geoLat: 38.5490,
      geoLng: 68.8050,
      ownerName: 'Назаров Олим',
      phone: '+992 927 70 80 90',
      openingHours: '07:30 - 22:30',
      status: 'ACTIVE',
      hasActiveOrder: false,
      hasDraftOrder: false,
      createdAt: '2026-09-15T11:00:00Z'
    },
    {
      id: 'shop-4',
      registeredByAgentId: 'user-agent-1',
      registeredByAgentName: 'Алиев Сардор',
      name: 'Оптовая точка «Осиё»',
      shopType: 'Оптовая точка',
      address: 'г. Душанбе, ул. Абуали Сино 19',
      geoLat: 38.5720,
      geoLng: 68.7480,
      ownerName: 'Курбонов Парвиз',
      phone: '+992 927 99 88 77',
      openingHours: '08:30 - 19:00',
      status: 'ACTIVE',
      hasActiveOrder: false,
      hasDraftOrder: false,
      createdAt: '2026-09-18T14:15:00Z'
    }
  ];
  await db.shops.bulkAdd(shops);

  // 5. Номенклатура продукции и фасовка
  const category: ProductCategory = {
    id: 'cat-1',
    name: 'Макаронные изделия высшего сорта',
    code: 'PASTA-PREMIUM',
    sortOrder: 1
  };
  await db.productCategories.add(category);

  const products: Product[] = [
    { id: 'prod-1', categoryId: 'cat-1', name: 'Вермишель', sku: 'MAK-VERM', description: 'Тонкая вермишель из твердых сортов пшеницы' },
    { id: 'prod-2', categoryId: 'cat-1', name: 'Макароны классические', sku: 'MAK-CLASSIC', description: 'Трубчатые макаронные изделия' },
    { id: 'prod-3', categoryId: 'cat-1', name: 'Лапша домашняя', sku: 'MAK-NOODLE', description: 'Широкая плоская лапша' },
    { id: 'prod-4', categoryId: 'cat-1', name: 'Рожки рифленые', sku: 'MAK-ROZHKI', description: 'Рифленые рожки среднего размера' },
    { id: 'prod-5', categoryId: 'cat-1', name: 'Спагетти', sku: 'MAK-SPAGHETTI', description: 'Длинные спагетти калибра 1.6 мм' }
  ];
  await db.products.bulkAdd(products);

  // Фасовки (5, 10, 15, 23, 25, 50 кг)
  const packages: ProductPackage[] = [];
  const weights = [5, 10, 15, 23, 25, 50];
  for (const prod of products) {
    for (const w of weights) {
      packages.push({
        id: `pkg-${prod.id}-${w}kg`,
        productId: prod.id,
        productName: prod.name,
        packageWeightKg: w,
        unitType: w <= 10 ? 'пачка' : 'мешок',
        barcode: `48200${prod.sku.replace(/\D/g, '')}${w}`,
        isActive: true
      });
    }
  }
  await db.productPackages.bulkAdd(packages);

  // 6. Складские остатки с минимальным порогом безопасности (Safety Stock)
  const stockItems: Stock[] = [];
  for (const pkg of packages) {
    // Основной фокус на фасовке 23 кг (как в ТЗ)
    const is23kg = pkg.packageWeightKg === 23;
    stockItems.push({
      id: `stock-wh1-${pkg.id}`,
      warehouseId: 'wh-1',
      productPackageId: pkg.id,
      productName: pkg.productName,
      packageWeightKg: pkg.packageWeightKg,
      quantityPhysical: is23kg ? 120 : 60, // мешков
      quantityReserved: 0,
      minCriticalLevel: is23kg ? 30 : 15, // порог предупреждения
      updatedAt: '2026-09-22T08:00:00Z'
    });
  }
  await db.stock.bulkAdd(stockItems);

  // 7. Работники склада
  const workers: Worker[] = [
    {
      id: 'worker-1',
      warehouseId: 'wh-1',
      fullName: 'Иванов Иван Иванович',
      position: 'Комплектовщик',
      phone: '+992 931 11 22 33',
      hireDate: '2024-03-15',
      isActive: true
    },
    {
      id: 'worker-2',
      warehouseId: 'wh-1',
      fullName: 'Петров Пётр Петрович',
      position: 'Комплектовщик',
      phone: '+992 931 44 55 66',
      hireDate: '2024-05-20',
      isActive: true
    },
    {
      id: 'worker-3',
      warehouseId: 'wh-1',
      fullName: 'Сидоров Алексей Сергеевич',
      position: 'Комплектовщик',
      phone: '+992 931 77 88 99',
      hireDate: '2023-11-01',
      isActive: true
    },
    {
      id: 'worker-4',
      warehouseId: 'wh-1',
      fullName: 'Каримов Карим Каримович',
      position: 'Грузчик',
      phone: '+992 931 00 11 22',
      hireDate: '2025-01-10',
      isActive: true
    }
  ];
  await db.workers.bulkAdd(workers);

  // Табель посещаемости на сегодня (22.09.2026)
  const today = '2026-09-22';
  const attendance: WorkerAttendance[] = [
    { id: 'att-1', workerId: 'worker-1', workerName: 'Иванов Иван Иванович', date: today, status: 'PRESENT', recordedByUserId: 'user-zavsklad-1', recordedByName: 'Каримов Назир', recordedAt: '2026-09-22T07:30:00Z' },
    { id: 'att-2', workerId: 'worker-2', workerName: 'Петров Пётр Петрович', date: today, status: 'PRESENT', recordedByUserId: 'user-zavsklad-1', recordedByName: 'Каримов Назир', recordedAt: '2026-09-22T07:35:00Z' },
    { id: 'att-3', workerId: 'worker-3', workerName: 'Сидоров Алексей Сергеевич', date: today, status: 'PRESENT', recordedByUserId: 'user-zavsklad-1', recordedByName: 'Каримов Назир', recordedAt: '2026-09-22T07:40:00Z' },
    { id: 'att-4', workerId: 'worker-4', workerName: 'Каримов Карим Каримович', date: today, status: 'SICK', reason: 'Больничный лист', recordedByUserId: 'user-zavsklad-1', recordedByName: 'Каримов Назир', recordedAt: '2026-09-22T07:45:00Z' }
  ];
  await db.workerAttendance.bulkAdd(attendance);

  // Тарифы на сдельную оплату
  const tariffs: WorkerTariff[] = [
    { id: 'tar-1', operationType: 'Комплектация', ratePerKg: 0.15, description: 'Тариф за сборку 1 кг макаронных изделий' },
    { id: 'tar-2', operationType: 'Погрузка', ratePerKg: 0.10, description: 'Тариф за погрузку 1 кг в автомобиль' },
    { id: 'tar-3', operationType: 'Разгрузка', ratePerKg: 0.10, description: 'Тариф за разгрузку возвращенного товара' }
  ];
  await db.workerTariffs.bulkAdd(tariffs);

  // Журнал работы за сегодня
  const workLogs: WorkerWorkLog[] = [
    { id: 'wl-1', workerId: 'worker-1', workerName: 'Иванов Иван Иванович', date: today, operationType: 'Комплектация', volumeKg: 150, tariffRatePerKg: 0.15, calculatedAmount: 22.50, recordedByUserId: 'user-zavsklad-1', recordedByName: 'Каримов Назир', createdAt: '2026-09-22T10:00:00Z' },
    { id: 'wl-2', workerId: 'worker-2', workerName: 'Петров Пётр Петрович', date: today, operationType: 'Комплектация', volumeKg: 200, tariffRatePerKg: 0.15, calculatedAmount: 30.00, recordedByUserId: 'user-zavsklad-1', recordedByName: 'Каримов Назир', createdAt: '2026-09-22T10:05:00Z' },
    { id: 'wl-3', workerId: 'worker-3', workerName: 'Сидоров Алексей Сергеевич', date: today, operationType: 'Комплектация', volumeKg: 500, tariffRatePerKg: 0.15, calculatedAmount: 75.00, recordedByUserId: 'user-zavsklad-1', recordedByName: 'Каримов Назир', createdAt: '2026-09-22T10:10:00Z' }
  ];
  await db.workerWorkLogs.bulkAdd(workLogs);

  // 8. Транспортные средства
  const vehicle: Vehicle = {
    id: 'veh-3',
    name: 'Автомобиль №3 (ГАЗель NEXT)',
    plateNumber: '01 234 ABC',
    capacityKg: 2500,
    driverUserId: 'user-taxsimot-1',
    driverName: 'Рахимов Рустам',
    isActive: true
  };
  await db.vehicles.add(vehicle);

  // 9. Пример базовой заявки №000152 (как в ТЗ)
  const sampleOrder: Order = {
    id: 'order-152',
    orderNumber: '#000152',
    mode: 'MODE_1_DIRECT',
    status: 'SUBMITTED',
    pointId: 'point-1',
    destinationName: 'Фирменная точка «Магазин №4»',
    destinationAddress: 'г. Душанбе, ул. Негмата Карабаева 28',
    destinationLat: 38.5280,
    destinationLng: 68.7690,
    createdByUserId: 'user-point-1',
    createdByName: 'Мавлонова Зарина',
    createdByRole: 'POINT',
    totalWeightKg: 1035, // (15 + 20 + 10) * 23 kg = 45 * 23 = 1035 kg
    totalItemsCount: 45,
    clientUuid: 'uuid-sample-152',
    items: [
      {
        id: 'item-1',
        orderId: 'order-152',
        productPackageId: 'pkg-prod-1-23kg',
        productName: 'Вермишель',
        packageWeightKg: 23,
        unitType: 'мешок',
        requestedQty: 15,
        approvedSupervisorQty: 15,
        approvedWarehouseQty: 15,
        unitWeightKg: 23
      },
      {
        id: 'item-2',
        orderId: 'order-152',
        productPackageId: 'pkg-prod-2-23kg',
        productName: 'Макароны классические',
        packageWeightKg: 23,
        unitType: 'мешок',
        requestedQty: 20,
        approvedSupervisorQty: 20,
        approvedWarehouseQty: 20,
        unitWeightKg: 23
      },
      {
        id: 'item-3',
        orderId: 'order-152',
        productPackageId: 'pkg-prod-3-23kg',
        productName: 'Лапша домашняя',
        packageWeightKg: 23,
        unitType: 'мешок',
        requestedQty: 10,
        approvedSupervisorQty: 10,
        approvedWarehouseQty: 10,
        unitWeightKg: 23
      }
    ],
    history: [
      {
        id: 'ver-1',
        orderId: 'order-152',
        versionNumber: 1,
        authorUserId: 'user-point-1',
        authorName: 'Мавлонова Зарина',
        authorRole: 'POINT',
        changeType: 'CREATED',
        diffSummary: 'Создана прямая заявка Режима 1 на 45 мешков (1 035 кг)',
        timestamp: '2026-09-22T09:10:00Z'
      }
    ],
    comments: [],
    createdAt: '2026-09-22T09:10:00Z',
    updatedAt: '2026-09-22T09:10:00Z'
  };
  await db.orders.add(sampleOrder);

  // 10. Базовые уведомления
  const notifs: AppNotification[] = [
    {
      id: 'notif-1',
      targetRole: 'ZAVSKLAD',
      title: 'Новая прямая заявка #000152',
      message: 'Фирменная точка «Магазин №4» создала заявку на 1 035 кг (45 мешков фасовки 23 кг)',
      orderId: 'order-152',
      isRead: false,
      createdAt: '2026-09-22T09:10:05Z'
    }
  ];
  await db.notifications.bulkAdd(notifs);

  // 11. Базовый лог аудита
  const audit: AuditLog = {
    id: 'audit-1',
    userId: 'user-admin',
    userName: 'Рустамов Джамшед',
    roleCode: 'ADMIN',
    actionType: 'SYSTEM_INITIALIZATION',
    entityName: 'SYSTEM',
    entityId: 'ROOT',
    diffSummary: 'Инициализация цифровой системы управления BlackTecCom Makaron',
    reason: 'Первоначальный запуск платформы',
    ipAddress: '127.0.0.1',
    deviceInfo: 'Web Console / Windows',
    timestamp: '2026-09-22T08:00:00Z'
  };
  await db.auditLogs.add(audit);
}
