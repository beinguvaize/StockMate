/**
 * CategoryProfitReport — Item Category-wise Profit & Loss.
 * Explodes each sale's items array, resolves category via product map.
 */
import React, { useState, useMemo } from 'react';
import {
  TrendingUp, DollarSign, Tag, BarChart3, Calendar, Download,
} from 'lucide-react';
import useReportData from './useReportData';
import { isCountableSale } from './reportUtils';
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

const CategoryProfitReport = () => {
  const [preset, setPreset]           = useState('TODAY');
  const [range,  setRange]            = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: salesRaw,    loading: sLoading } = useReportData({ table: 'sales',    select: '*', dateColumn: 'date', filters });
  const sales = useMemo(() => salesRaw.filter(isCountableSale), [salesRaw]);
  const { data: products, loading: pLoading } = useReportData({ table: 'products', select: 'id, name, category, costPrice' });
  // FIFO truth — when a sale's batches were consumed, use the actual
  // unit_cost at that moment instead of the current products.costPrice.
  // Same data BillWiseProfitReport reads, so the two reports now agree.
  const { data: consumption } = useReportData({
    table: 'sale_batch_consumption',
    select: 'sale_id, product_id, qty_taken, unit_cost',
  });

  const loading = sLoading || pLoading;

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };
  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  // Build product id → category + costPrice map. Sales items don't carry
  // costPrice (cart only saves rate/quantity), so COGS is resolved from
  // the products table at report time — same as Bill Profit.
  const productMap = useMemo(() => {
    const m = {};
    products.forEach(p => {
      if (!p.id) return;
      m[p.id] = {
        category: p.category || 'Uncategorized',
        cost:     Number(p.costPrice || 0),
      };
    });
    return m;
  }, [products]);

  const { rows, kpis } = useMemo(() => {
    // (sale_id, product_id) → FIFO cost actually consumed. Falls through
    // to current products.costPrice when this sale has no batch trail
    // (legacy data or no FIFO setup yet) — same fallback BillWiseProfit
    // uses, so the two reports now match.
    const fifoByKey = {};
    const takenByKey = {};
    (consumption || []).forEach(c => {
      const k = `${c.sale_id}::${c.product_id}`;
      fifoByKey[k]  = (fifoByKey[k]  || 0) + Number(c.qty_taken || 0) * Number(c.unit_cost || 0);
      takenByKey[k] = (takenByKey[k] || 0) + Number(c.qty_taken || 0);
    });

    const catMap = {};

    sales.forEach(s => {
      const items = Array.isArray(s.items) ? s.items : [];
      items.forEach(item => {
        const pid      = item.id || item.productId || null;
        const prod     = pid ? productMap[pid] : null;
        const category = prod?.category || item.category || 'Uncategorized';
        if (!catMap[category]) catMap[category] = { category, units: 0, revenue: 0, cost: 0 };
        const qty  = Number(item.quantity || 0);
        const rate = Number(item.rate || item.sellingPrice || 0);
        // Batch cost for the covered part + cost-price fallback for the
        // uncovered remainder. Using batch rows alone undercounted whenever
        // only part of the quantity had batch coverage (manual stock top-ups
        // have no batch), inflating profit on those units to 100%.
        const key = pid ? `${s.id}::${pid}` : null;
        const fifoCost = key ? (fifoByKey[key] || 0) : 0;
        const taken    = key ? (takenByKey[key] || 0) : 0;
        const unitCost = Number(item.costPrice ?? prod?.cost ?? 0);
        const cost = fifoCost + Math.max(0, qty - taken) * unitCost;
        catMap[category].units   += qty;
        catMap[category].revenue += qty * rate;
        catMap[category].cost    += cost;
      });
    });

    const totalRevenue = Object.values(catMap).reduce((s, c) => s + c.revenue, 0);

    const rows = Object.values(catMap)
      .map(c => ({
        ...c,
        profit: c.revenue - c.cost,
        margin: c.revenue > 0 ? ((c.revenue - c.cost) / c.revenue) * 100 : 0,
        share:  totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalProfit   = rows.reduce((s, r) => s + r.profit, 0);
    // (memo deps below already include consumption via productMap closure)
    const blendedMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      rows,
      kpis: {
        categoryCount: rows.length,
        totalRevenue,
        totalProfit,
        blendedMargin,
      },
    };
  }, [sales, productMap, consumption]);

  const exportCSV = () => {
    const csvRows = [
      ['Category', 'Units Sold', 'Revenue', 'Cost', 'Profit', 'Margin %', 'Share %'],
      ...rows.map(r => [r.category, r.units, r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(2), r.share.toFixed(2)]),
    ];
    const csv  = csvRows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `category_profit_${range.start}_${range.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-primary leading-none">
            Category Profit & Loss<span className="text-accent-signature">.</span>
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
        <KPI label="Categories"     loading={loading} value={kpis.categoryCount}                   icon={Tag}        color="#8b5cf6" />
        <KPI label="Total Revenue"  loading={loading} value={formatCurrency(kpis.totalRevenue)}    icon={TrendingUp} color="var(--color-accent-signature)" />
        <KPI label="Total Profit"   loading={loading} value={formatCurrency(kpis.totalProfit)}     icon={DollarSign} color="#10b981" />
        <KPI label="Blended Margin" loading={loading} value={`${kpis.blendedMargin.toFixed(1)}%`} icon={BarChart3}  color="#f59e0b" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-center justify-between">
          <SectionHead title="Category Breakdown" sub="ranked by revenue" />
          {!loading && (
            <span className="text-[10px] font-black text-gray-400 bg-canvas px-2 py-1 rounded-full">
              {rows.length} categories
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No sales data for selected period</div>
        ) : (
          <div>
            <div className="grid grid-cols-[36px_1fr_80px_120px_120px_120px_90px_140px] gap-4 px-6 py-2 bg-canvas/50 border-b border-black/5">
              {['#', 'Category', 'Units', 'Revenue', 'Cost', 'Profit', 'Margin', 'Share'].map(h => (
                <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
              ))}
            </div>
            {rows.map((row, i) => (
              <div key={row.category}
                className="grid grid-cols-[36px_1fr_80px_120px_120px_120px_90px_140px] gap-4 px-6 py-3.5 items-center border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors">
                <span className={`text-sm font-black tabular-nums ${i===0?'text-accent-signature':i===1?'text-gray-400':i===2?'text-accent-signature-hover':'text-ink-tertiary'}`}>
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-bold text-ink-primary truncate">{row.category}</div>
                </div>
                <span className="text-sm font-bold text-ink-secondary tabular-nums">{row.units}</span>
                <span className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(row.revenue)}</span>
                <span className="text-sm font-bold text-ink-secondary tabular-nums">{formatCurrency(row.cost)}</span>
                <span className={`text-sm font-black tabular-nums ${row.profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {formatCurrency(row.profit)}
                </span>
                <span className={`text-sm font-black tabular-nums ${row.margin < 0 ? 'text-red-500' : row.margin < 10 ? 'text-accent-signature' : 'text-emerald-600'}`}>
                  {row.margin.toFixed(1)}%
                </span>
                {/* Share bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-canvas overflow-hidden">
                    <div className="h-full rounded-full bg-accent-signature" style={{ width: `${Math.min(100, row.share)}%` }} />
                  </div>
                  <span className="text-[9px] font-black text-accent-signature w-8 text-right">{row.share.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryProfitReport;
