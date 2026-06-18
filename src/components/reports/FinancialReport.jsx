import React, { useEffect, useMemo, useState } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { formatCurrency } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { CreditCard, Target, TrendingUp, Scale } from 'lucide-react';

/**
 * Profit & Loss — now sourced from the double-entry General Ledger
 * (get_gl_balances) instead of a naive Sales − Expenses calculation.
 *
 * The old version credited gross sales (GST-inclusive, returns ignored) and
 * never subtracted Cost of Goods Sold, so "profit" was overstated several-fold.
 * The GL posts revenue net of GST, books COGS on every sale, and reverses
 * returns — so reading it gives a real accrual P&L:
 *
 *     Sales Revenue (net) − COGS = Gross Profit − Operating Expenses = Net Profit
 */
const FinancialReport = () => {
  const { currentTenantId } = useTenant();
  const [gl, setGl] = useState([]);
  const [glLoading, setGlLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!currentTenantId) return;
      setGlLoading(true);
      const { data, error } = await supabase.rpc('get_gl_balances', { p_tenant_id: currentTenantId });
      if (cancelled) return;
      if (error) {
        console.error('[P&L] get_gl_balances failed:', error);
        setGl([]);
      } else {
        setGl((data || []).map(r => ({ ...r, balance: Number(r.balance) || 0 })));
      }
      setGlLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [currentTenantId]);

  // Payment-mix tab still reads sales directly (collections view, not P&L).
  const { data: sales, loading: salesLoading } = useReportData({
    table: 'sales',
    select: 'totalAmount, date, paymentMethod',
    dateColumn: 'date',
  });

  // ── Build the P&L statement from GL balances ──
  const pl = useMemo(() => {
    const acct = (code) => gl.find(a => a.code === code)?.balance || 0;
    const revenue = gl.filter(a => a.type === 'REVENUE').reduce((s, a) => s + a.balance, 0);
    const cogs = acct('5000');
    const opexAccounts = gl
      .filter(a => a.type === 'EXPENSE' && a.code !== '5000' && a.balance !== 0)
      .map(a => ({ name: a.name, amount: a.balance }));
    const opexTotal = opexAccounts.reduce((s, a) => s + a.amount, 0);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - opexTotal;
    const gstPayable = acct('2200');

    const statement = [
      { label: 'Sales Revenue (net of GST)', amount: revenue, kind: 'pos' },
      { label: 'Cost of Goods Sold', amount: -cogs, kind: 'neg' },
      { label: 'Gross Profit', amount: grossProfit, kind: 'subtotal' },
      ...opexAccounts.map(a => ({ label: a.name, amount: -a.amount, kind: 'neg' })),
      { label: 'Net Profit', amount: netProfit, kind: 'total' },
    ];

    return { revenue, cogs, opexTotal, grossProfit, netProfit, gstPayable, statement };
  }, [gl]);

  const insightMetrics = useMemo(() => {
    const map = sales.reduce((acc, s) => {
      const m = s.paymentMethod || 'CASH';
      if (!acc[m]) acc[m] = { name: m, value: 0, count: 0 };
      acc[m].value += s.totalAmount || 0;
      acc[m].count += 1;
      return acc;
    }, {});
    return { paymentMix: Object.values(map).sort((a, b) => b.value - a.value) };
  }, [sales]);

  const totalCollected = insightMetrics.paymentMix.reduce((s, m) => s + m.value, 0);

  const plTab = {
    id: 'PL_STATEMENT',
    label: 'P&L Statement',
    icon: <Target size={18} />,
    data: pl.statement,
    loading: glLoading,
    totals: { amount: pl.netProfit },
    columns: [
      {
        key: 'label', label: 'Line Item', sortable: false, width: 320,
        render: (val, row) => (
          <span className={
            row.kind === 'total' ? 'font-black text-ink-primary uppercase tracking-tight'
            : row.kind === 'subtotal' ? 'font-black text-ink-primary'
            : 'font-semibold text-gray-600'
          }>{val}</span>
        ),
      },
      {
        key: 'amount', label: 'Amount', type: 'currency', align: 'right', width: 200,
        render: (val, row) => {
          const strong = row.kind === 'total' || row.kind === 'subtotal';
          const color = row.kind === 'neg' ? 'text-red-500'
            : val >= 0 ? (strong ? 'text-emerald-600' : 'text-ink-primary')
            : 'text-red-600';
          return <span className={`${strong ? 'font-black' : 'font-bold'} ${color}`}>{formatCurrency(val)}</span>;
        },
      },
    ],
    kpis: [
      { id: 'rev', label: 'Revenue (net)', value: pl.revenue, trendDir: 'none', color: 'indigo', chartData: [] },
      { id: 'gp', label: 'Gross Profit', value: pl.grossProfit, trendDir: pl.grossProfit >= 0 ? 'up' : 'down', color: 'sky', chartData: [] },
      { id: 'np', label: 'Net Profit', value: pl.netProfit, trendDir: pl.netProfit >= 0 ? 'up' : 'down', color: pl.netProfit >= 0 ? 'emerald' : 'rose', chartData: [] },
      { id: 'gst', label: 'GST Payable', value: pl.gstPayable, trendDir: 'none', color: 'amber', chartData: [] },
    ],
    chartConfig: {
      title: 'Revenue → Net Profit',
      type: 'bar',
      data: [
        { name: 'Revenue', value: pl.revenue },
        { name: 'COGS', value: pl.cogs },
        { name: 'Expenses', value: pl.opexTotal },
        { name: 'Net Profit', value: pl.netProfit },
      ],
      series: [{ key: 'value', name: 'Amount', color: '#D97706' }],
    },
  };

  const mixTab = {
    id: 'PAYMENT_MIX',
    label: 'Payment Mix',
    icon: <CreditCard size={18} />,
    data: insightMetrics.paymentMix,
    loading: salesLoading,
    totals: { value: totalCollected },
    columns: [
      { key: 'name', label: 'Payment Method', sortable: true, width: 220, render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span> },
      { key: 'count', label: 'Transactions', align: 'right', width: 140, render: (val) => <span className="font-mono text-gray-400">{val}</span> },
      { key: 'value', label: 'Total Collected', type: 'currency', align: 'right', sortable: true, width: 180 },
      { key: 'share', label: 'Share', align: 'right', width: 120, render: (_, row) => {
        const s = totalCollected > 0 ? (row.value / totalCollected) * 100 : 0;
        return <span className="text-[10px] font-black text-accent-signature">{s.toFixed(1)}%</span>;
      } },
    ],
    kpis: [
      { id: 'primary', label: 'Top Method', value: insightMetrics.paymentMix[0]?.value || 0, trendDir: 'none', color: 'indigo', chartData: [] },
      { id: 'avg_val', label: 'Avg Ticket Size', value: totalCollected / (sales.length || 1), trendDir: 'none', color: 'emerald', chartData: [] },
    ],
    chartConfig: {
      title: 'Revenue by payment method', type: 'pie',
      data: insightMetrics.paymentMix.map(m => ({ name: m.name, value: m.value })),
    },
  };

  return <PremiumReportView title="Profit & Loss" tabs={[plTab, mixTab]} />;
};

export default FinancialReport;
