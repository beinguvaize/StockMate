import React, { useState, useMemo, useEffect} from 'react';
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
  TrendingUp, AlertCircle, Users, BarChart3, Receipt, History
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
  }, [currentTenantId]);
 const [activeTab, setActiveTab] = useState('DIRECTORY'); // DIRECTORY, AGING, PAYMENTS, STATEMENTS
 const [searchTerm, setSearchTerm] = useState('');
 const [statusFilter, setStatusFilter] = useState('ALL');
 const [isAdding, setIsAdding] = useState(false);
 const [editingClient, setEditingClient] = useState(null);
 const EMPTY_FORM = { name: '', contact: '', phone: '', email: '', address: '', gstin: '', state: '', state_code: '', status: 'ACTIVE', client_type: 'B2C', price_tier: 'RETAIL', credit_days: 0 };
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

 {/* Client Form Modal */}
 {isAdding && (
 <div className="modal-overlay">
 <div className="glass-modal flex flex-col max-h-[90vh]">
 <div className="flex justify-between items-start mb-5 shrink-0">
 <div>
 <h2 className="text-3xl font-semibold text-ink-primary leading-none mb-2">
 {editingClient ? 'EDIT CLIENT.' : 'NEW CLIENT.'}
 </h2>
 <p className="text-[10px] font-semibold text-[#4b5563] opacity-80">
 REGISTER BUSINESS OUTLET DETAILS
 </p>
 </div>
 <button
 onClick={() => { setIsAdding(false); setEditingClient(null);}}
 className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary"
 >
 <X size={18} />
 </button>
 </div>

 <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
 <div className="overflow-y-auto flex-1 space-y-5 pr-1">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="md:col-span-2">
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Business Name</label>
 <input 
 required 
 type="text" 
 placeholder="BUSINESS ENTITY NAME..."
 className="w-full bg-canvas border-none rounded-lg p-5 font-medium text-sm text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all" 
 value={formData.name} 
 onChange={e => setFormData({...formData, name: e.target.value})} 
 />
 </div>
 
  <div>
  <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Primary Contact (Optional)</label>
  <input 
  type="text" 
  className="w-full bg-canvas border-none rounded-lg p-5 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all" 
  placeholder="PERSONNEL NAME..."
  value={formData.contact} 
  onChange={e => setFormData({...formData, contact: e.target.value})} 
  />
  </div>

  <div>
  <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Phone Number (Optional)</label>
  <input 
  type="text" 
  className="w-full bg-canvas border-none rounded-lg p-5 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all tabular-nums" 
  placeholder="+1 (000) 000-0000"
  value={formData.phone} 
  onChange={e => setFormData({...formData, phone: e.target.value})} 
  />
  </div>

  <div className="md:col-span-2">
    <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Email Address (Optional)</label>
    <input type="email" className="w-full bg-canvas border-none rounded-lg p-5 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all"
      placeholder="orders@client.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
  </div>

  <div className="md:col-span-2">
    <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Address (Optional)</label>
    <input type="text" className="w-full bg-canvas border-none rounded-lg p-5 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all"
      placeholder="Shop / Street / City..." value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
  </div>

  {/* GST Compliance — Optional */}
  <div className="md:col-span-2">
    <div className="border-t border-black/5 pt-4 mb-2">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">GST Compliance (Optional)</span>
    </div>
  </div>

  <div className="md:col-span-2">
    <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">GSTIN</label>
    <input type="text" maxLength={15} className="w-full bg-canvas border-none rounded-lg p-5 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase tracking-widest"
      placeholder="22AAAAA0000A1Z5" value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value.toUpperCase()})} />
  </div>

  <div>
    <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">State</label>
    <input type="text" className="w-full bg-canvas border-none rounded-lg p-5 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all"
      placeholder="Tamil Nadu" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} />
  </div>

  <div>
    <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">State Code</label>
    <input type="text" maxLength={2} className="w-full bg-canvas border-none rounded-lg p-5 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all tabular-nums"
      placeholder="33" value={formData.state_code} onChange={e => setFormData({...formData, state_code: e.target.value})} />
  </div>

  {/* B2B / B2C Classification */}
  <div className="md:col-span-2">
    <div className="border-t border-black/5 pt-4 mb-2">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Account Classification</span>
    </div>
  </div>

  {/* Client type toggle */}
  <div className="md:col-span-2">
    <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-2">Account Type</label>
    <div className="flex gap-2">
      {[
        { val: 'B2C', label: 'B2C — Consumer',   desc: 'Walk-in / retail customer' },
        { val: 'B2B', label: 'B2B — Business',   desc: 'Company / distributor account' },
      ].map(opt => (
        <button
          key={opt.val}
          type="button"
          onClick={() => setFormData({ ...formData, client_type: opt.val })}
          className={`flex-1 px-4 py-3 rounded-xl border-2 text-left transition-all ${
            formData.client_type === opt.val
              ? 'border-ink-primary bg-ink-primary text-surface'
              : 'border-black/10 bg-canvas text-ink-primary hover:border-black/20'
          }`}
        >
          <div className="text-[11px] font-black">{opt.label}</div>
          <div className={`text-[9px] mt-0.5 ${formData.client_type === opt.val ? 'text-surface/60' : 'text-gray-400'}`}>{opt.desc}</div>
        </button>
      ))}
    </div>
  </div>

  {/* Price tier */}
  <div>
    <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Price Tier</label>
    <select
      className="w-full bg-canvas border-none rounded-lg p-4 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all appearance-none"
      value={formData.price_tier}
      onChange={e => setFormData({ ...formData, price_tier: e.target.value })}
    >
      <option value="RETAIL">RETAIL — Standard pricing</option>
      <option value="WHOLESALE">WHOLESALE — Volume pricing</option>
      <option value="DISTRIBUTOR">DISTRIBUTOR — Trade pricing</option>
    </select>
  </div>

  {/* Credit days (only relevant for B2B) */}
  <div>
    <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">
      Credit Days <span className="text-gray-400 font-normal">(0 = cash)</span>
    </label>
    <select
      className="w-full bg-canvas border-none rounded-lg p-4 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all appearance-none"
      value={formData.credit_days}
      onChange={e => setFormData({ ...formData, credit_days: Number(e.target.value) })}
    >
      {[0, 7, 15, 30, 45, 60, 90].map(d => (
        <option key={d} value={d}>{d === 0 ? 'Cash on delivery' : `Net ${d}`}</option>
      ))}
    </select>
  </div>
 </div>

 {formError && (
   <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">
     {formError}
   </div>
 )}
 </div>{/* end scrollable */}
 <div className="grid grid-cols-2 gap-4 pt-4 shrink-0 border-t border-black/5 mt-4">
   <button type="button" disabled={saving} className="px-8 py-2 rounded-pill border border-black/10 font-semibold text-ink-primary text-xs hover:bg-black/5 transition-all cursor-pointer" onClick={() => { setIsAdding(false); setEditingClient(null); setFormError(''); }}>Cancel</button>
   <button type="submit" disabled={saving} className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill disabled:opacity-60 disabled:cursor-not-allowed">
     {saving ? 'SAVING...' : (editingClient ? 'SAVE CHANGES' : 'ADD CLIENT')}
     {!saving && <div className="icon-nest !w-10 !h-10 ml-4"><Save size={22} /></div>}
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
