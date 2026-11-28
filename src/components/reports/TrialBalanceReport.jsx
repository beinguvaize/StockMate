import React, { useState, useEffect, useMemo } from 'react';
import PremiumReportView from './PremiumReportView';
import { Scale, CheckCircle2, AlertTriangle, Receipt, Landmark } from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';

/**
 * Trial Balance Report
 * ---------------------
 * Lists every GL account with Debit and Credit balances.
 * Total Debits MUST equal Total Credits (double-entry invariant).
 */
const TrialBalanceReport = () => {
  const { currentTenantId } = useTenant();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  // A failed load shows the error state; it used to leave an empty, "balanced" ₹0 table.
  const [failure, setFailure] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const fetchGL = async () => {
      if (!currentTenantId) return;
      setLoading(true);
      setFailure(null);
      
      const { data, error } = await supabase.rpc('get_gl_balances', { p_tenant_id: currentTenantId });
      
      if (!error && data) {
         const mappedRows = data.map(acc => {
            const balance = Number(acc.balance) || 0;
            const normal = acc.normal_balance;
            
            const debit = normal === 'DEBIT' ? Math.max(balance, 0) : Math.max(-balance, 0);
            const credit = normal === 'CREDIT' ? Math.max(balance, 0) : Math.max(-balance, 0);
            
            return {
               code: acc.code,
               name: acc.name,
               type: acc.type,
               category: acc.category,
               debit: round2(debit),
               credit: round2(credit)
            };
         });
         setRows(mappedRows);
      } else {
         console.error("Failed to fetch GL balances:", error);
         setFailure(error?.message || 'Could not load the account balances');
      }
      setLoading(false);
    };
    fetchGL();
  }, [currentTenantId, attempt]);

  const totals = useMemo(() => {
    const totalDebit = rows.reduce((a, r) => a + r.debit, 0);
    const totalCredit = rows.reduce((a, r) => a + r.credit, 0);
    return { debit: round2(totalDebit), credit: round2(totalCredit), diff: round2(totalDebit - totalCredit) };
  }, [rows]);

  const balanced = Math.abs(totals.diff) < 1;

  const kpis = [
    {
      id: 'dr', label: 'Total Debits', value: totals.debit,
      trend: 0, trendDir: 'none', color: 'indigo',
      chartData: rows.filter((r) => r.debit > 0).map((r) => ({ value: r.debit })),
    },
    {
      id: 'cr', label: 'Total Credits', value: totals.credit,
      trend: 0, trendDir: 'none', color: 'emerald',
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
        render: (val) => <span className="tabular-nums text-[11.5px] bg-tile px-2 py-0.5 rounded border border-border/60 font-semibold">{val}</span>,
      },
      {
        key: 'name', label: 'Account', sortable: true, width: 260,
        render: (val) => <span className="font-semibold text-ink uppercase tracking-tight">{val}</span>,
      },
      {
        key: 'type', label: 'Type', width: 120,
        render: (val) => (
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[12px] font-semibold uppercase ${
            val === 'ASSET' ? 'bg-accent-signature/10 text-amber-text' :
            val === 'LIABILITY' ? 'bg-bad-soft text-bad-text' :
            val === 'EQUITY' ? 'bg-good-soft text-good-text' :
            val === 'REVENUE' ? 'bg-info-soft text-info-text' :
            'bg-accent-signature/10 text-amber-text'
          }`}>{val}</span>
        ),
      },
      { key: 'category', label: 'Classification', width: 180, render: (val) => <span className="text-[11.5px] font-semibold text-body uppercase tracking-[0.07em]">{val}</span> },
      {
        key: 'debit', label: 'Debit', type: 'currency', align: 'right', sortable: true, width: 160,
        render: (val) => val > 0 ? <span className="font-semibold text-amber-text">{formatINR(val)}</span> : <span className="text-body">—</span>,
      },
      {
        key: 'credit', label: 'Credit', type: 'currency', align: 'right', sortable: true, width: 160,
        render: (val) => val > 0 ? <span className="font-semibold text-good-text">{formatINR(val)}</span> : <span className="text-body">—</span>,
      },
    ],
    kpis: kpis,
    chartConfig: {
      title: 'Debit vs Credit by Account',
      type: 'bar',
      data: chartData,
      series: [
        { key: 'Debit', name: 'Debit', color: 'var(--color-accent-signature)' },
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
      <div className={`no-print flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-sm ${
        balanced ? 'bg-good-soft border-border/60' : 'bg-bad-soft border-border/60'
      }`}>
        {balanced ? <CheckCircle2 className="text-good-text" size={20} /> : <AlertTriangle className="text-bad-text" size={20} />}
        <div className="flex-1">
          <div className={`text-[12px] font-semibold uppercase tracking-[0.07em] ${balanced ? 'text-good-text' : 'text-bad-text'}`}>
            {balanced ? 'Double-Entry Integrity: VERIFIED' : 'Double-Entry Integrity: FAILED'}
          </div>
          <div className="text-[11.5px] font-semibold text-body mt-0.5">
            Debits: {formatINR(totals.debit)} · Credits: {formatINR(totals.credit)}
            {!balanced && <> · Difference: <span className="text-bad-text font-semibold">{formatINR(Math.abs(totals.diff))}</span></>}
          </div>
        </div>
      </div>

      <PremiumReportView error={failure} onRetry={() => setAttempt((n) => n + 1)} title="Trial Balance" tabs={[trialTab]} />
    </div>
  );
};

export default TrialBalanceReport;
