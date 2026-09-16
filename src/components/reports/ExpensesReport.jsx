import React, { useMemo } from 'react';
import useReportData from './useReportData';
import useDateWindow from './useDateWindow';
import PremiumReportView from './PremiumReportView';
import { DollarSign, Tag, Info, Calendar, Activity, Truck } from 'lucide-react';

const ExpensesReport = () => {
  // Financial year to date by default. These queries were previously
  // unfiltered and read the whole table on every load.
  const win = useDateWindow('YEAR');
  const { data: rawData, loading } = useReportData({
    table: 'expenses',
    select: '*',
    dateColumn: 'date', filters: win.filters
  });

  const metrics = useMemo(() => {
    if (!rawData.length) return { total: 0, kpis: [], chartData: [] };
    // Owner drawings / loan principal etc. are flagged exclude_from_pl —
    // real cash out, but not an operating expense. Split them so this
    // report's "business" figure ties to the P&L expense line exactly.
    const business = rawData.filter(e => !e.exclude_from_pl);
    const excluded = rawData.filter(e => e.exclude_from_pl);
    const total         = rawData.reduce((acc, e) => acc + (e.amount || 0), 0);
    const businessTotal = business.reduce((acc, e) => acc + (e.amount || 0), 0);
    const excludedTotal = excluded.reduce((acc, e) => acc + (e.amount || 0), 0);
    const catMap = business.reduce((acc, e) => {
      const c = e.category || 'GENERAL';
      acc[c] = (acc[c] || 0) + (e.amount || 0);
      return acc;
    }, {});
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    const chartData = Object.entries(catMap).map(([name, value]) => ({ name, value }));

    const kpis = [
      { id: 'burn', label: 'Business Expenses (ties to P&L)', value: businessTotal, color: 'rose', chartData: chartData.map(d => ({ value: d.value })) },
      { id: 'excluded', label: 'Owner / Not Business', value: excludedTotal, color: 'indigo', chartData: [{ value: excludedTotal }, { value: businessTotal }] },
      { id: 'topcat', label: 'Primary Sink', value: topCat, color: 'emerald', chartData: [{ value: 40 }, { value: 60 }] },
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
      { key: 'category', label: 'Expense Quadrant', sortable: true, width: 180, render: (val) => <span className="text-[10px] font-semibold uppercase text-accent-signature bg-accent-signature/5 px-2.5 py-1 rounded-full border border-accent-signature/10">{val || 'GENERAL'}</span> },
      { key: 'exclude_from_pl', label: 'P&L', sortable: true, width: 110, render: (val) => val
        ? <span className="text-[9px] font-semibold uppercase text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Owner / excluded</span>
        : <span className="text-[9px] font-semibold uppercase text-emerald-600">Business</span> },
      { key: 'note', label: 'Operational Note', width: 250, render: (val) => <span className="text-muted-foreground font-semibold italic">{val || 'No Detail'}</span> },
      { key: 'amount', label: 'Magnitude', type: 'currency', align: 'right', sortable: true, width: 150 },
      { key: 'route_id', label: 'Logistics Link', width: 150, render: (val) => val ? <div className="flex items-center gap-2 text-accent-signature font-semibold"><Truck size={12} /> {val.slice(0, 8)}</div> : '—' }
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

  return <PremiumReportView dateWindow={win} title="Expenses Report" tabs={[expenseTab]} />;
};

export default ExpensesReport;
