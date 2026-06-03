import React, { useState, useEffect, useMemo } from 'react';
import PremiumReportView from './PremiumReportView';
import {
  Landmark, Wallet, Package, Truck, CreditCard,
  TrendingUp, Scale, Building2, Layers, Receipt
} from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';

/**
 * Balance Sheet Report
 * --------------------
 * Classical accounting equation: Assets = Liabilities + Equity
 * Computed from the General Ledger.
 */
const BalanceSheetReport = () => {
  const { currentTenantId } = useTenant();
  const [gl, setGl] = useState({
    cash: 0, accountsReceivable: 0, inventory: 0, fixedAssets: 0,
    accountsPayable: 0, accruedPayroll: 0, taxPayable: 0,
    ownerEquity: 0, retainedEarnings: 0,
    totalAssets: 0, totalLiabilities: 0, totalEquity: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGL = async () => {
      if (!currentTenantId) return;
      setLoading(true);
      
      const { data, error } = await supabase.rpc('get_gl_balances', { p_tenant_id: currentTenantId });
      
      if (!error && data) {
         const t = {
            cash: 0, accountsReceivable: 0, inventory: 0, fixedAssets: 0,
            accountsPayable: 0, accruedPayroll: 0, taxPayable: 0,
            ownerEquity: 0, retainedEarnings: 0,
            totalAssets: 0, totalLiabilities: 0, totalEquity: 0
         };

         let netIncome = 0;

         data.forEach(acc => {
            const code = acc.code;
            const bal = Number(acc.balance) || 0;
            
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
            
            // Net Income rolls into Equity
            if (acc.type === 'REVENUE') netIncome += bal;  // Credit
            if (acc.type === 'EXPENSE') netIncome -= bal;  // Debit
         });

         // Close current period net income to retained earnings
         t.retainedEarnings += netIncome;
         t.totalEquity += netIncome;

         setGl(t);
      }
      setLoading(false);
    };
    fetchGL();
  }, [currentTenantId]);

  // Build balance sheet rows (hierarchical)
  const rows = useMemo(() => {
    return [
      // === ASSETS ===
      { section: 'ASSETS', category: 'Current Assets', account: 'Cash & Bank', code: '1000', amount: gl.cash, side: 'ASSET' },
      { section: 'ASSETS', category: 'Current Assets', account: 'Accounts Receivable', code: '1100', amount: gl.accountsReceivable, side: 'ASSET' },
      { section: 'ASSETS', category: 'Current Assets', account: 'Inventory On Hand', code: '1200', amount: gl.inventory, side: 'ASSET' },
      { section: 'ASSETS', category: 'Non-Current Assets', account: 'Fixed Assets (Vehicles)', code: '1500', amount: gl.fixedAssets, side: 'ASSET' },

      // === LIABILITIES ===
      { section: 'LIABILITIES', category: 'Current Liabilities', account: 'Accounts Payable', code: '2000', amount: gl.accountsPayable, side: 'LIABILITY' },
      { section: 'LIABILITIES', category: 'Current Liabilities', account: 'Accrued Payroll', code: '2100', amount: gl.accruedPayroll, side: 'LIABILITY' },
      { section: 'LIABILITIES', category: 'Current Liabilities', account: 'GST / Tax Payable', code: '2200', amount: gl.taxPayable, side: 'LIABILITY' },

      // === EQUITY ===
      { section: 'EQUITY', category: 'Equity', account: 'Owner Capital', code: '3000', amount: gl.ownerEquity, side: 'EQUITY' },
      { section: 'EQUITY', category: 'Equity', account: 'Retained Earnings', code: '3100', amount: gl.retainedEarnings, side: 'EQUITY' },
    ];
  }, [gl]);

  // KPIs
  const kpis = useMemo(() => {
    const totalLiabEquity = gl.totalLiabilities + gl.totalEquity;
    const balanced = Math.abs(gl.totalAssets - totalLiabEquity) < 1;
    const currentRatio = gl.accountsPayable > 0 ? (gl.cash + gl.accountsReceivable + gl.inventory) / gl.accountsPayable : 0;
    const debtEquityRatio = gl.totalEquity !== 0 ? gl.totalLiabilities / Math.abs(gl.totalEquity) : 0;

    return [
      {
        id: 'assets', label: 'Total Assets', value: gl.totalAssets,
        trend: 8.5, trendDir: 'up', color: 'indigo',
        chartData: [
          { value: gl.cash }, { value: gl.accountsReceivable },
          { value: gl.inventory }, { value: gl.fixedAssets },
        ],
      },
      {
        id: 'liab', label: 'Total Liabilities', value: gl.totalLiabilities,
        trend: 4.2, trendDir: 'down', color: 'rose',
        chartData: [
          { value: gl.accountsPayable }, { value: gl.accruedPayroll }, { value: gl.taxPayable },
        ],
      },
      {
        id: 'eq', label: 'Total Equity', value: gl.totalEquity,
        trend: 12.1, trendDir: 'up', color: 'emerald',
        chartData: [{ value: gl.ownerEquity }, { value: gl.retainedEarnings }],
      },
      {
        id: 'bal', label: balanced ? 'Books Balanced ✓' : 'Imbalance Detected',
        value: `${currentRatio.toFixed(2)}x`,
        trend: currentRatio.toFixed(2), trendDir: currentRatio > 1 ? 'up' : 'down',
        color: balanced && currentRatio > 1 ? 'emerald' : 'amber',
        chartData: [{ value: gl.totalAssets }, { value: totalLiabEquity }],
      },
    ];
  }, [gl]);

  // Chart: side-by-side composition
  const compositionChart = [
    { name: 'Cash', value: gl.cash },
    { name: 'AR', value: gl.accountsReceivable },
    { name: 'Inventory', value: gl.inventory },
    { name: 'Fixed', value: gl.fixedAssets },
    { name: 'AP', value: gl.accountsPayable },
    { name: 'Tax', value: gl.taxPayable },
    { name: 'Equity', value: Math.abs(gl.totalEquity) },
  ];

  const balanceTab = {
    id: 'BALANCE_SHEET',
    label: 'Balance Sheet',
    icon: <Scale size={18} />,
    data: rows,
    loading: loading,
    totals: {
      amount: rows.reduce((a, r) => a + (r.side === 'ASSET' ? r.amount : -r.amount), 0),
    },
    columns: [
      {
        key: 'section', label: 'Section', sortable: true, width: 140,
        render: (val) => (
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-black uppercase ${
            val === 'ASSETS' ? 'bg-amber-50 text-amber-600' :
            val === 'LIABILITIES' ? 'bg-rose-50 text-rose-600' :
            'bg-emerald-50 text-emerald-600'
          }`}>{val}</span>
        ),
      },
      {
        key: 'category', label: 'Classification', width: 180,
        render: (val) => <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{val}</span>,
      },
      {
        key: 'code', label: 'GL Code', width: 100,
        render: (val) => <span className="font-mono text-[10px] bg-canvas px-2 py-0.5 rounded border border-black/5 font-bold">{val}</span>,
      },
      {
        key: 'account', label: 'Account', sortable: true, width: 260,
        render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span>,
      },
      {
        key: 'amount', label: 'Balance', type: 'currency', align: 'right', sortable: true, width: 180,
        render: (val, row) => (
          <span className={`font-black ${
            row.side === 'ASSET' ? 'text-amber-600' :
            row.side === 'LIABILITY' ? 'text-rose-500' :
            'text-emerald-600'
          }`}>
            {formatINR(val)}
          </span>
        ),
      },
    ],
    kpis: kpis,
    chartConfig: {
      title: 'Balance Sheet Composition',
      type: 'bar',
      data: compositionChart,
      series: [{ key: 'value', name: 'Amount', color: '#D97706' }],
    },
    detailFields: [
      { key: 'amount', label: 'Balance', type: 'currency', isHero: true },
      { key: 'account', label: 'Account Name', icon: <Landmark size={12} /> },
      { key: 'code', label: 'GL Code', icon: <Receipt size={12} /> },
      { key: 'category', label: 'Classification', icon: <Layers size={12} /> },
      { key: 'section', label: 'Section', icon: <Building2 size={12} /> },
    ],
  };

  return <PremiumReportView title="Balance Sheet" tabs={[balanceTab]} />;
};

export default BalanceSheetReport;
