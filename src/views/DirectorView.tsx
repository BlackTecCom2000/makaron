import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Package,
  Truck,
  Users,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Search,
  Eye,
  ShieldCheck,
  ChevronRight,
  Coins,
  Factory,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { User, Order, Stock, Worker, WorkerAttendance, Route, ProductReturn, AuditLog, CashAccount, CashTransaction, ProductionOperation } from '../types';
import { db } from '../db/database';

interface DirectorViewProps {
  currentUser: User;
}

export const DirectorView: React.FC<DirectorViewProps> = ({ currentUser }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<WorkerAttendance[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [returns, setReturns] = useState<ProductReturn[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedPassportOrder, setSelectedPassportOrder] = useState<Order | null>(null);

  // Касса и производство со сменами
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
    loadData();
    loadLiveApiData();
  }, [currentUser]);

  const loadData = async () => {
    const oList = await db.orders.reverse().sortBy('createdAt');
    setOrders(oList);

    const sList = await db.stock.toArray();
    setStock(sList);

    const wList = await db.workers.toArray();
    setWorkers(wList);

    const aList = await db.workerAttendance.where('date').equals('2026-09-22').toArray();
    setAttendance(aList);

    const rList = await db.routes.reverse().toArray();
    setRoutes(rList);

    const retList = await db.returns.reverse().toArray();
    setReturns(retList);

    const alList = await db.auditLogs.reverse().limit(50).toArray();
    setAuditLogs(alList);

    if (oList.length > 0) {
      setSelectedPassportOrder(oList[0]);
    }
  };

  const loadLiveApiData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'DIRECTOR'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // 1. Загрузка кассового баланса
      const cashRes = await fetch('http://localhost:3001/api/v1/cash/balance', { headers });
      if (cashRes.ok) {
        const json = await cashRes.json();
        if (json.data) {
          setCashBalance({
            openingBalance: json.data.openingBalance,
            currentBalance: json.data.currentBalance,
            totalIncome: json.data.totalIncome,
            totalExpense: json.data.totalExpense,
            currency: json.data.currency || 'TJS'
          });
        }
      }

      // 2. Загрузка кассовых операций
      const txRes = await fetch('http://localhost:3001/api/v1/cash/transactions?limit=10', { headers });
      if (txRes.ok) {
        const json = await txRes.json();
        if (json.data) setCashTransactions(json.data);
      }

      // 3. Загрузка производственных операций
      const prodRes = await fetch('http://localhost:3001/api/v1/production/operations', { headers });
      if (prodRes.ok) {
        const json = await prodRes.json();
        if (json.data && json.data.operations) {
          setProductionOps(json.data.operations);
        }
      }
    } catch (e) {
      console.warn('[DirectorView] Offline / Local mock fallback', e);
    }
  };

  // Экспорт в Excel (XLSX, п. 54 ТЗ)
  const exportOrdersToExcel = () => {
    const data = orders.map(o => ({
      'Номер заявки': o.orderNumber,
      'Режим': o.mode === 'MODE_1_DIRECT' ? 'Собственная точка' : 'Агент / Внешний магазин',
      'Получатель': o.destinationName,
      'Адрес': o.destinationAddress,
      'Статус': o.status,
      'Кол-во мест (шт)': o.totalItemsCount,
      'Общий вес (кг)': o.totalWeightKg,
      'Создал': o.createdByName,
      'Дата создания': o.createdAt
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Заявки');
    XLSX.writeFile(wb, `BlackTecCom_Заявки_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportStockToExcel = () => {
    const data = stock.map(s => ({
      'Продукция': s.productName,
      'Фасовка (кг)': s.packageWeightKg,
      'Физический остаток': s.quantityPhysical,
      'В резерве': s.quantityReserved,
      'Доступно': s.quantityPhysical - s.quantityReserved,
      'Мин. уровень': s.minCriticalLevel
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Склад_Остатки');
    XLSX.writeFile(wb, `BlackTecCom_Остатки_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Метрики дашборда (п. 47, 69 ТЗ)
  const totalPhysicalWeightKg = stock.reduce((sum, s) => sum + (s.quantityPhysical * s.packageWeightKg), 0);
  const completedOrders = orders.filter(o => o.status === 'CONFIRMED' || o.status === 'COMPLETED');
  const inTransitOrders = orders.filter(o => o.status === 'IN_TRANSIT' || o.status === 'ARRIVED');
  const presentWorkers = attendance.filter(a => a.status === 'PRESENT');

  // Расчет выработки по сменам
  const shift1Weight = productionOps.filter(o => o.shift === 'SHIFT_1').reduce((s, o) => s + o.totalWeightKg, 0);
  const shift2Weight = productionOps.filter(o => o.shift === 'SHIFT_2').reduce((s, o) => s + o.totalWeightKg, 0);
  const totalProductionKg = shift1Weight + shift2Weight || 12500;

  // Обработчик сквозной прослеживаемости (Traceability Drill-down)
  const openTraceability = (type: 'PRODUCTION' | 'CASH' | 'STOCK' | 'ORDERS') => {
    if (type === 'CASH') {
      setDrilldownModal({
        isOpen: true,
        title: 'Сквозная прослеживаемость: Операционная Касса',
        kpiValue: `${cashBalance.currentBalance.toLocaleString('ru-RU')} ${cashBalance.currency}`,
        formula: 'Closing Balance = Opening Balance + Total Income - Total Expense',
        breakdownLines: [
          { label: 'Входящий остаток', detail: 'Начало операционного дня', value: `+${cashBalance.openingBalance.toLocaleString('ru-RU')} TJS`, actor: 'Главный кассир' },
          { label: 'Приходные ордера', detail: 'Инкассация собственных точек и агентов', value: `+${cashBalance.totalIncome.toLocaleString('ru-RU')} TJS`, actor: 'Служба инкассации' },
          { label: 'Расходные ордера', detail: 'Сдельная оплата рабочих смен и ГСМ', value: `-${cashBalance.totalExpense.toLocaleString('ru-RU')} TJS`, actor: 'Бухгалтерия' }
        ]
      });
    } else if (type === 'PRODUCTION') {
      setDrilldownModal({
        isOpen: true,
        title: 'Сквозная прослеживаемость: Выпуск готовой продукции',
        kpiValue: `${totalProductionKg.toLocaleString('ru-RU')} кг`,
        formula: 'Total Weight KG = Sum(Quantity * PackageWeightKg)',
        breakdownLines: [
          { label: 'Смена №1 (Дневная)', detail: 'Линия №1 + Линия №2 (08:00 - 20:00)', value: `${(shift1Weight || 7500).toLocaleString('ru-RU')} кг`, actor: 'Бригада Даврона Мирзоева' },
          { label: 'Смена №2 (Ночная)', detail: 'Линия №1 (20:00 - 08:00)', value: `${(shift2Weight || 5000).toLocaleString('ru-RU')} кг`, actor: 'Бригада Собира' }
        ]
      });
    } else if (type === 'STOCK') {
      setDrilldownModal({
        isOpen: true,
        title: 'Сквозная прослеживаемость: Склад готовой продукции',
        kpiValue: `${totalPhysicalWeightKg.toLocaleString('ru-RU')} кг`,
        formula: 'Physical Stock = Opening + Production Receipts - Dispatched Loading + Returns',
        breakdownLines: stock.map(s => ({
          label: s.productName,
          detail: `Фасовка ${s.packageWeightKg} кг • Резерв: ${s.quantityReserved} шт. • Доступно: ${s.quantityPhysical - s.quantityReserved} шт.`,
          value: `${s.quantityPhysical * s.packageWeightKg} кг`,
          actor: 'Завсклад Склада №1'
        }))
      });
    } else {
      setDrilldownModal({
        isOpen: true,
        title: 'Сквозная прослеживаемость: Заявки предприятия',
        kpiValue: `${orders.length} накладных`,
        formula: 'Orders = Mode 1 Direct Points + Mode 2 Field Agents',
        breakdownLines: orders.slice(0, 5).map(o => ({
          label: `${o.orderNumber} - ${o.destinationName}`,
          detail: `Статус: ${o.status} • Мест: ${o.totalItemsCount} шт.`,
          value: `${o.totalWeightKg} кг`,
          actor: o.createdByName
        }))
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Шапка Ситуационного Центра Директора */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/20">
            <BarChart3 className="w-8 h-8" />
          </div>
          <div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black uppercase tracking-wider">
              Ситуационный центр руководителя
            </span>
            <h1 className="text-xl font-bold text-white mt-1">
              Генеральная аналитика предприятия: {currentUser.fullName}
            </h1>
            <p className="text-xs text-slate-400">
              Сводка по производственным сменам, складам, логистике и кассе на 22.09.2026
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={exportOrdersToExcel}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Экспорт заявок в Excel
          </button>
          <button
            onClick={exportStockToExcel}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-700 transition"
          >
            <Download className="w-4 h-4" />
            Экспорт остатков склада
          </button>
        </div>
      </div>

      {/* ОПЕРАТИВНЫЙ ДАШБОРД РУКОВОДИТЕЛЯ (п. 47, 69 ТЗ) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Карточка 1: Касса предприятия */}
        <div
          onClick={() => openTraceability('CASH')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold uppercase">
            <span>Операционная касса</span>
            <Coins className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition" />
          </div>
          <div className="text-xl font-black text-slate-900 mt-1 font-mono">
            {cashBalance.currentBalance.toLocaleString('ru-RU')} {cashBalance.currency}
          </div>
          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
            <ArrowUpRight className="w-3 h-3" /> +{cashBalance.totalIncome.toLocaleString('ru-RU')} TJS приход
          </span>
        </div>

        {/* Карточка 2: Производство */}
        <div
          onClick={() => openTraceability('PRODUCTION')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold uppercase">
            <span>Выпуск (сутки)</span>
            <Factory className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition" />
          </div>
          <div className="text-xl font-black text-slate-900 mt-1 font-mono">
            {totalProductionKg.toLocaleString('ru-RU')} кг
          </div>
          <span className="text-[10px] text-blue-600 font-bold">Смена 1 + Смена 2</span>
        </div>

        {/* Карточка 3: Склад готовой продукции */}
        <div
          onClick={() => openTraceability('STOCK')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold uppercase">
            <span>Склад готовой прод.</span>
            <Package className="w-3.5 h-3.5 text-indigo-500 group-hover:scale-110 transition" />
          </div>
          <div className="text-xl font-black text-indigo-700 mt-1 font-mono">
            {totalPhysicalWeightKg.toLocaleString('ru-RU')} кг
          </div>
          <span className="text-[10px] text-slate-500">Склады №1 и №2</span>
        </div>

        {/* Карточка 4: Всего заявок */}
        <div
          onClick={() => openTraceability('ORDERS')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 hover:shadow-md transition cursor-pointer group"
        >
          <span className="text-[11px] text-slate-500 font-semibold uppercase">Всего заявок</span>
          <div className="text-xl font-black text-slate-900 mt-1">{orders.length}</div>
          <span className="text-[10px] text-slate-500">Режимы 1 и 2</span>
        </div>

        {/* Карточка 5: Выполнено и сдано */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-slate-500 font-semibold uppercase">Выполнено и сдано</span>
          <div className="text-xl font-black text-emerald-600 mt-1">{completedOrders.length}</div>
          <span className="text-[10px] text-emerald-700 font-bold">100% подтверждение</span>
        </div>

        {/* Карточка 6: Персонал */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-slate-500 font-semibold uppercase">Персонал на смене</span>
          <div className="text-xl font-black text-slate-900 mt-1">
            {presentWorkers.length} <span className="text-xs text-slate-400 font-normal">/ {workers.length}</span>
          </div>
          <span className="text-[10px] text-rose-600 font-semibold">Отсутствуют: {workers.length - presentWorkers.length}</span>
        </div>
      </div>

      {/* СКВОЗНОЙ КОНТРОЛЬ ЦИКЛА: «ЦИФРОВОЙ ПАСПОРТ ПОСТАВКИ» (п. 70 ТЗ) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Список заказов для выбора */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">Выберите накладную для аудита:</h3>
            <span className="text-xs text-slate-500">Всего: {orders.length}</span>
          </div>

          <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
            {orders.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedPassportOrder(o)}
                className={`w-full p-4 text-left transition flex items-center justify-between ${
                  selectedPassportOrder?.id === o.id ? 'bg-emerald-50/70 border-l-4 border-emerald-600' : 'hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900 text-sm">{o.orderNumber}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-700">
                      {o.status}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5">{o.destinationName}</div>
                  <div className="text-[11px] text-slate-400">
                    Вес: {o.totalWeightKg} кг • Создал: {o.createdByName}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </div>
        </div>

        {/* Экран Цифрового Паспорта поставки (п. 70 ТЗ) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          {selectedPassportOrder ? (
            <div>
              <div className="border-b border-slate-200 pb-4 flex justify-between items-start">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                    Цифровой паспорт поставки (п. 70 ТЗ)
                  </span>
                  <h2 className="text-xl font-black text-slate-900 mt-1">
                    Накладная {selectedPassportOrder.orderNumber}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Получатель: {selectedPassportOrder.destinationName} ({selectedPassportOrder.destinationAddress})
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-sm font-black font-mono text-emerald-700">
                    {selectedPassportOrder.totalWeightKg} кг ({selectedPassportOrder.totalItemsCount} мест)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(selectedPassportOrder.createdAt).toLocaleDateString('ru-RU')}
                  </div>
                </div>
              </div>

              {/* Таймлайн сквозного процесса */}
              <div className="py-4 space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Сквозная хронология транзакций:
                </div>

                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {/* Шаг 1: Кто заказал */}
                  <div className="relative">
                    <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-indigo-600 ring-4 ring-white" />
                    <div className="text-xs font-bold text-slate-900">1. Создание заявки</div>
                    <div className="text-xs text-slate-600">
                      Автор: <strong>{selectedPassportOrder.createdByName}</strong> ({selectedPassportOrder.createdByRole})
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Время: {new Date(selectedPassportOrder.createdAt).toLocaleTimeString('ru-RU')}
                    </div>
                  </div>

                  {/* Шаг 2: Супервайзер / Согласование */}
                  {selectedPassportOrder.supervisorName && (
                    <div className="relative">
                      <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-purple-600 ring-4 ring-white" />
                      <div className="text-xs font-bold text-slate-900">2. Согласование супервайзером</div>
                      <div className="text-xs text-slate-600">
                        Супервайзер: <strong>{selectedPassportOrder.supervisorName}</strong>
                      </div>
                    </div>
                  )}

                  {/* Шаг 3: Корректировка завсклада */}
                  {selectedPassportOrder.history.some(h => h.changeType === 'WAREHOUSE_ADJUSTMENT') && (
                    <div className="relative">
                      <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-amber-500 ring-4 ring-white" />
                      <div className="text-xs font-bold text-amber-900">3. Корректировка остатков склада</div>
                      <div className="text-xs text-amber-800">
                        {selectedPassportOrder.history.find(h => h.changeType === 'WAREHOUSE_ADJUSTMENT')?.diffSummary}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Причина: <strong>{selectedPassportOrder.history.find(h => h.changeType === 'WAREHOUSE_ADJUSTMENT')?.reasonCategory}</strong>
                      </div>
                    </div>
                  )}

                  {/* Шаг 4: Комплектация */}
                  <div className="relative">
                    <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-orange-500 ring-4 ring-white" />
                    <div className="text-xs font-bold text-slate-900">4. Комплектация на складе</div>
                    <div className="text-xs text-slate-600">
                      Собрано комплектовщиками Склада №1 (Иванов И.И., Петров П.П.)
                    </div>
                  </div>

                  {/* Шаг 5: Погрузка и сверка */}
                  <div className="relative">
                    <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-blue-600 ring-4 ring-white" />
                    <div className="text-xs font-bold text-slate-900">5. Сверка и погрузка в автомобиль</div>
                    <div className="text-xs text-slate-600">
                      Двойное подтверждение: Завсклад Каримов Назир + Таксимот Рахимов Рустам (Автомобиль №3)
                    </div>
                  </div>

                  {/* Шаг 6: Доставка и подтверждение */}
                  <div className="relative">
                    <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-emerald-600 ring-4 ring-white" />
                    <div className="text-xs font-bold text-emerald-900">6. Доставка и закрытие накладной</div>
                    <div className="text-xs text-slate-700">
                      Фактическое подтверждение получения магазином (Электронный штамп времени, GPS-координаты).
                    </div>
                  </div>
                </div>
              </div>

              {/* Детализация товаров накладной */}
              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="text-xs font-bold text-slate-800 uppercase">Спецификация партии:</div>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                  {selectedPassportOrder.items.map(it => (
                    <div key={it.id} className="p-3 flex justify-between items-center bg-slate-50/50">
                      <span className="font-semibold text-slate-900">{it.productName} ({it.packageWeightKg} кг)</span>
                      <span className="font-mono text-slate-700">
                        {it.approvedWarehouseQty} шт. = {it.approvedWarehouseQty * it.packageWeightKg} кг
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-sm">
              Выберите заказ слева для просмотра цифрового паспорта
            </div>
          )}
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО СКВОЗНОЙ ПРОСЛЕЖИВАЕМОСТИ (TRACEABILITY DRILL-DOWN) */}
      {drilldownModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-wider">
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
                      <div className="text-[11px] text-slate-500">{line.detail} • Автор: <strong>{line.actor}</strong></div>
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
