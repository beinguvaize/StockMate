import React, { useMemo, useState, useEffect, useCallback } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import {
  TrendingUp, Calendar, Copy, Sparkles, Wallet,
  CheckCircle2, AlertTriangle, Edit3, Cloud,
} from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import {
  upsertBudgetLine, bulkUpsertBudget, copyBudget,
  recentPeriods, periodLabel,
} from '../../lib/budgetRepo';
import { migrateLocalBudgetsOnce } from '../../lib/budgetMigration';

/**
 * Budget vs Actual — Supabase-backed.
 *
 * Reads:
 *   - Actuals: sales / expenses / payroll (via useReportData, realtime)
 *   - Budgets: public.budgets table (via useReportData, realtime — tenant RLS)
 *
 * Writes (through budgetRepo):
 *   - upsertBudgetLine on inline edit
 *   - copyBudget for "Copy Last Month"
 *   - bulkUpsertBudget for "Suggest from 3-mo avg"
 *
 * One-time migration: on mount we drain any legacy localStorage budget
 * entries into the Supabase table, then clear them.
 */

const monthKey = (date) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const classifyVariance = (budget, actual, type) => {
  if (!budget || budget <= 0) return { status: 'NO_BUDGET', color: 'gray' };
  const pct = ((actual - budget) / budget) * 100;

  if (type === 'EXPENSE') {
    if (pct <= -5) return { status: 'UNDER',    color: 'emerald', pct };
    if (pct <= 5)  return { status: 'ON_TRACK', color: 'indigo',  pct };
    if (pct <= 15) return { status: 'WATCH',    color: 'amber',   pct };
    return             { status: 'OVER',     color: 'rose',    pct };
  }
  // REVENUE — direction flips
  if (pct >= 5)   return { status: 'AHEAD',    color: 'emerald', pct };
  if (pct >= -5)  return { status: 'ON_TRACK', color: 'indigo',  pct };
  if (pct >= -15) return { status: 'WATCH',    color: 'amber',   pct };
  return              { status: 'BEHIND',   color: 'rose',    pct };
};

const STATUS_LABELS = {
  UNDER:     'Under Budget',
  OVER:      'Over Budget',
  AHEAD:     'Ahead of Plan',
  BEHIND:    'Behind Plan',
  ON_TRACK:  'On Track',
  WATCH:     'Watch',
  NO_BUDGET: 'No Budget',
};

const BADGE_CLS = {
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  rose:    'bg-rose-50 text-rose-600 border-rose-200',
  amber:   'bg-amber-50 text-amber-600 border-amber-200',
  indigo:  'bg-indigo-50 text-indigo-600 border-indigo-200',
  gray:    'bg-gray-50 text-gray-500 border-gray-200',
};

const BudgetVsActualReport = () => {
  const periods = useMemo(() => recentPeriods(12), []);
  const [period, setPeriod] = useState(periods[0]);
  const [migrated, setMigrated] = useState(false);

  // --- Pull actuals ---
  const { data: sales,    loading: l1 } = useReportData({ table: 'sales',    select: 'totalAmount, date',      dateColumn: 'date' });
  const { data: expenses, loading: l2 } = useReportData({ table: 'expenses', select: 'amount, category, date', dateColumn: 'date' });
  const { data: payroll,  loading: l3 } = useReportData({ table: 'payroll',  select: 'amount, processed_at',   dateColumn: 'processed_at' });

  // --- Pull budget rows straight from Supabase with realtime subscription.
  // useReportData handles tenant RLS and the realtime channel for us.
  const { data: budgetRows, loading: l4, refetch: refetchBudgets } = useReportData({
    table: 'budgets',
    select: 'id, period, category, amount, type',
  });

  const loading = l1 || l2 || l3 || l4;

  // --- Drain localStorage budgets into Supabase once on mount ---
  useEffect(() => {
    if (migrated) return;
    migrateLocalBudgetsOnce().then((moved) => {
      if (moved > 0) refetchBudgets();
      setMigrated(true);
    });
  }, [migrated, refetchBudgets]);

  // --- Index budgets by period → category ---
  const budgetsByPeriod = useMemo(() => {
    const map = {};
    (budgetRows || []).forEach((r) => {
      const p = r.period;
      if (!map[p]) map[p] = {};
      map[p][r.category] = { id: r.id, amount: Number(r.amount) || 0, type: r.type };
    });
    return map;
  }, [budgetRows]);

  const budget = budgetsByPeriod[period] || {};

  // --- Bucket actuals by YYYY-MM & category ---
  const actualsByMonth = useMemo(() => {
    const map = {};
    const touch = (m) => {
      if (!map[m]) map[m] = { expense: {}, revenue: {} };
      return map[m];
    };
    sales.forEach((s) => {
      const m = monthKey(s.date); if (!m) return;
      const b = touch(m);
      b.revenue['Sales'] = (b.revenue['Sales'] || 0) + (Number(s.totalAmount) || 0);
    });
    expenses.forEach((e) => {
      const m = monthKey(e.date); if (!m) return;
      const cat = (e.category || 'GENERAL').toUpperCase();
      const b = touch(m);
      b.expense[cat] = (b.expense[cat] || 0) + (Number(e.amount) || 0);
    });
    payroll.forEach((p) => {
      const m = monthKey(p.processed_at); if (!m) return;
      const b = touch(m);
      b.expense['PAYROLL'] = (b.expense['PAYROLL'] || 0) + (Number(p.amount) || 0);
    });
    return map;
  }, [sales, expenses, payroll]);

  const monthActuals = actualsByMonth[period] || { expense: {}, revenue: {} };

  // --- Category sets (union of budget + actuals) ---
  const expenseCategories = useMemo(() => {
    const set = new Set([
      ...Object.keys(monthActuals.expense || {}),
      ...Object.keys(budget).filter((k) => budget[k].type === 'EXPENSE'),
    ]);
    return Array.from(set).sort();
  }, [monthActuals, budget]);

  const revenueCategories = useMemo(() => {
    const set = new Set([
      ...Object.keys(monthActuals.revenue || {}),
      ...Object.keys(budget).filter((k) => budget[k].type === 'REVENUE'),
    ]);
    if (set.size === 0) set.add('Sales');
    return Array.from(set).sort();
  }, [monthActuals, budget]);

  const buildRow = (category, type) => {
    const actual = type === 'EXPENSE'
      ? (monthActuals.expense?.[category] || 0)
      : (monthActuals.revenue?.[category] || 0);
    const budgeted = budget[category]?.amount || 0;
    const variance = round2(actual - budgeted);
    const v = classifyVariance(budgeted, actual, type);
    return {
      id: `${type}-${category}`,
      category,
      type,
      budget: round2(budgeted),
      actual: round2(actual),
      variance,
      variancePct: v.pct ?? 0,
      status: v.status,
      statusColor: v.color,
      utilization: budgeted > 0 ? round2((actual / budgeted) * 100) : 0,
    };
  };

  const expenseRowsData = useMemo(
    () => expenseCategories.map((c) => buildRow(c, 'EXPENSE')),
    [expenseCategories, budget, monthActuals]
  );
  const revenueRowsData = useMemo(
    () => revenueCategories.map((c) => buildRow(c, 'REVENUE')),
    [revenueCategories, budget, monthActuals]
  );

  // --- Totals / KPIs ---
  const totals = useMemo(() => {
    const expBudget = expenseRowsData.reduce((a, r) => a + r.budget, 0);
    const expActual = expenseRowsData.reduce((a, r) => a + r.actual, 0);
    const revBudget = revenueRowsData.reduce((a, r) => a + r.budget, 0);
    const revActual = revenueRowsData.reduce((a, r) => a + r.actual, 0);

    const onTrack = [...expenseRowsData, ...revenueRowsData].filter(
      (r) => r.status === 'ON_TRACK' || r.status === 'UNDER' || r.status === 'AHEAD'
    ).length;

    return {
      expBudget: round2(expBudget),
      expActual: round2(expActual),
      expVariance: round2(expActual - expBudget),
      revBudget: round2(revBudget),
      revActual: round2(revActual),
      revVariance: round2(revActual - revBudget),
      plannedProfit: round2(revBudget - expBudget),
      actualProfit: round2(revActual - expActual),
      onTrack,
      totalLines: expenseRowsData.length + revenueRowsData.length,
    };
  }, [expenseRowsData, revenueRowsData]);

  // --- Handlers (all go through Supabase; realtime channel refreshes the UI) ---
  const handleBudgetChange = useCallback(async (category, type, value) => {
    await upsertBudgetLine(period, category, value, type);
    refetchBudgets();
  }, [period, refetchBudgets]);

  const handleCopyLastMonth = useCallback(async () => {
    const idx = periods.indexOf(period);
    const prev = periods[idx + 1];
    if (!prev) return;
    await copyBudget(prev, period);
    refetchBudgets();
  }, [period, periods, refetchBudgets]);

  const handleSuggestAvg = useCallback(async () => {
    const idx = periods.indexOf(period);
    const sample = periods.slice(idx + 1, idx + 4);
    if (sample.length === 0) return;

    const sums = {};
    sample.forEach((p) => {
      const b = actualsByMonth[p];
      if (!b) return;
      Object.entries(b.expense || {}).forEach(([cat, amt]) => {
        if (!sums[cat]) sums[cat] = { total: 0, type: 'EXPENSE' };
        sums[cat].total += amt;
      });
      Object.entries(b.revenue || {}).forEach(([cat, amt]) => {
        if (!sums[cat]) sums[cat] = { total: 0, type: 'REVENUE' };
        sums[cat].total += amt;
      });
    });

    const entries = Object.entries(sums).map(([category, v]) => ({
      category,
      amount: v.total / sample.length,
      type: v.type,
    }));

    await bulkUpsertBudget(period, entries);
    refetchBudgets();
  }, [period, periods, actualsByMonth, refetchBudgets]);

  // --- KPIs ---
  const kpis = useMemo(() => ([
    {
      id: 'revVar', label: 'Revenue vs Plan', value: totals.revVariance,
      trend: totals.revBudget > 0 ? Math.abs((totals.revVariance / totals.revBudget) * 100).toFixed(1) : 0,
      trendDir: totals.revVariance >= 0 ? 'up' : 'down',
      color: totals.revVariance >= 0 ? 'emerald' : 'rose',
      chartData: [{ value: totals.revBudget }, { value: totals.revActual }],
    },
    {
      id: 'expVar', label: 'Expense vs Plan', value: totals.expVariance,
      trend: totals.expBudget > 0 ? Math.abs((totals.expVariance / totals.expBudget) * 100).toFixed(1) : 0,
      trendDir: totals.expVariance <= 0 ? 'up' : 'down',
      color: totals.expVariance <= 0 ? 'emerald' : 'rose',
      chartData: [{ value: totals.expBudget }, { value: totals.expActual }],
    },
    {
      id: 'profit', label: 'Profit vs Plan', value: totals.actualProfit,
      trend: totals.plannedProfit !== 0
        ? (((totals.actualProfit - totals.plannedProfit) / Math.abs(totals.plannedProfit)) * 100).toFixed(1)
        : 0,
      trendDir: totals.actualProfit >= totals.plannedProfit ? 'up' : 'down',
      color: totals.actualProfit >= 0 ? 'emerald' : 'rose',
      chartData: [{ value: totals.plannedProfit }, { value: totals.actualProfit }],
    },
    {
      id: 'onTrack', label: 'Lines On-Track',
      value: `${totals.onTrack}/${totals.totalLines || 0}`,
      trend: totals.totalLines > 0 ? ((totals.onTrack / totals.totalLines) * 100).toFixed(0) : 0,
      trendDir: 'up',
      color: 'indigo',
      chartData: [{ value: totals.onTrack }, { value: totals.totalLines - totals.onTrack }],
    },
  ]), [totals]);

  // --- Inline-editable budget cell ---
  const BudgetInput = ({ row }) => {
    const [local, setLocal] = useState(row.budget || '');
    const [saving, setSaving] = useState(false);
    useEffect(() => { setLocal(row.budget || ''); }, [row.budget]);

    return (
      <div className="flex items-center justify-end gap-1">
        <span className="text-[10px] text-gray-400">₹</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="100"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          disabled={saving}
          onBlur={async () => {
            const next = Number(local);
            if (Number.isFinite(next) && next !== row.budget) {
              setSaving(true);
              await handleBudgetChange(row.category, row.type, next);
              setSaving(false);
            }
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          placeholder="—"
          className={`w-28 px-2 py-1 text-right text-[11px] font-black text-ink-primary bg-white/70 border border-black/10 rounded-md focus:outline-none focus:border-accent-signature focus:bg-white transition-all ${saving ? 'opacity-50' : ''}`}
        />
      </div>
    );
  };

  const makeColumns = (type) => ([
    {
      key: 'category', label: 'Category', width: 220, sortable: true,
      render: (val) => (
        <span className="font-black text-ink-primary uppercase tracking-tight text-[11px]">
          {val}
        </span>
      ),
    },
    {
      key: 'budget', label: 'Budget', type: 'currency', align: 'right', sortable: true, width: 180,
      render: (_, row) => <BudgetInput row={row} />,
    },
    {
      key: 'actual', label: 'Actual', type: 'currency', align: 'right', sortable: true, width: 160,
      render: (val) => <span className="font-black text-ink-primary">{formatINR(val)}</span>,
    },
    {
      key: 'variance', label: 'Variance', type: 'currency', align: 'right', sortable: true, width: 160,
      render: (val, row) => {
        const good = (row.type === 'EXPENSE' && val <= 0) || (row.type === 'REVENUE' && val >= 0);
        const cls = row.budget === 0 ? 'text-gray-400' : good ? 'text-emerald-600' : 'text-rose-500';
        const prefix = val > 0 ? '+' : '';
        return <span className={`font-black ${cls}`}>{prefix}{formatINR(val)}</span>;
      },
    },
    {
      key: 'variancePct', label: 'Δ %', align: 'right', sortable: true, width: 100,
      render: (val, row) => {
        if (!row.budget) return <span className="text-gray-300">—</span>;
        if (val == null) return <span className="text-gray-300">—</span>;
        const good = (row.type === 'EXPENSE' && val <= 0) || (row.type === 'REVENUE' && val >= 0);
        const cls = good ? 'text-emerald-600' : 'text-rose-500';
        const prefix = val > 0 ? '+' : '';
        return <span className={`font-black ${cls}`}>{prefix}{(val ?? 0).toFixed(1)}%</span>;
      },
    },
    {
      key: 'status', label: 'Status', width: 150,
      render: (val, row) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${BADGE_CLS[row.statusColor] || BADGE_CLS.gray}`}>
          {val === 'OVER' || val === 'BEHIND' ? <AlertTriangle size={10} /> :
           val === 'ON_TRACK' || val === 'UNDER' || val === 'AHEAD' ? <CheckCircle2 size={10} /> : null}
          {STATUS_LABELS[val] || val}
        </span>
      ),
    },
  ]);

  const expenseTab = {
    id: 'BUDGET_EXPENSE',
    label: 'Expense Lines',
    icon: <Wallet size={18} />,
    data: expenseRowsData,
    loading,
    totals: {
      budget: totals.expBudget,
      actual: totals.expActual,
      variance: totals.expVariance,
    },
    columns: makeColumns('EXPENSE'),
    kpis,
    chartConfig: {
      title: `${periodLabel(period)} · Expense Budget vs Actual`,
      type: 'bar',
      data: expenseRowsData.map((r) => ({ name: r.category, Budget: r.budget, Actual: r.actual })),
      series: [
        { key: 'Budget', name: 'Budget', color: '#6366f1' },
        { key: 'Actual', name: 'Actual', color: '#ef4444' },
      ],
    },
    detailFields: [
      { key: 'actual', label: 'Actual Spend', type: 'currency', isHero: true },
      { key: 'category', label: 'Category' },
      { key: 'budget', label: 'Budget', type: 'currency' },
      { key: 'variance', label: 'Variance', type: 'currency' },
      { key: 'variancePct', label: 'Variance %' },
      { key: 'status', label: 'Status' },
      { key: 'utilization', label: 'Budget Utilization %' },
    ],
  };

  const revenueTab = {
    id: 'BUDGET_REVENUE',
    label: 'Revenue Lines',
    icon: <TrendingUp size={18} />,
    data: revenueRowsData,
    loading,
    totals: {
      budget: totals.revBudget,
      actual: totals.revActual,
      variance: totals.revVariance,
    },
    columns: makeColumns('REVENUE'),
    kpis,
    chartConfig: {
      title: `${periodLabel(period)} · Revenue Budget vs Actual`,
      type: 'bar',
      data: revenueRowsData.map((r) => ({ name: r.category, Budget: r.budget, Actual: r.actual })),
      series: [
        { key: 'Budget', name: 'Budget', color: '#6366f1' },
        { key: 'Actual', name: 'Actual', color: '#10b981' },
      ],
    },
    detailFields: [
      { key: 'actual', label: 'Actual Revenue', type: 'currency', isHero: true },
      { key: 'category', label: 'Category' },
      { key: 'budget', label: 'Budget', type: 'currency' },
      { key: 'variance', label: 'Variance', type: 'currency' },
      { key: 'variancePct', label: 'Variance %' },
      { key: 'status', label: 'Status' },
    ],
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Period + Quick Actions */}
      <div className="no-print flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-white/60 backdrop-blur-md border border-black/5">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-accent-signature" />
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Period</span>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-ink-primary bg-white border border-black/10 rounded-md focus:outline-none focus:border-accent-signature"
        >
          {periods.map((p) => (
            <option key={p} value={p}>{periodLabel(p)}</option>
          ))}
        </select>

        <div className="h-6 w-px bg-black/10 mx-1" />

        <button
          onClick={handleCopyLastMonth}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-600 hover:text-ink-primary bg-white border border-black/10 hover:border-accent-signature rounded-md transition-all"
        >
          <Copy size={12} /> Copy Last Month
        </button>
        <button
          onClick={handleSuggestAvg}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-white hover:bg-indigo-600 bg-indigo-50 border border-indigo-200 rounded-md transition-all"
        >
          <Sparkles size={12} /> Suggest from 3-mo Avg
        </button>

        <div className="flex-1" />

        {/* Cloud indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100">
          <Cloud size={10} className="text-emerald-600" />
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Cloud-synced</span>
        </div>

        {/* Summary strip */}
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">Planned Profit</div>
            <div className="text-sm font-black text-indigo-600">{formatINR(totals.plannedProfit)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">Actual Profit</div>
            <div className={`text-sm font-black ${totals.actualProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {formatINR(totals.actualProfit)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">On-Track</div>
            <div className="text-sm font-black text-ink-primary">
              {totals.onTrack}/{totals.totalLines || 0}
            </div>
          </div>
        </div>
      </div>

      <div className="no-print flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50/50 border border-indigo-100">
        <Edit3 size={12} className="text-indigo-600" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
          Tip: Click any Budget cell to edit. Changes sync across all devices in real-time.
        </span>
      </div>

      <ReportShell tabs={[expenseTab, revenueTab]} />
    </div>
  );
};

export default BudgetVsActualReport;
