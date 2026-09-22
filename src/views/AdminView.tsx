import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Package,
  Warehouse,
  History,
  Settings,
  Plus,
  CheckCircle2,
  Trash2,
  Key,
  Database,
  Download
} from 'lucide-react';
import type { User, Product, ProductPackage, ProductCategory, WorkerTariff, AuditLog } from '../types';
import { db } from '../db/database';
import { logAudit } from '../services/auditService';

interface AdminViewProps {
  currentUser: User;
}

export const AdminView: React.FC<AdminViewProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'products' | 'tariffs' | 'audit' | 'system'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [tariffs, setTariffs] = useState<WorkerTariff[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Форма добавления пользователя
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('+992 ');
  const [newRole, setNewRole] = useState<User['role']>('AGENT');

  // Форма тарифа
  const [newTariffOp, setNewTariffOp] = useState('Фасовка 23 кг');
  const [newTariffRate, setNewTariffRate] = useState(0.18);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    const uList = await db.users.toArray();
    setUsers(uList);

    const pList = await db.products.toArray();
    setProducts(pList);

    const pkgList = await db.productPackages.toArray();
    setPackages(pkgList);

    const tList = await db.workerTariffs.toArray();
    setTariffs(tList);

    const alList = await db.auditLogs.reverse().limit(100).toArray();
    setAuditLogs(alList);
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
      `Администратор создал пользователя ${newUser.fullName} с ролью ${newUser.role}`
    );

    setNewUsername('');
    setNewFullName('');
    loadData();
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
    loadData();
    alert('Новый тариф успешно сохранен!');
  };

  return (
    <div className="space-y-6">
      {/* Шапка Кабинета Администратора */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-600 text-white font-black flex items-center justify-center text-2xl shadow-lg shadow-rose-600/20">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider">
              Панель Администратора Системы
            </span>
            <h1 className="text-xl font-bold text-white mt-1">
              Управление платформой: {currentUser.fullName}
            </h1>
            <p className="text-xs text-slate-400">
              Пользователи • Номенклатура • Тарифы • Аудит безопасности
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'users' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Users className="w-4 h-4" />
            Пользователи ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'products' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Package className="w-4 h-4" />
            Номенклатура ({packages.length})
          </button>
          <button
            onClick={() => setActiveTab('tariffs')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'tariffs' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Settings className="w-4 h-4" />
            Тарифы выработки
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'audit' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <History className="w-4 h-4" />
            Журнал аудита ({auditLogs.length})
          </button>
        </div>
      </div>

      {/* 1. УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ (п. 3 ТЗ) */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm">Учетные записи системы</h3>
              <span className="text-xs text-slate-500">Всего: {users.length}</span>
            </div>

            <div className="divide-y divide-slate-100">
              {users.map(u => (
                <div key={u.id} className="p-4 hover:bg-slate-50 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{u.fullName}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-800">
                        {u.role}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Логин: @{u.username} • {u.phone}</div>
                  </div>

                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                    Активен
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Форма создания пользователя */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Создать пользователя</h3>
              <p className="text-xs text-slate-500">Добавление сотрудника в реестр системы</p>
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
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white"
                >
                  <option value="ADMIN">Администратор</option>
                  <option value="ZAVSKLAD">Завсклад</option>
                  <option value="WORKER">Работник склада</option>
                  <option value="AGENT">Торговый агент</option>
                  <option value="SUPERVISOR">Супервайзер</option>
                  <option value="TAXSIMOT">Таксимот (Водитель)</option>
                  <option value="POINT">Собственная Точка</option>
                  <option value="DIRECTOR">Руководитель / Директор</option>
                  <option value="AUDITOR">Аудитор</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-sm transition"
              >
                Создать учетную запись
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. НОМЕНКЛАТУРА И ФАСОВКА (п. 6 ТЗ) */}
      {activeTab === 'products' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">
              Иерархия продукции: Товар → Фасовка (5, 10, 15, 23, 25, 50 кг) → Единица
            </h3>
            <span className="text-xs text-slate-500">Всего позиций: {packages.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px]">
                <tr>
                  <th className="p-3.5">Наименование</th>
                  <th className="p-3.5">Фасовка</th>
                  <th className="p-3.5">Единица</th>
                  <th className="p-3.5">Штрихкод / QR</th>
                  <th className="p-3.5 text-center">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {packages.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="p-3.5 font-bold text-slate-900">{p.productName}</td>
                    <td className="p-3.5 font-black text-amber-600 font-mono">{p.packageWeightKg} кг</td>
                    <td className="p-3.5 text-slate-600">{p.unitType}</td>
                    <td className="p-3.5 font-mono text-slate-400">{p.barcode || '482001928374'}</td>
                    <td className="p-3.5 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        Активно
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. НАСТРОЙКА ТАРИФОВ ВЫРАБОТКИ (п. 14 ТЗ) */}
      {activeTab === 'tariffs' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm">Тарифная сетка сдельной оплаты труда</h3>
            </div>
            <div className="divide-y divide-slate-100 p-2">
              {tariffs.map(t => (
                <div key={t.id} className="p-4 flex justify-between items-center hover:bg-slate-50">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{t.operationType}</div>
                    <div className="text-xs text-slate-500">{t.description}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-emerald-700 font-mono">{t.ratePerKg}</span>
                    <span className="text-xs text-slate-400 ml-1">сом / кг</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Добавить тариф</h3>
            <form onSubmit={handleAddTariff} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Вид работы / операции:</label>
                <input
                  type="text"
                  required
                  value={newTariffOp}
                  onChange={e => setNewTariffOp(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ставка (сом за 1 кг):</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newTariffRate}
                  onChange={e => setNewTariffRate(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-black font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider"
              >
                Сохранить тарифную ставку
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. ЖУРНАЛ АУДИТА ДЕЙСТВИЙ (п. 9, 30, 46 ТЗ) */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">Неизменяемый журнал аудита безопасности (Audit Trail)</h3>
            <span className="text-xs text-slate-500">Записей: {auditLogs.length}</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {auditLogs.map(log => (
              <div key={log.id} className="p-4 hover:bg-slate-50/80 space-y-1">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold uppercase text-[10px]">
                      {log.actionType}
                    </span>
                    <strong className="text-slate-900">{log.userName}</strong>
                    <span className="text-slate-400 font-mono text-[11px]">({log.roleCode})</span>
                  </div>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {new Date(log.timestamp).toLocaleString('ru-RU')}
                  </span>
                </div>

                <div className="text-slate-800 font-medium pl-1">{log.diffSummary}</div>

                {log.reason && (
                  <div className="text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md text-[11px] font-medium border border-amber-200/60 inline-block">
                    Причина: {log.reason}
                  </div>
                )}

                <div className="text-[10px] text-slate-400 pl-1">
                  IP: {log.ipAddress} • {log.deviceInfo}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
