import React, { useState, useEffect } from 'react';
import {
  Warehouse as WarehouseIcon,
  Package,
  CheckCircle2,
  AlertTriangle,
  Users,
  Calendar,
  Clock,
  Truck,
  ArrowRight,
  ShieldAlert,
  FileCheck,
  TrendingUp,
  XCircle
} from 'lucide-react';
import type {
  User,
  Order,
  Stock,
  Worker,
  WorkerAttendance,
  WorkerWorkLog,
  LoadingOperation,
  PickingTask,
  AttendanceStatus
} from '../types';
import { db } from '../db/database';
import { syncEngine } from '../services/syncEngine';
import { logAudit } from '../services/auditService';

interface ZavskladViewProps {
  currentUser: User;
}

export const ZavskladView: React.FC<ZavskladViewProps> = ({ currentUser }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<WorkerAttendance[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkerWorkLog[]>([]);
  const [loadingOps, setLoadingOps] = useState<LoadingOperation[]>([]);
  const [pickingTasks, setPickingTasks] = useState<PickingTask[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'picking' | 'workers' | 'loading' | 'stock'>('orders');

  // Модальное окно частичной корректировки заказа (п. 8, 9, 27 ТЗ)
  const [adjustingOrder, setAdjustingOrder] = useState<Order | null>(null);
  const [adjustmentQtys, setAdjustmentQtys] = useState<Record<string, number>>({});
  const [adjustmentReason, setAdjustmentReason] = useState<string>('Недостаток продукции на складе');
  const [adjustmentComment, setAdjustmentComment] = useState<string>('На основном складе в наличии только подтвержденное количество');

  // Форма добавления выработки рабочего
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [workVolumeKg, setWorkVolumeKg] = useState<number>(150);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    const oList = await db.orders.reverse().sortBy('createdAt');
    setOrders(oList);

    const sList = await db.stock.where('warehouseId').equals('wh-1').toArray();
    setStock(sList);

    const wList = await db.workers.where('isActive').equals(1).toArray();
    setWorkers(wList);
    if (wList.length > 0 && !selectedWorkerId) {
      setSelectedWorkerId(wList[0].id);
    }

    const today = '2026-09-22';
    const aList = await db.workerAttendance.where('date').equals(today).toArray();
    setAttendance(aList);

    const wlList = await db.workerWorkLogs.where('date').equals(today).toArray();
    setWorkLogs(wlList);

    const lList = await db.loadingOperations.reverse().toArray();
    setLoadingOps(lList);

    const ptList = await db.pickingTasks.reverse().toArray();
    setPickingTasks(ptList);
  };

  // 1. Полное подтверждение заказа (100%, Вариант А)
  const handleApproveFull = async (order: Order) => {
    await db.orders.update(order.id, {
      status: 'APPROVED',
      zavskladUserId: currentUser.id,
      zavskladName: currentUser.fullName,
      updatedAt: new Date().toISOString()
    });

    // Резервируем остатки на складе
    for (const item of order.items) {
      const stockRow = stock.find(s => s.productPackageId === item.productPackageId);
      if (stockRow) {
        await db.stock.update(stockRow.id, {
          quantityPhysical: Math.max(0, stockRow.quantityPhysical - item.requestedQty),
          quantityReserved: stockRow.quantityReserved + item.requestedQty,
          updatedAt: new Date().toISOString()
        });
      }
    }

    // Создаем задачу комплектации для рабочих (п. 10 ТЗ)
    const pickingTask: PickingTask = {
      id: 'pt-' + Date.now(),
      orderId: order.id,
      orderNumber: order.orderNumber,
      destinationName: order.destinationName,
      warehouseId: 'wh-1',
      status: 'ASSIGNED',
      assignedWorkerIds: ['worker-1', 'worker-2'],
      assignedWorkerNames: ['Иванов И.И.', 'Петров П.П.'],
      items: order.items.map(it => ({
        id: 'pitem-' + Math.random().toString(36).substring(2, 7),
        productPackageId: it.productPackageId,
        productName: it.productName,
        packageWeightKg: it.packageWeightKg,
        requiredQty: it.requestedQty,
        pickedQty: 0,
        isCompleted: false
      })),
      createdAt: new Date().toISOString()
    };
    await db.pickingTasks.add(pickingTask);

    await logAudit(
      currentUser,
      'ORDER_APPROVED_FULL',
      'ORDER',
      order.id,
      `Завсклад подтвердил заказ ${order.orderNumber} на 100% (${order.totalWeightKg} кг) и направил в комплектацию`
    );

    loadData();
    alert(`Заказ ${order.orderNumber} подтвержден на 100% и передан комплектовщикам!`);
  };

  // 2. Частичное подтверждение заказа с фиксацией дельты (Вариант Б, п. 8, 9, 27, 28 ТЗ)
  const openAdjustmentModal = (order: Order) => {
    setAdjustingOrder(order);
    const initialQtys: Record<string, number> = {};
    order.items.forEach(it => {
      // Предлагаем, например, уменьшение (как в ТЗ 15 -> 10)
      initialQtys[it.id] = Math.max(0, it.requestedQty - 5);
    });
    setAdjustmentQtys(initialQtys);
  };

  const submitPartialAdjustment = async () => {
    if (!adjustingOrder) return;

    let newTotalWeight = 0;
    let newTotalItems = 0;

    const updatedItems = adjustingOrder.items.map(it => {
      const confirmed = adjustmentQtys[it.id] !== undefined ? adjustmentQtys[it.id] : it.requestedQty;
      newTotalItems += confirmed;
      newTotalWeight += confirmed * it.packageWeightKg;
      return {
        ...it,
        approvedWarehouseQty: confirmed
      };
    });

    const diffSummary = adjustingOrder.items
      .map(it => `${it.productName}: Запрошено ${it.requestedQty} → Склад ${adjustmentQtys[it.id]} (Дельта: ${adjustmentQtys[it.id] - it.requestedQty})`)
      .join('; ');

    const updatedOrder: Order = {
      ...adjustingOrder,
      status: 'PARTIALLY_APPROVED',
      totalWeightKg: newTotalWeight,
      totalItemsCount: newTotalItems,
      items: updatedItems,
      zavskladUserId: currentUser.id,
      zavskladName: currentUser.fullName,
      updatedAt: new Date().toISOString()
    };

    updatedOrder.history.push({
      id: 'ver-' + Date.now(),
      orderId: adjustingOrder.id,
      versionNumber: adjustingOrder.history.length + 1,
      authorUserId: currentUser.id,
      authorName: currentUser.fullName,
      authorRole: 'ZAVSKLAD',
      changeType: 'WAREHOUSE_ADJUSTMENT',
      reasonCategory: adjustmentReason,
      reasonComment: adjustmentComment,
      diffSummary: `Склад частично подтвердил: ${newTotalItems} шт., ${newTotalWeight} кг. ${diffSummary}`,
      timestamp: new Date().toISOString()
    });

    await db.orders.put(updatedOrder);

    // Уведомление супервайзеру о предложении склада
    await db.notifications.add({
      id: 'notif-' + Date.now(),
      targetRole: 'SUPERVISOR',
      title: `Корректировка склада по ${adjustingOrder.orderNumber}`,
      message: `Склад подтвердил ${newTotalWeight} кг из ${adjustingOrder.totalWeightKg} кг. Причина: ${adjustmentReason}. Требуется акцепт супервайзера.`,
      orderId: adjustingOrder.id,
      isRead: false,
      createdAt: new Date().toISOString()
    });

    await logAudit(
      currentUser,
      'ORDER_WAREHOUSE_ADJUSTMENT',
      'ORDER',
      adjustingOrder.id,
      `Завсклад скорректировал заказ: ${diffSummary}. Причина: ${adjustmentReason} (${adjustmentComment})`
    );

    setAdjustingOrder(null);
    loadData();
    alert(`Корректировка зафиксирована в Audit Trail и отправлена на акцепт супервайзеру!`);
  };

  // 3. Табель присутствия (п. 13 ТЗ)
  const handleSetAttendance = async (workerId: string, status: AttendanceStatus, reason?: string) => {
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return;

    const today = '2026-09-22';
    const existing = attendance.find(a => a.workerId === workerId);

    if (existing) {
      await db.workerAttendance.update(existing.id, { status, reason });
    } else {
      await db.workerAttendance.add({
        id: 'att-' + Date.now(),
        workerId,
        workerName: worker.fullName,
        date: today,
        status,
        reason,
        recordedByUserId: currentUser.id,
        recordedByName: currentUser.fullName,
        recordedAt: new Date().toISOString()
      });
    }

    await logAudit(
      currentUser,
      'ATTENDANCE_RECORDED',
      'WORKER',
      workerId,
      `Табель явки: ${worker.fullName} — статус «${status}» ${reason ? `(${reason})` : ''}`
    );

    loadData();
  };

  // 4. Фиксация объема выработки (кг) и расчет сдельной оплаты (п. 12, 14 ТЗ)
  const handleAddWorkLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const worker = workers.find(w => w.id === selectedWorkerId);
    if (!worker || workVolumeKg <= 0) return;

    const tariff = 0.15; // 0.15 руб/сом за кг
    const calculatedAmount = Number((workVolumeKg * tariff).toFixed(2));

    await db.workerWorkLogs.add({
      id: 'wl-' + Date.now(),
      workerId: worker.id,
      workerName: worker.fullName,
      date: '2026-09-22',
      operationType: 'Комплектация',
      volumeKg: workVolumeKg,
      tariffRatePerKg: tariff,
      calculatedAmount,
      recordedByUserId: currentUser.id,
      recordedByName: currentUser.fullName,
      createdAt: new Date().toISOString()
    });

    await logAudit(
      currentUser,
      'WORK_LOG_RECORDED',
      'WORKER',
      worker.id,
      `Зафиксирован объем комплектации: ${worker.fullName}, ${workVolumeKg} кг. Начислено по тарифу: ${calculatedAmount} сом`
    );

    setWorkVolumeKg(150);
    loadData();
    alert(`Выработка ${workVolumeKg} кг для ${worker.fullName} успешно зафиксирована!`);
  };

  // 5. Двухсторонняя сверка при погрузке (Завсклад, п. 16 ТЗ)
  const handleConfirmZavskladLoading = async (op: LoadingOperation) => {
    const isReady = op.driverConfirmedAt !== undefined;
    const isMismatch = isReady && op.warehouseWeightKg !== op.driverWeightKg;

    await db.loadingOperations.update(op.id, {
      zavskladConfirmedAt: new Date().toISOString(),
      status: isMismatch ? 'LOCKED_DISCREPANCY' : (isReady ? 'CONFIRMED_READY' : 'WAITING_DRIVER_CONFIRM')
    });

    if (isMismatch) {
      alert(`Внимание! Расхождение обнаружено: Завсклад: ${op.warehouseWeightKg} кг vs Таксимот: ${op.driverWeightKg} кг! Выезд заблокирован до устранения!`);
    } else {
      alert('Подтверждение завсклада зафиксировано.');
    }
    loadData();
  };

  // Проверка критического уровня остатков (Safety Stock, п. 49 ТЗ)
  const criticalStockItems = stock.filter(s => s.quantityPhysical <= s.minCriticalLevel);

  return (
    <div className="space-y-6">
      {/* Шапка Кабинета Завсклада */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold">
            <WarehouseIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-xs font-bold uppercase tracking-wider">
                Кабинет Завсклада
              </span>
              <span className="text-xs text-slate-500 font-mono">Склад №1 • Комплектация • Табель • Сверка погрузки</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-0.5">
              Склад готовой продукции: {currentUser.fullName}
            </h1>
            <p className="text-xs text-slate-500">
              Душанбе, ул. Саноат 14 • Рабочих на смене: {attendance.filter(a => a.status === 'PRESENT').length} из {workers.length}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'orders' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            Заявки на рассмотрение
          </button>
          <button
            onClick={() => setActiveTab('picking')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'picking' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Комплектация ({pickingTasks.length})
          </button>
          <button
            onClick={() => setActiveTab('workers')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'workers' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Работники и табель
          </button>
          <button
            onClick={() => setActiveTab('loading')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'loading' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            Сверка погрузки ({loadingOps.length})
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'stock' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <WarehouseIcon className="w-4 h-4" />
            Остатки склада
          </button>
        </div>
      </div>

      {/* АЛЕРТ КРИТИЧЕСКОГО ОСТАТКА (п. 49 ТЗ) */}
      {criticalStockItems.length > 0 && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl flex items-center justify-between text-rose-900 text-xs">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <strong>Внимание! Складской запас приближается к критическому уровню:</strong>{' '}
              {criticalStockItems.map(s => `${s.productName} ${s.packageWeightKg} кг (Остаток: ${s.quantityPhysical} шт. при минимуме ${s.minCriticalLevel})`).join(', ')}
            </div>
          </div>
          <button onClick={() => setActiveTab('stock')} className="font-bold underline text-rose-700 ml-4">
            Проверить остатки
          </button>
        </div>
      )}

      {/* ТАБ 1: ЗАЯВКИ НА РАССМОТРЕНИИ (ВАРИАНТ А, Б, В, п. 8, 9, 27 ТЗ) */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-200">
          <div className="px-6 py-4 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">
              Входящие заявки на утверждение (Режим №1 и Режим №2)
            </h3>
            <span className="text-xs text-slate-500">
              Ожидают: {orders.filter(o => o.status === 'SUBMITTED' || o.status === 'WAREHOUSE_REVIEW').length}
            </span>
          </div>

          {orders.filter(o => o.status === 'SUBMITTED' || o.status === 'WAREHOUSE_REVIEW' || o.status === 'APPROVED' || o.status === 'PARTIALLY_APPROVED').map(o => {
            const isWaiting = o.status === 'SUBMITTED' || o.status === 'WAREHOUSE_REVIEW';

            return (
              <div key={o.id} className="p-5 hover:bg-slate-50/80 transition space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-black text-slate-900 text-base">{o.orderNumber}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                      {o.status}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{o.destinationName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold">
                      {o.mode === 'MODE_1_DIRECT' ? 'Режим 1 (Точка)' : 'Режим 2 (Агент)'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(o.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} • Автор: {o.createdByName}
                  </span>
                </div>

                {/* Позиции заказа */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                  {o.items.map(it => (
                    <div key={it.id} className="flex justify-between items-center">
                      <span className="font-medium text-slate-800">{it.productName} ({it.packageWeightKg} кг):</span>
                      <strong className="text-slate-900 font-mono">
                        {it.requestedQty} шт. = {it.requestedQty * it.packageWeightKg} кг
                      </strong>
                    </div>
                  ))}
                  <div className="col-span-full border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-900">
                    <span>Итого по заявке:</span>
                    <span className="text-blue-700">{o.totalItemsCount} мест ({o.totalWeightKg} кг)</span>
                  </div>
                </div>

                {/* Кнопки Вариант А, Вариант Б, Вариант В */}
                {isWaiting && (
                  <div className="flex flex-wrap gap-2.5 pt-1 justify-end">
                    <button
                      type="button"
                      onClick={() => handleApproveFull(o)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Вариант А: Подтвердить 100%
                    </button>
                    <button
                      type="button"
                      onClick={() => openAdjustmentModal(o)}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Вариант Б: Подтвердить частично (с причиной)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const reason = prompt('Укажите причину отклонения заявки:');
                        if (reason) {
                          db.orders.update(o.id, { status: 'PROBLEM' });
                          logAudit(currentUser, 'ORDER_REJECTED', 'ORDER', o.id, `Завсклад отклонил заявку: ${reason}`);
                          loadData();
                        }
                      }}
                      className="px-3.5 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold transition flex items-center gap-1"
                    >
                      <XCircle className="w-4 h-4" />
                      Вариант В: Отклонить
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ТАБ 2: КОМПЛЕКТАЦИЯ (СБОРОЧНЫЕ ЗАДАНИЯ, п. 10 ТЗ) */}
      {activeTab === 'picking' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-200">
          <div className="px-6 py-4 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">Сборочные задания для складских рабочих</h3>
            <span className="text-xs text-slate-500">Заданий: {pickingTasks.length}</span>
          </div>

          {pickingTasks.map(pt => (
            <div key={pt.id} className="p-5 hover:bg-slate-50/80 transition space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-900 text-base">Задание к заказу {pt.orderNumber}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    pt.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                  }`}>
                    {pt.status === 'COMPLETED' ? 'Собрано полностью ✓' : 'На сборке у комплектовщиков'}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  Назначено: {pt.assignedWorkerNames.join(', ')}
                </span>
              </div>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden text-xs">
                {pt.items.map(it => (
                  <div key={it.id} className="p-2.5 flex justify-between items-center bg-white">
                    <span className="font-medium text-slate-800">{it.productName} ({it.packageWeightKg} кг)</span>
                    <span className="font-mono font-bold text-slate-900">
                      Собрано: {it.requiredQty}/{it.requiredQty} мешков ✓
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ТАБ 3: РАБОТНИКИ, ТАБЕЛЬ И СДЕЛЬНАЯ ВЫРАБОТКА (п. 11, 12, 13, 14 ТЗ) */}
      {activeTab === 'workers' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {/* ТАБЕЛЬ ПРИСУТСТВИЯ НА СЕГОДНЯ (п. 13 ТЗ) */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Табель присутствия на смене (22.09.2026)
                </h3>
                <span className="text-xs text-slate-500">
                  На смене: <strong>{attendance.filter(a => a.status === 'PRESENT').length}</strong> чел.
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {workers.map(w => {
                  const att = attendance.find(a => a.workerId === w.id);
                  const isPresent = att?.status === 'PRESENT';

                  return (
                    <div key={w.id} className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{w.fullName}</div>
                        <div className="text-xs text-slate-500">{w.position} • {w.phone}</div>
                        {att?.reason && (
                          <div className="text-[11px] text-amber-700 mt-0.5">Причина: {att.reason}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSetAttendance(w.id, 'PRESENT')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                            isPresent ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          ✓ Явка
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const reason = prompt('Причина отсутствия (Больничный, Отпуск, Выходной, Не вышел):', 'Больничный');
                            if (reason) handleSetAttendance(w.id, 'SICK', reason);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                            !isPresent && att?.status ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          ✕ Отсутствует
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ЖУРНАЛ СДЕЛЬНОЙ ВЫРАБОТКИ (п. 12 ТЗ) */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Учет сдельной работы за сегодня (кг)
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  Суммарно: {workLogs.reduce((sum, l) => sum + l.volumeKg, 0)} кг
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Работник</th>
                      <th className="p-3">Операция</th>
                      <th className="p-3 text-right">Объем (кг)</th>
                      <th className="p-3 text-right">Тариф</th>
                      <th className="p-3 text-right">Сумма (сом)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workLogs.map(l => (
                      <tr key={l.id} className="hover:bg-slate-50 font-medium">
                        <td className="p-3 font-bold text-slate-900">{l.workerName}</td>
                        <td className="p-3 text-slate-600">{l.operationType}</td>
                        <td className="p-3 text-right font-black text-slate-900 font-mono">{l.volumeKg} кг</td>
                        <td className="p-3 text-right text-slate-500">{l.tariffRatePerKg} /кг</td>
                        <td className="p-3 text-right font-bold text-emerald-700 font-mono">{l.calculatedAmount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Боковая форма добавления выработки (п. 12, 14 ТЗ) */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 space-y-5">
            <div>
              <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-[10px] uppercase">
                Сдельный расчет
              </span>
              <h3 className="text-base font-bold text-white mt-2">
                Зафиксировать объем работы
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Расчет: Объем (кг) × Тариф (0.15 сом) = Сумма начисления
              </p>
            </div>

            <form onSubmit={handleAddWorkLog} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Работник:</label>
                <select
                  value={selectedWorkerId}
                  onChange={e => setSelectedWorkerId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:ring-2 focus:ring-amber-500"
                >
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.fullName} ({w.position})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Выполненный объем (кг):</label>
                <input
                  type="number"
                  min="10"
                  step="10"
                  value={workVolumeKg}
                  onChange={e => setWorkVolumeKg(parseInt(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-black text-amber-400 font-mono focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 text-xs space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Тариф за 1 кг:</span>
                  <span className="font-bold text-white">0.15 сом</span>
                </div>
                <div className="flex justify-between text-slate-200 border-t border-slate-700 pt-1 font-bold">
                  <span>Расчетная сумма:</span>
                  <span className="text-amber-400 font-mono text-sm">{(workVolumeKg * 0.15).toFixed(2)} сом</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition"
              >
                Записать выработку в журнал
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ТАБ 4: ДВУХСТОРОННЯЯ СВЕРКА ПРИ ПОГРУЗКЕ (п. 16 ТЗ) */}
      {activeTab === 'loading' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-xs text-slate-600 flex items-center justify-between">
            <div>
              <strong>Регламент п. 16 ТЗ:</strong> Груз отправляется в рейс только после двойного подтверждения Завсклада и Таксимота. При расхождении веса выезд блокируется.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {loadingOps.map(op => {
              const hasZavsklad = op.zavskladConfirmedAt !== undefined;
              const hasDriver = op.driverConfirmedAt !== undefined;
              const isDiscrepancy = hasZavsklad && hasDriver && op.warehouseWeightKg !== op.driverWeightKg;
              const isReady = hasZavsklad && hasDriver && !isDiscrepancy;

              return (
                <div
                  key={op.id}
                  className={`bg-white rounded-2xl p-6 border shadow-sm space-y-4 ${
                    isDiscrepancy ? 'border-rose-400 ring-2 ring-rose-400/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                    <div>
                      <span className="font-black text-slate-900 text-lg">{op.routeNumber}</span>
                      <div className="text-xs text-slate-500">{op.vehicleName} • Водитель: {op.driverName}</div>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      isDiscrepancy
                        ? 'bg-rose-600 text-white animate-pulse'
                        : isReady
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {isDiscrepancy ? 'ВЫЕЗД ЗАБЛОКИРОВАН (РАСХОЖДЕНИЕ)' : isReady ? 'СВЕРКА ПРОЙДЕНА (ГОТОВ К ВЫЕЗДУ)' : 'ОЖИДАЕТ СВЕРКИ'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="space-y-1">
                      <span className="text-slate-500 font-semibold">Данные склада:</span>
                      <div className="font-bold text-slate-900 text-sm font-mono">{op.warehouseWeightKg} кг</div>
                      <div className="text-[11px] text-slate-500">{op.totalPackagesCount} мест</div>
                      <div className="text-[11px] font-bold text-emerald-600">
                        {hasZavsklad ? '✓ Завсклад подтвердил' : 'Ожидает подписи склада'}
                      </div>
                    </div>

                    <div className="space-y-1 border-l border-slate-200 pl-3">
                      <span className="text-slate-500 font-semibold">Данные таксимота:</span>
                      <div className="font-bold text-slate-900 text-sm font-mono">{op.driverWeightKg} кг</div>
                      <div className="text-[11px] text-slate-500">{op.totalPackagesCount} мест</div>
                      <div className="text-[11px] font-bold text-emerald-600">
                        {hasDriver ? '✓ Таксимот подтвердил' : 'Ожидает подписи таксимота'}
                      </div>
                    </div>
                  </div>

                  {isDiscrepancy && (
                    <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-rose-700">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        Расхождение обнаружено! Завсклад: {op.warehouseWeightKg} кг vs Таксимот: {op.driverWeightKg} кг
                      </div>
                      <p>Система заблокировала начало рейса до устранения несоответствия на рампе погрузки.</p>
                    </div>
                  )}

                  {!hasZavsklad && (
                    <button
                      type="button"
                      onClick={() => handleConfirmZavskladLoading(op)}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Подтверждаю передачу груза ({op.warehouseWeightKg} кг)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ТАБ 5: ОСТАТКИ ГОТОВОЙ ПРОДУКЦИИ (п. 49 ТЗ) */}
      {activeTab === 'stock' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">Складские остатки и контроль минимального запаса</h3>
            <span className="text-xs text-slate-500">Склад №1 (Душанбе)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px]">
                <tr>
                  <th className="p-3.5">Продукция</th>
                  <th className="p-3.5">Фасовка</th>
                  <th className="p-3.5 text-right">Физический остаток</th>
                  <th className="p-3.5 text-right">В резерве</th>
                  <th className="p-3.5 text-right">Доступно к заказу</th>
                  <th className="p-3.5 text-right">Мин. уровень (Safety)</th>
                  <th className="p-3.5 text-center">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {stock.map(s => {
                  const available = s.quantityPhysical - s.quantityReserved;
                  const isLow = available <= s.minCriticalLevel;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="p-3.5 font-bold text-slate-900">{s.productName}</td>
                      <td className="p-3.5 text-slate-600">{s.packageWeightKg} кг</td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-900">{s.quantityPhysical} мешков</td>
                      <td className="p-3.5 text-right font-mono text-purple-600 font-bold">{s.quantityReserved}</td>
                      <td className="p-3.5 text-right font-mono font-black text-blue-600">{available}</td>
                      <td className="p-3.5 text-right font-mono text-slate-500">{s.minCriticalLevel}</td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isLow ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isLow ? 'КРИТИЧЕСКИЙ' : 'НОРМА'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО ЧАСТИЧНОЙ КОРРЕКТИРОВКИ (п. 8, 9, 27 ТЗ) */}
      {adjustingOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="font-bold text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span>Частичное подтверждение: {adjustingOrder.orderNumber}</span>
              </div>
              <button onClick={() => setAdjustingOrder(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-900">
                <strong>Регламент Audit Trail (п. 9 ТЗ):</strong> Данные о запрошенном и фактически подтвержденном количестве сохраняются неразрывно с фиксацией автора, времени и обязательной причины.
              </div>

              <div className="space-y-3">
                <label className="block font-bold text-slate-800 uppercase">Укажите подтверждаемое количество:</label>
                {adjustingOrder.items.map(it => (
                  <div key={it.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900">{it.productName} ({it.packageWeightKg} кг)</div>
                      <div className="text-slate-500">Запрошено клиентом: <strong>{it.requestedQty} шт.</strong></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Фактически:</span>
                      <input
                        type="number"
                        min="0"
                        max={it.requestedQty}
                        value={adjustmentQtys[it.id] ?? it.requestedQty}
                        onChange={e => setAdjustmentQtys({ ...adjustmentQtys, [it.id]: parseInt(e.target.value) || 0 })}
                        className="w-20 px-2 py-1 text-center font-bold text-slate-900 border border-slate-300 rounded-lg bg-white"
                      />
                      <span className="font-bold text-slate-700">шт.</span>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-bold text-slate-800 uppercase mb-1">
                  Обязательная причина корректировки <span className="text-rose-500">*</span>
                </label>
                <select
                  value={adjustmentReason}
                  onChange={e => setAdjustmentReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium text-slate-900 bg-white"
                >
                  <option value="Недостаток продукции на складе">Недостаток продукции на складе</option>
                  <option value="Остаток зарезервирован для другой точки">Остаток зарезервирован для другой точки</option>
                  <option value="Партия находится на стадии фасовки/сушки">Партия находится на стадии фасовки/сушки</option>
                  <option value="Ограничение грузоподъемности автомобиля">Ограничение грузоподъемности автомобиля</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-800 uppercase mb-1">Подробный комментарий:</label>
                <textarea
                  rows={2}
                  value={adjustmentComment}
                  onChange={e => setAdjustmentComment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustingOrder(null)}
                  className="flex-1 py-2.5 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-100"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={submitPartialAdjustment}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl uppercase tracking-wider shadow-sm"
                >
                  Зафиксировать корректировку
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
