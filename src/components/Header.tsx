import React, { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Bell,
  Shield,
  Store,
  Briefcase,
  Compass,
  Warehouse as WarehouseIcon,
  HardHat,
  Truck,
  BarChart3,
  Search,
  CheckCircle2,
  ChevronDown,
  ShieldCheck
} from 'lucide-react';
import type { RoleCode, User, AppNotification } from '../types';
import { syncEngine } from '../services/syncEngine';
import { db } from '../db/database';

interface HeaderProps {
  currentUser: User;
  onSwitchRole: (role: RoleCode) => void;
  availableUsers: User[];
  onOpenSearch?: () => void;
  onOpenPassport?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onSwitchRole,
  availableUsers,
  onOpenSearch,
  onOpenPassport
}) => {
  const [isOnline, setIsOnline] = useState(syncEngine.isOnline);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((online, count) => {
      setIsOnline(online);
      setPendingCount(count);
    });

    const loadNotifs = async () => {
      const items = await db.notifications.reverse().limit(10).toArray();
      setNotifications(items);
    };
    loadNotifs();

    return () => unsubscribe();
  }, []);

  const handleToggleOffline = () => {
    const newOnline = syncEngine.toggleSimulation();
    setIsOnline(newOnline);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    await syncEngine.triggerSync();
    setIsSyncing(false);
  };

  const getRoleBadge = (role: RoleCode) => {
    switch (role) {
      case 'POINT':
        return { label: 'Собственная Точка', icon: Store, color: 'bg-indigo-600 text-white' };
      case 'AGENT':
        return { label: 'Торговый агент', icon: Briefcase, color: 'bg-amber-600 text-white' };
      case 'SUPERVISOR':
        return { label: 'Супервайзер', icon: Compass, color: 'bg-purple-600 text-white' };
      case 'ZAVSKLAD':
        return { label: 'Завсклад', icon: WarehouseIcon, color: 'bg-blue-600 text-white' };
      case 'PICKER':
        return { label: 'Комплектовщик', icon: CheckCircle2, color: 'bg-emerald-600 text-white' };
      case 'WORKER':
        return { label: 'Рабочий производства', icon: HardHat, color: 'bg-orange-600 text-white' };
      case 'TAXSIMOT':
        return { label: 'Таксимот / Водитель', icon: Truck, color: 'bg-teal-600 text-white' };
      case 'DIRECTOR':
      case 'ADMIN':
      case 'AUDITOR':
        return { label: 'Руководитель (Директор / Админ / Аудитор)', icon: ShieldCheck, color: 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-md' };
    }
  };

  const badge = getRoleBadge(currentUser.role);
  const RoleIcon = badge.icon;

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        {/* Логотип и Бренд */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xl shadow-lg shadow-amber-500/20">
            M
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold tracking-tight text-base sm:text-lg">
              <span className="text-white">BlackTecCom</span>
              <span className="text-amber-400 font-mono text-sm sm:text-base">MAKARON</span>
            </div>
            <div className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">
              Производство • Склад • Заявки • Логистика
            </div>
          </div>
        </div>

        {/* Правый блок: Поиск, Паспорт, Сеть, Синхронизация, Уведомления, Переключатель ролей */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Кнопка глобального поиска (п. 102) */}
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
              title="Глобальный поиск (п. 102 ТЗ)"
            >
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Поиск</span>
            </button>
          )}

          {/* Кнопка Цифрового паспорта поставки (п. 9, 129) */}
          {onOpenPassport && (
            <button
              onClick={onOpenPassport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 transition"
              title="Открыть Цифровой паспорт поставки"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Паспорт заказа</span>
            </button>
          )}

          {/* Индикатор сети и переключатель офлайн */}
          <button
            onClick={handleToggleOffline}
            title={isOnline ? 'Нажмите, чтобы включить эмуляцию Офлайн' : 'Нажмите, чтобы вернуться в Онлайн'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
              isOnline
                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-400 hover:bg-emerald-900'
                : 'bg-rose-950/80 border-rose-600 text-rose-400 hover:bg-rose-900 animate-pulse'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{isOnline ? 'Онлайн' : 'Офлайн режим'}</span>
          </button>

          {/* Индикатор очереди синхронизации */}
          {pendingCount > 0 ? (
            <button
              onClick={handleManualSync}
              disabled={!isOnline || isSyncing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/20 border border-amber-500 text-amber-300 rounded-xl text-xs font-semibold hover:bg-amber-500/30 transition"
              title="Нажмите для синхронизации очереди"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Очередь: {pendingCount}</span>
            </button>
          ) : (
            <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Синхронизировано</span>
            </div>
          )}

          {/* Центр уведомлений */}
          <div className="relative">
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition relative"
            >
              <Bell className="w-4 h-4" />
              {notifications.some(n => !n.isRead) && (
                <span className="w-2 h-2 rounded-full bg-amber-500 absolute top-1.5 right-1.5 ring-2 ring-slate-900" />
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50 text-slate-200">
                <div className="px-4 py-2 border-b border-slate-800 font-bold text-xs uppercase tracking-wider text-slate-400 flex justify-between items-center">
                  <span>Центр уведомлений</span>
                  <span className="text-[10px] text-amber-400 font-normal">Все роли</span>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">Нет новых уведомлений</div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className="p-3 hover:bg-slate-800/40 text-xs">
                        <div className="font-semibold text-amber-400">{n.title}</div>
                        <div className="text-slate-300 mt-0.5 leading-snug">{n.message}</div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {new Date(n.createdAt).toLocaleTimeString('ru-RU')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Переключатель Ролей (Role Switcher) */}
          <div className="relative">
            <button
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition text-left"
            >
              <span className={`p-1 rounded-lg ${badge.color}`}>
                <RoleIcon className="w-3.5 h-3.5" />
              </span>
              <div className="hidden sm:block">
                <div className="text-xs font-bold leading-tight flex items-center gap-1">
                  <span>{badge.label}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </div>
                <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{currentUser.fullName}</div>
              </div>
            </button>

            {showRoleMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl py-2 z-50 divide-y divide-slate-800">
                <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Переключить роль (Тестирование всех 10 кабинетов):
                </div>
                <div className="py-1">
                  {availableUsers
                    .filter((u, idx, arr) => {
                      // Объединяем Director, Admin, Auditor в одного пользователя в меню
                      if (['DIRECTOR', 'ADMIN', 'AUDITOR'].includes(u.role)) {
                        return arr.findIndex(x => ['DIRECTOR', 'ADMIN', 'AUDITOR'].includes(x.role)) === idx;
                      }
                      return true;
                    })
                    .map(u => {
                      const uBadge = getRoleBadge(u.role);
                      const UIcon = uBadge.icon;
                      const isSelected = ['DIRECTOR', 'ADMIN', 'AUDITOR'].includes(u.role)
                        ? ['DIRECTOR', 'ADMIN', 'AUDITOR'].includes(currentUser.role)
                        : u.role === currentUser.role;
                      return (
                        <button
                          key={u.id}
                          onClick={() => {
                            onSwitchRole(u.role);
                            setShowRoleMenu(false);
                          }}
                          className={`w-full px-4 py-2 text-left flex items-center gap-2.5 text-xs transition ${
                            isSelected ? 'bg-amber-950/60 border-l-2 border-amber-400 text-amber-300 font-semibold' : 'text-slate-200 hover:bg-slate-800'
                          }`}
                        >
                          <span className={`p-1.5 rounded-lg ${uBadge.color}`}>
                            <UIcon className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <div className="font-semibold text-white">{uBadge.label}</div>
                            <div className="text-[10px] text-slate-400">{u.fullName}</div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
