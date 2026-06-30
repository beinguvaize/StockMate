import React, { useState, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useDayBookData } from '../hooks/useDayBookData';
import { useNotifications } from '../context/NotificationContext';
import { useInventory } from '../hooks/useInventory';
import { PageSkeleton } from '../components/ui/States';
import {
  Calendar, Save, ChevronLeft, ChevronRight,
  ArrowUpRight, ArrowDownRight, RefreshCcw,
  FileText, ShieldCheck, Lock, Unlock,
  Banknote, CreditCard, Building2, Receipt,
  TrendingUp, TrendingDown, Clock, AlertTriangle,
  Users, ShoppingCart, CheckCircle2, History,
  BarChart2, ChevronDown, ChevronUp
} from 'lucide-react';
import DailyLedgerDetail from '../components/reports/DailyLedgerDetail';
import BankReconciliation from '../components/daybook/BankReconciliation';
import { todayISOInAppTZ } from '../lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const displayDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

// ── Method Badge ─────────────────────────────────────────────────────────────
const MethodBadge = ({ method = '' }) => {
  const m = (method || '').toUpperCase();
  if (m === 'CREDIT')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 text-[8px] font-bold uppercase tracking-wider"><CreditCard size={9} />Credit</span>;
  if (['BANK','UPI','TRANSFER','NEFT','RTGS'].includes(m))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 text-[8px] font-bold uppercase tracking-wider"><Building2 size={9} />{m === 'UPI' ? 'UPI' : 'Bank'}</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-canvas text-gray-500 border border-black/5 text-[8px] font-bold uppercase tracking-wider"><Banknote size={9} />Cash</span>;
};

// ── KPI Card ──────────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, icon, color = 'default', cy }) => {
  const styles = {
    default:  'bg-white border-black/5 text-ink-primary',
    green:    'bg-emerald-50 border-emerald-100 text-emerald-600',
    red:      'bg-red-50 border-red-100 text-red-600',
    dark:     'bg-ink-primary border-transparent text-accent-signature',
    darkred:  'bg-red-600 border-transparent text-white',
  };
  const labelColor = { default: 'text-gray-400', green: 'text-emerald-500/70', red: 'text-red-500/70', dark: 'text-white/40', darkred: 'text-red-200' };
  const isDark = color === 'dark' || color === 'darkred';
  return (
    <div className={`p-5 rounded-2xl border flex flex-col gap-2 ${styles[color]}`}>
      <div className="flex items-center justify-between">
        <p className={`text-[9px] font-bold uppercase tracking-widest ${labelColor[color]}`}>{label}</p>
        {icon && <span className={isDark ? 'opacity-40' : 'opacity-60'}>{icon}</span>}
      </div>
      <p className="font-mono text-2xl font-bold tabular-nums leading-none">
        <span className="text-xs opacity-40 mr-0.5">{cy}</span>
        {value}
      </p>
      {sub && <p className={`text-[9px] font-bold ${isDark ? 'opacity-50' : 'opacity-60'}`}>{sub}</p>}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const DayBook = () => {
  const { hasPermission, currentUser } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const currentUserId = currentUser?.id || null;
  const [selectedDate,  setSelectedDate]  = useState(todayISOInAppTZ());
  const {
    sales, expenses, clientPayments, purchases, supplierPayments, dayBook,
    loading: dbLoading, updateDayBook, getDayBookForDate, getPrevDayBook,
  } = useDayBookData(currentTenantId, selectedDate);
  const { addNotification } = useNotifications();
  const { inventoryLocations } = useInventory(currentTenantId);

  const ALL_STORES = '00000000-0000-0000-0000-000000000000';
  const posStores = (inventoryLocations || []).filter(l => (l.type || 'WAREHOUSE') !== 'VEHICLE' && !l.deleted_at);

  const cy = businessProfile?.currencySymbol || '₹';
  const today = todayISOInAppTZ();
  const [storeFilter,   setStoreFilter]   = useState(ALL_STORES); // ALL_STORES = whole business
  const [openingInput,  setOpeningInput]  = useState('');
  const [physicalCash,  setPhysicalCash]  = useState('');
  const [isSaving,      setIsSaving]      = useState(false);
  const [isClosing,     setIsClosing]     = useState(false);
  const [showReport,    setShowReport]    = useState(false);
  const [showHistory,   setShowHistory]   = useState(false);

  // ── Ledger computation ────────────────────────────────────────────────────
  const ledger = useMemo(() => {
    // When a specific store is selected, segment sales by their store
    // (location_id). "All stores" (sentinel) keeps the whole-business view.
    const storeMatch = (s) => storeFilter === ALL_STORES || (s.location_id || ALL_STORES) === storeFilter;
    const daySales      = (sales      || []).filter(s => s.date === selectedDate && storeMatch(s));
    const dayExpenses   = (expenses   || []).filter(e => e.date === selectedDate && storeMatch(e));
    const dayCollect    = (clientPayments || []).filter(p => p.date === selectedDate);
    const dayPurchases  = (purchases  || []).filter(p => p.date === selectedDate);
    // Supplier (credit-purchase) repayments made on this date. No location_id on
    // the table → business-wide, shown in every store view (like collections).
    const daySupPays    = (supplierPayments || []).filter(p => p.date === selectedDate);

    // ── Receipts ─────────────────────────────────────────────────────────────
    const paidOf = (s) => Number(s.paidAmount ?? s.paid_amount) || 0;
    // Amount actually collected today for a sale: full bill when paid, else the
    // received (partial) portion — so a part-paid cash sale counts only what
    // came in, not the whole bill.
    const recv = (s) => {
      const t = Number(s.totalAmount) || 0;
      const st = (s.paymentStatus ?? s.status ?? '').toUpperCase();
      if (st === 'PAID' || st === 'COMPLETED') return t;
      return Math.min(paidOf(s), t);
    };
    const isBank = (m) => ['BANK','UPI','TRANSFER'].includes((m || '').toUpperCase());
    const cashSales   = daySales.filter(s => (s.paymentMethod || '').toUpperCase() === 'CASH')
                                .reduce((t, s) => t + recv(s), 0);
    const bankSales   = daySales.filter(s => isBank(s.paymentMethod))
                                .reduce((t, s) => t + recv(s), 0);
    // Receivable = the UNPAID remainder of EVERY sale (any method) — incl. partial
    // cash/UPI sales, not just credit-method ones.
    const creditSales = daySales.reduce((t, s) => t + Math.max(0, (Number(s.totalAmount) || 0) - recv(s)), 0);
    // Money received up front on credit-method sales (hits the drawer today).
    const creditPaid  = daySales.filter(s => (s.paymentMethod || '').toUpperCase() === 'CREDIT')
                                .reduce((t, s) => t + recv(s), 0);
    const cashCollect = dayCollect.filter(p => (p.payment_method || '').toUpperCase() === 'CASH')
                                  .reduce((t, p) => t + (Number(p.amount) || 0), 0);
    const bankCollect = dayCollect.filter(p => ['BANK','UPI','TRANSFER','NEFT','RTGS'].includes((p.payment_method || '').toUpperCase()))
                                  .reduce((t, p) => t + (Number(p.amount) || 0), 0);
    // cashIn = money that hits the physical cash drawer (incl. amounts paid up
    // front on partial credit sales).
    const cashIn       = cashSales + cashCollect + creditPaid;
    const bankIn       = bankSales + bankCollect;
    const totalReceipts = cashIn + bankIn; // full display total

    // ── Payments ─────────────────────────────────────────────────────────────
    const isCash = (m) => (m || 'CASH').toUpperCase() === 'CASH';
    const totalExpenses   = dayExpenses.reduce((t, e) => t + (Number(e.amount) || 0), 0);
    // Only CASH expenses leave the physical drawer; bank/UPI/card don't.
    const cashExpenses    = dayExpenses.filter(e => isCash(e.payment_method))
      .reduce((t, e) => t + (Number(e.amount) || 0), 0);
    const bankExpenses    = totalExpenses - cashExpenses;
    // Cash purchases are paid in full at purchase time (process_purchase adds
    // no supplier_payment row for them). Credit-purchase repayments arrive
    // later as supplier_payments — counted separately below, so no double-count.
    const cashPurchPaid   = dayPurchases
      .filter(p => (p.payment_type || 'CASH').toUpperCase() === 'CASH')
      .reduce((t, p) => t + (Number(p.total_amount) || 0), 0);
    const bankPurchPaid   = dayPurchases
      .filter(p => ['BANK','UPI','TRANSFER'].includes((p.payment_type || '').toUpperCase()))
      .reduce((t, p) => t + (Number(p.total_amount) || 0), 0);
    // Supplier repayments (credit purchases settled later). Cash → drawer.
    const cashSupPay      = daySupPays.filter(p => isCash(p.payment_method))
      .reduce((t, p) => t + (Number(p.amount) || 0), 0);
    const bankSupPay      = daySupPays.filter(p => !isCash(p.payment_method))
      .reduce((t, p) => t + (Number(p.amount) || 0), 0);
    const totalPurchPaid  = cashPurchPaid + bankPurchPaid + cashSupPay + bankSupPay; // display
    // cashOut = money leaving the physical cash drawer
    const cashOut        = cashExpenses + cashPurchPaid + cashSupPay;
    const totalPayments  = cashOut + bankPurchPaid + bankSupPay + bankExpenses; // full display total

    // ── Balances ─────────────────────────────────────────────────────────────
    const record      = getDayBookForDate(selectedDate, storeFilter);
    const prevRecord  = getPrevDayBook(selectedDate, storeFilter);
    const openingBal  = Number(record?.opening_balance) || 0;
    // Closing = cash only (bank receipts/payments don't move the cash drawer)
    const closingBal  = openingBal + cashIn - cashOut;
    const isLocked          = !!record?.is_closed;
    const closedAt          = record?.closed_at || null;
    const hasOpening        = !!record?.id;
    const savedPhysicalCash = record?.physical_cash != null ? Number(record.physical_cash) : null;
    const savedVariance     = record?.variance      != null ? Number(record.variance)      : null;

    // ── Transaction log ───────────────────────────────────────────────────────
    const entries = [
      ...daySales.map(s => {
        const tot = Number(s.totalAmount) || 0;
        const got = recv(s);
        const due = Math.max(0, tot - got);
        const items = s.items?.map(i => i.name || i.productName).filter(Boolean).slice(0, 3).join(', ') || '';
        return {
          id:        s.id,
          type:      (s.paymentMethod || '').toUpperCase() === 'CREDIT' ? 'CREDIT_SALE' : 'INCOME',
          category:  'Sale',
          title:     s.customerInfo?.name ? `Sale — ${s.customerInfo.name}` : 'Sale (Walk-in)',
          // Show received vs due so partial payments are explicit.
          note:      due > 0 ? `${items}${items ? ' · ' : ''}Paid ${got} of ${tot} · due ${due}` : items,
          method:    s.paymentMethod || 'CASH',
          amount:    got,
          createdAt: s.created_at || selectedDate,
        };
      }),
      ...dayCollect.map(p => ({
        id:        p.id,
        type:      'INCOME',
        category:  'Collection',
        title:     'Client Collection',
        note:      p.notes || '',
        method:    p.payment_method || 'CASH',
        amount:    Number(p.amount) || 0,
        createdAt: p.created_at || selectedDate,
      })),
      ...dayExpenses.map(e => ({
        id:        e.id,
        type:      'EXPENSE',
        category:  e.category || 'Expense',
        title:     e.category || 'Expense',
        note:      e.note || '',
        method:    e.payment_method || 'CASH',
        amount:    Number(e.amount) || 0,
        createdAt: e.created_at || selectedDate,
      })),
      ...dayPurchases.map(p => ({
        id:        p.id,
        type:      'EXPENSE',
        category:  'Purchase',
        title:     'Purchase Payment',
        note:      `Supplier payment`,
        method:    p.payment_type || 'CASH',
        amount:    Number(p.total_amount) || 0,
        createdAt: p.created_at || selectedDate,
      })),
      ...daySupPays.map(p => ({
        id:        p.id,
        type:      'EXPENSE',
        category:  'Supplier Payment',
        title:     p.supplier_name ? `Supplier — ${p.supplier_name}` : 'Supplier Payment',
        note:      p.purchase_id ? 'Order settlement' : 'On-account',
        method:    p.payment_method || 'CASH',
        amount:    Number(p.amount) || 0,
        createdAt: p.created_at || selectedDate,
      })),
    ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Running balance — physical cash drawer only. Credit sales and any
    // bank/UPI/card line don't move cash, so the final running value ties out
    // to closingBal.
    let running = openingBal;
    const entriesWithBal = entries.map(e => {
      if (e.type !== 'CREDIT_SALE' && isCash(e.method)) {
        running = e.type === 'INCOME' ? running + e.amount : running - e.amount;
      }
      return { ...e, runningBalance: running };
    });

    return {
      openingBal, closingBal, isLocked, closedAt, hasOpening,
      savedPhysicalCash, savedVariance,
      cashSales, bankSales, creditSales,
      cashCollect, bankCollect,
      cashIn, bankIn, cashOut, bankPurchPaid,
      cashExpenses, bankExpenses, cashSupPay, bankSupPay,
      totalReceipts, totalExpenses, cashPurchPaid, totalPurchPaid, totalPayments,
      entries: entriesWithBal,
      sales: daySales, expenses: dayExpenses, collect: dayCollect,
      txCount: entries.filter(e => e.type !== 'CREDIT_SALE').length,
      prevClosing: Number(prevRecord?.closing_balance) || null,
      expenseCount: dayExpenses.length,
      collectCount: dayCollect.length,
    };
  }, [sales, expenses, clientPayments, purchases, supplierPayments, selectedDate, storeFilter, getDayBookForDate, getPrevDayBook]);

  // ── Weekly P&L ───────────────────────────────────────────────────────────
  const weekPL = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    const dow = (d.getDay() + 6) % 7; // 0=Mon … 6=Sun
    const ws = new Date(d); ws.setDate(d.getDate() - dow);
    const we = new Date(ws); we.setDate(ws.getDate() + 6);
    const wsStr = ws.toISOString().slice(0, 10);
    const weStr = we.toISOString().slice(0, 10);

    const wSales     = (sales     || []).filter(s => s.date >= wsStr && s.date <= weStr && !s.deleted_at);
    const wExpenses  = (expenses  || []).filter(e => e.date >= wsStr && e.date <= weStr);
    const wPurchases = (purchases || []).filter(p => p.date >= wsStr && p.date <= weStr);

    const revenue = wSales.reduce((t, s) => t + (Number(s.totalAmount) || 0), 0);

    let cogs = 0; let hasCost = false;
    wSales.forEach(s => {
      (s.items || []).forEach(item => {
        const cp = Number(item.costPrice) || 0;
        if (cp > 0) hasCost = true;
        cogs += cp * (Number(item.quantity) || 0);
      });
    });

    const grossProfit   = revenue - cogs;
    const grossMargin   = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const totalExpenses = wExpenses.reduce((t, e) => t + (Number(e.amount) || 0), 0);
    const purchaseCost  = wPurchases.reduce((t, p) => t + (Number(p.total_amount) || 0), 0);
    const netProfit     = grossProfit - totalExpenses;

    return { wsStr, weStr, revenue, cogs, hasCost, grossProfit, grossMargin, totalExpenses, purchaseCost, netProfit, salesCount: wSales.length };
  }, [sales, expenses, purchases, selectedDate]);

  const [showWeekPL, setShowWeekPL] = useState(true);

  const isDeficit  = ledger.closingBal < 0;
  const variance   = physicalCash !== '' ? (parseFloat(physicalCash) || 0) - ledger.closingBal : null;
  const isFuture   = selectedDate > today;

  // Load saved physical cash when date changes
  React.useEffect(() => {
    setPhysicalCash(ledger.savedPhysicalCash != null ? String(ledger.savedPhysicalCash) : '');
  }, [selectedDate, storeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleSaveOpening = async () => {
    if (isSaving || !openingInput) return;
    setIsSaving(true);
    const { error } = await updateDayBook({
      date: selectedDate,
      location_id: storeFilter,
      opening_balance: parseFloat(openingInput),
    });
    setIsSaving(false);
    if (error) {
      console.error('Save opening error:', error);
      addNotification?.(`Could not save opening balance: ${error.message || 'error'}`, 'error');
      return; // keep the input so the user can retry
    }
    addNotification?.('Opening balance saved', 'success');
    setOpeningInput('');
  };

  const handleUseYesterdayClosing = async () => {
    if (!ledger.prevClosing) return;
    setIsSaving(true);
    const { error } = await updateDayBook({
      date: selectedDate,
      location_id: storeFilter,
      opening_balance: ledger.prevClosing,
    });
    if (error) console.error('Carry forward error:', error);
    setIsSaving(false);
  };

  const handleSavePhysicalCash = async () => {
    const pc = parseFloat(physicalCash);
    if (isNaN(pc)) return;
    const v = Math.round((pc - ledger.closingBal) * 100) / 100;
    await updateDayBook({
      date:            selectedDate,
      location_id:     storeFilter,
      opening_balance: ledger.openingBal,
      physical_cash:   pc,
      variance:        v,
    });
  };

  const handleCloseDay = async () => {
    if (isClosing || !window.confirm(`Close ${displayDate(selectedDate)}? This locks the ledger.`)) return;
    setIsClosing(true);
    const pc = parseFloat(physicalCash);
    const { error } = await updateDayBook({
      date:             selectedDate,
      location_id:      storeFilter,
      opening_balance:  ledger.openingBal,
      closing_balance:  ledger.closingBal,
      total_sales:      ledger.cashSales + ledger.bankSales + ledger.creditSales,
      total_expenses:   ledger.totalExpenses + ledger.totalPurchPaid, // expenses + all purchases
      is_closed:        true,
      closed_at:        new Date().toISOString(),
      ...(isNaN(pc) ? {} : {
        physical_cash: pc,
        variance:      Math.round((pc - ledger.closingBal) * 100) / 100,
      }),
    });
    if (error) console.error('Close day error:', error);
    setIsClosing(false);
  };

  if (dbLoading) return <PageSkeleton cards={4} rows={9} />;

  // ── History full-page view ────────────────────────────────────────────────
  if (showHistory) {
    const totalDays    = dayBook.length;
    const closedDays   = dayBook.filter(r => r.is_closed).length;
    const totalSales   = dayBook.reduce((s, r) => s + (Number(r.total_sales)    || 0), 0);
    const totalExp     = dayBook.reduce((s, r) => s + (Number(r.total_expenses) || 0), 0);
    const discrepDays  = dayBook.filter(r => r.variance != null && Math.abs(Number(r.variance)) >= 0.01).length;
    const shortDays    = dayBook.filter(r => r.variance != null && Number(r.variance) < -0.01).length;

    return (
      <div className="animate-fade-in flex flex-col gap-6 pb-20">

        {/* Header */}
        <div className="flex justify-between items-center py-2 border-b border-black/5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory(false)}
              className="w-9 h-9 flex items-center justify-center bg-white border border-black/5 rounded-full hover:bg-canvas transition-all text-ink-primary shadow-sm"
            >
              <ChevronLeft size={16} />
            </button>
            <div>
              <h1 className="text-xl font-black font-sora text-ink-primary leading-none">
                Day Book History<span className="text-accent-signature">.</span>
              </h1>
              <span className="text-[10px] font-semibold text-gray-400">Click any day to view its ledger</span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{totalDays} records</span>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Total Days" cy="" value={totalDays}
            sub={`${closedDays} closed · ${discrepDays > 0 ? `${discrepDays} discrepancies` : 'no discrepancies'}`}
            icon={<Calendar size={14} />} color="default" />
          <KpiCard label="All-Time Sales" cy={cy} value={fmt(totalSales)} icon={<TrendingUp size={14} />} color="green" />
          <KpiCard label="All-Time Expenses" cy={cy} value={fmt(totalExp)} icon={<TrendingDown size={14} />} color="red" />
          <KpiCard label="Net Flow" cy={cy}
            value={`${totalSales - totalExp < 0 ? '−' : ''}${fmt(Math.abs(totalSales - totalExp))}`}
            icon={<CheckCircle2 size={14} />}
            color={totalSales - totalExp < 0 ? 'darkred' : 'dark'} />
        </div>

        {/* History table */}
        <div className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-black/5 flex items-center gap-3">
            <History size={14} className="text-accent-signature" />
            <span className="text-xs font-black text-ink-primary uppercase tracking-widest">All Days</span>
          </div>

          {dayBook.length === 0 ? (
            <div className="py-20 flex flex-col items-center opacity-20">
              <History size={32} strokeWidth={1.5} />
              <p className="text-[10px] font-bold uppercase tracking-widest mt-3">No history yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-canvas/60 border-b border-black/[0.04]">
                    {['Date', 'Opening', 'Sales', 'Expenses', 'Closing', 'Net', 'Discrepancy', 'Status', 'Closed At'].map(h => (
                      <th key={h} className="py-3 px-4 text-[9px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {[...dayBook]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map(rec => {
                      const isToday    = rec.date === today;
                      const isSel      = rec.date === selectedDate;
                      const isClosed   = !!rec.is_closed;
                      const net        = (Number(rec.total_sales) || 0) - (Number(rec.total_expenses) || 0);
                      const recVar     = rec.variance != null ? Number(rec.variance) : null;
                      const hasDiscrep = recVar != null && Math.abs(recVar) >= 0.01;
                      return (
                        <tr
                          key={rec.id || rec.date}
                          onClick={() => { setSelectedDate(rec.date); setShowHistory(false); }}
                          className={`cursor-pointer transition-colors hover:bg-accent-signature/5 ${isSel ? 'bg-accent-signature/10' : ''}`}
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[11px] font-black text-ink-primary">{displayDate(rec.date)}</span>
                              {isToday && (
                                <span className="text-[8px] font-bold text-accent-signature uppercase tracking-widest">Today</span>
                              )}
                              {isSel && !isToday && (
                                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Viewing</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-[10px] font-black text-ink-primary tabular-nums">
                            {cy}{fmt(rec.opening_balance)}
                          </td>
                          <td className="py-3.5 px-4 text-[10px] font-black text-emerald-600 tabular-nums">
                            {cy}{fmt(rec.total_sales)}
                          </td>
                          <td className="py-3.5 px-4 text-[10px] font-black text-red-500 tabular-nums">
                            {cy}{fmt(rec.total_expenses)}
                          </td>
                          <td className="py-3.5 px-4 text-[10px] font-black tabular-nums">
                            <span className={Number(rec.closing_balance) < 0 ? 'text-red-600' : 'text-ink-primary'}>
                              {cy}{fmt(rec.closing_balance)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-[10px] font-black tabular-nums">
                            <span className={net < 0 ? 'text-red-500' : 'text-emerald-600'}>
                              {net < 0 ? '−' : '+'}{cy}{fmt(Math.abs(net))}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {recVar == null ? (
                              <span className="text-[9px] text-gray-300 font-bold">—</span>
                            ) : !hasDiscrep ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[8px] font-bold">
                                <CheckCircle2 size={8} /> Balanced
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold border ${
                                recVar > 0
                                  ? 'bg-blue-50 text-blue-600 border-blue-100'
                                  : 'bg-red-50 text-red-600 border-red-100'
                              }`}>
                                <AlertTriangle size={8} />
                                {recVar > 0 ? '+' : '−'}{cy}{fmt(Math.abs(recVar))}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {isClosed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[8px] font-bold uppercase tracking-wider">
                                <Lock size={8} /> Closed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-full text-[8px] font-bold uppercase tracking-wider">
                                <Unlock size={8} /> Open
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-[9px] font-bold text-gray-400 whitespace-nowrap">
                            {rec.closed_at
                              ? new Date(rec.closed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6 pb-20">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center py-2 border-b border-black/5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black font-sora text-ink-primary leading-none">
            Day Book<span className="text-accent-signature">.</span>
          </h1>
          <span className="text-[10px] font-semibold text-gray-400 hidden sm:block">Cash & transaction ledger</span>
          {/* Store filter — per-store cash drawer when the tenant has >1 store. */}
          {posStores.length > 1 && (
            <select
              value={storeFilter}
              onChange={e => setStoreFilter(e.target.value)}
              className="ml-1 bg-white border border-black/8 rounded-pill px-3 py-1.5 text-[11px] font-bold text-ink-primary outline-none cursor-pointer shadow-sm"
            >
              <option value={ALL_STORES}>All Stores</option>
              {posStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-2 no-print">
          <button onClick={() => setSelectedDate(d => addDays(d, -1))}
            className="w-9 h-9 flex items-center justify-center bg-white border border-black/5 rounded-full hover:bg-canvas transition-all text-ink-primary shadow-sm">
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-black/5 shadow-sm min-w-[200px] justify-center">
            <Calendar size={13} className="text-gray-400" />
            <input type="date"
              className="bg-transparent border-none text-xs font-black outline-none cursor-pointer text-ink-primary"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            />
          </div>
          <button onClick={() => setSelectedDate(d => addDays(d, 1))}
            disabled={selectedDate >= today}
            className="w-9 h-9 flex items-center justify-center bg-white border border-black/5 rounded-full hover:bg-canvas transition-all text-ink-primary shadow-sm disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
          {selectedDate !== today && (
            <button onClick={() => setSelectedDate(today)}
              className="px-3 h-9 text-[9px] font-black uppercase tracking-widest bg-white border border-gray-300 shadow-sm rounded-full hover:bg-white transition-all text-gray-500">
              Today
            </button>
          )}
          <button onClick={() => setShowHistory(true)}
            className="flex items-center gap-2 px-4 h-9 bg-white border border-gray-300 shadow-sm text-gray-600 text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-white transition-all shadow-sm">
            <History size={12} />
            History
          </button>
          <button onClick={() => setShowReport(true)}
            className="flex items-center gap-2 px-4 h-9 bg-ink-primary text-white text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-black transition-all shadow-sm">
            <FileText size={12} />
            Report
          </button>
        </div>
      </div>

      {/* ── Date label + status ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-black text-ink-primary">{displayDate(selectedDate)}</span>
        {ledger.isLocked && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[9px] font-black uppercase tracking-widest">
            <Lock size={10} /> Closed
          </span>
        )}
        {!ledger.hasOpening && !isFuture && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-600 border border-amber-100 rounded-full text-[9px] font-black uppercase tracking-widest">
            <AlertTriangle size={10} /> Opening not set
          </span>
        )}
        {isFuture && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-canvas text-gray-400 border border-black/5 rounded-full text-[9px] font-black uppercase tracking-widest">
            Future date
          </span>
        )}
      </div>

      {/* ── Balance strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Opening Balance" cy={cy} value={fmt(ledger.openingBal)}
          icon={<Banknote size={14} />} color="default" />
        <KpiCard label="Cash Receipts" cy={cy} value={fmt(ledger.cashIn)}
          sub={`${ledger.txCount} transactions · bank: ${cy}${fmt(ledger.bankIn)}`}
          icon={<ArrowUpRight size={14} />} color="green" />
        <KpiCard label="Cash Payments" cy={cy} value={fmt(ledger.cashOut)}
          sub={`${ledger.expenseCount} expenses · bank purch: ${cy}${fmt(ledger.bankPurchPaid)}`}
          icon={<ArrowDownRight size={14} />} color="red" />
        <KpiCard label="Closing Balance" cy={cy}
          value={`${isDeficit ? '−' : ''}${fmt(Math.abs(ledger.closingBal))}`}
          sub={isDeficit ? 'Cash deficit' : ledger.isLocked ? 'Day closed' : 'Estimated'}
          icon={isDeficit ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          color={isDeficit ? 'darkred' : 'dark'} />
      </div>

      {/* ── Weekly P&L ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowWeekPL(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between border-b border-black/5 hover:bg-canvas/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <BarChart2 size={14} className="text-accent-signature" />
            <span className="text-xs font-black text-ink-primary uppercase tracking-widest">Weekly P&amp;L</span>
            <span className="text-[9px] font-bold text-gray-400">{weekPL.wsStr} → {weekPL.weStr}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] font-black tabular-nums ${weekPL.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {weekPL.netProfit >= 0 ? '+' : '−'}{cy}{fmt(Math.abs(weekPL.netProfit))} net
            </span>
            {showWeekPL ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
        </button>

        {showWeekPL && (
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Revenue',       val: weekPL.revenue,       color: 'text-emerald-600', sub: `${weekPL.salesCount} sales` },
                { label: 'Cost of Goods', val: weekPL.cogs,          color: 'text-orange-500',  sub: weekPL.hasCost ? 'from items' : 'no cost price set' },
                { label: 'Gross Profit',  val: weekPL.grossProfit,   color: weekPL.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500',
                  sub: `${weekPL.grossMargin.toFixed(1)}% margin` },
                { label: 'Expenses',      val: weekPL.totalExpenses, color: 'text-red-500',     sub: 'operating' },
                { label: 'Purchases',     val: weekPL.purchaseCost,  color: 'text-amber-600',   sub: 'stock bought' },
                { label: 'Net Profit',    val: weekPL.netProfit,     color: weekPL.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600',
                  sub: 'gross − expenses', bold: true },
              ].map(({ label, val, color, sub, bold }) => (
                <div key={label} className={`flex flex-col gap-1 ${bold ? 'bg-canvas rounded-xl p-3' : ''}`}>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>
                  <span className={`font-mono font-black tabular-nums ${bold ? 'text-lg' : 'text-sm'} ${color}`}>
                    {val < 0 ? '−' : ''}{cy}{fmt(Math.abs(val))}
                  </span>
                  <span className="text-[8px] text-gray-400">{sub}</span>
                </div>
              ))}
            </div>

            {!weekPL.hasCost && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-[9px] font-bold text-amber-700">
                <AlertTriangle size={11} />
                Gross Profit = ₹0 because no cost price is set on products. Set cost price in Inventory to see accurate margins.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Transaction log ───────────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">

          {/* Table header */}
          <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Receipt size={14} className="text-accent-signature" />
              <span className="text-xs font-black text-ink-primary uppercase tracking-widest">
                Transaction Log
              </span>
              <span className="bg-white border border-gray-300 shadow-sm text-[9px] font-black text-gray-400 px-2 py-0.5 rounded-full">
                {ledger.txCount}
              </span>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
              ledger.cashIn >= ledger.cashOut
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-red-50 text-red-600'
            }`}>
              {ledger.cashIn >= ledger.cashOut
                ? <TrendingUp size={11} />
                : <TrendingDown size={11} />}
              Net {cy}{fmt(Math.abs(ledger.cashIn - ledger.cashOut))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas/60 border-b border-black/[0.04]">
                  {['Time', 'Description', 'Type', 'Method', 'In (+)', 'Out (−)', 'Balance'].map(h => (
                    <th key={h} className="py-3 px-4 text-[9px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap last:text-right">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {ledger.entries.length === 0 && (
                  <tr>
                    <td colSpan="7" className="py-16 text-center">
                      <div className="flex flex-col items-center opacity-20">
                        <Receipt size={32} strokeWidth={1.5} />
                        <span className="text-[10px] font-bold uppercase tracking-widest mt-3">
                          No transactions for this date
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                {ledger.entries.map((tx, i) => {
                  const isCreditSale = tx.type === 'CREDIT_SALE';
                  const isIncome     = tx.type === 'INCOME';
                  const catColor = {
                    Sale:       'bg-emerald-50 text-emerald-600',
                    Collection: 'bg-blue-50 text-blue-600',
                    Purchase:   'bg-orange-50 text-orange-600',
                  }[tx.category] || 'bg-gray-50 text-gray-500';

                  return (
                    <tr key={tx.id || i}
                      className={`hover:bg-canvas/30 transition-colors ${isCreditSale ? 'opacity-50' : ''}`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <Clock size={9} className="text-gray-300" />
                          <span className="text-[9px] font-black font-mono tabular-nums text-ink-primary">
                            {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-[160px]">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                            isIncome ? 'bg-emerald-50 text-emerald-500' : 'bg-red-50 text-red-500'
                          } ${isCreditSale ? 'opacity-40' : ''}`}>
                            {isIncome ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-ink-primary leading-none truncate">{tx.title}</p>
                            {tx.note && <p className="text-[9px] text-gray-400 mt-0.5 truncate">{tx.note}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${catColor}`}>
                          {isCreditSale ? 'Credit' : tx.category}
                        </span>
                      </td>
                      <td className="py-3 px-4"><MethodBadge method={tx.method} /></td>
                      <td className="py-3 px-4">
                        {isIncome && !isCreditSale
                          ? <span className="text-[11px] font-black text-emerald-600 tabular-nums">{cy}{fmt(tx.amount)}</span>
                          : isCreditSale
                            ? <span className="text-[9px] font-bold text-gray-300 tabular-nums italic">{cy}{fmt(tx.amount)}</span>
                            : <span className="text-gray-200">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        {!isIncome && !isCreditSale
                          ? <span className="text-[11px] font-black text-red-600 tabular-nums">{cy}{fmt(tx.amount)}</span>
                          : <span className="text-gray-200">—</span>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isCreditSale
                          ? <span className="text-gray-200 text-xs">—</span>
                          : <span className={`text-[11px] font-black tabular-nums ${tx.runningBalance < 0 ? 'text-red-500' : 'text-ink-primary'}`}>
                              {tx.runningBalance < 0 ? '−' : ''}{cy}{fmt(Math.abs(tx.runningBalance))}
                            </span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Credit sales footnote */}
          {ledger.creditSales > 0 && (
            <div className="px-6 py-3 border-t border-black/[0.04] bg-blue-50/40 flex items-center gap-2">
              <CreditCard size={11} className="text-blue-400" />
              <span className="text-[9px] font-bold text-blue-500">
                {cy}{fmt(ledger.creditSales)} in credit sales (receivable — not included in cash flow)
              </span>
            </div>
          )}
        </div>

        {/* ── Right sidebar ──────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* ── Authorize / Opening Balance ───────────────────────────────── */}
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-5">
            <h2 className="text-[10px] font-black text-ink-primary mb-4 uppercase tracking-widest flex items-center gap-2">
              <Lock size={12} className="text-accent-signature" /> Opening Balance
            </h2>

            {/* Equation */}
            <div className="space-y-2 mb-4 pb-4 border-b border-black/5">
              {[
                { label: 'Opening',         val: ledger.openingBal, color: 'text-ink-primary' },
                { label: '+ Cash Receipts', val: ledger.cashIn,     color: 'text-emerald-600' },
                { label: '− Cash Payments', val: ledger.cashOut,    color: 'text-red-500'     },
              ].map(({ label, val, color }) => (
                <div key={label} className="flex justify-between text-[10px] font-bold text-gray-400">
                  <span>{label}</span>
                  <span className={`font-black tabular-nums ${color}`}>{cy}{fmt(val)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-black pt-2 border-t border-black/5">
                <span className="text-ink-primary">= Closing</span>
                <span className={`tabular-nums ${isDeficit ? 'text-red-600' : 'text-ink-primary'}`}>
                  {isDeficit ? '−' : ''}{cy}{fmt(Math.abs(ledger.closingBal))}
                </span>
              </div>
            </div>

            {ledger.isLocked ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-3">
                <ShieldCheck size={16} className="text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Day Closed & Locked</p>
                  {ledger.closedAt ? (
                    <p className="text-[9px] font-bold text-emerald-500 mt-0.5 flex items-center gap-1">
                      <Clock size={9} />
                      Closed at {new Date(ledger.closedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                  ) : (
                    <p className="text-[9px] font-bold text-emerald-500 mt-0.5">No further edits allowed</p>
                  )}
                </div>
              </div>
            ) : hasPermission('finance', 'edit') ? (
              <div className="space-y-2">
                {/* Carry forward button */}
                {ledger.prevClosing !== null && !ledger.hasOpening && (
                  <button onClick={handleUseYesterdayClosing} disabled={isSaving}
                    className="w-full h-10 flex items-center justify-center gap-2 bg-white border border-gray-300 shadow-sm rounded-xl text-[9px] font-black uppercase tracking-widest text-gray-600 hover:bg-black/5 transition-all">
                    <ChevronRight size={12} />
                    Use prev. closing ({cy}{fmt(ledger.prevClosing)})
                  </button>
                )}
                <div className="relative">
                  <input type="number" placeholder="Enter opening amount"
                    className="w-full h-11 bg-white border border-gray-300 shadow-sm rounded-xl px-4 pr-10 font-black text-sm outline-none focus:ring-2 focus:ring-accent-signature/20 tabular-nums"
                    value={openingInput}
                    onChange={e => setOpeningInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveOpening()}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-gray-300">{cy}</span>
                </div>
                <button onClick={handleSaveOpening} disabled={isSaving || !openingInput}
                  className="w-full h-11 bg-ink-primary text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-40">
                  {isSaving ? <RefreshCcw className="animate-spin" size={13} /> : <Save size={13} />}
                  Save Opening Balance
                </button>
              </div>
            ) : (
              <p className="text-[9px] font-bold text-gray-400 text-center uppercase tracking-widest">View-only</p>
            )}
          </div>

          {/* ── Receipts breakdown ────────────────────────────────────────── */}
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-5">
            <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <TrendingUp size={11} className="text-emerald-500" /> Receipts Breakdown
            </h3>
            <div className="space-y-2.5">
              {[
                { label: 'Cash Sales',        val: ledger.cashSales,   icon: <Banknote size={10} />,  color: 'text-emerald-600' },
                { label: 'Bank / UPI Sales',  val: ledger.bankSales,   icon: <Building2 size={10} />, color: 'text-amber-600'  },
                { label: 'Credit Sales',      val: ledger.creditSales, icon: <CreditCard size={10} />,color: 'text-blue-400', muted: true },
                { label: 'Cash Collections',  val: ledger.cashCollect, icon: <Users size={10} />,     color: 'text-emerald-600' },
                { label: 'Bank Collections',  val: ledger.bankCollect, icon: <Users size={10} />,     color: 'text-amber-600'  },
              ].map(({ label, val, icon, color, muted }) => (
                <div key={label} className={`flex items-center justify-between ${muted ? 'opacity-50' : ''}`}>
                  <div className={`flex items-center gap-1.5 text-[9px] font-bold text-gray-500 ${color}`}>
                    {icon} <span className="text-gray-500">{label}</span>
                    {muted && <span className="text-[8px] text-gray-400">(excl.)</span>}
                  </div>
                  <span className={`text-[10px] font-black tabular-nums ${val > 0 ? color : 'text-gray-300'}`}>
                    {cy}{fmt(val)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-black/5 text-[10px] font-black">
                <span className="text-ink-primary">Total Cash In</span>
                <span className="text-emerald-600 tabular-nums">{cy}{fmt(ledger.cashIn)}</span>
              </div>
              {ledger.bankIn > 0 && (
                <div className="flex justify-between text-[9px] font-bold text-gray-400">
                  <span>+ Bank / UPI In</span>
                  <span className="tabular-nums text-amber-500">{cy}{fmt(ledger.bankIn)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Payments breakdown ────────────────────────────────────────── */}
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-5">
            <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <TrendingDown size={11} className="text-red-500" /> Payments Breakdown
            </h3>
            <div className="space-y-2.5">
              {[
                { label: 'Expenses',          val: ledger.totalExpenses,  icon: <Receipt size={10} />,     color: 'text-red-500' },
                { label: 'Purchase Payments', val: ledger.totalPurchPaid, icon: <ShoppingCart size={10} />, color: 'text-orange-500' },
              ].map(({ label, val, icon, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className={`flex items-center gap-1.5 text-[9px] font-bold ${color}`}>
                    {icon} <span className="text-gray-500">{label}</span>
                  </div>
                  <span className={`text-[10px] font-black tabular-nums ${val > 0 ? color : 'text-gray-300'}`}>
                    {cy}{fmt(val)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-black/5 text-[10px] font-black">
                <span className="text-ink-primary">Total Cash Out</span>
                <span className="text-red-600 tabular-nums">{cy}{fmt(ledger.cashOut)}</span>
              </div>
              {ledger.bankPurchPaid > 0 && (
                <div className="flex justify-between text-[9px] font-bold text-gray-400">
                  <span>+ Bank / UPI Purchases</span>
                  <span className="tabular-nums text-amber-500">{cy}{fmt(ledger.bankPurchPaid)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Physical cash reconciliation ─────────────────────────────── */}
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-5">
            <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Banknote size={11} className="text-amber-500" /> Cash Reconciliation
              {ledger.savedVariance != null && (
                <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold ${
                  Math.abs(ledger.savedVariance) < 0.01
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                    : ledger.savedVariance > 0
                      ? 'bg-blue-50 text-blue-600 border border-blue-100'
                      : 'bg-red-50 text-red-600 border border-red-100'
                }`}>
                  <CheckCircle2 size={8} />
                  Saved
                </span>
              )}
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-bold text-gray-400">
                <span>Book Balance</span>
                <span className={`font-black tabular-nums ${isDeficit ? 'text-red-600' : 'text-ink-primary'}`}>
                  {cy}{fmt(ledger.closingBal)}
                </span>
              </div>
              <div className="relative">
                <input type="number" placeholder="Enter physical cash count"
                  className="w-full h-10 bg-white border border-gray-300 shadow-sm rounded-xl px-3 pr-8 text-xs font-black outline-none focus:ring-2 focus:ring-accent-signature/20 tabular-nums"
                  value={physicalCash}
                  onChange={e => setPhysicalCash(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300">{cy}</span>
              </div>
              {variance !== null && (
                <div className={`flex items-center justify-between p-3 rounded-xl text-[10px] font-black ${
                  Math.abs(variance) < 0.01
                    ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                    : variance > 0
                      ? 'bg-blue-50 border border-blue-100 text-blue-700'
                      : 'bg-red-50 border border-red-100 text-red-700'
                }`}>
                  <span>{Math.abs(variance) < 0.01 ? '✓ Balanced' : variance > 0 ? 'Cash Over' : 'Cash Short'}</span>
                  <span className="tabular-nums">
                    {Math.abs(variance) < 0.01 ? 'Exact match' : `${variance > 0 ? '+' : '−'}${cy}${fmt(Math.abs(variance))}`}
                  </span>
                </div>
              )}
              {variance !== null && !isFuture && (
                <button
                  onClick={handleSavePhysicalCash}
                  className="w-full h-9 flex items-center justify-center gap-2 bg-white border border-gray-300 shadow-sm rounded-xl text-[9px] font-black uppercase tracking-widest text-gray-600 hover:bg-black/5 transition-all"
                >
                  <Save size={11} /> Save Count
                </button>
              )}
            </div>
          </div>

          {/* ── Close Day ────────────────────────────────────────────────── */}
          {!ledger.isLocked && ledger.hasOpening && hasPermission('finance', 'edit') && !isFuture && (
            <button onClick={handleCloseDay} disabled={isClosing}
              className="w-full h-12 flex items-center justify-center gap-2 bg-ink-primary text-white font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-black transition-all shadow-sm disabled:opacity-40">
              {isClosing ? <RefreshCcw className="animate-spin" size={14} /> : <Lock size={14} />}
              Close & Lock Day
            </button>
          )}
          {ledger.isLocked && (
            <div className="flex items-center justify-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-2xl">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Day Closed</span>
            </div>
          )}

        </div>
      </div>

      {/* ── Bank Reconciliation ──────────────────────────────────────────── */}
      <BankReconciliation
        tenantId={currentTenantId}
        currentUserId={currentUserId}
        selectedDate={selectedDate}
        daySales={ledger.sales}
        dayCollect={ledger.collect}
        dayExpenses={ledger.expenses}
      />

      {/* ── Report modal ─────────────────────────────────────────────────────── */}
      {showReport && (
        <DailyLedgerDetail
          date={selectedDate}
          sales={ledger.sales}
          expenses={ledger.expenses}
          openingBalance={ledger.openingBal}
          closingBalance={ledger.closingBal}
          businessProfile={businessProfile}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
};

export default DayBook;
