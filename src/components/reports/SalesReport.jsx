import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { 
  TrendingUp, DollarSign, Package, ShoppingBag, 
  User, CreditCard, Tag, FileText, Calendar, Hash, 
  Award, Layers, Activity
} from 'lucide-react';

const SalesReport = () => {
  // 1. Fetch Sales & Clients Data
  const { data: sales, loading: salesLoading } = useReportData({
    table: 'sales',
    select: '*', 
    dateColumn: 'date'
  });

  const { data: clients, loading: clientsLoading } = useReportData({
    table: 'clients',
    select: '*'
  });

  const loading = salesLoading || clientsLoading;

  // 2. Process Sales Metrics
  const salesMetrics = useMemo(() => {
    if (!sales.length) return { totalRevenue: 0, totalOrders: 0, aov: 0, margin: 0, chartData: [], kpis: [] };

    const totalRevenue = sales.reduce((acc, sale) => acc + (sale.totalAmount || 0), 0);
    const totalCogs = sales.reduce((acc, sale) => acc + (sale.totalCogs || 0), 0);
    const totalOrders = sales.length;
    const aov = totalRevenue / totalOrders;
    const totalProfit = totalRevenue - totalCogs;
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const dailyMap = sales.reduce((acc, sale) => {
      const day = sale.date;
      if (!acc[day]) acc[day] = { name: day, revenue: 0, cogs: 0 };
      acc[day].revenue += sale.totalAmount || 0;
      acc[day].cogs += sale.totalCogs || 0;
      return acc;
    }, {});

    const chartData = Object.values(dailyMap).sort((a, b) => a.name.localeCompare(b.name));

    const kpis = [
      { id: 'rev', label: 'Total Revenue', value: totalRevenue, trend: 12.5, trendDir: 'up', chartData: chartData.map(d => ({ value: d.revenue })), color: 'indigo' },
      { id: 'ord', label: 'Total Orders', value: totalOrders, trend: 8.2, trendDir: 'up', chartData: chartData.map(d => ({ value: 1 })), color: 'emerald' },
      { id: 'aov', label: 'Avg. Order', value: aov, trend: 3.1, trendDir: 'down', chartData: chartData.map(d => ({ value: d.revenue / (chartData.length || 1) })), color: 'amber' },
      { id: 'mar', label: 'Gross Margin', value: `${margin.toFixed(1)}%`, trend: 0.5, trendDir: 'up', chartData: chartData.map(d => ({ value: d.revenue - d.cogs })), color: 'rose' }
    ];

    return { totalRevenue, totalOrders, aov, margin, chartData, kpis };
  }, [sales]);

  // 3. Process Client Metrics (Leaderboard)
  const clientMetrics = useMemo(() => {
    const customerMap = {};
    sales.forEach(s => {
      const clientId = s.clientId;
      const clientName = clients.find(c => c.id === clientId)?.name || 'Walk-in Client';
      if (!customerMap[clientId || 'guest']) {
        customerMap[clientId || 'guest'] = { id: clientId || 'guest', name: clientName, revenue: 0, count: 0 };
      }
      customerMap[clientId || 'guest'].revenue += s.totalAmount || 0;
      customerMap[clientId || 'guest'].count += 1;
    });

    const leaderboard = Object.values(customerMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50);

    return { leaderboard };
  }, [sales, clients]);

  // 4. Tab Definitions
  const summaryTab = {
    id: 'SALES_SUMMARY',
    label: 'Sales Summary',
    icon: <TrendingUp size={18} />,
    data: sales,
    loading: loading,
    totals: { 
      totalAmount: salesMetrics.totalRevenue,
      totalCogs: sales.reduce((acc, s) => acc + (s.totalCogs || 0), 0),
      profit: salesMetrics.totalRevenue - sales.reduce((acc, s) => acc + (s.totalCogs || 0), 0)
    },
    columns: [
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: 140 },
      { key: 'id', label: 'Invoice #', sortable: true, width: 120, render: (val) => <span className="font-mono text-[10px] bg-canvas px-2 py-0.5 rounded border border-black/5 uppercase font-bold">{(val || '').slice(0, 8).toUpperCase()}</span> },
      { key: 'totalAmount', label: 'Total Amount', type: 'currency', align: 'right', sortable: true, width: 150 },
      { key: 'totalCogs', label: 'COGS', type: 'currency', align: 'right', width: 130 },
      { key: 'profit', label: 'Gross Profit', type: 'currency', align: 'right', width: 130, render: (_, row) => (row.totalAmount - (row.totalCogs || 0)) },
      { key: 'paymentMethod', label: 'Method', width: 120, render: (val) => <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{val || 'CASH'}</span> }
    ],
    kpis: salesMetrics.kpis,
    chartConfig: { 
      title: "Revenue vs Cost flow", type: 'area', data: salesMetrics.chartData, 
      series: [{ key: 'revenue', name: 'Revenue', color: '#6366f1' }, { key: 'cogs', name: 'COGS', color: '#f59e0b' }] 
    }
  };

  const clientTab = {
    id: 'CLIENT_LEADERBOARD',
    label: 'Client Board',
    icon: <Award size={18} />,
    data: clientMetrics.leaderboard,
    loading: loading,
    totals: { revenue: salesMetrics.totalRevenue },
    columns: [
      { key: 'name', label: 'Legal Entity', sortable: true, width: 250, render: (val, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent-signature/20 flex items-center justify-center text-accent-signature font-black text-[10px]">
            {val.slice(0, 1).toUpperCase()}
          </div>
          <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span>
        </div>
      )},
      { key: 'count', label: 'Transactions', align: 'right', sortable: true, width: 140, render: (val) => <span className="font-mono font-bold text-gray-400">{val} Orders</span> },
      { key: 'revenue', label: 'Aggregate Revenue', type: 'currency', align: 'right', sortable: true, width: 180 },
      { key: 'share', label: 'Market Share', align: 'right', width: 120, render: (_, row) => {
        const s = (row.revenue / salesMetrics.totalRevenue) * 100;
        return <span className="text-[10px] font-black text-accent-signature">{s.toFixed(1)}%</span>;
      }}
    ],
    kpis: [
      { id: 'top_client', label: 'Top Contributor', value: clientMetrics.leaderboard[0]?.revenue || 0, trend: 0, trendDir: 'none', color: 'indigo', chartData: [] },
      { id: 'avg_client', label: 'Rev / Account', value: salesMetrics.totalRevenue / (clients.length || 1), trend: 0, trendDir: 'none', color: 'emerald', chartData: [] }
    ],
    chartConfig: { 
      title: "Revenue distribution by account", type: 'bar', data: clientMetrics.leaderboard.slice(0, 10).map(c => ({ name: c.name, value: c.revenue })),
      series: [{ key: 'value', name: 'Total Revenue', color: '#6366f1' }] 
    }
  };

  return <ReportShell tabs={[summaryTab, clientTab]} />;
};

export default SalesReport;
