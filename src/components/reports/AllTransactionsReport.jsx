/**
 * AllTransactionsReport — unified chronological ledger.
 * Sources: sales (money in), client_payments (money in), purchases (money out), expenses (money out).
 * Expenses columns: id, date, amount, category, note (falls back gracefully if columns differ).
 */
import React, { useState, useMemo } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Calendar, Download,
  TrendingUp, TrendingDown, Activity, Hash,
} from 'lucide-react';
import useReportData from './useReportData';
import { formatCurrency, todayISOInAppTZ } from '../../lib/utils';

const today = todayISOInAppTZ();

const PRESETS = [
  { id: 'TODAY',   label: 'Today' },
  { id: 'WEEK',    label: 'This Week' },
  { id: 'MONTH',   label: 'This Month' },
  { id: 'QUARTER', label: 'Quarter' },
  { id: 'YEAR',    label: 'This Year' },
];

function presetRange(id) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  switch (id) {
    case 'TODAY': return { start: today, end: today };
    case 'WEEK': {
      const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
      return { start: fmt(mon), end: today };
    }
    case 'MONTH':
      return { start: `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`, end: today };
    case 'QUARTER': {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1);
      return { start: fmt(qStart), end: today };
    }
    case 'YEAR':
      return { start: `${now.getFullYear()}-01-01`, end: today };
    default: return { start: today, end: today };
  }
}

const SectionHead = ({ title, sub }) => (
  <div className="flex items-baseline gap-3 mb-4">
    <h2 className="text-base font-black text-ink-primary">{title}</h2>
    {sub && <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{sub}</span>}
  </div>
);

const KPI = ({ label, value, icon: Icon, color = 'var(--color-accent-signature)', loading }) => (
  <div className="bg-white rounded-2xl border border-black/5 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      <Icon size={16} style={{ color }} />
    </div>
    {loading
      ? <div className="h-7 w-24 bg-canvas animate-pulse rounded-lg" />
      : <div className="text-2xl font-black text-ink-primary tabular-nums leading-none">{value}</div>
    }
    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</div>
  </div>
);

const TYPE_FILTERS = ['ALL', 'Sale', 'Payment', 'Purchase', 'Expense'];

const TYPE_STYLE = {
  Sale:     { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  Payment:  { bg: 'bg-accent-signature/10',  text: 'text-accent-signature-hover' },
  Purchase: { bg: 'bg-blue-50',    text: 'text-blue-700' },
  Expense:  { bg: 'bg-red-50',     text: 'text-red-600' },
};

const AllTransactionsReport = () => {
  const [preset, setPreset]           = useState('TODAY');
  const [range,  setRange]            = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);
  const [typeFilter,  setTypeFilter]  = useState('ALL');

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: sales,    loading: sLoading } = useReportData({ table: 'sales',           select: 'id, date, totalAmount, paymentMethod, customerInfo, shopId', dateColumn: 'date', filters });
  const { data: payments, loading: pLoading } = useReportData({ table: 'client_payments', select: 'id, date, amount, client_id, payment_method',               dateColumn: 'date', filters });
  const { data: purchases,loading: puLoading} = useReportData({ table: 'purchases',       select: 'id, date, total_amount, supplier_name',                      dateColumn: 'date', filters });
  const { data: expenses, loading: eLoading } = useReportData({ table: 'expenses',        select: '*',                                                          dateColumn: 'date', filters });
  const { data: clients }                     = useReportData({ table: 'clients',          select: 'id, name' });

  const loading = sLoading || pLoading || puLoading || eLoading;

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };
  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  const clientMap = useMemo(() => {
    const m = {};
    clients.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [clients]);

  const { allRows, kpis } = useMemo(() => {
    const rows = [];

    sales.forEach(s => {
      const cid  = s.customerInfo?.id || s.shopId || null;
      const name = (cid && clientMap[cid]) || s.customerInfo?.name || 'Walk-in';
      rows.push({
        date:   s.date || '',
        type:   'Sale',
        party:  name,
        dir:    'in',
        amount: Number(s.totalAmount || 0),
        ref:    (s.id || '').toUpperCase(), // id already carries the SAL- prefix — no double wrap / truncation
      });
    });

    payments.forEach(p => {
      const name = (p.client_id && clientMap[p.client_id]) || 'Client';
      rows.push({
        date:   p.date || '',
        type:   'Payment',
        party:  name,
        dir:    'in',
        amount: Number(p.amount || 0),
        ref:    `PMT-${(p.id || '').slice(0,8).toUpperCase()}`,
      });
    });

    purchases.forEach(p => {
      rows.push({
        date:   p.date || '',
        type:   'Purchase',
        party:  p.supplier_name || 'Supplier',
        dir:    'out',
        amount: Number(p.total_amount || 0),
        ref:    `PUR-${(p.id || '').slice(0,8).toUpperCase()}`,
      });
    });

    expenses.forEach(e => {
      // Gracefully handle both note and description columns
      const desc = e.description || e.note || e.category || 'Expense';
      rows.push({
        date:   e.date || '',
        type:   'Expense',
        party:  desc,
        dir:    'out',
        amount: Number(e.amount || 0),
        ref:    `EXP-${(e.id || '').slice(0,8).toUpperCase()}`,
      });
    });

    // Sort newest first
    rows.sort((a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref));

    const totalIn  = rows.filter(r => r.dir === 'in').reduce((s, r) => s + r.amount, 0);
    const totalOut = rows.filter(r => r.dir === 'out').reduce((s, r) => s + r.amount, 0);

    return {
      allRows: rows,
      kpis: { totalIn, totalOut, net: totalIn - totalOut, count: rows.length },
    };
  }, [sales, payments, purchases, expenses, clientMap]);

  const filteredRows = useMemo(() =>
    typeFilter === 'ALL' ? allRows : allRows.filter(r => r.type === typeFilter),
    [allRows, typeFilter]
  );

  const exportCSV = () => {
    const csvRows = [
      ['Date', 'Type', 'Party / Description', 'Direction', 'Amount', 'Reference'],
      ...filteredRows.map(r => [r.date, r.type, r.party, r.dir === 'in' ? 'Money In' : 'Money Out', r.amount.toFixed(2), r.ref]),
    ];
    const csv  = csvRows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `all_transactions_${range.start}_${range.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-primary leading-none">
            All Transactions<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-1">
            {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-white border border-gray-300 shadow-sm rounded-xl p-1 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                preset === p.id ? 'bg-ink-primary text-white shadow-sm' : 'text-gray-500 hover:text-ink-primary hover:bg-white'
              }`}>{p.label}</button>
          ))}
          <button onClick={() => applyPreset('CUSTOM')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
              preset === 'CUSTOM' ? 'bg-ink-primary text-white' : 'text-gray-500 hover:text-ink-primary hover:bg-white'
            }`}>
            <Calendar size={11} /> Custom
          </button>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-black/8 bg-white text-xs font-black text-ink-primary hover:border-black/20 hover:shadow-sm transition-all">
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-black/5 shadow-sm">
          <Calendar size={14} className="text-gray-400 shrink-0" />
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20" />
          <span className="text-gray-400 text-xs font-bold">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20" />
          <button onClick={applyCustom}
            className="px-4 py-2 rounded-xl bg-ink-primary text-white text-xs font-black hover:bg-ink-primary/90 transition-all">
            Apply
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Money In"    loading={loading} value={formatCurrency(kpis.totalIn)}  icon={ArrowDownLeft}  color="#10b981" />
        <KPI label="Money Out"   loading={loading} value={formatCurrency(kpis.totalOut)} icon={ArrowUpRight}   color="#ef4444" />
        <KPI label="Net Flow"    loading={loading} value={formatCurrency(kpis.net)}      icon={kpis.net >= 0 ? TrendingUp : TrendingDown} color={kpis.net >= 0 ? 'var(--color-accent-signature)' : '#f59e0b'} />
        <KPI label="Transactions" loading={loading} value={kpis.count}                  icon={Hash}           color="#8b5cf6" />
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-1">Filter:</span>
        {TYPE_FILTERS.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
              typeFilter === t
                ? 'bg-ink-primary text-white border-ink-primary shadow-sm'
                : 'bg-white text-gray-500 border-black/8 hover:border-black/20 hover:text-ink-primary'
            }`}>
            {t}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-black text-gray-400 bg-canvas px-2 py-1 rounded-full">
          {filteredRows.length} transactions
        </span>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-black/5">
          <SectionHead title="Transaction Ledger" sub="newest first" />
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No transactions for selected period</div>
        ) : (
          <div>
            <div className="grid grid-cols-[90px_90px_1fr_90px_130px] gap-4 px-6 py-2 bg-canvas/50 border-b border-black/5">
              {['Date', 'Type', 'Party / Description', 'Flow', 'Amount'].map(h => (
                <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
              ))}
            </div>
            {filteredRows.map((row, i) => {
              const ts = TYPE_STYLE[row.type] || { bg: 'bg-gray-100', text: 'text-gray-600' };
              return (
                <div key={`${row.ref}-${i}`}
                  className="grid grid-cols-[90px_90px_1fr_90px_130px] gap-4 px-6 py-3.5 items-center border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors">
                  <span className="text-xs font-bold text-ink-secondary tabular-nums">{row.date}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black w-fit ${ts.bg} ${ts.text}`}>
                    {row.type}
                  </span>
                  <span className="text-xs font-bold text-ink-primary truncate">{row.party}</span>
                  <div className={`flex items-center gap-1 text-[10px] font-black ${row.dir === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {row.dir === 'in'
                      ? <ArrowDownLeft size={12} />
                      : <ArrowUpRight size={12} />
                    }
                    {row.dir === 'in' ? 'In' : 'Out'}
                  </div>
                  <span className={`text-sm font-black tabular-nums ${row.dir === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {row.dir === 'in' ? '+' : '-'}{formatCurrency(row.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AllTransactionsReport;
