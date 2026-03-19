import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    UserCircle, Plus, DollarSign, Building, Phone, MapPin, 
    Edit3, Trash2, X, Check, Save, UserCheck, CreditCard, 
    ChevronRight, ExternalLink, ShieldCheck, Mail, Search,
    TrendingUp, AlertCircle, Users
} from 'lucide-react';

const Clients = () => {
    const { shops, addShop, updateShop, deleteShop, orders, settleOrder, businessProfile, isViewOnly, hasPermission } = useAppContext();
    const [isAdding, setIsAdding] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [formData, setFormData] = useState({ name: '', contact: '', phone: '', address: '' });
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const clientStats = useMemo(() => {
        const stats = {};
        shops.forEach(s => stats[s.id] = { totalSales: 0, outstandingDebt: 0, orderCount: 0 });

        orders.forEach(order => {
            if (stats[order.shopId]) {
                stats[order.shopId].totalSales += order.totalAmount;
                stats[order.shopId].orderCount += 1;
                if (order.paymentMethod === 'CREDIT' && order.paymentStatus !== 'PAID') {
                    const balance = order.totalAmount - (order.paidAmount || 0);
                    stats[order.shopId].outstandingDebt += balance;
                }
            }
        });
        return stats;
    }, [orders, shops]);

    const topMetrics = useMemo(() => {
        let topDebtor = { name: 'None', amount: 0 };
        let topPerformer = { name: 'None', amount: 0 };

        shops.forEach(shop => {
            const stats = clientStats[shop.id];
            if (stats) {
                if (stats.outstandingDebt > topDebtor.amount) {
                    topDebtor = { name: shop.name, amount: stats.outstandingDebt };
                }
                if (stats.totalSales > topPerformer.amount) {
                    topPerformer = { name: shop.name, amount: stats.totalSales };
                }
            }
        });

        return { topDebtor, topPerformer };
    }, [shops, clientStats]);

    const filteredShops = useMemo(() => {
        return shops.filter(shop => 
            shop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            shop.contact?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            shop.id.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [shops, searchTerm]);

    const openAdd = () => {
        setEditingClient(null);
        setFormData({ name: '', contact: '', phone: '', address: '' });
        setIsAdding(true);
    };

    const openEdit = (client) => {
        setEditingClient(client);
        setFormData({ name: client.name, contact: client.contact, phone: client.phone, address: client.address });
        setIsAdding(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (editingClient) {
            updateShop({ ...editingClient, ...formData });
        } else {
            addShop(formData);
        }
        setIsAdding(false);
        setEditingClient(null);
        setFormData({ name: '', contact: '', phone: '', address: '' });
    };

    const handleDelete = (shopId) => {
        deleteShop(shopId);
        setDeleteConfirm(null);
    };

    return (
        <>
            <div className="animate-fade-in flex flex-col gap-4 pb-12">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-4 border-b border-black/5">
                    <div>
                        <h1 className="text-6xl font-black tracking-tighter text-ink-primary uppercase leading-none mb-2">CLIENTS.</h1>
                        <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-40">CUSTOMER NETWORK & ACCOUNTS</p>
                    </div>
                </div>

                {/* Quick Stats & Controls - h-16 Sync */}
                <div className="flex items-center bg-surface/80 backdrop-blur-xl border border-black/5 rounded-pill shadow-premium p-1 h-14 w-full">
                    {/* Metric Section: Active Accounts */}
                    <div className="flex items-center gap-3 px-5 border-r border-black/5 h-full">
                        <div className="w-8 h-8 rounded-full bg-accent-signature/10 flex items-center justify-center border border-accent-signature/20">
                            <Users size={14} className="text-accent-signature" />
                        </div>
                        <div className="flex flex-col -space-y-1">
                            <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Active Clients</div>
                            <div className="text-3xl font-black text-ink-primary tracking-tight flex items-baseline gap-2">
                                {filteredShops.length} <span className="text-lg font-black opacity-90">Clients</span>
                            </div>
                        </div>
                    </div>

                    {/* Metric Section: Debt Ranking */}
                    <div className="flex items-center gap-3 px-5 border-r border-black/5 h-full">
                        <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center border border-red-100">
                            <AlertCircle size={14} className="text-red-500" />
                        </div>
                        <div className="flex flex-col -space-y-1">
                            <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Top Debtors</div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-[11px] font-black text-red-600 uppercase tracking-tight">{topMetrics.topDebtor.name}</span>
                                <span className="text-2xl font-black tabular-nums opacity-90">{businessProfile?.currencySymbol || '₹'}{Math.round(topMetrics.topDebtor.amount).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Metric Section: Performance */}
                    <div className="flex items-center gap-3 px-5 border-r border-black/5 h-full">
                        <div className="w-8 h-8 rounded-full bg-accent-signature/10 flex items-center justify-center border border-accent-signature/20">
                            <TrendingUp size={14} className="text-accent-signature" />
                        </div>
                        <div className="flex flex-col -space-y-1">
                            <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Top Revenue</div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-[11px] font-black text-ink-primary uppercase tracking-tight">{topMetrics.topPerformer.name}</span>
                                <span className="text-2xl font-black tabular-nums opacity-90">{businessProfile?.currencySymbol || '₹'}{Math.round(topMetrics.topPerformer.amount).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Interactive Section: Search & Actions */}
                    <div className="flex-1 flex items-center justify-end h-full pr-1">
                        <div className="relative group mr-4 w-64 h-full flex items-center">
                            <Search size={14} className="absolute left-4 text-ink-primary opacity-20 group-focus-within:opacity-100 transition-opacity z-10" />
                            <input 
                                type="text" 
                                placeholder="Search clients..." 
                                className="input-field !pl-10 !h-full !py-0 !rounded-pill bg-canvas border border-black/5 shadow-inner text-xs font-bold placeholder:text-ink-secondary/20"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        
                        {hasPermission('ADD_CLIENT') && (
                            <button className="btn-signature h-full !rounded-pill !px-6 flex items-center justify-between gap-6 group transition-all duration-500 hover:shadow-[0_0_20px_rgba(200,241,53,0.3)] shrink-0" onClick={openAdd}>
                                <span className="text-[11px] font-black uppercase tracking-widest px-1">ADD CLIENT</span>
                                <div className="icon-nest !w-9 !h-9 bg-black shadow-lg">
                                    <Plus size={18} className="text-accent-signature" />
                                </div>
                            </button>
                        )}
                    </div>
                </div>

                {/* Client Ledger - Premium Grid Feed */}
                <div className="flex flex-col gap-4 min-h-[400px]">
                    {filteredShops.length === 0 ? (
                        <div className="glass-panel !py-32 !rounded-[3rem] text-center border-none shadow-premium">
                            <div className="flex justify-center mb-8 opacity-10">
                                <UserCircle size={80} strokeWidth={1} />
                            </div>
                            <h1 className="text-6xl font-black text-ink-primary uppercase tracking-tighter leading-none mb-2">CLIENTS.</h1>
                            <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-40">CUSTOMER NETWORK & ACCOUNTS</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredShops.map(client => {
                            const stats = clientStats[client.id];
                            
                            return (
                                <div key={client.id} className="glass-panel !p-0 !rounded-bento border border-black/10 hover:shadow-premium transition-all group flex flex-col h-full bg-white/50">
                                    {/* Header Section: Institutional Metadata */}
                                    <div className="p-3 pb-0.5 flex justify-between items-start">
                                        <div className="flex items-center gap-1.5">
                                            <span className="px-2 py-0.5 rounded-pill text-[8px] font-black uppercase tracking-widest border bg-canvas text-ink-primary border-black/20">
                                                Client
                                            </span>
                                            <span className="px-2 py-0.5 rounded-pill text-[8px] font-black uppercase tracking-widest border bg-accent-signature/20 text-ink-primary border-accent-signature/40">
                                                {stats?.orderCount || 0} DEALS
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-end gap-0.5">
                                            <div className="text-[8px] font-black uppercase tracking-widest text-ink-primary opacity-70">ID</div>
                                            <div className="text-[10px] font-black text-ink-primary opacity-60 uppercase leading-none">#{client.id.split('-')[0]}</div>
                                            {hasPermission('EDIT_CLIENT') && (
                                                <button 
                                                    onClick={() => openEdit(client)}
                                                    className="mt-1 p-1 rounded-full border border-black/10 text-ink-primary hover:bg-black/5 transition-all"
                                                    title="Edit Profile"
                                                >
                                                    <Edit3 size={10} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Main Content: Identity & Logistical Base */}
                                    <div className="p-3 pt-0.5 flex-1 flex flex-col">
                                        <h3 className="text-xl font-black text-ink-primary tracking-tighter uppercase leading-tight mb-0.5 group-hover:text-accent-signature transition-colors">
                                            {client.name}
                                        </h3>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-ink-primary opacity-60 uppercase tracking-widest mb-3 line-clamp-1">
                                            <MapPin size={9} className="shrink-0" /> {client.address}
                                        </div>

                                        <div className="space-y-1.5 mt-auto pt-3 border-t border-dashed border-black/10">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-ink-primary opacity-70">
                                                    <UserCircle size={10} /> CONTACT PERSON
                                                </div>
                                                <div className="text-[10px] font-black text-ink-primary uppercase truncate max-w-[140px]">{client.contact}</div>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-ink-primary opacity-70">
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
                                                <div className="text-[8px] font-black uppercase tracking-widest text-ink-primary opacity-70 mb-1">TOTAL SALES</div>
                                                <div className="text-2xl font-black text-ink-primary tracking-tighter tabular-nums leading-none">
                                                    {businessProfile?.currencySymbol || '₹'}{Math.round(stats?.totalSales || 0).toLocaleString()}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[8px] font-black uppercase tracking-widest text-ink-primary opacity-70 mb-1">DEBT</div>
                                                <div className={`text-2xl font-black font-mono tracking-tighter tabular-nums leading-none ${stats?.outstandingDebt > 0 ? 'text-red-600' : 'text-ink-primary opacity-30'}`}>
                                                    {businessProfile?.currencySymbol || '₹'}{Math.round(stats?.outstandingDebt || 0).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-1 bg-black/10 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-accent-signature transition-all duration-500" 
                                                    style={{ width: `${Math.min(100, (stats?.totalSales > 0 ? (stats.totalSales - stats.outstandingDebt) / stats.totalSales * 100 : 100))}%` }}
                                                ></div>
                                            </div>
                                            {hasPermission('DELETE_CLIENT') && (
                                                <button 
                                                    onClick={() => { if(window.confirm('Delete client?')) handleDelete(client.id); }}
                                                    className="w-6 h-6 rounded-full border border-red-200 bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-all shrink-0"
                                                >
                                                    <Trash2 size={9} />
                                                </button>
                                            )}
                                        </div>
                                        {stats?.outstandingDebt > 0 && (
                                            <button 
                                                className="w-full mt-3 py-2 bg-ink-primary text-accent-signature rounded-full text-[9px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all"
                                                onClick={() => {
                                                    const pendingOrder = orders.find(o => o.shopId === client.id && o.paymentMethod === 'CREDIT' && o.paymentStatus !== 'PAID');
                                                    if (pendingOrder) {
                                                        settleOrder(pendingOrder.id, pendingOrder.totalAmount);
                                                    }
                                                }}
                                            >
                                                Settle Debt
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    )}
                </div>
            </div>

            {/* Registration Overlay / Form */}
            {isAdding && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-[650px] !p-12">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h1 className="text-5xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">
                                    {editingClient ? 'CLIENT PROFILE.' : 'NEW CLIENT.'}
                                </h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-40">INSTITUTIONAL METADATA & ACCOUNTS</p>
                            </div>
                            <button
                                onClick={() => { setIsAdding(false); setEditingClient(null); }}
                                className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Business Name</label>
                                    <input 
                                        required 
                                        type="text" 
                                        placeholder="BUSINESS ENTITY NAME..."
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-lg text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        value={formData.name} 
                                        onChange={e => setFormData({...formData, name: e.target.value})} 
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Primary Contact</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        placeholder="PERSONNEL NAME..."
                                        value={formData.contact} 
                                        onChange={e => setFormData({...formData, contact: e.target.value})} 
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Phone Number</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all tabular-nums" 
                                        placeholder="+1 (000) 000-0000"
                                        value={formData.phone} 
                                        onChange={e => setFormData({...formData, phone: e.target.value})} 
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Logistical Base (Address)</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        placeholder="FULL PHYSICAL LOCATION..."
                                        value={formData.address} 
                                        onChange={e => setFormData({...formData, address: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <button type="button" className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => { setIsAdding(false); setEditingClient(null); }}>Cancel</button>
                                <button type="submit" className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill">
                                    {editingClient ? 'SAVE CHANGES' : 'ADD CLIENT'}
                                    <div className="icon-nest !w-10 !h-10 ml-4">
                                        <Save size={22} />
                                    </div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default Clients;
