import React, { useState, useEffect } from 'react';
import {
  Store,
  PlusCircle,
  Clock,
  Package,
  CheckCircle2,
  AlertCircle,
  Truck,
  ArrowRight,
  FileText
} from 'lucide-react';
import type { User, Order, ProductPackage } from '../types';
import { db } from '../db/database';
import { syncEngine } from '../services/syncEngine';
import { logAudit } from '../services/auditService';

interface PointViewProps {
  currentUser: User;
}

export const PointView: React.FC<PointViewProps> = ({ currentUser }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [selectedWeight, setSelectedWeight] = useState<number>(23); // Фасовка 23 кг по умолчанию как в ТЗ
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    const pkgs = await db.productPackages.where('isActive').equals(1).toArray();
    setPackages(pkgs);

    const pointOrders = await db.orders
      .where('pointId')
      .equals(currentUser.pointId || 'point-1')
      .reverse()
      .sortBy('createdAt');
    setOrders(pointOrders);

    // Инициализация дефолтных количеств для фасовки 23 кг (как в примере ТЗ: Вермишель 15, Макароны 20, Лапша 10)
    const initialQty: Record<string, number> = {};
    pkgs.filter(p => p.packageWeightKg === 23).forEach(p => {
      if (p.productName.includes('Вермишель')) initialQty[p.id] = 15;
      else if (p.productName.includes('Макароны')) initialQty[p.id] = 20;
      else if (p.productName.includes('Лапша')) initialQty[p.id] = 10;
      else initialQty[p.id] = 0;
    });
    setQuantities(initialQty);
  };

  const filteredPackages = packages.filter(p => p.packageWeightKg === selectedWeight);

  const totalItems = Object.entries(quantities).reduce((sum, [pkgId, qty]) => {
    const pkg = packages.find(p => p.id === pkgId);
    if (pkg && pkg.packageWeightKg === selectedWeight) {
      return sum + (Number(qty) || 0);
    }
    return sum;
  }, 0);

  const totalWeight = totalItems * selectedWeight;

  const handleQtyChange = (pkgId: string, val: number) => {
    setQuantities(prev => ({
      ...prev,
      [pkgId]: Math.max(0, val)
    }));
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalItems <= 0) {
      alert('Укажите хотя бы одну единицу продукции для заказа.');
      return;
    }

    setIsSubmitting(true);
    try {
      const orderCount = await db.orders.count();
      const orderNum = `#000${150 + orderCount + 1}`;
      const orderId = 'order-' + Date.now();
      const point = await db.companyPoints.get(currentUser.pointId || 'point-1');

      const items = filteredPackages
        .filter(p => (quantities[p.id] || 0) > 0)
        .map(p => ({
          id: 'item-' + Math.random().toString(36).substring(2, 7),
          orderId,
          productPackageId: p.id,
          productName: p.productName,
          packageWeightKg: p.packageWeightKg,
          unitType: p.unitType,
          requestedQty: quantities[p.id] || 0,
          approvedSupervisorQty: quantities[p.id] || 0,
          approvedWarehouseQty: quantities[p.id] || 0,
          unitWeightKg: p.packageWeightKg
        }));

      const newOrder: Order = {
        id: orderId,
        orderNumber: orderNum,
        mode: 'MODE_1_DIRECT',
        status: 'SUBMITTED',
        pointId: currentUser.pointId || 'point-1',
        destinationName: point?.name || 'Фирменная точка «Магазин №4»',
        destinationAddress: point?.address || 'ул. Негмата Карабаева 28',
        destinationLat: point?.geoLat || 38.528,
        destinationLng: point?.geoLng || 68.769,
        createdByUserId: currentUser.id,
        createdByName: currentUser.fullName,
        createdByRole: 'POINT',
        totalWeightKg: totalWeight,
        totalItemsCount: totalItems,
        clientUuid: 'uuid-' + Date.now(),
        items,
        history: [
          {
            id: 'ver-' + Date.now(),
            orderId,
            versionNumber: 1,
            authorUserId: currentUser.id,
            authorName: currentUser.fullName,
            authorRole: 'POINT',
            changeType: 'CREATED',
            diffSummary: `Создана прямая заявка: ${totalItems} шт., ${totalWeight} кг (Фасовка ${selectedWeight} кг)`,
            timestamp: new Date().toISOString()
          }
        ],
        comments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await db.orders.add(newOrder);

      // Уведомление завскладу
      await db.notifications.add({
        id: 'notif-' + Date.now(),
        targetRole: 'ZAVSKLAD',
        title: `Новая прямая заявка ${orderNum}`,
        message: `${point?.name}: заказано ${totalItems} мешков (${totalWeight} кг). Ожидает рассмотрения.`,
        orderId,
        isRead: false,
        createdAt: new Date().toISOString()
      });

      // Лог в Audit Trail и Offline Queue
      await logAudit(
        currentUser,
        'ORDER_CREATED',
        'ORDER',
        orderId,
        `Прямая заявка ${orderNum} на ${totalWeight} кг передана на склад`
      );
      await syncEngine.queueMutation('order', 'CREATE', newOrder);

      setSuccessMessage(`Заявка ${orderNum} успешно передана завскладу со статусом «Ожидает рассмотрения».`);
      loadData();
      setActiveTab('history');
    } catch (err) {
      console.error(err);
      alert('Ошибка при создании заявки');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReceipt = async (order: Order) => {
    if (!confirm(`Подтвердить фактическое получение продукции по накладной ${order.orderNumber}?`)) return;

    await db.orders.update(order.id, {
      status: 'CONFIRMED',
      updatedAt: new Date().toISOString()
    });

    await logAudit(
      currentUser,
      'DELIVERY_CONFIRMED',
      'ORDER',
      order.id,
      `Точка подтвердила электронную приемку накладной ${order.orderNumber}`
    );

    await db.notifications.add({
      id: 'notif-' + Date.now(),
      targetRole: 'SUPERVISOR',
      title: `Доставка подтверждена ${order.orderNumber}`,
      message: `${order.destinationName} подтвердила получение партии (${order.totalWeightKg} кг).`,
      orderId: order.id,
      isRead: false,
      createdAt: new Date().toISOString()
    });

    loadData();
    alert(`Приемка по заявке ${order.orderNumber} подтверждена!`);
  };

  return (
    <div className="space-y-6">
      {/* Шапка Кабинета Точки */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-xs font-bold uppercase tracking-wider">
                Режим №1: Прямое снабжение
              </span>
              <span className="text-xs text-slate-500 font-mono">Точка → Завсклад → Работники → Таксимот → Точка</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-0.5">
              Кабинет собственной торговой точки: Фирменный Магазин №4
            </h1>
            <p className="text-xs text-slate-500">
              Адрес: г. Душанбе, ул. Негмата Карабаева 28 • Контакт: Мавлонова Зарина (+992 918 11 22 33)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('create')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'create'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Сформировать заявку
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            История поставок ({orders.length})
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-xs text-emerald-700 font-bold underline">
            Закрыть
          </button>
        </div>
      )}

      {/* ТАБ 1: ФОРМИРОВАНИЕ ЗАЯВКИ */}
      {activeTab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" />
                Шаг 1. Выберите категорию фасовки
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Заказ формируется по выбранной фасовке упаковки. Система рассчитает общий вес партии автоматически.
              </p>

              <div className="flex flex-wrap gap-2.5 mt-3">
                {[5, 10, 15, 23, 25, 50].map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => {
                      setSelectedWeight(w);
                      const newQtys: Record<string, number> = {};
                      packages.filter(p => p.packageWeightKg === w).forEach(p => {
                        newQtys[p.id] = quantities[p.id] || 0;
                      });
                      setQuantities(newQtys);
                    }}
                    className={`px-4 py-2.5 rounded-xl font-bold text-sm border transition flex items-center gap-1.5 ${
                      selectedWeight === w
                        ? 'bg-slate-900 text-amber-400 border-slate-900 shadow-sm ring-2 ring-amber-400/30'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{w} кг</span>
                    {w === 23 && <span className="text-[10px] px-1.5 py-0.2 bg-amber-400 text-slate-950 rounded-full font-black">ХИТ</span>}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-indigo-600" />
                Шаг 2. Укажите количество мест внутри категории ({selectedWeight} кг)
              </h2>

              <div className="space-y-3">
                {filteredPackages.map(pkg => (
                  <div
                    key={pkg.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-300 transition flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{pkg.productName}</div>
                      <div className="text-xs text-slate-500">
                        Фасовка: <span className="font-semibold text-slate-700">{pkg.packageWeightKg} кг</span> ({pkg.unitType}) • 1 место = {pkg.packageWeightKg} кг
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white shadow-xs">
                        <button
                          type="button"
                          onClick={() => handleQtyChange(pkg.id, (quantities[pkg.id] || 0) - 5)}
                          className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 font-bold text-sm"
                        >
                          -5
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQtyChange(pkg.id, (quantities[pkg.id] || 0) - 1)}
                          className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 font-bold text-sm border-r border-slate-200"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={quantities[pkg.id] ?? 0}
                          onChange={e => handleQtyChange(pkg.id, parseInt(e.target.value) || 0)}
                          className="w-16 text-center font-bold text-slate-900 text-sm focus:outline-hidden py-1.5"
                        />
                        <button
                          type="button"
                          onClick={() => handleQtyChange(pkg.id, (quantities[pkg.id] || 0) + 1)}
                          className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 font-bold text-sm border-l border-slate-200"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQtyChange(pkg.id, (quantities[pkg.id] || 0) + 5)}
                          className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 font-bold text-sm"
                        >
                          +5
                        </button>
                      </div>
                      <span className="text-xs text-slate-500 font-semibold w-10 text-right">
                        {(quantities[pkg.id] || 0) * pkg.packageWeightKg} кг
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Боковая карточка расчета заявки */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  Итоговый расчет заказа
                </span>
                <h3 className="text-lg font-bold text-white mt-1">
                  Фасовка: {selectedWeight} кг
                </h3>
              </div>

              <div className="space-y-2 text-xs">
                {filteredPackages
                  .filter(p => (quantities[p.id] || 0) > 0)
                  .map(p => (
                    <div key={p.id} className="flex justify-between items-center py-1 border-b border-slate-800/60">
                      <span className="text-slate-300">{p.productName}</span>
                      <span className="font-bold font-mono text-white">
                        {quantities[p.id]} шт. = {(quantities[p.id] || 0) * p.packageWeightKg} кг
                      </span>
                    </div>
                  ))}
              </div>

              <div className="bg-slate-800/80 rounded-xl p-4 space-y-2 border border-slate-700/60 mt-4">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Общее количество единиц:</span>
                  <span className="font-bold text-white text-sm">{totalItems} шт.</span>
                </div>
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Весовая категория:</span>
                  <span className="font-bold text-amber-400 text-sm">{selectedWeight} кг/мешок</span>
                </div>
                <div className="border-t border-slate-700 pt-2 flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-slate-200">Совокупный вес:</span>
                  <span className="text-2xl font-black text-amber-400 font-mono">
                    {totalWeight.toLocaleString('ru-RU')} кг
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-800/40 p-3 rounded-lg border border-slate-800">
                После отправки заявка поступит в кабинет завсклада с автоматическим статусом <span className="text-amber-300 font-semibold">«Ожидает рассмотрения»</span>.
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmitOrder}
              disabled={isSubmitting || totalItems === 0}
              className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
            >
              <span>{isSubmitting ? 'Отправка...' : 'Отправить заказ завскладу'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ТАБ 2: ИСТОРИЯ ЗАЯВОК И СТАТУС ВЫПОЛНЕНИЯ */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-900 text-sm">Журнал прямых заявок точки</h3>
            <span className="text-xs text-slate-500">Всего заявок: {orders.length}</span>
          </div>

          <div className="divide-y divide-slate-200">
            {orders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">Заявок пока нет</div>
            ) : (
              orders.map(o => {
                const getStatusBadge = (st: string) => {
                  switch (st) {
                    case 'SUBMITTED':
                      return { text: 'Ожидает рассмотрения', color: 'bg-amber-100 text-amber-800' };
                    case 'APPROVED':
                      return { text: 'Подтверждено 100%', color: 'bg-emerald-100 text-emerald-800' };
                    case 'PARTIALLY_APPROVED':
                      return { text: 'Частично подтверждено', color: 'bg-blue-100 text-blue-800' };
                    case 'PICKING':
                      return { text: 'Комплектация', color: 'bg-purple-100 text-purple-800' };
                    case 'LOADED':
                      return { text: 'Загружено на рампе', color: 'bg-indigo-100 text-indigo-800' };
                    case 'IN_TRANSIT':
                      return { text: 'В пути (Таксимот)', color: 'bg-teal-100 text-teal-800' };
                    case 'ARRIVED':
                      return { text: 'Прибыло на точку', color: 'bg-orange-100 text-orange-800' };
                    case 'CONFIRMED':
                      return { text: 'Получено точкой ✓', color: 'bg-emerald-600 text-white font-bold' };
                    default:
                      return { text: st, color: 'bg-slate-100 text-slate-800' };
                  }
                };

                const stBadge = getStatusBadge(o.status);

                return (
                  <div key={o.id} className="p-5 hover:bg-slate-50/80 transition flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-base">{o.orderNumber}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${stBadge.color}`}>
                          {stBadge.text}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(o.createdAt).toLocaleDateString('ru-RU')} {new Date(o.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                        <span>Мест: <strong className="text-slate-900">{o.totalItemsCount} шт.</strong></span>
                        <span>Общий вес: <strong className="text-slate-900">{o.totalWeightKg} кг</strong></span>
                        <span>Создал: <strong className="text-slate-900">{o.createdByName}</strong></span>
                      </div>

                      {/* Детализация позиций */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {o.items.map(it => (
                          <span
                            key={it.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs border border-slate-200"
                          >
                            <span>{it.productName} ({it.packageWeightKg} кг):</span>
                            <strong className="text-slate-900">
                              {it.approvedWarehouseQty !== it.requestedQty ? (
                                <span className="text-amber-600">
                                  {it.approvedWarehouseQty}/{it.requestedQty} шт.
                                </span>
                              ) : (
                                `${it.requestedQty} шт.`
                              )}
                            </strong>
                          </span>
                        ))}
                      </div>

                      {/* Если была корректировка завсклада */}
                      {o.history.some(h => h.changeType === 'WAREHOUSE_ADJUSTMENT') && (
                        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
                          <strong>Корректировка завсклада:</strong> {o.history.find(h => h.changeType === 'WAREHOUSE_ADJUSTMENT')?.reasonComment || 'Частичное наличие'}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-center">
                      {(o.status === 'IN_TRANSIT' || o.status === 'ARRIVED') && (
                        <button
                          onClick={() => handleConfirmReceipt(o)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Подтвердить получение
                        </button>
                      )}
                      {o.status === 'CONFIRMED' && (
                        <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Товар принят
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
