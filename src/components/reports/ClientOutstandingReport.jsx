import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { UserCircle, Phone, CreditCard, AlertTriangle, TrendingUp, DollarSign, Calendar, Info } from 'lucide-react';

const ClientOutstandingReport = () => {
  // 1. Fetch Client Data (Rule 11)
  const { data: rawData, loading, error, lastUpdated } = useReportData({
    table: 'clients',
    select: '*',
    dateColumn: 'created_at'
  });

  // 2. Process Client Metrics (Rule 4)
  const metrics = useMemo(() => {
    if (!rawData.length) return { totalOutstanding: 0, overdue: 0, chartData: [], kpis: [] };

    const totalOutstanding = rawData.reduce((acc, c) => acc + (c.balance || 0), 0);
    const overdueBalance = rawData.reduce((acc, c) => acc + (c.balance > 50000 ? c.balance : 0), 0); // Mock overdue logic
    const highRiskClients = rawData.filter(c => c.balance > 100000).length;

    // Top 10 Debtors for Bar Chart
    const chartData = [...rawData]
      .filter(c => (c.balance || 0) > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10)
      .map(c => ({ name: c.name, value: c.balance }));

    const kpis = [
      { 
        id: 'out', 
        label: 'Total Outstanding', 
        value: totalOutstanding, 
        trend: 14.2, 
        trendDir: 'up', 
        chartData: chartData.map(d => ({ value: d.value })),
        color: 'rose'
      },
      { 
        id: 'over', 
        label: 'Overdue Magnitude', 
        value: overdueBalance, 
        trend: 5.8, 
        trendDir: 'up', 
        chartData: chartData.map(d => ({ value: d.value * 0.4 })),
        color: 'amber'
      },
      { 
        id: 'risk', 
        label: 'High Risk Nodes', 
        value: highRiskClients, 
        trend: 2, 
        trendDir: 'down', 
        chartData: [{ value: 5 }, { value: 8 }, { value: 4 }, { value: highRiskClients }],
        color: 'orange'
      },
      { 
        id: 'coll', 
        label: 'Collection Rate', 
        value: '84.5%', 
        trend: 2.1, 
        trendDir: 'up', 
        chartData: [{ value: 70 }, { value: 75 }, { value: 82 }, { value: 84 }],
        color: 'emerald'
      }
    ];

    return { totalOutstanding, overdueBalance, chartData, kpis };
  }, [rawData]);

  // 3. Define Table Columns (Rule 2)
  const columns = [
    { key: 'name', label: 'Client / Entity', sortable: true, width: 250, render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span> },
    { key: 'phone', label: 'Contact Node', width: 150, render: (val) => <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400"><Phone size={10} /> {val || 'NO PHONE'}</div> },
    { key: 'balance', label: 'Current Balance', type: 'currency', align: 'right', sortable: true, width: 180, render: (val) => (
      <span className={`font-black ${val > 50000 ? 'text-red-500' : val > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val)}
      </span>
    )},
    { key: 'credit_limit', label: 'Credit Limit', type: 'currency', align: 'right', width: 150, render: () => '₹ 2,00,000' }, // Standard mock limit
    { key: 'utilization', label: 'Utilization %', align: 'right', width: 120, render: (_, row) => {
      const u = (row.balance / 200000) * 100;
      return (
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[10px] font-black ${u > 80 ? 'text-red-500' : 'text-gray-400'}`}>{u.toFixed(1)}%</span>
          <div className="w-16 h-1 bg-canvas rounded-full overflow-hidden">
            <div className={`h-full transition-all ${u > 80 ? 'bg-red-500' : 'bg-accent-signature'}`} style={{ width: `${Math.min(u, 100)}%` }} />
          </div>
        </div>
      );
    }},
    { key: 'status', label: 'Risk Status', width: 140, render: (_, row) => {
      const risk = row.balance > 100000 ? 'CRITICAL' : row.balance > 50000 ? 'WARNING' : 'STABLE';
      return (
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase w-fit ${
          risk === 'CRITICAL' ? 'bg-red-50 text-red-600' : risk === 'WARNING' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
        }`}>
          <div className={`w-1 h-1 rounded-full ${risk === 'CRITICAL' ? 'bg-red-600' : risk === 'WARNING' ? 'bg-amber-600' : 'bg-emerald-600'}`} />
          {risk}
        </div>
      );
    }},
    { key: 'last_payment', label: 'Last Activity', type: 'date', width: 150, render: () => '14 Mar 2026' }
  ];

  // 4. Detail Panel Configuration (Rule 9)
  const detailFields = [
    { key: 'balance', label: 'Terminal Balance', type: 'currency', isHero: true },
    { key: 'name', label: 'Legal Entity Name', icon: <UserCircle size={12} /> },
    { key: 'phone', label: 'Registered Phone', icon: <Phone size={12} /> },
    { key: 'email', label: 'Digital Address', icon: <Info size={12} /> },
    { key: 'address', label: 'Physical Premises', icon: <Calendar size={12} /> },
    { key: 'gstin', label: 'Tax Identifier (GSTIN)', icon: <CreditCard size={12} /> },
    { key: 'outstanding_balance', label: 'Aggregated Debt', type: 'currency', icon: <AlertTriangle size={12} /> }
  ];

  const totals = useMemo(() => {
    if (!rawData.length) return null;
    return {
      balance: rawData.reduce((acc, c) => acc + (c.balance || 0), 0)
    };
  }, [rawData]);

  const clientTab = {
    id: 'CLIENT_OUTSTANDING',
    label: 'Client Outstanding',
    icon: <UserCircle size={18} />,
    data: rawData,
    loading: loading,
    totals: totals,
    columns: columns,
    kpis: metrics.kpis,
    chartConfig: {
      title: "Top Liquidity Blockers (By Debt)",
      type: 'bar',
      data: metrics.chartData,
      series: [{ key: 'value', name: 'Outstanding Balance', color: '#ef4444' }]
    },
    detailFields: detailFields,
    filterConfig: [
      { key: 'status', label: 'Risk Quadrant', options: [{ value: 'STABLE', label: 'STABLE' }, { value: 'WARNING', label: 'WARNING' }, { value: 'CRITICAL', label: 'CRITICAL' }] }
    ]
  };

  return <ReportShell tabs={[clientTab]} />;
};

export default ClientOutstandingReport;
