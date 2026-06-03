/**
 * BusinessReport — single-page, premium business intelligence report.
 * No sub-tabs. Everything visible on one scroll.
 *
 * Sections:
 *  1. Date range filter + export
 *  2. KPI row  (revenue, orders, outstanding, purchases, top product)
 *  3. Daily revenue trend (area chart) + payment split (bar)
 *  4. Top products table
 *  5. Client leaderboard + daily summary side-by-side
 *  6. Purchases overview (by supplier + by product)
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import {
  TrendingUp, ShoppingBag, Clock, Package,
  User, Truck, Download, Calendar,
  ArrowUpRight, ArrowDownRight, Minus,
  ChevronRight, ChevronDown,
} from 'lucide-react';
import useReportData from './useReportData';
import { formatCurrency } from '../../lib/utils';
import { todayISOInAppTZ } from '../../lib/utils';

/* ─── Date preset helpers ─────────────────────────────────────────────────── */
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
    case 'TODAY':   return { start: today, end: today };
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

/* ─── Mini sparkline ──────────────────────────────────────────────────────── */
const Spark = ({ data = [], color = '#D97706' }) => (
  <ResponsiveContainer width="100%" height={36}>
    <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
      <defs>
        <linearGradient id={`sg_${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
        fill={`url(#sg_${color.replace('#','')})`} dot={false} isAnimationActive={false} />
    </AreaChart>
  </ResponsiveContainer>
);

/* ─── KPI card ────────────────────────────────────────────────────────────── */
const KPI = ({ label, value, sub, spark, color = '#D97706', icon: Icon, loading }) => (
  <div className="bg-white rounded-2xl border border-black/5 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center`}
        style={{ background: color + '18' }}>
        <Icon size={16} style={{ color }} />
      </div>
      {sub !== undefined && (
        <span className={`text-[10px] font-black flex items-center gap-0.5 ${
          sub > 0 ? 'text-emerald-500' : sub < 0 ? 'text-red-400' : 'text-gray-400'
        }`}>
          {sub > 0 ? <ArrowUpRight size={11} /> : sub < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
          {sub !== 0 ? `${Math.abs(sub).toFixed(1)}%` : '—'}
        </span>
      )}
    </div>
    {loading
      ? <div className="h-7 w-24 bg-canvas animate-pulse rounded-lg" />
      : <div className="font-mono text-2xl font-bold text-ink-primary tabular-nums leading-none">{value}</div>
    }
    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</div>
    {spark && spark.length > 1 && <Spark data={spark} color={color} />}
  </div>
);

/* ─── Section header ──────────────────────────────────────────────────────── */
const SectionHead = ({ title, sub }) => (
  <div className="flex items-baseline gap-3 mb-4">
    <h2 className="text-base font-black text-ink-primary">{title}</h2>
    {sub && <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{sub}</span>}
  </div>
);

/* ─── Custom tooltip ──────────────────────────────────────────────────────── */
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-black/8 rounded-xl px-3 py-2 shadow-lg text-xs">
      <div className="font-bold text-ink-secondary mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-black text-ink-primary">
            {typeof p.value === 'number' && p.name?.toLowerCase().includes('rev')
              ? formatCurrency(p.value)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════════════ */
const BusinessReport = () => {
  const [preset, setPreset]   = useState('MONTH');
  const [range,  setRange]    = useState(() => presetRange('MONTH'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: sales,     loading: salesLoading }     = useReportData({ table: 'sales',     select: '*', dateColumn: 'date', filters });
  const { data: purchases, loading: purchLoading }     = useReportData({ table: 'purchases', select: '*', dateColumn: 'date', filters });
  const { data: clients }                              = useReportData({ table: 'clients',   select: 'id, name, outstanding_balance' });
  const { data: vehicles }                             = useReportData({ table: 'vehicles',  select: 'id, plateNumber, name' });
  const { data: users }                                = useReportData({ table: 'users',     select: 'id, name, email' });

  const loading = salesLoading || purchLoading;

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };

  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  /* ── Sales aggregations ─────────────────────────────────────────────── */
  const salesMetrics = useMemo(() => {
    const totalRevenue = sales.reduce((s, x) => s + Number(x.totalAmount || 0), 0);
    const totalOrders  = sales.length;
    const aov          = totalOrders ? totalRevenue / totalOrders : 0;

    /* daily trend */
    const byDate = {};
    sales.forEach(s => {
      const d = s.date || '';
      if (!byDate[d]) byDate[d] = { date: d, revenue: 0, orders: 0 };
      byDate[d].revenue += Number(s.totalAmount || 0);
      byDate[d].orders  += 1;
    });
    const dailyTrend = Object.values(byDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, name: d.date.slice(5) })); // "MM-DD"

    /* payment split */
    const byMethod = {};
    sales.forEach(s => {
      const m = (s.paymentMethod || 'CASH').toUpperCase();
      byMethod[m] = (byMethod[m] || 0) + Number(s.totalAmount || 0);
    });
    const paymentSplit = Object.entries(byMethod)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    /* product performance */
    const prodMap = {};
    sales.forEach(s => {
      (Array.isArray(s.items) ? s.items : []).forEach(item => {
        const key = item.id || item.name || 'unknown';
        if (!prodMap[key]) prodMap[key] = { name: item.name || 'Unknown', qty: 0, revenue: 0, txCount: 0 };
        prodMap[key].qty     += Number(item.quantity || 0);
        prodMap[key].revenue += Number(item.quantity || 0) * Number(item.rate || 0);
        prodMap[key].txCount += 1;
      });
    });
    const topProducts = Object.values(prodMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((p, i) => ({ ...p, rank: i + 1, share: totalRevenue > 0 ? p.revenue / totalRevenue * 100 : 0 }));

    /* client leaderboard */
    const clientMap = {};
    sales.forEach(s => {
      const cid  = s.customerInfo?.id || s.shopId || null;
      const name = (cid && clients.find(c => c.id === cid)?.name) || s.customerInfo?.name || 'Walk-in';
      const key  = cid || `wk_${name}`;
      if (!clientMap[key]) clientMap[key] = { name, revenue: 0, orders: 0 };
      clientMap[key].revenue += Number(s.totalAmount || 0);
      clientMap[key].orders  += 1;
    });
    const topClients = Object.values(clientMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((c, i) => ({ ...c, rank: i + 1, share: totalRevenue > 0 ? c.revenue / totalRevenue * 100 : 0 }));

    /* outstanding */
    const outstanding = clients.reduce((s, c) => s + Number(c.outstanding_balance || 0), 0);

    return { totalRevenue, totalOrders, aov, dailyTrend, paymentSplit, topProducts, topClients, outstanding };
  }, [sales, clients]);

  /* ── Full transaction ledger (every sale in the period) ───────────────── */
  const transactions = useMemo(() => {
    const resolveName = (s) => {
      const cid = s.customerInfo?.id || s.shopId || null;
      return (cid && clients.find(c => c.id === cid)?.name) || s.customerInfo?.name || 'Walk-in';
    };
    return [...sales]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(s => ({
        date:    s.date || '',
        ref:     (s.id || '').slice(0, 8).toUpperCase(),
        client:  resolveName(s),
        items:   Array.isArray(s.items) ? s.items.reduce((n, i) => n + Number(i.quantity || 0), 0) : 0,
        payment: (s.paymentMethod || 'CASH').toUpperCase(),
        status:  (s.paymentStatus || s.status || 'PAID').toUpperCase(),
        amount:  Number(s.totalAmount || 0),
      }));
  }, [sales, clients]);

  /* ── Purchases aggregations ─────────────────────────────────────────── */
  const purchMetrics = useMemo(() => {
    const total      = purchases.reduce((s, p) => s + Number(p.total_amount || 0), 0);
    const totalUnits = purchases.reduce((s, p) => s + Number(p.quantity     || 0), 0);

    const bySupplier = {};
    purchases.forEach(p => {
      const s = p.supplier_name || 'Direct';
      if (!bySupplier[s]) bySupplier[s] = { name: s, amount: 0, orders: 0 };
      bySupplier[s].amount += Number(p.total_amount || 0);
      bySupplier[s].orders += 1;
    });
    const topSuppliers = Object.values(bySupplier)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
      .map((s, i) => ({ ...s, rank: i + 1, share: total > 0 ? s.amount / total * 100 : 0 }));

    return { total, totalUnits, topSuppliers };
  }, [purchases]);

  /* ── Export CSV ─────────────────────────────────────────────────────── */
  const exportCSV = useCallback(() => {
    const rows = [
      ['Date', 'Invoice', 'Customer', 'Amount', 'Payment', 'Status'],
      ...sales.map(s => [
        s.date, s.id?.slice(0,8)?.toUpperCase(),
        s.customerInfo?.name || 'Walk-in',
        s.totalAmount, s.paymentMethod, s.paymentStatus,
      ]),
    ];
    const csv  = rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `sales_report_${range.start}_${range.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [sales, range]);

  /* ── Bar colours ────────────────────────────────────────────────────── */
  const PAY_COLORS = { CASH: '#10b981', UPI: '#D97706', CREDIT: '#f59e0b', BANK: '#3b82f6', CARD: '#8b5cf6' };

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-8 pb-16">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-primary leading-none">
            Business Report<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-1">
            {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
          </p>
        </div>
        <div className="flex-1" />

        {/* Date presets */}
        <div className="flex items-center gap-1 bg-white border border-gray-300 shadow-sm rounded-xl p-1 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                preset === p.id
                  ? 'bg-ink-primary text-white shadow-sm'
                  : 'text-gray-500 hover:text-ink-primary hover:bg-white'
              }`}>
              {p.label}
            </button>
          ))}
          <button onClick={() => applyPreset('CUSTOM')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
              preset === 'CUSTOM' ? 'bg-ink-primary text-white' : 'text-gray-500 hover:text-ink-primary hover:bg-white'
            }`}>
            <Calendar size={11} /> Custom
          </button>
        </div>

        {/* Export */}
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

      {/* ── KPI ROW ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KPI label="Total Revenue"   loading={salesLoading}
          value={formatCurrency(salesMetrics.totalRevenue)}
          spark={salesMetrics.dailyTrend.map(d => ({ v: d.revenue }))}
          icon={TrendingUp} color="#D97706" />
        <KPI label="Total Orders"    loading={salesLoading}
          value={salesMetrics.totalOrders}
          spark={salesMetrics.dailyTrend.map(d => ({ v: d.orders }))}
          icon={ShoppingBag} color="#10b981" />
        <KPI label="Avg. Order Value" loading={salesLoading}
          value={formatCurrency(salesMetrics.aov)}
          icon={ChevronRight} color="#f59e0b" />
        <KPI label="Outstanding"     loading={false}
          value={formatCurrency(salesMetrics.outstanding)}
          icon={Clock} color="#ef4444" />
        <KPI label="Total Purchases" loading={purchLoading}
          value={formatCurrency(purchMetrics.total)}
          icon={Truck} color="#8b5cf6" />
      </div>

      {/* ── CHARTS ROW ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">

        {/* Daily revenue trend */}
        <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
          <SectionHead title="Revenue Trend" sub={`${salesMetrics.dailyTrend.length} days`} />
          {salesLoading
            ? <div className="h-48 bg-canvas animate-pulse rounded-xl" />
            : salesMetrics.dailyTrend.length < 2
            ? <div className="h-48 flex items-center justify-center text-xs text-gray-400">Not enough data for selected range</div>
            : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={salesMetrics.dailyTrend} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#D97706" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#D97706" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 600 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#D97706" strokeWidth={2}
                    fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: '#D97706', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
        </div>

        {/* Payment method split */}
        <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
          <SectionHead title="Payment Split" />
          {salesLoading
            ? <div className="h-48 bg-canvas animate-pulse rounded-xl" />
            : salesMetrics.paymentSplit.length === 0
            ? <div className="h-48 flex items-center justify-center text-xs text-gray-400">No data</div>
            : (
              <div className="space-y-3 mt-2">
                {salesMetrics.paymentSplit.map(p => {
                  const total = salesMetrics.paymentSplit.reduce((s, x) => s + x.value, 0);
                  const pct   = total > 0 ? p.value / total * 100 : 0;
                  const color = PAY_COLORS[p.name] || '#6b7280';
                  return (
                    <div key={p.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold text-ink-primary flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                          {p.name}
                        </span>
                        <span className="font-black text-ink-primary tabular-nums">{formatCurrency(p.value)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-canvas overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="text-[9px] text-gray-400 font-bold mt-0.5 text-right">{pct.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      </div>

      {/* ── TOP PRODUCTS ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-center justify-between">
          <SectionHead title="Top Products" sub="by revenue" />
          {!loading && (
            <span className="text-[10px] font-black text-gray-400 bg-canvas px-2 py-1 rounded-full">
              {salesMetrics.topProducts.length} products
            </span>
          )}
        </div>
        {salesLoading
          ? <div className="p-6 space-y-3">{[...Array(5)].map((_,i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}</div>
          : salesMetrics.topProducts.length === 0
          ? <div className="py-16 text-center text-sm text-gray-400">No sales data for selected period</div>
          : (
            <div>
              {/* Table header */}
              <div className="grid grid-cols-[36px_1fr_80px_100px_120px_120px] gap-4 px-6 py-2 bg-canvas/50 border-b border-black/5">
                {['#','Product','Qty','Orders','Avg Rate','Revenue'].map(h => (
                  <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
                ))}
              </div>
              {salesMetrics.topProducts.map((p, i) => (
                <div key={p.name}
                  className={`grid grid-cols-[36px_1fr_80px_100px_120px_120px] gap-4 px-6 py-3.5 items-center border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors ${
                    i === 0 ? 'bg-accent-signature/3' : ''
                  }`}>
                  {/* Rank */}
                  <span className={`text-sm font-black tabular-nums ${
                    i===0?'text-amber-500':i===1?'text-gray-400':i===2?'text-amber-700':'text-ink-tertiary'
                  }`}>{p.rank}</span>

                  {/* Name + share bar */}
                  <div>
                    <div className="text-sm font-bold text-ink-primary truncate">{p.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-20 h-1 rounded-full bg-canvas overflow-hidden">
                        <div className="h-full rounded-full bg-accent-signature transition-all duration-700"
                          style={{ width: `${Math.min(100, p.share)}%` }} />
                      </div>
                      <span className="text-[9px] font-black text-accent-signature">{p.share.toFixed(1)}%</span>
                    </div>
                  </div>

                  <span className="font-mono font-bold text-ink-primary text-sm tabular-nums">{p.qty}</span>
                  <span className="font-mono text-ink-secondary text-sm tabular-nums">{p.txCount}</span>
                  <span className="text-sm font-bold text-ink-primary tabular-nums">
                    {formatCurrency(p.qty > 0 ? p.revenue / p.qty : 0)}
                  </span>
                  <span className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* ── CLIENT LEADERBOARD + DAILY SUMMARY ──────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Client leaderboard */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-black/5">
            <SectionHead title="Top Clients" sub="by revenue" />
          </div>
          {salesLoading
            ? <div className="p-6 space-y-3">{[...Array(4)].map((_,i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}</div>
            : salesMetrics.topClients.length === 0
            ? <div className="py-12 text-center text-sm text-gray-400">No client data</div>
            : salesMetrics.topClients.map((c, i) => (
              <div key={c.name} className="flex items-center gap-4 px-6 py-3.5 border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${
                  i===0?'bg-amber-100 text-amber-700':i===1?'bg-gray-100 text-gray-600':'bg-accent-signature/10 text-accent-signature'
                }`}>
                  {(c.name[0]||'?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink-primary truncate">{c.name}</div>
                  <div className="text-[10px] text-gray-400 font-medium">{c.orders} orders</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(c.revenue)}</div>
                  <div className="text-[9px] font-black text-accent-signature">{c.share.toFixed(1)}%</div>
                </div>
              </div>
            ))
          }
        </div>

        {/* Daily sales breakdown */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-black/5">
            <SectionHead title="Daily Summary" />
          </div>
          {salesLoading
            ? <div className="p-6 space-y-3">{[...Array(4)].map((_,i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}</div>
            : salesMetrics.dailyTrend.length === 0
            ? <div className="py-12 text-center text-sm text-gray-400">No data</div>
            : [...salesMetrics.dailyTrend].reverse().slice(0, 8).map(d => (
              <div key={d.date} className="flex items-center gap-4 px-6 py-3 border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-canvas flex items-center justify-center shrink-0">
                  <Calendar size={13} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink-primary">{d.date}</div>
                  <div className="text-[10px] text-gray-400 font-medium">{d.orders} transactions</div>
                </div>
                <div className="text-sm font-black text-ink-primary tabular-nums shrink-0">
                  {formatCurrency(d.revenue)}
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* ── ALL TRANSACTIONS (full period ledger) ───────────────────────── */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-center justify-between">
          <SectionHead title="All Transactions" sub="every sale in period" />
          {!salesLoading && (
            <span className="text-[10px] font-black text-gray-400 bg-canvas px-2 py-1 rounded-full">{transactions.length} sales</span>
          )}
        </div>
        {salesLoading
          ? <div className="p-6 space-y-3">{[...Array(6)].map((_,i)=><div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}</div>
          : transactions.length === 0
          ? <div className="py-16 text-center text-sm text-gray-400">No transactions for selected period</div>
          : (
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-canvas/80 backdrop-blur-sm border-b border-black/10">
                    {[['Date','left'],['Ref','left'],['Client','left'],['Items','right'],['Payment','center'],['Status','center'],['Amount','right']].map(([h,a]) => (
                      <th key={h} className={`px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 ${a==='right'?'text-right':a==='center'?'text-center':''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t, i) => (
                    <tr key={i} className="border-b border-black/[0.04] hover:bg-amber-500/[0.04] transition-colors">
                      <td className="px-4 py-2.5 font-mono text-[12px] text-gray-500 whitespace-nowrap">{t.date}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-gray-400 uppercase whitespace-nowrap">{t.ref}</td>
                      <td className="px-4 py-2.5 text-[13px] font-bold text-ink-primary truncate max-w-[200px]">{t.client}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] text-gray-500">{t.items}</td>
                      <td className="px-4 py-2.5 text-center"><span className="text-[10px] font-bold uppercase text-gray-500">{t.payment}</span></td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          t.status==='PAID'||t.status==='COMPLETED' ? 'bg-emerald-50 text-emerald-600' :
                          t.status==='PARTIAL' ? 'bg-amber-50 text-amber-700' :
                          t.status==='PENDING'||t.status==='UNPAID' ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-500'
                        }`}>{t.status==='UNPAID'?'Pending':t.status.charAt(0)+t.status.slice(1).toLowerCase()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[13px] font-bold text-ink-primary whitespace-nowrap">
                        <span className="text-amber-400 mr-0.5">{'₹'}</span>{Math.round(t.amount).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black/15 bg-canvas/40 sticky bottom-0">
                    <td className="px-4 py-3 font-mono text-[11px] font-black uppercase tracking-widest text-gray-500" colSpan={6}>Total · {transactions.length} sales</td>
                    <td className="px-4 py-3 text-right font-mono text-[14px] font-black text-ink-primary whitespace-nowrap">
                      <span className="text-amber-400 mr-0.5">{'₹'}</span>{Math.round(salesMetrics.totalRevenue).toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
      </div>

      {/* ── PURCHASES ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-center justify-between">
          <SectionHead title="Purchases" sub="by supplier" />
          <div className="flex gap-6 text-right">
            <div>
              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Spend</div>
              <div className="text-base font-black text-ink-primary tabular-nums">{formatCurrency(purchMetrics.total)}</div>
            </div>
            <div>
              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Units</div>
              <div className="text-base font-black text-ink-primary tabular-nums">{purchMetrics.totalUnits}</div>
            </div>
          </div>
        </div>
        {purchLoading
          ? <div className="p-6 space-y-3">{[...Array(3)].map((_,i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}</div>
          : purchMetrics.topSuppliers.length === 0
          ? <div className="py-16 text-center text-sm text-gray-400">No purchases for selected period</div>
          : (
            <div>
              <div className="grid grid-cols-[36px_1fr_80px_140px_120px] gap-4 px-6 py-2 bg-canvas/50 border-b border-black/5">
                {['#','Supplier','Orders','Share','Amount'].map(h => (
                  <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
                ))}
              </div>
              {purchMetrics.topSuppliers.map((s, i) => (
                <div key={s.name} className="grid grid-cols-[36px_1fr_80px_140px_120px] gap-4 px-6 py-3.5 items-center border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors">
                  <span className={`text-sm font-black ${i===0?'text-amber-500':'text-ink-tertiary'}`}>{s.rank}</span>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-black text-blue-600">{s.name[0]?.toUpperCase()}</span>
                    </div>
                    <span className="text-sm font-bold text-ink-primary truncate">{s.name}</span>
                  </div>
                  <span className="font-mono text-ink-secondary text-sm">{s.orders}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-canvas overflow-hidden">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, s.share)}%` }} />
                    </div>
                    <span className="text-[9px] font-black text-amber-600 w-8 text-right">{s.share.toFixed(0)}%</span>
                  </div>
                  <span className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(s.amount)}</span>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* ── DETAILED DAILY SALES LOG ────────────────────────────────────── */}
      <DailySalesDetail sales={sales} clients={clients} vehicles={vehicles} users={users} loading={salesLoading} />

    </div>
  );
};

/* ─── Detailed daily breakdown ────────────────────────────────────────────── */
const PAY_BADGE = { CASH: 'bg-emerald-50 text-emerald-700', UPI: 'bg-amber-50 text-amber-700', CREDIT: 'bg-amber-50 text-amber-700', BANK: 'bg-slate-100 text-slate-600' };

const APP_BADGE = {
  WEB:     'bg-slate-100 text-slate-600 border-slate-200',
  DESKTOP: 'bg-slate-100 text-slate-600 border-slate-200',
  MOBILE:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  VAN:     'bg-amber-50 text-amber-700 border-amber-200',
};

const DailySalesDetail = ({ sales, clients, vehicles = [], users = [], loading }) => {
  const [openDates, setOpenDates] = useState({});

  const byDate = useMemo(() => {
    const map = {};
    sales.forEach(s => {
      const d = s.date || 'Unknown';
      if (!map[d]) map[d] = { date: d, sales: [], total: 0, orders: 0 };
      map[d].sales.push(s);
      map[d].total  += Number(s.totalAmount || 0);
      map[d].orders += 1;
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [sales]);

  const toggle = (date) => setOpenDates(prev => ({ ...prev, [date]: !prev[date] }));

  if (loading) return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 space-y-3">
      {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-canvas animate-pulse rounded-xl" />)}
    </div>
  );
  if (byDate.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-center justify-between">
        <SectionHead title="Daily Sales Detail" sub="product & client breakdown" />
        <span className="text-[10px] font-black text-gray-400 bg-canvas px-2 py-1 rounded-full">
          {byDate.length} days
        </span>
      </div>

      {byDate.map(day => {
        const isOpen = openDates[day.date] ?? (byDate.length === 1);
        return (
          <div key={day.date} className="border-b border-black/5 last:border-0">
            {/* Day header — click to expand */}
            <button
              className="w-full flex items-center gap-4 px-6 py-4 hover:bg-canvas/40 transition-colors text-left"
              onClick={() => toggle(day.date)}
            >
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Calendar size={14} className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm font-bold text-ink-primary">{day.date}</div>
                <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                  {day.orders} {day.orders === 1 ? 'sale' : 'sales'}
                </div>
              </div>
              <div className="font-mono text-base font-bold text-ink-primary tabular-nums shrink-0">
                {formatCurrency(day.total)}
              </div>
              <ChevronDown
                size={14}
                className={`text-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Expanded sales for this day */}
            {isOpen && (
              <div className="bg-canvas/30 border-t border-black/5">
                {/* Column labels */}
                <div className="grid grid-cols-[1fr_160px_50px_70px_70px_110px_80px_110px] gap-3 px-8 py-2 border-b border-black/5">
                  {['Client', 'Products', 'Items', 'Source', 'App', 'By', 'Method', 'Amount'].map(h => (
                    <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
                  ))}
                </div>

                {day.sales.map((s, si) => {
                  const cid      = s.customerInfo?.id || s.shopId || null;
                  const cname    = (cid && clients.find(c => c.id === cid)?.name) || s.customerInfo?.name || 'Walk-in';
                  const items    = Array.isArray(s.items) ? s.items : [];
                  const itemQty  = items.reduce((acc, it) => acc + Number(it.quantity || 0), 0);
                  const prodList = items.map(it => `${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ');
                  const method   = (s.paymentMethod || 'CASH').toUpperCase();
                  const badgeCls = PAY_BADGE[method] || 'bg-gray-100 text-gray-600';
                  const isVan    = !!(s.routeId || s.vehicleId) || s.source_app === 'VAN';
                  const vehicle  = isVan && s.vehicleId ? vehicles.find(v => v.id === s.vehicleId) : null;
                  const vanLabel = vehicle ? (vehicle.plateNumber || vehicle.name || 'VAN') : 'VAN';
                  const app      = (s.source_app || 'WEB').toUpperCase();
                  const appCls   = APP_BADGE[app] || APP_BADGE.WEB;
                  const userId   = s.cashier_id || s.bookedBy || s.salesRepId;
                  const user     = userId ? users.find(u => u.id === userId) : null;
                  const byLabel  = user?.name || (user?.email ? user.email.split('@')[0] : '—');

                  return (
                    <div key={s.id || si}
                      className="grid grid-cols-[1fr_160px_50px_70px_70px_110px_80px_110px] gap-3 px-8 py-3 border-b border-black/5 last:border-0 hover:bg-white/60 transition-colors items-start">

                      {/* Client */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-accent-signature/10 flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-black text-accent-signature">{(cname[0]||'?').toUpperCase()}</span>
                        </div>
                        <span className="text-xs font-bold text-ink-primary truncate">{cname}</span>
                      </div>

                      {/* Products */}
                      <div className="min-w-0">
                        {items.length === 0
                          ? <span className="text-xs text-gray-400 italic">—</span>
                          : items.map((it, idx) => (
                            <div key={idx} className="text-[11px] font-medium text-ink-secondary leading-snug truncate">
                              {it.name}
                              <span className="text-gray-400 ml-1">×{it.quantity} @ {formatCurrency(it.rate)}</span>
                            </div>
                          ))
                        }
                      </div>

                      {/* Total items */}
                      <span className="font-mono text-xs font-bold text-ink-primary tabular-nums">{itemQty}</span>

                      {/* Source badge */}
                      {isVan
                        ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black w-fit bg-amber-50 text-amber-700 border border-amber-200">
                            <Truck size={9} /> {vanLabel}
                          </span>
                        )
                        : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black w-fit bg-slate-100 text-slate-600 border border-slate-200">
                            POS
                          </span>
                        )
                      }

                      {/* App / channel */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black w-fit border ${appCls}`}>
                        {app}
                      </span>

                      {/* Sold by */}
                      <span className="text-[11px] font-bold text-ink-secondary truncate" title={user?.email || ''}>
                        {byLabel}
                      </span>

                      {/* Payment method */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black w-fit ${badgeCls}`}>
                        {method}
                      </span>

                      {/* Amount */}
                      <span className="font-mono text-xs font-bold text-ink-primary tabular-nums">{formatCurrency(s.totalAmount)}</span>
                    </div>
                  );
                })}

                {/* Day subtotal */}
                <div className="flex justify-end items-center px-8 py-2.5 border-t border-black/5 bg-white/40">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-4">Day Total</span>
                  <span className="font-mono text-sm font-bold text-ink-primary tabular-nums">{formatCurrency(day.total)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BusinessReport;
