import React, { useEffect, useMemo, useState, useCallback } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { AlertTriangle, UserCircle, Phone, Calendar, FileWarning } from 'lucide-react';
import { formatINR } from '../../utils/financialCalculations';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { todayISOInAppTZ } from '../../lib/utils';
import { AGE_BUCKETS, buildAging, tieOutLine } from '../../lib/receivableAging';

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

  const { data: clients, loading: cliLoading, error: clientsError, refetch: refetchClients } = useReportData({
    table: 'clients',
    select: 'id, outstanding_balance',
    nullFilters: { deleted_at: null },
  });

  const loading = unpaidLoading || cliLoading;
  const aging = useMemo(() => buildAging(unpaid, clients, todayISOInAppTZ()), [unpaid, clients]);

  // Neutral on purpose: bills have no due dates, so nothing here is known to be
  // late, and red or green would claim otherwise. Size and weight carry it.
  const kpis = useMemo(() => {
    const share = aging.total > 0 ? (aging.over30 / aging.total) * 100 : 0;
    // No sparkline: these are age buckets, not a trend over time.
    const card = (id, label, value) => ({ id, label, value, color: 'slate' });
    return [
      card('total_ar', 'Customers owe', formatINR(aging.total)),
      card('over30', 'Unpaid over 30 days', formatINR(aging.over30)),
      card('over90', 'Unpaid over 90 days', formatINR(aging.over90)),
      card('share', 'Share over 30 days', `${share.toFixed(1)}%`),
    ];
  }, [aging]);

  const chartData = AGE_BUCKETS.map((b) => ({ name: `${b} days`, value: aging.totals[b] || 0 }));

  const bucketColumn = (bucket) => ({
    key: bucket,
    label: `${bucket} days`,
    type: 'currency',
    align: 'right',
    sortable: true,
    width: 118,
    render: (val) => {
      if (!val || val <= 0) return <span className="text-muted-foreground">—</span>;
      return <span className={bucket === '120+' ? 'font-bold' : 'font-medium'}>{formatINR(val)}</span>;
    },
  });
  const nameCell = (val) => <span className="font-semibold text-foreground block max-w-[120px] md:max-w-[160px] truncate" title={val}>{val}</span>;
  const days = (val) => (val === undefined || val === null ? '' : <span className="text-[12px] text-muted-foreground">{val} days</span>);

  const summaryTab = {
    id: 'AR_AGING_SUMMARY',
    label: 'By customer',
    icon: <UserCircle size={18} />,
    data: aging.customers,
    loading,
    totals: { total: aging.total, bills: aging.bills.length, ...aging.totals },
    columns: [
      { key: 'client_name', label: 'Customer', sortable: true, width: 160, render: nameCell },
      { key: 'total', label: 'Total owed', type: 'currency', align: 'right', sortable: true, width: 140, render: (val) => <span className="font-semibold text-foreground">{formatINR(val)}</span> },
      { key: 'bills', label: 'Bills', align: 'right', sortable: true, width: 76, defaultHidden: true },
      { key: 'oldest', label: 'Oldest', align: 'right', sortable: true, width: 92, render: days },
      ...AGE_BUCKETS.map(bucketColumn),
      { key: 'phone', label: 'Contact', width: 130, defaultHidden: true, render: (val) => (val === undefined ? '' : <span className="text-[11px] text-muted-foreground">{val || '—'}</span>) },
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
    totals: {
      unpaid: aging.total,
      total: aging.bills.reduce((n, b) => n + Number(b.total || 0), 0),
      paid: aging.bills.reduce((n, b) => n + Number(b.paid || 0), 0),
    },
    columns: [
      { key: 'sale_id', label: 'Bill', sortable: true, width: 140, render: (val) => <span className="tabular-nums text-[11px] font-semibold">{val}</span> },
      { key: 'client_name', label: 'Customer', sortable: true, width: 160, render: nameCell },
      { key: 'unpaid', label: 'Still owed', type: 'currency', align: 'right', sortable: true, width: 140, render: (val) => <span className="font-semibold">{formatINR(val)}</span> },
      { key: 'sale_date', label: 'Sale date', type: 'date', sortable: true, width: 130 },
      { key: 'days_unpaid', label: 'Unpaid for', align: 'right', sortable: true, width: 110, render: days },
      { key: 'total', label: 'Bill total', type: 'currency', align: 'right', sortable: true, width: 130 },
      { key: 'paid', label: 'Paid', type: 'currency', align: 'right', sortable: true, width: 130 },
    ],
    kpis,
    chartConfig: {
      title: 'What customers owe, by age',
      type: 'bar',
      data: chartData,
      series: [{ key: 'value', name: 'Owed', color: '#f59e0b' }],
    },
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

  // Zero must never stand in for "could not load": it reads as "nobody owes".
  const loadError = failure || (clientsError ? `Could not load customer balances: ${clientsError}` : '');
  if (loadError && !loading) {
    return (
      <div className="bg-card rounded-[10px] border border-border/60 p-8" role="alert" data-testid="aging-error">
        <h2 className="text-base font-semibold text-foreground">Customer Aging could not load</h2>
        <p className="mt-1 text-[13px] text-ink-secondary">{loadError}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Nothing here is a figure yet. Try again, or check Clients for balances.</p>
        <button type="button" onClick={() => { load(); refetchClients?.(); }}
          className="mt-4 h-9 px-4 rounded-pill border border-border text-[13px] font-semibold text-foreground hover:bg-canvas">
          Retry
        </button>
      </div>
    );
  }

  const subtitle = tieOutLine(aging, formatINR);

  return <PremiumReportView title="Customer Aging" subtitle={subtitle} tabs={[summaryTab, billTab]} />;
};

export default ARAgingReport;
