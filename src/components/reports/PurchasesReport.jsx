import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { Truck, Package, User, Calendar, Info, BarChart2 } from 'lucide-react';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const payBadge = (method) => {
  const m = (method || 'CASH').toUpperCase();
  const colors = {
    CASH:   'bg-emerald-50 text-emerald-700 border-emerald-100',
    CREDIT: 'bg-amber-50   text-amber-700   border-amber-100',
    BANK:   'bg-blue-50    text-blue-700    border-blue-100',
  };
  const cls = colors[m] || 'bg-gray-50 text-gray-500 border-gray-100';
  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${cls}`}>
      {m}
    </span>
  );
};

const statusBadge = (status) => {
  const s = (status || 'RECEIVED').toUpperCase();
  const cls = s === 'RECEIVED' || s === 'COMPLETED'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : s === 'PENDING'
    ? 'bg-amber-50 text-amber-700 border-amber-100'
    : 'bg-gray-50 text-gray-500 border-gray-100';
  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${cls}`}>
      {s}
    </span>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   PurchasesReport
   ════════════════════════════════════════════════════════════════════════════ */
const PurchasesReport = () => {
  const { data: purchases, loading } = useReportData({
    table: 'purchases',
    select: '*',
    dateColumn: 'date',
  });

  const { data: products } = useReportData({
    table: 'products',
    select: 'id, name',
  });

  /* ── Resolve product name ───────────────────────────────────────────── */
  const resolveName = (purchase) => {
    const pid = purchase.linked_product_id || purchase.product_id;
    if (!pid) return purchase.product_id || 'Unknown Product';
    const found = products.find(p => p.id === pid);
    return found?.name || purchase.product_id || pid;
  };

  /* ── 1. Overview metrics ─────────────────────────────────────────────── */
  const metrics = useMemo(() => {
    if (!purchases.length) return { total: 0, kpis: [], chartData: [] };

    const total      = purchases.reduce((s, p) => s + Number(p.total_amount || 0), 0);
    const totalUnits = purchases.reduce((s, p) => s + Number(p.quantity    || 0), 0);
    const suppliers  = [...new Set(purchases.map(p => p.supplier_name || 'Direct'))].length;
    const avgOrder   = purchases.length ? total / purchases.length : 0;

    const byDate = {};
    purchases.forEach(p => {
      const d = p.date || 'Unknown';
      if (!byDate[d]) byDate[d] = { name: d, amount: 0, units: 0 };
      byDate[d].amount += Number(p.total_amount || 0);
      byDate[d].units  += Number(p.quantity     || 0);
    });
    const chartData = Object.values(byDate).sort((a, b) => a.name.localeCompare(b.name));

    const kpis = [
      {
        id: 'proc', label: 'Total Procurement', value: total,
        trend: 0, trendDir: 'none', color: 'indigo',
        chartData: chartData.map(d => ({ value: d.amount })),
      },
      {
        id: 'supp', label: 'Unique Suppliers', value: suppliers,
        trend: 0, trendDir: 'none', color: 'emerald',
        chartData: chartData.map((_, i) => ({ value: i + 1 })),
      },
      {
        id: 'units', label: 'Units Procured', value: totalUnits,
        trend: 0, trendDir: 'none', color: 'amber',
        chartData: chartData.map(d => ({ value: d.units })),
      },
      {
        id: 'aop', label: 'Avg. Order Value', value: avgOrder,
        trend: 0, trendDir: 'none', color: 'rose',
        chartData: chartData.map(d => ({ value: d.amount })),
      },
    ];

    return { total, totalUnits, kpis, chartData };
  }, [purchases]);

  /* ── 2. By Supplier ─────────────────────────────────────────────────── */
  const supplierData = useMemo(() => {
    const map = {};
    purchases.forEach(p => {
      const s = p.supplier_name || 'Direct Procurement';
      if (!map[s]) map[s] = { _id: s, supplierName: s, supplierId: p.supplier_id, totalAmount: 0, totalUnits: 0, orderCount: 0 };
      map[s].totalAmount += Number(p.total_amount || 0);
      map[s].totalUnits  += Number(p.quantity     || 0);
      map[s].orderCount  += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map((s, i) => ({ ...s, _rank: i + 1 }));
  }, [purchases]);

  const totalProcForShare = metrics.total;

  /* ── 3. By Product ──────────────────────────────────────────────────── */
  const productData = useMemo(() => {
    const map = {};
    purchases.forEach(p => {
      const name = resolveName(p);
      const key  = p.linked_product_id || p.product_id || name;
      if (!map[key]) map[key] = { _id: key, productName: name, totalAmount: 0, totalUnits: 0, orderCount: 0, avgUnit: 0 };
      map[key].totalAmount += Number(p.total_amount || 0);
      map[key].totalUnits  += Number(p.quantity     || 0);
      map[key].orderCount  += 1;
    });
    return Object.values(map)
      .map(p => ({ ...p, avgUnit: p.totalUnits ? p.totalAmount / p.totalUnits : 0 }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map((p, i) => ({ ...p, _rank: i + 1 }));
  }, [purchases, products]);

  /* ══════════════════════════════════════════════════════════════════════
     TAB DEFINITIONS
     ══════════════════════════════════════════════════════════════════════ */

  /* ── Tab 1: All Purchases ─────────────────────────────────────────── */
  const allTab = {
    id: 'ALL_PURCHASES',
    label: 'All Purchases',
    icon: <Truck size={15} />,
    data: purchases,
    loading,
    totals: {
      total_amount: metrics.total,
      quantity: metrics.totalUnits,
    },
    kpis: metrics.kpis,
    chartConfig: {
      title: 'Procurement Value Over Time',
      type: 'area',
      data: metrics.chartData,
      series: [{ key: 'amount', name: 'Amount', color: '#6366f1' }],
    },
    columns: [
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: 130 },
      {
        key: 'supplier_name', label: 'Supplier', sortable: true, width: 200,
        render: (val) => (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <User size={10} className="text-blue-500" />
            </div>
            <span className="font-semibold text-ink-primary">{val || 'Direct'}</span>
          </div>
        ),
      },
      {
        key: '_productName', label: 'Product', width: 200, sortable: false,
        render: (_, row) => {
          const name = resolveName(row);
          return (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-accent-signature/10 flex items-center justify-center shrink-0">
                <Package size={9} className="text-accent-signature" />
              </div>
              <span className="font-semibold text-ink-primary">{name}</span>
            </div>
          );
        },
      },
      {
        key: 'quantity', label: 'Units', align: 'right', sortable: true, width: 90,
        render: (val) => <span className="font-mono font-bold text-ink-primary">{val}</span>,
      },
      { key: 'total_amount', label: 'Amount', type: 'currency', align: 'right', sortable: true, width: 140 },
      {
        key: 'payment_type', label: 'Method', width: 110, align: 'center',
        render: (val) => payBadge(val),
      },
      {
        key: 'status', label: 'Status', width: 120, align: 'center',
        render: (val) => statusBadge(val),
      },
    ],
    detailFields: [
      { key: 'total_amount', label: 'Procurement Amount', type: 'currency', isHero: true },
      { key: 'supplier_name', label: 'Supplier',          icon: <User size={12} /> },
      { key: 'date',          label: 'Purchase Date',     type: 'date', icon: <Calendar size={12} /> },
      { key: 'quantity',      label: 'Units Ordered',     icon: <Package size={12} /> },
      { key: 'payment_type',  label: 'Payment Method' },
      { key: 'status',        label: 'Status' },
      { key: 'notes',         label: 'Notes',             icon: <Info size={12} /> },
    ],
  };

  /* ── Tab 2: By Supplier ──────────────────────────────────────────────── */
  const supplierTab = {
    id: 'BY_SUPPLIER',
    label: 'By Supplier',
    icon: <User size={15} />,
    data: supplierData,
    loading,
    totals: { totalAmount: metrics.total, totalUnits: metrics.totalUnits },
    kpis: [
      {
        id: 'top_supp', label: 'Top Supplier Spend', value: supplierData[0]?.totalAmount || 0,
        trend: 0, trendDir: 'none', color: 'indigo',
        chartData: supplierData.slice(0, 7).map(s => ({ value: s.totalAmount })),
      },
      {
        id: 'supp_count', label: 'Suppliers', value: supplierData.length,
        trend: 0, trendDir: 'none', color: 'emerald',
        chartData: supplierData.slice(0, 7).map((_, i) => ({ value: i + 1 })),
      },
    ],
    chartConfig: {
      title: 'Spend by Supplier',
      type: 'bar',
      data: supplierData.slice(0, 8).map(s => ({ name: s.supplierName, value: s.totalAmount })),
      series: [{ key: 'value', name: 'Spend', color: '#6366f1' }],
    },
    columns: [
      {
        key: '_rank', label: '#', width: 50, align: 'center',
        render: (val) => (
          <span className={`font-black text-sm ${val === 1 ? 'text-amber-500' : 'text-ink-tertiary'}`}>
            {val}
          </span>
        ),
      },
      {
        key: 'supplierName', label: 'Supplier', sortable: true, width: 240,
        render: (val, row) => (
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-[11px] shrink-0 ${
              row._rank === 1 ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'
            }`}>
              {(val || 'D')[0].toUpperCase()}
            </div>
            <span className="font-bold text-ink-primary">{val}</span>
          </div>
        ),
      },
      {
        key: 'orderCount', label: 'Orders', align: 'right', sortable: true, width: 110,
        render: (val) => <span className="font-mono font-bold text-ink-secondary">{val}</span>,
      },
      {
        key: 'totalUnits', label: 'Units Received', align: 'right', sortable: true, width: 140,
        render: (val) => <span className="font-mono font-bold text-ink-primary">{val}</span>,
      },
      { key: 'totalAmount', label: 'Total Spend', type: 'currency', align: 'right', sortable: true, width: 150 },
      {
        key: '_share', label: 'Spend Share', align: 'right', width: 140,
        render: (_, row) => {
          const pct = totalProcForShare > 0 ? (row.totalAmount / totalProcForShare) * 100 : 0;
          return (
            <div className="flex items-center gap-2 justify-end">
              <div className="w-16 h-1.5 rounded-full bg-canvas overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <span className="text-[10px] font-black text-indigo-500 tabular-nums w-10 text-right">
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        },
      },
    ],
  };

  /* ── Tab 3: By Product ───────────────────────────────────────────────── */
  const productTab = {
    id: 'BY_PRODUCT',
    label: 'By Product',
    icon: <Package size={15} />,
    data: productData,
    loading,
    totals: { totalAmount: metrics.total, totalUnits: metrics.totalUnits },
    kpis: [
      {
        id: 'prod_count', label: 'Products Purchased', value: productData.length,
        trend: 0, trendDir: 'none', color: 'indigo',
        chartData: productData.slice(0, 7).map(p => ({ value: p.totalAmount })),
      },
      {
        id: 'top_prod', label: 'Top Product Spend', value: productData[0]?.totalAmount || 0,
        trend: 0, trendDir: 'none', color: 'amber',
        chartData: productData.slice(0, 7).map(p => ({ value: p.totalAmount })),
      },
    ],
    chartConfig: {
      title: 'Top Products by Procurement Value',
      type: 'bar',
      data: productData.slice(0, 10).map(p => ({ name: p.productName, value: p.totalAmount })),
      series: [{ key: 'value', name: 'Spend', color: '#10b981' }],
    },
    columns: [
      {
        key: '_rank', label: '#', width: 50, align: 'center',
        render: (val) => (
          <span className={`font-black text-sm ${val === 1 ? 'text-amber-500' : 'text-ink-tertiary'}`}>
            {val}
          </span>
        ),
      },
      {
        key: 'productName', label: 'Product', sortable: true, width: 250,
        render: (val, row) => (
          <div className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              row._rank <= 3 ? 'bg-emerald-50' : 'bg-canvas'
            }`}>
              <Package size={12} className={row._rank <= 3 ? 'text-emerald-600' : 'text-ink-tertiary'} />
            </div>
            <span className="font-bold text-ink-primary">{val}</span>
          </div>
        ),
      },
      {
        key: 'orderCount', label: 'Orders', align: 'right', sortable: true, width: 110,
        render: (val) => <span className="font-mono font-bold text-ink-secondary">{val}</span>,
      },
      {
        key: 'totalUnits', label: 'Units Procured', align: 'right', sortable: true, width: 140,
        render: (val) => <span className="font-mono font-bold text-ink-primary">{val}</span>,
      },
      { key: 'avgUnit',    label: 'Avg. Unit Cost', type: 'currency', align: 'right', width: 140 },
      { key: 'totalAmount', label: 'Total Spend',   type: 'currency', align: 'right', sortable: true, width: 150 },
      {
        key: '_share', label: 'Share', align: 'right', width: 130,
        render: (_, row) => {
          const pct = totalProcForShare > 0 ? (row.totalAmount / totalProcForShare) * 100 : 0;
          return (
            <div className="flex items-center gap-2 justify-end">
              <div className="w-14 h-1.5 rounded-full bg-canvas overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <span className="text-[10px] font-black text-emerald-600 tabular-nums w-9 text-right">
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        },
      },
    ],
  };

  return <ReportShell tabs={[allTab, supplierTab, productTab]} />;
};

export default PurchasesReport;
