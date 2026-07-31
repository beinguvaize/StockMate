import React, { useMemo } from 'react';
import { isCountableSale } from './reportUtils';
import useReportData from './useReportData';
import useDateWindow from './useDateWindow';
import PremiumReportView from './PremiumReportView';
import {
  ArrowDownCircle, ArrowUpCircle, Wallet, Briefcase,
  Building2, Droplets, TrendingUp, Calendar
} from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';

/**
 * Cash Flow Statement (Indirect Method)
 * -------------------------------------
 * Groups cash movements into:
 *   1. Operating activities (customer receipts, vendor payments, payroll, expenses)
 *   2. Investing activities (vehicle purchases, fixed assets)
 *   3. Financing activities (owner contributions, loans — placeholder)
 */
const CashFlowReport = () => {
  // Financial year to date by default. These queries were previously
  // unfiltered and read the whole table on every load.
  const win = useDateWindow('YEAR');
  const { data: salesRaw, loading: l1 } = useReportData({ table: 'sales', select: 'totalAmount, paymentMethod, date, voided_at, status, paymentStatus', dateColumn: 'date', filters: win.filters });
  // Voided and cancelled sales are not revenue and were being counted here.
  const sales = useMemo(() => (salesRaw || []).filter(isCountableSale), [salesRaw]);
  const { data: expenses, loading: l2 } = useReportData({ table: 'expenses', select: 'amount, category, date', dateColumn: 'date', filters: win.filters });
  const { data: payroll, loading: l3 } = useReportData({ table: 'payroll', select: 'amount, processed_at', dateColumn: 'processed_at', filters: win.filters });
  const { data: purchases, loading: l4 } = useReportData({ table: 'purchases', select: 'id, date, total_amount, paid_amount, payment_type', dateColumn: 'date', filters: win.filters });
  const { data: vehicles, loading: l5 } = useReportData({ table: 'vehicles', select: '*' });

  const loading = l1 || l2 || l3 || l4 || l5;

  const cashFlow = useMemo(() => {
    // --- Operating inflows ---
    const cashSales = sales
      .filter((s) => {
        const m = (s.paymentMethod || 'CASH').toUpperCase();
        return m !== 'CREDIT';
      })
      .reduce((a, s) => a + (Number(s.totalAmount) || 0), 0);

    const creditSales = sales
      .filter((s) => {
        const m = (s.paymentMethod || 'CASH').toUpperCase();
        return m === 'CREDIT';
      })
      .reduce((a, s) => a + (Number(s.totalAmount) || 0), 0);

    // --- Operating outflows ---
    const totalExpenses = expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const totalPayroll = payroll.reduce((a, p) => a + (Number(p.amount) || 0), 0);

    const paidPurchases = purchases
      .filter((p) => p.payment_status === 'PAID' || p.paid === true)
      .reduce((a, p) => a + (Number(p.total_amount ?? p.amount) || 0), 0);

    // --- Investing ---
    const vehiclePurchases = vehicles.reduce((a, v) => a + (Number(v.book_value ?? v.cost ?? 0)), 0);

    // --- Monthly breakdown ---
    const monthly = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      monthly[key] = { name: key, Inflow: 0, Outflow: 0, Net: 0 };
    }
    const getKey = (date) => {
      if (!date) return null;
      const d = new Date(date);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString('default', { month: 'short', year: '2-digit' });
    };

    sales.forEach((s) => {
      const m = (s.paymentMethod || 'CASH').toUpperCase();
      if (m === 'CREDIT') return;
      const k = getKey(s.date);
      if (monthly[k]) monthly[k].Inflow += Number(s.totalAmount) || 0;
    });
    expenses.forEach((e) => {
      const k = getKey(e.date);
      if (monthly[k]) monthly[k].Outflow += Number(e.amount) || 0;
    });
    payroll.forEach((p) => {
      const k = getKey(p.processed_at);
      if (monthly[k]) monthly[k].Outflow += Number(p.amount) || 0;
    });
    Object.values(monthly).forEach((m) => { m.Net = round2(m.Inflow - m.Outflow); });

    // --- Build the statement ---
    const operatingLines = [
      { section: 'OPERATING', label: 'Cash receipts from customers (cash sales)', amount: round2(cashSales), direction: 'IN' },
      { section: 'OPERATING', label: 'Cash receipts from credit customers (collections proxy)', amount: 0, direction: 'IN', note: 'Tracked via AR reductions' },
      { section: 'OPERATING', label: 'Cash paid to suppliers (paid purchases)', amount: round2(-paidPurchases), direction: 'OUT' },
      { section: 'OPERATING', label: 'Cash paid for operating expenses', amount: round2(-totalExpenses), direction: 'OUT' },
      { section: 'OPERATING', label: 'Cash paid to employees (payroll)', amount: round2(-totalPayroll), direction: 'OUT' },
    ];
    const operatingNet = operatingLines.reduce((a, l) => a + l.amount, 0);

    const investingLines = [
      { section: 'INVESTING', label: 'Investment in fixed assets (vehicles/fleet)', amount: round2(-vehiclePurchases), direction: 'OUT' },
    ];
    const investingNet = investingLines.reduce((a, l) => a + l.amount, 0);

    const financingLines = [
      { section: 'FINANCING', label: 'Owner contributions', amount: 0, direction: 'IN' },
      { section: 'FINANCING', label: 'Loan proceeds / repayments', amount: 0, direction: 'IN' },
    ];
    const financingNet = financingLines.reduce((a, l) => a + l.amount, 0);

    const netChange = round2(operatingNet + investingNet + financingNet);

    const rows = [
      ...operatingLines,
      { section: 'OPERATING', label: 'Net Cash from Operating Activities', amount: round2(operatingNet), isSubtotal: true },
      ...investingLines,
      { section: 'INVESTING', label: 'Net Cash from Investing Activities', amount: round2(investingNet), isSubtotal: true },
      ...financingLines,
      { section: 'FINANCING', label: 'Net Cash from Financing Activities', amount: round2(financingNet), isSubtotal: true },
      { section: 'SUMMARY', label: 'Net Change in Cash', amount: netChange, isSubtotal: true, isTotal: true },
    ];

    return {
      rows,
      operatingNet: round2(operatingNet),
      investingNet: round2(investingNet),
      financingNet: round2(financingNet),
      netChange,
      totalInflow: round2(cashSales),
      totalOutflow: round2(paidPurchases + totalExpenses + totalPayroll + vehiclePurchases),
      monthly: Object.values(monthly),
      creditSales: round2(creditSales),
    };
  }, [sales, expenses, payroll, purchases, vehicles]);

  const kpis = [
    {
      id: 'opening', label: 'Operating Cash Flow', value: cashFlow.operatingNet,
      trend: 0, trendDir: 'none',
      color: cashFlow.operatingNet >= 0 ? 'emerald' : 'rose',
      chartData: cashFlow.monthly.map((m) => ({ value: m.Net })),
    },
    {
      id: 'investing', label: 'Investing Cash Flow', value: cashFlow.investingNet,
      trend: 0, trendDir: 'none', color: 'amber',
      chartData: cashFlow.monthly.map((m) => ({ value: m.Outflow * 0.1 })),
    },
    {
      id: 'financing', label: 'Financing Cash Flow', value: cashFlow.financingNet,
      trend: 0, trendDir: 'none', color: 'indigo',
      chartData: [{ value: 0 }, { value: 0 }, { value: 0 }],
    },
    {
      id: 'net', label: 'Net Change in Cash', value: cashFlow.netChange,
      trend: Math.abs(cashFlow.netChange / (cashFlow.totalInflow || 1) * 100).toFixed(1),
      trendDir: cashFlow.netChange >= 0 ? 'up' : 'down',
      color: cashFlow.netChange >= 0 ? 'emerald' : 'rose',
      chartData: cashFlow.monthly.map((m) => ({ value: m.Net })),
    },
  ];

  const renderSectionBadge = (val) => {
    const colors = {
      OPERATING: 'bg-emerald-50 text-emerald-600',
      INVESTING: 'bg-accent-signature/10 text-accent-signature',
      FINANCING: 'bg-accent-signature/10 text-accent-signature',
      SUMMARY: 'bg-ink-primary text-white',
    };
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-semibold uppercase ${colors[val] || 'bg-muted text-ink-secondary'}`}>
        {val}
      </span>
    );
  };

  const cashTab = {
    id: 'CASH_FLOW_STATEMENT',
    label: 'Cash Flow Statement',
    icon: <Droplets size={18} />,
    data: cashFlow.rows,
    loading: loading,
    totals: { amount: cashFlow.netChange },
    columns: [
      { key: 'section', label: 'Activity', sortable: false, width: 140, render: renderSectionBadge },
      {
        key: 'label', label: 'Line Item', sortable: false, width: 420,
        render: (val, row) => (
          <span className={`${row.isSubtotal ? 'font-semibold text-foreground uppercase tracking-tight' : 'font-semibold text-ink-secondary'} ${row.isTotal ? 'text-[13px]' : 'text-[11px]'}`}>
            {val}
          </span>
        ),
      },
      {
        key: 'amount', label: 'Amount', type: 'currency', align: 'right', sortable: false, width: 200,
        render: (val, row) => {
          const cls = val > 0 ? 'text-emerald-600' : val < 0 ? 'text-rose-500' : 'text-muted-foreground';
          return (
            <span className={`${row.isSubtotal ? 'font-semibold' : 'font-semibold'} ${cls} ${row.isTotal ? 'text-[14px]' : ''}`}>
              {formatINR(val)}
            </span>
          );
        },
      },
      { key: 'direction', label: 'Flow', width: 100, render: (val, row) => {
        if (row.isSubtotal) return null;
        return val === 'IN'
          ? <ArrowDownCircle size={16} className="text-emerald-500" />
          : <ArrowUpCircle size={16} className="text-rose-500" />;
      }},
    ],
    kpis: kpis,
    chartConfig: {
      title: 'Monthly Cash Flow (Last 6 Months)',
      type: 'bar',
      data: cashFlow.monthly,
      series: [
        { key: 'Inflow', name: 'Inflow', color: '#10b981' },
        { key: 'Outflow', name: 'Outflow', color: '#ef4444' },
      ],
    },
    detailFields: [
      { key: 'amount', label: 'Amount', type: 'currency', isHero: true },
      { key: 'label', label: 'Description', icon: <Wallet size={12} /> },
      { key: 'section', label: 'Activity Type', icon: <Briefcase size={12} /> },
      { key: 'direction', label: 'Direction' },
      { key: 'note', label: 'Note' },
    ],
  };

  return <PremiumReportView dateWindow={win} title="Cash Flow" tabs={[cashTab]} />;
};

export default CashFlowReport;
