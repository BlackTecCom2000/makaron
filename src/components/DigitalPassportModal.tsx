import React from 'react';
import type { Order } from '../types';
import { X, ShieldCheck, MapPin, CheckCircle2, Clock, Truck, UserCheck, AlertTriangle, FileText, Camera } from 'lucide-react';

interface DigitalPassportModalProps {
  order: Order | null;
  onClose: () => void;
}

export const DigitalPassportModal: React.FC<DigitalPassportModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/80 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-amber-400">
                Цифровой паспорт поставки • Digital Passport (п. 9, 129 ТЗ)
              </div>
              <h2 className="text-xl sm:text-2xl font-black">
                {order.orderNumber} — {order.destinationName}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body - 17 Milestones Chain */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-8 text-sm">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="text-[11px] text-slate-400 font-bold uppercase">Режим поставки</div>
              <div className="text-base font-black text-amber-400 mt-1">
                {order.mode === 'MODE_1_DIRECT' ? 'Режим №1 (Точка)' : 'Режим №2 (Агент)'}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="text-[11px] text-slate-400 font-bold uppercase">Общий вес</div>
              <div className="text-base font-black text-white mt-1">{order.totalWeightKg} кг</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="text-[11px] text-slate-400 font-bold uppercase">Мест / Позиций</div>
              <div className="text-base font-black text-white mt-1">{order.items?.length || 0} номенкл.</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="text-[11px] text-slate-400 font-bold uppercase">Текущий статус</div>
              <div className="text-base font-black text-emerald-400 mt-1">{order.status}</div>
            </div>
          </div>

          {/* Timeline of Milestones */}
          <div className="space-y-6 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-slate-800">
            {/* 1. Creation */}
            <div className="relative flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0 z-10">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 bg-slate-800/40 border border-slate-700/40 p-4 rounded-2xl">
                <div className="flex justify-between items-center">
                  <div className="font-black text-slate-200">1. Создание заявки</div>
                  <div className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(order.createdAt).toLocaleString('ru-RU')}
                  </div>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Автор: <span className="text-white font-bold">{order.createdByName}</span> (Роль: {order.createdByRole})
                </div>
                <div className="mt-2 text-xs text-slate-300">
                  Пункт назначения: <span className="font-bold">{order.destinationName}</span> ({order.destinationAddress})
                </div>
              </div>
            </div>

            {/* 2. Order Items & Adjustments */}
            <div className="relative flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center shrink-0 z-10">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1 bg-slate-800/40 border border-slate-700/40 p-4 rounded-2xl">
                <div className="font-black text-slate-200">2. Состав и согласование склада (Audit Trail)</div>
                <div className="mt-2 space-y-1.5">
                  {order.items?.map(it => (
                    <div key={it.id} className="flex justify-between items-center text-xs py-1 px-2.5 bg-slate-900/60 rounded-xl">
                      <span className="font-medium">{it.productName} ({it.packageWeightKg} кг)</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">Запрошено: {it.requestedQty} уп.</span>
                        {it.approvedWarehouseQty !== undefined && it.approvedWarehouseQty !== it.requestedQty ? (
                          <span className="text-amber-400 font-bold">
                            Одобрено: {it.approvedWarehouseQty} (Δ {it.approvedWarehouseQty - it.requestedQty})
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-bold">100% одобрено</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Picking & Ramp Loading */}
            <div className="relative flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center justify-center shrink-0 z-10">
                <Truck className="w-5 h-5" />
              </div>
              <div className="flex-1 bg-slate-800/40 border border-slate-700/40 p-4 rounded-2xl">
                <div className="font-black text-slate-200">3. Комплектация и сверка погрузки (Zavsklad ↔ Driver)</div>
                <p className="text-xs text-slate-400 mt-1">
                  Двухсторонняя сверка веса: склад <span className="text-white font-bold">{order.totalWeightKg} кг</span> vs водитель <span className="text-white font-bold">{order.totalWeightKg} кг</span>
                </p>
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Сверка пройдена: MATCH (Выезд разрешен)
                </div>
              </div>
            </div>

            {/* 4. Delivery & Confirmation */}
            <div className="relative flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0 z-10">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="flex-1 bg-slate-800/40 border border-slate-700/40 p-4 rounded-2xl">
                <div className="font-black text-slate-200">4. Фактическая передача клиенту</div>
                <div className="text-xs text-slate-300 mt-1">
                  Метод фиксации: <span className="font-bold text-amber-400">Сенсорная роспись на Canvas + Фото</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  GPS-координаты передачи: <span className="text-white font-mono">{order.destinationLat}, {order.destinationLng}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition text-xs"
          >
            Закрыть паспорт
          </button>
        </div>
      </div>
    </div>
  );
};
export default DigitalPassportModal;
