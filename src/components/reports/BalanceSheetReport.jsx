import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { todayISOInAppTZ } from '../../lib/utils';
import ReportFrame from './ReportFrame';
import { ReportTitle, ErrorBlock, Banner, Figures, FigureTile, ReportBox, LoadingRows } from './frame';

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
  // A failed read shows the error state: an all-zero sheet would read as "Balanced".
  const [failure, setFailure] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const fetchGL = async () => {
      if (!currentTenantId) return;
      setLoading(true);
      setFailure(null);
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
      } else if (error) {
        console.error('[balance-sheet] get_gl_balances failed', error);
        setFailure(error.message || 'Could not load the ledger balances');
      }
      setLoading(false);
    };
    fetchGL();
  }, [currentTenantId, attempt]);

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

  if (failure) {
    return (
      <div>
        <ReportTitle title="Balance Sheet" subtitle={`As at ${asAt}`} />
        <ErrorBlock title="Balance Sheet could not load" message={failure} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  }

  const td = 'border-b border-sep px-4 py-2.5 tabular-nums';
  const grp = 'border-b border-sep bg-[#FBFBFA] px-4 py-2 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute';
  const sub = `${td} bg-[#FBFBFA] font-semibold`;

  return (
    <ReportFrame
      title="Balance Sheet"
      subtitle={`As at ${asAt}${businessProfile?.name ? ' · ' + businessProfile.name : ''} · from ledger balances`}
      filename="balance-sheet"
      exportData={exportData}
    >
      {/* Balance check */}
      <Banner tone={balanced ? 'good' : 'bad'} icon={balanced ? CheckCircle2 : AlertTriangle} className="no-print">
        <b className="font-semibold">{balanced ? 'Balanced — Assets = Liabilities + Equity' : 'Out of Balance'}</b>
        <span className="tabular-nums"> · Assets {formatINR(gl.totalAssets)} · Liab + Equity {formatINR(liabPlusEquity)}
          {!balanced && <> · Diff <b className="font-semibold">{formatINR(Math.abs(gl.totalAssets - liabPlusEquity))}</b></>}
        </span>
      </Banner>

      <Figures cols={4}>
        {kpis.map((m) => (
          <FigureTile key={m.label} label={m.label} loading={loading}
            value={m.money ? `${sym}${Math.round(m.value).toLocaleString('en-IN')}` : m.value} />
        ))}
      </Figures>

      {/* Statement (reports-07) */}
      {loading
        ? <ReportBox flush><LoadingRows rows={8} /></ReportBox>
        : (
          <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
            <table className="w-full border-collapse text-[13.5px] text-ink">
              <thead>
                <tr>
                  <th className="border-b border-line bg-tile px-4 py-2.5 text-left font-tight text-[12px] font-semibold text-mute">Particulars</th>
                  <th className="border-b border-line bg-tile px-4 py-2.5 text-right font-tight text-[12px] font-semibold text-mute">Amount ({sym})</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => (
                  <React.Fragment key={sec.title}>
                    <tr><td colSpan={2} className={grp}>{sec.title}</td></tr>
                    {sec.groups.map((g, gi) => {
                      const subtotal = g.lines.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
                      return (
                        <React.Fragment key={gi}>
                          {g.title && <tr><td colSpan={2} className={sub}>{g.title}</td></tr>}
                          {g.lines.map((l) => (
                            <tr key={l.label}>
                              <td className={`${td} pl-9 text-ink-2`}>{l.label}</td>
                              <td className={`${td} text-right font-tight`}>{formatINR(l.value)}</td>
                            </tr>
                          ))}
                          <tr>
                            <td className={`${td} pl-9 text-[12.5px] text-body`}>{`Total ${g.title || ''}`.trim()}</td>
                            <td className={`${td} text-right font-tight text-ink-2`}>{formatINR(subtotal)}</td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                    <tr>
                      <td className={sub}>{sec.totalLabel}</td>
                      <td className={`${sub} text-right font-tight`}>{formatINR(sec.total)}</td>
                    </tr>
                  </React.Fragment>
                ))}
                <tr>
                  <td className={`${sub} border-b-0 font-tight text-[15px]`}>Total Liabilities + Equity</td>
                  <td className={`${sub} border-b-0 text-right font-tight text-[15px]`}>{formatINR(liabPlusEquity)}</td>
                </tr>
              </tbody>
            </table>
            <p className="border-t border-line px-4 py-3 text-[12.5px] text-body">Computed from the General Ledger. Current-period net income is closed to Retained Earnings.</p>
          </div>
        )}
    </ReportFrame>
  );
};

export default BalanceSheetReport;
