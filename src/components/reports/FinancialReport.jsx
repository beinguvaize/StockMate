import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { 
  DollarSign, TrendingUp, CreditCard, PieChart as PieChartIcon, 
  ArrowUpRight, ArrowDownRight, Download, Activity, Target
} from 'lucide-react';

const FinancialReport = () => {
  // 1. Fetch Financial Data (Triangulation)
  const { data: sales, loading: salesLoading } = useReportData({
    table: 'sales',
    select: 'totalAmount, date, paymentMethod',
    dateColumn: 'date'
  });

  const { data: expenses, loading: expensesLoading } = useReportData({
    table: 'expenses',
    select: 'amount, date',
    dateColumn: 'date'
  });

  const { data: payroll, loading: payrollLoading } = useReportData({
    table: 'payroll',
    select: 'amount, processed_at',
    dateColumn: 'processed_at'
  });

  const loading = salesLoading || expensesLoading || payrollLoading;

  // 2. Process Profit & Loss Metrics
  const plMetrics = useMemo(() => {
    const months = {};
    const now = new Date();
    
    // Initialize 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      months[key] = { month: key, revenue: 0, expenses: 0, net: 0 };
    }

    sales.forEach(s => {
      const key = new Date(s.date).toLocaleString('default', { month: 'short', year: '2-digit' });
      if (months[key]) months[key].revenue += s.totalAmount || 0;
    });

    expenses.forEach(e => {
      const key = new Date(e.date).toLocaleString('default', { month: 'short', year: '2-digit' });
      if (months[key]) months[key].expenses += e.amount || 0;
    });

    payroll.forEach(p => {
      const key = new Date(p.processed_at).toLocaleString('default', { month: 'short', year: '2-digit' });
      if (months[key]) months[key].expenses += p.amount || 0;
    });

    const data = Object.values(months).map(m => ({
      ...m,
      net: m.revenue - m.expenses,
      margin: m.revenue > 0 ? ((m.revenue - m.expenses) / m.revenue * 100).toFixed(1) : 0
    }));

    const totalRevenue = data.reduce((acc, m) => acc + m.revenue, 0);
    const totalExpenses = data.reduce((acc, m) => acc + m.expenses, 0);
    const totalNet = totalRevenue - totalExpenses;

    const kpis = [
      { id: 'rev', label: 'Gross Revenue', value: totalRevenue, trend: 15, trendDir: 'up', color: 'indigo', chartData: data.map(d => ({ value: d.revenue })) },
      { id: 'exp', label: 'Operational Load', value: totalExpenses, trend: 5, trendDir: 'up', color: 'rose', chartData: data.map(d => ({ value: d.expenses })) },
      { id: 'net', label: 'Net Liquidity', value: totalNet, trend: 10, trendDir: 'up', color: 'emerald', chartData: data.map(d => ({ value: d.net })) }
    ];

    return { data, totalRevenue, totalExpenses, totalNet, kpis };
  }, [sales, expenses, payroll]);

  // 3. Process Revenue Insights (Payment Mix)
  const insightMetrics = useMemo(() => {
    const paymentMap = sales.reduce((acc, s) => {
      const method = s.paymentMethod || 'CASH';
      if (!acc[method]) acc[method] = { name: method, value: 0, count: 0 };
      acc[method].value += s.totalAmount || 0;
      acc[method].count += 1;
      return acc;
    }, {});

    const paymentMix = Object.values(paymentMap).sort((a, b) => b.value - a.value);

    return { paymentMix };
  }, [sales]);

  // 4. Tab Definitions
  const plTab = {
    id: 'PL_STATEMENT',
    label: 'P&L Statement',
    icon: <Target size={18} />,
    data: plMetrics.data,
    loading: loading,
    totals: { revenue: plMetrics.totalRevenue, expenses: plMetrics.totalExpenses, net: plMetrics.totalNet },
    columns: [
      { key: 'month', label: 'Fiscal Node', sortable: true, width: 140, render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span> },
      { key: 'revenue', label: 'Gross Yield', type: 'currency', align: 'right', sortable: true, width: 180 },
      { key: 'expenses', label: 'Expenditure', type: 'currency', align: 'right', sortable: true, width: 180, render: (val) => <span className="text-red-500 font-bold">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val)}</span> },
      { key: 'net', label: 'Net Performance', type: 'currency', align: 'right', sortable: true, width: 180, render: (val) => <span className={val >= 0 ? 'text-emerald-500 font-black' : 'text-red-600 font-black'}>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val)}</span> },
      { key: 'margin', label: 'Margin %', align: 'right', width: 100, render: (val) => (
        <span className={`px-2 py-1 rounded-full text-[9px] font-black ${val >= 20 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
          {val}%
        </span>
      )}
    ],
    kpis: plMetrics.kpis,
    chartConfig: { 
      title: "Revenue vs Expenditure Correlation", type: 'bar', data: plMetrics.data,
      series: [{ key: 'revenue', name: 'Revenue', color: '#6366f1' }, { key: 'expenses', name: 'Expenses', color: '#f43f5e' }] 
    }
  };

  const mixTab = {
    id: 'PAYMENT_MIX',
    label: 'Payment Dynamics',
    icon: <CreditCard size={18} />,
    data: insightMetrics.paymentMix,
    loading: loading,
    totals: { value: plMetrics.totalRevenue },
    columns: [
      { key: 'name', label: 'Payment Gateway', sortable: true, width: 220, render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span> },
      { key: 'count', label: 'Events', align: 'right', width: 140, render: (val) => <span className="font-mono text-gray-400">{val} Transactions</span> },
      { key: 'value', label: 'Aggregated Magnitude', type: 'currency', align: 'right', sortable: true, width: 180 },
      { key: 'share', label: 'Wallet Share', align: 'right', width: 120, render: (_, row) => {
        const s = (row.value / plMetrics.totalRevenue) * 100;
        return <span className="text-[10px] font-black text-accent-signature">{s.toFixed(1)}%</span>;
      }}
    ],
    kpis: [
      { id: 'primary', label: 'Dominant Method', value: insightMetrics.paymentMix[0]?.value || 0, trend: 2, trendDir: 'up', color: 'indigo', chartData: [] },
      { id: 'avg_val', label: 'Ticket Average', value: plMetrics.totalRevenue / (sales.length || 1), trend: 0, trendDir: 'none', color: 'emerald', chartData: [] }
    ],
    chartConfig: { 
      title: "Wallet share distribution", type: 'pie', data: insightMetrics.paymentMix.map(m => ({ name: m.name, value: m.value }))
    }
  };

  return <ReportShell tabs={[plTab, mixTab]} />;
};

export default FinancialReport;
