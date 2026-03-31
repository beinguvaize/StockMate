import React, { useState} from 'react';
import { Receipt, ChevronDown, Banknote, FileText, Printer, Trash2} from 'lucide-react';

const PayHistory = ({ 
 payrollRecords, 
 currencySymbol, 
 openPayRun, 
 deletePayrollRecord 
}) => {
 const [expandedRecord, setExpandedRecord] = useState(null);

 return (
 <div className="flex flex-col gap-10">
 {payrollRecords.length === 0 ? (
 <div className="glass-panel p-40 text-center bg-surface border border-black/5 shadow-premium !rounded-bento">
 <Banknote size={100} className="mx-auto mb-10 text-ink-primary opacity-5" strokeWidth={1} />
 <h3 className="text-sm font-semibold text-ink-primary mb-4 opacity-70">No History</h3>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">No payroll records found in the system.</p>
 <button className="btn-signature mx-auto h-20" onClick={openPayRun}>RUN PAYROLL</button>
 </div>
 ) : (
 payrollRecords.map(record => (
 <div key={record.id} className="glass-panel !p-0 overflow-hidden group bg-surface border border-black/5 shadow-premium !rounded-bento hover:border-black/10 transition-all duration-500">
 <div
 onClick={() => setExpandedRecord(expandedRecord === record.id ? null : record.id)}
 className="p-5 md:p-6 flex flex-col md:flex-row justify-between items-center cursor-pointer hover:bg-canvas transition-all duration-500 gap-4"
 >
 <div className="flex items-center gap-4 md:gap-5 w-full md:w-auto">
 <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg md:rounded-xl bg-ink-primary flex items-center justify-center text-accent-signature shadow-2xl transition-all group-hover:scale-105">
 <Receipt size={28} className="md:size-32" />
 </div>
 <div>
 <div className="text-2xl md:text-3xl font-semibold text-ink-primary leading-none mb-2">RUN.{record.period}</div>
 <div className="text-sm md:text-xs font-semibold text-gray-700 opacity-[0.85]">ID: {record.id.slice(0, 12)}</div>
 </div>
 </div>
 <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-black/5 pt-6 md:pt-0">
 <div className="text-left md:text-right">
 <div className="text-3xl md:text-4xl font-semibold text-ink-primary mb-1">
 {currencySymbol}{record.totalNet.toLocaleString()}
 </div>
 <div className="text-sm md:text-sm font-semibold text-gray-700 opacity-70">Total Net Paid</div>
 </div>
 <div className={`w-12 h-12 md:w-14 md:h-14 rounded-full border border-black/10 flex items-center justify-center transition-all duration-700 shadow-sm ${expandedRecord === record.id ? 'rotate-180 bg-ink-primary text-accent-signature' : 'bg-canvas text-ink-primary'}`}>
 <ChevronDown size={24} />
 </div>
 </div>
 </div>
 {expandedRecord === record.id && (
 <div className="p-4 md:p-6 pt-0 border-t border-black/5 bg-canvas/30 animate-fade-in shadow-inner">
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-4 py-6 md:py-10">
 <div className="p-6 md:p-5 rounded-bento bg-surface border border-black/5 shadow-sm">
 <div className="text-sm font-semibold text-gray-700 mb-3 opacity-70">Gross Base</div>
 <div className="text-xl md:text-2xl font-semibold text-ink-primary">{currencySymbol}{record.totalBase.toLocaleString()}</div>
 </div>
 <div className="p-6 md:p-5 rounded-bento bg-surface border border-black/5 shadow-sm">
 <div className="text-sm font-semibold text-gray-700 mb-3 opacity-70">Adj / Bonus</div>
 <div className="text-xl md:text-2xl font-semibold text-accent-signature-hover">+{currencySymbol}{(record.totalOvertime + record.totalBonus).toLocaleString()}</div>
 </div>
 <div className="p-6 md:p-5 rounded-bento bg-surface border border-black/5 shadow-sm">
 <div className="text-sm font-semibold text-gray-700 mb-3 opacity-70">Deductions</div>
 <div className="text-xl md:text-2xl font-semibold text-red-500">-{currencySymbol}{record.totalDeductions.toLocaleString()}</div>
 </div>
 <div className="p-6 md:p-5 rounded-bento bg-ink-primary text-surface shadow-2xl relative overflow-hidden group">
 <div className="text-sm font-semibold text-surface/40 mb-3 opacity-70">Total Net</div>
 <div className="text-xl md:text-2xl font-semibold text-accent-signature relative z-10">{currencySymbol}{record.totalNet.toLocaleString()}</div>
 <Banknote size={80} className="absolute -right-4 -bottom-4 text-surface/5 group-hover:scale-110 transition-transform duration-700" />
 </div>
 </div>
 <div className="bg-surface rounded-lg border border-black/5 overflow-hidden shadow-premium">
 <div className="p-6 border-b border-black/5 flex justify-between items-center">
 <h4 className="text-[10px] font-semibold text-ink-primary">Staff Breakdown</h4>
 <div className="flex gap-2">
 <button className="p-2 rounded bg-black/5 hover:bg-black/10 transition-colors" title="Export as PDF" onClick={(e) => e.stopPropagation()}><FileText size={14} /></button>
 <button className="p-2 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Delete Record" onClick={(e) => { e.stopPropagation(); deletePayrollRecord(record.id);}}><Trash2 size={14} /></button>
 </div>
 </div>
 <table className="w-full text-left">
 <thead>
 <tr className="bg-canvas/50">
 <th className="p-4 md:p-6 text-[10px] font-semibold text-gray-700 opacity-70">Employee</th>
 <th className="p-4 md:p-6 text-right text-[10px] font-semibold text-gray-700 opacity-70">Net Pay</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/5">
 {record.items.map(item => (
 <tr key={item.employeeId} className="hover:bg-canvas/30 transition-colors">
 <td className="p-4 md:p-6 text-sm font-semibold text-ink-primary">{item.employeeName}</td>
 <td className="p-4 md:p-6 text-right text-base font-semibold text-ink-primary tabular-nums">{currencySymbol}{item.netPay.toLocaleString()}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}
 </div>
 ))
 )}
 </div>
 );
};

export default PayHistory;
