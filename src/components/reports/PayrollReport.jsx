import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { User, Briefcase, DollarSign, Calendar, Info, Tag, Hash } from 'lucide-react';

const PayrollReport = () => {
  const { data: rawData, loading } = useReportData({
    table: 'payroll',
    select: '*',
    dateColumn: 'processed_at'
  });

  const metrics = useMemo(() => {
    if (!rawData.length) return { total: 0, kpis: [], chartData: [] };
    const total = rawData.reduce((acc, p) => acc + (p.amount || 0), 0);
    const uniqueStaff = [...new Set(rawData.map(p => p.employeeId))].length;

    // Group by Month for Chart
    const monthMap = rawData.reduce((acc, p) => {
      const m = p.month || 'Current';
      acc[m] = (acc[m] || 0) + (p.amount || 0);
      return acc;
    }, {});

    const chartData = Object.entries(monthMap).map(([name, value]) => ({ name, value }));

    const kpis = [
      { id: 'disb', label: 'Disbursements', value: total, trend: 1.5, trendDir: 'up', color: 'indigo', chartData: chartData.map(d => ({ value: d.value })) },
      { id: 'staff', label: 'Active Personnel', value: uniqueStaff, trend: 0, trendDir: 'none', color: 'emerald', chartData: [{ value: 50 }, { value: 50 }] },
      { id: 'avg', label: 'Average Payload', value: total / (uniqueStaff || 1), trend: 0.5, trendDir: 'up', color: 'amber', chartData: chartData.map(d => ({ value: d.value / uniqueStaff })) }
    ];

    return { total, kpis, chartData };
  }, [rawData]);

  const payrollTab = {
    id: 'PAYROLL',
    label: 'Payroll Audit',
    icon: <Briefcase size={18} />,
    data: rawData,
    loading: loading,
    totals: { amount: metrics.total },
    columns: [
      { key: 'processed_at', label: 'Disbursement Date', type: 'date', sortable: true, width: 180 },
      { key: 'employeeId', label: 'Authorized Node (Staff)', width: 220, render: (val) => <div className="flex items-center gap-2 text-ink-primary font-black uppercase"><User size={12} className="text-accent-signature" /> {(val || '').slice(0, 10).toUpperCase()}...</div> },
      { key: 'month', label: 'Fiscal Period', sortable: true, width: 150, render: (val) => <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">{val || 'CURRENT'}</span> },
      { key: 'amount', label: 'Magnitude (Salary)', type: 'currency', align: 'right', sortable: true, width: 160 },
      { key: 'processed_by', label: 'Validator ID', width: 140, render: (val) => <span className="text-[10px] font-bold text-gray-400 font-mono uppercase">{val || 'SYSTEM'}</span> }
    ],
    kpis: metrics.kpis,
    chartConfig: { title: "Fiscal Period Expenditure Trend", type: 'line', data: metrics.chartData, series: [{ key: 'value', name: 'Disbursements', color: '#6366f1' }] },
    detailFields: [
      { key: 'amount', label: 'Disbursement value', type: 'currency', isHero: true },
      { key: 'employeeId', label: 'Personnel Identifier', icon: <Hash size={12} /> },
      { key: 'month', label: 'Fiscal Context', icon: <Calendar size={12} /> },
      { key: 'processed_by', label: 'Administrative Validator', icon: <User size={12} /> },
      { key: 'processed_at', label: 'Terminal Synchronization', type: 'date', icon: <Info size={12} /> }
    ]
  };

  return <ReportShell tabs={[payrollTab]} />;
};

export default PayrollReport;
