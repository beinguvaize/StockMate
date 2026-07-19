/**
 * BillWiseProfitReport — one row per sale: revenue, cost, profit, margin.
 * Item revenue = qty * rate (fallback sellingPrice). Item cost = qty * costPrice.
 */
import React, { useState, useMemo } from 'react';
import {
  TrendingUp, DollarSign, BarChart3, Calendar, Download,
} from 'lucide-react';
import useReportData from './useReportData';
import { isCountableSale } from './reportUtils';
import { formatCurrency, todayISOInAppTZ } from '../../lib/utils';
import DataTable, { inr, pct, signedColour } from '../ui/DataTable';

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
      const dow = now.getDay() || 7; // Sunday must count as end of the week, not its start
      const mon = new Date(now); mon.setDate(now.getDate() - dow + 1);
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

function calcItemRevenue(item) {
  const qty  = Number(item.quantity || 0);
  const rate = Number(item.rate || item.sellingPrice || 0);
  return qty * rate;
}

function calcItemCost(item, costById) {
  const qty = Number(item.quantity || 0);
  // Sale items rarely store costPrice — resolve from the products table.
  const unit = Number(item.costPrice) ||
    costById[item.id] || costById[item.productId] || 0;
  return qty * unit;
}

const BillWiseProfitReport = () => {
  const [preset, setPreset]       = useState('TODAY');
  const [range,  setRange]        = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: salesRaw, loading } = useReportData({
    table: 'sales', select: 'id, date, totalAmount, totalCogs, customerInfo, shopId, items, status, paymentStatus, voided_at',
    dateColumn: 'date', filters,
  });
  // Voided / cancelled sales owe nothing — keep them out of profit rows.
  const sales = useMemo(() => salesRaw.filter(isCountableSale), [salesRaw]);
  const { data: products } = useReportData({ table: 'products', select: 'id, costPrice' });
  // FIFO actual costs from batch consumption (where available). Per-sale
  // COGS uses these first, falls back to products.costPrice otherwise.
  const { data: consumption } = useReportData({
    table: 'sale_batch_consumption', select: 'sale_id, qty_taken, unit_cost',
  });

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };

  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  const { rows, totals } = useMemo(() => {
    const costById = {};
    products.forEach(p => { costById[p.id] = Number(p.costPrice || 0); });
    // sale_id → actual FIFO COGS from batch consumption rows.
    const fifoBySale = {};
    (consumption || []).forEach(c => {
      const v = Number(c.qty_taken || 0) * Number(c.unit_cost || 0);
      fifoBySale[c.sale_id] = (fifoBySale[c.sale_id] || 0) + v;
    });
    const rows = sales.map(s => {
      const items   = Array.isArray(s.items) ? s.items : [];
      const revenue = items.length > 0
        ? items.reduce((acc, it) => acc + calcItemRevenue(it), 0)
        : Number(s.totalAmount || 0);
      // sales.totalCogs is the source of truth (process_sale computes it,
      // including the cost-price fallback for unbatched stock). The batch
      // rows alone undercount when only part of a sale had batch coverage.
      const stored = Number(s.totalCogs);
      const cost = Number.isFinite(stored) && stored > 0
        ? stored
        : fifoBySale[s.id] != null
          ? fifoBySale[s.id]
          : items.reduce((acc, it) => acc + calcItemCost(it, costById), 0);
      const profit  = revenue - cost;
      const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;
      const customer = s.customerInfo?.name || 'Walk-in';
      const ref      = (s.id || '').toUpperCase(); // id already SAL-prefixed — no double wrap / truncation
      return { date: s.date || '', ref, customer, revenue, cost, profit, margin };
    }).sort((a, b) => b.date.localeCompare(a.date));

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalCost    = rows.reduce((s, r) => s + r.cost, 0);
    const totalProfit  = totalRevenue - totalCost;
    const blendedMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return { rows, totals: { totalRevenue, totalCost, totalProfit, blendedMargin } };
  }, [sales, products, consumption]);

  const exportCSV = () => {
    const r = [
      ['Date','Reference','Customer','Revenue','Cost','Profit','Margin %'],
      ...rows.map(r => [r.date, r.ref, r.customer, r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(1)+'%']),
    ];
    const csv  = r.map(row => row.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `billwise_profit_${range.start}_${range.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-primary leading-none">
            Bill-wise Profit<span className="text-accent-signature">.</span>
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

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Total Revenue" loading={loading} value={formatCurrency(totals.totalRevenue)}      icon={TrendingUp}  color="var(--color-accent-signature)" />
        <KPI label="Total Cost"    loading={loading} value={formatCurrency(totals.totalCost)}         icon={DollarSign}  color="#f59e0b" />
        <KPI label="Total Profit"  loading={loading} value={formatCurrency(totals.totalProfit)}       icon={BarChart3}   color="#10b981" />
        <KPI label="Blended Margin" loading={loading} value={`${totals.blendedMargin.toFixed(1)}%`}  icon={TrendingUp}  color="#8b5cf6" />
      </div>

      {/* Table — vendflow-style DataTable */}
      <DataTable
        title="Bill-wise Breakdown"
        subtitle={loading ? 'Loading…' : `${rows.length} bill${rows.length === 1 ? '' : 's'} for selected period`}
        emptyMessage={loading ? 'Loading bills…' : 'No bills in this period.'}
        columns={[
          { key: 'date',     label: 'Date',      align: 'left'  },
          { key: 'ref',      label: 'Reference', align: 'left'  },
          { key: 'customer', label: 'Customer',  align: 'left'  },
          { key: 'revenue',  label: 'Revenue',   align: 'right', numeric: true, fmt: inr },
          { key: 'cost',     label: 'COGS',      align: 'right', numeric: true, fmt: inr },
          { key: 'profit',   label: 'Gross Profit', align: 'right', numeric: true,
            fmt: inr, className: signedColour },
          { key: 'margin',   label: 'Margin',    align: 'right', numeric: true,
            fmt: pct, className: signedColour },
        ]}
        rows={rows}
        getRowKey={(r) => r.ref}
      />

      {/* Totals footer — single matching strip below the table */}
      {!loading && rows.length > 0 && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-2"
             style={{ fontFamily: '"Sora", Inter, sans-serif' }}>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Totals</span>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Revenue</span>
            <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">{inr(totals.totalRevenue)}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">COGS</span>
            <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">{inr(totals.totalCost)}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Gross Profit</span>
            <span className={`text-sm font-bold font-mono tabular-nums ${signedColour(totals.totalProfit)}`}>
              {inr(totals.totalProfit)}
            </span>
          </div>
          <div className="flex items-baseline gap-2 ml-auto">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Blended Margin</span>
            <span className={`text-base font-bold font-mono tabular-nums ${signedColour(totals.blendedMargin)}`}>
              {pct(totals.blendedMargin)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillWiseProfitReport;
