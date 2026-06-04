import React, { useState, useMemo} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { usePeople } from '../hooks/usePeople';
import { usePurchases } from '../hooks/usePurchases';
import { useInventory } from '../hooks/useInventory';
import { 
  Plus, Search, Phone, Mail, MapPin, Building2, 
  Trash2, Edit3, X, Save, ArrowLeft, ArrowUpRight,
  Package, CreditCard, History, User2, Check, Box
} from 'lucide-react';
import { parseLocalDate } from '../lib/utils';

const Suppliers = () => {
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { 
    suppliers, addSupplier, updateSupplier, deleteSupplier 
  } = usePeople(currentTenantId);
  const { purchases } = usePurchases(currentTenantId);
  
  const isViewOnly = () => false;
  const addNotification = (msg, type) => console.log(msg, type);

  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
 const [formData, setFormData] = useState({
 name: '',
 contact_person: '',
 phone: '',
 email: '',
 address: '',
 notes: ''
});

 // First two word-initials for the avatar tile (e.g. "GPS Paper Cup" → "GP").
 const initialsOf = (name) => {
   const w = (name || '').trim().split(/\s+/).filter(Boolean);
   if (!w.length) return '–';
   return (w[0][0] + (w[1]?.[0] || '')).toUpperCase();
 };

 const filteredSuppliers = useMemo(() => {
 return suppliers.filter(s =>  s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
  s.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
 );
}, [suppliers, searchTerm]);

 const getSupplierStats = (supplierId) => {
 const supplier = suppliers.find(s => s.id === supplierId);
 const supplierPurchases = purchases.filter(p =>
 p.supplier_id === supplierId || p.supplier_name === supplier?.name
 );
 const amt = (p) => Number(p.total_amount ?? p.total_cost ?? 0);
 const isCredit = (pt) => ['CREDIT','UDHAAR','POST-CAPITAL'].includes(String(pt || '').toUpperCase());

 return {
 totalProcured: supplierPurchases.reduce((sum, p) => sum + amt(p), 0),
 creditDue: Number(supplier?.balance ?? supplier?.outstanding_balance ?? supplierPurchases.filter(p => isCredit(p.payment_type)).reduce((s,p) => s + amt(p), 0)),
 purchaseCount: supplierPurchases.length,
 lastPurchase: supplierPurchases.sort((a,b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))[0]?.date
};
};

 const handleSubmit = async (e) => {
 e.preventDefault();
 setLoading(true);
 try {
 const success = await addSupplier(formData);
 if (success) {
 setIsAdding(false);
 setFormData({ name: '', contact_person: '', phone: '', email: '', address: '', notes: ''});
}
} finally {
 setLoading(false);
}
};

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const success = await updateSupplier(formData);
      if (success) {
        setEditingSupplier(null);
        setFormData({ name: '', contact_person: '', phone: '', email: '', address: '', notes: ''});
      }
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (supplier) => {
    setFormData({ ...supplier });
    setEditingSupplier(supplier);
  };

  // Lock body scroll when modal is open
  React.useEffect(() => {
    if (isAdding || editingSupplier) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isAdding, editingSupplier]);

  const handleDelete = async (id) => {
    // Explicitly check for ID
    if (!id) {
      console.error("[Suppliers] Cannot delete: ID is missing");
      return;
    }

    // Restoration of window.confirm for standard UX
    if (!window.confirm("Delete this supplier? Purchase history will be kept but the supplier record will be removed.")) {
      return;
    }

    console.log(`[Suppliers] Triggering delete flow for ID: ${id}`);
    
    try {
      const { success, error } = await deleteSupplier(id);
      
      if (!success) {
        console.error(`[Suppliers] Delete failed: ${error}`);
        addNotification(`Deletion Failed: ${error}`, "error");
      } else {
        addNotification("Supplier removed successfully", "success");
      }
    } catch (err) {
      console.error("[Suppliers] CRITICAL UI EXCEPTION:", err);
      addNotification("A critical error occurred while deleting", "error");
    }
  };

 return (
 <>
 <div className="animate-fade-in flex flex-col gap-4 pb-12">
 {/* Header */}
 <div className="flex justify-between items-center py-2 border-b border-black/5">
 <div className="flex items-center gap-3">
 <h1 className="text-xl font-black font-sora text-ink-primary leading-none">Suppliers<span className="text-accent-signature">.</span></h1>
 <span className="text-[10px] font-semibold text-gray-400 hidden sm:block">Manage suppliers and purchase history</span>
 </div>
 {!isViewOnly() && (
  <button
    data-testid="onboard-partner-btn"
    className="btn-signature flex items-center gap-2 text-xs font-black"
    onClick={() => setIsAdding(true)}
  >
  <Plus size={12} /> Add Supplier
  </button>
 )}
 </div>

  {/* Premium KPI Ribbons */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
  <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
  <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-ink-primary">
  <Building2 size={40} strokeWidth={2} />
  </div>
  <div className="relative z-10 flex flex-col">
  <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-wider">Suppliers</span>
  <div className="font-mono text-2xl font-bold text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
  {suppliers.length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">TOTAL</span>
  </div>
  </div>
  </div>

  <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
  <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-accent-signature">
  <ArrowUpRight size={40} strokeWidth={2} />
  </div>
  <div className="relative z-10 flex flex-col">
  <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-wider">Total Purchased</span>
  <div className="font-mono text-2xl font-bold text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
  <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile?.currencySymbol || '₹'}</span>
  {purchases.reduce((sum, p) => sum + Number(p.total_amount ?? p.total_cost ?? 0), 0).toLocaleString()}
  </div>
  </div>
  </div>
  
  <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
  <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-gray-500">
  <Box size={40} strokeWidth={2} />
  </div>
  <div className="relative z-10 flex flex-col">
  <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-wider">Purchase Orders</span>
  <div className="font-mono text-2xl font-bold text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
  {purchases.length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">TOTAL</span>
  </div>
  </div>
  </div>
  </div>

  {/* Search & List */}
  <div className="flex flex-col gap-4">
  {/* Interactive Utility Row */}
  <div className="flex flex-col lg:flex-row items-center justify-between bg-white backdrop-blur-xl border border-black/5 rounded-[2rem] shadow-sm p-2 min-h-[72px] w-full gap-2 mb-8">
  <div className="flex-1 w-full relative group h-[56px]">
  <Search size={22} strokeWidth={2.5} className="absolute left-6 top-1/2 -translate-y-1/2 text-ink-primary opacity-30 group-focus-within:opacity-100 transition-opacity" />
  <input 
  data-testid="search-suppliers-input"
  type="text" 
  className="w-full h-full pl-16 pr-6 bg-white border border-gray-300 shadow-sm rounded-pill text-[13px] font-bold text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all placeholder:text-gray-400 uppercase tracking-wide" 
  placeholder="Search suppliers or contacts..."
  value={searchTerm}
  onChange={e => setSearchTerm(e.target.value)}
  />
  </div>
  </div>

 {/* Dense supplier ledger list */}
 <div className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">
 {/* Column header */}
 <div className="hidden md:grid grid-cols-[1fr_7rem_7rem_6rem_5rem] gap-4 px-5 py-2.5 text-[10px] uppercase tracking-wider font-bold text-gray-400 border-b border-black/5">
 <div>Supplier</div>
 <div className="text-right">Procured</div>
 <div className="text-right">You Owe</div>
 <div className="text-right">Last Supply</div>
 <div className="text-right">Actions</div>
 </div>

 {filteredSuppliers.length === 0 && (
 <div className="px-5 py-16 text-center text-sm font-semibold text-gray-400">
 No suppliers found.
 </div>
 )}

 <div className="divide-y divide-black/5">
 {filteredSuppliers.map(s => {
 const stats = getSupplierStats(s.id);
 const cur = businessProfile?.currencySymbol || '₹';
 const goLedger = () => navigate(`/${tenantSlug}/suppliers/ledger/${s.id}`);
 return (
 <div
 key={s.id}
 data-testid="supplier-row"
 onClick={goLedger}
 className="grid grid-cols-2 md:grid-cols-[1fr_7rem_7rem_6rem_5rem] gap-x-4 gap-y-2 px-5 py-3 items-center hover:bg-amber-50/40 transition-colors cursor-pointer group"
 >
 {/* Supplier identity */}
 <div className="flex items-center gap-3 min-w-0 col-span-2 md:col-span-1">
 <div className="w-9 h-9 shrink-0 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-mono font-bold text-[12px]">
 {initialsOf(s.name)}
 </div>
 <div className="min-w-0">
 <div className="font-bold text-[13px] text-ink-primary truncate">{s.name}</div>
 <div className="text-[11px] text-gray-400 truncate">
 {[s.contact_person, s.phone].filter(Boolean).join(' · ') || 'No contact'}
 </div>
 </div>
 </div>

 {/* Procured */}
 <div className="text-left md:text-right">
 <span className="md:hidden text-[9px] uppercase tracking-wider font-bold text-gray-400 mr-1">Procured</span>
 <span className="font-mono tabular-nums text-[13px] font-bold text-ink-primary">{cur}{stats.totalProcured.toLocaleString()}</span>
 </div>

 {/* You owe */}
 <div className="text-left md:text-right">
 <span className="md:hidden text-[9px] uppercase tracking-wider font-bold text-gray-400 mr-1">You owe</span>
 <span className={`font-mono tabular-nums text-[13px] font-bold ${stats.creditDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{cur}{stats.creditDue.toLocaleString()}</span>
 </div>

 {/* Last supply */}
 <div className="text-left md:text-right">
 <span className="md:hidden text-[9px] uppercase tracking-wider font-bold text-gray-400 mr-1">Last</span>
 <span className="text-[12px] font-semibold text-gray-600">{stats.lastPurchase ? new Date(stats.lastPurchase).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Never'}</span>
 </div>

 {/* Actions */}
 <div className="flex items-center justify-end gap-1 col-span-2 md:col-span-1" onClick={e => e.stopPropagation()}>
 <button
 data-testid="edit-supplier-btn"
 onClick={() => openEditModal(s)}
 title="Edit"
 className="p-1.5 rounded-lg hover:bg-black/5 text-gray-400 hover:text-ink-primary transition-colors"
 >
 <Edit3 size={14} />
 </button>
 {!isViewOnly() && (
 <button
 data-testid="delete-supplier-btn"
 onClick={() => handleDelete(s.id)}
 title="Delete"
 className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
 >
 <Trash2 size={14} />
 </button>
 )}
 <button onClick={goLedger} title="View transactions" className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors">
 <ArrowUpRight size={15} />
 </button>
 </div>
 </div>
 );
})}
 </div>
 </div>
 </div>
 </div>

 {/* Add Supplier Modal */}
 {isAdding && (
 <div className="modal-overlay">
 <div className="glass-modal !max-w-xl">
 <div className="flex justify-between items-start mb-3 border-b border-black/5 pb-3">
 <div>
 <h1 className="text-lg font-semibold text-ink-primary leading-none mb-1">Add Supplier</h1>
 <p className="text-[10px] font-semibold text-gray-700 opacity-60">Register a new supplier</p>
 </div>
 <button className="w-7 h-7 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer" onClick={() => setIsAdding(false)}>
 <X size={14} />
 </button>
 </div>

 <form onSubmit={handleSubmit} className="space-y-2.5 mt-2">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
 <div className="md:col-span-2">
 <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Supplier Name</label>
 <input required type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="ACME..." value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value})} />
 </div>

 <div>
 <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Contact (Optional)</label>
 <input type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="NAME..." value={formData.contact_person} onChange={e => setFormData({ ...formData, contact_person: e.target.value})} />
 </div>

 <div>
 <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Phone (Optional)</label>
 <input type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="+91..." value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value})} />
 </div>

 <div className="md:col-span-2">
 <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Email (Optional)</label>
 <input type="email" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="orders@partner.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value})} />
 </div>

 <div className="md:col-span-2">
 <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Address</label>
 <textarea rows={2} className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all resize-none placeholder:text-gray-400 placeholder:font-normal" placeholder="123 MAIN ST..." value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value})} />
 </div>
 </div>

 <button type="submit" disabled={loading} className="w-full btn-signature !h-11 !text-sm flex items-center justify-center !rounded-xl mt-3">
 {loading ? 'Saving...' : 'Add Supplier'}
 <Check size={16} className="ml-2" />
 </button>
 </form>
  </div>
  </div>
  )}

  {/* Edit Supplier Modal */}
  {editingSupplier && (
    <div className="modal-overlay">
      <div className="glass-modal !max-w-xl">
        <div className="flex justify-between items-start mb-3 border-b border-black/5 pb-3">
          <div>
            <h1 className="text-lg font-semibold text-ink-primary leading-none mb-1">Edit Supplier</h1>
            <p className="text-[10px] font-semibold text-gray-700 opacity-60">Update supplier details</p>
          </div>
          <button 
            className="w-7 h-7 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer" 
            onClick={() => {
              setEditingSupplier(null);
              setFormData({ name: '', contact_person: '', phone: '', email: '', address: '', notes: ''});
            }}
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleEditSubmit} className="space-y-2.5 mt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Supplier Name</label>
              <input required type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="ACME..." value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value})} />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Contact (Optional)</label>
              <input type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="NAME..." value={formData.contact_person} onChange={e => setFormData({ ...formData, contact_person: e.target.value})} />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Phone (Optional)</label>
              <input type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="+91..." value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value})} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Email (Optional)</label>
              <input type="email" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="orders@partner.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value})} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Address</label>
              <textarea rows={2} className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all resize-none placeholder:text-gray-400 placeholder:font-normal" placeholder="123 MAIN ST..." value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value})} />
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full btn-signature !h-11 !text-sm flex items-center justify-center !rounded-xl mt-3">
            {loading ? 'SAVING...' : 'SAVE CHANGES'}
            <Save size={16} className="ml-2" />
          </button>
        </form>
      </div>
    </div>
  )}

  </>
  );
};

export default Suppliers;
