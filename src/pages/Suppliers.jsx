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
    className="btn-signature !h-8 !rounded-lg !px-4 !text-xs !font-bold flex items-center gap-2"
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
  <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
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
  <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
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
  <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
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
  className="w-full h-full pl-16 pr-6 bg-canvas border border-black/5 rounded-pill text-[13px] font-bold text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all placeholder:text-gray-400 uppercase tracking-wide" 
  placeholder="Search suppliers or contacts..."
  value={searchTerm}
  onChange={e => setSearchTerm(e.target.value)}
  />
  </div>
  </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {filteredSuppliers.map(s => {
 const stats = getSupplierStats(s.id);
 return (
  <div key={s.id} data-testid="supplier-row" className="glass-panel !p-0 !rounded-[2.5rem] border border-black/5 bg-white hover:shadow-premium transition-all overflow-hidden group">
 <div className="p-6">
 <div className="flex justify-between items-start mb-6">
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 rounded-lg bg-canvas flex items-center justify-center text-ink-primary border border-black/5 group-hover:scale-110 transition-transform shadow-sm">
 <Building2 size={24} />
 </div>
 <div>
 <h3 className="text-base font-semibold text-ink-primary leading-none mb-1">{s.name}</h3>
 <span className="text-[10px] font-bold text-gray-700 opacity-[0.85]">{s.contact_person || 'No Contact'}</span>
 </div>
 </div>
 <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
  <button 
    data-testid="edit-supplier-btn"
    onClick={() => openEditModal(s)} 
    className="p-2 rounded-xl border border-black/5 hover:bg-canvas transition-colors text-gray-700"
  >
  <Edit3 size={14} />
  </button>
  {!isViewOnly() && (
  <button 
    data-testid="delete-supplier-btn"
    onClick={() => handleDelete(s.id)} 
    className="p-2 rounded-xl border border-black/5 hover:bg-red-50 hover:text-red-500 transition-colors text-gray-700"
  >
  <Trash2 size={14} />
  </button>
  )}
 </div>
 </div>

 <div className="space-y-3 mb-6">
 <div className="flex items-center gap-3 text-xs font-medium text-gray-700 opacity-80">
 <Phone size={14} strokeWidth={2.5} className="opacity-70" />
 {s.phone || 'N/A'}
 </div>
 <div className="flex items-center gap-3 text-xs font-medium text-gray-700 opacity-80">
 <Mail size={14} strokeWidth={2.5} className="opacity-70" />
 {s.email || 'N/A'}
 </div>
 </div>

 <div className="grid grid-cols-3 gap-2">
 <div className="bg-canvas p-3 rounded-lg border border-black/5">
 <p className="text-[8px] font-semibold text-gray-700 opacity-70 mb-1">Procured</p>
 <p className="text-xs font-semibold text-ink-primary truncate">
 {businessProfile?.currencySymbol || '₹'}{stats.totalProcured.toLocaleString()}
 </p>
 </div>
 <div className={`p-3 rounded-lg border ${stats.creditDue > 0 ? 'bg-red-50 border-red-100' : 'bg-canvas border-black/5'}`}>
 <p className="text-[8px] font-semibold text-gray-700 opacity-70 mb-1">You Owe</p>
 <p className={`text-xs font-semibold truncate ${stats.creditDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
 {businessProfile?.currencySymbol || '₹'}{stats.creditDue.toLocaleString()}
 </p>
 </div>
 <div className="bg-canvas p-3 rounded-lg border border-black/5">
 <p className="text-[8px] font-semibold text-gray-700 opacity-70 mb-1">Last Supply</p>
 <p className="text-xs font-semibold text-ink-primary truncate">
 {stats.lastPurchase ? new Date(stats.lastPurchase).toLocaleDateString(undefined, { day: 'numeric', month: 'short'}) : 'Never'}
 </p>
 </div>
 </div>
 </div>
 
 <button 
 onClick={() => navigate(`/${tenantSlug}/suppliers/ledger/${s.id}`)}
 className="w-full py-2 bg-ink-primary text-surface text-[10px] font-semibold hover:bg-ink-primary/95 transition-all flex items-center justify-center gap-3"
 >
 View Transactions
 <ArrowUpRight size={14} className="text-accent-signature" />
 </button>
 </div>
 );
})}
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
 <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Supplier Name</label>
 <input required type="text" className="w-full bg-canvas border-none rounded-lg p-2.5 font-semibold text-base text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" placeholder="ACME..." value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value})} />
 </div>

 <div>
 <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Contact (Optional)</label>
 <input type="text" className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" placeholder="NAME..." value={formData.contact_person} onChange={e => setFormData({ ...formData, contact_person: e.target.value})} />
 </div>

 <div>
 <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Phone (Optional)</label>
 <input type="text" className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" placeholder="+91..." value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value})} />
 </div>

 <div className="md:col-span-2">
 <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Email (Optional)</label>
 <input type="email" className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" placeholder="orders@partner.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value})} />
 </div>

 <div className="md:col-span-2">
 <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Address</label>
 <textarea rows={2} className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-[11px] text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all resize-none" placeholder="123 MAIN ST..." value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value})} />
 </div>
 </div>

 <button type="submit" disabled={loading} className="w-full btn-signature !h-10 !text-xs flex items-center justify-center !rounded-pill mt-2">
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
              <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Supplier Name</label>
              <input required type="text" className="w-full bg-canvas border-none rounded-lg p-2.5 font-semibold text-base text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" placeholder="ACME..." value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value})} />
            </div>

            <div>
              <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Contact (Optional)</label>
              <input type="text" className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" placeholder="NAME..." value={formData.contact_person} onChange={e => setFormData({ ...formData, contact_person: e.target.value})} />
            </div>

            <div>
              <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Phone (Optional)</label>
              <input type="text" className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" placeholder="+91..." value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value})} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Email (Optional)</label>
              <input type="email" className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" placeholder="orders@partner.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value})} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Address</label>
              <textarea rows={2} className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-[11px] text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all resize-none" placeholder="123 MAIN ST..." value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value})} />
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full btn-signature !h-10 !text-xs flex items-center justify-center !rounded-pill mt-2">
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
