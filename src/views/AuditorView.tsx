import React, { useState, useEffect } from 'react';
import { Search, ShieldAlert, History, RotateCcw, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import type { User, AuditLog, Order, ProductReturn, LoadingOperation } from '../types';
import { db } from '../db/database';

interface AuditorViewProps {
  currentUser: User;
}

export const AuditorView: React.FC<AuditorViewProps> = ({ currentUser }) => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [returns, setReturns] = useState<ProductReturn[]>([]);
  const [loadingOps, setLoadingOps] = useState<LoadingOperation[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    const al = await db.auditLogs.reverse().toArray();
    setAuditLogs(al);

    const ret = await db.returns.reverse().toArray();
    setReturns(ret);

    const l = await db.loadingOperations.reverse().toArray();
    setLoadingOps(l);
  };

  const filteredLogs = auditLogs.filter(
    l =>
      l.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.diffSummary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.actionType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Шапка Аудитора */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-700 text-amber-400 font-black flex items-center justify-center text-2xl shadow-lg">
            <Search className="w-8 h-8" />
          </div>
          <div>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-400 text-[10px] font-black uppercase tracking-wider">
              Служба независимого аудита и ревизии
            </span>
            <h1 className="text-xl font-bold text-white mt-1">
              Ревизор: {currentUser.fullName}
            </h1>
            <p className="text-xs text-slate-400">
              Сквозной контроль расхождений, корректировок, погрузочных инцидентов и возвратов
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-semibold">Всего событий в журнале</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{auditLogs.length}</div>
          <span className="text-[10px] text-emerald-600 font-bold">100% цифровой след</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-semibold">Акты возврата продукции</span>
          <div className="text-2xl font-black text-rose-600 mt-1">{returns.length}</div>
          <span className="text-[10px] text-slate-400">Рекламации из торговых точек</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-semibold">Сверки с блокировкой погрузки</span>
          <div className="text-2xl font-black text-amber-600 mt-1">
            {loadingOps.filter(l => l.isDiscrepancy).length}
          </div>
          <span className="text-[10px] text-slate-500">Предотвращенные недостачи</span>
        </div>
      </div>

      {/* Поиск и фильтрация */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
        <Search className="w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Поиск по автору, действию, номеру накладной или причине..."
          className="w-full text-xs font-medium focus:outline-hidden text-slate-900"
        />
      </div>

      {/* Журнал аудита для ревизора */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100 text-xs">
        <div className="px-6 py-4 bg-slate-50 font-bold text-slate-900 text-sm flex justify-between items-center">
          <span>Сквозная летопись транзакций (Audit Trail)</span>
          <span className="text-xs text-slate-500 font-normal">Найдено: {filteredLogs.length}</span>
        </div>

        {filteredLogs.map(log => (
          <div key={log.id} className="p-4 hover:bg-slate-50/80 space-y-1.5">
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
              <div className="text-amber-900 bg-amber-50 px-2.5 py-1 rounded-md text-[11px] font-medium border border-amber-200 inline-block">
                Обоснование: {log.reason}
              </div>
            )}

            <div className="text-[10px] text-slate-400 pl-1">
              IP: {log.ipAddress} • {log.deviceInfo} {log.geoLat ? `• GPS: ${log.geoLat.toFixed(4)}, ${log.geoLng?.toFixed(4)}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
