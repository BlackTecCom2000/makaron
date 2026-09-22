import React, { useState, useEffect } from 'react';
import {
  Compass,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Truck,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Layers,
  FileText,
  Clock,
  Send,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import type { User, Order, Shop, Vehicle, Route, RoutePoint } from '../types';
import { db, seedInitialData } from '../db/database';
import { syncEngine } from '../services/syncEngine';
import { logAudit } from '../services/auditService';
import { InteractiveMap } from '../components/InteractiveMap';

interface SupervisorViewProps {
  currentUser: User;
}

export const SupervisorView: React.FC<SupervisorViewProps> = ({ currentUser }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'routes' | 'map'>('orders');

  // Конструктор маршрутов
  const [selectedOrdersForRoute, setSelectedOrdersForRoute] = useState<string[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [routeStops, setRouteStops] = useState<RoutePoint[]>([]);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    const oList = await db.orders.reverse().sortBy('createdAt');
    setOrders(oList);

    const sList = await db.shops.toArray();
    setShops(sList);

    let vList = (await db.vehicles.toArray()).filter(v => v.isActive !== false);
    if (vList.length === 0) {
      await seedInitialData();
      vList = (await db.vehicles.toArray()).filter(v => v.isActive !== false);
    }
    setVehicles(vList);
    if (vList.length > 0 && !selectedVehicleId) {
      setSelectedVehicleId(vList[0].id);
    }

    const rList = await db.routes.reverse().sortBy('date');
    setRoutes(rList);
  };

  // 1. Согласование заказа агента и передача завскладу (п. 26 ТЗ)
  const handleForwardToWarehouse = async (order: Order) => {
    await db.orders.update(order.id, {
      status: 'WAREHOUSE_REVIEW',
      supervisorUserId: currentUser.id,
      supervisorName: currentUser.fullName,
      updatedAt: new Date().toISOString()
    });

    await db.notifications.add({
      id: 'notif-' + Date.now(),
      targetRole: 'ZAVSKLAD',
      title: `Заявка ${order.orderNumber} от супервайзера`,
      message: `Супервайзер ${currentUser.fullName} направил на склад заявку по точке «${order.destinationName}» (${order.totalWeightKg} кг).`,
      orderId: order.id,
      isRead: false,
      createdAt: new Date().toISOString()
    });

    await logAudit(
      currentUser,
      'SUPERVISOR_FORWARD_TO_WAREHOUSE',
      'ORDER',
      order.id,
      `Супервайзер завизировал заказ ${order.orderNumber} и передал на склад`
    );

    loadData();
    alert(`Заказ ${order.orderNumber} передан на проверку остатков завскладу!`);
  };

  // 2. Принятие супервайзером корректировки склада (п. 28-29 ТЗ)
  const handleAcceptWarehouseAdjustment = async (order: Order) => {
    // Супервайзер утверждает урезанное складом количество
    const updatedItems = order.items.map(it => ({
      ...it,
      approvedSupervisorQty: it.approvedWarehouseQty
    }));
    const newTotalItems = updatedItems.reduce((sum, it) => sum + it.approvedWarehouseQty, 0);
    const newTotalWeight = updatedItems.reduce((sum, it) => sum + (it.approvedWarehouseQty * it.packageWeightKg), 0);

    const updatedOrder: Order = {
      ...order,
      status: 'APPROVED', // Заказ утвержден и готов к комплектации!
      totalItemsCount: newTotalItems,
      totalWeightKg: newTotalWeight,
      items: updatedItems,
      updatedAt: new Date().toISOString()
    };

    updatedOrder.history.push({
      id: 'ver-' + Date.now(),
      orderId: order.id,
      versionNumber: order.history.length + 1,
      authorUserId: currentUser.id,
      authorName: currentUser.fullName,
      authorRole: 'SUPERVISOR',
      changeType: 'SUPERVISOR_ACCEPT',
      diffSummary: `Супервайзер акцептовал корректировку склада: утверждено ${newTotalItems} мест (${newTotalWeight} кг)`,
      timestamp: new Date().toISOString()
    });

    await db.orders.put(updatedOrder);

    // Уведомление агенту о принятии корректировки
    await db.notifications.add({
      id: 'notif-' + Date.now(),
      targetRole: 'AGENT',
      targetUserId: order.createdByUserId,
      title: `Заявка ${order.orderNumber} скорректирована`,
      message: `Заявка по магазину «${order.destinationName}» утверждена на ${newTotalWeight} кг. Причина склада: Недостаток продукции.`,
      orderId: order.id,
      isRead: false,
      createdAt: new Date().toISOString()
    });

    await logAudit(
      currentUser,
      'SUPERVISOR_ACCEPT_ADJUSTMENT',
      'ORDER',
      order.id,
      `Супервайзер утвердил корректировку заявки ${order.orderNumber}: ${newTotalWeight} кг`
    );

    loadData();
    alert(`Корректировка по заказу ${order.orderNumber} акцептована и передана в комплектацию!`);
  };

  // 3. Формирование маршрута (п. 31, 32 ТЗ)
  const toggleOrderSelection = (order: Order) => {
    if (selectedOrdersForRoute.includes(order.id)) {
      setSelectedOrdersForRoute(prev => prev.filter(id => id !== order.id));
      setRouteStops(prev => prev.filter(p => p.orderId !== order.id));
    } else {
      setSelectedOrdersForRoute(prev => [...prev, order.id]);
      const newStop: RoutePoint = {
        id: 'stop-' + Math.random().toString(36).substring(2, 7),
        routeId: '',
        sequenceOrder: routeStops.length + 1,
        shopId: order.shopId,
        pointId: order.pointId,
        targetName: order.destinationName,
        address: order.destinationAddress,
        geoLat: order.destinationLat,
        geoLng: order.destinationLng,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'PENDING',
        packagesCount: order.totalItemsCount,
        totalWeightKg: order.totalWeightKg
      };
      setRouteStops(prev => [...prev, newStop]);
    }
  };

  const moveStop = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= routeStops.length) return;
    const newStops = [...routeStops];
    const temp = newStops[index];
    newStops[index] = newStops[targetIndex];
    newStops[targetIndex] = temp;
    // пересчет номеров остановок
    newStops.forEach((st, idx) => {
      st.sequenceOrder = idx + 1;
    });
    setRouteStops(newStops);
  };

  const handleCreateRoute = async () => {
    if (routeStops.length === 0) {
      alert('Выберите хотя бы одну точку для маршрута.');
      return;
    }
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (!vehicle) return;

    const routeCount = await db.routes.count();
    const routeNum = `Рейс #0052${routeCount + 1}`;
    const routeId = 'route-' + Date.now();

    const finalizedStops = routeStops.map(s => ({
      ...s,
      routeId
    }));

    const newRoute: Route = {
      id: routeId,
      routeNumber: routeNum,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      driverUserId: vehicle.driverUserId || 'user-taxsimot-1',
      driverName: vehicle.driverName || 'Рахимов Рустам',
      supervisorUserId: currentUser.id,
      supervisorName: currentUser.fullName,
      date: new Date().toISOString().split('T')[0],
      status: 'LOCKED', // Зафиксирован v1 (п. 32 ТЗ)
      currentVersion: 1,
      lockedAt: new Date().toISOString(),
      points: finalizedStops,
      history: [
        {
          id: 'rv-1',
          routeId,
          versionNumber: 1,
          reason: 'Первоначальное утверждение маршрута',
          modifiedByUserId: currentUser.id,
          modifiedByName: currentUser.fullName,
          pointsSnapshot: finalizedStops,
          createdAt: new Date().toISOString()
        }
      ]
    };

    await db.routes.add(newRoute);

    // Обновляем заказы - привязка к погрузке
    for (const st of finalizedStops) {
      await db.orders.update(st.orderId, {
        status: 'READY_FOR_LOADING',
        updatedAt: new Date().toISOString()
      });
    }

    // Создаем операцию погрузки для завсклада и таксимота
    const totalWeight = finalizedStops.reduce((sum, s) => sum + s.totalWeightKg, 0);
    const totalPackages = finalizedStops.reduce((sum, s) => sum + s.packagesCount, 0);

    await db.loadingOperations.add({
      id: 'loading-' + Date.now(),
      routeId,
      routeNumber: routeNum,
      warehouseId: 'wh-1',
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      driverUserId: vehicle.driverUserId || 'user-taxsimot-1',
      driverName: vehicle.driverName || 'Рахимов Рустам',
      zavskladUserId: 'user-zavsklad-1',
      zavskladName: 'Каримов Назир',
      totalPackagesCount: totalPackages,
      totalWeightKg: totalWeight,
      warehouseWeightKg: totalWeight,
      driverWeightKg: totalWeight,
      status: 'PREPARING',
      isDiscrepancy: false,
      discrepancyWeightKg: 0
    });

    // Уведомления Завскладу и Таксимоту
    await db.notifications.add({
      id: 'notif-' + Date.now(),
      targetRole: 'ZAVSKLAD',
      title: `Сформирован ${routeNum}`,
      message: `${newRoute.vehicleName}: ${finalizedStops.length} точек, общий вес: ${totalWeight} кг. Готов к комплектации и погрузке.`,
      isRead: false,
      createdAt: new Date().toISOString()
    });

    await db.notifications.add({
      id: 'notif-' + (Date.now() + 1),
      targetRole: 'TAXSIMOT',
      title: `Назначен ${routeNum}`,
      message: `Вам назначен рейс на сегодня: ${finalizedStops.length} точек, вес: ${totalWeight} кг.`,
      isRead: false,
      createdAt: new Date().toISOString()
    });

    await logAudit(
      currentUser,
      'ROUTE_CREATED_AND_LOCKED',
      'ROUTE',
      routeId,
      `Супервайзер сформировал и зафиксировал ${routeNum} (v1): ${finalizedStops.length} точек, ${totalWeight} кг`
    );

    alert(`Маршрут ${routeNum} успешно зафиксирован (Версия v1) и передан на погрузку!`);
    setSelectedOrdersForRoute([]);
    setRouteStops([]);
    loadData();
    setActiveTab('routes');
  };

  // Карта маркеров для супервайзера
  const mapMarkers = [
    {
      id: 'wh-1',
      lat: 38.5358,
      lng: 68.7790,
      title: 'Центральный Склад №1 (Пункт отправки)',
      type: 'warehouse' as const
    },
    ...routeStops.map(s => ({
      id: s.id,
      lat: s.geoLat,
      lng: s.geoLng,
      title: s.targetName,
      subtitle: `${s.address} (${s.totalWeightKg} кг)`,
      type: 'shop' as const,
      sequenceNumber: s.sequenceOrder
    }))
  ];

  const routePath: Array<[number, number]> = [
    [38.5358, 68.7790], // Склад
    ...routeStops.map(s => [s.geoLat, s.geoLng] as [number, number])
  ];

  return (
    <div className="space-y-6">
      {/* Шапка Кабинета Супервайзера */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center font-bold">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-xs font-bold uppercase tracking-wider">
                Кабинет Супервайзера
              </span>
              <span className="text-xs text-slate-500 font-mono">Согласование • Корректировки • Конструктор маршрутов</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-0.5">
              Управление дистрибуцией и логистикой: {currentUser.fullName}
            </h1>
            <p className="text-xs text-slate-500">
              Сектор: Душанбе Центральный • Активных рейсов: {routes.filter(r => r.status !== 'COMPLETED').length}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'orders' ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            Входящие заявки
          </button>
          <button
            onClick={() => setActiveTab('routes')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'routes' ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            Конструктор маршрутов ({routeStops.length})
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'map' ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Карта сектора
          </button>
        </div>
      </div>

      {/* ТАБ 1: ВХОДЯЩИЕ ЗАЯВКИ И КОРРЕКТИРОВКИ СКЛАДА */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold">Новые заявки от агентов</span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {orders.filter(o => o.status === 'SUPERVISOR_REVIEW').length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold">На проверке склада</span>
              <div className="text-2xl font-black text-blue-600 mt-1">
                {orders.filter(o => o.status === 'WAREHOUSE_REVIEW').length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold">Корректировки склада (Дефицит)</span>
              <div className="text-2xl font-black text-amber-600 mt-1">
                {orders.filter(o => o.status === 'PARTIALLY_APPROVED').length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold">Готовы к маршрутизации</span>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {orders.filter(o => o.status === 'APPROVED').length}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-200">
            <div className="px-6 py-4 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm">Реестр входящих заказов Режима 2</h3>
              <span className="text-xs text-slate-500">Всего: {orders.length}</span>
            </div>

            {orders.map(o => {
              const isWarehouseAdjustment = o.status === 'PARTIALLY_APPROVED';
              const lastAdjustment = o.history.find(h => h.changeType === 'WAREHOUSE_ADJUSTMENT');

              return (
                <div key={o.id} className="p-5 hover:bg-slate-50/60 transition space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="font-black text-slate-900 text-base">{o.orderNumber}</span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                        {o.status}
                      </span>
                      <span className="font-bold text-slate-800 text-sm">{o.destinationName}</span>
                    </div>
                    <span className="text-xs text-slate-400">
                      Создан: {new Date(o.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} • Агент: {o.createdByName}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 flex flex-wrap gap-4">
                    <span>Адрес: <strong className="text-slate-900">{o.destinationAddress}</strong></span>
                    <span>Мест: <strong className="text-slate-900">{o.totalItemsCount} шт.</strong></span>
                    <span>Вес: <strong className="text-slate-900">{o.totalWeightKg} кг</strong></span>
                  </div>

                  {/* Если склад частично скорректировал заявку (п. 28 ТЗ) */}
                  {isWarehouseAdjustment && (
                    <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 font-bold text-amber-900 text-xs">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Склад предлагает частичное выполнение!</span>
                      </div>
                      <p className="text-xs text-amber-800">
                        Причина склада: <strong>{lastAdjustment?.reasonCategory}</strong>. {lastAdjustment?.reasonComment}
                      </p>

                      <div className="divide-y divide-amber-200/60 border border-amber-200 rounded-lg overflow-hidden bg-white text-xs">
                        {o.items.map(it => (
                          <div key={it.id} className="p-2 flex justify-between items-center">
                            <span className="font-medium text-slate-800">{it.productName} ({it.packageWeightKg} кг)</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-500">Запрос: <strong>{it.requestedQty} шт.</strong></span>
                              <span className="text-amber-700 font-bold">Склад: <strong>{it.approvedWarehouseQty} шт.</strong></span>
                              <span className="text-rose-600 font-bold font-mono">({it.approvedWarehouseQty - it.requestedQty})</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => handleAcceptWarehouseAdjustment(o)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Принять корректировку склада и передать в сборку
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Действия супервайзера */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-xs text-slate-500">
                      {o.status === 'SUPERVISOR_REVIEW' && 'Заявка ожидает вашего визирования для отправки на склад.'}
                      {o.status === 'APPROVED' && 'Заявка полностью утверждена! Включите её в рейс в Конструкторе маршрутов.'}
                    </div>

                    <div className="flex gap-2">
                      {o.status === 'SUPERVISOR_REVIEW' && (
                        <button
                          type="button"
                          onClick={() => handleForwardToWarehouse(o)}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Завизировать и передать на склад
                        </button>
                      )}

                      {o.status === 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => {
                            toggleOrderSelection(o);
                            setActiveTab('routes');
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                            selectedOrdersForRoute.includes(o.id)
                              ? 'bg-emerald-600 text-white'
                              : 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                          }`}
                        >
                          {selectedOrdersForRoute.includes(o.id) ? 'Включен в рейс ✓' : '+ Добавить в рейс'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ТАБ 2: ИНТЕРАКТИВНЫЙ КОНСТРУКТОР МАРШРУТОВ (п. 31, 32 ТЗ) */}
      {activeTab === 'routes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Последовательность точек рейса</h3>
                  <p className="text-xs text-slate-500">
                    Изменяйте порядок точек кнопками вверх/вниз. Маршрут на карте перестроится мгновенно.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700">Транспорт:</label>
                  <select
                    value={selectedVehicleId}
                    onChange={e => setSelectedVehicleId(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 bg-white"
                  >
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.plateNumber}) — {v.driverName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {routeStops.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                  Точки рейса пока не выбраны. Перейдите во «Входящие заявки» и нажмите «+ Добавить в рейс» для утвержденных заказов.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {routeStops.map((stop, idx) => (
                    <div
                      key={stop.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-white transition flex items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-600 text-white font-black text-xs flex items-center justify-center shadow-sm">
                          {stop.sequenceOrder}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <span>{stop.targetName}</span>
                            <span className="text-xs font-mono text-slate-500 font-normal">({stop.orderNumber})</span>
                          </div>
                          <div className="text-xs text-slate-500 line-clamp-1">{stop.address}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-900 bg-slate-200 px-2.5 py-1 rounded-lg">
                          {stop.totalWeightKg} кг ({stop.packagesCount} мест)
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveStop(idx, 'up')}
                            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Поднять точку в очереди"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === routeStops.length - 1}
                            onClick={() => moveStop(idx, 'down')}
                            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Опустить точку в очереди"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Интерактивная карта прокладки маршрута */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-purple-600" />
                Визуализация нити маршрута от Склада №1 до торговых точек:
              </div>
              <InteractiveMap markers={mapMarkers} routePath={routePath} height="320px" />
            </div>
          </div>

          {/* Боковая карточка фиксации рейса */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="px-2 py-0.5 rounded-md bg-purple-400 text-slate-950 font-black text-[10px] uppercase">
                  Маршрутизация рейса
                </span>
                <h3 className="text-lg font-bold text-white mt-2">
                  {vehicles.find(v => v.id === selectedVehicleId)?.name || 'Автомобиль'}
                </h3>
                <div className="text-xs text-slate-400 mt-0.5">
                  Водитель: {vehicles.find(v => v.id === selectedVehicleId)?.driverName}
                </div>
              </div>

              <div className="bg-slate-800/80 rounded-xl p-4 space-y-2 border border-slate-700/60">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Количество остановок:</span>
                  <span className="font-bold text-white text-sm">{routeStops.length} точек</span>
                </div>
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Общее количество мест:</span>
                  <span className="font-bold text-white text-sm">
                    {routeStops.reduce((sum, s) => sum + s.packagesCount, 0)} шт.
                  </span>
                </div>
                <div className="border-t border-slate-700 pt-2 flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-slate-200">Совокупный вес:</span>
                  <span className="text-2xl font-black text-amber-400 font-mono">
                    {routeStops.reduce((sum, s) => sum + s.totalWeightKg, 0).toLocaleString('ru-RU')} кг
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 bg-slate-800/40 p-3 rounded-lg border border-slate-800 space-y-1">
                <div className="text-amber-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Фиксация версии v1 (п. 32 ТЗ):
                </div>
                <div>
                  После подтверждения маршрут блокируется. Любые изменения после выезда потребуют создания новой версии <span className="font-mono text-white">v2</span> с фиксацией причины.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreateRoute}
              disabled={routeStops.length === 0}
              className="w-full py-3.5 px-4 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-slate-950 font-black rounded-xl shadow-lg shadow-purple-500/20 text-xs uppercase tracking-wider transition flex items-center justify-center gap-2"
            >
              <span>Зафиксировать рейс v1 и передать на погрузку</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ТАБ 3: КАРТА СЕКТОРА */}
      {activeTab === 'map' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-xs text-slate-600">
            Отображение всех объектов торговой сети: Склады, внешние магазины и активные маршруты.
          </div>
          <InteractiveMap markers={mapMarkers} routePath={routePath} height="500px" />
        </div>
      )}
    </div>
  );
};
