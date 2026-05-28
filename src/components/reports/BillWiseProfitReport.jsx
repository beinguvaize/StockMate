/**
 * BillWiseProfitReport — one row per sale: revenue, cost, profit, margin.
 * Item revenue = qty * rate (fallback sellingPrice). Item cost = qty * costPrice.
 */
import React, { useState, useMemo } from 'react';
import {
  TrendingUp, DollarSign, BarChart3, Calendar, Download,
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

const KPI = ({ label, value, icon: Icon, color = '#6366f1', loading }) => (
  <div className="bg-white rounded-2xl border border-black/5 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color + '18' }}>
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
  const [preset, setPreset]       = useState('MONTH');
  const [range,  setRange]        = useState(() => presetRange('MONTH'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: sales, loading } = useReportData({
    table: 'sales', select: 'id, date, totalAmount, customerInfo, shopId, items',
    dateColumn: 'date', filters,
  });
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
      const cost = fifoBySale[s.id] != null
        ? fifoBySale[s.id]
        : items.reduce((acc, it) => acc + calcItemCost(it, costById), 0);
      const profit  = revenue - cost;
      const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;
      const customer = s.customerInfo?.name || 'Walk-in';
      const ref      = `SALE-${(s.id || '').slice(0,8).toUpperCase()}`;
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
        <KPI label="Total Revenue" loading={loading} value={formatCurrency(totals.totalRevenue)}      icon={TrendingUp}  color="#6366f1" />
        <KPI label="Total Cost"    loading={loading} value={formatCurrency(totals.totalCost)}         icon={DollarSign}  color="#f59e0b" />
        <KPI label="Total Profit"  loading={loading} value={formatCurrency(totals.totalProfit)}       icon={BarChart3}   color="#10b981" />
        <KPI label="Blended Margin" loading={loading} value={`${totals.blendedMargin.toFixed(1)}%`}  icon={TrendingUp}  color="#8b5cf6" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-center justify-between">
          <SectionHead title="Bill-wise Breakdown" sub={`${rows.length} bills`} />
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No data for selected period</div>
        ) : (
          <div>
            <div className="grid grid-cols-[90px_160px_1fr_110px_110px_110px_90px] gap-3 px-6 py-2 bg-canvas/50 border-b border-black/5">
              {['Date','Reference','Customer','Revenue','Cost','Profit','Margin %'].map(h => (
                <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
              ))}
            </div>
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[90px_160px_1fr_110px_110px_110px_90px] gap-3 px-6 py-3.5 items-center border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors">
                <span className="text-xs font-bold text-ink-secondary tabular-nums">{row.date}</span>
                <span className="text-xs font-bold font-mono text-ink-primary truncate">{row.ref}</span>
                <span className="text-xs font-bold text-ink-primary truncate">{row.customer}</span>
                <span className="text-xs font-black text-ink-primary tabular-nums">{formatCurrency(row.revenue)}</span>
                <span className="text-xs font-bold text-ink-secondary tabular-nums">{formatCurrency(row.cost)}</span>
                <span className={`text-xs font-black tabular-nums ${row.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {formatCurrency(row.profit)}
                </span>
                <span className={`text-xs font-black tabular-nums ${row.margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {row.margin.toFixed(1)}%
                </span>
              </div>
            ))}
            {/* Totals footer */}
            <div className="grid grid-cols-[90px_160px_1fr_110px_110px_110px_90px] gap-3 px-6 py-3.5 border-t border-black/5 bg-canvas/30">
              <span />
              <span />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Totals</span>
              <span className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(totals.totalRevenue)}</span>
              <span className="text-sm font-black text-ink-secondary tabular-nums">{formatCurrency(totals.totalCost)}</span>
              <span className={`text-sm font-black tabular-nums ${totals.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatCurrency(totals.totalProfit)}
              </span>
              <span className={`text-sm font-black tabular-nums ${totals.blendedMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {totals.blendedMargin.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BillWiseProfitReport;
