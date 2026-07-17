import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { todayISOInAppTZ } from '../../lib/utils';
import ReportFrame from './ReportFrame';
import StatementTable from './StatementTable';

/**
 * Balance Sheet — classical vertical statement (Assets = Liabilities + Equity),
 * grouped by Current / Non-Current with subtotals, computed from the GL.
 */
const BalanceSheetReport = () => {
  const { currentTenantId, businessProfile } = useTenant();
  const sym = businessProfile?.currencySymbol || '₹';
  const [gl, setGl] = useState({
    cash: 0, accountsReceivable: 0, inventory: 0, fixedAssets: 0,
    accountsPayable: 0, accruedPayroll: 0, taxPayable: 0,
    ownerEquity: 0, retainedEarnings: 0,
    totalAssets: 0, totalLiabilities: 0, totalEquity: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGL = async () => {
      if (!currentTenantId) return;
      setLoading(true);
      const { data, error } = await supabase.rpc('get_gl_balances', { p_tenant_id: currentTenantId });
      if (!error && data) {
        const t = { cash: 0, accountsReceivable: 0, inventory: 0, fixedAssets: 0, accountsPayable: 0, accruedPayroll: 0, taxPayable: 0, ownerEquity: 0, retainedEarnings: 0, totalAssets: 0, totalLiabilities: 0, totalEquity: 0 };
        let netIncome = 0;
        data.forEach(acc => {
          const code = acc.code; const bal = Number(acc.balance) || 0;
          if (code === '1000') t.cash = bal;
          if (code === '1100') t.accountsReceivable = bal;
          if (code === '1200') t.inventory = bal;
          if (code === '1500') t.fixedAssets = bal;
          if (code === '2000') t.accountsPayable = bal;
          if (code === '2100') t.accruedPayroll = bal;
          if (code === '2200') t.taxPayable = bal;
          if (code === '3000') t.ownerEquity = bal;
          if (code === '3100') t.retainedEarnings = bal;
          if (acc.type === 'ASSET') t.totalAssets += bal;
          if (acc.type === 'LIABILITY') t.totalLiabilities += bal;
          if (acc.type === 'EQUITY') t.totalEquity += bal;
          if (acc.type === 'REVENUE') netIncome += bal;
          if (acc.type === 'EXPENSE') netIncome -= bal;
        });
        t.retainedEarnings += netIncome;
        t.totalEquity += netIncome;
        setGl(t);
      }
      setLoading(false);
    };
    fetchGL();
  }, [currentTenantId]);

  const liabPlusEquity = round2(gl.totalLiabilities + gl.totalEquity);
  const balanced = Math.abs(gl.totalAssets - liabPlusEquity) < 1;
  const currentAssets = gl.cash + gl.accountsReceivable + gl.inventory;
  const currentLiab = gl.accountsPayable + gl.accruedPayroll + gl.taxPayable;
  const currentRatio = currentLiab > 0 ? currentAssets / currentLiab : 0;

  const sections = useMemo(() => [
    {
      title: 'Assets', accent: 'amber', totalLabel: 'Total Assets', total: gl.totalAssets,
      groups: [
        { title: 'Current Assets', lines: [
          { label: 'Cash & Bank', value: gl.cash },
          { label: 'Accounts Receivable', value: gl.accountsReceivable },
          { label: 'Inventory On Hand', value: gl.inventory },
        ]},
        { title: 'Non-Current Assets', lines: [
          { label: 'Fixed Assets (Vehicles & Equipment)', value: gl.fixedAssets },
        ]},
      ],
    },
    {
      title: 'Liabilities', accent: 'rose', totalLabel: 'Total Liabilities', total: gl.totalLiabilities,
      groups: [
        { title: 'Current Liabilities', lines: [
          { label: 'Accounts Payable', value: gl.accountsPayable },
          { label: 'Accrued Payroll', value: gl.accruedPayroll },
          { label: 'GST / Tax Payable', value: gl.taxPayable },
        ]},
      ],
    },
    {
      title: 'Equity', accent: 'emerald', totalLabel: 'Total Equity', total: gl.totalEquity,
      groups: [
        { title: '', lines: [
          { label: 'Owner Capital', value: gl.ownerEquity },
          { label: 'Retained Earnings (incl. current period)', value: gl.retainedEarnings },
        ]},
      ],
    },
  ], [gl]);

  // Flatten for Excel/CSV export.
  const exportData = () => {
    const rows = [];
    sections.forEach(sec => {
      rows.push({ particulars: sec.title.toUpperCase(), amount: '' });
      sec.groups.forEach(g => {
        if (g.title) rows.push({ particulars: '  ' + g.title, amount: '' });
        g.lines.forEach(l => rows.push({ particulars: '    ' + l.label, amount: round2(l.value) }));
        rows.push({ particulars: '  Total ' + (g.title || sec.title), amount: round2(g.lines.reduce((a, l) => a + (Number(l.value) || 0), 0)) });
      });
      rows.push({ particulars: 'TOTAL ' + sec.title.toUpperCase(), amount: round2(sec.total) });
    });
    rows.push({ particulars: 'TOTAL LIABILITIES + EQUITY', amount: liabPlusEquity });
    return {
      columns: [
        { key: 'particulars', label: 'Particulars', width: 44 },
        { key: 'amount', label: `Amount (${sym})`, type: 'currency', width: 18 },
      ],
      rows,
    };
  };

  const asAt = todayISOInAppTZ();
  const kpis = [
    { label: 'Total Assets', value: gl.totalAssets, money: true },
    { label: 'Total Liabilities', value: gl.totalLiabilities, money: true },
    { label: 'Total Equity', value: gl.totalEquity, money: true },
    { label: 'Current Ratio', value: `${currentRatio.toFixed(2)}x` },
  ];

  return (
    <ReportFrame
      title="Balance Sheet"
      subtitle={`As at ${asAt}${businessProfile?.name ? ' · ' + businessProfile.name : ''}`}
      filename="balance-sheet"
      exportData={exportData}
    >
      <div className="flex flex-col gap-5">
        {/* Balance integrity banner */}
        <div className={`no-print flex items-center gap-3 px-4 py-3 rounded-2xl border border-black/5 shadow-sm ${balanced ? 'bg-emerald-50' : 'bg-rose-50'}`}>
          {balanced ? <CheckCircle2 className="text-emerald-600" size={20} /> : <AlertTriangle className="text-rose-600" size={20} />}
          <div className="flex-1">
            <div className={`text-[11px] font-black uppercase tracking-widest ${balanced ? 'text-emerald-700' : 'text-rose-700'}`}>
              {balanced ? 'Balanced — Assets = Liabilities + Equity' : 'Out of Balance'}
            </div>
            <div className="text-[10px] font-bold text-gray-500 mt-0.5 font-mono">
              Assets {formatINR(gl.totalAssets)} · Liab + Equity {formatINR(liabPlusEquity)}
              {!balanced && <> · Diff <span className="text-rose-700 font-black">{formatINR(Math.abs(gl.totalAssets - liabPlusEquity))}</span></>}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-black/[0.07] rounded-2xl overflow-hidden border border-black/[0.07] shadow-sm">
          {kpis.map((m, i) => (
            <div key={i} className="bg-white px-4 py-3.5 flex flex-col gap-1.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{m.label}</div>
              <div className="font-mono text-xl font-bold tabular-nums leading-none text-ink-primary">
                {m.money ? <><span className="text-accent-signature/70 text-sm mr-0.5">{sym}</span>{Math.round(m.value).toLocaleString('en-IN')}</> : m.value}
              </div>
            </div>
          ))}
        </div>

        {/* Statement */}
        {loading
          ? <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-16 text-center text-sm font-bold text-gray-300 animate-pulse">Loading balance sheet…</div>
          : <StatementTable
              sections={sections}
              grandTotal={{ label: 'Total Liabilities + Equity', value: liabPlusEquity }}
              note="Computed from the General Ledger. Current-period net income is closed to Retained Earnings."
            />}
      </div>
    </ReportFrame>
  );
};

export default BalanceSheetReport;
