import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { 
  User, Briefcase, DollarSign, Calendar, Info, 
  Tag, Hash, Users, Banknote, LayoutGrid
} from 'lucide-react';

const HRReport = () => {
  // 1. Fetch Employees & Payroll Data
  const { data: employees, loading: employeesLoading } = useReportData({
    table: 'employees',
    select: '*',
    dateColumn: 'created_at'
  });

  const { data: payroll, loading: payrollLoading } = useReportData({
    table: 'payroll',
    select: '*',
    dateColumn: 'processed_at'
  });

  const loading = employeesLoading || payrollLoading;

  // 2. Process HR Metrics (Workforce Partition)
  const workforceMetrics = useMemo(() => {
    if (!employees.length) return { totalSalary: 0, headCount: 0, deptStats: [], kpis: [] };

    const totalSalary = employees.reduce((acc, e) => acc + (e.salary || 0), 0);
    const headCount = employees.length;

    const deptMap = employees.reduce((acc, e) => {
      const dept = e.department || 'Operations';
      if (!acc[dept]) acc[dept] = { name: dept, count: 0, cost: 0 };
      acc[dept].count += 1;
      acc[dept].cost += e.salary || 0;
      return acc;
    }, {});

    const deptStats = Object.values(deptMap).sort((a, b) => b.cost - a.cost);

    const kpis = [
      { id: 'hc', label: 'Active Personnel', value: headCount, trend: 2.5, trendDir: 'up', color: 'indigo', chartData: deptStats.map(d => ({ value: d.count })) },
      { id: 'load', label: 'Monthly Payroll', value: totalSalary, trend: 1.2, trendDir: 'up', color: 'emerald', chartData: deptStats.map(d => ({ value: d.cost })) }
    ];

    return { totalSalary, headCount, deptStats, kpis };
  }, [employees]);

  // 3. Process Payroll Metrics (Audit)
  const payrollMetrics = useMemo(() => {
    const totalDisbursed = payroll.reduce((acc, p) => acc + (p.amount || 0), 0);
    const uniquePersonnel = [...new Set(payroll.map(p => p.employeeId))].length;

    const kpis = [
      { id: 'disb', label: 'Disbursed Value', value: totalDisbursed, trend: 0.5, trendDir: 'up', color: 'amber', chartData: [{ value: 10 }, { value: 12 }, { value: 11 }, { value: totalDisbursed }] },
      { id: 'staff', label: 'Authorized Node', value: uniquePersonnel, trend: 0, trendDir: 'none', color: 'indigo', chartData: [] }
    ];

    return { totalDisbursed, uniquePersonnel, kpis };
  }, [payroll]);

  // 4. Tab Definitions
  const workforceTab = {
    id: 'WORKFORCE_LEDGER',
    label: 'Workforce Registry',
    icon: <Users size={18} />,
    data: employees,
    loading: loading,
    totals: { salary: workforceMetrics.totalSalary },
    columns: [
      { key: 'name', label: 'Personnel Entity', sortable: true, width: 220, render: (val, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-[10px] uppercase">{val.slice(0, 1)}</div>
          <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span>
        </div>
      )},
      { key: 'department', label: 'Operational Node', sortable: true, width: 150, render: (val) => <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{val || 'OPERATIONS'}</span> },
      { key: 'salary', label: 'Monthly Delta (Salary)', type: 'currency', align: 'right', sortable: true, width: 180 },
      { key: 'status', label: 'Integrity', width: 120, render: (val) => (
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase w-fit border border-emerald-100">
          <div className="w-1 h-1 rounded-full bg-emerald-600" /> ACTIVE
        </div>
      )}
    ],
    kpis: workforceMetrics.kpis,
    chartConfig: { 
      title: "Cost distribution by department", type: 'pie', data: workforceMetrics.deptStats.map(d => ({ name: d.name, value: d.cost })),
      series: [{ key: 'value', name: 'Authorized Salary', color: '#6366f1' }] 
    }
  };

  const auditTab = {
    id: 'PAYROLL_AUDIT',
    label: 'Disbursement Audit',
    icon: <Banknote size={18} />,
    data: payroll,
    loading: loading,
    totals: { amount: payrollMetrics.totalDisbursed },
    columns: [
      { key: 'processed_at', label: 'Sync Date', type: 'date', sortable: true, width: 150 },
      { key: 'employeeId', label: 'Personnel Reference', width: 200, render: (val) => <span className="font-mono text-[10px] bg-canvas px-2 py-0.5 rounded border border-black/5 uppercase font-bold">{(val || '').slice(0, 10)}</span> },
      { key: 'month', label: 'Fiscal Period', width: 120, render: (val) => <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">{val || 'CURRENT'}</span> },
      { key: 'amount', label: 'Magnitude', type: 'currency', align: 'right', sortable: true, width: 160 },
      { key: 'processed_by', label: 'Validator', width: 140, render: (val) => <span className="text-[10px] font-bold text-gray-400 font-mono uppercase">{val || 'SYSTEM'}</span> }
    ],
    kpis: payrollMetrics.kpis,
    chartConfig: { 
      title: "Historical Expenditure Curve", type: 'line', data: payroll.slice(-10).map(p => ({ name: p.processed_at, value: p.amount })),
      series: [{ key: 'value', name: 'Amount Disbursed', color: '#10b981' }] 
    }
  };

  return <ReportShell tabs={[workforceTab, auditTab]} />;
};

export default HRReport;
