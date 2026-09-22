import React, { useState, useEffect } from 'react';
import type { RoleCode, User, Order } from './types';
import { db, seedInitialData } from './db/database';
import { Header } from './components/Header';
import { PointView } from './views/PointView';
import { AgentView } from './views/AgentView';
import { SupervisorView } from './views/SupervisorView';
import { ZavskladView } from './views/ZavskladView';
import { WorkerView } from './views/WorkerView';
import { PickerView } from './views/PickerView';
import { TaxsimotView } from './views/TaxsimotView';
import { ExecutiveView } from './views/ExecutiveView';
import { DigitalPassportModal } from './components/DigitalPassportModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';

export const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedPassportOrder, setSelectedPassportOrder] = useState<Order | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const init = async () => {
      await seedInitialData();
      const allUsers = await db.users.toArray();
      setUsers(allUsers);

      const allOrders = await db.orders.toArray();
      setOrders(allOrders);

      // По умолчанию открываем Точку (Режим 1) или Руководителя
      const defaultUser = allUsers.find(u => u.role === 'POINT') || allUsers[0];
      setCurrentUser(defaultUser);
      setIsReady(true);
    };
    init();
  }, []);

  const handleSwitchRole = (role: RoleCode) => {
    // Если переход в DIRECTOR, ADMIN или AUDITOR — это 1 объединенный человек
    if (['DIRECTOR', 'ADMIN', 'AUDITOR'].includes(role)) {
      const executiveUser = users.find(u => ['DIRECTOR', 'ADMIN', 'AUDITOR'].includes(u.role));
      if (executiveUser) {
        setCurrentUser(executiveUser);
        return;
      }
    }
    const targetUser = users.find(u => u.role === role);
    if (targetUser) {
      setCurrentUser(targetUser);
    }
  };

  const handleOpenPassportForFirstOrder = async () => {
    const ords = await db.orders.toArray();
    if (ords.length > 0) {
      setSelectedPassportOrder(ords[0]);
    }
  };

  if (!isReady || !currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-2xl mx-auto animate-bounce">
            M
          </div>
          <div className="font-bold text-lg">Загрузка платформы BlackTecCom MAKARON...</div>
          <div className="text-xs text-slate-400">Инициализация локальной базы данных IndexedDB</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <Header
        currentUser={currentUser}
        onSwitchRole={handleSwitchRole}
        availableUsers={users}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenPassport={handleOpenPassportForFirstOrder}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {currentUser.role === 'POINT' && <PointView currentUser={currentUser} />}
        {currentUser.role === 'AGENT' && <AgentView currentUser={currentUser} />}
        {currentUser.role === 'SUPERVISOR' && <SupervisorView currentUser={currentUser} />}
        {currentUser.role === 'ZAVSKLAD' && <ZavskladView currentUser={currentUser} />}
        {currentUser.role === 'PICKER' && <PickerView currentUser={currentUser} />}
        {currentUser.role === 'WORKER' && <WorkerView currentUser={currentUser} />}
        {currentUser.role === 'TAXSIMOT' && <TaxsimotView currentUser={currentUser} />}
        {(currentUser.role === 'DIRECTOR' || currentUser.role === 'ADMIN' || currentUser.role === 'AUDITOR') && (
          <ExecutiveView currentUser={currentUser} />
        )}
      </main>

      {/* Global Search Modal (Section 102) */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        orders={orders}
        onSelectOrder={ord => setSelectedPassportOrder(ord)}
      />

      {/* Digital Passport Modal (Section 9, 129) */}
      <DigitalPassportModal
        order={selectedPassportOrder}
        onClose={() => setSelectedPassportOrder(null)}
      />

      {/* Быстрая панель тестирования сценариев в подвале */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 py-4 px-4 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span className="text-slate-300 font-medium">
              BlackTecCom Production & Distribution Management System • Offline-First Platform
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            <span className="text-slate-500 text-[11px] mr-1">Быстрый переход роли:</span>
            {(['POINT', 'ZAVSKLAD', 'PICKER', 'AGENT', 'SUPERVISOR', 'TAXSIMOT', 'WORKER', 'DIRECTOR'] as RoleCode[]).map(r => (
              <button
                key={r}
                onClick={() => handleSwitchRole(r)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  (r === 'DIRECTOR' ? ['DIRECTOR', 'ADMIN', 'AUDITOR'].includes(currentUser.role) : currentUser.role === r)
                    ? 'bg-amber-400 text-slate-950 shadow-md font-black'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {r === 'DIRECTOR' ? '👑 РУКОВОДИТЕЛЬ (ДИРЕКТОР / АДМИН / АУДИТОР)' : r}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};
export default App;
