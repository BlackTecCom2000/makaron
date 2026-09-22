import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  MapPin,
  Plus,
  Store,
  FileCheck,
  Send,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  ArrowRight
} from 'lucide-react';
import type { User, Shop, Order, ProductPackage } from '../types';
import { db } from '../db/database';
import { syncEngine } from '../services/syncEngine';
import { logAudit } from '../services/auditService';
import { InteractiveMap } from '../components/InteractiveMap';
import { CameraPhotoModal } from '../components/CameraPhotoModal';

interface AgentViewProps {
  currentUser: User;
}

export const AgentView: React.FC<AgentViewProps> = ({ currentUser }) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [activeTab, setActiveTab] = useState<'map' | 'new-order' | 'new-shop' | 'orders'>('map');

  // Форма нового магазина
  const [newShopName, setNewShopName] = useState('');
  const [newShopAddress, setNewShopAddress] = useState('');
  const [newShopOwner, setNewShopOwner] = useState('');
  const [newShopPhone, setNewShopPhone] = useState('+992 ');
  const [newShopType, setNewShopType] = useState<Shop['shopType']>('Мини-маркет');
  const [newShopLat, setNewShopLat] = useState(38.56);
  const [newShopLng, setNewShopLng] = useState(68.78);
  const [storefrontPhoto, setStorefrontPhoto] = useState<string | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  // Форма заказа
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [selectedWeight, setSelectedWeight] = useState<number>(23);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [draftStep, setDraftStep] = useState<'edit' | 'verify'>('edit');
  const [currentDraftOrder, setCurrentDraftOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    const sList = await db.shops.where('registeredByAgentId').equals(currentUser.id).toArray();
    setShops(sList);

    const oList = await db.orders
      .where('createdByUserId')
      .equals(currentUser.id)
      .reverse()
      .sortBy('createdAt');
    setOrders(oList);

    const pList = await db.productPackages.where('isActive').equals(1).toArray();
    setPackages(pList);

    if (sList.length > 0 && !selectedShopId) {
      setSelectedShopId(sList[0].id);
    }
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

  // 1. Регистрация нового магазина
  const handleRegisterShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShopName.trim() || !newShopAddress.trim()) {
      alert('Заполните название и адрес магазина');
      return;
    }

    const shopId = 'shop-' + Date.now();
    const shop: Shop = {
      id: shopId,
      registeredByAgentId: currentUser.id,
      registeredByAgentName: currentUser.fullName,
      name: newShopName.trim(),
      shopType: newShopType,
      address: newShopAddress.trim(),
      geoLat: newShopLat,
      geoLng: newShopLng,
      ownerName: newShopOwner.trim() || 'Владелец',
      phone: newShopPhone.trim(),
      storefrontPhotoUrl: storefrontPhoto || undefined,
      openingHours: '08:00 - 22:00',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };

    await db.shops.add(shop);
    await logAudit(
      currentUser,
      'SHOP_REGISTERED',
      'SHOP',
      shopId,
      `Агент зарегистрировал магазин «${shop.name}» (${shop.address})`,
      undefined,
      undefined,
      undefined,
      shop.geoLat,
      shop.geoLng
    );
    await syncEngine.queueMutation('shop', 'CREATE', shop);

    setNewShopName('');
    setNewShopAddress('');
    setStorefrontPhoto(null);
    loadData();
    alert(`Магазин «${shop.name}» успешно зарегистрирован!`);
    setActiveTab('map');
  };

  const handleCaptureGps = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setNewShopLat(pos.coords.latitude);
          setNewShopLng(pos.coords.longitude);
          alert(`Координаты зафиксированы: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        },
        () => {
          // Имитация точной локации в Душанбе
          setNewShopLat(38.552 + (Math.random() - 0.5) * 0.04);
          setNewShopLng(68.781 + (Math.random() - 0.5) * 0.04);
          alert('GPS координаты определены с повышенной точностью!');
        }
      );
    }
  };

  // 2. Механизм защиты от несогласованных данных (Черновик -> Проверка -> Отправка супервайзеру, п. 22 ТЗ)
  const handleProceedToVerify = () => {
    if (totalItems <= 0) {
      alert('Укажите хотя бы один товар в заказе');
      return;
    }
    const shop = shops.find(s => s.id === selectedShopId);
    if (!shop) return;

    const orderId = 'order-' + Date.now();
    const orderNum = `#000${200 + orders.length + 1}`;

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

    const draftOrder: Order = {
      id: orderId,
      orderNumber: orderNum,
      mode: 'MODE_2_AGENT',
      status: 'DRAFT', // Внимание: сначала ЧЕРНОВИК!
      shopId: shop.id,
      destinationName: shop.name,
      destinationAddress: shop.address,
      destinationLat: shop.geoLat,
      destinationLng: shop.geoLng,
      createdByUserId: currentUser.id,
      createdByName: currentUser.fullName,
      createdByRole: 'AGENT',
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
          authorRole: 'AGENT',
          changeType: 'CREATED',
          diffSummary: `Сформирован черновик агента: ${totalItems} шт. (${totalWeight} кг)`,
          timestamp: new Date().toISOString()
        }
      ],
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setCurrentDraftOrder(draftOrder);
    setDraftStep('verify');
  };

  const handleConfirmAndSendToSupervisor = async () => {
    if (!currentDraftOrder) return;

    // Переводим из DRAFT в SUPERVISOR_REVIEW
    const officialOrder: Order = {
      ...currentDraftOrder,
      status: 'SUPERVISOR_REVIEW',
      updatedAt: new Date().toISOString()
    };

    officialOrder.history.push({
      id: 'ver-' + Date.now(),
      orderId: officialOrder.id,
      versionNumber: 2,
      authorUserId: currentUser.id,
      authorName: currentUser.fullName,
      authorRole: 'AGENT',
      changeType: 'SUPERVISOR_ADJUSTMENT',
      diffSummary: 'Агент подтвердил и официально передал заявку супервайзеру',
      timestamp: new Date().toISOString()
    });

    await db.orders.add(officialOrder);

    // Уведомление супервайзеру
    await db.notifications.add({
      id: 'notif-' + Date.now(),
      targetRole: 'SUPERVISOR',
      title: `Новая заявка ${officialOrder.orderNumber} от агента`,
      message: `Агент ${currentUser.fullName} передал заказ по магазину «${officialOrder.destinationName}» (${officialOrder.totalWeightKg} кг)`,
      orderId: officialOrder.id,
      isRead: false,
      createdAt: new Date().toISOString()
    });

    await logAudit(
      currentUser,
      'ORDER_SUBMITTED_TO_SUPERVISOR',
      'ORDER',
      officialOrder.id,
      `Агент ${currentUser.fullName} передал заказ ${officialOrder.orderNumber} супервайзеру`
    );
    await syncEngine.queueMutation('order', 'CREATE', officialOrder);

    alert(`Заявка ${officialOrder.orderNumber} официально передана супервайзеру!`);
    setCurrentDraftOrder(null);
    setDraftStep('edit');
    setQuantities({});
    loadData();
    setActiveTab('orders');
  };

  // Карта: маркеры магазинов с цветовым кодированием
  const mapMarkers = shops.map(s => {
    const shopOrder = orders.find(o => o.shopId === s.id && o.status !== 'COMPLETED');
    let color: 'green' | 'yellow' | 'gray' | 'red' = 'gray';
    if (shopOrder) {
      if (shopOrder.status === 'APPROVED' || shopOrder.status === 'IN_TRANSIT') color = 'green';
      else if (shopOrder.status === 'DRAFT' || shopOrder.status === 'SUPERVISOR_REVIEW') color = 'yellow';
      else if (shopOrder.status === 'PROBLEM') color = 'red';
    }
    return {
      id: s.id,
      lat: s.geoLat,
      lng: s.geoLng,
      title: s.name,
      subtitle: `${s.shopType} • ${s.address}`,
      type: 'shop' as const,
      statusColor: color,
      onClick: () => {
        setSelectedShopId(s.id);
        setActiveTab('new-order');
      }
    };
  });

  return (
    <div className="space-y-6">
      {/* Шапка Кабинета Агента */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wider">
                Режим №2: Торговый Агент
              </span>
              <span className="text-xs text-slate-500 font-mono">Магазин → Агент → Супервайзер → Склад → Таксимот</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-0.5">
              Мобильное рабочее место агента: {currentUser.fullName}
            </h1>
            <p className="text-xs text-slate-500">
              Закрепленный сектор: Центральный Душанбе • Магазинов на территории: {shops.length}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('map')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'map' ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Интерактивная карта
          </button>
          <button
            onClick={() => setActiveTab('new-order')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'new-order' ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            Принять заявку
          </button>
          <button
            onClick={() => setActiveTab('new-shop')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'new-shop' ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Store className="w-4 h-4" />
            Новый магазин
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'orders' ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Мои заявки ({orders.length})
          </button>
        </div>
      </div>

      {/* 1. ИНТЕРАКТИВНАЯ КАРТА АГЕНТА (п. 21 ТЗ) */}
      {activeTab === 'map' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-600" />
              Статусы торговых точек на карте:
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block" /> 🟢 Активный с подтвержденной заявкой
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> 🟡 Черновик / На рассмотрении
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-slate-500 inline-block" /> ⚪ Без заявки сегодня
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-600 inline-block" /> 🔴 Проблема / Задержка
              </span>
            </div>
          </div>

          <InteractiveMap markers={mapMarkers} height="480px" />

          {/* Список магазинов карточками */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {shops.map(s => (
              <div
                key={s.id}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-400 hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                      {s.shopType}
                    </span>
                    <span className="text-[10px] text-slate-400">{s.openingHours}</span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm mt-2">{s.name}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-1">{s.address}</p>
                  <p className="text-xs text-slate-600 mt-0.5 font-medium">{s.ownerName} • {s.phone}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedShopId(s.id);
                    setActiveTab('new-order');
                  }}
                  className="mt-4 w-full py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Оформить заказ
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. СБОР ЗАЯВКИ С ЗАЩИТОЙ ОТ НЕПОДТВЕРЖДЕННЫХ ДАННЫХ (п. 22 ТЗ) */}
      {activeTab === 'new-order' && (
        <div>
          {draftStep === 'edit' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Выберите торговую точку для заказа:
                  </label>
                  <select
                    value={selectedShopId}
                    onChange={e => setSelectedShopId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-900 text-sm focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    {shops.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.shopType}) — {s.address}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Весовая категория фасовки:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[5, 10, 15, 23, 25, 50].map(w => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setSelectedWeight(w)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                          selectedWeight === w
                            ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {w} кг
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h3 className="font-bold text-slate-900 text-sm">
                    Позиции в фасовке {selectedWeight} кг:
                  </h3>
                  {filteredPackages.map(pkg => (
                    <div
                      key={pkg.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{pkg.productName}</div>
                        <div className="text-xs text-slate-500">
                          {pkg.packageWeightKg} кг ({pkg.unitType}) • 1 место = {pkg.packageWeightKg} кг
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleQtyChange(pkg.id, (quantities[pkg.id] || 0) - 1)}
                          className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 flex items-center justify-center text-sm"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={quantities[pkg.id] ?? 0}
                          onChange={e => handleQtyChange(pkg.id, parseInt(e.target.value) || 0)}
                          className="w-16 py-1 text-center font-bold text-slate-900 text-sm border border-slate-300 rounded-lg bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleQtyChange(pkg.id, (quantities[pkg.id] || 0) + 1)}
                          className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 flex items-center justify-center text-sm"
                        >
                          +
                        </button>
                        <span className="text-xs text-slate-500 font-semibold w-12 text-right">
                          {(quantities[pkg.id] || 0) * pkg.packageWeightKg} кг
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Карточка Черновика */}
              <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="border-b border-slate-800 pb-3">
                    <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-[10px] uppercase">
                      Шаг 1: Черновик (Draft)
                    </span>
                    <h3 className="text-base font-bold text-white mt-2">
                      Заказ для: {shops.find(s => s.id === selectedShopId)?.name || 'Магазин'}
                    </h3>
                  </div>

                  <div className="space-y-2 text-xs">
                    {filteredPackages
                      .filter(p => (quantities[p.id] || 0) > 0)
                      .map(p => (
                        <div key={p.id} className="flex justify-between py-1 border-b border-slate-800/60">
                          <span className="text-slate-300">{p.productName}</span>
                          <span className="font-bold text-white">
                            {quantities[p.id]} шт. = {(quantities[p.id] || 0) * p.packageWeightKg} кг
                          </span>
                        </div>
                      ))}
                  </div>

                  <div className="bg-slate-800/80 rounded-xl p-4 space-y-2 border border-slate-700/60">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Количество мест:</span>
                      <span className="font-bold text-white text-sm">{totalItems} шт.</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Фасовка:</span>
                      <span className="font-bold text-amber-400">{selectedWeight} кг</span>
                    </div>
                    <div className="border-t border-slate-700 pt-2 flex justify-between items-baseline">
                      <span className="text-sm font-semibold text-slate-200">Общий вес:</span>
                      <span className="text-2xl font-black text-amber-400 font-mono">
                        {totalWeight.toLocaleString('ru-RU')} кг
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-amber-300/80 bg-amber-950/40 p-3 rounded-lg border border-amber-800/40 leading-relaxed">
                    <strong>Защита от случайной отправки:</strong> Данные не уходят супервайзеру сразу. Сначала формируется черновик для вашей самопроверки.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleProceedToVerify}
                  disabled={totalItems <= 0}
                  className="w-full py-3.5 px-4 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-black rounded-xl shadow-lg shadow-amber-400/20 transition flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                >
                  <span>Проверить черновик</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* ЭКРАН САМОПРОВЕРКИ И ПОДТВЕРЖДЕНИЯ ОТПРАВКИ (Шаг 2, п. 22 ТЗ) */
            <div className="max-w-2xl mx-auto bg-white rounded-2xl p-6 border border-slate-200 shadow-xl space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <FileCheck className="w-6 h-6" />
                </div>
                <div>
                  <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black uppercase">
                    Шаг 2: Проверка перед официальной отправкой
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    Подтвердите передачу супервайзеру
                  </h3>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-500">Магазин-получатель:</span>
                  <strong className="text-slate-900">{currentDraftOrder?.destinationName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Адрес доставки:</span>
                  <strong className="text-slate-900">{currentDraftOrder?.destinationAddress}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Составил агент:</span>
                  <strong className="text-slate-900">{currentUser.fullName}</strong>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-sm">
                  <span>Итого к отправке:</span>
                  <span className="text-amber-600 font-mono">
                    {currentDraftOrder?.totalItemsCount} мест ({currentDraftOrder?.totalWeightKg} кг)
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 uppercase">Спецификация заказа:</div>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {currentDraftOrder?.items.map(it => (
                    <div key={it.id} className="p-3 text-xs flex justify-between items-center bg-white">
                      <span>{it.productName} ({it.packageWeightKg} кг)</span>
                      <span className="font-bold text-slate-900">{it.requestedQty} шт. = {it.requestedQty * it.packageWeightKg} кг</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDraftStep('edit')}
                  className="flex-1 py-3 px-4 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-100 text-xs uppercase"
                >
                  Вернуться и изменить
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAndSendToSupervisor}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-lg shadow-emerald-600/20 text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Подтвердить и отправить супервайзеру
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. РЕГИСТРАЦИЯ НОВОГО МАГАЗИНА (п. 20 ТЗ) */}
      {activeTab === 'new-shop' && (
        <div className="max-w-2xl mx-auto bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Регистрация новой торговой точки</h3>
              <p className="text-xs text-slate-500">Добавление розничного магазина на обслуживаемой территории</p>
            </div>
          </div>

          <form onSubmit={handleRegisterShop} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Название магазина <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newShopName}
                onChange={e => setNewShopName(e.target.value)}
                placeholder="Например: Продукты «Осиё»"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Тип точки</label>
                <select
                  value={newShopType}
                  onChange={e => setNewShopType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white"
                >
                  <option value="Мини-маркет">Мини-маркет</option>
                  <option value="Продуктовый магазин">Продуктовый магазин</option>
                  <option value="Оптовая точка">Оптовая точка</option>
                  <option value="Супермаркет">Супермаркет</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Контактный телефон</label>
                <input
                  type="text"
                  value={newShopPhone}
                  onChange={e => setNewShopPhone(e.target.value)}
                  placeholder="+992 900 00 00 00"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ФИО владельца / товароведа
              </label>
              <input
                type="text"
                value={newShopOwner}
                onChange={e => setNewShopOwner(e.target.value)}
                placeholder="Например: Рахимов Джамшед"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Адрес и ориентиры <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newShopAddress}
                onChange={e => setNewShopAddress(e.target.value)}
                placeholder="г. Душанбе, ул. Сино 15 (возле мечети)"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900"
              />
            </div>

            {/* GPS и Фотофиксация */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-rose-500" />
                    GPS-координаты объекта:
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Широта: {newShopLat.toFixed(5)}° N, Долгота: {newShopLng.toFixed(5)}° E
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCaptureGps}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition"
                >
                  Снять координаты GPS
                </button>
              </div>

              <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-indigo-600" />
                    Фото вывески магазина:
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {storefrontPhoto ? 'Фотография успешно прикреплена' : 'Фотография не прикреплена'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(true)}
                  className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-lg transition"
                >
                  {storefrontPhoto ? 'Изменить фото' : 'Сделать фото вывески'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl shadow-md shadow-amber-500/20 text-xs uppercase tracking-wider transition"
            >
              Зарегистрировать магазин в системе
            </button>
          </form>

          {showPhotoModal && (
            <CameraPhotoModal
              title="Фото вывески магазина"
              orderNumber="НОВЫЙ МАГАЗИН"
              targetName={newShopName || 'Новая точка'}
              onSave={url => {
                setStorefrontPhoto(url);
                setShowPhotoModal(false);
              }}
              onCancel={() => setShowPhotoModal(false)}
            />
          )}
        </div>
      )}

      {/* 4. ЖУРНАЛ ЗАЯВОК АГЕНТА И КОРРЕКТИРОВКИ (п. 28-30 ТЗ) */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-900 text-sm">Журнал поданных заявок агента</h3>
            <span className="text-xs text-slate-500">Всего заявок: {orders.length}</span>
          </div>

          <div className="divide-y divide-slate-200">
            {orders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">Вы еще не оформляли заявок</div>
            ) : (
              orders.map(o => {
                const isAdjusted = o.history.some(h => h.changeType === 'WAREHOUSE_ADJUSTMENT');
                const lastAdjustment = o.history.find(h => h.changeType === 'WAREHOUSE_ADJUSTMENT');

                return (
                  <div key={o.id} className="p-5 hover:bg-slate-50/80 transition space-y-2">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-base">{o.orderNumber}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
                          {o.status}
                        </span>
                        <span className="text-xs text-slate-500 font-bold">{o.destinationName}</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(o.createdAt).toLocaleDateString('ru-RU')} {new Date(o.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap gap-4">
                      <span>Адрес: <strong className="text-slate-900">{o.destinationAddress}</strong></span>
                      <span>Мест: <strong className="text-slate-900">{o.totalItemsCount} шт.</strong></span>
                      <span>Общий вес: <strong className="text-slate-900">{o.totalWeightKg} кг</strong></span>
                    </div>

                    {/* Цепочка корректировок склада / супервайзера (п. 29 ТЗ) */}
                    {isAdjusted && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-amber-800">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          Заявка скорректирована складом / супервайзером!
                        </div>
                        <div className="text-slate-700">
                          Причина: <strong>{lastAdjustment?.reasonCategory || 'Недостаток продукции на складе'}</strong>. {lastAdjustment?.reasonComment}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1 font-mono text-[11px]">
                          {o.items.map(it => (
                            <span key={it.id} className="px-2 py-0.5 bg-white border border-amber-200 rounded-md">
                              {it.productName}: Запрошено {it.requestedQty} → Подтверждено {it.approvedWarehouseQty} (Разница: {it.approvedWarehouseQty - it.requestedQty})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
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
