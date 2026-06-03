import React, { useState, useMemo, useEffect} from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useFinance } from '../hooks/useFinance';
import { useInventory } from '../hooks/useInventory';
import {
  Plus, Search, Calendar, FileText, X, Save, TrendingDown,
  DollarSign, Briefcase, Layers, Receipt, Download
} from 'lucide-react';
import { todayISOInAppTZ, formatCurrency } from '../lib/utils';

// Category → dot + pill colour. Shared by the table rows and the mobile
// cards so both stay visually consistent.
const catStyleOf = (category) => {
  const c = (category || '').toLowerCase();
  if (c === 'petrol') return { dot: 'bg-orange-400', pill: 'bg-orange-50 text-orange-600' };
  if (c === 'food') return { dot: 'bg-red-400', pill: 'bg-red-50 text-red-600' };
  if (c === 'salary') return { dot: 'bg-emerald-400', pill: 'bg-emerald-50 text-emerald-600' };
  if (c === 'rent') return { dot: 'bg-blue-400', pill: 'bg-blue-50 text-blue-600' };
  if (c === 'utility') return { dot: 'bg-amber-400', pill: 'bg-amber-50 text-amber-700' };
  if (c === 'purchase') return { dot: 'bg-purple-400', pill: 'bg-purple-50 text-purple-600' };
  if (c === 'maintenance') return { dot: 'bg-teal-400', pill: 'bg-teal-50 text-teal-600' };
  if (c.includes('credit')) return { dot: 'bg-fuchsia-400', pill: 'bg-fuchsia-50 text-fuchsia-600' };
  if (c.includes('delivery')) return { dot: 'bg-sky-400', pill: 'bg-sky-50 text-sky-600' };
  return { dot: 'bg-gray-300', pill: 'bg-gray-100 text-gray-500' };
};

const fmtDate = (raw) => {
  if (!raw) return '—';
  const [y, m, d] = (raw.split('T')[0]).split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const Expenses = () => {
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { inventoryLocations } = useInventory(currentTenantId);
  const posStores = (inventoryLocations || []).filter(l => (l.type || 'WAREHOUSE') !== 'VEHICLE' && !l.deleted_at);
  const {
    expenses, addExpense, updateExpense, deleteExpense,
    expenseCategories, loading,
    recurringTemplates, addRecurringTemplate, setRecurringActive, deleteRecurringTemplate,
    customCategories, addExpenseCategory, deleteExpenseCategory,
  } = useFinance(currentTenantId);
  const [newCategory, setNewCategory] = useState('');
  
  const isViewOnly = false; // Placeholder for legacy view mode
 
 const [searchTerm, setSearchTerm] = useState('');
 const [filterType, setFilterType] = useState('all'); // all|today|yesterday|week|month|lastmonth|range
 const [filterDate, setFilterDate] = useState('');
 const [rangeFrom, setRangeFrom] = useState('');
 const [rangeTo, setRangeTo] = useState('');

 // Resolve the active filter into an inclusive [from,to] YYYY-MM-DD window.
 // null on either side = unbounded. 'all' = fully unbounded.
 const dateWindow = useMemo(() => {
   const d = new Date();
   const ymd = (x) => {
     const y = x.getFullYear(), m = String(x.getMonth()+1).padStart(2,'0'), dd = String(x.getDate()).padStart(2,'0');
     return `${y}-${m}-${dd}`;
   };
   const today = ymd(d);
   if (filterType === 'today') return { from: today, to: today };
   if (filterType === 'yesterday') { const y = new Date(d); y.setDate(d.getDate()-1); return { from: ymd(y), to: ymd(y) }; }
   if (filterType === 'week') { const s = new Date(d); const dow = (s.getDay()+6)%7; s.setDate(d.getDate()-dow); return { from: ymd(s), to: today }; }
   if (filterType === 'month') { const s = new Date(d.getFullYear(), d.getMonth(), 1); return { from: ymd(s), to: today }; }
   if (filterType === 'lastmonth') { const s = new Date(d.getFullYear(), d.getMonth()-1, 1); const e = new Date(d.getFullYear(), d.getMonth(), 0); return { from: ymd(s), to: ymd(e) }; }
   if (filterType === 'range') return { from: rangeFrom || null, to: rangeTo || null };
   return { from: null, to: null };
 }, [filterType, rangeFrom, rangeTo]);

 const inWindow = (dateStr) => {
   if (!dateStr) return false;
   const d = dateStr.split('T')[0];
   if (dateWindow.from && d < dateWindow.from) return false;
   if (dateWindow.to && d > dateWindow.to) return false;
   return true;
 };
 const [categoryFilter, setCategoryFilter] = useState('ALL');
 const [sortKey, setSortKey] = useState('date');   // 'date' | 'amount' | 'category'
 const [sortDir, setSortDir] = useState('desc');   // 'asc' | 'desc'
 const [visibleCount, setVisibleCount] = useState(50); // pagination window

 const toggleSort = (key) => {
   if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
   else { setSortKey(key); setSortDir(key === 'amount' ? 'desc' : 'desc'); }
 };
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
   gst_claimable: false,
   gst_rate: '18',
   vendor_gstin: '',
   location_id: '',
 });


 // Component-scope so both filteredExpenses and categoryBreakdown can use it.
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

 const filteredExpenses = useMemo(() => {
 if (!Array.isArray(expenses)) return [];

 const q = searchTerm.toLowerCase();
 return expenses
 .filter(e => {
 if (!e) return false;
 // Search note + category (was searching e.title, which doesn't exist).
 const matchesSearch = (e.note || '').toLowerCase().includes(q) ||
 (e.category || '').toLowerCase().includes(q);

 const expenseDate = getLocalDate(e.date);
 const matchesDate = (() => {
   if (dateWindow.from && expenseDate < dateWindow.from) return false;
   if (dateWindow.to && expenseDate > dateWindow.to) return false;
   return true;
 })();

 const matchesCategory = categoryFilter === 'ALL' || (e.category || 'Other') === categoryFilter;

 return matchesSearch && matchesDate && matchesCategory;
})
 .sort((a, b) => {
   const dir = sortDir === 'asc' ? 1 : -1;
   if (sortKey === 'amount') return ((parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0)) * dir;
   if (sortKey === 'category') return ((a.category || '').localeCompare(b.category || '')) * dir;
   // date (string compare on YYYY-MM-DD is chronologically correct)
   const ad = (a.date || ''); const bd = (b.date || '');
   return (ad < bd ? -1 : ad > bd ? 1 : 0) * dir;
 });
}, [expenses, searchTerm, dateWindow, categoryFilter, sortKey, sortDir]);

 // Per-category totals over the date-windowed set (ignores category
 // filter so the chips always show every category's count + spend).
 const categoryBreakdown = useMemo(() => {
   const map = {};
   expenses.filter(e => {
     if (!e) return false;
     const d = getLocalDate(e.date);
     if (dateWindow.from && d < dateWindow.from) return false;
     if (dateWindow.to && d > dateWindow.to) return false;
     return true;
   }).forEach(e => {
     const c = e.category || 'Other';
     if (!map[c]) map[c] = { count: 0, total: 0 };
     map[c].count += 1; map[c].total += parseFloat(e.amount) || 0;
   });
   return map;
 }, [expenses, dateWindow]);

 // CSV export of the currently filtered + sorted rows.
 const exportCSV = () => {
   const rows = filteredExpenses.map(e => ({
     Date: (e.date || '').split('T')[0],
     Description: e.note || '',
     Category: e.category || 'Other',
     PaidVia: e.payment_method || 'CASH',
     Amount: parseFloat(e.amount) || 0,
     GST_Rate: e.gst_rate ?? '',
     ITC_Amount: parseFloat(e.gst_amount) || 0,
     Vendor_GSTIN: e.vendor_gstin || '',
   }));
   if (!rows.length) return;
   const headers = Object.keys(rows[0]);
   const csv = [headers.join(','),
     ...rows.map(r => headers.map(h => {
       const v = String(r[h] ?? '');
       return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
     }).join(','))].join('\n');
   const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url; a.download = `expenses-${new Date().toISOString().slice(0,10)}.csv`;
   a.click(); URL.revokeObjectURL(url);
 };

 // Reset the pagination window whenever the result set changes.
 useEffect(() => { setVisibleCount(50); }, [searchTerm, dateWindow, categoryFilter, sortKey, sortDir]);
 const pagedExpenses = useMemo(() => filteredExpenses.slice(0, visibleCount), [filteredExpenses, visibleCount]);

 const totalExpenses = useMemo(() => {
 return filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
}, [filteredExpenses]);

 // Claimable input tax credit over the filtered set (only rows with a
 // vendor GSTIN count as valid ITC).
 const totalITC = useMemo(() =>
   filteredExpenses.reduce((s, e) => s + (e.vendor_gstin ? (parseFloat(e.gst_amount) || 0) : 0), 0),
 [filteredExpenses]);

 const dailyAvg = useMemo(() => {
 if (filteredExpenses.length === 0) return 0;
 const total = filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
 return total / 30; // Approximation for month or context
}, [filteredExpenses]);

 // Average per entry (for the insight rail).
 const avgEntry = useMemo(() =>
   filteredExpenses.length ? totalExpenses / filteredExpenses.length : 0,
 [filteredExpenses, totalExpenses]);

 // Category rollup over the *filtered* set, sorted high→low, for the
 // "Where it went" bars in the insight rail.
 const railCats = useMemo(() => {
   const map = {};
   filteredExpenses.forEach(e => {
     const c = e.category || 'Other';
     map[c] = (map[c] || 0) + (parseFloat(e.amount) || 0);
   });
   return Object.entries(map).sort((a, b) => b[1] - a[1]);
 }, [filteredExpenses]);
 const railMax = railCats.length ? railCats[0][1] : 0;

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

 // GST/ITC: when claimable, back the tax component out of the (inclusive)
 // amount: gst = amount − amount/(1 + rate/100). Stored as the ITC value.
 let gst_rate = null, gst_amount = 0, vendor_gstin = null;
 if (formData.gst_claimable) {
   const r = parseFloat(formData.gst_rate) || 0;
   gst_rate = r;
   gst_amount = r > 0 ? +(amount - amount / (1 + r / 100)).toFixed(2) : 0;
   vendor_gstin = (formData.vendor_gstin || '').trim().toUpperCase() || null;
 }
 const expenseData = { ...formData, note, amount, gst_rate, gst_amount, vendor_gstin, location_id: formData.location_id || null };

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
 setFormData({ note: '', amount: '', category: 'Other', date: todayISOInAppTZ(), payment_method: 'CASH', repeat_monthly: false, gst_claimable: false, gst_rate: '18', vendor_gstin: '', location_id: '' });
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
     gst_claimable: !!expense.vendor_gstin || Number(expense.gst_amount) > 0,
     gst_rate: expense.gst_rate ? String(expense.gst_rate) : '18',
     vendor_gstin: expense.vendor_gstin || '',
     location_id: expense.location_id || '',
   });
   setIsAdding(true);
 };

 const handleCloseModal = () => {
   setIsAdding(false);
   setEditingExpense(null);
   setFormError('');
   setSaving(false);
   setFormData({ note: '', amount: '', category: 'Other', date: todayISOInAppTZ(), payment_method: 'CASH', repeat_monthly: false, gst_claimable: false, gst_rate: '18', vendor_gstin: '', location_id: '' });
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
 <h1 className="text-xl font-black font-sora text-ink-primary leading-none">Expenses<span className="text-amber-500">.</span></h1>
 <span className="text-[10px] font-semibold text-gray-400 hidden sm:block">Operating costs & expenditure</span>
 <span className="hidden md:flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg font-mono">
   {getFilterLabel()}: <span className="text-amber-800 font-bold ml-0.5">{businessProfile?.currencySymbol || '₹'}{Math.round(totalExpenses).toLocaleString('en-IN')}</span>
 </span>
 </div>
 <div className="flex items-center gap-2">
 {hasPermission('ADD_EXPENSE') && (
 <button className="flex items-center gap-2 text-xs font-black px-4 py-2.5 rounded-pill bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/25 transition-colors" onClick={() => setIsAdding(true)}>
 <Plus size={14} strokeWidth={2.5} /> Add Expense
 </button>
 )}
 </div>
 </div>

 {/* Filter + date toolbar — single panel (matches Design 5 sample). */}
 <div className="rounded-2xl border border-black/8 bg-white shadow-sm p-3.5 mb-5">
 <div className="flex items-center justify-between gap-3 flex-wrap">
   {/* Search */}
   <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/[0.03] border border-black/8 flex-1 min-w-[200px] max-w-xs focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-500/15 transition-all">
     <Search size={14} className="text-amber-500 shrink-0" />
     <input
       type="text"
       placeholder="Search…"
       className="bg-transparent outline-none text-[12px] font-semibold flex-1 text-ink-primary placeholder:text-gray-400"
       value={searchTerm}
       onChange={e => setSearchTerm(e.target.value)}
     />
   </div>
   {/* Period segmented */}
   <div className="flex items-center gap-0.5 p-1 rounded-xl bg-black/[0.04] overflow-x-auto">
     {[
       { k: 'all', label: 'All' }, { k: 'today', label: 'Today' }, { k: 'yesterday', label: 'Prev' },
       { k: 'week', label: 'Week' }, { k: 'month', label: 'Month' }, { k: 'lastmonth', label: 'Last Mo' },
     ].map(({ k, label }) => (
       <button key={k} onClick={() => setFilterType(k)}
         className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${filterType === k ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20' : 'text-gray-500 hover:text-ink-primary'}`}>
         {label}
       </button>
     ))}
     <button onClick={() => setFilterType('range')}
       className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors ${filterType === 'range' ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20' : 'text-gray-500 hover:text-ink-primary'}`}>
       <Calendar size={12} /> Range
     </button>
   </div>
   {/* Date range display / inputs */}
   {filterType === 'range' ? (
     <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/[0.03] border border-black/8">
       <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
         className="bg-transparent text-[12px] font-semibold text-ink-primary font-mono outline-none" />
       <span className="text-gray-400 text-[12px]">–</span>
       <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
         className="bg-transparent text-[12px] font-semibold text-ink-primary font-mono outline-none" />
       {(rangeFrom || rangeTo) && (
         <button onClick={() => { setRangeFrom(''); setRangeTo(''); }} className="text-gray-400 hover:text-red-500 ml-1"><X size={12} /></button>
       )}
     </div>
   ) : (
     <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/[0.03] border border-black/8">
       <Calendar size={13} className="text-gray-400" />
       <span className="text-[12px] font-semibold text-gray-500 font-mono">
         {dateWindow.from ? fmtDate(dateWindow.from) : 'All time'}{dateWindow.to && dateWindow.from !== dateWindow.to ? ` – ${fmtDate(dateWindow.to)}` : ''}
       </span>
     </div>
   )}
 </div>

 {/* Category chips row inside the panel */}
 <div className="flex items-center gap-2 mt-3 pt-3 border-t border-black/[0.06] flex-wrap">
   <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-1">Category</span>
   <button onClick={() => setCategoryFilter('ALL')}
     className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${categoryFilter === 'ALL' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-black/10 text-gray-500 hover:border-black/25'}`}>
     All
   </button>
   {Object.entries(categoryBreakdown)
     .sort((a, b) => b[1].total - a[1].total)
     .map(([cat, info]) => (
     <button key={cat} onClick={() => setCategoryFilter(cat === categoryFilter ? 'ALL' : cat)}
       className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors flex items-center gap-1.5 ${categoryFilter === cat ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-black/10 text-gray-500 hover:border-black/25'}`}>
       {cat}
       <span className={`font-mono tabular-nums ${categoryFilter === cat ? 'text-white/70' : 'text-amber-600/70'}`}>
         {businessProfile?.currencySymbol || '₹'}{Math.round(info.total).toLocaleString('en-IN')}
       </span>
     </button>
   ))}
   {categoryFilter !== 'ALL' && (
     <button onClick={() => setCategoryFilter('ALL')} className="ml-auto text-[11px] font-semibold text-gray-400 hover:text-ink-primary">Clear</button>
   )}
 </div>
 </div>

 {/* Expenses Table/Ledger + insight rail */}
 <div className="flex flex-col lg:flex-row items-start gap-5">
 <div className="glass-panel !p-0 !rounded-bento border border-black/5 shadow-premium overflow-hidden flex-1 min-w-0 w-full">
 <div className="bg-white border-b border-black/5 px-5 py-3 flex items-center justify-between">
 <span className="font-mono text-[11px] font-bold text-amber-600 truncate">
   $ expenses --{filterType}{categoryFilter !== 'ALL' ? ` --cat="${categoryFilter}"` : ''}
 </span>
 <div className="flex items-center gap-3 shrink-0">
   <span className="font-mono text-[10px] font-semibold text-gray-400">
     {filteredExpenses.length} {filteredExpenses.length === 1 ? 'row' : 'rows'}
   </span>
   <button
     onClick={exportCSV}
     disabled={filteredExpenses.length === 0}
     className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/10 hover:bg-amber-50 hover:border-amber-200 text-gray-500 hover:text-amber-700 text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
   >
     <Download size={13} /> Export
   </button>
 </div>
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
         <div key={t.id} className={`flex items-center gap-2 rounded-pill border px-3 py-1.5 text-xs ${t.active ? 'border-amber-300 bg-amber-50' : 'border-black/10 bg-gray-50 opacity-60'}`}>
           <span className="font-bold text-ink-primary">{t.note || t.category}</span>
           <span className="font-mono tabular-nums text-amber-700">{formatCurrency(t.amount)}</span>
           <span className="text-[9px] text-gray-400">day {Math.min(t.day_of_month, 28)} · {t.payment_method}</span>
           <button
             type="button"
             title={t.active ? 'Pause' : 'Resume'}
             onClick={() => setRecurringActive(t.id, !t.active)}
             className="text-[9px] font-bold uppercase text-amber-600 hover:underline"
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

 {/* Desktop table — hidden on small screens (mobile cards below). */}
 <div className="hidden sm:block overflow-x-auto">
 <table className="w-full text-left border-collapse">
 <thead className="sticky top-0 z-10">
 <tr className="border-b border-black/10 bg-canvas/80 backdrop-blur-sm">
 <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">Expense</th>
 <th className="px-4 py-3.5 text-left">
   <button onClick={() => toggleSort('category')} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-ink-primary transition-colors">
     Category <span className={`transition-opacity ${sortKey === 'category' ? 'opacity-100 text-amber-600' : 'opacity-30'}`}>{sortKey === 'category' && sortDir === 'asc' ? '↑' : '↓'}</span>
   </button>
 </th>
 <th className="px-4 py-3.5 text-left">
   <button onClick={() => toggleSort('date')} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-ink-primary transition-colors">
     Date <span className={`transition-opacity ${sortKey === 'date' ? 'opacity-100 text-amber-600' : 'opacity-30'}`}>{sortKey === 'date' && sortDir === 'asc' ? '↑' : '↓'}</span>
   </button>
 </th>
 <th className="px-4 py-3.5 text-right">
   <button onClick={() => toggleSort('amount')} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-ink-primary transition-colors ml-auto">
     Amount <span className={`transition-opacity ${sortKey === 'amount' ? 'opacity-100 text-amber-600' : 'opacity-30'}`}>{sortKey === 'amount' && sortDir === 'asc' ? '↑' : '↓'}</span>
   </button>
 </th>
 <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 text-right w-px">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/[0.04] bg-white font-inter">
 {pagedExpenses.map(expense => {
 const catStyle = catStyleOf(expense.category);
 return (
 <tr key={expense.id} className="group hover:bg-amber-500/[0.04] transition-colors">
 <td className="px-6 py-3">
 <div className="flex items-center gap-3.5">
   <span className={`w-1 h-8 rounded-sm shrink-0 ${catStyle.dot}`} />
   <div className="min-w-0">
     <div className="flex items-center gap-1.5">
       <span className="text-[14px] font-bold text-ink-primary truncate">{expense.note || '—'}</span>
       {expense.recurring_template_id && (
         <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-pill bg-amber-100 text-amber-700 text-[8px] font-black uppercase tracking-wide shrink-0" title="Auto-generated from a recurring template">
           ↻ Recurring
         </span>
       )}
     </div>
     <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">
       via {expense.payment_method || 'CASH'}
     </div>
   </div>
 </div>
 </td>
 <td className="px-4 py-3 text-left">
 <span className={`inline-block px-2.5 py-1 rounded-pill text-[10px] font-bold ${catStyle.pill}`}>
 {expense.category || 'Other'}
 </span>
 </td>
 <td className="px-4 py-3 text-left">
 <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 font-mono">
 <Calendar size={11} className="opacity-40" />
 {fmtDate(expense.date)}
 </div>
 </td>
 <td className="px-4 py-3 text-right">
 <div className="font-mono text-[15px] font-bold text-ink-primary tabular-nums tracking-tight leading-none">
 <span className="text-amber-400 mr-0.5">{businessProfile?.currencySymbol || '₹'}</span>{parseFloat(expense.amount).toLocaleString('en-IN')}
 </div>
 <div className="mt-1.5 h-[3px] w-16 ml-auto rounded-full bg-black/[0.06] overflow-hidden">
   <div className="h-full rounded-full bg-amber-500" style={{ width: `${totalExpenses ? Math.max(Math.round((parseFloat(expense.amount)||0) / totalExpenses * 100), 3) : 0}%` }} />
 </div>
 </td>
 <td className="px-6 py-3 text-right">
 <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
 {hasPermission('EDIT_EXPENSE') && (
 <button
 aria-label="Edit expense"
 className="w-8 h-8 rounded-lg bg-canvas text-gray-500 flex items-center justify-center hover:bg-amber-100 hover:text-amber-700 transition-colors"
 onClick={() => handleEdit(expense)}
 >
 <FileText size={14} />
 </button>
 )}
 {hasPermission('DELETE_EXPENSE') && (
 <button
 aria-label="Delete expense"
 className="w-8 h-8 rounded-lg bg-canvas text-gray-500 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors"
 onClick={() => { if(window.confirm('Delete record?')) deleteExpense(expense.id); }}
 >
 <X size={14} />
 </button>
 )}
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>

 {/* Mobile cards — shown below sm breakpoint where a table cramps. */}
 <div className="sm:hidden divide-y divide-black/5">
 {pagedExpenses.map(expense => {
   const catStyle = catStyleOf(expense.category);
   return (
   <div key={expense.id} className="p-4 flex items-start gap-3">
     <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${catStyle.dot}`} />
     <div className="flex-1 min-w-0">
       <div className="flex items-center justify-between gap-2">
         <span className="text-sm font-bold text-ink-primary truncate">{expense.note || '—'}</span>
         <span className="font-mono text-base font-bold text-ink-primary tabular-nums shrink-0">
           <span className="text-amber-400 mr-0.5">{businessProfile?.currencySymbol || '₹'}</span>{parseFloat(expense.amount).toLocaleString('en-IN')}
         </span>
       </div>
       <div className="flex items-center gap-2 mt-1.5 flex-wrap">
         <span className={`inline-block px-2 py-0.5 rounded-pill text-[10px] font-bold ${catStyle.pill}`}>{expense.category || 'Other'}</span>
         <span className="text-[10px] font-semibold text-gray-400 font-mono">{fmtDate(expense.date)}</span>
         <span className="text-[10px] font-semibold text-gray-400 uppercase">via {expense.payment_method || 'CASH'}</span>
         {expense.recurring_template_id && (
           <span className="text-[8px] font-black uppercase text-amber-600">↻ Recurring</span>
         )}
       </div>
       <div className="flex items-center gap-2 mt-2">
         {hasPermission('EDIT_EXPENSE') && (
           <button onClick={() => handleEdit(expense)} className="text-[11px] font-bold text-amber-600">Edit</button>
         )}
         {hasPermission('DELETE_EXPENSE') && (
           <button onClick={() => { if(window.confirm('Delete record?')) deleteExpense(expense.id); }} className="text-[11px] font-bold text-red-500">Delete</button>
         )}
       </div>
     </div>
   </div>
   );
 })}
 </div>

 {/* Load more — pagination window grows by 50 at a time. */}
 {filteredExpenses.length > visibleCount && (
   <div className="p-4 text-center border-t border-black/5">
     <button
       onClick={() => setVisibleCount(v => v + 50)}
       className="px-5 py-2 rounded-pill bg-canvas hover:bg-black/5 text-xs font-bold text-ink-primary transition-colors"
     >
       Load more · {filteredExpenses.length - visibleCount} remaining
     </button>
   </div>
 )}

 {filteredExpenses.length === 0 && (
 <div className="p-20 sm:p-32 text-center">
 <div className="flex justify-center mb-6 opacity-10">
 <Layers size={64} strokeWidth={1} />
 </div>
 <p className="text-sm font-semibold text-[#747576] mb-4">No expenses found</p>
 <button onClick={() => setIsAdding(true)} className="btn-signature !text-xs inline-flex items-center gap-2 px-5 py-2.5 !rounded-pill">
   <Plus size={14} /> Log your first expense
 </button>
 </div>
 )}
 </div>

 {/* ── Insight rail — total, stats, category breakdown ── */}
 <aside className="w-full lg:w-[300px] shrink-0 space-y-4">
   {/* Total card */}
   <div className="rounded-bento border border-black/5 bg-white shadow-sm p-5">
     <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber-600">
       total · {filterType === 'all' ? 'all time' : filterType}
     </div>
     <div className="font-mono text-[30px] font-bold text-ink-primary tabular-nums leading-none mt-2">
       <span className="text-amber-500 text-[20px] mr-1">{businessProfile?.currencySymbol || '₹'}</span>
       {Math.round(totalExpenses).toLocaleString('en-IN')}
     </div>
     <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-black/5">
       <div>
         <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Entries</div>
         <div className="font-mono text-[18px] font-bold text-ink-primary mt-0.5 tabular-nums">{filteredExpenses.length}</div>
       </div>
       <div>
         <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Avg / entry</div>
         <div className="font-mono text-[18px] font-bold text-ink-primary mt-0.5 tabular-nums">
           {businessProfile?.currencySymbol || '₹'}{Math.round(avgEntry).toLocaleString('en-IN')}
         </div>
       </div>
     </div>
     {totalITC > 0 && (
       <div className="mt-3 pt-3 border-t border-black/5 flex items-center justify-between">
         <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Claimable ITC</span>
         <span className="font-mono text-[14px] font-bold text-emerald-600 tabular-nums">
           {businessProfile?.currencySymbol || '₹'}{Math.round(totalITC).toLocaleString('en-IN')}
         </span>
       </div>
     )}
   </div>

   {/* Category breakdown bars */}
   {railCats.length > 0 && (
     <div className="rounded-bento border border-black/5 bg-white shadow-sm p-5">
       <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">// where it went</div>
       {railCats.map(([cat, val]) => (
         <button
           key={cat}
           onClick={() => setCategoryFilter(cat === categoryFilter ? 'ALL' : cat)}
           className={`block w-full text-left mb-3 last:mb-0 group ${categoryFilter === cat ? 'opacity-100' : 'opacity-90 hover:opacity-100'}`}
         >
           <div className="flex items-center justify-between mb-1.5">
             <span className={`text-[11px] font-semibold uppercase tracking-wide ${categoryFilter === cat ? 'text-amber-700' : 'text-gray-500 group-hover:text-ink-primary'}`}>{cat}</span>
             <span className="font-mono text-[12px] font-bold text-ink-primary tabular-nums">
               {businessProfile?.currencySymbol || '₹'}{Math.round(val).toLocaleString('en-IN')}
             </span>
           </div>
           <div className="h-[5px] rounded-full bg-black/[0.06] overflow-hidden">
             <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${railMax ? Math.max(Math.round(val / railMax * 100), 3) : 0}%` }} />
           </div>
           <div className="text-[10px] text-gray-400 font-medium mt-1 tabular-nums">
             {totalExpenses ? Math.round(val / totalExpenses * 100) : 0}% of outflow
           </div>
         </button>
       ))}
     </div>
   )}
 </aside>
 </div>
 </div>

 {/* Expense Form Modal */}
 {isAdding && (
 <div className="modal-overlay">
 <div className="glass-modal">
 {/* ── Header ───────────────────────────────────────── */}
 <div className="flex items-center justify-between mb-6">
   <div className="flex items-center gap-3.5">
     <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
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
 <div className="rounded-2xl bg-amber-500/5 border border-amber-500/15 px-5 py-4 focus-within:border-amber-500/40 focus-within:ring-4 focus-within:ring-amber-500/10 transition-all">
   <label htmlFor="exp-amount" className="block text-[11px] font-bold uppercase tracking-widest text-amber-500/80 mb-1">Amount</label>
   <div className="flex items-center">
     <span className="font-mono text-3xl font-bold text-amber-400 mr-2 leading-none">{businessProfile?.currencySymbol || '₹'}</span>
     <input
       id="exp-amount"
       required
       autoFocus
       type="number"
       step="0.01"
       min="0.01"
       inputMode="decimal"
       placeholder="0.00"
       className="flex-1 w-full bg-transparent border-none p-0 font-mono font-bold text-4xl text-ink-primary outline-none tabular-nums placeholder:text-ink-primary/20"
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
       className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500/40 focus:ring-4 focus:ring-amber-500/10 transition-all appearance-none cursor-pointer"
       value={formData.category}
       onChange={e => {
         if (e.target.value === '__ADD__') { setNewCategory(''); return; }
         setFormData({...formData, category: e.target.value});
       }}
     >
       {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
     </select>
     {/* Quick add a new category inline. */}
     <div className="flex items-center gap-2 mt-2">
       <input
         type="text"
         value={newCategory}
         onChange={e => setNewCategory(e.target.value)}
         placeholder="+ New category"
         className="flex-1 bg-canvas border border-black/8 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-primary outline-none focus:border-amber-500/40 placeholder:text-gray-400"
       />
       <button
         type="button"
         disabled={!newCategory.trim()}
         onClick={async () => {
           const name = newCategory.trim();
           if (!name) return;
           await addExpenseCategory(name);
           setFormData(f => ({ ...f, category: name }));
           setNewCategory('');
         }}
         className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 text-xs font-bold disabled:opacity-40"
       >Add</button>
     </div>
     {customCategories.length > 0 && (
       <div className="flex flex-wrap gap-1.5 mt-2">
         {customCategories.map(c => (
           <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-gray-100 text-gray-600 text-[10px] font-bold">
             {c}
             <button
               type="button"
               title="Remove category"
               onClick={() => { if (window.confirm(`Remove category "${c}"? Existing expenses keep it.`)) deleteExpenseCategory(c); }}
               className="text-gray-400 hover:text-red-500"
             >✕</button>
           </span>
         ))}
       </div>
     )}
   </div>
   <div>
     <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Paid Via</label>
     <select
       className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500/40 focus:ring-4 focus:ring-amber-500/10 transition-all appearance-none cursor-pointer"
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
     className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500/40 focus:ring-4 focus:ring-amber-500/10 transition-all"
     value={formData.date}
     onChange={e => setFormData({...formData, date: e.target.value})}
   />
 </div>

 {/* ── Paid from store (multi-store only) ──────────────── */}
 {posStores.length > 1 && (
 <div>
   <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Paid From Store</label>
   <select
     className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500/40 focus:ring-4 focus:ring-amber-500/10 transition-all appearance-none cursor-pointer"
     value={formData.location_id}
     onChange={e => setFormData({...formData, location_id: e.target.value})}
   >
     <option value="">Business-wide (no store)</option>
     {posStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
   </select>
 </div>
 )}

 {/* ── Description (optional) ──────────────────────────── */}
 <div>
   <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
     Description <span className="text-gray-400 font-medium normal-case tracking-normal">· optional</span>
   </label>
   <textarea
     rows={2}
     placeholder="E.g. Fuel for delivery van, office supplies…"
     className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 font-medium text-sm text-ink-primary outline-none focus:border-amber-500/40 focus:ring-4 focus:ring-amber-500/10 transition-all resize-none placeholder:text-gray-400"
     value={formData.note}
     onChange={e => setFormData({...formData, note: e.target.value})}
   />
 </div>

 {/* ── GST / input tax credit ─────────────────────────── */}
 <div className="rounded-xl border border-black/8 bg-white overflow-hidden">
   <label className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer">
     <div className="flex items-center gap-3">
       <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${formData.gst_claimable ? 'bg-amber-500/10 text-amber-500' : 'bg-canvas text-gray-400'}`}>
         <Receipt size={16} />
       </div>
       <div>
         <div className="text-sm font-bold text-ink-primary">Claim GST (input tax credit)</div>
         <div className="text-[11px] text-gray-500">For registered vendors with a GSTIN</div>
       </div>
     </div>
     <button
       type="button"
       role="switch"
       aria-checked={formData.gst_claimable}
       onClick={() => setFormData({ ...formData, gst_claimable: !formData.gst_claimable })}
       className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-amber-500/20 shrink-0 ${formData.gst_claimable ? 'bg-amber-500' : 'bg-black/15'}`}
     >
       <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${formData.gst_claimable ? 'translate-x-5' : 'translate-x-0'}`} />
     </button>
   </label>
   {formData.gst_claimable && (
     <div className="px-4 pb-4 pt-1 border-t border-black/5 space-y-3">
       <div className="grid grid-cols-2 gap-3">
         <div>
           <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">GST Rate</label>
           <select
             className="w-full bg-canvas border border-black/10 rounded-xl px-3 py-2.5 font-semibold text-sm text-ink-primary outline-none focus:border-amber-500/40 focus:ring-4 focus:ring-amber-500/10 transition-all appearance-none cursor-pointer"
             value={formData.gst_rate}
             onChange={e => setFormData({ ...formData, gst_rate: e.target.value })}
           >
             <option value="5">5%</option>
             <option value="12">12%</option>
             <option value="18">18%</option>
             <option value="28">28%</option>
             <option value="0">0% / Exempt</option>
           </select>
         </div>
         <div>
           <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">ITC (incl.)</label>
           <div className="px-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15 text-sm font-bold text-amber-600 tabular-nums font-mono">
             {(() => {
               const amt = parseFloat(formData.amount) || 0;
               const r = parseFloat(formData.gst_rate) || 0;
               const g = r > 0 ? amt - amt / (1 + r / 100) : 0;
               return `${businessProfile?.currencySymbol || '₹'}${g.toFixed(2)}`;
             })()}
           </div>
         </div>
       </div>
       <div>
         <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Vendor GSTIN</label>
         <input
           type="text"
           maxLength={15}
           placeholder="29ABCDE1234F1Z5"
           className="w-full bg-canvas border border-black/10 rounded-xl px-3 py-2.5 font-semibold text-sm uppercase tracking-wide text-ink-primary outline-none focus:border-amber-500/40 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-gray-400 placeholder:normal-case"
           value={formData.vendor_gstin}
           onChange={e => setFormData({ ...formData, vendor_gstin: e.target.value.toUpperCase() })}
         />
       </div>
     </div>
   )}
 </div>

 {/* ── Repeat monthly (new expense only) ──────────────── */}
 {!editingExpense && (
   <label className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-black/8 bg-white cursor-pointer hover:border-black/15 transition-colors">
     <div className="flex items-center gap-3">
       <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${formData.repeat_monthly ? 'bg-amber-500/10 text-amber-500' : 'bg-canvas text-gray-400'}`}>
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
       className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-amber-500/20 shrink-0 ${formData.repeat_monthly ? 'bg-amber-500' : 'bg-black/15'}`}
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
   <button type="submit" disabled={saving} className="flex-1 h-[52px] text-xs uppercase tracking-widest font-black flex items-center justify-center gap-2.5 px-6 rounded-pill bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
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
