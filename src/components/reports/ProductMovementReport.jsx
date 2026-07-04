/**
 * ProductMovementReport — fast-moving vs slow-moving product analysis.
 *
 * Over a selectable window (30/60/90 days) every sale's line items are
 * aggregated per product: units sold, revenue, sale count, last sold date,
 * daily velocity, and days-of-cover (current stock ÷ daily velocity).
 *
 * Fast movers  = ranked by units sold (top sellers).
 * Slow movers  = little or no movement while stock (money) sits on the
 *                shelf — ranked by stock value stuck, includes dead stock
 *                (zero sales in the window).
 */
import React, { useMemo, useState } from 'react';
import {
  TrendingUp, TrendingDown, Package, DollarSign, Download, Zap, Turtle,
} from 'lucide-react';
import useReportData from './useReportData';
import { formatCurrency, todayISOInAppTZ } from '../../lib/utils';

const WINDOWS = [
  { key: 30, label: '30 days' },
  { key: 60, label: '60 days' },
  { key: 90, label: '90 days' },
];

// A product is "slow" when it sold fewer units than this over the window
// AND still has stock on hand. Dead = zero units sold with stock on hand.
const SLOW_UNITS_THRESHOLD = 5;

const KPI = ({ label, value, sub, icon: Icon, color = '#D97706', loading }) => (
  <div className="bg-white rounded-2xl border border-black/5 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color + '18' }}>
      <Icon size={16} style={{ color }} />
    </div>
    {loading
      ? <div className="h-7 w-24 bg-canvas animate-pulse rounded-lg" />
      : <div className="text-2xl font-black text-ink-primary tabular-nums leading-none">{value}</div>
    }
    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
      {label}{sub && <span className="block normal-case tracking-normal font-semibold text-gray-400 mt-0.5">{sub}</span>}
    </div>
  </div>
);

const downloadCSV = (rows, filename) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const ProductMovementReport = () => {
  const [windowDays, setWindowDays] = useState(30);

  const fromDate = useMemo(() => {
    const today = todayISOInAppTZ();
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - windowDays);
    return d.toISOString().slice(0, 10);
  }, [windowDays]);

  const { data: sales, loading: sLoading } = useReportData({
    table: 'sales',
    select: 'id, items, date, paymentStatus',
    filters: { dateRange: { start: fromDate } },
    nullFilters: { deleted_at: null },
  });
  const { data: products, loading: pLoading } = useReportData({
    table: 'products',
    select: 'id, name, sku, category, costPrice, sellingPrice, stock',
  });
  const { data: balances, loading: bLoading } = useReportData({
    table: 'inventory_balances',
    select: 'product_id, quantity',
  });

  const loading = sLoading || pLoading || bLoading;

  const { fast, slow, kpis } = useMemo(() => {
    // Stock on hand: prefer summed inventory_balances, fall back to products.stock
    const stockBy = {};
    balances.forEach(b => {
      if (b.product_id) stockBy[b.product_id] = (stockBy[b.product_id] || 0) + Number(b.quantity || 0);
    });

    // Aggregate movement per product from sale line items
    const mov = {}; // pid -> { units, revenue, txns, lastSold }
    for (const s of sales) {
      const status = String(s.paymentStatus || '').toUpperCase();
      if (['VOIDED', 'FAILED', 'CANCELLED'].includes(status)) continue;
      const items = Array.isArray(s.items) ? s.items : [];
      for (const it of items) {
        const pid = it.id || it.productId;
        if (!pid) continue;
        const qty = Number(it.quantity) || 0;
        const rate = Number(it.rate ?? it.price ?? 0);
        const m = mov[pid] || (mov[pid] = { units: 0, revenue: 0, txns: 0, lastSold: '' });
        m.units += qty;
        m.revenue += qty * rate;
        m.txns += 1;
        if ((s.date || '') > m.lastSold) m.lastSold = s.date || '';
      }
    }

    const enriched = products.map(p => {
      const m = mov[p.id] || { units: 0, revenue: 0, txns: 0, lastSold: null };
      const stock = stockBy[p.id] !== undefined ? stockBy[p.id] : Number(p.stock || 0);
      const velocity = m.units / windowDays;                       // units/day
      const daysCover = velocity > 0 ? stock / velocity : null;    // null = not moving
      const stockValue = stock * Number(p.costPrice || 0);
      return { ...p, ...m, stock, velocity, daysCover, stockValue };
    });

    const fast = enriched
      .filter(p => p.units > 0)
      .sort((a, b) => b.units - a.units)
      .slice(0, 15);

    const slow = enriched
      .filter(p => p.units <= SLOW_UNITS_THRESHOLD && p.stock > 0)
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 25);

    const dead = slow.filter(p => p.units === 0);
    const stuckValue = slow.reduce((s, p) => s + p.stockValue, 0);
    const fastRevenue = fast.reduce((s, p) => s + p.revenue, 0);

    return {
      fast, slow,
      kpis: {
        fastCount: fast.length,
        fastRevenue,
        slowCount: slow.length,
        deadCount: dead.length,
        stuckValue,
      },
    };
  }, [sales, products, balances, windowDays]);

  const exportCSV = () => {
    const rows = [
      ...fast.map(p => ({ segment: 'FAST', ...csvRow(p) })),
      ...slow.map(p => ({ segment: 'SLOW', ...csvRow(p) })),
    ];
    downloadCSV(rows, `product_movement_${windowDays}d_${todayISOInAppTZ()}.csv`);
  };
  const csvRow = (p) => ({
    product: p.name, sku: p.sku || '', category: p.category || '',
    units_sold: p.units, revenue: p.revenue.toFixed(2), sales_count: p.txns,
    last_sold: p.lastSold || 'never', stock_on_hand: p.stock,
    units_per_day: p.velocity.toFixed(2),
    days_of_cover: p.daysCover == null ? '' : Math.round(p.daysCover),
    stock_value: p.stockValue.toFixed(2),
  });

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink-primary leading-none">
            Product Movement<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-1">Fast &amp; slow moving analysis · last {windowDays} days</p>
        </div>
        <div className="flex items-center gap-2">
          {WINDOWS.map(w => (
            <button key={w.key} onClick={() => setWindowDays(w.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                windowDays === w.key
                  ? 'bg-accent-signature text-button-text'
                  : 'bg-white text-gray-600 hover:text-ink-primary border border-black/5'
              }`}>
              {w.label}
            </button>
          ))}
          <button onClick={exportCSV} disabled={loading || (!fast.length && !slow.length)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-black/5 text-gray-700 hover:text-ink-primary hover:border-black/20 disabled:opacity-40 transition-colors">
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Fast Movers"  loading={loading} value={kpis.fastCount} sub="products with sales" icon={Zap}          color="#10b981" />
        <KPI label="Fast-Mover Revenue" loading={loading} value={formatCurrency(kpis.fastRevenue)}   icon={TrendingUp}   color="#D97706" />
        <KPI label="Slow Movers"  loading={loading} value={kpis.slowCount} sub={`≤${SLOW_UNITS_THRESHOLD} units sold, stock on shelf`} icon={Turtle} color="#f59e0b" />
        <KPI label="Money Stuck in Slow Stock" loading={loading} value={formatCurrency(kpis.stuckValue)} sub={`${kpis.deadCount} never sold`} icon={DollarSign} color="#ef4444" />
      </div>

      {/* Fast movers */}
      <MovementTable
        title="Fast Moving Products"
        sub="highest units sold first"
        icon={<TrendingUp size={15} className="text-emerald-500" />}
        rows={fast}
        loading={loading}
        tone="fast"
        emptyText="No sales recorded in this window."
      />

      {/* Slow movers */}
      <MovementTable
        title="Slow Moving Products"
        sub="most money stuck first · includes never-sold stock"
        icon={<TrendingDown size={15} className="text-red-500" />}
        rows={slow}
        loading={loading}
        tone="slow"
        emptyText="Nothing is sitting idle — every stocked product is moving."
      />
    </div>
  );
};

const GRID = 'grid grid-cols-[1fr_90px_100px_70px_90px_90px_90px_110px] gap-3 px-6';

const MovementTable = ({ title, sub, icon, rows, loading, tone, emptyText }) => (
  <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
    <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-base font-black text-ink-primary">{title}</h2>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{sub}</span>
      </div>
      {!loading && (
        <span className="text-[10px] font-black text-gray-400 bg-canvas px-2 py-1 rounded-full">{rows.length} products</span>
      )}
    </div>

    {loading ? (
      <div className="p-6 space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
      </div>
    ) : rows.length === 0 ? (
      <div className="py-14 text-center">
        <Package size={30} className="mx-auto mb-3 text-gray-200" />
        <p className="text-sm font-bold text-gray-500">{emptyText}</p>
      </div>
    ) : (
      <div>
        <div className={`${GRID} py-2 bg-canvas/50 border-b border-black/5`}>
          {['Product', 'Category', 'Units Sold', 'Sales', 'Revenue', 'Stock', 'Days Cover', 'Stock Value'].map(h => (
            <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
          ))}
        </div>
        {rows.map((p, i) => {
          const dead = p.units === 0;
          return (
            <div key={p.id || i}
              className={`${GRID} py-3.5 items-center border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors ${dead ? 'bg-red-50/40' : ''}`}>
              <div className="flex items-center gap-2 min-w-0">
                {tone === 'fast' && i < 3 && (
                  <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black grid place-items-center">{i + 1}</span>
                )}
                {tone === 'slow' && (
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dead ? 'bg-red-500' : 'bg-amber-400'}`} />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink-primary truncate">{p.name || '—'}</div>
                  {p.sku && <div className="text-[10px] font-mono text-gray-400 truncate">{p.sku}</div>}
                </div>
              </div>
              <span className="text-xs font-bold text-ink-secondary truncate">{p.category || '—'}</span>
              <span className={`text-sm font-black tabular-nums ${dead ? 'text-red-500' : 'text-ink-primary'}`}>
                {p.units}{dead && <span className="block text-[9px] font-bold text-red-400 uppercase">never sold</span>}
              </span>
              <span className="text-sm font-bold text-ink-secondary tabular-nums">{p.txns}</span>
              <span className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(p.revenue)}</span>
              <span className="text-sm font-bold text-ink-secondary tabular-nums">{p.stock}</span>
              <span className="text-sm font-bold tabular-nums">
                {p.daysCover == null
                  ? <span className="text-gray-300">∞</span>
                  : <span className={p.daysCover > 90 ? 'text-red-500' : p.daysCover > 45 ? 'text-amber-600' : 'text-emerald-600'}>{Math.round(p.daysCover)}d</span>
                }
              </span>
              <span className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(p.stockValue)}</span>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default ProductMovementReport;
