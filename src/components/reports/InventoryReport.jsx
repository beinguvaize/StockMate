import React, { useMemo, useState } from 'react';
import { isCountableSale } from './reportUtils';
import useReportData from './useReportData';
import useDateWindow from './useDateWindow';
import PremiumReportView from './PremiumReportView';
import { parseLocalDate } from '../../lib/utils';
import { 
  Package, Smartphone, Layers, AlertCircle, TrendingUp, 
  DollarSign, Tag, Info, ArrowRight, ShieldAlert, Archive
} from 'lucide-react';

const InventoryReport = () => {
  // Financial year to date by default. These queries were previously
  // unfiltered and read the whole table on every load.
  const win = useDateWindow('YEAR');
  // 1. Fetch Master Data (Products & Sales for context)
  const { data: products, loading: productsLoading } = useReportData({
    table: 'products',
    select: '*',
    dateColumn: 'created_at', filters: win.filters
  });

  const { data: salesRaw, loading: salesLoading } = useReportData({
    table: 'sales',
    select: 'date, items, voided_at, status, paymentStatus',
    dateColumn: 'date', filters: win.filters
  });
  // Voided and cancelled sales are not revenue and were being counted here.
  const sales = useMemo(() => (salesRaw || []).filter(isCountableSale), [salesRaw]);

  // How much of the valuation rests on a supplier bill, and how much on a guess.
  //
  // Value is stock x costPrice, which says nothing about where that cost came
  // from. Rs 113,370 of Rs 483,717 here does not come from a bill: a reconcile
  // on 15 July created OPENING batches for stock the system held with no cost
  // behind it and estimated a rate, and adjustments carry the last known cost
  // rather than a paid one. HM Cover 10 is the clearest -- 149 units,
  // Rs 16,688, never purchased and never sold, sitting in the table looking
  // exactly like the variants beside it that were genuinely bought.
  //
  // It matters past this page: an estimated cost becomes COGS the moment those
  // units sell, so the margin inherits the guess. The batches record it in
  // cost_basis; nothing surfaced it.
  const { data: batchRows } = useReportData({
    table: 'product_batches',
    select: 'product_id, qty_remaining, unit_cost, cost_basis',
    dateColumn: 'received_date',
  });

  const evidence = useMemo(() => {
    // Only stock still on hand: a consumed batch's basis no longer affects it.
    const live = (batchRows || []).filter(b => Number(b.qty_remaining) > 0);
    if (!live.length) return null;
    let billed = 0, estimated = 0;
    live.forEach(b => {
      const v = Number(b.qty_remaining || 0) * Number(b.unit_cost || 0);
      if (String(b.cost_basis || '').toUpperCase() === 'SUPPLIER_BILL') billed += v;
      else estimated += v;
    });
    const total = billed + estimated;
    return { billed, estimated, total, pct: total > 0 ? (estimated / total) * 100 : 0 };
  }, [batchRows]);

  const loading = productsLoading || salesLoading;

  // 2. Process Valuation Metrics
  const valuationMetrics = useMemo(() => {
    if (!products.length) return { totalCost: 0, totalPotential: 0, lowStock: 0, chartData: [], kpis: [] };

    const totalCost = products.reduce((acc, p) => acc + ((p.stock || 0) * (p.costPrice || 0)), 0);
    // Raw materials are manufactured with, not sold, so they carry no selling
    // price. Counting their cost against zero revenue made projected profit
    // read as a loss — three RAW items held Rs 83,994 against Rs 0 of retail.
    // Potential and profit are measured over sellable stock only; totalCost
    // still covers everything on hand.
    const isRaw = (p) => (p.product_type || 'STANDARD').toUpperCase() === 'RAW';
    const sellable = products.filter(p => !isRaw(p));
    const sellableCost = sellable.reduce((acc, p) => acc + ((p.stock || 0) * (p.costPrice || 0)), 0);
    const totalPotential = sellable.reduce((acc, p) => acc + ((p.stock || 0) * (p.sellingPrice || 0)), 0);
    const totalProfit = totalPotential - sellableCost;
    const lowStockItems = products.filter(p => (p.stock || 0) <= (p.lowStockThreshold || 5));
    const lowStockCount = lowStockItems.length;

    const categoryMap = products.reduce((acc, p) => {
      const cat = p.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = 0;
      acc[cat] += (p.stock || 0) * (p.costPrice || 0);
      return acc;
    }, {});

    const chartData = Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const kpis = [
      { id: 'val', label: 'Stock Value', value: totalCost, trend: 0, trendDir: 'none', color: 'indigo', chartData: chartData.map(d => ({ value: d.value })) },
      { id: 'rev', label: 'Potential Revenue', value: totalPotential, trend: 0, trendDir: 'none', color: 'emerald', chartData: chartData.map(d => ({ value: d.value * 1.2 })) },
      { id: 'prof', label: 'Projected Profit', value: totalProfit, trend: 0, trendDir: 'none', color: 'amber', chartData: chartData.map(d => ({ value: d.value * 0.2 })) },
      { id: 'low', label: 'Stock Alerts', value: lowStockCount, trend: lowStockCount > 10 ? 15 : 0, trendDir: lowStockCount > 10 ? 'up' : 'none', color: 'rose', chartData: [{ value: 10 }, { value: 15 }, { value: 8 }, { value: lowStockCount }] }
    ];

    return { totalCost, totalPotential, lowStockCount, chartData, kpis };
  }, [products]);

  // 3. Process Dead Stock Metrics
  const deadStockData = useMemo(() => {
    // Current logic defines "Dead Stock" as products with stock > 0 but NO sales in 30+ days
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(now.getDate() - 30); // Default 30 days

    const deadItems = products.filter(p => {
      if ((p.stock || 0) <= 0) return false;
      const hasSales = sales.some(s => {
        const isRecent = parseLocalDate(s.date) >= thresholdDate;
        const includesProduct = s.items?.some(item => item.productId === p.id || item.id === p.id);
        return isRecent && includesProduct;
      });
      return !hasSales;
    }).sort((a, b) => (b.stock * b.costPrice) - (a.stock * a.costPrice));

    const totalDeadValue = deadItems.reduce((acc, p) => acc + (p.stock * p.costPrice), 0);
    const affectedSkus = deadItems.length;

    const kpis = [
      { id: 'dead_val', label: 'Frozen Capital', value: totalDeadValue, trend: 0, trendDir: 'none', color: 'rose', chartData: [{ value: 100 }, { value: 150 }, { value: 130 }, { value: totalDeadValue }] },
      { id: 'skus', label: 'Idle SKUs', value: affectedSkus, trend: 0, trendDir: 'none', color: 'orange', chartData: [{ value: 20 }, { value: 25 }, { value: 22 }, { value: affectedSkus }] },
    ];

    return { deadItems, totalDeadValue, affectedSkus, kpis };
  }, [products, sales]);

  // 4. Tab Definitions
  const valuationTab = {
    id: 'INVENTORY_VALUATION',
    label: 'Valuation Audit',
    icon: <Layers size={18} />,
    data: products,
    loading: loading,
    totals: { 
      totalCost: valuationMetrics.totalCost,
      potentialRev: valuationMetrics.totalPotential,
      profit: valuationMetrics.totalPotential - valuationMetrics.totalCost
    },
    columns: [
      { key: 'sku', label: 'SKU', sortable: true, width: 120, render: (val) => <span className="tabular-nums text-[10px] bg-canvas px-2 py-0.5 rounded border border-border/60 uppercase font-semibold">{val || 'N/A'}</span> },
      { key: 'name', label: 'Product Name', sortable: true, width: 250 },
      { key: 'category', label: 'Category', sortable: true, width: 140, render: (val) => <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-widest">{val || 'GENERAL'}</span> },
      { key: 'stock', label: 'Quantity', align: 'right', sortable: true, width: 100, render: (val, row) => (
        <span className={`font-semibold ${val <= (row.lowStockThreshold || 5) ? 'text-red-500' : 'text-emerald-600'}`}>
          {val} {row.unit || 'pcs'}
        </span>
      )},
      { key: 'costPrice', label: 'Unit Cost', type: 'currency', align: 'right', sortable: true, width: 130 },
      { key: 'totalCost', label: 'Value (Cost)', align: 'right', sortable: true, width: 150,
        render: (_, row) => {
          const v = (row.stock || 0) * (row.costPrice || 0);
          return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } },
      { key: 'sellingPrice', label: 'Sell Price', type: 'currency', align: 'right', width: 130 },
      { key: 'profit', label: 'Projected Profit', align: 'right', width: 150,
        render: (_, row) => {
          const v = (row.stock || 0) * ((row.sellingPrice || 0) - (row.costPrice || 0));
          const cls = v >= 0 ? 'text-emerald-600' : 'text-red-500';
          const txt = '₹' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return <span className={cls}>{v < 0 ? '−' : ''}{txt}</span>;
        } }
    ],
    kpis: valuationMetrics.kpis,
    chartConfig: { title: "Asset distribution by category", type: 'pie', data: valuationMetrics.chartData },
    detailFields: [
      { key: 'costPrice', label: 'Acquisition Cost', type: 'currency', isHero: true },
      { key: 'name', label: 'Full Nomenclature', icon: <Package size={12} /> },
      { key: 'sku', label: 'Stock Keeping Unit', icon: <Tag size={12} /> },
      { key: 'stock', label: 'Current Inventory', render: (val, row) => `${val} ${row.unit || 'units'}` },
      { key: 'sellingPrice', label: 'Market Listing Price', type: 'currency' }
    ]
  };

  const deadStockTab = {
    id: 'DEAD_STOCK',
    label: 'Dead Stock Index',
    icon: <Archive size={18} />,
    data: deadStockData.deadItems,
    loading: loading,
    totals: { totalCost: deadStockData.totalDeadValue },
    columns: [
      { key: 'name', label: 'Unproductive Asset', sortable: true, width: 250, render: (val, row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-foreground uppercase tracking-tight">{val}</span>
          <span className="text-[10px] font-semibold text-red-400 tabular-nums">{row.sku}</span>
        </div>
      )},
      { key: 'category', label: 'Category', width: 140 },
      { key: 'stock', label: 'Dormant Units', align: 'right', width: 120, render: (val) => <span className="tabular-nums text-red-500 font-semibold">{val} Units</span> },
      { key: 'costPrice', label: 'Frozen Value', align: 'right', width: 150,
        render: (val, row) => '₹' + ((val || 0) * (row.stock || 0))
          .toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
      { key: 'action', label: 'Action', width: 150, render: () => (
        <button className="flex items-center gap-2 px-4 py-1.5 bg-red-50 text-red-600 rounded-full text-[9px] font-semibold hover:bg-red-600 hover:text-white transition-all uppercase tracking-widest border border-red-100">
          Liquidate <ArrowRight size={12} />
        </button>
      )}
    ],
    kpis: deadStockData.kpis,
    chartConfig: { 
      title: "Dead value by category", 
      type: 'bar', 
      data: Object.entries(deadStockData.deadItems.reduce((acc, p) => {
        const cat = p.category || 'Uncategorized';
        acc[cat] = (acc[cat] || 0) + (p.stock * p.costPrice);
        return acc;
      }, {})).map(([name, value]) => ({ name, value })),
      series: [{ key: 'value', name: 'Frozen Capital', color: '#f43f5e' }]
    },
    detailFields: [
      { key: 'costPrice', label: 'Frozen value', type: 'currency', isHero: true, render: (val, row) => val * row.stock },
      { key: 'name', label: 'Stagnant Product', icon: <ShieldAlert size={12} /> },
      { key: 'stock', label: 'Idle Inventory Count' },
      { key: 'last_sale', label: 'Last Transaction', type: 'date', icon: <Info size={12} />, render: () => 'N/A (>30 Days)' }
    ]
  };

  const money = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  return (
    <div className="flex flex-col gap-3">
      {/* A cost from a supplier bill and a cost somebody estimated look
          identical in the table below. This says which is which. */}
      {evidence && evidence.estimated > 0 && (
        <div className="rounded-[10px] border border-border/60 bg-card p-4">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              What this value rests on
            </span>
            <span className="text-[11px] font-semibold text-amber-700">
              {evidence.pct.toFixed(0)}% not from a supplier bill
            </span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted mb-2">
            <div className="bg-emerald-600" style={{ width: `${100 - evidence.pct}%` }} />
            <div className="bg-amber-500" style={{ width: `${evidence.pct}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
            <span><b className="tabular-nums">{money(evidence.billed)}</b>{' '}
              <span className="text-muted-foreground">from supplier bills</span></span>
            <span><b className="tabular-nums text-amber-700">{money(evidence.estimated)}</b>{' '}
              <span className="text-muted-foreground">estimated or last-known</span></span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Estimated cost becomes cost of goods sold as soon as those units sell, so the
            margin carries the same uncertainty. Counting the shelf on the largest of them
            is what turns a guess into a figure.
          </p>
        </div>
      )}
      <PremiumReportView dateWindow={win} title="Inventory Report" tabs={[valuationTab, deadStockTab]} />
    </div>
  );
};

export default InventoryReport;
