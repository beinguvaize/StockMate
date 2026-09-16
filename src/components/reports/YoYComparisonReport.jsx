import React, { useMemo, useState } from 'react';
import { isCountableSale } from './reportUtils';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import {
  TrendingUp, TrendingDown, Calendar, BarChart3,
  ArrowUpRight, ArrowDownRight, Minus, Layers,
  DollarSign, Wallet, Activity, Target,
} from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';

/**
 * Year-over-Year Comparison
 * -------------------------
 * Overlays current-year financials against the same period one year earlier.
 * Surfaces growth/decline across revenue, expenses, profit, and individual
 * expense categories.
 *
 * Tabs:
 *   1. Overview            — 4 headline KPIs + 12-mo overlay chart
 *   2. Revenue YoY         — monthly revenue with Δ$ and Δ%
 *   3. Expense YoY         — monthly expense (opex + payroll) with Δ$ and Δ%
 *   4. Category YoY        — expense categories ranked by absolute change
 */

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const pctDelta = (current, prior) => {
  if (!prior || prior === 0) return current > 0 ? 100 : 0;
  return ((current - prior) / Math.abs(prior)) * 100;
};

const deltaBadge = (delta, inverted = false) => {
  // inverted=true → lower is better (expenses). Green = decrease, red = increase.
  const positive = delta > 0;
  const good = inverted ? !positive : positive;
  if (delta === 0) return { cls: 'text-muted-foreground', icon: <Minus size={10} /> };
  return good
    ? { cls: 'text-emerald-600', icon: <ArrowUpRight size={10} /> }
    : { cls: 'text-rose-500', icon: <ArrowDownRight size={10} /> };
};

const YoYComparisonReport = () => {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Year selector: allow picking which year pair to compare (default: current vs prior)
  const yearOptions = useMemo(() => {
    const out = [];
    for (let y = currentYear; y >= currentYear - 4; y--) out.push(y);
    return out;
  }, [currentYear]);
  const [cyYear, setCyYear] = useState(currentYear);
  const lyYear = cyYear - 1;

  // Only the two years being compared are needed. This used to fetch the whole
  // history of four tables on every load and filter in memory; the selector
  // already tells us the exact window, so push it down to the query.
  const yoyRange = useMemo(
    () => ({ start: `${lyYear}-01-01`, end: `${cyYear}-12-31` }),
    [lyYear, cyYear],
  );
  const yoyFilters = useMemo(() => ({ dateRange: yoyRange }), [yoyRange]);

  const { data: salesRaw,    loading: l1 } = useReportData({ table: 'sales',    select: 'totalAmount, date, voided_at, status, paymentStatus',      dateColumn: 'date',         filters: yoyFilters });
  // Voided and cancelled sales are not revenue and were being counted here.
  const sales = useMemo(() => (salesRaw || []).filter(isCountableSale), [salesRaw]);
  const { data: expenses, loading: l2 } = useReportData({ table: 'expenses', select: 'amount, category, date', dateColumn: 'date',         filters: yoyFilters });
  const { data: payroll,  loading: l3 } = useReportData({ table: 'payroll',  select: 'amount, processed_at',   dateColumn: 'processed_at', filters: yoyFilters });
  const { data: purchases,loading: l4 } = useReportData({ table: 'purchases',select: 'total_amount, date',     dateColumn: 'date',         filters: yoyFilters });
  const loading = l1 || l2 || l3 || l4;

  /* ------------------------------------------------------------------ *
   * Bucket everything by (year, month)
   * ------------------------------------------------------------------ */
  const buckets = useMemo(() => {
    // Structure: { [year]: { monthly: [12]{rev,exp,pay,pur}, byCat: { [cat]: [12] } } }
    const make = () => ({
      monthly: Array.from({ length: 12 }, () => ({ rev: 0, exp: 0, pay: 0, pur: 0 })),
      byCat: {},
    });
    const map = { [cyYear]: make(), [lyYear]: make() };

    const add = (dateStr, field, amount, category = null) => {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const y = d.getFullYear();
      const m = d.getMonth();
      if (!map[y]) return; // outside window
      map[y].monthly[m][field] += Number(amount) || 0;
      if (category) {
        const cat = (category || 'GENERAL').toUpperCase();
        if (!map[y].byCat[cat]) map[y].byCat[cat] = Array(12).fill(0);
        map[y].byCat[cat][m] += Number(amount) || 0;
      }
    };

    sales.forEach((s) => add(s.date, 'rev', s.totalAmount));
    expenses.forEach((e) => add(e.date, 'exp', e.amount, e.category));
    payroll.forEach((p) => {
      add(p.processed_at, 'pay', p.amount);
      // Treat payroll as a pseudo-category so Category YoY sees it
      const d = new Date(p.processed_at);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = d.getMonth();
        if (map[y]) {
          if (!map[y].byCat['PAYROLL']) map[y].byCat['PAYROLL'] = Array(12).fill(0);
          map[y].byCat['PAYROLL'][m] += Number(p.amount) || 0;
        }
      }
    });
    purchases.forEach((p) => add(p.date, 'pur', p.total_amount));

    return map;
  }, [sales, expenses, payroll, purchases, cyYear, lyYear]);

  /* ------------------------------------------------------------------ *
   * Aggregates
   * ------------------------------------------------------------------ */
  const totals = useMemo(() => {
    const sum = (arr, key) => arr.reduce((a, m) => a + m[key], 0);
    const cy = buckets[cyYear].monthly;
    const ly = buckets[lyYear].monthly;
    return {
      cyRevenue:  round2(sum(cy, 'rev')),
      lyRevenue:  round2(sum(ly, 'rev')),
      cyExpense:  round2(sum(cy, 'exp') + sum(cy, 'pay')),
      lyExpense:  round2(sum(ly, 'exp') + sum(ly, 'pay')),
      cyPurchase: round2(sum(cy, 'pur')),
      lyPurchase: round2(sum(ly, 'pur')),
    };
  }, [buckets, cyYear, lyYear]);

  const derived = useMemo(() => {
    const cyGross = round2(totals.cyRevenue - totals.cyPurchase);
    const lyGross = round2(totals.lyRevenue - totals.lyPurchase);
    const cyNet   = round2(totals.cyRevenue - totals.cyExpense - totals.cyPurchase);
    const lyNet   = round2(totals.lyRevenue - totals.lyExpense - totals.lyPurchase);
    return {
      cyGross, lyGross, grossDelta: round2(cyGross - lyGross), grossPct: round2(pctDelta(cyGross, lyGross)),
      cyNet,   lyNet,   netDelta:   round2(cyNet - lyNet),     netPct:   round2(pctDelta(cyNet, lyNet)),
      revDelta: round2(totals.cyRevenue - totals.lyRevenue),
      revPct:   round2(pctDelta(totals.cyRevenue, totals.lyRevenue)),
      expDelta: round2(totals.cyExpense - totals.lyExpense),
      expPct:   round2(pctDelta(totals.cyExpense, totals.lyExpense)),
    };
  }, [totals]);

  /* ------------------------------------------------------------------ *
   * Tab row builders
   * ------------------------------------------------------------------ */
  const buildMonthlyRows = (extractor) => {
    const cy = buckets[cyYear].monthly;
    const ly = buckets[lyYear].monthly;
    return MONTH_LABELS.map((label, i) => {
      const current = extractor(cy[i]);
      const prior   = extractor(ly[i]);
      const delta   = round2(current - prior);
      const pct     = round2(pctDelta(current, prior));
      return {
        id: `M-${i}`,
        month: label,
        monthIdx: i,
        lastYear: round2(prior),
        thisYear: round2(current),
        delta,
        pct,
      };
    });
  };

  const revenueRows = useMemo(() => buildMonthlyRows((m) => m.rev), [buckets, cyYear, lyYear]);
  const expenseRows = useMemo(() => buildMonthlyRows((m) => m.exp + m.pay), [buckets, cyYear, lyYear]);

  /* ------------------------------------------------------------------ *
   * Category YoY — ranked by |Δ$|
   * ------------------------------------------------------------------ */
  const categoryRows = useMemo(() => {
    const cats = new Set([
      ...Object.keys(buckets[cyYear].byCat),
      ...Object.keys(buckets[lyYear].byCat),
    ]);
    const rows = Array.from(cats).map((cat) => {
      const cySum = round2((buckets[cyYear].byCat[cat] || []).reduce((a, n) => a + n, 0));
      const lySum = round2((buckets[lyYear].byCat[cat] || []).reduce((a, n) => a + n, 0));
      const delta = round2(cySum - lySum);
      const pct = round2(pctDelta(cySum, lySum));
      return {
        id: `C-${cat}`,
        category: cat,
        lastYear: lySum,
        thisYear: cySum,
        delta,
        pct,
        absDelta: Math.abs(delta),
      };
    });
    return rows.sort((a, b) => b.absDelta - a.absDelta);
  }, [buckets, cyYear, lyYear]);

  /* ------------------------------------------------------------------ *
   * KPIs (shared across tabs)
   * ------------------------------------------------------------------ */
  const kpis = useMemo(() => ([
    {
      id: 'revYoY', label: `Revenue YoY`,
      value: totals.cyRevenue,
      trend: Math.abs(derived.revPct).toFixed(1),
      trendDir: derived.revDelta >= 0 ? 'up' : 'down',
      color: derived.revDelta >= 0 ? 'emerald' : 'rose',
      chartData: revenueRows.map((r) => ({ value: r.thisYear })),
    },
    {
      id: 'expYoY', label: `Expense YoY`,
      value: totals.cyExpense,
      trend: Math.abs(derived.expPct).toFixed(1),
      trendDir: derived.expDelta <= 0 ? 'up' : 'down', // inverted
      color: derived.expDelta <= 0 ? 'emerald' : 'rose',
      chartData: expenseRows.map((r) => ({ value: r.thisYear })),
    },
    {
      id: 'grossYoY', label: `Gross Profit YoY`,
      value: derived.cyGross,
      trend: Math.abs(derived.grossPct).toFixed(1),
      trendDir: derived.grossDelta >= 0 ? 'up' : 'down',
      color: derived.grossDelta >= 0 ? 'emerald' : 'rose',
      chartData: revenueRows.map((r, i) => ({
        value: r.thisYear - (expenseRows[i]?.thisYear || 0),
      })),
    },
    {
      id: 'netYoY', label: `Net Profit YoY`,
      value: derived.cyNet,
      trend: Math.abs(derived.netPct).toFixed(1),
      trendDir: derived.netDelta >= 0 ? 'up' : 'down',
      color: derived.cyNet >= 0 ? 'emerald' : 'rose',
      chartData: revenueRows.map((r, i) => ({
        value: r.thisYear - (expenseRows[i]?.thisYear || 0),
      })),
    },
  ]), [totals, derived, revenueRows, expenseRows]);

  /* ------------------------------------------------------------------ *
   * Reusable column factory for monthly rows
   * ------------------------------------------------------------------ */
  const monthlyColumns = (inverted = false) => ([
    {
      key: 'month', label: 'Month', width: 110, sortable: true,
      render: (val) => (
        <span className="font-semibold text-foreground uppercase tracking-widest text-[11px]">
          {val}
        </span>
      ),
    },
    {
      key: 'lastYear', label: `${lyYear}`, type: 'currency', align: 'right', sortable: true, width: 160,
      render: (val) => <span className="font-semibold text-muted-foreground">{formatINR(val)}</span>,
    },
    {
      key: 'thisYear', label: `${cyYear}`, type: 'currency', align: 'right', sortable: true, width: 160,
      render: (val) => <span className="font-semibold text-foreground">{formatINR(val)}</span>,
    },
    {
      key: 'delta', label: 'Δ Amount', type: 'currency', align: 'right', sortable: true, width: 160,
      render: (val) => {
        const { cls, icon } = deltaBadge(val, inverted);
        const prefix = val > 0 ? '+' : '';
        return (
          <span className={`inline-flex items-center gap-1 font-semibold ${cls}`}>
            {icon} {prefix}{formatINR(val)}
          </span>
        );
      },
    },
    {
      key: 'pct', label: 'Δ %', align: 'right', sortable: true, width: 110,
      render: (val, row) => {
        if (!row.lastYear && !row.thisYear) return <span className="text-muted-foreground">—</span>;
        const { cls } = deltaBadge(row.delta, inverted);
        const prefix = val > 0 ? '+' : '';
        return <span className={`font-semibold ${cls}`}>{prefix}{(val ?? 0).toFixed(1)}%</span>;
      },
    },
  ]);

  /* ------------------------------------------------------------------ *
   * Tabs
   * ------------------------------------------------------------------ */
  const overviewData = useMemo(() => MONTH_LABELS.map((label, i) => ({
    name: label,
    [`Revenue ${cyYear}`]:  revenueRows[i].thisYear,
    [`Revenue ${lyYear}`]:  revenueRows[i].lastYear,
    [`Expense ${cyYear}`]:  expenseRows[i].thisYear,
    [`Expense ${lyYear}`]:  expenseRows[i].lastYear,
  })), [revenueRows, expenseRows, cyYear, lyYear]);

  const overviewRows = useMemo(() => ([
    { id: 'rev', metric: 'Revenue',      lastYear: totals.lyRevenue,  thisYear: totals.cyRevenue,  delta: derived.revDelta,   pct: derived.revPct,   inverted: false },
    { id: 'exp', metric: 'Expenses',     lastYear: totals.lyExpense,  thisYear: totals.cyExpense,  delta: derived.expDelta,   pct: derived.expPct,   inverted: true },
    { id: 'grs', metric: 'Gross Profit', lastYear: derived.lyGross,   thisYear: derived.cyGross,   delta: derived.grossDelta, pct: derived.grossPct, inverted: false },
    { id: 'net', metric: 'Net Profit',   lastYear: derived.lyNet,     thisYear: derived.cyNet,     delta: derived.netDelta,   pct: derived.netPct,   inverted: false },
  ]), [totals, derived]);

  const overviewTab = {
    id: 'YOY_OVERVIEW',
    label: 'Overview',
    icon: <Activity size={18} />,
    data: overviewRows,
    loading,
    totals: {
      lastYear: overviewRows.reduce((a, r) => a + r.lastYear, 0),
      thisYear: overviewRows.reduce((a, r) => a + r.thisYear, 0),
    },
    columns: [
      {
        key: 'metric', label: 'Metric', width: 220,
        render: (val) => (
          <span className="font-semibold text-foreground uppercase tracking-tight text-[11px]">
            {val}
          </span>
        ),
      },
      {
        key: 'lastYear', label: `${lyYear} FY`, type: 'currency', align: 'right', sortable: true, width: 180,
        render: (val) => <span className="font-semibold text-muted-foreground">{formatINR(val)}</span>,
      },
      {
        key: 'thisYear', label: `${cyYear} FY`, type: 'currency', align: 'right', sortable: true, width: 180,
        render: (val) => <span className="font-semibold text-foreground">{formatINR(val)}</span>,
      },
      {
        key: 'delta', label: 'Δ Amount', type: 'currency', align: 'right', width: 180,
        render: (val, row) => {
          const { cls, icon } = deltaBadge(val, row.inverted);
          const prefix = val > 0 ? '+' : '';
          return (
            <span className={`inline-flex items-center gap-1 font-semibold ${cls}`}>
              {icon} {prefix}{formatINR(val)}
            </span>
          );
        },
      },
      {
        key: 'pct', label: 'Δ %', align: 'right', width: 140,
        render: (val, row) => {
          const { cls } = deltaBadge(row.delta, row.inverted);
          const prefix = val > 0 ? '+' : '';
          if (val == null) return <span className="text-muted-foreground">—</span>;
          return <span className={`font-semibold text-[13px] ${cls}`}>{prefix}{(val ?? 0).toFixed(1)}%</span>;
        },
      },
    ],
    kpis,
    chartConfig: {
      title: `${cyYear} vs ${lyYear} · Monthly overlay`,
      type: 'line',
      data: overviewData,
      series: [
        { key: `Revenue ${cyYear}`, name: `Revenue ${cyYear}`, color: '#10b981' },
        { key: `Revenue ${lyYear}`, name: `Revenue ${lyYear}`, color: '#a7f3d0' },
        { key: `Expense ${cyYear}`, name: `Expense ${cyYear}`, color: '#ef4444' },
        { key: `Expense ${lyYear}`, name: `Expense ${lyYear}`, color: '#fecaca' },
      ],
    },
    detailFields: [
      { key: 'thisYear', label: `${cyYear}`, type: 'currency', isHero: true },
      { key: 'metric',   label: 'Metric' },
      { key: 'lastYear', label: `${lyYear}`, type: 'currency' },
      { key: 'delta',    label: 'Change',    type: 'currency' },
      { key: 'pct',      label: 'Change %' },
    ],
  };

  const revenueTab = {
    id: 'YOY_REVENUE',
    label: 'Revenue YoY',
    icon: <TrendingUp size={18} />,
    data: revenueRows,
    loading,
    totals: {
      lastYear: totals.lyRevenue,
      thisYear: totals.cyRevenue,
      delta: derived.revDelta,
    },
    columns: monthlyColumns(false),
    kpis,
    chartConfig: {
      title: `Monthly Revenue · ${cyYear} vs ${lyYear}`,
      type: 'bar',
      data: revenueRows.map((r) => ({
        name: r.month,
        [`${lyYear}`]: r.lastYear,
        [`${cyYear}`]: r.thisYear,
      })),
      series: [
        { key: `${lyYear}`, name: `${lyYear}`, color: '#a7f3d0' },
        { key: `${cyYear}`, name: `${cyYear}`, color: '#10b981' },
      ],
    },
    detailFields: [
      { key: 'thisYear', label: `${cyYear} Revenue`, type: 'currency', isHero: true },
      { key: 'month',    label: 'Month' },
      { key: 'lastYear', label: `${lyYear} Revenue`, type: 'currency' },
      { key: 'delta',    label: 'Change',            type: 'currency' },
      { key: 'pct',      label: 'Change %' },
    ],
  };

  const expenseTab = {
    id: 'YOY_EXPENSE',
    label: 'Expense YoY',
    icon: <Wallet size={18} />,
    data: expenseRows,
    loading,
    totals: {
      lastYear: totals.lyExpense,
      thisYear: totals.cyExpense,
      delta: derived.expDelta,
    },
    columns: monthlyColumns(true),
    kpis,
    chartConfig: {
      title: `Monthly Expense · ${cyYear} vs ${lyYear}`,
      type: 'bar',
      data: expenseRows.map((r) => ({
        name: r.month,
        [`${lyYear}`]: r.lastYear,
        [`${cyYear}`]: r.thisYear,
      })),
      series: [
        { key: `${lyYear}`, name: `${lyYear}`, color: '#fecaca' },
        { key: `${cyYear}`, name: `${cyYear}`, color: '#ef4444' },
      ],
    },
    detailFields: [
      { key: 'thisYear', label: `${cyYear} Expense`, type: 'currency', isHero: true },
      { key: 'month',    label: 'Month' },
      { key: 'lastYear', label: `${lyYear} Expense`, type: 'currency' },
      { key: 'delta',    label: 'Change',            type: 'currency' },
      { key: 'pct',      label: 'Change %' },
    ],
  };

  const categoryTab = {
    id: 'YOY_CATEGORY',
    label: 'Category YoY',
    icon: <Layers size={18} />,
    data: categoryRows,
    loading,
    totals: {
      lastYear: categoryRows.reduce((a, r) => a + r.lastYear, 0),
      thisYear: categoryRows.reduce((a, r) => a + r.thisYear, 0),
    },
    columns: [
      {
        key: 'category', label: 'Category', width: 240, sortable: true,
        render: (val) => (
          <span className="font-semibold text-foreground uppercase tracking-tight text-[11px]">
            {val}
          </span>
        ),
      },
      {
        key: 'lastYear', label: `${lyYear}`, type: 'currency', align: 'right', sortable: true, width: 170,
        render: (val) => <span className="font-semibold text-muted-foreground">{formatINR(val)}</span>,
      },
      {
        key: 'thisYear', label: `${cyYear}`, type: 'currency', align: 'right', sortable: true, width: 170,
        render: (val) => <span className="font-semibold text-foreground">{formatINR(val)}</span>,
      },
      {
        key: 'delta', label: 'Δ Amount', type: 'currency', align: 'right', sortable: true, width: 170,
        render: (val) => {
          const { cls, icon } = deltaBadge(val, true); // expenses: down is good
          const prefix = val > 0 ? '+' : '';
          return (
            <span className={`inline-flex items-center gap-1 font-semibold ${cls}`}>
              {icon} {prefix}{formatINR(val)}
            </span>
          );
        },
      },
      {
        key: 'pct', label: 'Δ %', align: 'right', sortable: true, width: 110,
        render: (val, row) => {
          if (!row.lastYear && !row.thisYear) return <span className="text-muted-foreground">—</span>;
          if (val == null) return <span className="text-muted-foreground">—</span>;
          const { cls } = deltaBadge(row.delta, true);
          const prefix = val > 0 ? '+' : '';
          return <span className={`font-semibold ${cls}`}>{prefix}{(val ?? 0).toFixed(1)}%</span>;
        },
      },
    ],
    kpis,
    chartConfig: {
      title: `Expense Categories · ${cyYear} vs ${lyYear}`,
      type: 'bar',
      data: categoryRows.slice(0, 10).map((r) => ({
        name: r.category,
        [`${lyYear}`]: r.lastYear,
        [`${cyYear}`]: r.thisYear,
      })),
      series: [
        { key: `${lyYear}`, name: `${lyYear}`, color: '#fecaca' },
        { key: `${cyYear}`, name: `${cyYear}`, color: '#ef4444' },
      ],
    },
    detailFields: [
      { key: 'thisYear', label: `${cyYear} Total`, type: 'currency', isHero: true },
      { key: 'category', label: 'Category' },
      { key: 'lastYear', label: `${lyYear} Total`, type: 'currency' },
      { key: 'delta',    label: 'Change',          type: 'currency' },
      { key: 'pct',      label: 'Change %' },
    ],
  };

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */
  return (
    <div className="flex flex-col gap-4">
      {/* Year switcher + headline strip */}
      <div className="no-print flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-card/60 backdrop-blur-md border border-border/60">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-accent-signature" />
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Compare</span>
        </div>
        <select
          value={cyYear}
          onChange={(e) => setCyYear(Number(e.target.value))}
          className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground bg-card border border-black/10 rounded-md focus:outline-none focus:border-accent-signature"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y} vs {y - 1}</option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Headline deltas */}
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Revenue</div>
            <div className={`inline-flex items-center gap-1 text-sm font-semibold ${derived.revDelta >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {derived.revDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {derived.revPct >= 0 ? '+' : ''}{derived.revPct.toFixed(1)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Expense</div>
            <div className={`inline-flex items-center gap-1 text-sm font-semibold ${derived.expDelta <= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {derived.expDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {derived.expPct >= 0 ? '+' : ''}{derived.expPct.toFixed(1)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Net Profit</div>
            <div className={`inline-flex items-center gap-1 text-sm font-semibold ${derived.netDelta >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {derived.netDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {derived.netPct >= 0 ? '+' : ''}{derived.netPct.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      <PremiumReportView title="Year-over-Year" tabs={[overviewTab, revenueTab, expenseTab, categoryTab]} />
    </div>
  );
};

export default YoYComparisonReport;
