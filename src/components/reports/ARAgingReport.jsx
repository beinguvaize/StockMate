import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import {
  AlertTriangle, UserCircle, Phone, Calendar, DollarSign,
  TrendingDown, Clock, FileWarning
} from 'lucide-react';
import {
  formatINR, daysBetween, getAgingBucket, AGING_BUCKETS,
  AGING_BUCKET_COLORS, round2
} from '../../utils/financialCalculations';

/**
 * AR Aging Report — per-invoice / per-client aging analysis
 * Buckets: CURRENT | 1-30 | 31-60 | 61-90 | 91-120 | 120+
 *
 * Uses invoices table if available; falls back to clients table with balance.
 */
const ARAgingReport = () => {
  // Try invoices table first (per-invoice aging is more accurate)
  const { data: invoices, loading: invLoading } = useReportData({
    table: 'invoices',
    select: '*',
    dateColumn: 'date',
  });

  const { data: clients, loading: cliLoading } = useReportData({
    table: 'clients',
    select: '*',
  });

  const loading = invLoading || cliLoading;

  // --- Per-invoice aging ---
  const invoiceAging = useMemo(() => {
    if (!invoices || !invoices.length) return { rows: [], bucketTotals: {}, total: 0 };

    const rows = invoices
      .filter((inv) => {
        const status = (inv.status || '').toUpperCase();
        return status !== 'PAID' && Number(inv.amount ?? inv.total_amount ?? inv.balance ?? 0) > 0;
      })
      .map((inv) => {
        const client = clients.find((c) => c.id === inv.clientId || c.id === inv.client_id);
        const dueDate = inv.due_date || inv.dueDate || inv.date;
        const daysOverdue = daysBetween(dueDate);
        const bucket = getAgingBucket(daysOverdue);
        const amount = Number(inv.amount ?? inv.total_amount ?? inv.balance ?? 0);

        return {
          id: inv.id,
          invoice_no: inv.invoice_no || (inv.id || '').slice(0, 8).toUpperCase(),
          client_name: client?.name || inv.client_name || 'Unknown',
          phone: client?.phone || '',
          date: inv.date,
          due_date: dueDate,
          days_overdue: daysOverdue > 0 ? daysOverdue : 0,
          bucket: bucket,
          amount: round2(amount),
          status: (inv.status || 'OPEN').toUpperCase(),
        };
      });

    const bucketTotals = AGING_BUCKETS.reduce((acc, b) => ({ ...acc, [b]: 0 }), {});
    let total = 0;
    rows.forEach((r) => {
      bucketTotals[r.bucket] = (bucketTotals[r.bucket] || 0) + r.amount;
      total += r.amount;
    });

    return { rows, bucketTotals, total };
  }, [invoices, clients]);

  // --- Per-client aging (fallback when invoices empty, OR pivoted from invoices) ---
  const clientAging = useMemo(() => {
    if (invoiceAging.rows.length > 0) {
      // Pivot invoice aging by client
      const byClient = {};
      invoiceAging.rows.forEach((r) => {
        if (!byClient[r.client_name]) {
          byClient[r.client_name] = {
            client_name: r.client_name,
            phone: r.phone,
            total: 0,
            CURRENT: 0, '1-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '120+': 0,
          };
        }
        byClient[r.client_name][r.bucket] += r.amount;
        byClient[r.client_name].total += r.amount;
      });
      return Object.values(byClient).sort((a, b) => b.total - a.total);
    }

    // Fallback: use client.balance with last_payment_date / updated_at as due proxy
    return (clients || [])
      .filter((c) => Number(c.balance || 0) > 0)
      .map((c) => {
        const dueDate = c.due_date || c.last_payment_date || c.updated_at || c.created_at;
        const daysOverdue = daysBetween(dueDate);
        const bucket = getAgingBucket(daysOverdue);
        const balance = round2(Number(c.balance || 0));

        const row = {
          client_name: c.name,
          phone: c.phone || '',
          total: balance,
          CURRENT: 0, '1-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '120+': 0,
        };
        row[bucket] = balance;
        return row;
      })
      .sort((a, b) => b.total - a.total);
  }, [invoiceAging, clients]);

  // --- Bucket totals for the client-level view ---
  const clientBucketTotals = useMemo(() => {
    const totals = AGING_BUCKETS.reduce((acc, b) => ({ ...acc, [b]: 0 }), {});
    let grand = 0;
    clientAging.forEach((c) => {
      AGING_BUCKETS.forEach((b) => {
        totals[b] += c[b] || 0;
      });
      grand += c.total;
    });
    return { totals, grand };
  }, [clientAging]);

  // --- KPI cards ---
  const kpis = useMemo(() => {
    const grand = clientBucketTotals.grand;
    const current = clientBucketTotals.totals['CURRENT'] || 0;
    const overdue = grand - current;
    const severeOverdue = (clientBucketTotals.totals['91-120'] || 0) + (clientBucketTotals.totals['120+'] || 0);
    const overdueRate = grand > 0 ? (overdue / grand) * 100 : 0;

    const bucketChart = AGING_BUCKETS.map((b) => ({ value: clientBucketTotals.totals[b] || 0 }));

    return [
      {
        id: 'total_ar',
        label: 'Total Receivables',
        value: grand,
        trend: 12.5,
        trendDir: 'up',
        color: 'indigo',
        chartData: bucketChart,
      },
      {
        id: 'overdue',
        label: 'Past Due',
        value: overdue,
        trend: overdueRate.toFixed(1),
        trendDir: 'up',
        color: 'amber',
        chartData: bucketChart.slice(1),
      },
      {
        id: 'severe',
        label: 'Severely Overdue (>90d)',
        value: severeOverdue,
        trend: 8,
        trendDir: severeOverdue > 0 ? 'up' : 'down',
        color: 'rose',
        chartData: bucketChart.slice(4),
      },
      {
        id: 'rate',
        label: 'Overdue Rate',
        value: `${overdueRate.toFixed(1)}%`,
        trend: 2.1,
        trendDir: overdueRate > 20 ? 'up' : 'down',
        color: overdueRate > 30 ? 'rose' : 'emerald',
        chartData: bucketChart,
      },
    ];
  }, [clientBucketTotals]);

  // --- Chart data: bucket distribution ---
  const chartData = AGING_BUCKETS.map((b) => ({
    name: b,
    value: clientBucketTotals.totals[b] || 0,
  }));

  // ---- Tab: Aging Summary (by client) ----
  const bucketColumn = (bucket) => ({
    key: bucket,
    label: bucket === 'CURRENT' ? 'Current' : `${bucket} days`,
    type: 'currency',
    align: 'right',
    sortable: true,
    width: 130,
    render: (val) => {
      const c = AGING_BUCKET_COLORS[bucket];
      if (!val || val <= 0) return <span className="text-gray-300">—</span>;
      return <span className={`font-black ${c.text}`}>{formatINR(val)}</span>;
    },
  });

  const summaryTab = {
    id: 'AR_AGING_SUMMARY',
    label: 'Aging by Client',
    icon: <UserCircle size={18} />,
    data: clientAging,
    loading: loading,
    totals: {
      total: clientBucketTotals.grand,
      ...clientBucketTotals.totals,
    },
    columns: [
      {
        key: 'client_name', label: 'Client', sortable: true, width: 220,
        render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span>,
      },
      { key: 'phone', label: 'Contact', width: 140, render: (val) => <span className="text-[10px] font-bold text-gray-400">{val || '—'}</span> },
      bucketColumn('CURRENT'),
      bucketColumn('1-30'),
      bucketColumn('31-60'),
      bucketColumn('61-90'),
      bucketColumn('91-120'),
      bucketColumn('120+'),
      {
        key: 'total', label: 'Total Outstanding', type: 'currency', align: 'right', sortable: true, width: 160,
        render: (val) => <span className="font-black text-ink-primary">{formatINR(val)}</span>,
      },
    ],
    kpis: kpis,
    chartConfig: {
      title: 'Receivables by Aging Bucket',
      type: 'bar',
      data: chartData,
      series: [{ key: 'value', name: 'Outstanding', color: '#ef4444' }],
    },
    detailFields: [
      { key: 'total', label: 'Total Due', type: 'currency', isHero: true },
      { key: 'client_name', label: 'Client Entity', icon: <UserCircle size={12} /> },
      { key: 'phone', label: 'Phone', icon: <Phone size={12} /> },
      { key: 'CURRENT', label: 'Current', type: 'currency' },
      { key: '1-30', label: '1-30 Days', type: 'currency' },
      { key: '31-60', label: '31-60 Days', type: 'currency' },
      { key: '61-90', label: '61-90 Days', type: 'currency' },
      { key: '91-120', label: '91-120 Days', type: 'currency' },
      { key: '120+', label: '120+ Days', type: 'currency' },
    ],
  };

  // ---- Tab: Per-Invoice detail (if invoices available) ----
  const invoiceTab = {
    id: 'AR_AGING_INVOICES',
    label: 'Invoice Detail',
    icon: <FileWarning size={18} />,
    data: invoiceAging.rows,
    loading: loading,
    totals: { amount: invoiceAging.total },
    columns: [
      {
        key: 'invoice_no', label: 'Invoice #', sortable: true, width: 130,
        render: (val) => <span className="font-mono text-[10px] bg-canvas px-2 py-0.5 rounded border border-black/5 uppercase font-bold">{val}</span>,
      },
      { key: 'client_name', label: 'Client', sortable: true, width: 220, render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span> },
      { key: 'date', label: 'Invoice Date', type: 'date', sortable: true, width: 130 },
      { key: 'due_date', label: 'Due Date', type: 'date', sortable: true, width: 130 },
      {
        key: 'days_overdue', label: 'Days Overdue', align: 'right', sortable: true, width: 120,
        render: (val) => {
          if (!val || val <= 0) return <span className="text-[10px] font-black text-emerald-500">CURRENT</span>;
          return <span className={`text-[10px] font-black ${val > 90 ? 'text-red-600' : val > 60 ? 'text-orange-500' : 'text-amber-500'}`}>{val} DAYS</span>;
        },
      },
      {
        key: 'bucket', label: 'Aging Bucket', width: 140,
        render: (val) => {
          const c = AGING_BUCKET_COLORS[val];
          return (
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase ${c.bg} ${c.text}`}>
              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: c.chart }} />
              {val}
            </div>
          );
        },
      },
      { key: 'amount', label: 'Amount Due', type: 'currency', align: 'right', sortable: true, width: 150, render: (val) => <span className="font-black">{formatINR(val)}</span> },
      { key: 'status', label: 'Status', width: 110 },
    ],
    kpis: kpis,
    chartConfig: {
      title: 'Invoice Aging Distribution',
      type: 'pie',
      data: chartData.filter((d) => d.value > 0),
    },
    detailFields: [
      { key: 'amount', label: 'Amount Due', type: 'currency', isHero: true },
      { key: 'invoice_no', label: 'Invoice Number', icon: <FileWarning size={12} /> },
      { key: 'client_name', label: 'Client', icon: <UserCircle size={12} /> },
      { key: 'date', label: 'Issued', type: 'date', icon: <Calendar size={12} /> },
      { key: 'due_date', label: 'Due Date', type: 'date', icon: <Clock size={12} /> },
      { key: 'days_overdue', label: 'Days Past Due', icon: <AlertTriangle size={12} /> },
      { key: 'bucket', label: 'Aging Bucket' },
      { key: 'status', label: 'Status' },
    ],
  };

  // Only include invoice tab if we actually have invoices
  const tabs = invoiceAging.rows.length > 0 ? [summaryTab, invoiceTab] : [summaryTab];

  return <ReportShell tabs={tabs} />;
};

export default ARAgingReport;
