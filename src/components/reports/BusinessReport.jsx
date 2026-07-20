/**
 * BusinessReport — single-page, premium business intelligence report.
 * No sub-tabs. Everything visible on one scroll.
 *
 * Sections:
 *  1. Date range filter + export
 *  2. P&L strip — revenue net of returns → COGS → gross → expenses → net
 *  3. Trading activity (billed revenue, orders, AOV)
 *  4. Daily revenue trend (area chart) + payment split (bar)
 *  5. Top products table
 *  6. Client leaderboard + daily summary side-by-side
 *  7. Cash & Stock (purchases, COGS, outstanding) + purchases by supplier
 *  8. Daily sales log + P&L tie-out
 *
 * Profit figures come from get_pl_ranged, never from client-side arithmetic.
 * The report previously showed revenue beside total purchases with no cost or
 * expense line, so a period with ~14% gross margin read as a ~₹2L loss.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import {
  TrendingUp, ShoppingBag, Clock, Package,
  Truck, Calendar,
  ArrowUpRight, ArrowDownRight, Minus,
  ChevronRight,
} from 'lucide-react';
import useReportData from './useReportData';
import ReportHeader from './ReportHeader';
import usePLRanged from './usePLRanged';
import PLTieOut from './PLTieOut';
import { SectionHead, StatStrip } from './ReportBits';
import { isCountableSale, presetRange, priorRange, pctChange } from './reportUtils';
import { formatCurrency } from '../../lib/utils';

/* ─── Date preset helpers ─────────────────────────────────────────────────── */
/* ─── Mini sparkline ──────────────────────────────────────────────────────── */
const Spark = ({ data = [], color = 'var(--color-accent-signature)' }) => (
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
const KPI = ({ label, value, sub, spark, color = 'var(--color-accent-signature)', icon: Icon, loading }) => (
  <div className="bg-card rounded-[10px] border border-border/60 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center`}
        style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
        <Icon size={16} style={{ color }} />
      </div>
      {sub !== undefined && (
        <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${
          sub > 0 ? 'text-emerald-500' : sub < 0 ? 'text-red-400' : 'text-muted-foreground'
        }`}>
          {sub > 0 ? <ArrowUpRight size={11} /> : sub < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
          {sub !== 0 ? `${Math.abs(sub).toFixed(1)}%` : '—'}
        </span>
      )}
    </div>
    {loading
      ? <div className="h-7 w-24 bg-canvas animate-pulse rounded-lg" />
      : <div className="tabular-nums text-2xl font-semibold text-foreground tabular-nums leading-none">{value}</div>
    }
    <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
    {spark && spark.length > 1 && <Spark data={spark} color={color} />}
  </div>
);

/* ─── Section header ──────────────────────────────────────────────────────── */
/* ─── Custom tooltip ──────────────────────────────────────────────────────── */
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-black/8 rounded-xl px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-ink-secondary mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">
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
  const [preset, setPreset]   = useState('TODAY');
  const [range,  setRange]    = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);
  const [prodSort,    setProdSort]    = useState('REVENUE');

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: salesRaw,     loading: salesLoading }     = useReportData({ table: 'sales',     select: '*', dateColumn: 'date', filters });
  const sales = useMemo(() => salesRaw.filter(isCountableSale), [salesRaw]);
  const { data: purchases, loading: purchLoading }     = useReportData({ table: 'purchases', select: '*', dateColumn: 'date', filters });
  const { data: clients }                              = useReportData({ table: 'clients',   select: 'id, name, outstanding_balance' });
  // Collections banked in the period. These settle credit bills that may have
  // been raised earlier, so they are reported separately from sale-time cash
  // rather than added to it — adding them would double-count.
  const { data: collections } = useReportData({
    table: 'client_payments', select: 'id, amount, date, payment_method',
    dateColumn: 'date', filters,
  });
  // Per-product cost. Batch consumption is the real FIFO cost but covers only
  // part of the lines (356 of 436 sales here), so uncovered lines fall back to
  // products.costPrice — the same chain process_sale uses. See prodProfit.
  const { data: products }    = useReportData({ table: 'products', select: 'id, costPrice, unit' });
  const { data: consumption } = useReportData({
    table: 'sale_batch_consumption', select: 'sale_id, product_id, qty_taken, unit_cost',
  });

  /* Authoritative period P&L (returns netted, GST split per tax_mode,
     exclude_from_pl honoured). Never recomputed client-side. */
  const { pl, loading: plLoading } = usePLRanged(range.start, range.end);
  const pnl = useMemo(() => {
    const revenueNet  = Number(pl?.revenue_net   || 0);
    const cogs        = Number(pl?.cogs          || 0);
    const expenses    = Number(pl?.expenses      || 0);
    const grossProfit = Number(pl?.gross_profit  || 0);
    const netProfit   = Number(pl?.net_profit    || 0);
    return {
      revenueNet, cogs, expenses, grossProfit, netProfit,
      returnsTotal: Number(pl?.returns_total || 0),
      grossMargin: revenueNet > 0 ? (grossProfit / revenueNet) * 100 : 0,
      netMargin:   revenueNet > 0 ? (netProfit   / revenueNet) * 100 : 0,
    };
  }, [pl]);

  /* Prior equal-length window — drives the period-over-period arrows, which
     until now rendered from a `sub` prop no caller ever passed. */
  const prior = useMemo(() => priorRange(range), [range]);
  const { pl: priorPl } = usePLRanged(prior?.start, prior?.end);

  const collectionsTotal = useMemo(
    () => collections.reduce((s, c) => s + Number(c.amount || 0), 0),
    [collections],
  );

  // null when there is no comparable prior period — the arrow then stays hidden
  // rather than implying a change we cannot substantiate.
  const revenueChange = useMemo(
    () => (priorPl ? pctChange(pl?.revenue_net, priorPl.revenue_net) : null),
    [pl, priorPl],
  );

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

    /* Payment split — billed vs actually collected, per method.
       Previously this bucketed full bill value by method and called it a
       payment split, so credit sales counted as money in hand.

       Collected is derived from paymentStatus, not amount_received (populated
       on 1 of 437 sales here) and not paidAmount alone (understated on many
       PAID rows — ₹3.58L of PAID cash carried only ₹2.98L of paidAmount).
       PAID means the money was taken; PARTIAL is the only case where
       paidAmount carries real signal. */
    const collectedOf = (s) => {
      const total  = Number(s.totalAmount || 0);
      const status = String(s.paymentStatus || s.status || '').toUpperCase();
      if (status === 'PAID' || status === 'COMPLETED') return total;
      if (status === 'PARTIAL') return Math.min(Number(s.paidAmount || 0), total);
      return 0; // UNPAID / credit outstanding
    };

    const byMethod = {};
    sales.forEach(s => {
      const m = (s.paymentMethod || 'CASH').toUpperCase();
      if (!byMethod[m]) byMethod[m] = { name: m, billed: 0, collected: 0 };
      byMethod[m].billed    += Number(s.totalAmount || 0);
      byMethod[m].collected += collectedOf(s);
    });
    const paymentSplit = Object.values(byMethod)
      .map(m => ({ ...m, value: m.billed }))
      .sort((a, b) => b.billed - a.billed);

    const billedTotal    = sales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
    const collectedTotal = sales.reduce((sum, s) => sum + collectedOf(s), 0);

    /* Product performance, with cost so a line that sells at a loss is
       visible. Revenue ranking alone hid those: at a 13.9% blended margin a
       high-revenue product can still lose money on every unit.

       Cost per line: FIFO batch consumption where it exists, else
       products.costPrice × qty — the same fallback chain process_sale uses.
       Per-product COGS is not stored anywhere, so this is an allocation, and
       cogsVariance below reports how far it lands from sales.totalCogs. */
    const costByKey = {};   // `${sale_id}|${product_id}` → actual FIFO cost
    (consumption || []).forEach(c => {
      const k = `${c.sale_id}|${c.product_id}`;
      costByKey[k] = (costByKey[k] || 0) + Number(c.qty_taken || 0) * Number(c.unit_cost || 0);
    });
    const productById = {};
    (products || []).forEach(p => { productById[p.id] = p; });

    const prodMap = {};
    let allocatedCogs = 0;
    sales.forEach(s => {
      (Array.isArray(s.items) ? s.items : []).forEach(item => {
        const key  = item.id || item.name || 'unknown';
        const prod = productById[item.id];
        const qty  = Number(item.quantity || 0);
        const batchCost = costByKey[`${s.id}|${item.id}`];
        const cost = batchCost != null ? batchCost : qty * Number(prod?.costPrice || 0);
        if (!prodMap[key]) {
          prodMap[key] = { name: item.name || 'Unknown', unit: prod?.unit || '',
                           qty: 0, revenue: 0, cost: 0, txCount: 0 };
        }
        prodMap[key].qty     += qty;
        prodMap[key].revenue += qty * Number(item.rate || 0);
        prodMap[key].cost    += cost;
        prodMap[key].txCount += 1;
        allocatedCogs        += cost;
      });
    });

    const allProducts = Object.values(prodMap).map(p => ({
      ...p,
      profit: p.revenue - p.cost,
      margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
      share:  totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0,
    }));
    const topProducts = [...allProducts]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((p, i) => ({ ...p, rank: i + 1 }));
    const byProfit = [...allProducts]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10)
      .map((p, i) => ({ ...p, rank: i + 1 }));
    const lossMakers = allProducts
      .filter(p => p.profit < 0)
      .sort((a, b) => a.profit - b.profit);

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

    return { totalRevenue, totalOrders, aov, dailyTrend, paymentSplit, topProducts, topClients,
             outstanding, billedTotal, collectedTotal, uncollected: billedTotal - collectedTotal,
             byProfit, lossMakers, allocatedCogs };
  }, [sales, clients, products, consumption]);

  const prodRows = prodSort === 'PROFIT' ? salesMetrics.byProfit : salesMetrics.topProducts;

  /* ── Full transaction ledger (every sale in the period) ───────────────── */

  /* ── Purchases aggregations ─────────────────────────────────────────── */
  const purchMetrics = useMemo(() => {
    const total = purchases.reduce((s, p) => s + Number(p.total_amount || 0), 0);
    // No unit total: purchase lines mix kg, pieces and covers, so summing
    // quantity produced a number that meant nothing.

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

    return { total, topSuppliers };
  }, [purchases]);

  /* ── Export CSV ─────────────────────────────────────────────────────── */
  const exportCSV = useCallback(() => {
    const rows = [
      ['Date', 'Invoice', 'Customer', 'Amount', 'Payment', 'Status'],
      ...sales.map(s => [
        s.date, s.id?.toUpperCase(),
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
  const PAY_COLORS = { CASH: '#10b981', UPI: 'var(--color-accent-signature)', CREDIT: '#f59e0b', BANK: '#3b82f6', CARD: '#8b5cf6' };

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-4 pb-16">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <ReportHeader
        title="Business Report"
        subtitle={range.start === range.end ? range.start : `${range.start} → ${range.end}`}
        preset={preset}
        onPreset={applyPreset}
        showCustom={showCustom}
        customStart={customStart}
        customEnd={customEnd}
        setCustomStart={setCustomStart}
        setCustomEnd={setCustomEnd}
        onApplyCustom={applyCustom}
        onExport={exportCSV}
        exportLabel="Export CSV"
      />

      {/* ── DID WE MAKE MONEY? ──────────────────────────────────────────────
          The headline the report previously never answered. Figures come
          straight from get_pl_ranged so they cannot drift from the books:
          revenue is net of returns, COGS is the real cost of what sold (NOT
          purchases), and expenses honour exclude_from_pl. */}
      <div className="space-y-2">
        <StatStrip loading={plLoading} items={[
          { label: 'Revenue (net of returns)', value: formatCurrency(pnl.revenueNet) },
          { label: 'Cost of goods sold',       value: formatCurrency(pnl.cogs) },
          { label: 'Gross profit',             value: formatCurrency(pnl.grossProfit),
            tone: pnl.grossProfit >= 0 ? 'pos' : 'neg' },
          { label: 'Expenses',                 value: formatCurrency(pnl.expenses) },
          { label: 'Net profit',               value: formatCurrency(pnl.netProfit),
            tone: pnl.netProfit >= 0 ? 'pos' : 'neg' },
        ]} />
        {!plLoading && (
          <p className="text-[11px] text-muted-foreground">
            {pnl.returnsTotal > 0 && <>{formatCurrency(pnl.returnsTotal)} of returns deducted · </>}
            Gross margin {pnl.grossMargin.toFixed(1)}% ·{' '}
            {pnl.netProfit >= 0
              ? `Net margin ${pnl.netMargin.toFixed(1)}%`
              : `Loss of ${formatCurrency(Math.abs(pnl.netProfit))} — expenses exceed gross profit`}
          </p>
        )}
      </div>

      {/* ── TRADING ACTIVITY ────────────────────────────────────────────────
          Volume metrics only. Purchases and Outstanding deliberately live in
          "Cash & Stock" below: purchases are money out for stock that may not
          have sold yet, and showing them beside revenue read as a huge loss. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPI label="Revenue billed (before returns)" loading={salesLoading}
          value={formatCurrency(salesMetrics.totalRevenue)}
          sub={revenueChange ?? undefined}
          spark={salesMetrics.dailyTrend.map(d => ({ v: d.revenue }))}
          icon={TrendingUp} color="var(--color-accent-signature)" />
        <KPI label="Total Orders"    loading={salesLoading}
          value={salesMetrics.totalOrders}
          spark={salesMetrics.dailyTrend.map(d => ({ v: d.orders }))}
          icon={ShoppingBag} color="#10b981" />
        <KPI label="Avg. Order Value" loading={salesLoading}
          value={formatCurrency(salesMetrics.aov)}
          icon={ChevronRight} color="#f59e0b" />
      </div>
      {prior && revenueChange !== null && (
        <p className="text-[11px] text-muted-foreground -mt-2">
          Compared with {prior.start === prior.end ? prior.start : `${prior.start} → ${prior.end}`}
          {' '}(same length): revenue {formatCurrency(Number(priorPl?.revenue_net || 0))},
          {' '}net profit {formatCurrency(Number(priorPl?.net_profit || 0))}.
        </p>
      )}

      {/* ── CASH POSITION ───────────────────────────────────────────────────
          What was billed vs what actually came in. Collections are shown on
          their own line because they settle bills that may pre-date this
          period — folding them into sale-time cash would double-count. */}
      <div className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Cash position</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Collected is taken from each bill&apos;s payment status. Credit sales count as money in
            only once they are settled.
          </p>
        </div>
        <StatStrip loading={salesLoading} items={[
          { label: 'Billed this period',      value: formatCurrency(salesMetrics.billedTotal) },
          { label: 'Collected at sale',       value: formatCurrency(salesMetrics.collectedTotal),
            tone: 'pos' },
          { label: 'Still unpaid from these', value: formatCurrency(salesMetrics.uncollected),
            tone: salesMetrics.uncollected > 0 ? 'neg' : undefined },
          { label: 'Collections banked (incl. older bills)', value: formatCurrency(collectionsTotal) },
        ]} />
      </div>

      {/* ── CHARTS ROW ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">

        {/* Daily revenue trend */}
        <div className="bg-card rounded-[10px] border border-border/60 p-6 shadow-sm">
          <SectionHead title="Revenue Trend" sub={`${salesMetrics.dailyTrend.length} days`} />
          {salesLoading
            ? <div className="h-48 bg-canvas animate-pulse rounded-xl" />
            : salesMetrics.dailyTrend.length < 2
            ? <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">Not enough data for selected range</div>
            : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={salesMetrics.dailyTrend} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="var(--color-accent-signature)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--color-accent-signature)" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 600 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--color-accent-signature)" strokeWidth={2}
                    fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: 'var(--color-accent-signature)', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
        </div>

        {/* Payment method split */}
        <div className="bg-card rounded-[10px] border border-border/60 p-6 shadow-sm">
          <SectionHead title="Billed vs Collected" sub="by payment method" />
          {salesLoading
            ? <div className="h-48 bg-canvas animate-pulse rounded-xl" />
            : salesMetrics.paymentSplit.length === 0
            ? <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No data</div>
            : (
              <div className="space-y-3 mt-2">
                {salesMetrics.paymentSplit.map(p => {
                  const maxBilled = Math.max(...salesMetrics.paymentSplit.map(x => x.billed), 1);
                  const billedPct = (p.billed / maxBilled) * 100;
                  // Collected drawn as a filled portion of the same bar, so an
                  // unsettled credit bar reads as visibly hollow.
                  const collPct   = p.billed > 0 ? (p.collected / p.billed) * 100 : 0;
                  const color     = PAY_COLORS[p.name] || '#6b7280';
                  const unpaid    = p.billed - p.collected;
                  return (
                    <div key={p.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                          {p.name}
                        </span>
                        <span className="font-semibold text-foreground tabular-nums">{formatCurrency(p.billed)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-canvas overflow-hidden" style={{ width: `${billedPct}%`, minWidth: '8%' }}>
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${collPct}%`, background: color }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex justify-between">
                        <span>{formatCurrency(p.collected)} collected</span>
                        {unpaid > 0.5 && <span className="text-[color:var(--color-neg)]">{formatCurrency(unpaid)} unpaid</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      </div>

      {/* ── TOP PRODUCTS ────────────────────────────────────────────────── */}
      <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border/60 flex items-center justify-between">
          <SectionHead title="Top Products"
            sub={prodSort === 'PROFIT' ? 'by gross profit' : 'by revenue'} />
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {[['REVENUE', 'Revenue'], ['PROFIT', 'Profit']].map(([id, label]) => (
              <button key={id} onClick={() => setProdSort(id)}
                className={`px-3 py-1.5 rounded-md text-[11px] transition-colors ${
                  prodSort === id
                    ? 'bg-card text-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground font-medium hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {salesLoading
          ? <div className="p-6 space-y-3">{[...Array(5)].map((_,i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}</div>
          : prodRows.length === 0
          ? <div className="py-16 text-center text-sm text-muted-foreground">No sales data for selected period</div>
          : (
            <div>
              {/* Table header */}
              <div className="grid grid-cols-[36px_1fr_90px_70px_110px_110px_110px_92px] gap-4 px-6 py-2 bg-canvas/50 border-b border-border/60">
                {['#','Product','Qty','Bills','Revenue','COGS','Gross profit','Margin'].map(h => (
                  <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">{h}</span>
                ))}
              </div>
              {prodRows.map((p, i) => (
                <div key={p.name}
                  className={`grid grid-cols-[36px_1fr_90px_70px_110px_110px_110px_92px] gap-4 px-6 py-3.5 items-center border-b border-border/60 last:border-0 hover:bg-canvas/40 transition-colors ${
                    i === 0 ? 'bg-accent-signature/3' : ''
                  }`}>
                  {/* Rank */}
                  <span className={`text-sm font-semibold tabular-nums ${
                    i===0?'text-accent-signature':i===1?'text-muted-foreground':i===2?'text-accent-signature-hover':'text-ink-tertiary'
                  }`}>{p.rank}</span>

                  {/* Name + share bar */}
                  <div>
                    <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-20 h-1 rounded-full bg-canvas overflow-hidden">
                        <div className="h-full rounded-full bg-accent-signature transition-all duration-700"
                          style={{ width: `${Math.min(100, p.share)}%` }} />
                      </div>
                      <span className="text-[9px] font-semibold text-accent-signature">{p.share.toFixed(1)}%</span>
                    </div>
                  </div>

                  <span className="text-sm text-foreground tabular-nums">
                    {p.qty}{p.unit ? <span className="text-muted-foreground text-[11px] ml-1">{p.unit}</span> : null}
                  </span>
                  <span className="text-sm text-ink-secondary tabular-nums">{p.txCount}</span>
                  <span className="text-sm text-foreground tabular-nums">{formatCurrency(p.revenue)}</span>
                  <span className="text-sm text-ink-secondary tabular-nums">{formatCurrency(p.cost)}</span>
                  <span className={`text-sm font-semibold tabular-nums ${
                    p.profit >= 0 ? 'text-[color:var(--color-pos)]' : 'text-[color:var(--color-neg)]'}`}>
                    {formatCurrency(p.profit)}
                  </span>
                  <span className={`text-sm tabular-nums ${
                    p.profit >= 0 ? 'text-ink-secondary' : 'text-[color:var(--color-neg)]'}`}>
                    {p.margin.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        {/* Per-product cost is an allocation, not a stored figure — say so
            rather than implying these profits are exact to the paisa. */}
        {!salesLoading && prodRows.length > 0 && (
          <div className="px-6 py-3 border-t border-border/60 text-[11px] text-muted-foreground">
            Cost per product uses FIFO batch cost where recorded, otherwise the product&apos;s cost
            price. Allocated COGS {formatCurrency(salesMetrics.allocatedCogs)} vs {formatCurrency(pnl.cogs)} in the P&amp;L
            {Math.abs(salesMetrics.allocatedCogs - pnl.cogs) > 1 && !plLoading && (
              <> ({formatCurrency(Math.abs(salesMetrics.allocatedCogs - pnl.cogs))} difference — treat product profit as indicative)</>
            )}.
          </div>
        )}
      </div>

      {/* Loss-makers — the reason revenue ranking alone is not enough. */}
      {!salesLoading && salesMetrics.lossMakers.length > 0 && (
        <div className="bg-card rounded-[10px] border border-border/60 shadow-sm p-5">
          <SectionHead title="Sold below cost"
            sub={`${salesMetrics.lossMakers.length} product${salesMetrics.lossMakers.length === 1 ? '' : 's'} this period`} />
          <div className="space-y-1.5 mt-1">
            {salesMetrics.lossMakers.slice(0, 6).map(p => (
              <div key={p.name} className="flex items-baseline justify-between gap-4 text-[13px]">
                <span className="text-foreground truncate">{p.name}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {p.qty}{p.unit ? ` ${p.unit}` : ''} · sold {formatCurrency(p.revenue)} · cost {formatCurrency(p.cost)}
                </span>
                <span className="text-[color:var(--color-neg)] font-semibold tabular-nums shrink-0 w-24 text-right">
                  {formatCurrency(p.profit)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Either the selling price is below what the stock cost, or the recorded cost price is
            wrong. Both are worth checking before the next purchase.
          </p>
        </div>
      )}

      {/* ── CLIENT LEADERBOARD + DAILY SUMMARY ──────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Client leaderboard */}
        <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-border/60">
            <SectionHead title="Top Clients" sub="by revenue" />
          </div>
          {salesLoading
            ? <div className="p-6 space-y-3">{[...Array(4)].map((_,i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}</div>
            : salesMetrics.topClients.length === 0
            ? <div className="py-12 text-center text-sm text-muted-foreground">No client data</div>
            : salesMetrics.topClients.map((c, i) => (
              <div key={c.name} className="flex items-center gap-4 px-6 py-3.5 border-b border-border/60 last:border-0 hover:bg-canvas/40 transition-colors">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                  i===0?'bg-accent-signature/15 text-accent-signature-hover':i===1?'bg-gray-100 text-gray-600':'bg-accent-signature/10 text-accent-signature'
                }`}>
                  {(c.name[0]||'?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">{c.orders} orders</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(c.revenue)}</div>
                  <div className="text-[9px] font-semibold text-accent-signature">{c.share.toFixed(1)}%</div>
                </div>
              </div>
            ))
          }
        </div>

        {/* Daily sales breakdown */}
        <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-border/60">
            <SectionHead title="Daily Summary" />
          </div>
          {salesLoading
            ? <div className="p-6 space-y-3">{[...Array(4)].map((_,i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}</div>
            : salesMetrics.dailyTrend.length === 0
            ? <div className="py-12 text-center text-sm text-muted-foreground">No data</div>
            : [...salesMetrics.dailyTrend].reverse().slice(0, 8).map(d => (
              <div key={d.date} className="flex items-center gap-4 px-6 py-3 border-b border-border/60 last:border-0 hover:bg-canvas/40 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-canvas flex items-center justify-center shrink-0">
                  <Calendar size={13} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{d.date}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">{d.orders} transactions</div>
                </div>
                <div className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                  {formatCurrency(d.revenue)}
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* ── CASH & STOCK ────────────────────────────────────────────────────
          Deliberately separate from the P&L above. Purchases are money paid
          for stock, not the cost of what sold — putting the two side by side
          made a profitable period read as a heavy loss. Outstanding is a
          running balance as of today, so it ignores the date filter. */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Cash &amp; Stock</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Money out for stock this period, and what customers still owe. Not part of the profit
            calculation above — stock bought but unsold stays on the shelf, not in cost of goods.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KPI label="Stock purchased (money out)" loading={purchLoading}
            value={formatCurrency(purchMetrics.total)}
            icon={Truck} color="#8b5cf6" />
          <KPI label="Cost of goods sold (in P&L)" loading={plLoading}
            value={formatCurrency(pnl.cogs)}
            icon={Package} color="#0ea5e9" />
          <KPI label="Outstanding · all time, as of today" loading={false}
            value={formatCurrency(salesMetrics.outstanding)}
            icon={Clock} color="#ef4444" />
        </div>
      </div>

      <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border/60 flex items-center justify-between">
          <SectionHead title="Purchases" sub="by supplier" />
          <div className="text-right">
            <div className="text-[11px] font-medium text-muted-foreground">Total Spend</div>
            <div className="text-base font-semibold text-foreground tabular-nums">{formatCurrency(purchMetrics.total)}</div>
          </div>
        </div>
        {purchLoading
          ? <div className="p-6 space-y-3">{[...Array(3)].map((_,i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}</div>
          : purchMetrics.topSuppliers.length === 0
          ? <div className="py-16 text-center text-sm text-muted-foreground">No purchases for selected period</div>
          : (
            <div>
              <div className="grid grid-cols-[36px_1fr_80px_140px_120px] gap-4 px-6 py-2 bg-canvas/50 border-b border-border/60">
                {['#','Supplier','Orders','Share','Amount'].map(h => (
                  <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">{h}</span>
                ))}
              </div>
              {purchMetrics.topSuppliers.map((s, i) => (
                <div key={s.name} className="grid grid-cols-[36px_1fr_80px_140px_120px] gap-4 px-6 py-3.5 items-center border-b border-border/60 last:border-0 hover:bg-canvas/40 transition-colors">
                  <span className={`text-sm font-semibold ${i===0?'text-accent-signature':'text-ink-tertiary'}`}>{s.rank}</span>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-semibold text-blue-600">{s.name[0]?.toUpperCase()}</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground truncate">{s.name}</span>
                  </div>
                  <span className="tabular-nums text-ink-secondary text-sm">{s.orders}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-canvas overflow-hidden">
                      <div className="h-full rounded-full bg-accent-signature" style={{ width: `${Math.min(100, s.share)}%` }} />
                    </div>
                    <span className="text-[9px] font-semibold text-accent-signature w-8 text-right">{s.share.toFixed(0)}%</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(s.amount)}</span>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Self-check: the report's own billed total vs the books. Compares the
          pre-returns figure, so a returns-only gap is expected and named. */}
      <PLTieOut from={range.start} to={range.end}
        revenue={salesMetrics.totalRevenue - pnl.returnsTotal}
        note="Differences usually mean sales returns or a voided bill in the period." />

    </div>
  );
};

export default BusinessReport;
