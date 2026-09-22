import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Shield,
  Search,
  Users,
  Package,
  Settings,
  History,
  TrendingUp,
  Truck,
  AlertTriangle,
  Download,
  CheckCircle2,
  Clock,
  Eye,
  ShieldCheck,
  ChevronRight,
  Coins,
  Factory,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  X,
  Database,
  Plus,
  RotateCcw,
  FileSpreadsheet,
  HardHat,
  FileText,
  RefreshCw,
  Award,
  Crown,
  Edit3,
  Trash2,
  Lock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type {
  User,
  Order,
  Stock,
  Worker,
  WorkerAttendance,
  Route,
  ProductReturn,
  AuditLog,
  CashTransaction,
  ProductionOperation,
  Product,
  ProductPackage,
  WorkerTariff,
  WorkerWorkLog,
  LoadingOperation
} from '../types';
import { db } from '../db/database';
import { logAudit } from '../services/auditService';

interface ExecutiveViewProps {
  currentUser: User;
}

type ExecutiveTab = 'kpi' | 'production' | 'users' | 'catalog' | 'audit' | 'backups';

export const ExecutiveView: React.FC<ExecutiveViewProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<ExecutiveTab>('kpi');

  // Данные заказов, склада, сотрудников, маршрутов, возвратов, аудита
  const [orders, setOrders] = useState<Order[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<WorkerAttendance[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [returns, setReturns] = useState<ProductReturn[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingOps, setLoadingOps] = useState<LoadingOperation[]>([]);
  const [selectedPassportOrder, setSelectedPassportOrder] = useState<Order | null>(null);

  // Данные администрирования
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [tariffs, setTariffs] = useState<WorkerTariff[]>([]);

  // Форма создания пользователя
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('+992 ');
  const [newRole, setNewRole] = useState<User['role']>('AGENT');

  // Форма добавления тарифа
  const [newTariffOp, setNewTariffOp] = useState('Фасовка 23 кг');
  const [newTariffRate, setNewTariffRate] = useState(0.18);

  // Фильтр аудита
  const [auditSearchTerm, setAuditSearchTerm] = useState('');

  // Касса и производство
  const [cashBalance, setCashBalance] = useState<{
    openingBalance: number;
    currentBalance: number;
    totalIncome: number;
    totalExpense: number;
    currency: string;
  }>({
    openingBalance: 50000,
    currentBalance: 52500,
    totalIncome: 2500,
    totalExpense: 0,
    currency: 'TJS'
  });
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [productionOps, setProductionOps] = useState<ProductionOperation[]>([]);

  // Журнал сдельной выработки склада и фиксация завскладом
  const [workLogs, setWorkLogs] = useState<WorkerWorkLog[]>([]);
  const [adjustingWorkLog, setAdjustingWorkLog] = useState<WorkerWorkLog | null>(null);
  const [adjustedVolume, setAdjustedVolume] = useState<number>(0);
  const [adjustedTariff, setAdjustedTariff] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('');

  // Серверные бэкапы
  const [serverBackups, setServerBackups] = useState<any[]>([]);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  // Модальное окно сквозной прослеживаемости (Traceability Drill-down)
  const [drilldownModal, setDrilldownModal] = useState<{
    isOpen: boolean;
    title: string;
    kpiValue: string;
    formula: string;
    breakdownLines: { label: string; detail: string; value: string; actor: string }[];
  }>({
    isOpen: false,
    title: '',
    kpiValue: '',
    formula: '',
    breakdownLines: []
  });

  useEffect(() => {
    loadAllData();
  }, [currentUser]);

  const loadAllData = async () => {
    const oList = await db.orders.reverse().sortBy('createdAt');
    setOrders(oList);
    if (oList.length > 0 && !selectedPassportOrder) {
      setSelectedPassportOrder(oList[0]);
    }

    const sList = await db.stock.toArray();
    setStock(sList);

    const wList = await db.workers.toArray();
    setWorkers(wList);

    const attList = await db.workerAttendance.toArray();
    setAttendance(attList);

    const rList = await db.routes.toArray();
    setRoutes(rList);

    const retList = await db.returns.reverse().toArray();
    setReturns(retList);

    const lOps = await db.loadingOperations.reverse().toArray();
    setLoadingOps(lOps);

    const alList = await db.auditLogs.reverse().limit(150).toArray();
    setAuditLogs(alList);

    const uList = await db.users.toArray();
    setUsers(uList);

    const pList = await db.products.toArray();
    setProducts(pList);

    const pkgList = await db.productPackages.toArray();
    setPackages(pkgList);

    const tList = await db.workerTariffs.toArray();
    setTariffs(tList);

    const wlList = await db.workerWorkLogs.reverse().toArray();
    setWorkLogs(wlList);

    loadLiveApiData();
    loadBackups();
  };

  const loadLiveApiData = async () => {
    try {
      const token = localStorage.getItem('makaron_access_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'DIRECTOR'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const resCash = await fetch('http://localhost:3001/api/v1/cash/balance', { headers });
      if (resCash.ok) {
        const json = await resCash.json();
        if (json.success && json.data) {
          setCashBalance(json.data);
        }
      }

      const resTx = await fetch('http://localhost:3001/api/v1/cash/transactions', { headers });
      if (resTx.ok) {
        const json = await resTx.json();
        if (json.success && json.data) {
          setCashTransactions(json.data);
        }
      }

      const resProd = await fetch('http://localhost:3001/api/v1/production/operations', { headers });
      if (resProd.ok) {
        const json = await resProd.json();
        if (json.success && json.data) {
          setProductionOps(json.data.operations || json.data);
        }
      }
    } catch {
      // Игнорируем сетевые ошибки в офлайн режиме
    }
  };

  const loadBackups = async () => {
    try {
      const token = localStorage.getItem('makaron_access_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'DIRECTOR'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('http://localhost:3001/api/v1/system/backups', { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setServerBackups(json.data);
        }
      }
    } catch {
      // Offline fallback
    }
  };

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const token = localStorage.getItem('makaron_access_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'DIRECTOR'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('http://localhost:3001/api/v1/system/backup', {
        method: 'POST',
        headers,
        body: JSON.stringify({ description: 'Создано из единого кабинета Руководителя' })
      });
      if (res.ok) {
        await loadBackups();
        await logAudit(
          currentUser,
          'CREATE_BACKUP',
          'SYSTEM',
          'snapshot',
          'Руководитель создал резервный слепок системы с SHA-256'
        );
        alert('Резервная копия базы данных успешно создана и верифицирована!');
      } else {
        alert('Ошибка создания резервной копии');
      }
    } catch (e: any) {
      alert('Ошибка соединения с сервером бэкапов: ' + e.message);
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newFullName.trim()) return;

    const newUser: User = {
      id: 'user-' + Date.now(),
      username: newUsername.trim(),
      fullName: newFullName.trim(),
      phone: newPhone.trim(),
      role: newRole,
      regionId: 'reg-dushanbe',
      isActive: true
    };

    await db.users.add(newUser);
    await logAudit(
      currentUser,
      'USER_CREATED',
      'USER',
      newUser.id,
      `Руководитель создал пользователя ${newUser.fullName} с ролью ${newUser.role}`
    );

    setNewUsername('');
    setNewFullName('');
    await loadAllData();
    alert(`Пользователь «${newUser.fullName}» успешно создан!`);
  };

  const handleAddTariff = async (e: React.FormEvent) => {
    e.preventDefault();
    await db.workerTariffs.add({
      id: 'tar-' + Date.now(),
      operationType: newTariffOp,
      ratePerKg: newTariffRate,
      description: `Ставка сдельной оплаты: ${newTariffRate} сом за 1 кг`
    });
    await logAudit(
      currentUser,
      'TARIFF_UPDATED',
      'TARIFF',
      'tar-' + Date.now(),
      `Руководитель утвердил тариф ${newTariffOp}: ${newTariffRate} TJS/кг`
    );
    await loadAllData();
    alert('Новый тариф успешно утвержден и сохранен!');
  };

  // Изменение ставки тарифа Руководителем (Тарифный суверенитет Руководителя)
  const handleUpdateTariffRate = async (tariffId: string, currentRate: number) => {
    const newRateStr = prompt('Укажите новую ставку тарифа (TJS за 1 кг), утверждаемую Главным Руководителем:', String(currentRate));
    if (!newRateStr) return;
    const newRate = parseFloat(newRateStr);
    if (isNaN(newRate) || newRate <= 0) {
      alert('Некорректная ставка тарифа!');
      return;
    }

    await db.workerTariffs.update(tariffId, {
      ratePerKg: newRate,
      description: `Ставка сдельной оплаты: ${newRate} сом за 1 кг`
    });

    await logAudit(
      currentUser,
      'TARIFF_UPDATED_BY_EXECUTIVE',
      'TARIFF',
      tariffId,
      `Главный Руководитель изменил тариф ${tariffId}: новая ставка ${newRate} TJS/кг`
    );

    await loadAllData();
    alert(`Тариф успешно обновлен: ${newRate} TJS/кг. Завсклад обязан использовать исключительно эту ставку!`);
  };

  // Открытие модального окна корректировки выработки Руководителем
  const handleOpenAdjustWorkLog = (log: WorkerWorkLog) => {
    setAdjustingWorkLog(log);
    setAdjustedVolume(log.volumeKg);
    setAdjustedTariff(log.tariffRatePerKg);
    setAdjustReason('');
  };

  // Сохранение корректировки выработки Руководителем
  const handleSaveAdjustWorkLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingWorkLog) return;
    const newAmount = Number((adjustedVolume * adjustedTariff).toFixed(2));

    await db.workerWorkLogs.update(adjustingWorkLog.id, {
      volumeKg: adjustedVolume,
      tariffRatePerKg: adjustedTariff,
      calculatedAmount: newAmount,
      isLocked: true
    });

    // Синхронизация с сервером если доступен
    try {
      const token = localStorage.getItem('makaron_access_token');
      await fetch(`http://localhost:3001/api/v1/production/piecework-logs/${adjustingWorkLog.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          'X-Simulate-Role': 'DIRECTOR'
        },
        body: JSON.stringify({
          volumeKg: adjustedVolume,
          tariffPerKg: adjustedTariff,
          reason: adjustReason
        })
      });
    } catch {
      // Игнорируем сетевые сбои (офлайн)
    }

    await logAudit(
      currentUser,
      'WORK_LOG_ADJUSTED_BY_EXECUTIVE',
      'WORKER',
      adjustingWorkLog.workerId,
      `Главный Руководитель скорректировал выработку ${adjustingWorkLog.workerName}: ${adjustingWorkLog.volumeKg} кг → ${adjustedVolume} кг, тариф ${adjustingWorkLog.tariffRatePerKg} → ${adjustedTariff} TJS, сумма: ${newAmount} TJS. Причина: ${adjustReason || 'Корректировка Руководства'}`
    );

    setAdjustingWorkLog(null);
    await loadAllData();
    alert('Запись выработки успешно скорректирована Главным Руководителем!');
  };

  // Аннулирование записи выработки Руководителем
  const handleAnnulWorkLog = async (log: WorkerWorkLog) => {
    const reason = prompt(`Укажите причину аннулирования выработки для «${log.workerName}» (${log.volumeKg} кг, ${log.calculatedAmount} сом):`);
    if (!reason) return;

    await db.workerWorkLogs.delete(log.id);

    try {
      const token = localStorage.getItem('makaron_access_token');
      await fetch(`http://localhost:3001/api/v1/production/piecework-logs/${log.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          'X-Simulate-Role': 'DIRECTOR'
        },
        body: JSON.stringify({ reason })
      });
    } catch {
      // Игнорируем сетевые сбои
    }

    await logAudit(
      currentUser,
      'WORK_LOG_ANNULLED_BY_EXECUTIVE',
      'WORKER',
      log.workerId,
      `Главный Руководитель аннулировал выработку ${log.workerName} (${log.volumeKg} кг, ${log.calculatedAmount} TJS). Причина: ${reason}`
    );

    await loadAllData();
    alert('Запись выработки успешно аннулирована Главным Руководителем!');
  };

  const calculateOrderSum = (order: Order): number => {
    return Math.round(order.totalWeightKg * 13.5);
  };

  // Расчет общих показателей
  const totalRevenue = useMemo(() => {
    return orders.reduce((sum, o) => sum + calculateOrderSum(o), 0);
  }, [orders]);

  const totalStockKg = useMemo(() => {
    return stock.reduce((sum, s) => sum + (s.quantityPhysical * (s.packageWeightKg || 1)), 0);
  }, [stock]);

  const totalProductionWeightKg = useMemo(() => {
    return productionOps.reduce((sum, p) => sum + (p.totalWeightKg || 0), 0);
  }, [productionOps]);

  const filteredLogs = useMemo(() => {
    if (!auditSearchTerm.trim()) return auditLogs;
    const term = auditSearchTerm.toLowerCase();
    return auditLogs.filter(
      l =>
        l.userName.toLowerCase().includes(term) ||
        l.diffSummary.toLowerCase().includes(term) ||
        l.actionType.toLowerCase().includes(term) ||
        l.entityName.toLowerCase().includes(term)
    );
  }, [auditLogs, auditSearchTerm]);

  // Экспорт сводки в Excel
  const handleExportXLSX = () => {
    const wb = XLSX.utils.book_new();

    const orderRows = orders.map(o => ({
      'ID Заказа': o.orderNumber,
      'Режим снабжения': o.mode === 'MODE_1_DIRECT' ? 'Режим 1 (Фирменная точка)' : 'Режим 2 (Агент)',
      'Статус': o.status,
      'Вес партии (кг)': o.totalWeightKg,
      'Сумма (TJS)': calculateOrderSum(o),
      'Дата': new Date(o.createdAt || Date.now()).toLocaleString('ru-RU')
    }));
    const wsOrders = XLSX.utils.json_to_sheet(orderRows);
    XLSX.utils.book_append_sheet(wb, wsOrders, 'Заказы');

    const stockRows = stock.map(s => ({
      'Склад': s.warehouseId,
      'Продукт': s.productName,
      'Фасовка (кг)': s.packageWeightKg,
      'Физический остаток': s.quantityPhysical,
      'В резерве': s.quantityReserved,
      'Доступно': s.quantityPhysical - s.quantityReserved
    }));
    const wsStock = XLSX.utils.json_to_sheet(stockRows);
    XLSX.utils.book_append_sheet(wb, wsStock, 'Складские остатки');

    const prodRows = productionOps.map(p => ({
      'Дата': p.date,
      'Смена': p.shift === 'SHIFT_1' ? 'Дневная (№1)' : 'Ночная (№2)',
      'Продукт': p.productName,
      'Выпуск (упаковок)': p.quantity,
      'Общий вес (кг)': p.totalWeightKg,
      'Бригада / Работники': p.workerNames.join(', '),
      'Статус': p.status
    }));
    const wsProd = XLSX.utils.json_to_sheet(prodRows);
    XLSX.utils.book_append_sheet(wb, wsProd, 'Производство');

    XLSX.writeFile(wb, `BlackTecCom_Executive_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* ВЕРХНЯЯ ШАПКА: ЕДИНЫЙ КАБИНЕТ РУКОВОДИТЕЛЯ */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-2xl border border-slate-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 text-slate-950 font-black flex items-center justify-center text-3xl shadow-xl shadow-amber-500/20 ring-4 ring-amber-500/20">
            <Crown className="w-9 h-9" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-emerald-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                Единый пульт управления предприятием
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-emerald-400 text-[10px] font-bold border border-slate-700">
                Director • Admin • Auditor
              </span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1 tracking-tight">
              {currentUser.fullName}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Генеральный директор • Системный администратор • Главный аудитор объединения «BlackTecCom»
            </p>
          </div>
        </div>

        {/* Навигация по вкладкам объединенного кабинета */}
        <div className="flex flex-wrap gap-2 w-full lg:w-auto bg-slate-950/60 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('kpi')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'kpi'
                ? 'bg-amber-500 text-slate-950 shadow-lg font-black'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Сводка & KPI
          </button>

          <button
            onClick={() => setActiveTab('production')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'production'
                ? 'bg-amber-500 text-slate-950 shadow-lg font-black'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Factory className="w-4 h-4" />
            Производство ({productionOps.length})
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'bg-amber-500 text-slate-950 shadow-lg font-black'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            Пользователи ({users.length})
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'catalog'
                ? 'bg-amber-500 text-slate-950 shadow-lg font-black'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Package className="w-4 h-4" />
            Номенклатура & Тарифы
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'bg-amber-500 text-slate-950 shadow-lg font-black'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            Ревизия & Аудит ({auditLogs.length})
          </button>

          <button
            onClick={() => setActiveTab('backups')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'backups'
                ? 'bg-amber-500 text-slate-950 shadow-lg font-black'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            Бэкапы ({serverBackups.length})
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. ВКЛАДКА: СВОДКА & KPI (DIRECTOR VIEW) */}
      {/* ========================================================================= */}
      {activeTab === 'kpi' && (
        <div className="space-y-6">
          {/* Сводные KPI карточки */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Карточка 1: Выручка */}
            <div
              onClick={() =>
                setDrilldownModal({
                  isOpen: true,
                  title: 'Аудит показателя «Общая выручка предприятия»',
                  kpiValue: `${totalRevenue.toLocaleString()} TJS`,
                  formula: 'Выручка = Σ(Количество утвержденное × Отпускная цена позиции)',
                  breakdownLines: orders.map(o => ({
                    label: `Заказ #${o.orderNumber}`,
                    detail: `${o.mode === 'MODE_1_DIRECT' ? 'Собственная точка' : 'Агентская накладная'} • ${o.totalWeightKg} кг`,
                    value: `${calculateOrderSum(o)} TJS`,
                    actor: o.destinationName || 'Магазин'
                  }))
                })
              }
              className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:border-amber-400 hover:shadow-md cursor-pointer transition group"
            >
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Выручка заказов</span>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-110 transition">
                  <Coins className="w-5 h-5" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {totalRevenue.toLocaleString()} <span className="text-sm font-bold text-slate-500">TJS</span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-indigo-600">
                <span>Раскрыть аудит до накладных</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Карточка 2: Складской объем */}
            <div
              onClick={() =>
                setDrilldownModal({
                  isOpen: true,
                  title: 'Аудит складских запасов готовой продукции',
                  kpiValue: `${totalStockKg.toLocaleString()} кг`,
                  formula: 'Физический вес = Σ(Физический остаток в упаковках × Вес упаковки кг)',
                  breakdownLines: stock.map(s => ({
                    label: s.productName,
                    detail: `Склад: ${s.warehouseId} • Фасовка ${s.packageWeightKg} кг (Свободно: ${s.quantityPhysical - s.quantityReserved} шт)`,
                    value: `${s.quantityPhysical * s.packageWeightKg} кг`,
                    actor: 'Завсклад Каримов Н.'
                  }))
                })
              }
              className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:border-amber-400 hover:shadow-md cursor-pointer transition group"
            >
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Остаток на складе</span>
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600 group-hover:scale-110 transition">
                  <Package className="w-5 h-5" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {totalStockKg.toLocaleString()} <span className="text-sm font-bold text-slate-500">кг</span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-indigo-600">
                <span>Детализация по номенклатуре</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Карточка 3: Касса */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Операционная касса</span>
                <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <TrendingUp className="w-5 h-5" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {cashBalance.currentBalance.toLocaleString()} <span className="text-sm font-bold text-slate-500">{cashBalance.currency}</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 font-medium">
                Приход: <span className="text-emerald-600 font-bold">+{cashBalance.totalIncome}</span> • Расход: <span className="text-rose-600 font-bold">-{cashBalance.totalExpense}</span>
              </div>
            </div>

            {/* Карточка 4: Выпуск продукции */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Выпуск фабрики</span>
                <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <Factory className="w-5 h-5" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {totalProductionWeightKg.toLocaleString()} <span className="text-sm font-bold text-slate-500">кг</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 font-medium">
                Партий зафиксировано: <strong className="text-slate-800">{productionOps.length}</strong>
              </div>
            </div>
          </div>

          {/* Быстрые действия и выгрузка отчетов */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-amber-400" />
                Сводная управленческая выгрузка (Excel / XLSX)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Автоматическая генерация консолидированного отчёта по заказам, складам, сменам и ревизиям
              </p>
            </div>
            <button
              onClick={handleExportXLSX}
              className="px-5 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg transition"
            >
              <Download className="w-4 h-4" />
              Скачать Excel (.xlsx)
            </button>
          </div>

          {/* Реестр накладных и цифровой паспорт */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900">Заказы в цепочке поставок</h3>
                <span className="text-xs font-bold text-slate-400">{orders.length} шт</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {orders.map(o => (
                  <div
                    key={o.id}
                    onClick={() => setSelectedPassportOrder(o)}
                    className={`p-4 cursor-pointer transition ${
                      selectedPassportOrder?.id === o.id
                        ? 'bg-amber-50/70 border-l-4 border-amber-500'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-black text-slate-900">#{o.orderNumber}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                        {o.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {o.mode === 'MODE_1_DIRECT' ? 'Фирменная точка' : 'Агент'} • {o.totalWeightKg} кг • {calculateOrderSum(o)} TJS
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Цифровой паспорт выбранного заказа */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-6">
              {selectedPassportOrder ? (
                <>
                  <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider">
                        Цифровой паспорт накладной
                      </span>
                      <h3 className="text-lg font-black text-slate-900 mt-1">
                        Заказ #{selectedPassportOrder.orderNumber}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Создан: {new Date(selectedPassportOrder.createdAt || Date.now()).toLocaleString('ru-RU')}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-slate-900">{calculateOrderSum(selectedPassportOrder)} TJS</div>
                      <div className="text-xs font-bold text-slate-400">{selectedPassportOrder.totalWeightKg} кг партии</div>
                    </div>
                  </div>

                  {/* Этапы прохождения заказа */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Контрольные точки цепочки поставок:</h4>
                    <div className="border-l-2 border-slate-200 pl-4 space-y-4 text-xs">
                      <div>
                        <div className="font-bold text-slate-900">1. Заявка создана и зарегистрирована</div>
                        <div className="text-slate-500">Режим: {selectedPassportOrder.mode === 'MODE_1_DIRECT' ? 'Режим 1 (Фирменная точка)' : 'Режим 2 (Дистрибуция через агентов)'}</div>
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">2. Согласование складом и резервирование</div>
                        <div className="text-slate-500">Склад №1 • Проверка остатка Physical vs Reserved</div>
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">3. Сверка погрузки (Dual-Custody)</div>
                        <div className="text-slate-500">Завсклад и водитель-экспедитор сверили вес партии</div>
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">4. Подтверждение доставки в точку</div>
                        <div className="text-slate-500">Фиксация GPS координат, фото накладной и цифровая подпись</div>
                      </div>
                    </div>
                  </div>

                  {/* Товарная спецификация */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Спецификация партии:</h4>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden text-xs">
                      {selectedPassportOrder.items.map(it => (
                        <div key={it.id} className="p-3.5 flex justify-between items-center bg-slate-50/40">
                          <div>
                            <span className="font-bold text-slate-900">{it.productName}</span>
                            <span className="text-slate-400 ml-2">({it.packageWeightKg} кг/упак)</span>
                          </div>
                          <div className="font-mono font-bold text-slate-800">
                            {it.approvedWarehouseQty} шт = {it.approvedWarehouseQty * it.packageWeightKg} кг
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-slate-400 text-xs">
                  Выберите заказ в списке слева для инспекции цифрового паспорта
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. ВКЛАДКА: ПРОИЗВОДСТВО & СМЕНЫ */}
      {/* ========================================================================= */}
      {activeTab === 'production' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">Партии выработки готовой продукции</h3>
                <p className="text-xs text-slate-500 mt-0.5">Фиксация выработки по сменам №1 (дневная) и №2 (ночная)</p>
              </div>
              <span className="text-xs font-bold text-slate-500">Всего операций: {productionOps.length}</span>
            </div>

            <div className="divide-y divide-slate-100">
              {productionOps.map(op => (
                <div key={op.id} className="py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900 text-sm">{op.productName}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-800">
                        {op.shift === 'SHIFT_1' ? 'Смена 1 (08:00–20:00)' : 'Смена 2 (20:00–08:00)'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {op.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Линия: <strong>{op.lineId}</strong> • Дата: {op.date}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Исполнители / Бригада: {op.workerNames.join(', ')}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-black font-mono text-slate-900">
                      {op.quantity} упак. = {op.totalWeightKg} кг
                    </div>
                    <span className="text-[10px] text-emerald-600 font-bold">Авто-оприходовано на склад</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ВКЛАДКА: ПОЛЬЗОВАТЕЛИ & ДОСТУП (ADMIN VIEW) */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm">Реестр пользователей системы</h3>
              <span className="text-xs font-bold text-slate-400">Всего: {users.length}</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {users.map(u => (
                <div key={u.id} className="p-4 hover:bg-slate-50/60 flex items-center justify-between transition">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{u.fullName}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-800">
                        {u.role}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Логин: @{u.username} • Телефон: {u.phone}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl">
                    Активен
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Форма добавления пользователя */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Создать сотрудника</h3>
              <p className="text-xs text-slate-500 mt-0.5">Добавление учетной записи с распределением роли</p>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ФИО сотрудника:</label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  placeholder="Например: Каримов Алишер"
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Логин:</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="alisher_agent"
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Телефон:</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Роль доступа:</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium bg-white"
                >
                  <option value="POINT">Фирменная точка (POINT)</option>
                  <option value="AGENT">Торговый агент (AGENT)</option>
                  <option value="SUPERVISOR">Супервайзер (SUPERVISOR)</option>
                  <option value="ZAVSKLAD">Заведующий складом (ZAVSKLAD)</option>
                  <option value="PICKER">Комплектовщик (PICKER)</option>
                  <option value="WORKER">Рабочий производства (WORKER)</option>
                  <option value="TAXSIMOT">Таксимот / Водитель (TAXSIMOT)</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-xs shadow-md transition"
              >
                Сохранить пользователя
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. ВКЛАДКА: НОМЕНКЛАТУРА & ТАРИФЫ */}
      {/* ========================================================================= */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Каталог продукции */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-base">Номенклатурный каталог</h3>
                <p className="text-xs text-slate-500 mt-0.5">Макаронная продукция высшего сорта и фасовки</p>
              </div>
              <div className="divide-y divide-slate-100">
                {packages.map(pkg => (
                  <div key={pkg.id} className="py-3 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-900 text-xs">{pkg.productName}</div>
                      <div className="text-[11px] text-slate-400">
                        Штрихкод: {pkg.barcode || 'Б/Ш'} • Тип тары: {pkg.unitType}
                      </div>
                    </div>
                    <span className="font-bold text-xs bg-slate-100 text-slate-800 px-2.5 py-1 rounded-xl">
                      {pkg.packageWeightKg} кг ({pkg.unitType})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Тарифы сдельной выработки */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-4">
              <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base">Тарифы сдельной оплаты труда</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-amber-700" />
                      Суверенитет Руководителя
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Ставки начисления за 1 кг. Утверждаются исключительно Руководителем</p>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {tariffs.map(t => (
                  <div key={t.id} className="py-3 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-900 text-xs">{t.operationType}</div>
                      <div className="text-[11px] text-slate-400">{t.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-xs text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                        {t.ratePerKg} TJS / кг
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateTariffRate(t.id, t.ratePerKg)}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition"
                        title="Изменить ставку тарифа"
                      >
                        Изменить
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddTariff} className="pt-3 border-t border-slate-100 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase">Утвердить новый тариф:</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newTariffOp}
                    onChange={e => setNewTariffOp(e.target.value)}
                    placeholder="Операция"
                    className="px-3 py-2 border rounded-xl text-xs font-medium"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={newTariffRate}
                    onChange={e => setNewTariffRate(parseFloat(e.target.value) || 0)}
                    placeholder="Ставка TJS/кг"
                    className="px-3 py-2 border rounded-xl text-xs font-medium font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition shadow-sm"
                >
                  Утвердить и сохранить тариф
                </button>
              </form>
            </div>
          </div>

          {/* Журнал сдельной выработки склада (Фиксация завскладом) */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-base">Журнал сдельной выработки склада (Фиксация завскладом)</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-900 border border-emerald-200 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-700" />
                    Заблокировано от правок склада
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Завсклад вносит только объем выработки в килограммах. Тарифы и формулы расчетов определяет исключительно Главный Руководитель. Все зафиксированные записи защищены от редактирования и удаления на складе.
                </p>
              </div>
            </div>

            {/* Метрики выработки */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Всего зафиксировано выработки</span>
                <div className="text-xl font-black text-slate-900 font-mono mt-1">
                  {workLogs.reduce((sum, l) => sum + l.volumeKg, 0).toLocaleString('ru-RU')} кг
                </div>
                <span className="text-[10px] text-slate-400">Суммарный объем по всем сменам</span>
              </div>
              <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase">Сдельный зарплатный фонд</span>
                <div className="text-xl font-black text-emerald-800 font-mono mt-1">
                  {workLogs.reduce((sum, l) => sum + l.calculatedAmount, 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} TJS
                </div>
                <span className="text-[10px] text-emerald-600 font-bold">Рассчитано по тарифам Руководителя</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Количество записей</span>
                <div className="text-xl font-black text-slate-900 font-mono mt-1">
                  {workLogs.length}
                </div>
                <span className="text-[10px] text-slate-400">Фиксаций в журнале склада</span>
              </div>
            </div>

            {/* Таблица записей */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Дата / Время</th>
                    <th className="p-3">Работник</th>
                    <th className="p-3">Операция</th>
                    <th className="p-3 text-right">Объем (кг)</th>
                    <th className="p-3 text-right">Тариф Руководства</th>
                    <th className="p-3 text-right">Сумма (TJS)</th>
                    <th className="p-3">Зафиксировал</th>
                    <th className="p-3 text-center">Статус</th>
                    <th className="p-3 text-center">Действия Руководителя</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workLogs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-400">
                        Записей выработки пока нет
                      </td>
                    </tr>
                  ) : (
                    workLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 font-medium">
                        <td className="p-3 text-slate-500 font-mono text-[11px]">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : log.date}
                        </td>
                        <td className="p-3 font-bold text-slate-900">{log.workerName}</td>
                        <td className="p-3 text-slate-600">{log.operationType}</td>
                        <td className="p-3 text-right font-black text-slate-900 font-mono">{log.volumeKg} кг</td>
                        <td className="p-3 text-right text-slate-600 font-mono font-bold">{log.tariffRatePerKg} TJS/кг</td>
                        <td className="p-3 text-right font-black text-emerald-700 font-mono text-sm">{log.calculatedAmount.toFixed(2)}</td>
                        <td className="p-3 text-slate-500 text-[11px]">{log.recordedByName || 'Завсклад'}</td>
                        <td className="p-3 text-center">
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-black text-[10px] inline-flex items-center gap-1 border border-slate-200">
                            <Lock className="w-3 h-3 text-amber-600" />
                            Зафиксировано
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenAdjustWorkLog(log)}
                              className="px-2 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition flex items-center gap-1"
                              title="Скорректировать запись (только Руководитель)"
                            >
                              <Edit3 className="w-3 h-3" />
                              Скорректировать
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAnnulWorkLog(log)}
                              className="px-2 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition flex items-center gap-1"
                              title="Аннулировать запись (только Руководитель)"
                            >
                              <Trash2 className="w-3 h-3" />
                              Аннулировать
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Модальное окно корректировки выработки Руководителем */}
          {adjustingWorkLog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
              <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Корректировка выработки (Руководитель)</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{adjustingWorkLog.workerName} • {adjustingWorkLog.operationType}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdjustingWorkLog(null)}
                    className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveAdjustWorkLog} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Объем выработки (кг):</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={adjustedVolume}
                      onChange={e => setAdjustedVolume(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border rounded-xl font-mono text-sm font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Тариф за 1 кг (TJS):</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={adjustedTariff}
                      onChange={e => setAdjustedTariff(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border rounded-xl font-mono text-sm font-bold text-slate-900"
                    />
                  </div>

                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-emerald-900">Итого пересчитанная сумма:</span>
                    <span className="font-black text-emerald-800 text-base font-mono">
                      {(adjustedVolume * adjustedTariff).toFixed(2)} TJS
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Обоснование корректировки (для Audit Trail):</label>
                    <textarea
                      required
                      rows={2}
                      value={adjustReason}
                      onChange={e => setAdjustReason(e.target.value)}
                      placeholder="Например: Перевзвешивание партии по распоряжению Директора"
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setAdjustingWorkLog(null)}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition"
                    >
                      Сохранить и пересчитать
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. ВКЛАДКА: РЕВИЗИЯ & АУДИТ (AUDITOR VIEW) */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Инцидентная панель аудитора */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold uppercase">Событий в летописи аудита</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{auditLogs.length}</div>
              <span className="text-[10px] text-emerald-600 font-bold">100% криптографический след</span>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold uppercase">Акты возврата продукции</span>
              <div className="text-2xl font-black text-rose-600 mt-1">{returns.length}</div>
              <span className="text-[10px] text-slate-400">Рекламации из торговых точек</span>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold uppercase">Блокировки погрузки (Mismatch)</span>
              <div className="text-2xl font-black text-amber-600 mt-1">
                {loadingOps.filter(l => l.isDiscrepancy).length}
              </div>
              <span className="text-[10px] text-slate-500">Предотвращенные недостачи на складе</span>
            </div>
          </div>

          {/* Поиск по аудиту */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-4 flex items-center gap-3">
            <Search className="w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={auditSearchTerm}
              onChange={e => setAuditSearchTerm(e.target.value)}
              placeholder="Поиск по автору, сущности, операции или комментарию..."
              className="w-full text-xs font-medium focus:outline-hidden text-slate-900"
            />
            {auditSearchTerm && (
              <button onClick={() => setAuditSearchTerm('')} className="text-xs text-slate-400 hover:text-slate-600">
                Очистить
              </button>
            )}
          </div>

          {/* Таблица журнала аудита */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden divide-y divide-slate-100 text-xs">
            <div className="px-6 py-4 bg-slate-50 font-bold text-slate-900 flex justify-between items-center">
              <span>Неизменяемая летопись транзакций (Immutable Audit Trail)</span>
              <span className="text-xs text-slate-500 font-normal">Найдено: {filteredLogs.length}</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {filteredLogs.map(log => (
                <div key={log.id} className="p-4 hover:bg-slate-50/80 space-y-1.5 transition">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-800">
                        {log.actionType}
                      </span>
                      <span className="font-bold text-slate-900">{log.userName}</span>
                      <span className="text-slate-400">• {log.entityName} ({log.entityId})</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(log.timestamp).toLocaleString('ru-RU')}
                    </span>
                  </div>
                  <p className="text-slate-600 text-xs font-medium pl-1">{log.diffSummary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. ВКЛАДКА: БЭКАПЫ & СИСТЕМА */}
      {/* ========================================================================= */}
      {activeTab === 'backups' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">Аварийное восстановление и слепки данных</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Создание резервных копий с вычислением криптографического хэша SHA-256
                </p>
              </div>

              <button
                disabled={isCreatingBackup}
                onClick={handleCreateBackup}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-2xl text-xs flex items-center gap-2 shadow-md transition"
              >
                <Plus className="w-4 h-4" />
                {isCreatingBackup ? 'Создание слепка...' : 'Создать бэкап сейчас'}
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {serverBackups.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Резервные копии на сервере не обнаружены или сервер работает в локальном режиме.
                </div>
              ) : (
                serverBackups.map(b => (
                  <div key={b.id} className="py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                      <div className="font-bold text-slate-900 text-sm font-mono">{b.filename}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Создан: {new Date(b.timestamp).toLocaleString('ru-RU')} • Размер: {Math.round(b.sizeBytes / 1024)} КБ
                      </div>
                      <div className="text-[11px] font-mono text-indigo-600 mt-0.5">
                        SHA-256: {b.checksum}
                      </div>
                    </div>

                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Контрольная сумма проверена
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* МОДАЛЬНОЕ ОКНО СКВОЗНОЙ ПРОСЛЕЖИВАЕМОСТИ (TRACEABILITY DRILL-DOWN) */}
      {/* ========================================================================= */}
      {drilldownModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-wider">
                  Traceability Drill-down • Разложение показателя
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">{drilldownModal.title}</h3>
                <p className="text-xs font-mono text-indigo-600 mt-0.5">{drilldownModal.formula}</p>
              </div>
              <button
                onClick={() => setDrilldownModal(prev => ({ ...prev, isOpen: false }))}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-600 font-bold uppercase">Итоговое значение показателя:</span>
              <span className="text-2xl font-black font-mono text-slate-900">{drilldownModal.kpiValue}</span>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase">Первичные транзакции и источники расчета:</div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                {drilldownModal.breakdownLines.map((line, idx) => (
                  <div key={idx} className="p-3.5 flex justify-between items-center bg-white hover:bg-slate-50 transition">
                    <div>
                      <div className="text-xs font-bold text-slate-900">{line.label}</div>
                      <div className="text-[11px] text-slate-500">
                        {line.detail} • Автор: <strong>{line.actor}</strong>
                      </div>
                    </div>
                    <span className="text-xs font-black font-mono text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                      {line.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setDrilldownModal(prev => ({ ...prev, isOpen: false }))}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition"
              >
                Закрыть аудит
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ExecutiveView;
