import React, { useState, useEffect } from 'react';
import {
  HardHat,
  CheckCircle2,
  Clock,
  Package,
  Layers,
  ArrowRight,
  TrendingUp,
  Coins,
  Calendar,
  Factory
} from 'lucide-react';
import type { User, PickingTask } from '../types';
import { db } from '../db/database';
import { logAudit } from '../services/auditService';

interface WorkerViewProps {
  currentUser: User;
}

export const WorkerView: React.FC<WorkerViewProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'TASKS' | 'PIECEWORK'>('TASKS');
  const [tasks, setTasks] = useState<PickingTask[]>([]);

  // Сдельная выработка и смены
  const [shift, setShift] = useState<'SHIFT_1' | 'SHIFT_2'>('SHIFT_1');
  const [operationType, setOperationType] = useState<'PACKING' | 'SORTING' | 'LOADING'>('PACKING');
  const [volumeKg, setVolumeKg] = useState<number>(300);
  const [tariffPerKg] = useState<number>(0.35); // Активная ставка тарифа
  const [myLogs, setMyLogs] = useState<any[]>([]);
  const [successMessage, setSuccessMessage] = useState<string>('');

  useEffect(() => {
    loadTasks();
    loadWorkerLogs();
  }, [currentUser]);

  const loadTasks = async () => {
    const list = await db.pickingTasks.reverse().toArray();
    setTasks(list);
  };

  const loadWorkerLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'WORKER'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('http://localhost:3001/api/v1/production/piecework-logs', { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.data) setMyLogs(json.data);
      }
    } catch (e) {
      console.warn('[WorkerView] Could not fetch piecework logs from server', e);
    }
  };

  const handleToggleItemPicked = async (taskId: string, itemId: string, isFull: boolean) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedItems = task.items.map(it => {
      if (it.id === itemId) {
        return {
          ...it,
          pickedQty: isFull ? it.requiredQty : 0,
          isCompleted: isFull
        };
      }
      return it;
    });

    const isAllCompleted = updatedItems.every(it => it.isCompleted);

    await db.pickingTasks.update(taskId, {
      items: updatedItems,
      status: isAllCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      completedAt: isAllCompleted ? new Date().toISOString() : undefined
    });

    loadTasks();
  };

  const handleFinishTask = async (task: PickingTask) => {
    const updatedItems = task.items.map(it => ({
      ...it,
      pickedQty: it.requiredQty,
      isCompleted: true
    }));

    await db.pickingTasks.update(task.id, {
      items: updatedItems,
      status: 'COMPLETED',
      completedAt: new Date().toISOString()
    });

    // Обновляем статус заказа до READY_FOR_LOADING
    await db.orders.update(task.orderId, {
      status: 'READY_FOR_LOADING',
      updatedAt: new Date().toISOString()
    });

    await logAudit(
      currentUser,
      'PICKING_COMPLETED',
      'PICKING_TASK',
      task.id,
      `Рабочий ${currentUser.fullName} завершил комплектацию заказа ${task.orderNumber} (Передано на рампу)`
    );

    loadTasks();
    alert(`Задание по накладной ${task.orderNumber} полностью собрано и передано на рампу погрузки!`);
  };

  const handleSubmitPiecework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (volumeKg <= 0) return;

    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Simulate-Role': 'WORKER'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch('http://localhost:3001/api/v1/production/piecework-logs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workerId: currentUser.id,
          workerName: currentUser.fullName,
          operationType,
          volumeKg,
          tariffPerKg,
          stationId: 'LINE-01',
          shiftId: shift
        })
      });

      if (res.ok) {
        setSuccessMessage(`Успешно начислено: ${volumeKg} кг × ${tariffPerKg} TJS = ${(volumeKg * tariffPerKg).toFixed(2)} TJS!`);
        setTimeout(() => setSuccessMessage(''), 4000);
        loadWorkerLogs();
      }
    } catch (e) {
      console.error('Error submitting piecework', e);
    }
  };

  const totalEarnedToday = myLogs.reduce((s, l) => s + (l.totalAmount || 0), 0);
  const totalVolumeToday = myLogs.reduce((s, l) => s + (l.volumeKg || 0), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Заголовок с крупным индикатором */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-500 text-slate-950 font-black flex items-center justify-center text-2xl shadow-lg shadow-orange-500/20">
            <HardHat className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-orange-400 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                Рабочий цеха / Склада
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                Табель: НА СМЕНЕ
              </span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1">{currentUser.fullName}</h1>
            <p className="text-xs text-slate-400">Склад №1 / Линия №1 • Смена: {shift === 'SHIFT_1' ? 'Дневная (08:00 - 20:00)' : 'Ночная (20:00 - 08:00)'}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('TASKS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'TASKS' ? 'bg-orange-500 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Сборка заказов ({tasks.filter(t => t.status !== 'COMPLETED').length})
          </button>
          <button
            onClick={() => setActiveTab('PIECEWORK')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'PIECEWORK' ? 'bg-orange-500 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            Выработка и сдельная оплата
          </button>
        </div>
      </div>

      {activeTab === 'PIECEWORK' ? (
        /* ВКЛАДКА: СДЕЛЬНАЯ ОПЛАТА И СМЕНЫ (BR-RATE-001, BR-ATT-001) */
        <div className="space-y-6">
          {/* Сводка за сегодня */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 font-semibold uppercase">Сдельный заработок сегодня</span>
              <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">
                {totalEarnedToday.toFixed(2)} TJS
              </div>
              <span className="text-[10px] text-slate-400">Формула: Объем × 0.35 TJS/кг</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 font-semibold uppercase">Выработано за смену</span>
              <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
                {totalVolumeToday.toLocaleString('ru-RU')} кг
              </div>
              <span className="text-[10px] text-indigo-600 font-bold">Линия упаковки</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 font-semibold uppercase">Действующий тариф</span>
              <div className="text-2xl font-black text-amber-600 mt-1 font-mono">
                {tariffPerKg} TJS / кг
              </div>
              <span className="text-[10px] text-emerald-600 font-bold">Версия тарифа: v1.0 (Активна)</span>
            </div>
          </div>

          {/* Форма фиксации выработки */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Factory className="w-4 h-4 text-orange-600" />
              Фиксация выработанного объема партии (BR-RATE-001)
            </h3>

            {successMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {successMessage}
              </div>
            )}

            <form onSubmit={handleSubmitPiecework} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Смена</label>
                <select
                  value={shift}
                  onChange={(e: any) => setShift(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="SHIFT_1">Смена №1 (Дневная)</option>
                  <option value="SHIFT_2">Смена №2 (Ночная)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Операция</label>
                <select
                  value={operationType}
                  onChange={(e: any) => setOperationType(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="PACKING">Фасовка / Упаковка</option>
                  <option value="LOADING">Погрузка на рампе</option>
                  <option value="SORTING">Сортировка партии</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Объем (кг)</label>
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={volumeKg}
                  onChange={(e) => setVolumeKg(Number(e.target.value))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-900 font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition"
              >
                Начислить {(volumeKg * tariffPerKg).toFixed(2)} TJS
              </button>
            </form>
          </div>

          {/* Журнал начислений */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800 uppercase">
              История сдельных начислений рабочего ({myLogs.length} записей):
            </div>
            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {myLogs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">Нет записей за текущую смену</div>
              ) : (
                myLogs.map((log: any) => (
                  <div key={log.id} className="p-3.5 flex justify-between items-center text-xs hover:bg-slate-50 transition">
                    <div>
                      <span className="font-bold text-slate-900">{log.operationType}</span>
                      <span className="text-slate-400 ml-2">({log.stationId || 'LINE-01'})</span>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {log.volumeKg} кг × {log.tariffPerKg} TJS/кг
                      </div>
                    </div>
                    <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                      +{log.totalAmount} TJS
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ВКЛАДКА: СБОРОЧНЫЕ НАРЯДЫ (ЧЕК-ЛИСТ) */
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200">
              На данный момент нет активных заданий на сборку
            </div>
          ) : (
            tasks.map(task => {
              const isCompleted = task.status === 'COMPLETED';

              return (
                <div
                  key={task.id}
                  className={`bg-white rounded-2xl border p-6 shadow-sm transition space-y-4 ${
                    isCompleted ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200 hover:border-orange-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-lg">Сборочный наряд: {task.orderNumber}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800 animate-pulse'
                        }`}>
                          {isCompleted ? 'Собрано полностью 100%' : 'В процессе сборки'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium">Получатель: {task.destinationName}</div>
                    </div>

                    <span className="text-xs text-slate-400 font-mono">
                      {new Date(task.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Чек-лист позиций крупными плашками */}
                  <div className="space-y-3">
                    {task.items.map(it => {
                      const checked = it.isCompleted || it.pickedQty >= it.requiredQty;

                      return (
                        <div
                          key={it.id}
                          className={`p-4 rounded-xl border flex items-center justify-between gap-4 transition ${
                            checked
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                              : 'bg-slate-50 border-slate-200 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleToggleItemPicked(task.id, it.id, !checked)}
                              className={`w-9 h-9 rounded-xl flex items-center justify-center font-black transition ${
                                checked
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'border-2 border-slate-400 text-transparent hover:border-orange-500'
                              }`}
                            >
                              ✓
                            </button>
                            <div>
                              <div className="font-bold text-base text-slate-900">{it.productName}</div>
                              <div className="text-xs text-slate-500 font-medium">
                                Фасовка: <strong className="text-slate-800">{it.packageWeightKg} кг</strong> (мешок)
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-black text-lg font-mono text-slate-900">
                              {checked ? `${it.requiredQty} / ${it.requiredQty}` : `0 / ${it.requiredQty}`} шт.
                            </div>
                            <div className="text-xs text-slate-500">
                              Вес: {it.requiredQty * it.packageWeightKg} кг
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!isCompleted && (
                    <button
                      type="button"
                      onClick={() => handleFinishTask(task)}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      Завершить сборку задания и передать на рампу
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
