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
  Package, CreditCard, History, User2, Check, Box, Wallet
} from 'lucide-react';
import { parseLocalDate } from '../lib/utils';

// Common payment history across suppliers — grouped by date. Renders
// incrementally (PAGE rows at a time) so a large ledger never blocks the UI.
const PAGE = 60;
const PaymentsView = ({ payments, suppliers, purchases, cur }) => {
  const [visible, setVisible] = useState(PAGE);
  const [q, setQ] = useState('');

  // O(1) lookups instead of .find() per row.
  const supMap   = useMemo(() => new Map((suppliers || []).map(s => [s.id, s.name])), [suppliers]);
  const orderMap = useMemo(() => new Map((purchases || []).map(p => [p.id, p.invoice_no || p.reference_no || `#${String(p.id).slice(-6).toUpperCase()}`])), [purchases]);

  // Payments to a supplier = credit settlements (supplier_payments) PLUS cash
  // purchases (paid at purchase time, so they never create a settlement row).
  const isCredit = (pt) => ['CREDIT', 'UDHAAR', 'POST-CAPITAL'].includes(String(pt || '').toUpperCase());
  const merged = useMemo(() => {
    const pays = (payments || []).map(p => ({
      id: p.id, date: p.date, supplier_id: p.supplier_id, supplier_name: p.supplier_name,
      amount: Number(p.amount || 0), payment_method: p.payment_method, purchase_id: p.purchase_id, source: 'payment',
    }));
    const cashPur = (purchases || [])
      .filter(p => !p.deleted_at && !isCredit(p.payment_type) && Number(p.total_amount ?? p.total_cost ?? 0) > 0)
      .map(p => ({
        id: `CP-${p.id}`, date: p.date, supplier_id: p.supplier_id, supplier_name: p.supplier_name,
        amount: Number(p.total_amount ?? p.total_cost ?? 0), payment_method: p.payment_type || 'CASH',
        purchase_id: p.id, source: 'purchase',
      }));
    return [...pays, ...cashPur];
  }, [payments, purchases]);

  const sorted = useMemo(() => {
    const term = q.trim().toLowerCase();
    return merged
      .filter(p => !term || (supMap.get(p.supplier_id) || '').toLowerCase().includes(term))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [merged, q, supMap]);

  const total = useMemo(() => sorted.reduce((s, p) => s + Number(p.amount || 0), 0), [sorted]);

  // Group the visible slice by date (slice first → cheap grouping).
  const groups = useMemo(() => {
    const out = [];
    let cur = null;
    for (const p of sorted.slice(0, visible)) {
      if (!cur || cur.date !== p.date) { cur = { date: p.date, rows: [], sum: 0 }; out.push(cur); }
      cur.rows.push(p);
      cur.sum += Number(p.amount || 0);
    }
    return out;
  }, [sorted, visible]);

  const fmtDay = (d) => d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-black/5 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet size={15} className="text-accent-signature" />
          <span className="text-[12px] font-bold text-ink-primary">Payment history</span>
          <span className="text-[11px] font-semibold text-gray-400">{sorted.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => { setQ(e.target.value); setVisible(PAGE); }}
              placeholder="Filter supplier…"
              className="h-8 pl-8 pr-3 bg-white border border-black/10 rounded-lg text-[12px] font-semibold outline-none focus:border-accent-signature/70 w-44" />
          </div>
          <div className="font-mono tabular-nums text-[13px] font-bold text-ink-primary">
            <span className="text-accent-signature/70 mr-0.5">{cur}</span>{Math.round(total).toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="px-5 py-16 text-center text-sm font-semibold text-gray-400">No payments yet.</div>
      )}

      {groups.map(g => (
        <div key={g.date}>
          <div className="flex items-center justify-between px-5 py-1.5 bg-black/[0.025] border-b border-black/5">
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{fmtDay(g.date)}</span>
            <span className="font-mono tabular-nums text-[11px] font-bold text-gray-500">{cur}{Math.round(g.sum).toLocaleString('en-IN')}</span>
          </div>
          <div className="divide-y divide-black/5">
            {g.rows.map(p => (
              <div key={p.id} className="grid grid-cols-[1fr_8rem_6rem_7rem] gap-4 px-5 py-2.5 items-center hover:bg-accent-signature/5 transition-colors">
                <div className="font-bold text-[13px] text-ink-primary truncate">{supMap.get(p.supplier_id) || p.supplier_name || '—'}</div>
                <div>
                  {p.purchase_id
                    ? <span className="font-mono text-[11px] font-bold text-accent-signature-hover bg-accent-signature/10 border border-accent-signature/25 px-1.5 py-0.5 rounded">{orderMap.get(p.purchase_id) || `#${String(p.purchase_id).slice(-6).toUpperCase()}`}</span>
                    : <span className="text-[11px] text-gray-400">On account</span>}
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 bg-black/[0.05] px-1.5 py-0.5 rounded">{p.payment_method || 'CASH'}</span>
                </div>
                <div className="text-right font-mono tabular-nums text-[13px] font-bold text-emerald-600">
                  {cur}{Number(p.amount || 0).toLocaleString('en-IN')}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {visible < sorted.length && (
        <button onClick={() => setVisible(v => v + PAGE)}
          className="w-full py-3 text-[12px] font-bold text-accent-signature-hover hover:bg-accent-signature/10 border-t border-black/5 transition-colors">
          Load more ({sorted.length - visible} left)
        </button>
      )}
    </div>
  );
};

const Suppliers = () => {
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { 
    suppliers, addSupplier, updateSupplier, deleteSupplier 
  } = usePeople(currentTenantId);
  const { purchases, supplierPayments = [] } = usePurchases(currentTenantId, { withReturns: false });
  const [tab, setTab] = useState('SUPPLIERS'); // SUPPLIERS | PAYMENTS

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
 // Derive from orders (Σ credit total − paid) — stored balance can drift on edits.
 creditDue: supplierPurchases.filter(p => isCredit(p.payment_type)).reduce((s,p) => s + Math.max(0, amt(p) - Number(p.paid_amount || 0)), 0),
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
 <div className="flex justify-between items-center gap-3 pb-3 border-b border-black/5 flex-wrap">
   <div className="flex items-center gap-3 min-w-0">
     <h1 className="text-xl font-extrabold text-ink-primary leading-none">Suppliers<span className="text-accent-signature">.</span></h1>
     <span className="text-[11px] font-semibold text-gray-400 hidden sm:block">Suppliers & purchase payments</span>
   </div>
   <div className="flex items-center gap-2">
     <div className="inline-flex p-1 bg-black/[0.06] rounded-xl">
       <button onClick={() => setTab('SUPPLIERS')}
         className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold ${tab === 'SUPPLIERS' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Suppliers</button>
       <button onClick={() => setTab('PAYMENTS')}
         className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold ${tab === 'PAYMENTS' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Payments</button>
     </div>
     {!isViewOnly() && tab === 'SUPPLIERS' && (
       <button
         className="h-10 px-4 rounded-xl bg-white border border-black/10 text-ink-primary text-[13px] font-bold flex items-center gap-2 hover:bg-black/[0.03] transition-all"
         onClick={() => { window.location.href = '/bulk-add?type=suppliers'; }}>
         Bulk Import
       </button>
     )}
     {!isViewOnly() && tab === 'SUPPLIERS' && (
       <button data-testid="onboard-partner-btn"
         className="h-10 px-4 rounded-xl bg-accent-signature text-white text-[13px] font-bold flex items-center gap-2 hover:bg-accent-signature-hover transition-all"
         onClick={() => setIsAdding(true)}>
         <Plus size={15} strokeWidth={2.6} /> Add supplier
       </button>
     )}
   </div>
 </div>

  {/* KPI strip — compact mono/amber */}
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-black/[0.07] rounded-2xl overflow-hidden border border-black/[0.07] shadow-sm">
    {[
      { label: 'Suppliers', value: suppliers.length, suffix: 'total' },
      { label: 'Total Purchased', value: Math.round(purchases.reduce((s, p) => s + Number(p.total_amount ?? p.total_cost ?? 0), 0)).toLocaleString('en-IN'), money: true },
      { label: 'Purchase Orders', value: purchases.length, suffix: 'total' },
      { label: 'You Owe', value: Math.round(purchases.filter(p => ['CREDIT','UDHAAR','POST-CAPITAL'].includes(String(p.payment_type||'').toUpperCase())).reduce((s, p) => s + Math.max(0, Number(p.total_amount ?? p.total_cost ?? 0) - Number(p.paid_amount || 0)), 0)).toLocaleString('en-IN'), money: true, danger: true },
    ].map((m, i) => (
      <div key={i} className="bg-white px-4 py-3.5">
        <div className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">{m.label}</div>
        <div className={`font-mono text-xl font-bold tabular-nums leading-none mt-1 ${m.danger ? 'text-red-600' : 'text-ink-primary'}`}>
          {m.money && <span className={`text-sm mr-0.5 ${m.danger ? 'text-red-400' : 'text-accent-signature/70'}`}>{businessProfile?.currencySymbol || '₹'}</span>}{m.value}
          {m.suffix && <span className="text-[10px] font-bold text-gray-300 ml-1 lowercase">{m.suffix}</span>}
        </div>
      </div>
    ))}
  </div>

  {/* Search & List */}
  <div className="flex flex-col gap-4">
  {tab === 'SUPPLIERS' && (
  <div className="relative w-full max-w-md">
  <Search size={16} strokeWidth={2.5} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
  <input
  data-testid="search-suppliers-input"
  type="text"
  className="w-full h-10 pl-10 pr-4 bg-white border border-black/10 rounded-xl text-[13px] font-semibold text-ink-primary outline-none focus:border-accent-signature/70 focus:ring-2 focus:ring-accent-signature/20 transition-all placeholder:text-gray-400"
  placeholder="Search suppliers or contacts…"
  value={searchTerm}
  onChange={e => setSearchTerm(e.target.value)}
  />
  </div>
  )}

  {tab === 'PAYMENTS' ? (
   <PaymentsView payments={supplierPayments} suppliers={suppliers} purchases={purchases} cur={businessProfile?.currencySymbol || '₹'} />
  ) : (
 /* Dense supplier ledger list */
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
 className="grid grid-cols-2 md:grid-cols-[1fr_7rem_7rem_6rem_5rem] gap-x-4 gap-y-2 px-5 py-3 items-center hover:bg-accent-signature/5 transition-colors cursor-pointer group"
 >
 {/* Supplier identity */}
 <div className="flex items-center gap-3 min-w-0 col-span-2 md:col-span-1">
 <div className="w-9 h-9 shrink-0 rounded-lg bg-accent-signature/10 border border-accent-signature/25 text-accent-signature flex items-center justify-center font-mono font-bold text-[12px]">
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
 <button onClick={goLedger} title="View transactions" className="p-1.5 rounded-lg hover:bg-accent-signature/10 text-accent-signature transition-colors">
 <ArrowUpRight size={15} />
 </button>
 </div>
 </div>
 );
})}
 </div>
 </div>
 )}
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
 <input required type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="ACME..." value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value})} />
 </div>

 <div>
 <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Contact (Optional)</label>
 <input type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="NAME..." value={formData.contact_person} onChange={e => setFormData({ ...formData, contact_person: e.target.value})} />
 </div>

 <div>
 <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Phone (Optional)</label>
 <input type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="+91..." value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value})} />
 </div>

 <div className="md:col-span-2">
 <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Email (Optional)</label>
 <input type="email" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="orders@partner.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value})} />
 </div>

 <div className="md:col-span-2">
 <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Address</label>
 <textarea rows={2} className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all resize-none placeholder:text-gray-400 placeholder:font-normal" placeholder="123 MAIN ST..." value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value})} />
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
              <input required type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="ACME..." value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value})} />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Contact (Optional)</label>
              <input type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="NAME..." value={formData.contact_person} onChange={e => setFormData({ ...formData, contact_person: e.target.value})} />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Phone (Optional)</label>
              <input type="text" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="+91..." value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value})} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Email (Optional)</label>
              <input type="email" className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all placeholder:text-gray-400 placeholder:font-normal" placeholder="orders@partner.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value})} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Address</label>
              <textarea rows={2} className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all resize-none placeholder:text-gray-400 placeholder:font-normal" placeholder="123 MAIN ST..." value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value})} />
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
