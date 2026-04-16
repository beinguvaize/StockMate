import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { TrendingUp, DollarSign, Package, ShoppingBag, User, CreditCard, Tag, FileText, Calendar, Hash } from 'lucide-react';

const SalesSummaryReport = () => {
  // 1. Fetch Sales Data
  const { data: rawData, loading, error, lastUpdated } = useReportData({
    table: 'sales',
    select: '*', 
    dateColumn: 'date'
  });

  // 2. Process Metrics (Rule 4)
  const metrics = useMemo(() => {
    if (!rawData.length) return { totalRevenue: 0, totalOrders: 0, aov: 0, margin: 0, chartData: [], kpis: [] };

    const totalRevenue = rawData.reduce((acc, sale) => acc + (sale.totalAmount || 0), 0);
    const totalCogs = rawData.reduce((acc, sale) => acc + (sale.totalCogs || 0), 0);
    const totalOrders = rawData.length;
    const aov = totalRevenue / totalOrders;
    const totalProfit = totalRevenue - totalCogs;
    const margin = (totalProfit / totalRevenue) * 100;

    // Group by Date for Chart
    const dailyMap = rawData.reduce((acc, sale) => {
      const day = sale.date;
      if (!acc[day]) acc[day] = { name: day, revenue: 0, cogs: 0 };
      acc[day].revenue += sale.totalAmount || 0;
      acc[day].cogs += sale.totalCogs || 0;
      return acc;
    }, {});

    const chartData = Object.values(dailyMap).sort((a, b) => a.name.localeCompare(b.name));

    const kpis = [
      { 
        id: 'rev', 
        label: 'Total Revenue', 
        value: totalRevenue, 
        trend: 12.5, 
        trendDir: 'up', 
        chartData: chartData.map(d => ({ value: d.revenue })),
        color: 'indigo'
      },
      { 
        id: 'ord', 
        label: 'Total Orders', 
        value: totalOrders, 
        trend: 8.2, 
        trendDir: 'up', 
        chartData: chartData.map(d => ({ value: 1 })), // Simplified for example
        color: 'emerald'
      },
      { 
        id: 'aov', 
        label: 'Avg. Order Value', 
        value: aov, 
        trend: 3.1, 
        trendDir: 'down', 
        chartData: chartData.map(d => ({ value: d.revenue / (chartData.length || 1) })),
        color: 'amber'
      },
      { 
        id: 'mar', 
        label: 'Gross Margin', 
        value: `${margin.toFixed(1)}%`, 
        trend: 0.5, 
        trendDir: 'up', 
        chartData: chartData.map(d => ({ value: d.revenue - d.cogs })),
        color: 'rose'
      }
    ];

    return { totalRevenue, totalOrders, aov, margin, chartData, kpis };
  }, [rawData]);

  // 3. Define Table Columns (Rule 2)
  const columns = [
    { key: 'date', label: 'Date', type: 'date', sortable: true, width: 140 },
    { key: 'id', label: 'Invoice #', sortable: true, width: 120, render: (val) => <span className="font-mono text-[10px] bg-canvas px-2 py-0.5 rounded border border-black/5">{(val || '').slice(0, 8).toUpperCase() || 'REF-N/A'}</span> },
    { key: 'customerInfo', label: 'Client Name', sortable: true, width: 220, render: (val) => val?.name || 'Walk-in Client' },
    { key: 'items', label: 'Items', align: 'right', width: 80, render: (val) => val?.length || 0 },
    { key: 'totalAmount', label: 'Total Amount', type: 'currency', align: 'right', sortable: true, width: 150 },
    { key: 'totalCogs', label: 'COGS', type: 'currency', align: 'right', width: 130 },
    { key: 'profit', label: 'Profit', type: 'currency', align: 'right', width: 130, render: (_, row) => (row.totalAmount - (row.totalCogs || 0)) },
    { key: 'margin', label: 'Margin %', align: 'right', width: 100, render: (_, row) => {
      const p = row.totalAmount - (row.totalCogs || 0);
      const m = (p / row.totalAmount) * 100;
      return <span className={`font-black ${m > 20 ? 'text-emerald-600' : 'text-amber-600'}`}>{m.toFixed(1)}%</span>;
    }},
    { key: 'paymentMethod', label: 'Method', width: 120, render: (val) => <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{val || 'CASH'}</span> },
    { key: 'status', label: 'Status', width: 120, render: (val) => (
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase w-fit ${
        val === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
      }`}>
        <div className={`w-1 h-1 rounded-full ${val === 'COMPLETED' ? 'bg-emerald-600' : 'bg-amber-600'}`} />
        {val || 'PENDING'}
      </div>
    )}
  ];

  // 4. Detail Panel Configuration (Rule 9)
  const detailFields = [
    { key: 'totalAmount', label: 'Total Amount', type: 'currency', isHero: true },
    { key: 'date', label: 'Transaction Date', type: 'date', icon: <Calendar size={12} /> },
    { key: 'id', label: 'Invoice ID', icon: <Hash size={12} /> },
    { key: 'paymentMethod', label: 'Payment Method', icon: <CreditCard size={12} /> },
    { key: 'status', label: 'Workflow Status', icon: <Tag size={12} /> },
    { key: 'bookedBy', label: 'Staff Member', icon: <User size={12} /> },
    { key: 'note', label: 'Internal Note', icon: <FileText size={12} /> }
  ];

  const totals = useMemo(() => {
    if (!rawData.length) return null;
    return {
      totalAmount: rawData.reduce((acc, s) => acc + (s.totalAmount || 0), 0),
      totalCogs: rawData.reduce((acc, s) => acc + (s.totalCogs || 0), 0),
      profit: rawData.reduce((acc, s) => acc + (s.totalAmount - (s.totalCogs || 0)), 0)
    };
  }, [rawData]);

  // Tab config for ReportShell
  const salesTab = {
    id: 'SALES_SUMMARY',
    label: 'Sales Summary',
    icon: <TrendingUp size={18} />,
    data: rawData,
    loading: loading,
    totals: totals,
    columns: columns,
    kpis: metrics.kpis,
    chartConfig: {
      title: "Revenue vs. COGS Correlation",
      type: 'area', // Area for nice filling
      data: metrics.chartData,
      series: [
        { key: 'revenue', name: 'Revenue', color: '#6366f1' },
        { key: 'cogs', name: 'COGS', color: '#f59e0b' }
      ]
    },
    detailFields: detailFields,
    filterConfig: [
      { key: 'paymentStatus', label: 'Payment Status', options: [{ value: 'PAID', label: 'PAID' }, { value: 'PENDING', label: 'PENDING' }] },
      { key: 'paymentMethod', label: 'Payment Method', options: [{ value: 'CASH', label: 'CASH' }, { value: 'UPI', label: 'UPI' }, { value: 'CARD', label: 'CARD' }] }
    ]
  };

  return <ReportShell tabs={[salesTab]} />;
};

export default SalesSummaryReport;
