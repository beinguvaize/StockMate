import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    Plus, Search, Phone, Mail, MapPin, Building2, 
    Trash2, Edit3, X, Save, ArrowLeft, ArrowUpRight,
    Package, CreditCard, History, User2
} from 'lucide-react';

const Suppliers = () => {
    const { 
        suppliers, addSupplier, deleteSupplier, 
        purchases, products, businessProfile,
        isViewOnly, hasPermission 
    } = useAppContext();

    const [searchTerm, setSearchTerm] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [viewingSupplier, setViewingSupplier] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        notes: ''
    });

    const filteredSuppliers = useMemo(() => {
        return suppliers.filter(s => 
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [suppliers, searchTerm]);

    const getSupplierStats = (supplierId) => {
        // Since we are migrating from text supplier_name to ID, we check both
        const supplier = suppliers.find(s => s.id === supplierId);
        const supplierPurchases = purchases.filter(p => 
            p.supplier_id === supplierId || p.supplier_name === supplier?.name
        );
        
        return {
            totalProcured: supplierPurchases.reduce((sum, p) => sum + (p.total_cost || 0), 0),
            purchaseCount: supplierPurchases.length,
            lastPurchase: supplierPurchases.sort((a,b) => new Date(b.date) - new Date(a.date))[0]?.date
        };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const success = await addSupplier(formData);
        if (success) {
            setIsAdding(false);
            setFormData({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure? This will remove the supplier record. Purchase history remains intact.")) {
            await deleteSupplier(id);
        }
    };

    return (
        <div className="animate-fade-in flex flex-col gap-6 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-black/5">
                <div>
                    <h1 className="text-3xl md:text-6xl font-black text-ink-primary uppercase tracking-tighter leading-none mb-2">SUPPLIERS.</h1>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.4em] opacity-70">GLOBAL PROCUREMENT & PARTNER NETWORK</p>
                </div>
                {!isViewOnly() && (
                    <button className="btn-signature h-14 !px-6 !rounded-pill flex items-center justify-between gap-6 group transition-all" onClick={() => setIsAdding(true)}>
                        <span className="text-xs font-black uppercase tracking-widest px-2">ONBOARD PARTNER</span>
                        <div className="icon-nest !w-10 !h-10 bg-black shadow-lg">
                            <Plus size={20} className="text-accent-signature" />
                        </div>
                    </button>
                )}
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="glass-panel !p-6 bg-white border border-black/5 rounded-bento shadow-premium flex flex-col justify-between h-32">
                    <span className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50">Active Partners</span>
                    <div className="flex items-end justify-between">
                        <span className="text-4xl font-black text-ink-primary tracking-tighter">{suppliers.length}</span>
                        <Building2 size={24} className="text-ink-primary opacity-10" />
                    </div>
                </div>
                <div className="glass-panel !p-6 bg-ink-primary border border-black/5 rounded-bento shadow-premium flex flex-col justify-between h-32 text-surface">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Procurement Val.</span>
                    <div className="flex items-end justify-between">
                        <span className="text-3xl font-black tracking-tighter">
                            {businessProfile?.currencySymbol || '₹'}{purchases.reduce((sum, p) => sum + (p.total_cost || 0), 0).toLocaleString()}
                        </span>
                        <ArrowUpRight size={24} className="text-accent-signature" />
                    </div>
                </div>
            </div>

            {/* Search & List */}
            <div className="flex flex-col gap-4">
                <div className="relative group flex items-center h-14">
                    <Search size={20} className="absolute left-6 text-ink-primary opacity-20 transition-opacity z-10" />
                    <input 
                        type="text" 
                        placeholder="Search by name, contact, or ID..." 
                        className="w-full input-field !pl-14 !h-full !py-0 !rounded-pill bg-white border border-black/5 shadow-premium text-sm font-bold placeholder:text-ink-secondary/30 focus:ring-4 focus:ring-accent-signature/10 transition-all"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSuppliers.map(s => {
                        const stats = getSupplierStats(s.id);
                        return (
                            <div key={s.id} className="glass-panel !p-0 !rounded-[2.5rem] border border-black/5 bg-white hover:shadow-premium transition-all overflow-hidden group">
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-canvas flex items-center justify-center text-ink-primary border border-black/5 group-hover:scale-110 transition-transform shadow-sm">
                                                <Building2 size={24} />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-black text-ink-primary uppercase tracking-tight leading-none mb-1">{s.name}</h3>
                                                <span className="text-[10px] font-bold text-ink-secondary opacity-50 uppercase tracking-widest">{s.contact_person || 'No Contact'}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="p-2 rounded-xl border border-black/5 hover:bg-canvas transition-colors text-ink-secondary">
                                                <Edit3 size={14} />
                                            </button>
                                            {!isViewOnly() && (
                                                <button onClick={() => handleDelete(s.id)} className="p-2 rounded-xl border border-black/5 hover:bg-red-50 hover:text-red-500 transition-colors text-ink-secondary">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3 mb-6">
                                        <div className="flex items-center gap-3 text-xs font-medium text-ink-secondary opacity-80">
                                            <Phone size={14} strokeWidth={2.5} className="opacity-40" />
                                            {s.phone || 'N/A'}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs font-medium text-ink-secondary opacity-80">
                                            <Mail size={14} strokeWidth={2.5} className="opacity-40" />
                                            {s.email || 'N/A'}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-canvas p-3 rounded-2xl border border-black/5">
                                            <p className="text-[8px] font-black text-ink-secondary uppercase tracking-widest opacity-40 mb-1">Procured</p>
                                            <p className="text-xs font-black text-ink-primary truncate">
                                                {businessProfile?.currencySymbol || '₹'}{stats.totalProcured.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="bg-canvas p-3 rounded-2xl border border-black/5">
                                            <p className="text-[8px] font-black text-ink-secondary uppercase tracking-widest opacity-40 mb-1">Last Supply</p>
                                            <p className="text-xs font-black text-ink-primary truncate">
                                                {stats.lastPurchase ? new Date(stats.lastPurchase).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Never'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={() => setViewingSupplier(s)}
                                    className="w-full py-4 bg-ink-primary text-surface text-[10px] font-black uppercase tracking-[0.3em] hover:bg-ink-primary/95 transition-all flex items-center justify-center gap-3"
                                >
                                    View Activity Log
                                    <ArrowUpRight size={14} className="text-accent-signature" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Add Supplier Modal */}
            {isAdding && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-2xl">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h1 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">PARTNER ONBOARDING.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-70">REGISTER NEW SUPPLY VECTOR</p>
                            </div>
                            <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all" onClick={() => setIsAdding(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-2">Company Name (Entity)</label>
                                    <input required type="text" className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-2xl text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" placeholder="ACME SUPPLIERS..." value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-2">Contact Person</label>
                                    <input type="text" className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all" placeholder="MR. JOHN" value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-2">Phone Primary</label>
                                    <input type="text" className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all" placeholder="+91..." value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-2">Email for Purchase Orders</label>
                                    <input type="email" className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all" placeholder="orders@partner.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-2">Physical Address</label>
                                    <textarea className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-xs text-ink-primary outline-none min-h-[100px] resize-none" placeholder="FULL WAREHOUSE ADDRESS..." value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                                </div>
                            </div>

                            <button type="submit" className="btn-signature w-full !h-16 flex items-center justify-center gap-4 !rounded-pill">
                                INITIALIZE PARTNERSHIP
                                <div className="icon-nest !bg-black">
                                    <Save size={20} className="text-accent-signature" />
                                </div>
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Suppliers;
