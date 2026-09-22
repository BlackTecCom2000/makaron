import React, { useState } from 'react';
import { Search, X, FileText, Store, Package, Phone, User, ArrowRight } from 'lucide-react';
import type { Order } from '../types';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  onSelectOrder: (order: Order) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  orders,
  onSelectOrder
}) => {
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();
  const filteredOrders = q
    ? orders.filter(o => 
        o.orderNumber.toLowerCase().includes(q) ||
        o.destinationName.toLowerCase().includes(q) ||
        o.destinationAddress.toLowerCase().includes(q) ||
        o.createdByName.toLowerCase().includes(q) ||
        o.items?.some(it => it.productName.toLowerCase().includes(q))
      )
    : orders.slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden text-white">
        {/* Search Bar Input */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <Search className="w-5 h-5 text-amber-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Глобальный поиск (п. 102): номер заказа, магазин, товар, телефон, агент..."
            className="w-full bg-transparent text-white placeholder-slate-500 focus:outline-none text-base font-medium"
            autoFocus
          />
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
            {q ? `Результаты поиска (${filteredOrders.length})` : 'Недавние заказы в реестре'}
          </div>

          {filteredOrders.length > 0 ? (
            filteredOrders.map(order => (
              <button
                key={order.id}
                onClick={() => {
                  onSelectOrder(order);
                  onClose();
                }}
                className="w-full text-left p-3.5 rounded-2xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 hover:border-amber-500/50 transition flex items-center justify-between group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span className="font-black text-slate-200">{order.orderNumber}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-bold">
                      {order.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Store className="w-3.5 h-3.5" />
                      {order.destinationName}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {order.createdByName}
                    </span>
                    <span>•</span>
                    <span>{order.totalWeightKg} кг</span>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-xl bg-slate-700/50 group-hover:bg-amber-400 group-hover:text-slate-950 flex items-center justify-center transition">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-slate-500 text-sm">
              По запросу «{query}» ничего не найдено
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 text-[11px] text-slate-400 flex justify-between items-center px-4">
          <span>Нажмите на заказ для просмотра Цифрового паспорта</span>
          <span className="font-mono bg-slate-800 px-2 py-0.5 rounded">ESC для закрытия</span>
        </div>
      </div>
    </div>
  );
};
export default GlobalSearchModal;
