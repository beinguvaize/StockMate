import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { DollarSign, Tag, Info, Calendar, Activity, Truck } from 'lucide-react';

const ExpensesReport = () => {
  const { data: rawData, loading } = useReportData({
    table: 'expenses',
    select: '*',
    dateColumn: 'date'
  });

  const metrics = useMemo(() => {
    if (!rawData.length) return { total: 0, kpis: [], chartData: [] };
    const total = rawData.reduce((acc, e) => acc + (e.amount || 0), 0);
    const topCat = Object.entries(rawData.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + (e.amount || 0);
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0][0];

    const catMap = rawData.reduce((acc, e) => {
      const c = e.category || 'GENERAL';
      acc[c] = (acc[c] || 0) + (e.amount || 0);
      return acc;
    }, {});

    const chartData = Object.entries(catMap).map(([name, value]) => ({ name, value }));

    const kpis = [
      { id: 'burn', label: 'Operational Burn', value: total, trend: 2.1, trendDir: 'up', color: 'rose', chartData: chartData.map(d => ({ value: d.value })) },
      { id: 'topcat', label: 'Primary Sink', value: topCat, trend: 15.4, trendDir: 'up', color: 'indigo', chartData: [{ value: 40 }, { value: 60 }] },
      { id: 'daily', label: 'Daily Burn Rate', value: total / 30, trend: 0.5, trendDir: 'down', color: 'emerald', chartData: chartData.map(d => ({ value: d.value / 4 })) }
    ];

    return { total, kpis, chartData };
  }, [rawData]);

  const expenseTab = {
    id: 'EXPENSES',
    label: 'Expenses',
    icon: <DollarSign size={18} />,
    data: rawData,
    loading: loading,
    totals: { amount: metrics.total },
    columns: [
      { key: 'date', label: 'Flow Date', type: 'date', sortable: true, width: 140 },
      { key: 'category', label: 'Expense Quadrant', sortable: true, width: 180, render: (val) => <span className="text-[10px] font-black uppercase text-accent-signature bg-accent-signature/5 px-2.5 py-1 rounded-full border border-accent-signature/10">{val || 'GENERAL'}</span> },
      { key: 'note', label: 'Operational Note', width: 250, render: (val) => <span className="text-gray-500 font-semibold italic">{val || 'No Detail'}</span> },
      { key: 'amount', label: 'Magnitude', type: 'currency', align: 'right', sortable: true, width: 150 },
      { key: 'route_id', label: 'Logistics Link', width: 150, render: (val) => val ? <div className="flex items-center gap-2 text-indigo-500 font-bold"><Truck size={12} /> {val.slice(0, 8)}</div> : '—' }
    ],
    kpis: metrics.kpis,
    chartConfig: { title: "Burn Rate by Operational Quadrant", type: 'pie', data: metrics.chartData },
    detailFields: [
      { key: 'amount', label: 'Expenditure value', type: 'currency', isHero: true },
      { key: 'category', label: 'Quadrant Definition', icon: <Tag size={12} /> },
      { key: 'date', label: 'Transaction Timestamp', type: 'date', icon: <Calendar size={12} /> },
      { key: 'note', label: 'Auditor Conclusion', icon: <Info size={12} /> },
      { key: 'route_id', label: 'Logistics Correlation Identifier', icon: <Activity size={12} /> }
    ]
  };

  return <ReportShell tabs={[expenseTab]} />;
};

export default ExpensesReport;
