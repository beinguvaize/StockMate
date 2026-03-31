import React from 'react';
import { X, Check, AlertCircle, Download, Printer, UserCircle} from 'lucide-react';

const ClientStatementViewer = ({ 
 client, 
 clientStats, 
 businessProfile, 
 getClientStatement, 
 onClose 
}) => {
 if (!client) return null;

 const statement = getClientStatement(client.id);

 return (
 <div className="space-y-6 flex flex-col h-full bg-white p-6 rounded-[2rem] border border-black/10 shadow-premium">
 {/* Header / Business Branding */}
 <div className="flex justify-between items-start shrink-0 border-b border-black/5 pb-6">
 <div className="flex flex-col">
 <h2 className="text-4xl font-semibold text-ink-primary leading-none mb-1">Account Statement</h2>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">
 Generated on {new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric'})}
 </p>
 </div>
 <div className="flex gap-2">
 <button className="p-3 bg-canvas border border-black/5 rounded-lg hover:bg-black/5 transition-all" title="Print Statement">
 <Printer size={18} />
 </button>
 <button className="p-3 bg-ink-primary text-accent-signature rounded-lg hover:scale-105 transition-all flex items-center gap-2 px-6">
 <Download size={18} />
 <span className="text-[10px] font-semibold">Download PDF</span>
 </button>
 </div>
 </div>

 {/* Profile & Summary Blocks */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
 <div className="p-6 bg-canvas/30 rounded-xl border border-black/5 flex items-center gap-4">
 <div className="w-16 h-16 rounded-lg bg-white border border-black/5 flex items-center justify-center text-ink-primary shrink-0 shadow-sm">
 <UserCircle size={32} />
 </div>
 <div className="min-w-0">
 <h3 className="text-2xl font-semibold truncate">{client.name}</h3>
 <p className="text-[9px] font-semibold opacity-[0.85] mb-2">{client.contact || 'Main Contact'}</p>
 <div className="flex flex-wrap gap-2">
 <span className="px-2 py-0.5 rounded-pill bg-white text-[8px] font-semibold border border-black/5">{client.phone}</span>
 <span className="px-2 py-0.5 rounded-pill bg-white text-[8px] font-semibold border border-black/5 truncate max-w-[150px]">{client.address}</span>
 </div>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="p-6 bg-ink-primary rounded-xl text-surface flex flex-col justify-center">
 <span className="text-[8px] font-semibold opacity-60 mb-1">TOTAL OUTSTANDING</span>
 <div className={`text-3xl font-semibold font-mono tabular-nums leading-none ${(client.outstanding_balance || 0) > 0 ? 'text-accent-signature' : 'text-green-500'}`}>
 {businessProfile?.currencySymbol || '₹'}{Math.round(client.outstanding_balance || 0).toLocaleString()}
 </div>
 </div>
 <div className="p-6 bg-canvas/50 rounded-xl flex flex-col justify-center border border-black/5">
 <span className="text-[8px] font-semibold text-gray-700 opacity-60 mb-1">TRANSACTION COUNT</span>
 <div className="text-3xl font-semibold text-ink-primary tabular-nums leading-none">
 {statement.length} <span className="text-sm font-semibold opacity-60">TXNS</span>
 </div>
 </div>
 </div>
 </div>

 {/* Transaction Ledger Table */}
 <div className="flex-1 overflow-y-auto min-h-[400px] border border-black/10 rounded-xl bg-white shadow-inner">
 <table className="w-full text-left border-collapse">
 <thead className="sticky top-0 bg-canvas/90 backdrop-blur-sm z-10 border-b border-black/10">
 <tr>
 <th className="py-2 px-6 text-[9px] font-semibold text-[#4b5563]">Ref ID</th>
 <th className="py-2 px-6 text-[9px] font-semibold text-[#4b5563]">Type</th>
 <th className="py-2 px-6 text-[9px] font-semibold text-[#4b5563]">Description</th>
 <th className="py-2 px-6 text-[9px] font-semibold text-[#4b5563] text-right">Debit (+)</th>
 <th className="py-2 px-6 text-[9px] font-semibold text-[#4b5563] text-right">Credit (-)</th>
 <th className="py-2 px-6 text-[9px] font-semibold text-[#4b5563] text-right">Balance</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/5">
 {statement.length === 0 ? (
 <tr>
 <td colSpan="6" className="py-24 text-center">
 <div className="flex flex-col items-center opacity-20">
 <AlertCircle size={48} className="mb-4" />
 <span className="text-sm font-semibold">No Transaction History Available</span>
 </div>
 </td>
 </tr>
 ) : (
 statement.map((txn, idx) => (
 <tr key={`${txn.id}-${idx}`} className="hover:bg-canvas/30 transition-colors group">
 <td className="py-2 px-6">
 <span className="text-[10px] font-semibold text-ink-primary opacity-70 group-hover:opacity-100 transition-opacity">
 #{txn.id?.split('-').pop() || 'TXN'}
 </span>
 </td>
 <td className="py-2 px-6">
 <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[8px] font-semibold ${
 txn.type === 'SALE' 
 ? 'bg-red-50 text-red-600 border-red-100' 
 : 'bg-green-50 text-green-600 border-green-100'
}`}>
 <div className={`w-1 h-1 rounded-full ${txn.type === 'SALE' ? 'bg-red-600' : 'bg-green-600'}`}></div>
 {txn.type}
 </div>
 </td>
 <td className="py-2 px-6">
 <div className="flex flex-col">
 <span className="text-[11px] font-semibold text-ink-primary leading-tight">
 {txn.description}
 </span>
 <span className="text-[8px] font-bold text-gray-700 opacity-60">
 {new Date(txn.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric'})}
 </span>
 </div>
 </td>
 <td className="py-2 px-6 text-right font-semibold font-mono text-sm tabular-nums text-red-500">
 {txn.debit > 0 ? `${Math.round(txn.debit).toLocaleString()}` : '-'}
 </td>
 <td className="py-2 px-6 text-right font-semibold font-mono text-sm tabular-nums text-green-600">
 {txn.credit > 0 ? `${Math.round(txn.credit).toLocaleString()}` : '-'}
 </td>
 <td className="py-2 px-6 text-right">
 <span className={`text-base font-semibold font-mono tabular-nums leading-none ${txn.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
 {businessProfile?.currencySymbol || '₹'}{Math.round(txn.balance).toLocaleString()}
 </span>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>

 {/* Print Footer Snippet */}
 <div className="p-6 bg-canvas rounded-xl border border-black/5 flex justify-between items-center shrink-0">
 <div className="flex gap-5">
 <div className="flex flex-col">
 <span className="text-[8px] font-semibold opacity-[0.85] mb-1">Prepared By</span>
 <span className="text-[10px] font-semibold">LEDGR ERP SYSTEM</span>
 </div>
 </div>
 <div className="text-right">
 <p className="text-[8px] font-bold text-gray-700 opacity-70">Official Business Document • Not an Invoice</p>
 </div>
 </div>
 </div>
 );
};

export default ClientStatementViewer;
