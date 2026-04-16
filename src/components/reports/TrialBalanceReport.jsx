import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { Scale, CheckCircle2, AlertTriangle, Receipt, Landmark } from 'lucide-react';
import {
  formatINR, round2, computeVirtualLedger, NORMAL_BALANCE,
  DEFAULT_CHART_OF_ACCOUNTS
} from '../../utils/financialCalculations';

/**
 * Trial Balance Report
 * ---------------------
 * Lists every GL account with Debit and Credit balances.
 * Total Debits MUST equal Total Credits (double-entry invariant).
 */
const TrialBalanceReport = () => {
  const { data: sales, loading: l1 } = useReportData({ table: 'sales', select: 'totalAmount, totalCogs, tax, date', dateColumn: 'date' });
  const { data: expenses, loading: l2 } = useReportData({ table: 'expenses', select: 'amount, date', dateColumn: 'date' });
  const { data: payroll, loading: l3 } = useReportData({ table: 'payroll', select: 'amount, processed_at', dateColumn: 'processed_at' });
  const { data: clients, loading: l4 } = useReportData({ table: 'clients', select: '*', nullFilters: { deleted_at: null } });
  const { data: products, loading: l5 } = useReportData({ table: 'products', select: '*' });
  const { data: purchases, loading: l6 } = useReportData({ table: 'purchases', select: '*', dateColumn: 'date' });
  const { data: vehicles, loading: l7 } = useReportData({ table: 'vehicles', select: '*' });

  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7;

  const gl = useMemo(() => computeVirtualLedger({
    sales, expenses, payroll, clients, products, purchases, vehicles
  }), [sales, expenses, payroll, clients, products, purchases, vehicles]);

  // Map each account from COA to its balance
  const accountBalances = {
    '1000': gl.cash,
    '1100': gl.accountsReceivable,
    '1200': gl.inventory,
    '1500': gl.fixedAssets,
    '2000': gl.accountsPayable,
    '2100': gl.accruedPayroll,
    '2200': gl.taxPayable,
    '3000': gl.ownerEquity,
    '3100': gl.retainedEarnings,
    '4000': gl.revenue,
    '5000': gl.cogs,
    '5100': gl.payroll,
    '5200': gl.opex,
    '5300': 0,
  };

  const rows = useMemo(() => {
    return DEFAULT_CHART_OF_ACCOUNTS.map((acc) => {
      const balance = accountBalances[acc.code] || 0;
      const normal = NORMAL_BALANCE[acc.type];
      // Positive balance placed on its normal side
      const debit = normal === 'DEBIT' ? Math.max(balance, 0) : Math.max(-balance, 0);
      const credit = normal === 'CREDIT' ? Math.max(balance, 0) : Math.max(-balance, 0);

      return {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        category: acc.category,
        debit: round2(debit),
        credit: round2(credit),
      };
    });
  }, [gl]);

  const totals = useMemo(() => {
    const totalDebit = rows.reduce((a, r) => a + r.debit, 0);
    const totalCredit = rows.reduce((a, r) => a + r.credit, 0);
    return { debit: round2(totalDebit), credit: round2(totalCredit), diff: round2(totalDebit - totalCredit) };
  }, [rows]);

  const balanced = Math.abs(totals.diff) < 1;

  const kpis = [
    {
      id: 'dr', label: 'Total Debits', value: totals.debit,
      trend: 100, trendDir: 'up', color: 'indigo',
      chartData: rows.filter((r) => r.debit > 0).map((r) => ({ value: r.debit })),
    },
    {
      id: 'cr', label: 'Total Credits', value: totals.credit,
      trend: 100, trendDir: 'up', color: 'emerald',
      chartData: rows.filter((r) => r.credit > 0).map((r) => ({ value: r.credit })),
    },
    {
      id: 'diff', label: balanced ? 'Books Balanced ✓' : 'Out of Balance',
      value: totals.diff,
      trend: Math.abs(totals.diff).toFixed(2),
      trendDir: balanced ? 'none' : 'up',
      color: balanced ? 'emerald' : 'rose',
      chartData: [{ value: totals.debit }, { value: totals.credit }],
    },
    {
      id: 'accts', label: 'Active Accounts', value: rows.filter((r) => r.debit > 0 || r.credit > 0).length,
      trend: 0, trendDir: 'none', color: 'amber',
      chartData: rows.map((r) => ({ value: r.debit + r.credit })),
    },
  ];

  const chartData = rows
    .filter((r) => r.debit > 0 || r.credit > 0)
    .map((r) => ({ name: `${r.code} ${r.name.split(' ')[0]}`, Debit: r.debit, Credit: r.credit }));

  const trialTab = {
    id: 'TRIAL_BALANCE',
    label: 'Trial Balance',
    icon: <Scale size={18} />,
    data: rows,
    loading: loading,
    totals: { debit: totals.debit, credit: totals.credit },
    columns: [
      {
        key: 'code', label: 'Code', sortable: true, width: 100,
        render: (val) => <span className="font-mono text-[10px] bg-canvas px-2 py-0.5 rounded border border-black/5 font-bold">{val}</span>,
      },
      {
        key: 'name', label: 'Account', sortable: true, width: 260,
        render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span>,
      },
      {
        key: 'type', label: 'Type', width: 120,
        render: (val) => (
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-black uppercase ${
            val === 'ASSET' ? 'bg-indigo-50 text-indigo-600' :
            val === 'LIABILITY' ? 'bg-rose-50 text-rose-600' :
            val === 'EQUITY' ? 'bg-emerald-50 text-emerald-600' :
            val === 'REVENUE' ? 'bg-sky-50 text-sky-600' :
            'bg-amber-50 text-amber-600'
          }`}>{val}</span>
        ),
      },
      { key: 'category', label: 'Classification', width: 180, render: (val) => <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{val}</span> },
      {
        key: 'debit', label: 'Debit', type: 'currency', align: 'right', sortable: true, width: 160,
        render: (val) => val > 0 ? <span className="font-black text-indigo-600">{formatINR(val)}</span> : <span className="text-gray-300">—</span>,
      },
      {
        key: 'credit', label: 'Credit', type: 'currency', align: 'right', sortable: true, width: 160,
        render: (val) => val > 0 ? <span className="font-black text-emerald-600">{formatINR(val)}</span> : <span className="text-gray-300">—</span>,
      },
    ],
    kpis: kpis,
    chartConfig: {
      title: 'Debit vs Credit by Account',
      type: 'bar',
      data: chartData,
      series: [
        { key: 'Debit', name: 'Debit', color: '#6366f1' },
        { key: 'Credit', name: 'Credit', color: '#10b981' },
      ],
    },
    detailFields: [
      { key: 'debit', label: 'Debit', type: 'currency', isHero: true },
      { key: 'credit', label: 'Credit', type: 'currency' },
      { key: 'code', label: 'GL Code', icon: <Receipt size={12} /> },
      { key: 'name', label: 'Account Name', icon: <Landmark size={12} /> },
      { key: 'type', label: 'Account Type' },
      { key: 'category', label: 'Classification' },
    ],
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Double-entry integrity banner */}
      <div className={`no-print flex items-center gap-3 px-4 py-3 rounded-xl border ${
        balanced ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
      }`}>
        {balanced ? <CheckCircle2 className="text-emerald-600" size={20} /> : <AlertTriangle className="text-rose-600" size={20} />}
        <div className="flex-1">
          <div className={`text-[11px] font-black uppercase tracking-widest ${balanced ? 'text-emerald-700' : 'text-rose-700'}`}>
            {balanced ? 'Double-Entry Integrity: VERIFIED' : 'Double-Entry Integrity: FAILED'}
          </div>
          <div className="text-[10px] font-bold text-gray-500 mt-0.5">
            Debits: {formatINR(totals.debit)} · Credits: {formatINR(totals.credit)}
            {!balanced && <> · Difference: <span className="text-rose-700 font-black">{formatINR(Math.abs(totals.diff))}</span></>}
          </div>
        </div>
      </div>

      <ReportShell tabs={[trialTab]} />
    </div>
  );
};

export default TrialBalanceReport;
