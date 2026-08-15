import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { Package, Smartphone, Layers, AlertCircle, TrendingUp, DollarSign, Tag, Info } from 'lucide-react';

const InventoryValuationReport = () => {
  // 1. Fetch Inventory Data (Rule 11)
  const { data: rawData, loading, error, lastUpdated } = useReportData({
    table: 'products',
    select: '*',
    dateColumn: 'created_at' // Primary date for inventory records
  });

  // How much of the valuation rests on a supplier bill, and how much on a guess.
  //
  // The value above is stock x costPrice, which says nothing about where that
  // cost came from. Roughly a fifth of it does not come from a bill at all: a
  // reconcile on 15 July created OPENING batches for stock the system held with
  // no cost behind it and estimated a rate, and stock adjustments carry the last
  // known cost rather than a paid one. HM Cover 10 is the clearest case -- 149
  // units, Rs 16,688 of value, never purchased.
  //
  // That matters beyond the stock page: an estimated cost flows into COGS the
  // moment those units sell, so the margin inherits the guess. The batches
  // record it honestly in cost_basis; nothing surfaced it.
  const { data: batchRows } = useReportData({
    table: 'product_batches',
    select: 'product_id, qty_remaining, unit_cost, origin, cost_basis',
    dateColumn: 'received_date',
  });

  const evidence = useMemo(() => {
    const live = (batchRows || []).filter(b => Number(b.qty_remaining) > 0);
    if (!live.length) return null;
    let billed = 0, estimated = 0;
    const shakyProducts = {};
    live.forEach(b => {
      const v = Number(b.qty_remaining || 0) * Number(b.unit_cost || 0);
      if (String(b.cost_basis || '').toUpperCase() === 'SUPPLIER_BILL') {
        billed += v;
      } else {
        estimated += v;
        shakyProducts[b.product_id] = (shakyProducts[b.product_id] || 0) + v;
      }
    });
    const total = billed + estimated;
    return {
      billed, estimated, total,
      pct: total > 0 ? (estimated / total) * 100 : 0,
      worst: Object.entries(shakyProducts).sort((a, b) => b[1] - a[1]).slice(0, 3),
    };
  }, [batchRows]);

  // 2. Process Inventory Metrics (Rule 4)
  const metrics = useMemo(() => {
    if (!rawData.length) return { totalCost: 0, totalPotential: 0, lowStock: 0, chartData: [], kpis: [] };

    const totalCost = rawData.reduce((acc, p) => acc + ((p.stock || 0) * (p.costPrice || 0)), 0);
    // Raw materials are manufactured with, not sold, so they carry no selling
    // price. Counting their cost against zero revenue made projected profit
    // read as a loss — three RAW items held Rs 83,994 against Rs 0 of retail.
    // Potential and profit are measured over sellable stock only; totalCost
    // still covers everything on hand.
    const isRaw = (p) => (p.product_type || 'STANDARD').toUpperCase() === 'RAW';
    const sellable = rawData.filter(p => !isRaw(p));
    const sellableCost = sellable.reduce((acc, p) => acc + ((p.stock || 0) * (p.costPrice || 0)), 0);
    const totalPotential = sellable.reduce((acc, p) => acc + ((p.stock || 0) * (p.sellingPrice || 0)), 0);
    const totalProfit = totalPotential - sellableCost;
    const lowStockItems = rawData.filter(p => (p.stock || 0) <= (p.lowStockThreshold || 5));
    const lowStockCount = lowStockItems.length;

    // Group by Category for Pie Chart
    const categoryMap = rawData.reduce((acc, p) => {
      const cat = p.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = 0;
      acc[cat] += (p.stock || 0) * (p.costPrice || 0);
      return acc;
    }, {});

    const chartData = Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const kpis = [
      { 
        id: 'val', 
        label: 'Total Stock Value', 
        value: totalCost, 
        trend: 0, 
        trendDir: 'none', 
        chartData: chartData.map(d => ({ value: d.value })),
        color: 'indigo'
      },
      { 
        id: 'rev', 
        label: 'Potential Revenue', 
        value: totalPotential, 
        trend: 0, 
        trendDir: 'none', 
        chartData: chartData.map(d => ({ value: d.value * 1.2 })),
        color: 'emerald'
      },
      { 
        id: 'prof', 
        label: 'Projected Profit', 
        value: totalProfit, 
        trend: 0, 
        trendDir: 'none', 
        chartData: chartData.map(d => ({ value: d.value * 0.2 })),
        color: 'amber'
      },
      { 
        id: 'low', 
        label: 'Stock Alerts', 
        value: lowStockCount, 
        trend: lowStockCount > 10 ? 15 : 0, 
        trendDir: lowStockCount > 10 ? 'up' : 'none', 
        chartData: [{ value: 10 }, { value: 15 }, { value: 8 }, { value: lowStockCount }],
        color: 'rose'
      }
    ];

    return { totalCost, totalPotential, lowStockCount, chartData, kpis };
  }, [rawData]);

  // 3. Define Table Columns (Rule 2)
  const columns = [
    { key: 'sku', label: 'SKU', sortable: true, width: 120, render: (val) => <span className="tabular-nums text-[10px] bg-canvas px-2 py-0.5 rounded border border-border/60 uppercase">{val || 'N/A'}</span> },
    { key: 'name', label: 'Product Name', sortable: true, width: 250 },
    { key: 'category', label: 'Category', sortable: true, width: 140, render: (val) => <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-widest">{val || 'GENERAL'}</span> },
    { key: 'stock', label: 'Quantity', align: 'right', sortable: true, width: 100, render: (val, row) => (
      <span className={`font-semibold ${val <= (row.lowStockThreshold || 5) ? 'text-red-500' : 'text-emerald-600'}`}>
        {val} {row.unit || 'pcs'}
      </span>
    )},
    { key: 'costPrice', label: 'Unit Cost', type: 'currency', align: 'right', sortable: true, width: 130 },
    { key: 'totalCost', label: 'Value (Cost)', type: 'currency', align: 'right', sortable: true, width: 150, render: (_, row) => (row.stock * row.costPrice) },
    { key: 'sellingPrice', label: 'Sell Price', type: 'currency', align: 'right', width: 130 },
    { key: 'potentialRev', label: 'Valuation', type: 'currency', align: 'right', width: 150, render: (_, row) => (row.stock * row.sellingPrice) },
    { key: 'profit', label: 'Projected Profit', type: 'currency', align: 'right', width: 150, render: (_, row) => (row.stock * (row.sellingPrice - row.costPrice)) },
    { key: 'margin', label: 'Margin %', align: 'right', width: 100, render: (_, row) => {
      const p = row.sellingPrice - row.costPrice;
      const m = (p / row.sellingPrice) * 100;
      return <span className={`font-semibold ${m > 25 ? 'text-emerald-600' : 'text-accent-signature'}`}>{m.toFixed(1)}%</span>;
    }}
  ];

  // 4. Detail Panel Configuration (Rule 9)
  const detailFields = [
    { key: 'totalValue', label: 'Total Stock Value', type: 'currency', isHero: true, render: (_, row) => (row.stock * row.costPrice) },
    { key: 'name', label: 'Product Nomenclature', icon: <Package size={12} /> },
    { key: 'sku', label: 'Batch ID / SKU', icon: <Tag size={12} /> },
    { key: 'stock', label: 'On-Hand Inventory', render: (val, row) => `${val} ${row.unit || 'units'}` },
    { key: 'costPrice', label: 'Unit Acquisition Cost', type: 'currency' },
    { key: 'sellingPrice', label: 'Market Resell Price', type: 'currency' },
    { key: 'lowStockThreshold', label: 'Replenish Threshold', icon: <AlertCircle size={12} /> }
  ];

  const totals = useMemo(() => {
    if (!rawData.length) return null;
    return {
      stock: rawData.reduce((acc, p) => acc + (p.stock || 0), 0),
      totalCost: rawData.reduce((acc, p) => acc + ((p.stock || 0) * (p.costPrice || 0)), 0),
      potentialRev: rawData.reduce((acc, p) => acc + ((p.stock || 0) * (p.sellingPrice || 0)), 0),
      profit: rawData.reduce((acc, p) => acc + ((p.stock || 0) * (p.sellingPrice - p.costPrice)), 0)
    };
  }, [rawData]);

  const inventoryTab = {
    id: 'INVENTORY_VALUATION',
    label: 'Inventory Valuation',
    icon: <Layers size={18} />,
    data: rawData,
    loading: loading,
    totals: totals,
    columns: columns,
    kpis: metrics.kpis,
    chartConfig: {
      title: "Asset Distribution by Category",
      type: 'pie',
      data: metrics.chartData
    },
    detailFields: detailFields,
    filterConfig: [
      { key: 'category', label: 'Department', options: [...new Set(rawData.map(p => p.category))].filter(Boolean).map(c => ({ value: c, label: c })) },
      { key: 'unit', label: 'Unit Type', options: [{ value: 'pcs', label: 'Pieces' }, { value: 'kg', label: 'Kilograms' }, { value: 'box', label: 'Boxes' }] }
    ]
  };

  const money = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  return (
    <div className="flex flex-col gap-3">
      {/* What the valuation is actually built on. A cost that came from a
          supplier bill and a cost somebody estimated look identical in the
          table below, and the estimated part flows into COGS the moment those
          units sell. */}
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
      <ReportShell tabs={[inventoryTab]} />
    </div>
  );
};

export default InventoryValuationReport;
