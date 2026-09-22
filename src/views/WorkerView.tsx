import React, { useState, useEffect } from 'react';
import {
  HardHat,
  CheckCircle2,
  Clock,
  Package,
  Layers,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import type { User, PickingTask } from '../types';
import { db } from '../db/database';
import { logAudit } from '../services/auditService';

interface WorkerViewProps {
  currentUser: User;
}

export const WorkerView: React.FC<WorkerViewProps> = ({ currentUser }) => {
  const [tasks, setTasks] = useState<PickingTask[]>([]);

  useEffect(() => {
    loadTasks();
  }, [currentUser]);

  const loadTasks = async () => {
    const list = await db.pickingTasks.reverse().toArray();
    setTasks(list);
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Заголовок с крупным индикатором */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-500 text-slate-950 font-black flex items-center justify-center text-2xl shadow-lg shadow-orange-500/20">
            <HardHat className="w-8 h-8" />
          </div>
          <div>
            <span className="px-2.5 py-0.5 rounded-full bg-orange-400 text-slate-950 text-[10px] font-black uppercase tracking-wider">
              Терминал комплектовщика
            </span>
            <h1 className="text-xl font-bold text-white mt-1">{currentUser.fullName}</h1>
            <p className="text-xs text-slate-400">Склад готовой продукции №1 • Смена активна</p>
          </div>
        </div>

        <div className="hidden sm:block text-right">
          <div className="text-xs text-slate-400">Активных заданий:</div>
          <div className="text-2xl font-black text-amber-400">
            {tasks.filter(t => t.status !== 'COMPLETED').length}
          </div>
        </div>
      </div>

      {/* Список сборочных заданий (крупные тач-кнопки, п. 10 ТЗ) */}
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
    </div>
  );
};
