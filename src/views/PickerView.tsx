import React, { useState, useEffect } from 'react';
import type { User, PickingTask } from '../types';
import { db } from '../db/database';
import { CheckCircle2, AlertTriangle, PackageCheck, Play, ArrowRight, RefreshCw, Smartphone } from 'lucide-react';
import { syncEngine } from '../services/syncEngine';

interface PickerViewProps {
  currentUser: User;
}

export const PickerView: React.FC<PickerViewProps> = ({ currentUser }) => {
  const [tasks, setTasks] = useState<PickingTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [problemModalTaskId, setProblemModalTaskId] = useState<string | null>(null);
  const [problemReason, setProblemReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    try {
      // Load from local db
      const localTasks = await db.pickingTasks.toArray();
      setTasks(localTasks);
      if (localTasks.length > 0 && !activeTaskId) {
        setActiveTaskId(localTasks[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  const activeTask = tasks.find(t => t.id === activeTaskId) || tasks[0];

  const handleStartTask = async (taskId: string) => {
    await db.pickingTasks.update(taskId, {
      status: 'IN_PROGRESS',
      assignedWorkerIds: [currentUser.id],
      assignedWorkerNames: [currentUser.fullName]
    });
    await syncEngine.queueMutation('workLog', 'UPDATE', { taskId, status: 'IN_PROGRESS', workerId: currentUser.id });
    loadTasks();
  };

  const handleIncrementItem = async (itemId: string, inc: number) => {
    if (!activeTask) return;
    const updatedItems = activeTask.items.map(item => {
      if (item.id === itemId) {
        const nextQty = Math.min(item.requiredQty, item.pickedQty + inc);
        return {
          ...item,
          pickedQty: nextQty,
          isCompleted: nextQty >= item.requiredQty
        };
      }
      return item;
    });

    const isAllComplete = updatedItems.every(i => i.isCompleted);
    const nextStatus = isAllComplete ? 'COMPLETED' : 'IN_PROGRESS';

    await db.pickingTasks.update(activeTask.id, {
      items: updatedItems,
      status: nextStatus
    });

    loadTasks();
  };

  const handleCompleteTask = async () => {
    if (!activeTask) return;

    // Set all items complete
    const updatedItems = activeTask.items.map(i => ({ ...i, pickedQty: i.requiredQty, isCompleted: true }));
    await db.pickingTasks.update(activeTask.id, {
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      items: updatedItems
    });

    // Update related order status to COLLECTED
    const order = await db.orders.get(activeTask.orderId);
    if (order) {
      await db.orders.update(order.id, { status: 'READY_FOR_LOADING' });
    }

    await syncEngine.queueMutation('order', 'UPDATE', {
      orderId: activeTask.orderId,
      status: 'READY_FOR_LOADING',
      taskId: activeTask.id
    });

    loadTasks();
  };

  const handleReportProblem = async () => {
    if (!problemModalTaskId || !problemReason.trim()) return;

    await db.pickingTasks.update(problemModalTaskId, {
      status: 'ASSIGNED' // stays flagged
    });

    await db.notifications.add({
      id: `notif-${Date.now()}`,
      targetRole: 'ZAVSKLAD',
      title: 'Проблема комплектации на рампе',
      message: `Сборщик ${currentUser.fullName} сообщил: ${problemReason}`,
      orderId: activeTask?.orderId,
      isRead: false,
      createdAt: new Date().toISOString()
    });

    setProblemModalTaskId(null);
    setProblemReason('');
    loadTasks();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 rounded-3xl p-6 text-slate-950 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider bg-slate-950/15 w-fit px-3 py-1 rounded-full mb-2">
            <Smartphone className="w-4 h-4" />
            Терминал комплектовщика • Тачскрин режим
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Сборочный цех: {currentUser.fullName}
          </h1>
          <p className="text-sm text-slate-900/80 font-medium">
            Сборка заказов по крупным тач-карточкам с мгновенной фиксацией на рампе
          </p>
        </div>

        <button
          onClick={loadTasks}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-950 text-white rounded-2xl font-bold text-sm shadow-md hover:bg-slate-900 transition active:scale-95"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить задания
        </button>
      </div>

      {/* Task Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {tasks.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTaskId(t.id)}
            className={`px-5 py-3 rounded-2xl font-black text-sm whitespace-nowrap transition-all border ${
              activeTask?.id === t.id
                ? 'bg-slate-900 text-amber-400 border-slate-900 shadow-lg scale-102'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{t.orderNumber}</span>
              <span className={`w-2.5 h-2.5 rounded-full ${
                t.status === 'COMPLETED' ? 'bg-emerald-500' : t.status === 'IN_PROGRESS' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
              }`} />
            </div>
            <div className="text-[11px] font-normal text-left truncate max-w-[160px] opacity-80 mt-0.5">
              {t.destinationName}
            </div>
          </button>
        ))}
      </div>

      {activeTask ? (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-100">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Текущий заказ на сборку
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {activeTask.orderNumber} — {activeTask.destinationName}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
                activeTask.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : activeTask.status === 'IN_PROGRESS'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-800'
              }`}>
                {activeTask.status === 'COMPLETED' ? 'Собрано 100%' : activeTask.status === 'IN_PROGRESS' ? 'Идет сборка' : 'Ожидает начала'}
              </span>

              {activeTask.status === 'ASSIGNED' && (
                <button
                  onClick={() => handleStartTask(activeTask.id)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-slate-950 font-black rounded-2xl shadow hover:bg-amber-400 transition"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Начать сборку
                </button>
              )}
            </div>
          </div>

          {/* Large Touch Cards for Items */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeTask.items.map(item => {
              const isDone = item.pickedQty >= item.requiredQty;
              const percent = Math.round((item.pickedQty / item.requiredQty) * 100);

              return (
                <div
                  key={item.id}
                  className={`p-5 rounded-3xl border-2 transition-all flex flex-col justify-between gap-4 ${
                    isDone
                      ? 'border-emerald-500/50 bg-emerald-50/40 shadow-sm'
                      : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">
                        {item.productName}
                      </h3>
                      <div className="text-xs text-slate-500 font-bold mt-0.5">
                        Фасовка: {item.packageWeightKg} кг • Общий вес: {item.requiredQty * item.packageWeightKg} кг
                      </div>
                    </div>

                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${
                      isDone ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {isDone ? <CheckCircle2 className="w-6 h-6" /> : `${percent}%`}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${isDone ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, percent)}%` }}
                    />
                  </div>

                  {/* Big Counter & Quick Tap Buttons */}
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <div className="text-3xl font-black text-slate-900">
                      {item.pickedQty} <span className="text-base text-slate-400 font-normal">/ {item.requiredQty} уп.</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleIncrementItem(item.id, 1)}
                        disabled={isDone}
                        className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-black text-base shadow hover:bg-slate-800 disabled:opacity-40 active:scale-95 transition"
                      >
                        +1
                      </button>
                      <button
                        onClick={() => handleIncrementItem(item.id, 5)}
                        disabled={isDone}
                        className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-black text-base shadow hover:bg-slate-800 disabled:opacity-40 active:scale-95 transition"
                      >
                        +5
                      </button>
                      <button
                        onClick={() => handleIncrementItem(item.id, item.requiredQty - item.pickedQty)}
                        disabled={isDone}
                        className="px-4 py-2.5 bg-amber-500 text-slate-950 rounded-xl font-black text-sm shadow hover:bg-amber-400 disabled:opacity-40 active:scale-95 transition"
                      >
                        Все ({item.requiredQty})
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Footer */}
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
            <button
              onClick={() => setProblemModalTaskId(activeTask.id)}
              className="flex items-center gap-2 text-rose-600 hover:text-rose-700 font-bold text-sm px-4 py-2 rounded-2xl hover:bg-rose-50 transition"
            >
              <AlertTriangle className="w-4 h-4" />
              Сообщить о проблеме сборки (дефект / нехватка)
            </button>

            <button
              onClick={handleCompleteTask}
              className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-emerald-600 text-white font-black text-base rounded-2xl shadow-lg hover:bg-emerald-500 transition active:scale-95"
            >
              <PackageCheck className="w-5 h-5" />
              Завершить комплектацию и передать на рампу
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-12 text-center text-slate-400 font-medium border border-slate-200">
          Нет активных сборочных заданий
        </div>
      )}

      {/* Problem Modal */}
      {problemModalTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-xl font-black text-slate-900">Проблема комплектации</h3>
            </div>
            <p className="text-sm text-slate-600">
              Укажите причину для завсклада (дефект упаковки, брак продукции, отсутствие товара на паллете):
            </p>
            <textarea
              value={problemReason}
              onChange={e => setProblemReason(e.target.value)}
              placeholder="Например: повреждено 4 мешка вермишели при транспортировке погрузчиком"
              className="w-full h-28 p-3 rounded-2xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none text-sm"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setProblemModalTaskId(null)}
                className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100"
              >
                Отмена
              </button>
              <button
                onClick={handleReportProblem}
                className="px-6 py-2.5 bg-rose-600 text-white font-black rounded-xl hover:bg-rose-500 shadow-md"
              >
                Отправить завскладу
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PickerView;
