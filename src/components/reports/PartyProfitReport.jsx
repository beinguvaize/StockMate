/**
 * PartyProfitReport — Party-wise Profit & Loss.
 * One row per customer: revenue, cost, profit, margin %.
 * Walk-in bucket for null/anonymous customers.
 */
import React, { useState, useMemo } from 'react';
import {
  TrendingUp, DollarSign, Users, BarChart3, Calendar, Download,
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
  return Number(item.quantity || 0) * Number(item.rate || item.sellingPrice || 0);
}
// Sale items don't carry costPrice — resolve from products lookup.
function calcItemCost(item, costById) {
  const qty  = Number(item.quantity || 0);
  const unit = Number(item.costPrice) ||
    (costById && (costById[item.id] || costById[item.productId])) || 0;
  return qty * unit;
}

const PartyProfitReport = () => {
  const [preset, setPreset]         = useState('MONTH');
  const [range,  setRange]          = useState(() => presetRange('MONTH'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: sales,    loading: sLoading } = useReportData({ table: 'sales',    select: '*', dateColumn: 'date', filters });
  const { data: clients,  loading: cLoading } = useReportData({ table: 'clients',  select: 'id, name' });
  const { data: products }                     = useReportData({ table: 'products', select: 'id, costPrice' });

  const loading = sLoading || cLoading;

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

  const costById = useMemo(() => {
    const m = {};
    products.forEach(p => { if (p.id) m[p.id] = Number(p.costPrice || 0); });
    return m;
  }, [products]);

  const { rows, kpis } = useMemo(() => {
    const partyMap = {};

    sales.forEach(s => {
      const cid  = s.customerInfo?.id || s.shopId || null;
      const name = (cid && clientMap[cid]) || s.customerInfo?.name || 'Walk-in';
      const key  = cid || `walkin_${name}`;

      if (!partyMap[key]) partyMap[key] = { name, revenue: 0, cost: 0, orders: 0 };

      const items = Array.isArray(s.items) ? s.items : [];
      if (items.length > 0) {
        items.forEach(item => {
          partyMap[key].revenue += calcItemRevenue(item);
          partyMap[key].cost    += calcItemCost(item, costById);
        });
      } else {
        // No item breakdown — use totalAmount as revenue, cost unknown
        partyMap[key].revenue += Number(s.totalAmount || 0);
      }
      partyMap[key].orders += 1;
    });

    const rows = Object.values(partyMap)
      .map(p => ({
        ...p,
        profit: p.revenue - p.cost,
        margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit);

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalProfit  = rows.reduce((s, r) => s + r.profit, 0);
    const blendedMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      rows,
      kpis: {
        totalRevenue,
        totalProfit,
        blendedMargin,
        customerCount: rows.length,
      },
    };
  }, [sales, clientMap, costById]);

  const exportCSV = () => {
    const csvRows = [
      ['Customer', 'Revenue', 'Cost', 'Profit', 'Margin %', 'Orders'],
      ...rows.map(r => [r.name, r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(2), r.orders]),
    ];
    const csv  = csvRows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `party_profit_${range.start}_${range.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-primary leading-none">
            Party Profit & Loss<span className="text-accent-signature">.</span>
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
        <KPI label="Total Revenue"   loading={loading} value={formatCurrency(kpis.totalRevenue)}   icon={TrendingUp}  color="#6366f1" />
        <KPI label="Total Profit"    loading={loading} value={formatCurrency(kpis.totalProfit)}    icon={DollarSign}  color="#10b981" />
        <KPI label="Blended Margin"  loading={loading} value={`${kpis.blendedMargin.toFixed(1)}%`} icon={BarChart3}   color="#f59e0b" />
        <KPI label="Customers"       loading={loading} value={kpis.customerCount}                   icon={Users}       color="#8b5cf6" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-center justify-between">
          <SectionHead title="Customer P&L" sub="ranked by profit" />
          {!loading && (
            <span className="text-[10px] font-black text-gray-400 bg-canvas px-2 py-1 rounded-full">
              {rows.length} parties
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No sales data for selected period</div>
        ) : (
          <div>
            <div className="grid grid-cols-[36px_1fr_120px_120px_120px_90px_100px] gap-4 px-6 py-2 bg-canvas/50 border-b border-black/5">
              {['#', 'Customer', 'Revenue', 'Cost', 'Profit', 'Margin', 'Orders'].map(h => (
                <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
              ))}
            </div>
            {rows.map((row, i) => (
              <div key={row.name}
                className={`grid grid-cols-[36px_1fr_120px_120px_120px_90px_100px] gap-4 px-6 py-3.5 items-center border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors`}>
                <span className={`text-sm font-black tabular-nums ${i===0?'text-amber-500':i===1?'text-gray-400':i===2?'text-amber-700':'text-ink-tertiary'}`}>
                  {i + 1}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-accent-signature/10 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-black text-accent-signature">{(row.name[0]||'?').toUpperCase()}</span>
                  </div>
                  <span className="text-sm font-bold text-ink-primary truncate">{row.name}</span>
                </div>
                <span className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(row.revenue)}</span>
                <span className="text-sm font-bold text-ink-secondary tabular-nums">{formatCurrency(row.cost)}</span>
                <span className={`text-sm font-black tabular-nums ${row.profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {formatCurrency(row.profit)}
                </span>
                <span className={`text-sm font-black tabular-nums ${row.margin < 0 ? 'text-red-500' : row.margin < 10 ? 'text-amber-500' : 'text-emerald-600'}`}>
                  {row.margin.toFixed(1)}%
                </span>
                <span className="text-sm font-bold text-ink-secondary tabular-nums">{row.orders}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PartyProfitReport;
