import React, { useMemo, useState} from 'react';
import { Search, CreditCard, Calendar, Download, Trash2, CheckCircle2} from 'lucide-react';

const ClientPayments = ({ clientPayments, clients, businessProfile}) => {
 const [searchTerm, setSearchTerm] = useState('');

 const filteredPayments = useMemo(() => {
 return (clientPayments || [])
 .map(p => {
 const client = (clients || []).find(c => c.id === p.client_id);
 return { ...p, client_name: client ? client.name : 'Unknown Client'};
})
 .filter(p => 
 p.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
 p.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 p.id.toLowerCase().includes(searchTerm.toLowerCase())
 )
 .sort((a, b) => new Date(b.date) - new Date(a.date));
}, [clientPayments, clients, searchTerm]);

 return (
 <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
 {/* Payment Controls */}
 <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-surface/80 backdrop-blur-xl border border-black/5 rounded-xl p-4 shadow-premium">
 <div className="flex items-center gap-4 w-full md:w-auto">
 <div className="w-12 h-12 rounded-lg bg-accent-signature/10 flex items-center justify-center text-accent-signature border border-accent-signature/20 shrink-0">
 <CreditCard size={24} />
 </div>
 <div>
 <h3 className="text-xl font-semibold leading-none">Payment Ledger</h3>
 <p className="text-[9px] font-semibold opacity-[0.85] mt-1">Transaction History</p>
 </div>
 </div>
 
 <div className="flex flex-1 w-full md:w-auto items-center gap-3 justify-end">
 <div className="relative group w-full md:w-64 max-w-sm">
 <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-primary opacity-20 group-focus-within:opacity-100 transition-opacity" />
 <input 
 type="text" 
 placeholder="Search payments..." 
 className="input-field !pl-10 !h-12 !py-0 !rounded-lg bg-canvas border border-black/5 shadow-inner text-[10px] font-bold"
 value={searchTerm}
 onChange={e => setSearchTerm(e.target.value)}
 />
 </div>
 <button className="flex items-center gap-2 px-6 py-3 bg-ink-primary text-accent-signature rounded-lg text-[10px] font-semibold hover:scale-105 transition-all shrink-0">
 <Download size={14} /> Export CSV
 </button>
 </div>
 </div>

 {/* Payments List */}
 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
 {filteredPayments.length === 0 ? (
 <div className="col-span-full py-24 text-center glass-panel rounded-[3rem] border-dashed border-2">
 <div className="flex justify-center mb-6 opacity-20">
 <CreditCard size={48} />
 </div>
 <h3 className="text-2xl font-semibold mb-1">No Payments Logged</h3>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">Try adjusting your search filters</p>
 </div>
 ) : (
 filteredPayments.map(payment => (
 <div key={payment.id} className="glass-panel !p-5 rounded-xl border border-black/5 hover:border-accent-signature/30 transition-all group flex flex-col relative overflow-hidden bg-white/50">
 <div className="absolute top-0 right-0 w-24 h-24 bg-accent-signature/5 -mr-12 -mt-12 rounded-full blur-2xl group-hover:bg-accent-signature/10 transition-colors" />
 
 <div className="flex justify-between items-start mb-4 relative z-10">
 <div className="flex flex-col">
 <span className="text-[8px] font-semibold text-gray-700 opacity-[0.85] mb-0.5">Payment ID</span>
 <span className="text-[10px] font-semibold text-ink-primary">#{payment.id.split('-').pop()}</span>
 </div>
 <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-50 text-green-600 border border-green-100">
 <CheckCircle2 size={10} />
 <span className="text-[8px] font-semibold">Confirmed</span>
 </div>
 </div>

 <div className="mb-4 relative z-10">
 <h4 className="text-lg font-semibold text-ink-primary leading-tight group-hover:text-accent-signature transition-colors truncate">
 {payment.client_name}
 </h4>
 <div className="flex items-center gap-1 text-[9px] font-bold text-gray-700 opacity-60">
 <Calendar size={9} /> {new Date(payment.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric'})}
 </div>
 </div>

 <div className="mt-auto pt-4 border-t border-dashed border-black/10 flex justify-between items-end relative z-10">
 <div className="flex flex-col">
 <span className="text-[8px] font-semibold text-gray-700 opacity-[0.85] mb-1">Received Amount</span>
 <div className="text-2xl font-semibold text-ink-primary tabular-nums flex items-baseline gap-1 leading-none">
 <span className="text-xs opacity-[0.85]">{businessProfile?.currencySymbol || '₹'}</span>
 {Math.round(payment.amount).toLocaleString()}
 </div>
 </div>
 {payment.notes && (
 <div className="max-w-[120px] text-right">
 <p className="text-[8px] font-bold text-gray-700 opacity-70 italic truncate" title={payment.notes}>
"{payment.notes}"
 </p>
 </div>
 )}
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 );
};

export default ClientPayments;
