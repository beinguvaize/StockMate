import React, { useMemo, useState } from 'react';
import { 
    Search, Shield, Clock, User, ArrowUpRight, ArrowDownLeft, 
    RefreshCcw, AlertTriangle, Filter, Download
} from 'lucide-react';

const ReportAudit = ({ movementLog, products, users }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');

    const enrichedLogs = useMemo(() => {
        return (movementLog || [])
            .map(log => {
                const product = (products || []).find(p => p.id === log.productId);
                const user = (users || []).find(u => u.id === log.userId);
                return {
                    ...log,
                    productName: product ? product.name : 'Unknown Product',
                    userName: user ? (user.full_name || user.email) : 'System / Legacy'
                };
            })
            .filter(log => {
                const matchesSearch = 
                    log.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    log.notes?.toLowerCase().includes(searchTerm.toLowerCase());
                
                const matchesType = typeFilter === 'ALL' || log.type === typeFilter;
                
                return matchesSearch && matchesType;
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [movementLog, products, users, searchTerm, typeFilter]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Audit Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-surface/80 backdrop-blur-xl border border-black/5 rounded-3xl p-4 shadow-premium">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="w-12 h-12 rounded-2xl bg-ink-primary text-accent-signature flex items-center justify-center shrink-0">
                        <Shield size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black tracking-tighter uppercase leading-none">Security Audit Trail</h3>
                        <p className="text-[9px] font-black tracking-widest uppercase opacity-50 mt-1">Real-time Activity Log</p>
                    </div>
                </div>
                
                <div className="flex flex-1 w-full md:w-auto items-center gap-3 justify-end">
                    <div className="flex bg-canvas border border-black/5 rounded-2xl p-1 shrink-0">
                        {['ALL', 'IN', 'OUT', 'ADJUST'].map(t => (
                            <button
                                key={t}
                                onClick={() => setTypeFilter(t)}
                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${typeFilter === t ? 'bg-ink-primary text-accent-signature shadow-lg' : 'text-ink-secondary hover:bg-black/5'}`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    <div className="relative group w-full md:w-64">
                        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-primary opacity-20 group-focus-within:opacity-100 transition-opacity" />
                        <input 
                            type="text" 
                            placeholder="Filter activities..." 
                            className="input-field !pl-10 !h-12 !py-0 !rounded-2xl bg-canvas border border-black/5 shadow-inner text-[10px] font-bold"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div className="glass-panel !p-0 rounded-[2.5rem] border border-black/5 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-canvas/50">
                                <th className="py-4 px-6 text-[9px] font-black uppercase tracking-[0.2em] text-ink-secondary">Timestamp</th>
                                <th className="py-4 px-6 text-[9px] font-black uppercase tracking-[0.2em] text-ink-secondary">Actor</th>
                                <th className="py-4 px-6 text-[9px] font-black uppercase tracking-[0.2em] text-ink-secondary">Event</th>
                                <th className="py-4 px-6 text-[9px] font-black uppercase tracking-[0.2em] text-ink-secondary">Entity</th>
                                <th className="py-4 px-6 text-[9px] font-black uppercase tracking-[0.2em] text-ink-secondary text-right">Delta</th>
                                <th className="py-4 px-6 text-[9px] font-black uppercase tracking-[0.2em] text-ink-secondary">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                            {enrichedLogs.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="py-24 text-center">
                                        <div className="flex flex-col items-center opacity-20">
                                            <AlertTriangle size={48} className="mb-4" />
                                            <span className="text-sm font-black uppercase tracking-widest">No activities recorded in this period</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                enrichedLogs.map((log, idx) => (
                                    <tr key={log.id || idx} className="hover:bg-canvas/30 transition-colors group">
                                        <td className="py-4 px-6">
                                            <div className="flex items-center gap-2">
                                                <Clock size={12} className="opacity-30" />
                                                <span className="text-[10px] font-black uppercase text-ink-primary tabular-nums">
                                                    {new Date(log.createdAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center border border-black/5">
                                                    <User size={10} className="opacity-50" />
                                                </div>
                                                <span className="text-[10px] font-black uppercase text-ink-primary truncate max-w-[120px]">
                                                    {log.userName}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6">
                                            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest ${
                                                log.type === 'IN' ? 'bg-green-50 text-green-600 border-green-100' :
                                                log.type === 'OUT' ? 'bg-red-50 text-red-600 border-red-100' :
                                                'bg-blue-50 text-blue-600 border-blue-100'
                                            }`}>
                                                {log.type === 'IN' && <ArrowDownLeft size={10} />}
                                                {log.type === 'OUT' && <ArrowUpRight size={10} />}
                                                {log.type === 'ADJUST' && <RefreshCcw size={10} />}
                                                {log.type}
                                            </div>
                                        </td>
                                        <td className="py-4 px-6">
                                            <span className="text-[11px] font-black uppercase text-ink-primary truncate max-w-[180px]">
                                                {log.productName}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <span className={`text-sm font-black font-mono tabular-nums ${
                                                log.type === 'IN' ? 'text-green-600' :
                                                log.type === 'OUT' ? 'text-red-600' :
                                                'text-blue-600'
                                            }`}>
                                                {log.type === 'IN' ? '+' : log.type === 'OUT' ? '-' : ''}{log.quantity}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6">
                                            <p className="text-[10px] font-bold text-ink-secondary opacity-60 italic truncate max-w-[200px]">
                                                {log.notes || '—'}
                                            </p>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ReportAudit;
