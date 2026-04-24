import React, { useState, useMemo, useEffect} from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { usePeople } from '../hooks/usePeople';
import { useSales } from '../hooks/useSales';
import { useFinance } from '../hooks/useFinance';
import { formatDate } from '../lib/utils';

import { 
  UserCircle, Plus, DollarSign, Building, Phone, MapPin, 
  Edit3, Trash2, X, Check, Save, UserCheck, CreditCard, 
  ChevronRight, ExternalLink, ShieldCheck, Mail, Search,
  TrendingUp, AlertCircle, Users, BarChart3, Receipt, History
} from 'lucide-react';
import ClientDirectory from '../components/clients/ClientDirectory';
import ClientAging from '../components/clients/ClientAging';
import ClientPayments from '../components/clients/ClientPayments';
import ClientStatementViewer from '../components/clients/ClientStatementViewer';

const Clients = () => {
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { 
    clients, addClient, updateClient, deleteClient 
  } = usePeople(currentTenantId);
  const { sales } = useSales(currentTenantId);
  const { clientPayments } = { clientPayments: [] }; // Placeholder for now
 const [activeTab, setActiveTab] = useState('DIRECTORY'); // DIRECTORY, AGING, PAYMENTS, STATEMENTS
 const [searchTerm, setSearchTerm] = useState('');
 const [statusFilter, setStatusFilter] = useState('ALL');
 const [isAdding, setIsAdding] = useState(false);
 const [editingClient, setEditingClient] = useState(null);
 const [formData, setFormData] = useState({ name: '', contact: '', phone: '', email: '', address: '', gstin: '', state: '', state_code: '', status: 'ACTIVE' });
 const [deleteConfirm, setDeleteConfirm] = useState(null);
 const [saving, setSaving] = useState(false);
 const [formError, setFormError] = useState('');
 

 // Statement State
 const [selectedClientForStatement, setSelectedClientForStatement] = useState(null);

 useEffect(() => {
 if (isAdding || selectedClientForStatement) {
 document.body.style.overflow = 'hidden';
} else {
 document.body.style.overflow = 'unset';
}
 return () => { document.body.style.overflow = 'unset';};
}, [isAdding, selectedClientForStatement]);


 const getClientStatement = (clientId) => {
 const clientSales = (sales || [])
 .filter(s => s.clientId === clientId && (s.paymentMethod === 'credit' || s.paymentMethod === 'CREDIT'))
 .map(s => ({
 id: s.id,
 date: s.date,
 type: 'SALE',
 description: `Credit Sale #${s.id.split('-').pop()}`,
 debit: s.totalAmount, // Increases outstanding balance
 credit: 0
}));
 
 const payments = (clientPayments || [])
 .filter(p => p.client_id === clientId)
 .map(p => ({
 id: p.id,
 date: p.date,
 type: 'PAYMENT',
 description: p.notes ? `Payment: ${p.notes}` : 'Payment Received',
 debit: 0,
 credit: p.amount // Decreases outstanding balance
}));

 const combined = [...clientSales, ...payments].sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
 
 let runningBalance = 0;
 return combined.map(txn => {
 runningBalance += txn.debit;
 runningBalance -= txn.credit;
 return { ...txn, balance: runningBalance};
});
};

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
 const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
 client.contact?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 client.id.toLowerCase().includes(searchTerm.toLowerCase());
 
 const matchesStatus = statusFilter === 'ALL' || client.status === statusFilter;
 
 return matchesSearch && matchesStatus;
});
}, [clients, searchTerm, statusFilter]);


 const openAdd = () => {
 setEditingClient(null);
 setFormData({ name: '', contact: '', phone: '', email: '', address: '', gstin: '', state: '', state_code: '', status: 'ACTIVE' });
 setFormError('');
 setIsAdding(true);
};

 const openEdit = (client) => {
 setEditingClient(client);
 setFormData({
   name: client.name || '',
   contact: client.contact || '',
   phone: client.phone || '',
   email: client.email || '',
   address: client.address || '',
   gstin: client.gstin || '',
   state: client.state || '',
   state_code: client.state_code || '',
   status: client.status || 'ACTIVE',
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
   const data = { ...formData };
   const { error } = editingClient
     ? await updateClient({ ...editingClient, ...data })
     : await addClient(data);
   setSaving(false);
   if (error) {
     setFormError(error.message || 'Failed to save client. Please try again.');
     return;
   }
   setIsAdding(false);
   setEditingClient(null);
   setFormData({ name: '', contact: '', phone: '', email: '', address: '', gstin: '', state: '', state_code: '', status: 'ACTIVE' });
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
 <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-2">
 <div>
 <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">CLIENTS<span className="text-accent-signature">.</span></h1>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">CUSTOMER NETWORK & ACCOUNTS</p>
 </div>
 
 {/* Tab Navigation */}
 <div className="flex bg-canvas border border-black/5 rounded-lg p-1 shadow-sm w-full md:w-auto overflow-x-auto no-scrollbar">
 {[
 { id: 'DIRECTORY', label: 'Directory', icon: <Users size={14} />},
 { id: 'AGING', label: 'Aging Report', icon: <History size={14} />},
 { id: 'PAYMENTS', label: 'Payment History', icon: <CreditCard size={14} />},
 { id: 'STATEMENTS', label: 'Statements', icon: <Receipt size={14} />}
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

 {activeTab === 'STATEMENTS' && (
 <div className="animate-in fade-in slide-in-from-right-4 duration-500">
 {!selectedClientForStatement ? (
 <div className="glass-panel !py-22 rounded-[3rem] text-center border-dashed border-2">
 <Receipt size={64} className="mx-auto mb-6 opacity-10" />
 <h3 className="text-3xl font-semibold mb-4">Select a Client</h3>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">Choose a customer from the directory to view their detailed transaction statement.</p>
 <button 
 onClick={() => setActiveTab('DIRECTORY')}
 className="btn-signature !px-10 !h-14 !rounded-pill"
 >
 OPEN DIRECTORY
 </button>
 </div>
 ) : (
 <ClientStatementViewer 
 client={selectedClientForStatement}
 clientStats={clientStats}
 businessProfile={businessProfile}
 getClientStatement={getClientStatement}
 onClose={() => setSelectedClientForStatement(null)}
 />
 )}
 </div>
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

 {/* Client Statement Modal */}
 {selectedClientForStatement && (
 <div className="modal-overlay z-40">
 <div className="glass-modal max-w-2xl w-full mx-auto max-h-[85vh] flex flex-col">
 <div className="flex justify-between items-start mb-6 shrink-0">
 <div>
 <h2 className="text-3xl font-semibold text-ink-primary leading-none mb-2">CLIENT STATEMENT.</h2>
 <p className="text-[10px] font-semibold text-[#4b5563] opacity-80">{selectedClientForStatement.name}</p>
 </div>
 <button
 onClick={() => setSelectedClientForStatement(null)}
 className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary"
 >
 <X size={18} />
 </button>
 </div>
 
 <div className="grid grid-cols-2 gap-4 mb-6 shrink-0">
 <div className="p-4 bg-canvas border border-black/5 rounded-lg flex flex-col">
 <span className="text-[9px] font-semibold text-[#4b5563] mb-1">Current Outstanding</span>
 <span className={`text-3xl font-semibold font-mono tabular-nums leading-none ${(selectedClientForStatement.outstanding_balance || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>
 {businessProfile?.currencySymbol || '₹'}{Math.round(selectedClientForStatement.outstanding_balance || 0).toLocaleString()}
 </span>
 </div>
 <div className="p-4 bg-canvas border border-black/5 rounded-lg flex flex-col">
 <span className="text-[9px] font-semibold text-[#4b5563] mb-1">Total Lifetime Sales</span>
 <span className="text-3xl font-semibold font-mono text-ink-primary tabular-nums leading-none flex items-baseline gap-2">
 {businessProfile?.currencySymbol || '₹'}{Math.round(clientStats[selectedClientForStatement.id]?.totalSales || 0).toLocaleString()}
 </span>
 </div>
 </div>

 <div className="flex-1 overflow-y-auto min-h-[300px] border border-black/10 rounded-lg bg-white">
 <table className="w-full text-left border-collapse">
 <thead className="sticky top-0 bg-canvas/90 backdrop-blur-sm z-10 border-b border-black/10">
 <tr>
 <th className="py-3 px-4 text-[9px] font-semibold text-[#4b5563]">Date</th>
 <th className="py-3 px-4 text-[9px] font-semibold text-[#4b5563]">Description</th>
 <th className="py-3 px-4 text-[9px] font-semibold text-[#4b5563] text-right">Debit (Sale)</th>
 <th className="py-3 px-4 text-[9px] font-semibold text-[#4b5563] text-right">Credit (Pay)</th>
 <th className="py-3 px-4 text-[9px] font-semibold text-[#4b5563] text-right">Balance</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/5">
 {getClientStatement(selectedClientForStatement.id).length === 0 ? (
 <tr>
 <td colSpan="5" className="py-12 text-center text-[11px] font-semibold text-gray-700">No Transactions Found</td>
 </tr>
 ) : (
 getClientStatement(selectedClientForStatement.id).map((txn, idx) => (
 <tr key={`${txn.id}-${idx}`} className="hover:bg-canvas/50 transition-colors">
 <td className="py-3 px-4">
 <span className="text-[10px] font-semibold text-ink-primary">
 {formatDate(txn.date)}
 </span>
 </td>
 <td className="py-3 px-4">
 <div className="flex items-center gap-2">
 <span className={`w-1.5 h-1.5 rounded-full ${txn.type === 'SALE' ? 'bg-red-500' : 'bg-green-500'}`}></span>
 <span className="text-[11px] font-semibold text-[#4b5563]">
 {txn.description}
 </span>
 </div>
 </td>
 <td className="py-3 px-4 text-right">
 {txn.debit > 0 ? (
 <span className="text-[11px] font-semibold font-mono text-red-500 tabular-nums">
 {businessProfile?.currencySymbol || '₹'}{Math.round(txn.debit).toLocaleString()}
 </span>
 ) : '-'}
 </td>
 <td className="py-3 px-4 text-right">
 {txn.credit > 0 ? (
 <span className="text-[11px] font-semibold font-mono text-green-500 tabular-nums">
 {businessProfile?.currencySymbol || '₹'}{Math.round(txn.credit).toLocaleString()}
 </span>
 ) : '-'}
 </td>
 <td className="py-3 px-4 text-right">
 <span className={`text-[11px] font-semibold font-mono tabular-nums ${txn.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
 {businessProfile?.currencySymbol || '₹'}{Math.round(txn.balance).toLocaleString()}
 </span>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 )}
 </>
 );
};

export default Clients;
