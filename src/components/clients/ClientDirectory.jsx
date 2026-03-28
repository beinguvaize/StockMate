import React from 'react';
import { 
    UserCircle, Plus, Edit3, Trash2, Check, ExternalLink, 
    MapPin, Phone, AlertCircle, Search, TrendingUp, Users
} from 'lucide-react';

const ClientDirectory = ({ 
    filteredClients, 
    clientStats, 
    topMetrics, 
    businessProfile, 
    searchTerm, 
    setSearchTerm, 
    statusFilter, 
    setStatusFilter, 
    openAdd, 
    openEdit, 
    toggleStatus, 
    handleDelete, 
    hasPermission,
    setSelectedClientForPayment,
    setSelectedClientForStatement,
    setPaymentData,
    setPaymentError
}) => {
    return (
        <div className="space-y-4">
            {/* Quick Stats & Controls */}
            <div className="flex flex-wrap lg:flex-nowrap items-center bg-surface/80 backdrop-blur-xl border border-black/5 rounded-2xl lg:rounded-pill shadow-premium p-1 min-h-14 w-full gap-2">
                {/* Metric Section: Active Accounts */}
                <div className="flex items-center gap-3 px-5 border-r border-black/5 h-full py-2">
                    <div className="w-8 h-8 rounded-full bg-accent-signature/10 flex items-center justify-center border border-accent-signature/20">
                        <Users size={14} className="text-accent-signature" />
                    </div>
                    <div className="flex flex-col -space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Active Clients</div>
                        <div className="text-3xl font-black text-ink-primary tracking-tight flex items-baseline gap-2">
                            {filteredClients.length} <span className="text-lg font-black opacity-90 text-[10px] uppercase font-black tracking-widest">Entries</span>
                        </div>
                    </div>
                </div>

                {/* Metric Section: Debt Ranking */}
                <div className="flex items-center gap-3 px-5 border-r border-black/5 h-full py-2">
                    <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center border border-red-100">
                        <AlertCircle size={14} className="text-red-500" />
                    </div>
                    <div className="flex flex-col -space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Top Debtors</div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-[11px] font-black text-red-600 uppercase tracking-tight truncate max-w-[80px]">{topMetrics.topDebtor.name}</span>
                            <span className="text-2xl font-black tabular-nums opacity-90">{businessProfile?.currencySymbol || '₹'}{Math.round(topMetrics.topDebtor.amount).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Interactive Section: Search & Actions */}
                <div className="flex-1 flex items-center justify-end h-full pr-1 overflow-x-auto min-w-[300px]">
                    <div className="flex bg-canvas border border-black/5 rounded-pill p-1 mr-4 shrink-0">
                        {['ALL', 'ACTIVE', 'INACTIVE'].map(f => (
                            <button
                                key={f}
                                onClick={() => setStatusFilter(f)}
                                className={`px-4 py-1.5 rounded-pill text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === f ? 'bg-ink-primary text-accent-signature shadow-lg' : 'text-ink-secondary hover:bg-black/5'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                    <div className="relative group mr-4 w-48 h-full flex items-center shrink-0">
                        <Search size={14} className="absolute left-4 text-ink-primary opacity-20 group-focus-within:opacity-100 transition-opacity z-10" />
                        <input 
                            type="text" 
                            placeholder="Search..." 
                            className="input-field !pl-10 !h-10 !py-0 !rounded-pill bg-canvas border border-black/5 shadow-inner text-[10px] font-bold placeholder:text-ink-secondary/20"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    {hasPermission('clients', 'edit') && (
                        <button className="btn-signature h-10 !rounded-pill !px-6 flex items-center justify-between gap-6 group transition-all duration-500 hover:shadow-[0_0_20px_rgba(200,241,53,0.3)] shrink-0" onClick={openAdd}>
                            <span className="text-[11px] font-black uppercase tracking-widest px-1">ADD CLIENT</span>
                            <div className="icon-nest !w-8 !h-8 bg-black shadow-lg">
                                <Plus size={16} className="text-accent-signature" />
                            </div>
                        </button>
                    )}
                </div>
            </div>

            {/* Client Ledger - Premium Grid Feed */}
            <div className="flex flex-col gap-4 min-h-[400px]">
                {filteredClients.length === 0 ? (
                    <div className="glass-panel !py-32 !rounded-[3rem] text-center border-none shadow-premium">
                        <div className="flex justify-center mb-8 opacity-10">
                            <UserCircle size={80} strokeWidth={1} />
                        </div>
                        <h1 className="text-3xl md:text-6xl font-black text-ink-primary uppercase tracking-tighter leading-none mb-2">CLIENTS.</h1>
                        <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-70">CUSTOMER NETWORK & ACCOUNTS</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredClients.map(client => {
                        const stats = clientStats[client.id];
                        
                        return (
                            <div key={client.id} className="glass-panel !p-0 !rounded-bento border border-black/10 hover:shadow-premium transition-all group flex flex-col h-full bg-white/50">
                                {/* Header Section: Institutional Metadata */}
                                <div className="p-3 pb-0.5 flex justify-between items-start">
                                    <div className="flex items-center gap-1.5 text-ink-primary">
                                        <span className="px-2 py-0.5 rounded-pill text-[8px] font-black uppercase tracking-widest border bg-canvas border-black/20">
                                            Client
                                        </span>
                                        <span className="px-2 py-0.5 rounded-pill text-[8px] font-black uppercase tracking-widest border bg-accent-signature/20 border-accent-signature/40">
                                            {stats?.orderCount || 0} DEALS
                                        </span>
                                        <button 
                                            onClick={() => toggleStatus(client)}
                                            className={`px-2 py-0.5 rounded-pill text-[8px] font-black uppercase tracking-widest border transition-all ${client.status === 'INACTIVE' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-600 border-green-200'}`}
                                        >
                                            {client.status || 'ACTIVE'}
                                        </button>
                                    </div>
                                    <div className="flex flex-col items-end gap-0.5 text-ink-primary">
                                        <div className="text-[8px] font-black uppercase tracking-widest opacity-70">ID</div>
                                        <div className="text-[10px] font-black opacity-60 uppercase leading-none">#{client.id?.split('-')[0] || 'N/A'}</div>
                                        {hasPermission('clients', 'edit') && (
                                            <button 
                                                onClick={() => openEdit(client)}
                                                className="mt-1 p-1 rounded-full border border-black/10 hover:bg-black/5 transition-all text-ink-primary"
                                                title="Edit Profile"
                                            >
                                                <Edit3 size={10} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Main Content: Identity & Logistical Base */}
                                <div className="p-3 pt-1 flex-1 flex flex-col">
                                    <h3 
                                        className="text-xl font-black text-ink-primary tracking-tighter uppercase leading-tight mb-1 hover:text-accent-signature transition-colors cursor-pointer flex items-center gap-2"
                                        onClick={() => setSelectedClientForStatement(client)}
                                    >
                                        {client.name} <ExternalLink size={12} className="opacity-50" />
                                    </h3>
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-ink-primary opacity-60 uppercase tracking-widest mb-3 line-clamp-1">
                                        <MapPin size={9} className="shrink-0" /> {client.address}
                                    </div>

                                    <div className="space-y-1.5 mt-auto pt-3 border-t border-dashed border-black/10">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-ink-secondary opacity-70">
                                                <UserCircle size={10} /> CONTACT PERSON
                                            </div>
                                            <div className="text-[10px] font-black text-ink-primary uppercase truncate max-w-[140px]">{client.contact}</div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-ink-secondary opacity-70">
                                                <Phone size={10} /> PHONE
                                            </div>
                                            <div className="text-[10px] font-black text-ink-primary tabular-nums">{client.phone}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Section: Financials */}
                                <div className="p-3 bg-canvas/60 backdrop-blur-sm border-t border-black/10">
                                    <div className="flex justify-between items-end mb-2">
                                        <div>
                                            <div className="text-[8px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1">TOTAL SALES</div>
                                            <div className="text-2xl font-black text-ink-primary tracking-tighter tabular-nums leading-none">
                                                {businessProfile?.currencySymbol || '₹'}{Math.round(stats?.totalSales || 0).toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[8px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1">OUTSTANDING</div>
                                            <div className={`text-2xl font-black font-mono tracking-tighter tabular-nums leading-none ${(client.outstanding_balance || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                {businessProfile?.currencySymbol || '₹'}{Math.round(client.outstanding_balance || 0).toLocaleString()}
                                            </div>
                                            <div className="text-[8px] font-black uppercase tracking-widest mt-1">
                                                {(client.outstanding_balance || 0) <= 0 ? (
                                                    <span className="text-green-500 flex items-center justify-end gap-1"><Check size={10} /> Fully Paid</span>
                                                ) : (
                                                    <span className="text-red-500 opacity-80 flex items-center justify-end gap-1"><AlertCircle size={10} /> Pending</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1 bg-black/10 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-accent-signature transition-all duration-500" 
                                                style={{ width: `${Math.min(100, (stats?.totalSales > 0 ? (stats.totalSales - (client.outstanding_balance || 0)) / stats.totalSales * 100 : 100))}%` }}
                                            ></div>
                                        </div>
                                        {hasPermission('clients', 'edit') && (
                                            <button 
                                                onClick={() => { if(window.confirm('Delete client?')) handleDelete(client.id); }}
                                                className="w-6 h-6 rounded-full border border-red-200 bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-all shrink-0"
                                            >
                                                <Trash2 size={9} />
                                            </button>
                                        )}
                                    </div>
                                    <button 
                                        className="w-full mt-3 py-2 bg-ink-primary text-accent-signature rounded-full text-[9px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all"
                                        onClick={() => {
                                            setSelectedClientForPayment(client);
                                            setPaymentData({ amount: client.outstanding_balance || '', date: new Date().toISOString().split('T')[0], notes: '' });
                                            setPaymentError('');
                                        }}
                                    >
                                        Record Payment
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                )}
            </div>
        </div>
    );
};

export default ClientDirectory;
