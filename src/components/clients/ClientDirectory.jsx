import React from 'react';
import { 
 UserCircle, Plus, Edit3, Trash2, Check, ExternalLink, 
 MapPin, Phone, AlertCircle, Search, TrendingUp, Users, CreditCard, Clock
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
 {/* Quick Stats & Controls - Deconstructed */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
 {/* Active Clients Metric */}
 <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
 <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-accent-signature">
 <Users size={40} strokeWidth={2} />
 </div>
 <div className="relative z-10 flex flex-col">
 <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Active Accounts</span>
 <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
 {filteredClients.length} <span className="text-base font-bold opacity-30 text-ink-primary tracking-normal ml-1 mb-1">Entities</span>
 </div>
 </div>
 </div>

 {/* Total Receivables Metric */}
 <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
 <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-ink-primary">
 <CreditCard size={40} strokeWidth={2} />
 </div>
 <div className="relative z-10 flex flex-col">
 <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Total Receivables</span>
 <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
 <span className="text-lg text-ink-primary/30 mr-1">{businessProfile?.currencySymbol || '₹'}</span>
 {Math.round(topMetrics.totalReceivables || 0).toLocaleString()}
 </div>
 </div>
 </div>

 {/* Top Debtors Metric */}
 <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
 <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-red-500">
 <TrendingUp size={40} strokeWidth={2} />
 </div>
 <div className="relative z-10 flex flex-col">
 <div className="text-[10px] uppercase font-bold text-gray-400 mb-1 flex items-center gap-1.5 tracking-widest"><AlertCircle size={12} className="text-red-400" /> Top Debtor Exposure</div>
 <div className="flex flex-col mt-0.5">
 <div className="text-3xl font-black text-red-500 tabular-nums tracking-tight leading-none">
 <span className="text-lg opacity-30 mr-1">{businessProfile?.currencySymbol || '₹'}</span>
 {Math.round(topMetrics.topDebtor.amount).toLocaleString()}
 </div>
 <div className="mt-2">
 <span className="text-[10px] font-bold text-ink-primary uppercase tracking-wider block opacity-70">
 {topMetrics.topDebtor.name !== "None" ? topMetrics.topDebtor.name : 'No Exposure'}
 </span>
 </div>
 </div>
 </div>
 </div>

 {/* Pending Collections Metric */}
 <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
 <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-gray-400">
 <Clock size={40} strokeWidth={2} />
 </div>
 <div className="relative z-10 flex flex-col">
 <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Pending Collections</span>
 <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
 {topMetrics.pendingCollections || 0} <span className="text-base font-bold opacity-30 text-ink-primary tracking-normal ml-1 mb-1">Accounts</span>
 </div>
 </div>
 </div>
 </div>

 {/* Interactive Utilities Row */}
 <div className="flex flex-wrap lg:flex-nowrap items-center justify-between bg-white backdrop-blur-xl border border-black/5 rounded-[2rem] shadow-sm p-2 min-h-[72px] w-full gap-2 mb-8">
 <div className="flex bg-canvas border border-black/5 rounded-pill p-1.5 shrink-0 ml-1">
 {['ALL', 'ACTIVE', 'INACTIVE'].map(f => (
 <button
 key={f}
 onClick={() => setStatusFilter(f)}
 className={`px-5 py-2 rounded-pill text-[11px] font-bold tracking-wider transition-all ${statusFilter === f ? 'bg-ink-primary text-white shadow-md' : 'text-gray-500 hover:text-ink-primary hover:bg-black/5'}`}
 >
 {f}
 </button>
 ))}
 </div>
 <div className="flex-1 flex items-center justify-end gap-3 h-full pr-1 overflow-x-auto min-w-[300px]">
 <div className="relative group w-48 lg:w-72 h-full flex items-center shrink-0">
 <Search size={16} className="absolute left-5 text-ink-primary opacity-30 group-focus-within:opacity-100 transition-opacity z-10" />
 <input 
 type="text" 
 placeholder="Search client index..." 
 className="w-full h-12 pl-12 pr-5 rounded-pill bg-canvas border border-black/5 shadow-inner text-xs font-bold text-ink-primary placeholder:text-gray-400 outline-none focus:border-black/20 focus:bg-white transition-all"
 value={searchTerm}
 onChange={e => setSearchTerm(e.target.value)}
 />
 </div>
 
 {hasPermission('clients', 'edit') && (
 <button className="btn-signature h-12 !rounded-pill !pl-6 !pr-2 !py-0 flex items-center justify-between gap-3 group transition-all duration-500 hover:shadow-accent-signature/20 shrink-0" onClick={openAdd}>
 <span className="text-[12px] font-bold tracking-wide text-ink-primary">NEW CLIENT</span>
 <div className="w-9 h-9 rounded-full bg-ink-primary shadow-lg flex items-center justify-center group-hover:scale-105 transition-transform">
 <Plus size={18} className="text-accent-signature" />
 </div>
 </button>
 )}
 </div>
 </div>

 {/* Client Ledger - Premium Grid Feed */}
 <div className="flex flex-col gap-4 min-h-[400px]">
 {filteredClients.length === 0 ? (
 <div className="bg-white p-24 rounded-[3rem] text-center border border-black/5 shadow-sm">
 <div className="flex justify-center mb-8 opacity-10">
 <UserCircle size={80} strokeWidth={1} />
 </div>
 <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">CLIENTS<span className="text-accent-signature">.</span></h1>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">CUSTOMER NETWORK & ACCOUNTS</p>
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
 {filteredClients.map(client => {
 const stats = clientStats[client.id];
 
 return (
 <div key={client.id} className="bg-white rounded-[2.5rem] border border-black/5 hover:border-black/10 hover:shadow-premium transition-all duration-300 group flex flex-col h-full overflow-hidden shadow-sm">
 {/* Premium Header: Name & ID isolated */}
 <div className="p-6 pb-5 border-b border-black/5 bg-canvas/30">
 <div className="flex justify-between items-start mb-4">
 <div className="flex items-center gap-3">
 <div className="w-12 h-12 rounded-full bg-accent-signature/20 text-ink-primary font-black text-xl flex items-center justify-center border border-accent-signature/30">
 {client.name.charAt(0).toUpperCase()}
 </div>
 <div>
 <h3 
 className="text-xl font-bold text-ink-primary leading-tight hover:text-accent-signature transition-colors cursor-pointer flex items-center gap-2"
 onClick={() => setSelectedClientForStatement(client)}
 >
 {client.name} <ExternalLink size={14} className="opacity-[0.85]" />
 </h3>
 <div className="text-[10px] font-bold text-gray-400 font-mono tracking-wider mt-0.5">#{client.id?.split('-')[0] || 'N/A'}</div>
 </div>
 </div>
 {hasPermission('clients', 'edit') && (
 <button 
 onClick={() => openEdit(client)}
 className="p-2.5 rounded-full bg-canvas border border-black/5 hover:bg-black/5 transition-all text-gray-400 hover:text-ink-primary"
 title="Edit Profile"
 >
 <Edit3 size={14} />
 </button>
 )}
 </div>
 {/* Badges Under Header */}
 <div className="flex items-center gap-2">
 <span className="px-3 py-1.5 rounded-pill text-[9px] font-bold uppercase tracking-widest border bg-white border-black/10 text-gray-500">
 Base Account
 </span>
 <span className="px-3 py-1.5 rounded-pill text-[9px] font-bold uppercase tracking-widest border bg-accent-signature/10 border-accent-signature/30 text-ink-primary">
 {stats?.orderCount || 0} DEALS
 </span>
 <button 
 onClick={() => toggleStatus(client)}
 className={`px-3 py-1.5 rounded-pill text-[9px] font-bold uppercase tracking-widest border transition-all ${client.status === 'INACTIVE' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-600 border-green-200'}`}
 >
 {client.status || 'ACTIVE'}
 </button>
 </div>
 </div>

 {/* Main Content: Logistical Base */}
 <div className="p-6 flex-1 flex flex-col gap-5">
 <div className="flex items-start gap-2.5 text-sm font-semibold text-gray-500 leading-relaxed max-w-[90%]">
 <MapPin size={16} className="shrink-0 mt-0.5 opacity-60" /> 
 <span>{client.address || 'Address off-record'}</span>
 </div>

 <div className="grid grid-cols-2 gap-3 mt-auto bg-canvas p-4 rounded-2xl border border-black/5">
 <div>
 <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
 <UserCircle size={12} /> Contact
 </div>
 <div className="text-[13px] font-bold text-ink-primary truncate">{client.contact || 'No Contact'}</div>
 </div>
 <div>
 <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
 <Phone size={12} /> Phone
 </div>
 <div className="text-[13px] font-bold text-ink-primary tabular-nums">{client.phone || 'N/A'}</div>
 </div>
 </div>
 </div>

 {/* Footer Section: Financials Grid */}
 <div className="px-6 pb-6 pt-0 mt-auto">
 <div className="bg-canvas/50 border border-black/5 rounded-[1.5rem] p-5 relative overflow-hidden mb-4">
 <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent pointer-events-none"></div>
 <div className="flex justify-between items-end relative z-10 mb-4">
 <div>
 <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Lifetime Revenue</div>
 <div className="text-3xl font-black text-ink-primary tabular-nums leading-none tracking-tight">
 {businessProfile?.currencySymbol || '₹'}{Math.round(stats?.totalSales || 0).toLocaleString()}
 </div>
 </div>
 <div className="text-right">
 <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Outstanding</div>
 <div className={`text-3xl font-black tabular-nums leading-none tracking-tight ${(client.outstanding_balance || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>
 {businessProfile?.currencySymbol || '₹'}{Math.round(client.outstanding_balance || 0).toLocaleString()}
 </div>
 <div className="text-[10px] font-bold mt-2">
 {(client.outstanding_balance || 0) <= 0 ? (
 <span className="text-green-600 flex items-center justify-end gap-1.5"><Check size={12} /> Fully Cleared</span>
 ) : (
 <span className="text-red-500 opacity-90 flex items-center justify-end gap-1.5"><AlertCircle size={12} /> Awaiting Payment</span>
 )}
 </div>
 </div>
 </div>

 {/* Progress Bar */}
 <div className="flex items-center gap-4 relative z-10">
 <div className="flex-1 h-2 bg-black/5 rounded-full overflow-hidden shadow-inner">
 <div 
 className="h-full bg-accent-signature transition-all duration-500 rounded-full" 
 style={{ width: `${Math.min(100, (stats?.totalSales > 0 ? (stats.totalSales - (client.outstanding_balance || 0)) / stats.totalSales * 100 : 100))}%`}}
 ></div>
 </div>
 {hasPermission('clients', 'edit') && (
 <button 
 onClick={() => { if(window.confirm('Erase this client record permanently?')) handleDelete(client.id);}}
 className="w-8 h-8 rounded-full border border-red-200 bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shrink-0 group-hover:opacity-100 opacity-30 shadow-sm"
 title="Delete Client"
 >
 <Trash2 size={12} />
 </button>
 )}
 </div>
 </div>
 
 {/* Call to Action Base */}
 <button 
 className="w-full py-3.5 px-4 rounded-xl border-2 border-transparent bg-canvas text-ink-primary text-xs font-black uppercase tracking-widest hover:border-ink-primary hover:bg-ink-primary hover:text-accent-signature transition-all duration-300 shadow-sm"
 onClick={() => {
 setSelectedClientForPayment(client);
 setPaymentData({ amount: client.outstanding_balance || '', date: new Date().toISOString().split('T')[0], notes: ''});
 setPaymentError('');
 }}
 >
 Issue Payment Receipt
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
