import React, { useState, useMemo, useEffect} from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useFinance } from '../hooks/useFinance';
import {
  Plus, Search, Calendar, FileText, X, Save, TrendingDown,
  DollarSign, Briefcase, Layers, Receipt
} from 'lucide-react';
import { todayISOInAppTZ } from '../lib/utils';

const Expenses = () => {
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const {
    expenses, addExpense, updateExpense, deleteExpense,
    expenseCategories, loading,
    recurringTemplates, addRecurringTemplate, setRecurringActive, deleteRecurringTemplate,
  } = useFinance(currentTenantId);
  
  const isViewOnly = false; // Placeholder for legacy view mode
 
 const [searchTerm, setSearchTerm] = useState('');
 const [filterType, setFilterType] = useState('all'); // 'all', 'today', 'yesterday', 'custom'
 const [filterDate, setFilterDate] = useState('');
 const [isAdding, setIsAdding] = useState(false);
 const [editingExpense, setEditingExpense] = useState(null);
 const [saving, setSaving] = useState(false);
 const [formError, setFormError] = useState('');
 const [formData, setFormData] = useState({
   note: '',
   amount: '',
   category: 'Other',
   date: todayISOInAppTZ(),
   payment_method: 'CASH',
   repeat_monthly: false,
 });


 const filteredExpenses = useMemo(() => {
 if (!Array.isArray(expenses)) return [];
 
 const getLocalDate = (date) => {
 if (!date) return '';
 try {
 const d = new Date(date);
 if (isNaN(d.getTime())) return '';
 const year = d.getFullYear();
 const month = String(d.getMonth() + 1).padStart(2, '0');
 const day = String(d.getDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
} catch (e) { return '';}
};

 const today = getLocalDate(new Date());
 const yesterdayDate = new Date();
 yesterdayDate.setDate(yesterdayDate.getDate() - 1);
 const yesterday = getLocalDate(yesterdayDate);

 return expenses
 .filter(e => {
 if (!e) return false;
 const matchesSearch = (e.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
 (e.category || '').toLowerCase().includes(searchTerm.toLowerCase());
 
 const expenseDate = getLocalDate(e.date);
 
 let matchesDate = true;
 if (filterType === 'today') matchesDate = expenseDate === today;
 else if (filterType === 'yesterday') matchesDate = expenseDate === yesterday;
 else if (filterType === 'custom') matchesDate = !filterDate || expenseDate === filterDate;
 
 return matchesSearch && matchesDate;
})
 .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
}, [expenses, searchTerm, filterType, filterDate]);

 const totalExpenses = useMemo(() => {
 return filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
}, [filteredExpenses]);

 const dailyAvg = useMemo(() => {
 if (filteredExpenses.length === 0) return 0;
 const total = filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
 return total / 30; // Approximation for month or context
}, [filteredExpenses]);

 const getFilterLabel = () => {
 if (filterType === 'today') return"Today's Expenses";
 if (filterType === 'yesterday') return"Yesterday's Expenses";
 if (filterType === 'custom' && filterDate) {
   const [y, m, d] = filterDate.split('-');
   return `Expenses for ${new Date(+y, +m - 1, +d).toLocaleDateString()}`;
 }
 return"Total Expenses";
};

 const handleSubmit = async (e) => {
 e.preventDefault();
 setFormError('');

 const amount = parseFloat(formData.amount);
 if (!amount || amount <= 0) {
   setFormError('Amount must be greater than 0.');
   return;
 }
 // Description is optional now — fall back to the category label so the
 // row is never noteless in the list.
 const note = (formData.note || '').trim() || formData.category;
 const expenseData = { ...formData, note, amount };

 setSaving(true);
 const { error } = editingExpense
   ? await updateExpense({ ...expenseData, id: editingExpense.id })
   : await addExpense(expenseData);

 // When "Repeat monthly" is on for a NEW expense, also create a
 // recurring template. The day-of-month is taken from the chosen date;
 // the nightly generator clones it every following month. The expense
 // just logged covers the current month, so the template won't double-
 // generate today (its last_generated stays null until the next run on
 // a matching day, and the guard skips the current month after that).
 if (!error && !editingExpense && formData.repeat_monthly) {
   const dom = parseInt((formData.date || todayISOInAppTZ()).split('-')[2], 10) || 1;
   const { error: tplErr } = await addRecurringTemplate({
     note: note, amount, category: formData.category,
     payment_method: formData.payment_method, day_of_month: dom,
   });
   if (tplErr) {
     setSaving(false);
     setFormError('Expense saved, but recurring setup failed: ' + (tplErr.message || ''));
     return;
   }
 }
 setSaving(false);

 if (error) {
   setFormError(error.message || 'Failed to save expense. Please try again.');
   return;
 }

 setIsAdding(false);
 setEditingExpense(null);
 setFormData({ note: '', amount: '', category: 'Other', date: todayISOInAppTZ(), payment_method: 'CASH', repeat_monthly: false });
};

 const handleEdit = (expense) => {
   if (!expense) return;
   setEditingExpense(expense);
   setFormData({
     note: expense.note || '',
     amount: (expense.amount || 0).toString(),
     category: expense.category || 'Other',
     date: expense.date ? expense.date.split('T')[0] : todayISOInAppTZ(),
     payment_method: expense.payment_method || 'CASH',
     repeat_monthly: false, // editing an existing one-off never re-arms recurring
   });
   setIsAdding(true);
 };

 const handleCloseModal = () => {
   setIsAdding(false);
   setEditingExpense(null);
   setFormError('');
   setSaving(false);
   setFormData({ note: '', amount: '', category: 'Other', date: todayISOInAppTZ(), payment_method: 'CASH', repeat_monthly: false });
 };

 useEffect(() => {
 if (isAdding) {
 document.body.style.overflow = 'hidden';
} else {
 document.body.style.overflow = 'unset';
}
 return () => { document.body.style.overflow = 'unset';};
}, [isAdding]);

 return (
 <>
 <div className="animate-fade-in flex flex-col gap-4 pb-12">
 {/* Header Section */}
 <div className="flex justify-between items-center py-2 border-b border-black/5">
 <div className="flex items-center gap-3">
 <h1 className="text-xl font-black font-sora text-ink-primary leading-none">Expenses<span className="text-accent-signature">.</span></h1>
 <span className="text-[10px] font-semibold text-gray-400 hidden sm:block">Operating costs & expenditure</span>
 <span className="hidden md:flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-white border border-gray-300 shadow-sm px-2 py-1 rounded-lg">
   {getFilterLabel()}: <span className="text-ink-primary font-black ml-1">{businessProfile?.currencySymbol || '₹'}{totalExpenses.toLocaleString()}</span>
 </span>
 </div>
 <div className="flex items-center gap-2">
 {hasPermission('ADD_EXPENSE') && (
 <button className="btn-signature flex items-center gap-2 text-xs font-black" onClick={() => setIsAdding(true)}>
 <Plus size={12} /> Add Expense
 </button>
 )}
 </div>
 </div>

 {/* Premium KPI Ribbons */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
 <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
 <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-red-500">
 <TrendingDown size={40} strokeWidth={2} />
 </div>
 <div className="relative z-10 flex flex-col">
 <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Aggregate Registry</span>
 <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
 {filteredExpenses.length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">RECORDS</span>
 </div>
 </div>
 </div>

 <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
 <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-accent-signature">
 <Calendar size={40} strokeWidth={2} />
 </div>
 <div className="relative z-10 flex flex-col">
 <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Monthly Average Burn</span>
 <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
 <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile?.currencySymbol || '₹'}</span>
 {dailyAvg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
 </div>
 </div>
 </div>
 
 <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
 <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-ink-primary">
 <DollarSign size={40} strokeWidth={2} />
 </div>
 <div className="relative z-10 flex flex-col">
 <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Total Valuation</span>
 <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
 <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile?.currencySymbol || '₹'}</span>
 {Math.round(filteredExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0)).toLocaleString()}
 </div>
 </div>
 </div>
 </div>

 {/* Interactive Utility Row */}
 <div className="flex flex-wrap lg:flex-nowrap items-center justify-between bg-white backdrop-blur-xl border border-black/5 rounded-[2rem] shadow-sm p-2 min-h-[72px] w-full gap-2 mb-8">
 <div className="flex-1 flex items-center h-[56px] relative group min-w-[300px]">
 <Search size={16} className="absolute left-5 text-ink-primary opacity-30 group-focus-within:opacity-100 transition-opacity z-10" />
 <input 
 type="text" 
 placeholder="Search expenses..." 
 className="w-full h-full pl-12 pr-5 rounded-pill bg-white border border-gray-300 shadow-sm shadow-inner text-xs font-bold text-ink-primary placeholder:text-gray-400 outline-none focus:border-black/20 focus:bg-white transition-all"
 value={searchTerm}
 onChange={e => setSearchTerm(e.target.value)}
 />
 </div>

 <div className="flex bg-white border border-gray-300 shadow-sm rounded-pill p-1.5 shrink-0 ml-1 h-[56px] overflow-x-auto">
 {['all', 'today', 'yesterday'].map(f => (
 <button
 key={f}
 onClick={() => setFilterType(f)}
 className={`px-5 py-2 rounded-pill text-[11px] font-bold tracking-wider transition-all capitalize ${filterType === f ? 'bg-ink-primary text-white shadow-md' : 'text-gray-500 hover:text-ink-primary hover:bg-black/5'}`}
 >
 {f === 'yesterday' ? 'Prev' : f}
 </button>
 ))}
 <div className="relative group/date pr-3 flex items-center border-l border-black/10 ml-1 pl-3">
 <Calendar size={14} className={`mr-2 transition-colors ${filterType === 'custom' ? 'text-accent-signature' : 'text-gray-500 opacity-70 group-hover/date:opacity-100'}`} />
 <input 
 type="date" 
 className="bg-transparent text-[11px] font-bold text-ink-primary focus:outline-none w-24 cursor-pointer"
 value={filterDate}
 onChange={e => {
 setFilterDate(e.target.value);
 setFilterType('custom');
}}
 />
 {filterDate && (
 <button 
 onClick={() => {
 setFilterDate('');
 setFilterType('all');
}}
 className="ml-2 text-gray-500 opacity-70 hover:opacity-100 hover:text-red-500 transition-colors"
 >
 <X size={14} />
 </button>
 )}
 </div>
 </div>
 </div>

 {/* Expenses Table/Ledger */}
 <div className="glass-panel !p-0 !rounded-bento border border-black/5 shadow-premium overflow-hidden">
 <div className="bg-ink-primary p-4 flex items-center gap-4">
 <Briefcase size={16} className="text-accent-signature" />
 <h2 className="text-[10px] font-semibold text-surface">Expense History</h2>
 </div>

 {/* Recurring templates — active monthly auto-logs. Toggle pause or
     remove. The nightly job clones each on its day-of-month. */}
 {recurringTemplates && recurringTemplates.length > 0 && (
   <div className="mb-3 rounded-2xl border border-black/5 bg-white p-4">
     <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
       Recurring · {recurringTemplates.length}
     </div>
     <div className="flex flex-wrap gap-2">
       {recurringTemplates.map(t => (
         <div key={t.id} className={`flex items-center gap-2 rounded-pill border px-3 py-1.5 text-xs ${t.active ? 'border-accent-signature/30 bg-accent-signature/5' : 'border-black/10 bg-gray-50 opacity-60'}`}>
           <span className="font-bold text-ink-primary">{t.note || t.category}</span>
           <span className="tabular-nums text-gray-600">{formatCurrency(t.amount)}</span>
           <span className="text-[9px] text-gray-400">day {Math.min(t.day_of_month, 28)} · {t.payment_method}</span>
           <button
             type="button"
             title={t.active ? 'Pause' : 'Resume'}
             onClick={() => setRecurringActive(t.id, !t.active)}
             className="text-[9px] font-bold uppercase text-accent-signature hover:underline"
           >{t.active ? 'Pause' : 'Resume'}</button>
           <button
             type="button"
             title="Remove"
             onClick={() => { if (window.confirm('Remove this recurring expense?')) deleteRecurringTemplate(t.id); }}
             className="text-gray-400 hover:text-red-500"
           >✕</button>
         </div>
       ))}
     </div>
   </div>
 )}

 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="border-b border-black/5 bg-canvas">
 <th className="p-1.5 pl-8 text-[10px] font-semibold text-gray-700 opacity-70">Expense Name</th>
 <th className="p-1.5 text-[10px] font-semibold text-gray-700 opacity-70 text-center">Category</th>
 <th className="p-1.5 text-[10px] font-semibold text-gray-700 opacity-70 text-center">Date</th>
 <th className="p-1.5 text-[10px] font-semibold text-gray-700 opacity-70 text-right">Amount</th>
 <th className="p-1.5 pr-8 text-[10px] font-semibold text-gray-700 opacity-70 text-right">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/5 bg-white font-inter">
 {filteredExpenses.map(expense => (
 <tr key={expense.id} className="group hover:bg-canvas transition-colors">
 <td className="p-1.5 pl-8">
 <div className="text-xs font-semibold text-ink-primary">
   {expense.note || '—'}
 </div>
 <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
   via {expense.payment_method || 'CASH'}
 </div>
 </td>
 <td className="p-1.5 text-center">
 <span className={`px-3 py-1 rounded-pill text-[9px] font-semibold border ${
 (expense.category || '').toLowerCase() === 'petrol' ? 'bg-orange-50 text-orange-600 border-orange-100' :
 (expense.category || '').toLowerCase() === 'food' ? 'bg-red-50 text-red-600 border-red-100' :
 (expense.category || '').toLowerCase() === 'salary' ? 'bg-green-50 text-green-600 border-green-100' :
 (expense.category || '').toLowerCase() === 'rent' ? 'bg-blue-50 text-blue-600 border-blue-100' :
 (expense.category || '').toLowerCase() === 'utility' ? 'bg-yellow-50 text-yellow-600 border-yellow-100' :
 (expense.category || '').toLowerCase() === 'purchase' ? 'bg-purple-50 text-purple-600 border-purple-100' :
 (expense.category || '').toLowerCase() === 'maintenance' ? 'bg-teal-50 text-teal-600 border-teal-100' :
 (expense.category || '').toLowerCase().includes('credit') ? 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100' :
 (expense.category || '').toLowerCase().includes('delivery') ? 'bg-sky-50 text-sky-600 border-sky-100' :
 'bg-gray-100 text-[#747576] border-gray-200'
}`}>
 {expense.category || 'Other'}
 </span>
 </td>
 <td className="p-1.5 text-center">
 <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-gray-700">
 <Calendar size={10} className="opacity-60" />
 {expense.date ? (() => {
   const [y, m, d] = (expense.date.split('T')[0]).split('-');
   return new Date(+y, +m - 1, +d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
 })() : '—'}
 </div>
 </td>
 <td className="p-1.5 text-right">
 <div className="text-base font-semibold text-ink-primary">
 {businessProfile?.currencySymbol || '₹'}{parseFloat(expense.amount).toLocaleString()}
 </div>
 </td>
 <td className="p-1.5 pr-8 text-right">
 <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
 {hasPermission('EDIT_EXPENSE') && (
 <button 
 className="w-8 h-8 rounded-xl bg-accent-signature/20 text-ink-primary flex items-center justify-center hover:scale-110 transition-all border border-black/5"
 onClick={() => handleEdit(expense)}
 >
 <FileText size={14} />
 </button>
 )}
 {hasPermission('DELETE_EXPENSE') && (
 <button 
 className="w-8 h-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:scale-110 transition-all border border-red-100"
 onClick={() => {
 if(window.confirm('Delete record?')) deleteExpense(expense.id);
}}
 >
 <X size={14} />
 </button>
 )}
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {filteredExpenses.length === 0 && (
 <div className="p-32 text-center">
 <div className="flex justify-center mb-6 opacity-10">
 <Layers size={64} strokeWidth={1} />
 </div>
 <p className="text-sm font-semibold text-[#747576]">No expenses found</p>
 </div>
 )}
 </div>
 </div>

 {/* Expense Form Modal */}
 {isAdding && (
 <div className="modal-overlay">
 <div className="glass-modal">
 {/* ── Header ───────────────────────────────────────── */}
 <div className="flex items-center justify-between mb-6">
   <div className="flex items-center gap-3.5">
     <div className="w-11 h-11 rounded-2xl bg-accent-signature/10 flex items-center justify-center text-accent-signature shrink-0">
       <Receipt size={20} strokeWidth={2.2} />
     </div>
     <div>
       <h2 className="text-xl font-black font-sora text-ink-primary leading-tight tracking-tight">
         {editingExpense ? 'Edit Expense' : 'New Expense'}
       </h2>
       <p className="text-[11px] font-medium text-gray-400 mt-0.5">
         Log business expenditure details
       </p>
     </div>
   </div>
   <button
     onClick={handleCloseModal}
     aria-label="Close"
     className="w-9 h-9 rounded-full border border-black/8 flex items-center justify-center hover:bg-black/5 transition-colors cursor-pointer text-gray-500"
   >
     <X size={16} />
   </button>
 </div>

 <form onSubmit={handleSubmit} className="space-y-5">

 {/* ── Amount — hero focal point ──────────────────────── */}
 <div className="rounded-2xl bg-accent-signature/5 border border-accent-signature/15 px-5 py-4 focus-within:border-accent-signature/40 focus-within:ring-4 focus-within:ring-accent-signature/10 transition-all">
   <label htmlFor="exp-amount" className="block text-[11px] font-bold uppercase tracking-widest text-accent-signature/80 mb-1">Amount</label>
   <div className="flex items-center">
     <span className="text-3xl font-black text-ink-primary/30 mr-2 leading-none">{businessProfile?.currencySymbol || '₹'}</span>
     <input
       id="exp-amount"
       required
       autoFocus
       type="number"
       step="0.01"
       min="0.01"
       inputMode="decimal"
       placeholder="0.00"
       className="flex-1 w-full bg-transparent border-none p-0 font-black text-4xl text-ink-primary outline-none tabular-nums placeholder:text-ink-primary/20"
       value={formData.amount}
       onChange={e => setFormData({...formData, amount: e.target.value})}
     />
   </div>
 </div>

 {/* ── Category + Paid Via ────────────────────────────── */}
 <div className="grid grid-cols-2 gap-3">
   <div>
     <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Category</label>
     <select
       className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature/40 focus:ring-4 focus:ring-accent-signature/10 transition-all appearance-none cursor-pointer"
       value={formData.category}
       onChange={e => setFormData({...formData, category: e.target.value})}
     >
       <option value="Other">Other</option>
       <option value="Petrol">Petrol</option>
       <option value="Food">Food</option>
       <option value="Salary">Salary</option>
       <option value="Rent">Rent</option>
       <option value="Utility">Utility</option>
       <option value="Purchase">Purchase</option>
       <option value="Maintenance">Maintenance</option>
       <option value="Credit Card Payment">Credit Card Payment</option>
       <option value="Delivery Charge">Delivery Charge</option>
     </select>
   </div>
   <div>
     <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Paid Via</label>
     <select
       className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature/40 focus:ring-4 focus:ring-accent-signature/10 transition-all appearance-none cursor-pointer"
       value={formData.payment_method}
       onChange={e => setFormData({...formData, payment_method: e.target.value})}
     >
       <option value="CASH">Cash</option>
       <option value="UPI">UPI</option>
       <option value="BANK">Bank Transfer</option>
       <option value="CARD">Card</option>
     </select>
   </div>
 </div>

 {/* ── Date ───────────────────────────────────────────── */}
 <div>
   <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Date</label>
   <input
     type="date"
     className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 font-semibold text-sm text-ink-primary outline-none focus:border-accent-signature/40 focus:ring-4 focus:ring-accent-signature/10 transition-all"
     value={formData.date}
     onChange={e => setFormData({...formData, date: e.target.value})}
   />
 </div>

 {/* ── Description (optional) ──────────────────────────── */}
 <div>
   <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
     Description <span className="text-gray-400 font-medium normal-case tracking-normal">· optional</span>
   </label>
   <textarea
     rows={2}
     placeholder="E.g. Fuel for delivery van, office supplies…"
     className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 font-medium text-sm text-ink-primary outline-none focus:border-accent-signature/40 focus:ring-4 focus:ring-accent-signature/10 transition-all resize-none placeholder:text-gray-400"
     value={formData.note}
     onChange={e => setFormData({...formData, note: e.target.value})}
   />
 </div>

 {/* ── Repeat monthly (new expense only) ──────────────── */}
 {!editingExpense && (
   <label className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-black/8 bg-white cursor-pointer hover:border-black/15 transition-colors">
     <div className="flex items-center gap-3">
       <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${formData.repeat_monthly ? 'bg-accent-signature/10 text-accent-signature' : 'bg-canvas text-gray-400'}`}>
         <Calendar size={16} />
       </div>
       <div>
         <div className="text-sm font-bold text-ink-primary">Repeat monthly</div>
         <div className="text-[11px] text-gray-500">
           Auto-logs on day {parseInt((formData.date || '').split('-')[2], 10) || 1} every month
         </div>
       </div>
     </div>
     <button
       type="button"
       role="switch"
       aria-checked={formData.repeat_monthly}
       onClick={() => setFormData({ ...formData, repeat_monthly: !formData.repeat_monthly })}
       className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-accent-signature/20 shrink-0 ${formData.repeat_monthly ? 'bg-accent-signature' : 'bg-black/15'}`}
     >
       <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${formData.repeat_monthly ? 'translate-x-5' : 'translate-x-0'}`} />
     </button>
   </label>
 )}

 {formError && (
   <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold" role="alert">
     {formError}
   </div>
 )}

 {/* ── Footer ─────────────────────────────────────────── */}
 <div className="flex items-center gap-3 pt-2">
   <button type="button" className="px-6 py-3.5 rounded-pill border border-black/10 font-bold text-ink-primary text-xs uppercase tracking-wide hover:bg-black/5 transition-colors cursor-pointer disabled:opacity-50" onClick={handleCloseModal} disabled={saving}>
     Cancel
   </button>
   <button type="submit" disabled={saving} className="btn-signature flex-1 !h-13 !text-xs !uppercase !tracking-widest flex items-center justify-center gap-2.5 px-6 !rounded-pill disabled:opacity-60 disabled:cursor-not-allowed">
     {saving ? 'Saving…' : (editingExpense ? 'Save Changes' : 'Log Expense')}
     {!saving && <Save size={16} />}
   </button>
 </div>
 </form>
 </div>
 </div>
 )}
 </>
 );
};

export default Expenses;
