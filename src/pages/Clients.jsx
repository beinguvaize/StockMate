import React, { useState, useMemo, useEffect} from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { usePeople } from '../hooks/usePeople';
import { useSales } from '../hooks/useSales';
import { useFinance } from '../hooks/useFinance';
import { formatDate } from '../lib/utils';
import { supabase } from '../lib/supabase';

import {
  UserCircle, Plus, DollarSign, Building, Phone, MapPin,
  Edit3, Trash2, X, Check, Save, UserCheck, CreditCard,
  ChevronRight, ExternalLink, ShieldCheck, Mail, Search,
  TrendingUp, AlertCircle, Users, BarChart3, Receipt, History,
  ChevronLeft, Building2, Tag, Hash, Loader2
} from 'lucide-react';
import ClientDirectory from '../components/clients/ClientDirectory';
import ClientAging from '../components/clients/ClientAging';
import ClientPayments from '../components/clients/ClientPayments';

const Clients = () => {
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { 
    clients, addClient, updateClient, deleteClient 
  } = usePeople(currentTenantId);
  const { sales } = useSales(currentTenantId);
  const [clientPayments, setClientPayments] = useState([]);
  const [clientDeliveries, setClientDeliveries] = useState([]);

  useEffect(() => {
    if (!currentTenantId) return;
    supabase
      .from('client_payments')
      .select('*')
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) console.error('clientPayments fetch error:', error);
        else if (data) setClientPayments(data);
      });

    supabase
      .from('invoices')
      .select('id, client_id, delivery_status, delivery_date, delivery_address, delivery_zone')
      .eq('tenant_id', currentTenantId)
      .eq('delivery_required', true)
      .in('delivery_status', ['PENDING', 'IN_TRANSIT'])
      .then(({ data }) => { if (data) setClientDeliveries(data); });
  }, [currentTenantId]);
 const [activeTab, setActiveTab] = useState('DIRECTORY'); // DIRECTORY, AGING, PAYMENTS, STATEMENTS
 const [searchTerm, setSearchTerm] = useState('');
 const [statusFilter, setStatusFilter] = useState('ALL');
 const [isAdding, setIsAdding] = useState(false);
 const [editingClient, setEditingClient] = useState(null);
 const INDIAN_STATES = [
   { name: 'Jammu & Kashmir', code: '01' }, { name: 'Himachal Pradesh', code: '02' },
   { name: 'Punjab', code: '03' }, { name: 'Chandigarh', code: '04' },
   { name: 'Uttarakhand', code: '05' }, { name: 'Haryana', code: '06' },
   { name: 'Delhi', code: '07' }, { name: 'Rajasthan', code: '08' },
   { name: 'Uttar Pradesh', code: '09' }, { name: 'Bihar', code: '10' },
   { name: 'Sikkim', code: '11' }, { name: 'Arunachal Pradesh', code: '12' },
   { name: 'Nagaland', code: '13' }, { name: 'Manipur', code: '14' },
   { name: 'Mizoram', code: '15' }, { name: 'Tripura', code: '16' },
   { name: 'Meghalaya', code: '17' }, { name: 'Assam', code: '18' },
   { name: 'West Bengal', code: '19' }, { name: 'Jharkhand', code: '20' },
   { name: 'Odisha', code: '21' }, { name: 'Chhattisgarh', code: '22' },
   { name: 'Madhya Pradesh', code: '23' }, { name: 'Gujarat', code: '24' },
   { name: 'Dadra & Nagar Haveli and Daman & Diu', code: '26' },
   { name: 'Maharashtra', code: '27' }, { name: 'Karnataka', code: '29' },
   { name: 'Goa', code: '30' }, { name: 'Lakshadweep', code: '31' },
   { name: 'Kerala', code: '32' }, { name: 'Tamil Nadu', code: '33' },
   { name: 'Puducherry', code: '34' }, { name: 'Andaman & Nicobar Islands', code: '35' },
   { name: 'Telangana', code: '36' }, { name: 'Andhra Pradesh', code: '37' },
   { name: 'Ladakh', code: '38' }, { name: 'Other Territory', code: '97' },
 ];
 const EMPTY_FORM = { name: '', contact: '', phone: '', email: '', address: '', gstin: '', state: '', state_code: '', pin_code: '', status: 'ACTIVE', client_type: 'B2C', price_tier: 'RETAIL', credit_days: 0 };
 const [formData, setFormData] = useState(EMPTY_FORM);
 const [deleteConfirm, setDeleteConfirm] = useState(null);
 const [saving, setSaving] = useState(false);
 const [formError, setFormError] = useState('');
 

 // Statement State
 useEffect(() => {
 if (isAdding) {
 document.body.style.overflow = 'hidden';
} else {
 document.body.style.overflow = 'unset';
}
 return () => { document.body.style.overflow = 'unset';};
}, [isAdding]);

 const clientStats = useMemo(() => {
 const stats = {};
 (clients || []).forEach(s => stats[s.id] = { totalSales: 0, orderCount: 0});

 (sales || []).forEach(sale => {
 if (stats[sale.clientId]) {
 stats[sale.clientId].totalSales += sale.totalAmount;
 stats[sale.clientId].orderCount += 1;
}
});
 return stats;
}, [sales, clients]);

  const topMetrics = useMemo(() => {
    let topDebtor = { name: 'None', amount: 0};
    let topPerformer = { name: 'None', amount: 0};
    let totalReceivables = 0;
    let pendingCollections = 0;

    (clients || []).forEach(client => {
      const stats = clientStats[client.id];
      const balance = client.outstanding_balance || 0;
      
      totalReceivables += balance;
      if (balance > 0) pendingCollections += 1;

      if (balance > topDebtor.amount) {
        topDebtor = { name: client.name, amount: balance};
      }
      if (stats && stats.totalSales > topPerformer.amount) {
        topPerformer = { name: client.name, amount: stats.totalSales};
      }
    });

    return { topDebtor, topPerformer, totalReceivables, pendingCollections};
  }, [clients, clientStats]);

 const filteredClients = useMemo(() => {
 return (clients || []).filter(client => {
 const matchesSearch = (client.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
 (client.contact || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
 String(client.id || '').toLowerCase().includes(searchTerm.toLowerCase());
 
 const matchesStatus = statusFilter === 'ALL' || client.status === statusFilter;
 
 return matchesSearch && matchesStatus;
});
}, [clients, searchTerm, statusFilter]);


 const openAdd = () => {
 setEditingClient(null);
 setFormData(EMPTY_FORM);
 setFormError('');
 setIsAdding(true);
};

 const openEdit = (client) => {
 setEditingClient(client);
 setFormData({
   name:        client.name        || '',
   contact:     client.contact     || '',
   phone:       client.phone       || '',
   email:       client.email       || '',
   address:     client.address     || '',
   gstin:       client.gstin       || '',
   state:       client.state       || '',
   state_code:  client.state_code  || '',
   pin_code:    client.pin_code    || '',
   status:      client.status      || 'ACTIVE',
   client_type: client.client_type || 'B2C',
   price_tier:  client.price_tier  || 'RETAIL',
   credit_days: client.credit_days ?? 0,
 });
 setIsAdding(true);
};

 const handleSubmit = async (e) => {
   e.preventDefault();
   setFormError('');
   if (!formData.name.trim() || formData.name.trim().length < 2) {
     setFormError('Business name must be at least 2 characters.');
     return;
   }
   setSaving(true);
   try {
     const data = { ...formData };
     const timeoutPromise = new Promise((_, reject) =>
       setTimeout(() => reject(new Error('Request timed out. Check your connection.')), 15000)
     );
     const savePromise = editingClient
       ? updateClient({ ...editingClient, ...data })
       : addClient(data);
     const { error } = await Promise.race([savePromise, timeoutPromise]);
     if (error) {
       setFormError(error.message || 'Failed to save client. Please try again.');
       return;
     }
     setIsAdding(false);
     setEditingClient(null);
     setFormData(EMPTY_FORM);
   } catch (err) {
     setFormError(err.message || 'An unexpected error occurred.');
   } finally {
     setSaving(false);
   }
 };

 const toggleStatus = (client) => {
 const newStatus = client.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
 updateClient({ ...client, status: newStatus});
};

 const handleDelete = (clientId) => {
 deleteClient(clientId);
 setDeleteConfirm(null);
};

 return (
 <>
 <div className="animate-fade-in flex flex-col gap-4 pb-12">
 {/* Header Section */}
 <div className="flex justify-between items-center py-2 border-b border-black/5">
 <div className="flex items-center gap-3">
 <h1 className="text-xl font-black font-sora text-ink-primary leading-none">Clients<span className="text-accent-signature">.</span></h1>
 <span className="text-[10px] font-semibold text-gray-400 hidden sm:block">Customer network & accounts</span>
 </div>

 {/* Tab Navigation */}
 <div className="flex bg-canvas border border-black/5 rounded-lg p-1 shadow-sm overflow-x-auto no-scrollbar">
 {[
 { id: 'DIRECTORY', label: 'Directory', icon: <Users size={14} />},
 { id: 'AGING', label: 'Aging Report', icon: <History size={14} />},
 { id: 'PAYMENTS', label: 'Payment History', icon: <CreditCard size={14} />},
 ].map(tab => (
 <button
 key={tab.id}
 onClick={() => setActiveTab(tab.id)}
 className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-semibold transition-all whitespace-nowrap ${
 activeTab === tab.id 
 ? 'bg-ink-primary text-accent-signature shadow-premium' 
 : 'text-gray-700 hover:bg-black/5'
}`}
 >
 {tab.icon}
 {tab.label}
 </button>
 ))}
 </div>
 </div>

 {/* Sub-Module Content */}
 <div className="min-h-[500px]">
  {activeTab === 'DIRECTORY' && (
    <ClientDirectory
      filteredClients={filteredClients}
      clientStats={clientStats}
      topMetrics={topMetrics}
      businessProfile={businessProfile}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      openAdd={openAdd}
      openEdit={openEdit}
      toggleStatus={toggleStatus}
      handleDelete={handleDelete}
      hasPermission={hasPermission}
      clientDeliveries={clientDeliveries}
    />
  )}

 {activeTab === 'AGING' && (
 <ClientAging 
 clients={clients}
 sales={sales}
 clientPayments={clientPayments}
 businessProfile={businessProfile}
 />
 )}

 {activeTab === 'PAYMENTS' && (
 <ClientPayments 
 clientPayments={clientPayments}
 clients={clients}
 businessProfile={businessProfile}
 />
 )}

 </div>
 </div>

 {/* Client Form — Full-page portal */}
 {isAdding && createPortal(
   <div className="fixed inset-0 z-50 flex flex-col bg-canvas animate-fade-in">

     {/* ── Top bar ── */}
     <div className="flex items-center gap-4 px-6 py-4 border-b border-black/5 bg-white shrink-0">
       <button
         type="button"
         onClick={() => { setIsAdding(false); setEditingClient(null); setFormError(''); }}
         className="w-9 h-9 flex items-center justify-center rounded-full border border-black/8 hover:bg-canvas transition-all text-ink-primary shrink-0"
       >
         <ChevronLeft size={18} />
       </button>
       <div className="min-w-0 flex-1">
         <h1 className="text-lg font-black text-ink-primary leading-tight">
           {editingClient ? 'Edit Client' : 'New Client'}<span className="text-accent-signature">.</span>
         </h1>
         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
           {editingClient ? `Editing — ${editingClient.name}` : 'Register a new business account'}
         </p>
       </div>
       <button
         type="button"
         onClick={() => { setIsAdding(false); setEditingClient(null); setFormError(''); }}
         className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-all text-gray-400 shrink-0"
       >
         <X size={16} />
       </button>
     </div>

     {/* ── Body ── */}
     <div className="flex-1 overflow-y-auto">
       <form onSubmit={handleSubmit} id="client-form">
         <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

           {/* ── LEFT: form sections ── */}
           <div className="lg:col-span-2 space-y-5">

             {/* Section 1 — Basic Info */}
             <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
               <div className="px-5 py-3.5 border-b border-black/5 flex items-center gap-2">
                 <UserCircle size={14} className="text-accent-signature" />
                 <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Basic Information</span>
               </div>
               <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="sm:col-span-2">
                   <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Business / Client Name <span className="text-accent-signature">*</span></label>
                   <input
                     required
                     autoFocus
                     type="text"
                     placeholder="e.g. Sunrise Traders Pvt Ltd"
                     className="w-full bg-canvas rounded-xl px-4 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all border border-black/5 focus:border-accent-signature/30"
                     value={formData.name}
                     onChange={e => setFormData({...formData, name: e.target.value})}
                   />
                 </div>
                 <div>
                   <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Contact Person</label>
                   <input
                     type="text"
                     placeholder="e.g. Ramesh Kumar"
                     className="w-full bg-canvas rounded-xl px-4 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all border border-black/5 focus:border-accent-signature/30"
                     value={formData.contact}
                     onChange={e => setFormData({...formData, contact: e.target.value})}
                   />
                 </div>
                 <div>
                   <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number</label>
                   <input
                     type="tel"
                     placeholder="9876543210"
                     className="w-full bg-canvas rounded-xl px-4 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all border border-black/5 focus:border-accent-signature/30 tabular-nums"
                     value={formData.phone}
                     onChange={e => setFormData({...formData, phone: e.target.value})}
                   />
                 </div>
                 <div className="sm:col-span-2">
                   <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                   <input
                     type="email"
                     placeholder="billing@client.com"
                     className="w-full bg-canvas rounded-xl px-4 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all border border-black/5 focus:border-accent-signature/30"
                     value={formData.email}
                     onChange={e => setFormData({...formData, email: e.target.value})}
                   />
                 </div>
                 <div className="sm:col-span-2">
                   <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Address</label>
                   <input
                     type="text"
                     placeholder="Shop / Street / Area / City"
                     className="w-full bg-canvas rounded-xl px-4 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all border border-black/5 focus:border-accent-signature/30"
                     value={formData.address}
                     onChange={e => setFormData({...formData, address: e.target.value})}
                   />
                 </div>
               </div>
             </div>

             {/* Section 2 — Location */}
             <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
               <div className="px-5 py-3.5 border-b border-black/5 flex items-center gap-2">
                 <MapPin size={14} className="text-accent-signature" />
                 <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Location</span>
               </div>
               <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">State</label>
                   <select
                     className="w-full bg-canvas rounded-xl px-4 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all border border-black/5 focus:border-accent-signature/30 appearance-none"
                     value={formData.state}
                     onChange={e => {
                       const sel = INDIAN_STATES.find(s => s.name === e.target.value);
                       setFormData({ ...formData, state: e.target.value, state_code: sel ? sel.code : formData.state_code });
                     }}
                   >
                     <option value="">— Select State —</option>
                     {INDIAN_STATES.map(s => (
                       <option key={s.code} value={s.name}>{s.name}</option>
                     ))}
                   </select>
                 </div>
                 <div>
                   <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Postal / PIN Code</label>
                   <input
                     type="text"
                     maxLength={6}
                     placeholder="600001"
                     className="w-full bg-canvas rounded-xl px-4 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all border border-black/5 focus:border-accent-signature/30 tabular-nums"
                     value={formData.pin_code}
                     onChange={e => setFormData({...formData, pin_code: e.target.value})}
                   />
                 </div>
               </div>
             </div>

             {/* Section 3 — GST */}
             <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
               <div className="px-5 py-3.5 border-b border-black/5 flex items-center gap-2">
                 <ShieldCheck size={14} className="text-accent-signature" />
                 <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">GST Details</span>
                 <span className="ml-auto text-[9px] font-semibold text-gray-400">Optional</span>
               </div>
               <div className="p-5">
                 <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">GSTIN</label>
                 <input
                   type="text"
                   maxLength={15}
                   placeholder="22AAAAA0000A1Z5"
                   className="w-full bg-canvas rounded-xl px-4 py-3 text-sm font-black text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all border border-black/5 focus:border-accent-signature/30 uppercase tracking-widest"
                   value={formData.gstin}
                   onChange={e => setFormData({...formData, gstin: e.target.value.toUpperCase()})}
                 />
               </div>
             </div>

             {/* Section 4 — Account Classification */}
             <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
               <div className="px-5 py-3.5 border-b border-black/5 flex items-center gap-2">
                 <Tag size={14} className="text-accent-signature" />
                 <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Account Classification</span>
               </div>
               <div className="p-5 space-y-4">
                 {/* B2B / B2C */}
                 <div>
                   <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Account Type</label>
                   <div className="grid grid-cols-2 gap-3">
                     {[
                       { val: 'B2C', label: 'B2C — Consumer', desc: 'Walk-in / retail customer', icon: '🛒' },
                       { val: 'B2B', label: 'B2B — Business', desc: 'Company / distributor', icon: '🏢' },
                     ].map(opt => (
                       <button
                         key={opt.val}
                         type="button"
                         onClick={() => setFormData({ ...formData, client_type: opt.val })}
                         className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                           formData.client_type === opt.val
                             ? 'border-ink-primary bg-ink-primary'
                             : 'border-black/8 bg-canvas hover:border-black/20'
                         }`}
                       >
                         <span className="text-lg leading-none mt-0.5">{opt.icon}</span>
                         <div>
                           <div className={`text-xs font-black ${formData.client_type === opt.val ? 'text-accent-signature' : 'text-ink-primary'}`}>{opt.label}</div>
                           <div className={`text-[9px] mt-0.5 ${formData.client_type === opt.val ? 'text-white/50' : 'text-gray-400'}`}>{opt.desc}</div>
                         </div>
                       </button>
                     ))}
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Price Tier</label>
                     <select
                       className="w-full bg-canvas rounded-xl px-4 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all border border-black/5 focus:border-accent-signature/30 appearance-none"
                       value={formData.price_tier}
                       onChange={e => setFormData({ ...formData, price_tier: e.target.value })}
                     >
                       <option value="RETAIL">Retail — Standard</option>
                       <option value="WHOLESALE">Wholesale — Volume</option>
                       <option value="DISTRIBUTOR">Distributor — Trade</option>
                     </select>
                   </div>
                   <div>
                     <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Credit Terms</label>
                     <select
                       className="w-full bg-canvas rounded-xl px-4 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all border border-black/5 focus:border-accent-signature/30 appearance-none"
                       value={formData.credit_days}
                       onChange={e => setFormData({ ...formData, credit_days: Number(e.target.value) })}
                     >
                       {[0, 7, 15, 30, 45, 60, 90].map(d => (
                         <option key={d} value={d}>{d === 0 ? 'Cash on delivery' : `Net ${d} days`}</option>
                       ))}
                     </select>
                   </div>
                 </div>
               </div>
             </div>

             {formError && (
               <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">
                 <AlertCircle size={15} className="shrink-0" />
                 {formError}
               </div>
             )}
           </div>

           {/* ── RIGHT: live preview card + save ── */}
           <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
             {/* Preview card */}
             <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
               <div className="px-5 py-3.5 border-b border-black/5">
                 <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Preview</span>
               </div>
               <div className="p-5 space-y-4">
                 {/* Avatar + name */}
                 <div className="flex items-center gap-3">
                   <div className="w-12 h-12 rounded-2xl bg-accent-signature/10 border border-accent-signature/20 flex items-center justify-center text-xl font-black text-ink-primary shrink-0">
                     {formData.name ? formData.name.charAt(0).toUpperCase() : '?'}
                   </div>
                   <div className="min-w-0">
                     <div className="text-sm font-black text-ink-primary truncate">{formData.name || <span className="text-gray-300 font-medium">Client name</span>}</div>
                     <div className="text-[10px] text-gray-400 mt-0.5">{formData.contact || <span className="text-gray-300">Contact person</span>}</div>
                   </div>
                 </div>

                 <div className="space-y-2">
                   {formData.phone && (
                     <div className="flex items-center gap-2 text-xs text-gray-600">
                       <Phone size={11} className="text-gray-400 shrink-0" />
                       <span className="tabular-nums">{formData.phone}</span>
                     </div>
                   )}
                   {formData.email && (
                     <div className="flex items-center gap-2 text-xs text-gray-600">
                       <Mail size={11} className="text-gray-400 shrink-0" />
                       <span className="truncate">{formData.email}</span>
                     </div>
                   )}
                   {formData.address && (
                     <div className="flex items-center gap-2 text-xs text-gray-600">
                       <MapPin size={11} className="text-gray-400 shrink-0" />
                       <span className="truncate">{formData.address}</span>
                     </div>
                   )}
                   {formData.state && (
                     <div className="flex items-center gap-2 text-xs text-gray-600">
                       <Building2 size={11} className="text-gray-400 shrink-0" />
                       <span>{formData.state}{formData.pin_code ? ` — ${formData.pin_code}` : ''}</span>
                     </div>
                   )}
                 </div>

                 <div className="border-t border-black/5 pt-3 flex flex-wrap gap-1.5">
                   <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border ${
                     formData.client_type === 'B2B'
                       ? 'bg-blue-50 text-blue-700 border-blue-200'
                       : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                   }`}>{formData.client_type}</span>
                   <span className="px-2.5 py-1 rounded-full text-[9px] font-black bg-canvas border border-black/8 text-gray-600">{formData.price_tier}</span>
                   {formData.credit_days > 0 && (
                     <span className="px-2.5 py-1 rounded-full text-[9px] font-black bg-orange-50 border border-orange-200 text-orange-700">Net {formData.credit_days}</span>
                   )}
                   {formData.gstin && (
                     <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black bg-purple-50 border border-purple-200 text-purple-700">
                       <ShieldCheck size={8} /> GST
                     </span>
                   )}
                 </div>
               </div>
             </div>

             {/* Save / Cancel */}
             <button
               type="submit"
               form="client-form"
               disabled={saving}
               className="w-full btn-signature !h-14 !text-sm flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
             >
               {saving
                 ? <><Loader2 size={18} className="animate-spin" /> Saving…</>
                 : <>{editingClient ? 'Save Changes' : 'Add Client'}<div className="icon-nest !w-9 !h-9 ml-2"><Save size={18} /></div></>
               }
             </button>
             <button
               type="button"
               onClick={() => { setIsAdding(false); setEditingClient(null); setFormError(''); }}
               className="w-full py-3 rounded-xl border border-black/10 text-xs font-semibold text-gray-500 hover:bg-black/5 transition-all"
             >
               Cancel
             </button>
           </div>

         </div>
       </form>
     </div>
   </div>,
   document.body
 )}

 </>
 );
};

export default Clients;
