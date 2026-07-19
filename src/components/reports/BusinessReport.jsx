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
  User, Truck, Download, Calendar,
  ArrowUpRight, ArrowDownRight, Minus,
  ChevronRight, ChevronDown,
} from 'lucide-react';
import useReportData from './useReportData';
import usePLRanged from './usePLRanged';
import PLTieOut from './PLTieOut';
import { SectionHead, StatStrip } from './ReportBits';
import { isCountableSale, PRESETS, presetRange, priorRange, pctChange } from './reportUtils';
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
  const { data: vehicles }                             = useReportData({ table: 'vehicles',  select: 'id, plateNumber, name' });
  const { data: users }                                = useReportData({ table: 'users',     select: 'id, name, email' });

  const loading = salesLoading || purchLoading;

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

    return { totalRevenue, totalOrders, aov, dailyTrend, paymentSplit, topProducts, topClients,
             outstanding, billedTotal, collectedTotal, uncollected: billedTotal - collectedTotal };
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
        ref:     (s.id || '').toUpperCase(), // full id — truncation dropped digits
        client:  resolveName(s),
        items:   Array.isArray(s.items) ? s.items.reduce((n, i) => n + Number(i.quantity || 0), 0) : 0,
        payment: (s.paymentMethod || 'CASH').toUpperCase(),
        status:  (s.paymentStatus || s.status || 'PAID').toUpperCase(),
        amount:  Number(s.totalAmount || 0),
      }));
  }, [sales, clients]);

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
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-base font-semibold text-foreground tracking-tight">
            Business Report
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
          </p>
        </div>
        <div className="flex-1" />

        {/* Date presets */}
        <div className="flex items-center bg-muted rounded-lg p-0.5 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-md text-[11px] transition-colors ${
                preset === p.id
                  ? 'bg-card text-foreground font-semibold shadow-sm'
                  : 'text-muted-foreground font-medium hover:text-foreground'
              }`}>
              {p.label}
            </button>
          ))}
          <button onClick={() => applyPreset('CUSTOM')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] transition-colors ${
              preset === 'CUSTOM' ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'
            }`}>
            <Calendar size={11} /> Custom
          </button>
        </div>

        {/* Export */}
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-[11px] font-medium text-foreground hover:bg-muted/60 transition-colors">
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={14} className="text-muted-foreground shrink-0" />
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
          <span className="text-muted-foreground text-xs font-semibold">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
          <button onClick={applyCustom}
            className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
            Apply
          </button>
        </div>
      )}

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
          <SectionHead title="Top Products" sub="by revenue" />
          {!loading && (
            <span className="text-[10px] font-semibold text-muted-foreground bg-canvas px-2 py-1 rounded-full">
              {salesMetrics.topProducts.length} products
            </span>
          )}
        </div>
        {salesLoading
          ? <div className="p-6 space-y-3">{[...Array(5)].map((_,i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}</div>
          : salesMetrics.topProducts.length === 0
          ? <div className="py-16 text-center text-sm text-muted-foreground">No sales data for selected period</div>
          : (
            <div>
              {/* Table header */}
              <div className="grid grid-cols-[36px_1fr_80px_100px_120px_120px] gap-4 px-6 py-2 bg-canvas/50 border-b border-border/60">
                {['#','Product','Qty','Orders','Avg Rate','Revenue'].map(h => (
                  <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">{h}</span>
                ))}
              </div>
              {salesMetrics.topProducts.map((p, i) => (
                <div key={p.name}
                  className={`grid grid-cols-[36px_1fr_80px_100px_120px_120px] gap-4 px-6 py-3.5 items-center border-b border-border/60 last:border-0 hover:bg-canvas/40 transition-colors ${
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

                  <span className="tabular-nums font-semibold text-foreground text-sm tabular-nums">{p.qty}</span>
                  <span className="tabular-nums text-ink-secondary text-sm tabular-nums">{p.txCount}</span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {formatCurrency(p.qty > 0 ? p.revenue / p.qty : 0)}
                  </span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}
      </div>

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

      {/* ── ALL TRANSACTIONS (full period ledger) ───────────────────────── */}
      <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border/60 flex items-center justify-between">
          <SectionHead title="All Transactions" sub="every sale in period" />
          {!salesLoading && (
            <span className="text-[10px] font-semibold text-muted-foreground bg-canvas px-2 py-1 rounded-full">{transactions.length} sales</span>
          )}
        </div>
        {salesLoading
          ? <div className="p-6 space-y-3">{[...Array(6)].map((_,i)=><div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}</div>
          : transactions.length === 0
          ? <div className="py-16 text-center text-sm text-muted-foreground">No transactions for selected period</div>
          : (
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-canvas/80 backdrop-blur-sm border-b border-black/10">
                    {[['Date','left'],['Ref','left'],['Client','left'],['Items','right'],['Payment','center'],['Status','center'],['Amount','right']].map(([h,a]) => (
                      <th key={h} className={`px-4 py-2.5 tabular-nums text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ${a==='right'?'text-right':a==='center'?'text-center':''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t, i) => (
                    <tr key={i} className="border-b border-black/[0.04] hover:bg-accent-signature/[0.04] transition-colors">
                      <td className="px-4 py-2.5 tabular-nums text-[12px] text-muted-foreground whitespace-nowrap">{t.date}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[11px] text-muted-foreground uppercase whitespace-nowrap">{t.ref}</td>
                      <td className="px-4 py-2.5 text-[13px] font-semibold text-foreground truncate max-w-[200px]">{t.client}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[12px] text-muted-foreground">{t.items}</td>
                      <td className="px-4 py-2.5 text-center"><span className="text-[10px] font-semibold uppercase text-muted-foreground">{t.payment}</span></td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase ${
                          t.status==='PAID'||t.status==='COMPLETED' ? 'bg-emerald-50 text-emerald-600' :
                          t.status==='PARTIAL' ? 'bg-accent-signature/10 text-accent-signature-hover' :
                          t.status==='PENDING'||t.status==='UNPAID' ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-muted-foreground'
                        }`}>{t.status==='UNPAID'?'Pending':t.status.charAt(0)+t.status.slice(1).toLowerCase()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[13px] font-semibold text-foreground whitespace-nowrap">
                        <span className="text-accent-signature/70 mr-0.5">{'₹'}</span>{Math.round(t.amount).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black/15 bg-canvas/40 sticky bottom-0">
                    <td className="px-4 py-3 tabular-nums text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" colSpan={6}>Total · {transactions.length} sales</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[14px] font-semibold text-foreground whitespace-nowrap">
                      <span className="text-accent-signature/70 mr-0.5">{'₹'}</span>{Math.round(salesMetrics.totalRevenue).toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
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

      {/* ── DETAILED DAILY SALES LOG ────────────────────────────────────── */}
      <DailySalesDetail sales={sales} clients={clients} vehicles={vehicles} users={users} loading={salesLoading} />

      {/* Self-check: the report's own billed total vs the books. Compares the
          pre-returns figure, so a returns-only gap is expected and named. */}
      <PLTieOut from={range.start} to={range.end}
        revenue={salesMetrics.totalRevenue - pnl.returnsTotal}
        note="Differences usually mean sales returns or a voided bill in the period." />

    </div>
  );
};

/* ─── Detailed daily breakdown ────────────────────────────────────────────── */
const PAY_BADGE = { CASH: 'bg-emerald-50 text-emerald-700', UPI: 'bg-accent-signature/10 text-accent-signature-hover', CREDIT: 'bg-accent-signature/10 text-accent-signature-hover', BANK: 'bg-muted text-muted-foreground' };

const APP_BADGE = {
  WEB:     'bg-muted text-muted-foreground border-border',
  DESKTOP: 'bg-muted text-muted-foreground border-border',
  MOBILE:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  VAN:     'bg-accent-signature/10 text-accent-signature-hover border-accent-signature/25',
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
    <div className="bg-card rounded-[10px] border border-border/60 shadow-sm p-6 space-y-3">
      {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-canvas animate-pulse rounded-xl" />)}
    </div>
  );
  if (byDate.length === 0) return null;

  return (
    <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-border/60 flex items-center justify-between">
        <SectionHead title="Daily Sales Detail" sub="product & client breakdown" />
        <span className="text-[10px] font-semibold text-muted-foreground bg-canvas px-2 py-1 rounded-full">
          {byDate.length} days
        </span>
      </div>

      {byDate.map(day => {
        const isOpen = openDates[day.date] ?? (byDate.length === 1);
        return (
          <div key={day.date} className="border-b border-border/60 last:border-0">
            {/* Day header — click to expand */}
            <button
              className="w-full flex items-center gap-4 px-6 py-4 hover:bg-canvas/40 transition-colors text-left"
              onClick={() => toggle(day.date)}
            >
              <div className="w-9 h-9 rounded-xl bg-accent-signature/10 flex items-center justify-center shrink-0">
                <Calendar size={14} className="text-accent-signature" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="tabular-nums text-sm font-semibold text-foreground">{day.date}</div>
                <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                  {day.orders} {day.orders === 1 ? 'sale' : 'sales'}
                </div>
              </div>
              <div className="tabular-nums text-base font-semibold text-foreground tabular-nums shrink-0">
                {formatCurrency(day.total)}
              </div>
              <ChevronDown
                size={14}
                className={`text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Expanded sales for this day */}
            {isOpen && (
              <div className="bg-canvas/30 border-t border-border/60">
                {/* Column labels */}
                <div className="grid grid-cols-[1fr_180px_56px_72px_72px_110px_84px_120px] gap-3 px-8 py-2 border-b border-border/60 items-center">
                  {[['Client','justify-self-start'],['Products','justify-self-start'],['Items','justify-self-center'],['Source','justify-self-center'],['App','justify-self-center'],['By','justify-self-start'],['Method','justify-self-center'],['Amount','justify-self-end']].map(([h,a]) => (
                    <span key={h} className={`text-[9px] font-semibold text-muted-foreground uppercase tracking-widest ${a}`}>{h}</span>
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
                      className="grid grid-cols-[1fr_180px_56px_72px_72px_110px_84px_120px] gap-3 px-8 py-3 border-b border-border/60 last:border-0 hover:bg-card/60 transition-colors items-center">

                      {/* Client */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-accent-signature/10 flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-semibold text-accent-signature">{(cname[0]||'?').toUpperCase()}</span>
                        </div>
                        <span className="text-xs font-semibold text-foreground truncate">{cname}</span>
                      </div>

                      {/* Products */}
                      <div className="min-w-0">
                        {items.length === 0
                          ? <span className="text-xs text-muted-foreground italic">—</span>
                          : items.map((it, idx) => (
                            <div key={idx} className="text-[11px] font-medium text-ink-secondary leading-snug truncate">
                              {it.name}
                              <span className="text-muted-foreground ml-1">×{it.quantity} @ {formatCurrency(it.rate)}</span>
                            </div>
                          ))
                        }
                      </div>

                      {/* Total items */}
                      <span className="tabular-nums text-xs font-semibold text-foreground tabular-nums justify-self-center">{itemQty}</span>

                      {/* Source badge */}
                      {isVan
                        ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold w-fit bg-accent-signature/10 text-accent-signature-hover border border-accent-signature/25 justify-self-center">
                            <Truck size={9} /> {vanLabel}
                          </span>
                        )
                        : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold w-fit bg-muted text-muted-foreground border border-border justify-self-center">
                            POS
                          </span>
                        )
                      }

                      {/* App / channel */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold w-fit border justify-self-center ${appCls}`}>
                        {app}
                      </span>

                      {/* Sold by */}
                      <span className="text-[11px] font-semibold text-ink-secondary truncate justify-self-start" title={user?.email || ''}>
                        {byLabel}
                      </span>

                      {/* Payment method */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold w-fit justify-self-center ${badgeCls}`}>
                        {method}
                      </span>

                      {/* Amount */}
                      <span className="tabular-nums text-xs font-semibold text-foreground tabular-nums justify-self-end">{formatCurrency(s.totalAmount)}</span>
                    </div>
                  );
                })}

                {/* Day subtotal */}
                <div className="flex justify-end items-center px-8 py-2.5 border-t border-border/60 bg-card/40">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-4">Day Total</span>
                  <span className="tabular-nums text-sm font-semibold text-foreground tabular-nums">{formatCurrency(day.total)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export { DailySalesDetail };

export default BusinessReport;
