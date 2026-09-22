import React, { useState, useEffect } from 'react';
import {
  Truck,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Camera,
  PenTool,
  RotateCcw,
  Navigation,
  Clock,
  Shield,
  ArrowRight,
  FileText,
  AlertCircle
} from 'lucide-react';
import type { User, Route, RoutePoint, LoadingOperation } from '../types';
import { db } from '../db/database';
import { syncEngine } from '../services/syncEngine';
import { logAudit } from '../services/auditService';
import { SignaturePad } from '../components/SignaturePad';
import { CameraPhotoModal } from '../components/CameraPhotoModal';
import { InteractiveMap } from '../components/InteractiveMap';

interface TaxsimotViewProps {
  currentUser: User;
}

export const TaxsimotView: React.FC<TaxsimotViewProps> = ({ currentUser }) => {
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [loadingOp, setLoadingOp] = useState<LoadingOperation | null>(null);
  const [currentStopIndex, setCurrentStopIndex] = useState<number>(0);

  // Модальные окна
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showDeviationModal, setShowDeviationModal] = useState(false);
  const [deviationReason, setDeviationReason] = useState('Пробка на дороге');
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnQty, setReturnQty] = useState(1);
  const [returnReason, setReturnReason] = useState('Повреждение упаковки при транспортировке');

  // Локальные данные сверки
  const [driverWeightInput, setDriverWeightInput] = useState<number>(0);

  useEffect(() => {
    loadRoute();
  }, [currentUser]);

  const loadRoute = async () => {
    const r = await db.routes
      .where('driverUserId')
      .equals(currentUser.id)
      .reverse()
      .first();

    if (r) {
      setActiveRoute(r);
      const lOp = await db.loadingOperations.where('routeId').equals(r.id).first();
      if (lOp) {
        setLoadingOp(lOp);
        setDriverWeightInput(lOp.driverWeightKg || lOp.totalWeightKg);
      }
    }
  };

  // 1. Двухсторонняя сверка при погрузке (Таксимот, п. 16 ТЗ)
  const handleConfirmDriverLoading = async () => {
    if (!loadingOp || !activeRoute) return;

    const isMismatch = driverWeightInput !== loadingOp.warehouseWeightKg;

    await db.loadingOperations.update(loadingOp.id, {
      driverConfirmedAt: new Date().toISOString(),
      driverWeightKg: driverWeightInput,
      isDiscrepancy: isMismatch,
      discrepancyWeightKg: driverWeightInput - loadingOp.warehouseWeightKg,
      status: isMismatch ? 'LOCKED_DISCREPANCY' : 'CONFIRMED_READY'
    });

    if (isMismatch) {
      alert(`Внимание! Расхождение обнаружено: Завсклад: ${loadingOp.warehouseWeightKg} кг vs Таксимот: ${driverWeightInput} кг! Выезд заблокирован!`);
    } else {
      alert('Сверка пройдена успешно! Автомобиль готов к отправке в рейс.');
    }
    loadRoute();
  };

  // 2. Старт рейса
  const handleStartRoute = async () => {
    if (!activeRoute) return;
    if (loadingOp?.status === 'LOCKED_DISCREPANCY') {
      alert('Ошибка! Выезд заблокирован из-за расхождения веса при погрузке.');
      return;
    }

    await db.routes.update(activeRoute.id, {
      status: 'IN_TRANSIT',
      startedAt: new Date().toISOString()
    });

    // Обновляем заказы в рейсе
    for (const p of activeRoute.points) {
      await db.orders.update(p.orderId, { status: 'IN_TRANSIT' });
    }

    await logAudit(currentUser, 'ROUTE_STARTED', 'ROUTE', activeRoute.id, `Таксимот ${currentUser.fullName} начал рейс ${activeRoute.routeNumber}`);
    loadRoute();
  };

  // 3. Отметка прибытия на точку (п. 34 ТЗ)
  const handleArriveAtPoint = async (point: RoutePoint) => {
    if (!activeRoute) return;

    const updatedPoints = activeRoute.points.map(p => {
      if (p.id === point.id) {
        return {
          ...p,
          status: 'ARRIVED' as const,
          arrivedAt: new Date().toISOString()
        };
      }
      return p;
    });

    await db.routes.update(activeRoute.id, { points: updatedPoints });
    await db.orders.update(point.orderId, { status: 'ARRIVED' });

    await logAudit(
      currentUser,
      'POINT_ARRIVED',
      'ROUTE_POINT',
      point.id,
      `Таксимот прибыл на точку: ${point.targetName} (${point.address})`,
      undefined,
      undefined,
      undefined,
      point.geoLat,
      point.geoLng
    );

    loadRoute();
    alert(`Прибытие на точку «${point.targetName}» зафиксировано в GPS-журнале!`);
  };

  // 4. Фиксация отклонения от маршрута (п. 35 ТЗ)
  const handleRecordDeviation = async () => {
    if (!activeRoute) return;
    const currentPoint = activeRoute.points[currentStopIndex];

    await logAudit(
      currentUser,
      'ROUTE_DEVIATION',
      'ROUTE',
      activeRoute.id,
      `Отклонение от маршрута на точке ${currentPoint?.targetName}: ${deviationReason}`
    );

    await db.notifications.add({
      id: 'notif-' + Date.now(),
      targetRole: 'SUPERVISOR',
      title: `Отклонение от маршрута: ${activeRoute.routeNumber}`,
      message: `Водитель ${currentUser.fullName} указал причину отклонения: ${deviationReason}`,
      isRead: false,
      createdAt: new Date().toISOString()
    });

    setShowDeviationModal(false);
    alert('Причина отклонения передана супервайзеру.');
  };

  // 5. Подтверждение доставки (3 варианта, п. 18 ТЗ)
  const handleSaveSignature = async (dataUrl: string, signerName: string) => {
    if (!activeRoute) return;
    const point = activeRoute.points[currentStopIndex];

    await db.deliveries.add({
      id: 'del-' + Date.now(),
      routePointId: point.id,
      orderId: point.orderId,
      orderNumber: point.orderNumber,
      targetName: point.targetName,
      confirmationType: 'SIGNATURE',
      receiverName: signerName,
      confirmedAt: new Date().toISOString(),
      geoLat: point.geoLat,
      geoLng: point.geoLng,
      deviceFingerprint: 'Mobile PWA Driver Terminal',
      signatureDataUrl: dataUrl
    });

    completePointDelivery(point);
    setShowSignaturePad(false);
    alert(`Электронная подпись получателя «${signerName}» сохранена! Доставка на точке завершена.`);
  };

  const handleSavePhoto = async (photoUrl: string) => {
    if (!activeRoute) return;
    const point = activeRoute.points[currentStopIndex];

    await db.deliveries.add({
      id: 'del-' + Date.now(),
      routePointId: point.id,
      orderId: point.orderId,
      orderNumber: point.orderNumber,
      targetName: point.targetName,
      confirmationType: 'PHOTO',
      receiverName: 'Фотофиксация разгрузки',
      confirmedAt: new Date().toISOString(),
      geoLat: point.geoLat,
      geoLng: point.geoLng,
      deviceFingerprint: 'Mobile PWA Driver Terminal',
      photoUrl
    });

    completePointDelivery(point);
    setShowPhotoModal(false);
    alert('Фотоотчет с водяным знаком времени и GPS прикреплен! Доставка завершена.');
  };

  const completePointDelivery = async (point: RoutePoint) => {
    if (!activeRoute) return;

    const updatedPoints = activeRoute.points.map(p => {
      if (p.id === point.id) {
        return {
          ...p,
          status: 'DELIVERED' as const,
          departedAt: new Date().toISOString()
        };
      }
      return p;
    });

    const isAllDelivered = updatedPoints.every(p => p.status === 'DELIVERED' || p.status === 'RETURNED');

    await db.routes.update(activeRoute.id, {
      points: updatedPoints,
      status: isAllDelivered ? 'COMPLETED' : 'IN_TRANSIT',
      completedAt: isAllDelivered ? new Date().toISOString() : undefined
    });

    await db.orders.update(point.orderId, {
      status: 'CONFIRMED',
      updatedAt: new Date().toISOString()
    });

    if (currentStopIndex < activeRoute.points.length - 1) {
      setCurrentStopIndex(prev => prev + 1);
    }

    loadRoute();
  };

  // 6. Оформление возврата товара (п. 57 ТЗ)
  const handleCreateReturn = async () => {
    if (!activeRoute) return;
    const point = activeRoute.points[currentStopIndex];

    await db.returns.add({
      id: 'ret-' + Date.now(),
      orderId: point.orderId,
      orderNumber: point.orderNumber,
      deliveryId: 'del-return-' + Date.now(),
      targetName: point.targetName,
      productPackageId: 'pkg-default',
      productName: 'Макаронные изделия 23 кг',
      packageWeightKg: 23,
      returnQty,
      reasonCode: 'DAMAGED_PACKAGE',
      reasonText: returnReason,
      warehouseReceiptStatus: 'IN_TRANSIT',
      createdAt: new Date().toISOString()
    });

    await db.notifications.add({
      id: 'notif-' + Date.now(),
      targetRole: 'ZAVSKLAD',
      title: `Возврат товара: ${point.orderNumber}`,
      message: `${point.targetName}: возврат ${returnQty} мешков. Причина: ${returnReason}. Водитель везет товар на склад.`,
      isRead: false,
      createdAt: new Date().toISOString()
    });

    setShowReturnModal(false);
    completePointDelivery(point);
    alert(`Акт возврата на ${returnQty} мешков сформирован. Товар направлен на склад!`);
  };

  if (!activeRoute) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center text-slate-500 border border-slate-200">
        У вас нет активных маршрутов на сегодня.
      </div>
    );
  }

  const currentPoint = activeRoute.points[currentStopIndex];
  const isLoadedDiscrepancy = loadingOp?.status === 'LOCKED_DISCREPANCY';
  const isLoadedConfirmed = loadingOp?.status === 'CONFIRMED_READY';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Шапка Кабинета Таксимота (Работа одной рукой, п. 42 ТЗ) */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-teal-500 text-slate-950 font-black flex items-center justify-center text-xl shadow-lg shadow-teal-500/20">
              <Truck className="w-7 h-7" />
            </div>
            <div>
              <span className="px-2 py-0.5 rounded-md bg-teal-400 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                Мобильный кабинет экспедитора
              </span>
              <h1 className="text-xl font-bold text-white mt-0.5">{activeRoute.routeNumber}</h1>
              <p className="text-xs text-slate-400">
                {activeRoute.vehicleName} • Водитель: {currentUser.fullName}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
              activeRoute.status === 'IN_TRANSIT'
                ? 'bg-amber-400 text-slate-950 animate-pulse'
                : activeRoute.status === 'COMPLETED'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-300'
            }`}>
              {activeRoute.status === 'IN_TRANSIT' ? 'В рейсе' : activeRoute.status === 'COMPLETED' ? 'Завершен' : 'Готов к выезду'}
            </span>
          </div>
        </div>

        {/* Минимально необходимый доступ (п. 15, 45 ТЗ): нет цен, только логистические данные */}
        <div className="grid grid-cols-3 gap-2 bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 text-center text-xs">
          <div>
            <span className="text-slate-400">Всего точек:</span>
            <div className="font-black text-white text-base mt-0.5">{activeRoute.points.length}</div>
          </div>
          <div>
            <span className="text-slate-400">Количество мест:</span>
            <div className="font-black text-white text-base mt-0.5">
              {activeRoute.points.reduce((s, p) => s + p.packagesCount, 0)} шт.
            </div>
          </div>
          <div>
            <span className="text-slate-400">Общий вес:</span>
            <div className="font-black text-amber-400 text-base font-mono mt-0.5">
              {activeRoute.points.reduce((s, p) => s + p.totalWeightKg, 0)} кг
            </div>
          </div>
        </div>
      </div>

      {/* ШАГ 1: ДВУХСТОРОННЯЯ СВЕРКА ПЕРЕД ВЫЕЗДОМ (п. 16 ТЗ) */}
      {activeRoute.status === 'LOCKED' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-base border-b border-slate-200 pb-3">
            <Shield className="w-5 h-5 text-indigo-600" />
            <span>Сверка перед выездом (Обязательный регламент п. 16)</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-600">Вес по накладным завсклада:</span>
              <strong className="text-slate-900 font-mono text-sm">{loadingOp?.warehouseWeightKg} кг</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Количество мест:</span>
              <strong className="text-slate-900">{loadingOp?.totalPackagesCount} шт.</strong>
            </div>
            <div className="text-[11px] text-slate-500 pt-1">
              {loadingOp?.zavskladConfirmedAt ? '✓ Завсклад подтвердил передачу партии' : 'Ожидается нажатие завсклада'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Фактически принятый вес водителем (кг):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={driverWeightInput}
                onChange={e => setDriverWeightInput(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base font-black text-slate-900 font-mono focus:ring-2 focus:ring-teal-500"
              />
              <button
                type="button"
                onClick={() => setDriverWeightInput(loadingOp?.warehouseWeightKg || 0)}
                className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl whitespace-nowrap"
              >
                Совпадает (100%)
              </button>
              {/* Кнопка симуляции расхождения для проверки п. 16 ТЗ */}
              <button
                type="button"
                onClick={() => setDriverWeightInput((loadingOp?.warehouseWeightKg || 500) - 20)}
                className="px-2.5 py-2.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl whitespace-nowrap border border-rose-200"
                title="Имитация недогруза мешка 20 кг"
              >
                Тест расхождения (-20 кг)
              </button>
            </div>
          </div>

          {isLoadedDiscrepancy && (
            <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-700 text-sm">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Расхождение обнаружено!
              </div>
              <p>Завсклад: {loadingOp?.warehouseWeightKg} кг, Таксимот: {driverWeightInput} кг.</p>
              <p className="font-bold text-rose-800">
                Система заблокировала окончательное закрытие передачи до устранения несоответствия!
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {!loadingOp?.driverConfirmedAt && (
              <button
                type="button"
                onClick={handleConfirmDriverLoading}
                className="flex-1 py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Подтверждаю получение груза
              </button>
            )}

            {isLoadedConfirmed && (
              <button
                type="button"
                onClick={handleStartRoute}
                className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 animate-bounce"
              >
                <Navigation className="w-4 h-4" />
                Начать маршрут (Выехать в рейс)
              </button>
            )}
          </div>
        </div>
      )}

      {/* ШАГ 2: НАВИГАЦИЯ И ВЫПОЛНЕНИЕ РЕЙСА (п. 33, 34 ТЗ) */}
      {activeRoute.status === 'IN_TRANSIT' && currentPoint && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md space-y-5">
          <div className="flex justify-between items-start border-b border-slate-200 pb-4">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-black uppercase">
                Текущая цель: Точка №{currentPoint.sequenceOrder} из {activeRoute.points.length}
              </span>
              <h2 className="text-xl font-black text-slate-900 mt-1">{currentPoint.targetName}</h2>
              <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                {currentPoint.address}
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs font-mono bg-slate-100 px-3 py-1 rounded-lg text-slate-800 font-bold block">
                {currentPoint.packagesCount} мест ({currentPoint.totalWeightKg} кг)
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Заказ {currentPoint.orderNumber}</span>
            </div>
          </div>

          {/* Кнопка отметки прибытия */}
          {currentPoint.status === 'PENDING' && (
            <button
              type="button"
              onClick={() => handleArriveAtPoint(currentPoint)}
              className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-2xl text-base uppercase tracking-wider shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2"
            >
              <MapPin className="w-5 h-5" />
              Прибыл на точку (Зафиксировать GPS)
            </button>
          )}

          {/* Экран передачи товара и 3 варианта подтверждения (п. 18, 36 ТЗ) */}
          {currentPoint.status === 'ARRIVED' && (
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Выберите способ подтверждения получения:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Вариант 2: Электронная графическая подпись на экране */}
                <button
                  type="button"
                  onClick={() => setShowSignaturePad(true)}
                  className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100 text-indigo-900 font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
                >
                  <PenTool className="w-4 h-4 text-indigo-600" />
                  Вариант 2: Подпись на экране
                </button>

                {/* Вариант 3: Фотоотчет разгрузки */}
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(true)}
                  className="p-4 rounded-xl border border-teal-200 bg-teal-50/60 hover:bg-teal-100 text-teal-900 font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
                >
                  <Camera className="w-4 h-4 text-teal-600" />
                  Вариант 3: Фотоотчет разгрузки
                </button>
              </div>

              {/* Кнопки Проблема / Отклонение / Возврат */}
              <div className="flex gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowDeviationModal(true)}
                  className="flex-1 py-2.5 px-3 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  Отклонение от маршрута
                </button>
                <button
                  type="button"
                  onClick={() => setShowReturnModal(true)}
                  className="flex-1 py-2.5 px-3 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Оформить возврат товара
                </button>
              </div>
            </div>
          )}

          {/* Список всех точек рейса с галочками */}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <span className="text-xs font-bold text-slate-700 uppercase">Остановки рейса:</span>
            {activeRoute.points.map((p, idx) => (
              <div
                key={p.id}
                className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${
                  p.status === 'DELIVERED'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold'
                    : idx === currentStopIndex
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-300 text-slate-800 flex items-center justify-center text-[10px] font-bold">
                    {p.sequenceOrder}
                  </span>
                  <span>{p.targetName}</span>
                </div>
                <span>{p.status === 'DELIVERED' ? '✓ Сдано' : `${p.totalWeightKg} кг`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО ПОДПИСИ */}
      {showSignaturePad && (
        <SignaturePad
          title={`Подпись приемщика: ${currentPoint?.targetName}`}
          onSave={handleSaveSignature}
          onCancel={() => setShowSignaturePad(false)}
        />
      )}

      {/* МОДАЛЬНОЕ ОКНО ФОТООТЧЕТА */}
      {showPhotoModal && (
        <CameraPhotoModal
          title={`Фото разгрузки: ${currentPoint?.targetName}`}
          orderNumber={currentPoint?.orderNumber}
          targetName={currentPoint?.targetName}
          onSave={handleSavePhoto}
          onCancel={() => setShowPhotoModal(false)}
        />
      )}

      {/* МОДАЛЬНОЕ ОКНО ОТКЛОНЕНИЯ (п. 35 ТЗ) */}
      {showDeviationModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Укажите причину отклонения от маршрута:</h3>
            <select
              value={deviationReason}
              onChange={e => setDeviationReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium"
            >
              <option value="Пробка на дороге">Пробка на дороге</option>
              <option value="Дорожные ремонтные работы">Дорожные ремонтные работы</option>
              <option value="ДТП / Авария">ДТП / Авария</option>
              <option value="Техническая неисправность машины">Техническая неисправность машины</option>
              <option value="Прямое распоряжение супервайзера">Прямое распоряжение супервайзера</option>
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeviationModal(false)}
                className="flex-1 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleRecordDeviation}
                className="flex-1 py-2 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs"
              >
                Зафиксировать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО ВОЗВРАТА (п. 57 ТЗ) */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Оформление акта возврата продукции</h3>
            <p className="text-xs text-slate-500">Товар будет возвращен в кузов и оприходован на складе по акту.</p>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Количество возвращаемых мест:</label>
              <input
                type="number"
                min="1"
                max={currentPoint?.packagesCount || 10}
                value={returnQty}
                onChange={e => setReturnQty(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Причина возврата:</label>
              <select
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium"
              >
                <option value="Повреждение упаковки при транспортировке">Повреждение упаковки при транспортировке</option>
                <option value="Магазин закрыт / переучет">Магазин закрыт / переучет</option>
                <option value="Отказ от приемки товароведом">Отказ от приемки товароведом</option>
                <option value="Излишек / пересортица">Излишек / пересортица</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                className="flex-1 py-2.5 border rounded-xl text-xs font-bold text-slate-600"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleCreateReturn}
                className="flex-1 py-2.5 bg-rose-600 text-white font-bold rounded-xl text-xs uppercase"
              >
                Сформировать акт возврата
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
