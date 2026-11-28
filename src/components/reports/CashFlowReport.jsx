import React, { useMemo } from 'react';
import { isCountableSale } from './reportUtils';
import useReportData from './useReportData';
import useDateWindow from './useDateWindow';
import PremiumReportView from './PremiumReportView';
import {
  ArrowDownCircle, ArrowUpCircle, Wallet, Briefcase,
  Building2, Droplets, TrendingUp, Calendar
} from 'lucide-react';
import { formatINR } from '../../utils/financialCalculations';
import { cashFlowFigures } from '../../lib/cashFlow';

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
  const { data: expenses, loading: l2 } = useReportData({ table: 'expenses', select: 'amount, category, date, payment_method', dateColumn: 'date', filters: win.filters });
  // Staff advances given / paid back: cash with no expense row.
  const { data: advances, loading: l6 } = useReportData({ table: 'account_transactions', select: 'date, direction, amount, mode, ref_type', dateColumn: 'date', filters: win.filters, params: { ref_type: 'STAFF_ADVANCE' } });
  const { data: payroll, loading: l3 } = useReportData({ table: 'payroll', select: 'amount, processed_at', dateColumn: 'processed_at', filters: win.filters });
  const { data: purchases, loading: l4 } = useReportData({ table: 'purchases', select: 'id, date, total_amount, paid_amount, payment_type', dateColumn: 'date', filters: win.filters });
  const { data: vehicles, loading: l5 } = useReportData({ table: 'vehicles', select: '*' });

  const loading = l1 || l2 || l3 || l4 || l5 || l6;

  // Expenses need their method so non-cash ones (ADVANCE, ADJUSTMENT) stay out.
  const cashFlow = useMemo(() => cashFlowFigures({ sales, expenses, payroll, purchases, vehicles, advances }),
    [sales, expenses, payroll, purchases, vehicles, advances]);

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
