import React, { useMemo } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { formatCurrency } from '../../lib/utils';
import { UserCircle, Phone, CreditCard, AlertTriangle, TrendingUp, DollarSign, Calendar, Info } from 'lucide-react';

const DEFAULT_CREDIT_LIMIT = 200000;
const OVERDUE_DAYS_THRESHOLD = 30;

// Helper: compute days since last payment / invoice
const daysBetween = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
};

const ClientOutstandingReport = () => {
  // 1. Fetch Client Data (Rule 11)
  const { data: rawData, loading, error, lastUpdated } = useReportData({
    table: 'clients',
    select: '*',
    dateColumn: 'created_at',
    nullFilters: { deleted_at: null },
  });

  // Enrich clients with computed overdue/credit fields
  const enrichedData = useMemo(() => {
    return (rawData || []).map((c) => {
      const creditLimit = Number(c.credit_limit ?? c.creditLimit ?? DEFAULT_CREDIT_LIMIT);
      const balance = Number(c.outstanding_balance ?? c.balance ?? 0);

      // Use actual last_payment_date / due_date fields (fall back to updated_at)
      const lastPaymentDate = c.last_payment_date || c.lastPaymentDate || c.updated_at || c.created_at;
      const dueDate = c.due_date || c.dueDate || lastPaymentDate;
      const daysSinceDue = daysBetween(dueDate);
      const isOverdue = balance > 0 && daysSinceDue !== null && daysSinceDue > OVERDUE_DAYS_THRESHOLD;

      const utilization = creditLimit > 0 ? (balance / creditLimit) * 100 : 0;

      return {
        ...c,
        credit_limit: creditLimit,
        last_payment_date: lastPaymentDate,
        due_date: dueDate,
        days_overdue: isOverdue ? daysSinceDue - OVERDUE_DAYS_THRESHOLD : 0,
        overdue_amount: isOverdue ? balance : 0,
        utilization: utilization,
      };
    });
  }, [rawData]);

  // 2. Process Client Metrics (Rule 4)
  const metrics = useMemo(() => {
    if (!enrichedData.length) return { totalOutstanding: 0, overdueBalance: 0, chartData: [], kpis: [] };

    const totalOutstanding = enrichedData.reduce((acc, c) => acc + (c.balance || 0), 0);
    const overdueBalance = enrichedData.reduce((acc, c) => acc + (c.overdue_amount || 0), 0);
    const highRiskClients = enrichedData.filter((c) => c.utilization > 80).length;
    const overdueClientCount = enrichedData.filter((c) => c.overdue_amount > 0).length;
    const collectionRate = totalOutstanding > 0
      ? ((totalOutstanding - overdueBalance) / totalOutstanding) * 100
      : 100;

    // Top 10 Debtors
    const chartData = [...enrichedData]
      .filter((c) => (c.balance || 0) > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10)
      .map((c) => ({ name: c.name, value: c.balance }));

    const kpis = [
      {
        id: 'out',
        label: 'Total Outstanding',
        value: totalOutstanding,
        trend: 0,
        trendDir: 'none',
        chartData: chartData.map((d) => ({ value: d.value })),
        color: 'rose',
      },
      {
        id: 'over',
        label: 'Overdue Magnitude',
        value: overdueBalance,
        trend: overdueClientCount,
        trendDir: overdueClientCount > 0 ? 'up' : 'down',
        chartData: chartData.map((d) => ({ value: d.value * 0.4 })),
        color: 'amber',
      },
      {
        id: 'risk',
        label: 'High Risk Nodes',
        value: highRiskClients,
        trend: 0,
        trendDir: 'none',
        chartData: [{ value: 5 }, { value: 8 }, { value: 4 }, { value: highRiskClients }],
        color: 'orange',
      },
      {
        id: 'coll',
        label: 'Collection Rate',
        value: `${collectionRate.toFixed(1)}%`,
        trend: 0,
        trendDir: 'none',
        chartData: [{ value: 70 }, { value: 75 }, { value: 82 }, { value: collectionRate }],
        color: 'emerald',
      },
    ];

    return { totalOutstanding, overdueBalance, chartData, kpis };
  }, [enrichedData]);

  // 3. Define Table Columns (Rule 2)
  const columns = [
    { key: 'name', label: 'Client / Entity', sortable: true, width: 250, render: (val) => <span className="font-semibold text-foreground uppercase tracking-tight">{val}</span> },
    { key: 'phone', label: 'Contact Node', width: 150, render: (val) => <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground"><Phone size={10} /> {val || 'NO PHONE'}</div> },
    { key: 'balance', label: 'Current Balance', type: 'currency', align: 'right', sortable: true, width: 180, render: (val) => (
      <span className={`font-semibold ${val > 50000 ? 'text-red-500' : val > 0 ? 'text-accent-signature' : 'text-emerald-500'}`}>
        {formatCurrency(val)}
      </span>
    )},
    { key: 'credit_limit', label: 'Credit Limit', type: 'currency', align: 'right', sortable: true, width: 150, render: (val) => formatCurrency(val) },
    { key: 'utilization', label: 'Utilization %', align: 'right', sortable: true, width: 120, render: (_, row) => {
      const u = row.utilization || 0;
      return (
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[10px] font-semibold ${u > 80 ? 'text-red-500' : 'text-muted-foreground'}`}>{u.toFixed(1)}%</span>
          <div className="w-16 h-1 bg-canvas rounded-full overflow-hidden">
            <div className={`h-full transition-all ${u > 80 ? 'bg-red-500' : 'bg-accent-signature'}`} style={{ width: `${Math.min(u, 100)}%` }} />
          </div>
        </div>
      );
    }},
    { key: 'days_overdue', label: 'Days Overdue', align: 'right', sortable: true, width: 120, render: (val) => {
      if (!val || val <= 0) return <span className="text-[10px] font-semibold text-emerald-500">CURRENT</span>;
      return <span className={`text-[10px] font-semibold ${val > 60 ? 'text-red-600' : val > 30 ? 'text-orange-500' : 'text-accent-signature'}`}>{val} DAYS</span>;
    }},
    { key: 'status', label: 'Risk Status', width: 140, render: (_, row) => {
      const u = row.utilization || 0;
      const isOverdue = (row.overdue_amount || 0) > 0;
      const risk = isOverdue || u > 90 ? 'CRITICAL' : u > 60 ? 'WARNING' : 'STABLE';
      return (
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-semibold uppercase w-fit ${
          risk === 'CRITICAL' ? 'bg-red-50 text-red-600' : risk === 'WARNING' ? 'bg-accent-signature/10 text-accent-signature' : 'bg-emerald-50 text-emerald-600'
        }`}>
          <div className={`w-1 h-1 rounded-full ${risk === 'CRITICAL' ? 'bg-red-600' : risk === 'WARNING' ? 'bg-accent-signature' : 'bg-emerald-600'}`} />
          {risk}
        </div>
      );
    }},
    { key: 'last_payment_date', label: 'Last Activity', type: 'date', width: 150, render: (val) => {
      if (!val) return <span className="text-muted-foreground text-[10px]">NO ACTIVITY</span>;
      try {
        return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch {
        return val;
      }
    }}
  ];

  // 4. Detail Panel Configuration (Rule 9)
  const detailFields = [
    { key: 'balance', label: 'Terminal Balance', type: 'currency', isHero: true },
    { key: 'name', label: 'Legal Entity Name', icon: <UserCircle size={12} /> },
    { key: 'phone', label: 'Registered Phone', icon: <Phone size={12} /> },
    { key: 'email', label: 'Digital Address', icon: <Info size={12} /> },
    { key: 'address', label: 'Physical Premises', icon: <Calendar size={12} /> },
    { key: 'gstin', label: 'Tax Identifier (GSTIN)', icon: <CreditCard size={12} /> },
    { key: 'credit_limit', label: 'Approved Credit Limit', type: 'currency', icon: <TrendingUp size={12} /> },
    { key: 'days_overdue', label: 'Days Past Due', icon: <AlertTriangle size={12} /> },
  ];

  const totals = useMemo(() => {
    if (!enrichedData.length) return null;
    return {
      balance: enrichedData.reduce((acc, c) => acc + (c.balance || 0), 0),
      credit_limit: enrichedData.reduce((acc, c) => acc + (c.credit_limit || 0), 0),
      overdue_amount: enrichedData.reduce((acc, c) => acc + (c.overdue_amount || 0), 0),
    };
  }, [enrichedData]);

  const clientTab = {
    id: 'CLIENT_OUTSTANDING',
    label: 'Client Outstanding',
    icon: <UserCircle size={18} />,
    data: enrichedData,
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

  return <PremiumReportView title="Client Outstanding" tabs={[clientTab]} />;
};

export default ClientOutstandingReport;
