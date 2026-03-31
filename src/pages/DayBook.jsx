import React, { useState, useMemo, useEffect} from 'react';
import { useAppContext} from '../context/AppContext';
import { 
 Calendar, Save, ArrowUpRight, ArrowDownRight, 
 Calculator, BookOpen, Clock, AlertCircle, TrendingUp, TrendingDown, RefreshCcw
} from 'lucide-react';

const DayBook = () => {
 const { 
 sales, expenses, dayBook, updateDayBook, getDayBookForDate,
 businessProfile, hasPermission, loading, isViewOnly
} = useAppContext();
 
 const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
 const [manualOpeningBalance, setManualOpeningBalance] = useState('');
 const [isSaving, setIsSaving] = useState(false);
 const [message, setMessage] = useState(null);

 // Get previous day's record to get closing balance
 const previousDayRecord = useMemo(() => {
 if (!dayBook || dayBook.length === 0) return null;
 const sorted = [...dayBook].sort((a, b) => new Date(b.date) - new Date(a.date));
 return sorted.find(db => new Date(db.date) < new Date(selectedDate));
}, [dayBook, selectedDate]);

 // Current metrics for selected date
 const dailyMetrics = useMemo(() => {
 const dateStr = selectedDate;
 const getLocalDate = (d) => new Date(d).toISOString().split('T')[0];

 const cashSales = (sales || [])
 .filter(o => getLocalDate(o.date) === dateStr && o.status !== 'CANCELLED' && o.payment_type === 'cash')
 .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
 
 const cost = (expenses || [])
 .filter(e => getLocalDate(e.date) === dateStr)
 .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
 
 return { sales: cashSales, cost};
}, [sales, expenses, selectedDate]);

 // Check if we have an existing record for today
 const existingRecord = useMemo(() => {
 return getDayBookForDate(selectedDate);
}, [getDayBookForDate, selectedDate]);

 // Logic for opening balance
 const openingBalance = useMemo(() => {
 if (manualOpeningBalance !== '') return parseFloat(manualOpeningBalance) || 0;
 if (existingRecord) return existingRecord.opening_balance;
 return previousDayRecord ? (previousDayRecord.closing_balance || 0) : 0;
}, [existingRecord, manualOpeningBalance, previousDayRecord]);

 const closingBalance = useMemo(() => {
 return openingBalance + dailyMetrics.sales - dailyMetrics.cost;
}, [openingBalance, dailyMetrics]);

 const handleSave = async (lock = false) => {
 setIsSaving(true);
 const record = {
 ...existingRecord,
 date: selectedDate,
 opening_balance: openingBalance,
 closing_balance: closingBalance,
 total_sales: dailyMetrics.sales,
 total_expenses: dailyMetrics.cost,
 is_closed: lock || (existingRecord?.is_closed || false)
};
 
 const result = await updateDayBook(record);
 if (result) {
 setMessage({ type: 'success', text: lock ? 'Day closed and locked.' : 'Day Book synchronized successfully.'});
 setTimeout(() => setMessage(null), 3000);
} else {
 setMessage({ type: 'error', text: 'Failed to sync Day Book.'});
}
 setIsSaving(false);
};

 if (loading) return <div className="p-20 text-center animate-pulse font-semibold opacity-60">Synchronizing Ledger...</div>;

 return (
 <div className="animate-fade-in flex flex-col gap-4 pb-20">
 {/* Header */}
 <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-4 border-b border-black/5">
 <div>
 <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">DAY BOOK<span className="text-accent-signature">.</span></h1>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">DAILY FINANCIAL BALANCE & LEDGER</p>
 </div>
 
 <div className="flex items-center gap-4 bg-surface p-1.5 rounded-pill border border-black/5 shadow-premium">
 <div className="flex items-center gap-3 px-4 py-2 border-r border-black/5">
 <Calendar size={16} className="text-accent-signature" />
 <input 
 type="date" 
 className="bg-transparent font-semibold text-xs text-ink-primary outline-none"
 value={selectedDate}
 onChange={(e) => {
 setSelectedDate(e.target.value);
 setManualOpeningBalance('');
}}
 />
 </div>
 {existingRecord?.is_closed ? (
 <div className="flex items-center gap-3 px-6 py-2 bg-red-50 text-red-600 rounded-pill border border-red-100 font-semibold text-[10px]">
 <Clock size={14} /> Day Locked
 </div>
 ) : (
 <div className="flex gap-2">
 <button 
 onClick={() => handleSave(false)}
 disabled={isSaving || isViewOnly()}
 className={`h-10 px-6 rounded-pill text-[10px] font-semibold border border-black/10 hover:bg-black/5 transition-all ${isSaving ? 'opacity-[0.85]' : ''}`}
 >
 SAVE DRAFT
 </button>
 <button 
 onClick={() => handleSave(true)}
 disabled={isSaving || isViewOnly()}
 className={`btn-signature !h-10 !px-6 !rounded-pill !text-[10px] flex items-center gap-3 ${isSaving ? 'opacity-[0.85] grayscale' : ''}`}
 >
 {isSaving ? 'CLOSING...' : 'CLOSE DAY'}
 <div className="icon-nest !w-6 !h-6">
 <Save size={12} className={isSaving ? 'animate-spin' : ''} />
 </div>
 </button>
 </div>
 )}
 </div>
 </div>

 {message && (
 <div className={`p-4 rounded-lg flex items-center gap-4 border animate-scale-in ${message.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
 <AlertCircle size={18} />
 <span className="text-xs font-semibold">{message.text}</span>
 </div>
 )}

 <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
 {/* Main Ledger Card */}
 <div className="lg:col-span-8 space-y-6">
 <div className="glass-panel border-black/5 bg-white shadow-premium !p-5 relative overflow-hidden">
 <div className="absolute top-0 right-0 p-5 opacity-[0.03] rotate-12 pointer-events-none">
 <BookOpen size={200} />
 </div>

 {/* Opening Balance Section */}
 <div className="mb-12 border-b border-black/5 pb-8">
 <div className="flex justify-between items-start mb-6">
 <div>
 <h2 className="text-sm font-semibold text-ink-primary mb-1">Opening Balance</h2>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">Cash in hand from previous session</p>
 </div>
 {!existingRecord?.is_closed && (
 <button 
 onClick={() => setManualOpeningBalance(openingBalance.toString())}
 className="text-[9px] font-semibold text-accent-signature-hover bg-accent-signature/10 px-3 py-1.5 rounded-pill border border-accent-signature/20 hover:bg-accent-signature/20 transition-all"
 >
 Edit Manually
 </button>
 )}
 </div>

 <div className="flex items-center gap-4">
 <div className="text-3xl md:text-6xl font-semibold text-ink-primary tabular-nums flex items-center">
 <span className="text-3xl opacity-20 mr-2">{businessProfile?.currencySymbol || '₹'}</span>
 {manualOpeningBalance !== '' ? (
 <input 
 type="number"
 className="bg-canvas rounded-lg px-6 py-2 w-64 outline-none focus:ring-4 focus:ring-accent-signature/20"
 value={manualOpeningBalance}
 onChange={(e) => setManualOpeningBalance(e.target.value)}
 autoFocus
 />
 ) : (
 openingBalance.toLocaleString()
 )}
 </div>
 {previousDayRecord && !existingRecord && manualOpeningBalance === '' && (
 <div className="flex flex-col">
 <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 italic">
 Auto-fetched from {new Date(previousDayRecord.date).toLocaleDateString()}
 </span>
 </div>
 )}
 </div>
 </div>

 {/* Dynamic Activity */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
 <div className="space-y-4">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-full bg-green-50 text-green-500 flex items-center justify-center border border-green-100">
 <ArrowUpRight size={16} />
 </div>
 <span className="text-[10px] font-semibold text-gray-700 opacity-70">Total Collections (Sales)</span>
 </div>
 <div className="text-4xl font-semibold text-ink-primary tabular-nums">
 <span className="text-xl opacity-20 mr-1">+</span>
 {businessProfile?.currencySymbol || '₹'}{dailyMetrics.sales.toLocaleString()}
 </div>
 <p className="text-[9px] font-bold text-gray-700 opacity-70 leading-relaxed italic">
 Includes all cash, credit, and digital payments recorded for this date.
 </p>
 </div>

 <div className="space-y-4">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center border border-red-100">
 <ArrowDownRight size={16} />
 </div>
 <span className="text-[10px] font-semibold text-gray-700 opacity-70">Total Expenditure (Expenses)</span>
 </div>
 <div className="text-4xl font-semibold text-ink-primary tabular-nums">
 <span className="text-xl opacity-20 mr-1">-</span>
 {businessProfile?.currencySymbol || '₹'}{dailyMetrics.cost.toLocaleString()}
 </div>
 <p className="text-[9px] font-bold text-gray-700 opacity-70 leading-relaxed italic">
 Operational costs, partner splits, and miscellaneous daily overhead.
 </p>
 </div>
 </div>

 {/* Closing Balance Footer */}
 <div className="bg-ink-primary rounded-xl p-5 text-surface shadow-2xl relative overflow-hidden">
 <div className="absolute top-0 right-0 p-5 opacity-10">
 <Calculator size={64} />
 </div>
 <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-5">
 <div>
 <h2 className="text-[10px] font-semibold text-surface/40 mb-2 leading-none">Net Closing Balance</h2>
 <div className="text-3xl md:text-6xl font-semibold text-accent-signature tabular-nums flex items-baseline">
 <span className="text-2xl mr-2 text-surface/20">{businessProfile?.currencySymbol || '₹'}</span>
 {closingBalance.toLocaleString()}
 </div>
 </div>
 <div className="text-right">
 <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-pill font-semibold text-[10px] ${closingBalance >= openingBalance ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
 {closingBalance >= openingBalance ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
 {closingBalance >= openingBalance ? 'Daily Surplus' : 'Daily Deficit'}
 </div>
 <p className="text-[10px] mt-4 font-bold text-surface/30 italic">Closing = Opening + Sales - Expenses</p>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Sidebar History */}
 <div className="lg:col-span-4 flex flex-col gap-4">
 <div className="glass-panel border-black/5 bg-surface/50 shadow-premium !p-6 !rounded-bento">
 <div className="flex items-center gap-3 mb-6">
 <Clock size={16} className="text-ink-primary opacity-60" />
 <h3 className="text-sm font-semibold text-ink-primary">Recent Logs</h3>
 </div>
 
 <div className="space-y-3">
 {dayBook.slice(0, 5).map(log => (
 <div 
 key={log.id} 
 className={`p-4 rounded-lg border bg-white cursor-pointer transition-all hover:scale-[1.02] ${selectedDate === log.date ? 'border-accent-signature ring-1 ring-accent-signature' : 'border-black/5 hover:border-black/10'}`}
 onClick={() => setSelectedDate(log.date)}
 >
 <div className="flex justify-between items-start mb-2">
 <span className="text-[10px] font-semibold text-ink-primary">{new Date(log.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric'})}</span>
 <span className={`text-[8px] font-semibold px-2 py-0.5 rounded-full ${log.closing_balance >= log.opening_balance ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
 {log.closing_balance >= log.opening_balance ? '+' : '-'}{Math.abs(log.closing_balance - log.opening_balance).toLocaleString()}
 </span>
 </div>
 <div className="text-lg font-semibold text-ink-primary">
 {businessProfile?.currencySymbol || '₹'}{log.closing_balance?.toLocaleString()}
 </div>
 </div>
 ))}
 
 {dayBook.length === 0 && (
 <div className="py-12 text-center opacity-20 italic text-sm font-semibold">
 No ledger history
 </div>
 )}
 </div>
 </div>
 
 <div className="glass-panel border-black/5 shadow-premium !p-5 bg-accent-signature text-black !rounded-bento">
 <h4 className="text-xs font-semibold mb-4">Account Note.</h4>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">
 The Day Book serves as a master record for physical cash reconciliation. Ensure all POS transactions are verified before syncing the ledger for the day.
 </p>
 </div>
 </div>
 </div>
 </div>
 );
};

export default DayBook;
