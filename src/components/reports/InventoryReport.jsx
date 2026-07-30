import React, { useMemo, useState } from 'react';
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

  const { data: sales, loading: salesLoading } = useReportData({
    table: 'sales',
    select: 'date, items',
    dateColumn: 'date', filters: win.filters
  });

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

  return <PremiumReportView dateWindow={win} title="Inventory Report" tabs={[valuationTab, deadStockTab]} />;
};

export default InventoryReport;
