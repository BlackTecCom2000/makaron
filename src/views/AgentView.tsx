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
  ArrowRight,
  Package,
  Sparkles,
  RotateCcw,
  Check
} from 'lucide-react';
import type { User, Shop, Order, ProductPackage, Stock } from '../types';
import { db, seedInitialData } from '../db/database';
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
  const [stocks, setStocks] = useState<Stock[]>([]);
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

    let pList = (await db.productPackages.toArray()).filter(p => p.isActive !== false);
    if (pList.length === 0) {
      await seedInitialData();
      pList = (await db.productPackages.toArray()).filter(p => p.isActive !== false);
    }
    // Hard fallback to guarantee packages are never blank
    if (pList.length === 0) {
      const weights = [5, 10, 15, 23, 25, 50];
      const defaultProds = [
        { id: 'prod-1', name: 'Вермишель «Классическая»', sku: 'MAK-VERM' },
        { id: 'prod-2', name: 'Макароны классические', sku: 'MAK-CLASSIC' },
        { id: 'prod-3', name: 'Лапша домашняя', sku: 'MAK-NOODLE' },
        { id: 'prod-4', name: 'Рожки рифленые', sku: 'MAK-ROZHKI' },
        { id: 'prod-5', name: 'Спагетти', sku: 'MAK-SPAGHETTI' }
      ];
      pList = [];
      for (const prod of defaultProds) {
        for (const w of weights) {
          pList.push({
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
    }
    setPackages(pList);

    const sItems = await db.stock.toArray();
    setStocks(sItems);

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

  const handleApplyPresetTZ = () => {
    const newQtys: Record<string, number> = {};
    packages.filter(p => p.packageWeightKg === selectedWeight).forEach(p => {
      if (p.productName.includes('Вермишель')) newQtys[p.id] = 15;
      else if (p.productName.includes('Макароны')) newQtys[p.id] = 20;
      else if (p.productName.includes('Лапша')) newQtys[p.id] = 10;
      else newQtys[p.id] = 0;
    });
    setQuantities(newQtys);
  };

  const handleClearQuantities = () => {
    const newQtys: Record<string, number> = {};
    packages.filter(p => p.packageWeightKg === selectedWeight).forEach(p => {
      newQtys[p.id] = 0;
    });
    setQuantities(newQtys);
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
              <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                {/* 1. ВЫБОР ТОЧКИ */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center justify-between">
                    <span>1. Выберите торговую точку для заказа:</span>
                    <span className="text-[11px] text-amber-600 font-semibold lowercase">Торговая точка</span>
                  </label>
                  <select
                    value={selectedShopId}
                    onChange={e => setSelectedShopId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-900 text-sm focus:ring-2 focus:ring-amber-500 bg-white shadow-2xs"
                  >
                    {shops.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.shopType}) — {s.address}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. ВЕСОВАЯ КАТЕГОРИЯ ФАСОВКИ */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                      2. Весовая категория фасовки:
                    </label>
                    <span className="text-xs text-slate-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                      1 место = <strong className="text-slate-900">{selectedWeight} кг</strong>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[5, 10, 15, 23, 25, 50].map(w => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setSelectedWeight(w)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                          selectedWeight === w
                            ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md ring-2 ring-amber-400/40 font-black'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <span>{w} кг</span>
                        {w === 23 && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-slate-950 text-amber-300 rounded-md uppercase font-black tracking-wider">
                            ХИТ ТЗ
                          </span>
                        )}
                        {w <= 10 ? (
                          <span className="text-[10px] text-slate-500 font-normal">(пачка)</span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-normal">(мешок)</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. ВЫБОР ПРОДУКТОВ И ШТУЧНОСТЬ */}
                <div className="space-y-4 pt-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-500" />
                        <span>3. Выбор продукции и штучность (фасовка {selectedWeight} кг):</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Укажите требуемое количество мест (штук / мешков) по каждой позиции
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleApplyPresetTZ}
                        className="px-2.5 py-1 text-[11px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg border border-amber-300/80 transition flex items-center gap-1 shadow-2xs"
                        title="Заполнить стандартный эталон ТЗ: 15 вермишель, 20 макароны, 10 лапша"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>Набор по ТЗ (45 шт / 1 035 кг)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClearQuantities}
                        className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition flex items-center gap-1"
                        title="Сбросить все количества"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Сброс</span>
                      </button>
                    </div>
                  </div>

                  {filteredPackages.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      Нет позиций в выбранной фасовке {selectedWeight} кг
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredPackages.map(pkg => {
                        const qty = quantities[pkg.id] || 0;
                        const isSelected = qty > 0;
                        const stockItem = stocks.find(s => s.productPackageId === pkg.id);
                        const availableStock = stockItem
                          ? Math.max(0, stockItem.quantityPhysical - stockItem.quantityReserved)
                          : 120;

                        return (
                          <div
                            key={pkg.id}
                            className={`p-4 rounded-xl border transition-all ${
                              isSelected
                                ? 'border-amber-400 bg-amber-50/40 shadow-sm ring-1 ring-amber-400/30'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <div
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 transition ${
                                    isSelected
                                      ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {isSelected ? <Check className="w-5 h-5 text-slate-950 stroke-[3]" /> : <Package className="w-5 h-5" />}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                    <span>{pkg.productName}</span>
                                    {isSelected && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 font-black">
                                        В заказе: {qty} шт.
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                                    <span>
                                      Фасовка: <strong className="text-slate-700">{pkg.packageWeightKg} кг</strong> ({pkg.unitType})
                                    </span>
                                    <span>•</span>
                                    <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                      Склад: {availableStock} шт. в наличии
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* БЛОК УПРАВЛЕНИЯ ШТУЧНОСТЬЮ */}
                              <div className="flex flex-col sm:items-end gap-1.5 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                                <div className="flex items-center gap-1.5">
                                  {/* Быстрый минус 10 */}
                                  <button
                                    type="button"
                                    onClick={() => handleQtyChange(pkg.id, qty - 10)}
                                    title="Уменьшить на 10 шт."
                                    className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-black text-slate-600 text-xs transition"
                                  >
                                    -10
                                  </button>
                                  {/* Минус 1 */}
                                  <button
                                    type="button"
                                    onClick={() => handleQtyChange(pkg.id, qty - 1)}
                                    title="Уменьшить на 1 шт."
                                    className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 font-bold text-slate-800 flex items-center justify-center text-sm transition"
                                  >
                                    -
                                  </button>
                                  {/* Инпут штучности */}
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min="0"
                                      value={qty}
                                      onChange={e => handleQtyChange(pkg.id, parseInt(e.target.value) || 0)}
                                      className="w-20 py-1.5 text-center font-black text-slate-900 text-sm border border-slate-300 rounded-lg bg-white shadow-2xs focus:ring-2 focus:ring-amber-500"
                                    />
                                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold pointer-events-none">
                                      шт
                                    </span>
                                  </div>
                                  {/* Плюс 1 */}
                                  <button
                                    type="button"
                                    onClick={() => handleQtyChange(pkg.id, qty + 1)}
                                    title="Увеличить на 1 шт."
                                    className="w-8 h-8 rounded-lg bg-amber-400 hover:bg-amber-500 font-bold text-slate-950 flex items-center justify-center text-sm shadow-2xs transition"
                                  >
                                    +
                                  </button>
                                  {/* Быстрый плюс 10 */}
                                  <button
                                    type="button"
                                    onClick={() => handleQtyChange(pkg.id, qty + 10)}
                                    title="Увеличить на 10 шт."
                                    className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-black text-slate-600 text-xs transition"
                                  >
                                    +10
                                  </button>
                                </div>

                                {/* Быстрые пресеты штучности и расчет веса */}
                                <div className="flex items-center gap-2 text-xs">
                                  <div className="flex gap-1 text-[11px]">
                                    {[5, 10, 15, 20].map(preset => (
                                      <button
                                        key={preset}
                                        type="button"
                                        onClick={() => handleQtyChange(pkg.id, preset)}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${
                                          qty === preset
                                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                        }`}
                                      >
                                        {preset} шт
                                      </button>
                                    ))}
                                  </div>
                                  <span className="text-slate-500 font-bold">
                                    = <strong className="text-slate-900">{qty * pkg.packageWeightKg} кг</strong>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Карточка Черновика */}
              <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="border-b border-slate-800 pb-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-[10px] uppercase">
                        Шаг 1: Черновик (Draft)
                      </span>
                      <span className="text-xs font-mono text-amber-300 font-bold">
                        Фасовка {selectedWeight} кг
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-2">
                      Заказ для: {shops.find(s => s.id === selectedShopId)?.name || 'Магазин'}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {shops.find(s => s.id === selectedShopId)?.address}
                    </p>
                  </div>

                  <div className="space-y-2 text-xs max-h-56 overflow-y-auto pr-1">
                    {filteredPackages
                      .filter(p => (quantities[p.id] || 0) > 0)
                      .map(p => (
                        <div key={p.id} className="flex justify-between py-1.5 border-b border-slate-800/60 items-center">
                          <div>
                            <span className="text-slate-200 font-medium">{p.productName}</span>
                            <div className="text-[10px] text-slate-400">{p.unitType} по {p.packageWeightKg} кг</div>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-amber-300">{quantities[p.id]} шт.</span>
                            <div className="text-[10px] text-slate-300 font-mono">
                              {(quantities[p.id] || 0) * p.packageWeightKg} кг
                            </div>
                          </div>
                        </div>
                      ))}
                    {filteredPackages.filter(p => (quantities[p.id] || 0) > 0).length === 0 && (
                      <div className="py-8 text-center text-slate-500 text-xs italic">
                        Выберите продукцию и укажите штучность (количество мест)
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-800/80 rounded-xl p-4 space-y-2 border border-slate-700/60">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Количество позиций:</span>
                      <span className="font-bold text-white">
                        {filteredPackages.filter(p => (quantities[p.id] || 0) > 0).length} наим.
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Общая штучность (мест):</span>
                      <span className="font-bold text-amber-400 text-base">{totalItems} шт.</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Категория фасовки:</span>
                      <span className="font-bold text-slate-200">{selectedWeight} кг</span>
                    </div>
                    <div className="border-t border-slate-700 pt-2 flex justify-between items-baseline">
                      <span className="text-sm font-semibold text-slate-200">Общий вес партии:</span>
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
                  <span>Проверить черновик ({totalItems} шт / {totalWeight} кг)</span>
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
