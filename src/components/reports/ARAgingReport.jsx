import React, { useEffect, useMemo, useState, useCallback } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { AlertTriangle, UserCircle, Phone, Calendar, FileWarning } from 'lucide-react';
import { formatINR, AGING_BUCKET_COLORS } from '../../utils/financialCalculations';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { todayISOInAppTZ } from '../../lib/utils';
import { AGE_BUCKETS, ageBucket, buildAging } from '../../lib/receivableAging';

// The palette keys predate these buckets: the youngest takes the "current" colour.
const colourOf = (b) => AGING_BUCKET_COLORS[b === '0-30' ? 'CURRENT' : b];

/**
 * Customer Aging: what customers owe, by how long it has been unpaid.
 *
 * Reads get_unpaid_sales, not invoices: most sales never get an invoice row,
 * and that table showed Rs 1,761 where customers owed Rs 73,819. Bills carry
 * no due dates, so this ages from the sale date and says "unpaid for", never
 * "overdue".
 */
const ARAgingReport = () => {
  const { currentTenantId } = useTenant();
  const [unpaid, setUnpaid] = useState([]);
  const [unpaidLoading, setUnpaidLoading] = useState(true);
  const [failure, setFailure] = useState('');

  const load = useCallback(async () => {
    if (!currentTenantId) return;
    setUnpaidLoading(true);
    setFailure('');
    const { data, error } = await supabase.rpc('get_unpaid_sales', { p_tenant_id: currentTenantId });
    if (error) {
      console.error('[aging] get_unpaid_sales failed', error);
      setFailure(error.message || 'Could not load what customers owe');
      setUnpaid([]);
    } else {
      setUnpaid(data || []);
    }
    setUnpaidLoading(false);
  }, [currentTenantId]);
  useEffect(() => { load(); }, [load]);

  const { data: clients, loading: cliLoading } = useReportData({
    table: 'clients',
    select: 'id, outstanding_balance',
    nullFilters: { deleted_at: null },
  });

  const loading = unpaidLoading || cliLoading;
  const aging = useMemo(() => buildAging(unpaid, clients, todayISOInAppTZ()), [unpaid, clients]);

  const kpis = useMemo(() => {
    const series = AGE_BUCKETS.map((b) => ({ value: aging.totals[b] || 0 }));
    const share = aging.total > 0 ? (aging.over30 / aging.total) * 100 : 0;
    return [
      { id: 'total_ar', label: 'Customers owe', value: aging.total, trend: 0, trendDir: 'none', color: 'indigo', chartData: series },
      { id: 'over30', label: 'Unpaid over 30 days', value: aging.over30, trend: 0, trendDir: 'none', color: 'amber', chartData: series.slice(1) },
      { id: 'over90', label: 'Unpaid over 90 days', value: aging.over90, trend: 0, trendDir: 'none', color: 'rose', chartData: series.slice(3) },
      { id: 'share', label: 'Share over 30 days', value: `${share.toFixed(1)}%`, trend: 0, trendDir: 'none', color: share > 30 ? 'rose' : 'emerald', chartData: series },
    ];
  }, [aging]);

  const chartData = AGE_BUCKETS.map((b) => ({ name: `${b} days`, value: aging.totals[b] || 0 }));

  const bucketColumn = (bucket) => ({
    key: bucket,
    label: `${bucket} days`,
    type: 'currency',
    align: 'right',
    sortable: true,
    width: 130,
    render: (val) => {
      if (!val || val <= 0) return <span className="text-muted-foreground">—</span>;
      return <span className={`font-semibold ${colourOf(bucket).text}`}>{formatINR(val)}</span>;
    },
  });

  const summaryTab = {
    id: 'AR_AGING_SUMMARY',
    label: 'By customer',
    icon: <UserCircle size={18} />,
    data: aging.customers,
    loading,
    totals: { total: aging.total, ...aging.totals },
    columns: [
      { key: 'client_name', label: 'Customer', sortable: true, width: 220, render: (val) => <span className="font-semibold text-foreground">{val}</span> },
      { key: 'phone', label: 'Contact', width: 130, render: (val) => <span className="text-[11px] text-muted-foreground">{val || '—'}</span> },
      { key: 'bills', label: 'Bills', align: 'right', sortable: true, width: 70 },
      { key: 'oldest', label: 'Oldest', align: 'right', sortable: true, width: 90, render: (val) => <span className="text-[12px] text-muted-foreground">{val} days</span> },
      ...AGE_BUCKETS.map(bucketColumn),
      { key: 'total', label: 'Total owed', type: 'currency', align: 'right', sortable: true, width: 150, render: (val) => <span className="font-semibold text-foreground">{formatINR(val)}</span> },
    ],
    kpis,
    chartConfig: {
      title: 'What customers owe, by age',
      type: 'bar',
      data: chartData,
      series: [{ key: 'value', name: 'Owed', color: '#f59e0b' }],
    },
    detailFields: [
      { key: 'total', label: 'Total owed', type: 'currency', isHero: true },
      { key: 'client_name', label: 'Customer', icon: <UserCircle size={12} /> },
      { key: 'phone', label: 'Phone', icon: <Phone size={12} /> },
      { key: 'bills', label: 'Unpaid bills' },
      { key: 'oldest', label: 'Oldest (days)', icon: <AlertTriangle size={12} /> },
      ...AGE_BUCKETS.map((b) => ({ key: b, label: `${b} days`, type: 'currency' })),
    ],
  };

  const billTab = {
    id: 'AR_AGING_BILLS',
    label: 'By bill',
    icon: <FileWarning size={18} />,
    data: aging.bills,
    loading,
    totals: { unpaid: aging.total },
    columns: [
      { key: 'sale_id', label: 'Bill', sortable: true, width: 140, render: (val) => <span className="tabular-nums text-[11px] font-semibold">{val}</span> },
      { key: 'client_name', label: 'Customer', sortable: true, width: 220, render: (val) => <span className="font-semibold text-foreground">{val}</span> },
      { key: 'sale_date', label: 'Sale date', type: 'date', sortable: true, width: 130 },
      { key: 'days_unpaid', label: 'Unpaid for', align: 'right', sortable: true, width: 110, render: (val) => <span className={`text-[12px] font-semibold ${colourOf(ageBucket(val)).text}`}>{val} days</span> },
      { key: 'total', label: 'Bill total', type: 'currency', align: 'right', sortable: true, width: 130 },
      { key: 'paid', label: 'Paid', type: 'currency', align: 'right', sortable: true, width: 130 },
      { key: 'unpaid', label: 'Still owed', type: 'currency', align: 'right', sortable: true, width: 140, render: (val) => <span className="font-semibold">{formatINR(val)}</span> },
    ],
    kpis,
    chartConfig: { title: 'What customers owe, by age', type: 'pie', data: chartData.filter((d) => d.value > 0) },
    detailFields: [
      { key: 'unpaid', label: 'Still owed', type: 'currency', isHero: true },
      { key: 'sale_id', label: 'Bill', icon: <FileWarning size={12} /> },
      { key: 'client_name', label: 'Customer', icon: <UserCircle size={12} /> },
      { key: 'sale_date', label: 'Sale date', type: 'date', icon: <Calendar size={12} /> },
      { key: 'days_unpaid', label: 'Unpaid for (days)', icon: <AlertTriangle size={12} /> },
      { key: 'total', label: 'Bill total', type: 'currency' },
      { key: 'paid', label: 'Paid', type: 'currency' },
    ],
  };

  // The total must agree with what the rest of the app says customers owe. If
  // it does not, say by how much rather than leave two numbers to be found.
  const gap = Math.abs(aging.difference);
  const subtitle = failure
    ? `Could not load this report: ${failure}`
    : gap < 0.5
      ? `Aged from the sale date. Matches customer balances of ${formatINR(aging.outstanding)}.`
      : `Aged from the sale date. Customer balances total ${formatINR(aging.outstanding)}: ${formatINR(gap)} ${aging.difference > 0 ? 'less' : 'more'} than these bills (customer credit, or a sale with no customer on it).`;

  return <PremiumReportView title="Customer Aging" subtitle={subtitle} tabs={[summaryTab, billTab]} />;
};

export default ARAgingReport;
