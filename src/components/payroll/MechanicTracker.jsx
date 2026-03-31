import React from 'react';
import { Plus, X, Search, Filter} from 'lucide-react';

const MechanicTracker = ({ 
 mechanicPayments, 
 currencySymbol, 
 viewOnly, 
 setMechForm, 
 setShowMechanicModal, 
 setMechPayment, 
 setShowMechPaymentModal 
}) => {
 return (
 <div className="flex flex-col gap-4">
 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
 <div>
 <h3 className="text-sm font-semibold text-ink-primary mb-1">Mechanic Payment History</h3>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">TRACKING PAYMENTS FOR EXTERNAL MECHANICS & REPAIRS</p>
 </div>
 {!viewOnly && (
 <button 
 className="btn-signature h-12 px-8 font-semibold text-[10px] flex items-center gap-3 !rounded-pill shadow-xl hover:scale-105 transition-all"
 onClick={() => { setMechForm({ name: '', work_description: '', total_due: '', work_date: new Date().toISOString().split('T')[0]}); setShowMechanicModal(true);}}
 >
 <Plus size={16} /> Add Mechanic Record
 </button>
 )}
 </div>

 <div className="glass-panel !p-0 overflow-hidden border border-black/5 bg-surface shadow-premium !rounded-bento">
 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse whitespace-nowrap">
 <thead>
 <tr className="bg-canvas border-b border-black/5">
 <th className="p-5 pl-8 text-[10px] font-semibold text-gray-700 opacity-70">Mechanic / Service</th>
 <th className="p-5 text-[10px] font-semibold text-gray-700 opacity-70">Work Description</th>
 <th className="p-5 text-[10px] font-semibold text-gray-700 opacity-70">Date</th>
 <th className="p-5 text-right text-[10px] font-semibold text-gray-700 opacity-70">Total Due</th>
 <th className="p-5 text-right text-[10px] font-semibold text-gray-700 opacity-70">Paid</th>
 <th className="p-5 text-right text-[10px] font-semibold text-gray-700 opacity-70">Pending</th>
 <th className="p-5 text-center text-[10px] font-semibold text-gray-700 opacity-70">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/5">
 {(mechanicPayments || []).length === 0 ? (
 <tr><td colSpan="7" className="p-20 text-center opacity-60 font-semibold text-[10px] italic leading-relaxed">No mechanic records found in database</td></tr>
 ) : (
 mechanicPayments.map(payment => {
 const totalDue = payment.total_due || payment.amount || 0;
 const amountPaid = payment.amount_paid || 0;
 const pending = totalDue - amountPaid;
 const name = payment.name || payment.mechanic_name;
 const description = payment.work_description || payment.details;
 const date = payment.work_date || payment.date;

 return (
 <tr key={payment.id} className="hover:bg-canvas transition-colors group">
 <td className="p-4 pl-8 font-semibold text-ink-primary text-sm">{name}</td>
 <td className="p-4 text-[10px] font-bold text-gray-700 opacity-70 max-w-[250px] truncate leading-relaxed group-hover:opacity-100 transition-opacity">{description}</td>
 <td className="p-4 text-[10px] font-semibold text-gray-700 opacity-70 tabular-nums">
 {new Date(date).toLocaleDateString()}
 </td>
 <td className="p-4 text-right text-base font-semibold text-ink-primary font-mono tabular-nums">
 {currencySymbol}{totalDue.toLocaleString()}
 </td>
 <td className="p-4 text-right text-base font-semibold text-gray-700 font-mono tabular-nums opacity-60">
 {currencySymbol}{amountPaid.toLocaleString()}
 </td>
 <td className="p-4 text-right">
 <div className="flex items-center justify-end gap-3 pr-2">
 <div className={`text-base font-semibold font-mono tabular-nums ${pending > 0 ? 'text-red-500 underline decoration-red-500/30' : 'text-green-500'}`}>
 {currencySymbol}{(pending > 0 ? pending : 0).toLocaleString()}
 </div>
 <div className={`text-[8px] px-2.5 py-1 rounded-full font-semibold transition-all ${pending > 0 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100 shadow-sm'}`}>
 {pending > 0 ? 'UNPAID' : 'SETTLED'}
 </div>
 </div>
 </td>
 <td className="p-4 text-center">
 {pending > 0 && !viewOnly && (
 <button 
 className="px-5 py-2 rounded-lg bg-ink-primary text-surface hover:bg-ink-primary/90 text-[9px] font-semibold transition-all shadow-lg shadow-black/10 scale-95 hover:scale-100"
 onClick={() => { setMechPayment({ id: payment.id, amount: '', date: new Date().toISOString().split('T')[0]}); setShowMechPaymentModal(true);}}
 >
 Record Payment
 </button>
 )}
 {pending <= 0 && (
 <div className="icon-nest mx-auto text-green-500 bg-green-50 !w-8 !h-8 !border-green-100 opacity-[0.85]">
 <Search size={12} className="opacity-70" />
 </div>
 )}
 </td>
 </tr>
 );
})
 )}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 );
};

export default MechanicTracker;
