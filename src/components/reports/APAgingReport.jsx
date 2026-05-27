import React, { useMemo } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { parseLocalDate } from '../../lib/utils';
import {
  AlertTriangle, Truck, Phone, Calendar, DollarSign,
  Clock, FileWarning, Package, Receipt,
} from 'lucide-react';
import {
  formatINR, daysBetween, getAgingBucket, AGING_BUCKETS,
  AGING_BUCKET_COLORS, round2,
} from '../../utils/financialCalculations';

/**
 * AP Aging — Supplier Payables Aging
 * -----------------------------------
 * Mirrors the AR Aging report, but from our side of the ledger: what we
 * owe suppliers, aged into the same buckets.
 *
 * Data sources
 *   Primary: public.purchases with payment_type = 'CREDIT'
 *            (per-bill aging — most accurate, lets us show a detail tab)
 *   Fallback: public.suppliers.balance > 0
 *            (pivoted aging from carry-forward balance)
 *
 * Aging calculation
 *   The purchases table has no due_date column, so we apply a default
 *   payment term (DEFAULT_PAYMENT_TERMS_DAYS, net-30) and compute:
 *       implied_due_date = purchase_date + N days
 *       days_overdue     = today - implied_due_date
 *   A purchase less than N days old is "CURRENT" (not yet due).
 */

// Default supplier payment terms (days). Matches industry-standard net-30.
// If the project later adds a per-supplier `payment_terms_days` column, swap
// this constant for `supplier.payment_terms_days ?? DEFAULT_PAYMENT_TERMS_DAYS`.
const DEFAULT_PAYMENT_TERMS_DAYS = 30;

// Which `payment_type` values indicate an unpaid (credit) purchase.
// Case-insensitive check below handles `Credit`, `CREDIT`, `credit`, etc.
const CREDIT_VALUES = new Set(['credit', 'on_credit', 'unpaid', 'due']);

const isCreditPurchase = (p) => {
  const t = (p.payment_type || '').toString().trim().toLowerCase();
  if (!t) return false;
  return CREDIT_VALUES.has(t);
};

const APAgingReport = () => {
  const { data: purchases, loading: pLoading } = useReportData({
    table: 'purchases',
    select: '*',
    dateColumn: 'date',
  });

  const { data: suppliers, loading: sLoading } = useReportData({
    table: 'suppliers',
    select: '*',
  });

  const loading = pLoading || sLoading;

  /* ------------------------------------------------------------------ *
   * Per-bill aging (from credit purchases)
   * ------------------------------------------------------------------ */
  const billAging = useMemo(() => {
    if (!purchases || !purchases.length) return { rows: [], bucketTotals: {}, total: 0 };

    const rows = purchases
      .filter(isCreditPurchase)
      .map((p) => {
        const supplier = suppliers.find((s) => s.id === p.supplier_id);
        const purchaseDate = p.date;
        const parsed = purchaseDate ? parseLocalDate(purchaseDate) : null;
        const impliedDue = parsed && !isNaN(parsed.getTime())
          ? new Date(parsed.getTime() + DEFAULT_PAYMENT_TERMS_DAYS * 86400000)
          : null;
        const daysOverdue = impliedDue ? daysBetween(impliedDue) : null;
        const bucket = getAgingBucket(daysOverdue);
        const amount = Number(p.total_amount) || 0;

        return {
          id: p.id,
          bill_ref: (p.id || '').slice(0, 8).toUpperCase(),
          supplier_name: supplier?.name || p.supplier_name || 'Unknown Supplier',
          phone: supplier?.phone || '',
          date: purchaseDate,
          due_date: impliedDue ? impliedDue.toISOString().split('T')[0] : null,
          days_overdue: daysOverdue && daysOverdue > 0 ? daysOverdue : 0,
          bucket,
          amount: round2(amount),
          product_hint: p.notes || p.supplier_name || '',
        };
      });

    const bucketTotals = AGING_BUCKETS.reduce((acc, b) => ({ ...acc, [b]: 0 }), {});
    let total = 0;
    rows.forEach((r) => {
      bucketTotals[r.bucket] = (bucketTotals[r.bucket] || 0) + r.amount;
      total += r.amount;
    });

    return { rows, bucketTotals, total };
  }, [purchases, suppliers]);

  /* ------------------------------------------------------------------ *
   * Per-supplier aging
   *   If we have bill-level rows → pivot them by supplier.
   *   Otherwise → fall back to supplier.balance with latest purchase date
   *   as the due-proxy.
   * ------------------------------------------------------------------ */
  const supplierAging = useMemo(() => {
    if (billAging.rows.length > 0) {
      const bySupplier = {};
      billAging.rows.forEach((r) => {
        const key = r.supplier_name;
        if (!bySupplier[key]) {
          bySupplier[key] = {
            supplier_name: key,
            phone: r.phone,
            total: 0,
            CURRENT: 0, '1-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '120+': 0,
          };
        }
        bySupplier[key][r.bucket] += r.amount;
        bySupplier[key].total += r.amount;
      });
      return Object.values(bySupplier).sort((a, b) => b.total - a.total);
    }

    // Fallback path — use `suppliers.balance`
    // Latest purchase date per supplier is the best aging anchor we have.
    const lastPurchaseBySupplier = {};
    (purchases || []).forEach((p) => {
      const key = p.supplier_id || p.supplier_name;
      if (!key || !p.date) return;
      if (!lastPurchaseBySupplier[key] || p.date > lastPurchaseBySupplier[key]) {
        lastPurchaseBySupplier[key] = p.date;
      }
    });

    return (suppliers || [])
      .filter((s) => Number(s.balance || 0) > 0)
      .map((s) => {
        const lastDate = lastPurchaseBySupplier[s.id] || lastPurchaseBySupplier[s.name] || s.created_at;
        const parsed = lastDate ? new Date(lastDate) : null;
        const impliedDue = parsed && !isNaN(parsed.getTime())
          ? new Date(parsed.getTime() + DEFAULT_PAYMENT_TERMS_DAYS * 86400000)
          : null;
        const daysOverdue = impliedDue ? daysBetween(impliedDue) : null;
        const bucket = getAgingBucket(daysOverdue);
        const balance = round2(Number(s.balance || 0));

        const row = {
          supplier_name: s.name,
          phone: s.phone || '',
          contact_person: s.contact_person || '',
          total: balance,
          CURRENT: 0, '1-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '120+': 0,
        };
        row[bucket] = balance;
        return row;
      })
      .sort((a, b) => b.total - a.total);
  }, [billAging, suppliers, purchases]);

  /* ------------------------------------------------------------------ *
   * Bucket totals (summary-level)
   * ------------------------------------------------------------------ */
  const supplierBucketTotals = useMemo(() => {
    const totals = AGING_BUCKETS.reduce((acc, b) => ({ ...acc, [b]: 0 }), {});
    let grand = 0;
    supplierAging.forEach((s) => {
      AGING_BUCKETS.forEach((b) => { totals[b] += s[b] || 0; });
      grand += s.total;
    });
    return { totals, grand };
  }, [supplierAging]);

  /* ------------------------------------------------------------------ *
   * KPIs — same shape as AR report so the visual language is consistent
   * ------------------------------------------------------------------ */
  const kpis = useMemo(() => {
    const grand = supplierBucketTotals.grand;
    const current = supplierBucketTotals.totals['CURRENT'] || 0;
    const overdue = grand - current;
    const severeOverdue =
      (supplierBucketTotals.totals['91-120'] || 0) +
      (supplierBucketTotals.totals['120+'] || 0);
    const overdueRate = grand > 0 ? (overdue / grand) * 100 : 0;

    const bucketChart = AGING_BUCKETS.map((b) => ({ value: supplierBucketTotals.totals[b] || 0 }));

    return [
      {
        id: 'total_ap',
        label: 'Total Payables',
        value: grand,
        trend: 0,
        trendDir: 'up',
        color: 'indigo',
        chartData: bucketChart,
      },
      {
        id: 'overdue',
        label: 'Past Due',
        value: overdue,
        trend: overdueRate.toFixed(1),
        trendDir: overdueRate > 20 ? 'up' : 'down',
        color: 'amber',
        chartData: bucketChart.slice(1),
      },
      {
        id: 'severe',
        label: 'Severely Overdue (>90d)',
        value: severeOverdue,
        trend: 0,
        trendDir: severeOverdue > 0 ? 'up' : 'down',
        color: 'rose',
        chartData: bucketChart.slice(4),
      },
      {
        id: 'rate',
        label: 'Overdue Rate',
        value: `${overdueRate.toFixed(1)}%`,
        trend: 0,
        trendDir: overdueRate > 30 ? 'up' : 'down',
        color: overdueRate > 30 ? 'rose' : 'emerald',
        chartData: bucketChart,
      },
    ];
  }, [supplierBucketTotals]);

  const chartData = AGING_BUCKETS.map((b) => ({
    name: b,
    value: supplierBucketTotals.totals[b] || 0,
  }));

  /* ------------------------------------------------------------------ *
   * Shared column factories
   * ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ *
   * Tab: Aging by Supplier
   * ------------------------------------------------------------------ */
  const summaryTab = {
    id: 'AP_AGING_SUMMARY',
    label: 'Aging by Supplier',
    icon: <Truck size={18} />,
    data: supplierAging,
    loading,
    totals: {
      total: supplierBucketTotals.grand,
      ...supplierBucketTotals.totals,
    },
    columns: [
      {
        key: 'supplier_name', label: 'Supplier', sortable: true, width: 240,
        render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span>,
      },
      {
        key: 'phone', label: 'Contact', width: 140,
        render: (val) => <span className="text-[10px] font-bold text-gray-400">{val || '—'}</span>,
      },
      bucketColumn('CURRENT'),
      bucketColumn('1-30'),
      bucketColumn('31-60'),
      bucketColumn('61-90'),
      bucketColumn('91-120'),
      bucketColumn('120+'),
      {
        key: 'total', label: 'Total Owed', type: 'currency', align: 'right', sortable: true, width: 160,
        render: (val) => <span className="font-black text-ink-primary">{formatINR(val)}</span>,
      },
    ],
    kpis,
    chartConfig: {
      title: 'Payables by Aging Bucket',
      type: 'bar',
      data: chartData,
      series: [{ key: 'value', name: 'Outstanding', color: '#f97316' }],
    },
    detailFields: [
      { key: 'total', label: 'Total Owed', type: 'currency', isHero: true },
      { key: 'supplier_name', label: 'Supplier', icon: <Truck size={12} /> },
      { key: 'contact_person', label: 'Contact Person' },
      { key: 'phone', label: 'Phone', icon: <Phone size={12} /> },
      { key: 'CURRENT', label: 'Current (within terms)', type: 'currency' },
      { key: '1-30', label: '1-30 Days Overdue', type: 'currency' },
      { key: '31-60', label: '31-60 Days Overdue', type: 'currency' },
      { key: '61-90', label: '61-90 Days Overdue', type: 'currency' },
      { key: '91-120', label: '91-120 Days Overdue', type: 'currency' },
      { key: '120+', label: '120+ Days Overdue', type: 'currency' },
    ],
  };

  /* ------------------------------------------------------------------ *
   * Tab: Per-Bill detail (credit purchases)
   * ------------------------------------------------------------------ */
  const billTab = {
    id: 'AP_AGING_BILLS',
    label: 'Bill Detail',
    icon: <Receipt size={18} />,
    data: billAging.rows,
    loading,
    totals: { amount: billAging.total },
    columns: [
      {
        key: 'bill_ref', label: 'Bill Ref', sortable: true, width: 130,
        render: (val) => (
          <span className="font-mono text-[10px] bg-canvas px-2 py-0.5 rounded border border-black/5 uppercase font-bold">
            {val}
          </span>
        ),
      },
      {
        key: 'supplier_name', label: 'Supplier', sortable: true, width: 240,
        render: (val) => (
          <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span>
        ),
      },
      { key: 'date', label: 'Bill Date', type: 'date', sortable: true, width: 130 },
      {
        key: 'due_date', label: 'Due Date', type: 'date', sortable: true, width: 130,
        render: (val) => (
          <span className="text-[10px] font-bold text-gray-500">
            {val || '—'}
          </span>
        ),
      },
      {
        key: 'days_overdue', label: 'Days Overdue', align: 'right', sortable: true, width: 120,
        render: (val) => {
          if (!val || val <= 0) {
            return <span className="text-[10px] font-black text-emerald-500">WITHIN TERMS</span>;
          }
          return (
            <span className={`text-[10px] font-black ${val > 90 ? 'text-red-600' : val > 60 ? 'text-orange-500' : 'text-amber-500'}`}>
              {val} DAYS
            </span>
          );
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
      {
        key: 'amount', label: 'Amount Due', type: 'currency', align: 'right', sortable: true, width: 150,
        render: (val) => <span className="font-black">{formatINR(val)}</span>,
      },
    ],
    kpis,
    chartConfig: {
      title: 'Bill Aging Distribution',
      type: 'pie',
      data: chartData.filter((d) => d.value > 0),
    },
    detailFields: [
      { key: 'amount', label: 'Amount Due', type: 'currency', isHero: true },
      { key: 'bill_ref', label: 'Bill Reference', icon: <Receipt size={12} /> },
      { key: 'supplier_name', label: 'Supplier', icon: <Truck size={12} /> },
      { key: 'date', label: 'Bill Date', type: 'date', icon: <Calendar size={12} /> },
      { key: 'due_date', label: `Due (net-${DEFAULT_PAYMENT_TERMS_DAYS})`, type: 'date', icon: <Clock size={12} /> },
      { key: 'days_overdue', label: 'Days Past Due', icon: <AlertTriangle size={12} /> },
      { key: 'bucket', label: 'Aging Bucket' },
      { key: 'product_hint', label: 'Notes', icon: <Package size={12} /> },
    ],
  };

  // Only show bill-detail tab if we actually have credit bills
  const tabs = billAging.rows.length > 0 ? [summaryTab, billTab] : [summaryTab];

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */
  return (
    <div className="flex flex-col gap-4">
      {/* Payment-terms banner */}
      <div className="no-print flex items-center gap-2 px-3 py-2 rounded-2xl bg-amber-50/50 border border-black/5 shadow-sm">
        <Clock size={12} className="text-amber-600" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
          Aging computed from bill date + net-{DEFAULT_PAYMENT_TERMS_DAYS} terms.
          Add per-supplier <code className="font-mono">payment_terms_days</code> column later to override.
        </span>
      </div>

      <PremiumReportView title="Supplier Aging" tabs={tabs} />
    </div>
  );
};

export default APAgingReport;
