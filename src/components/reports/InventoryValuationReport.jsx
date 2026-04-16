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

  // 2. Process Inventory Metrics (Rule 4)
  const metrics = useMemo(() => {
    if (!rawData.length) return { totalCost: 0, totalPotential: 0, lowStock: 0, chartData: [], kpis: [] };

    const totalCost = rawData.reduce((acc, p) => acc + ((p.stock || 0) * (p.costPrice || 0)), 0);
    const totalPotential = rawData.reduce((acc, p) => acc + ((p.stock || 0) * (p.sellingPrice || 0)), 0);
    const totalProfit = totalPotential - totalCost;
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
        trend: 5.4, 
        trendDir: 'up', 
        chartData: chartData.map(d => ({ value: d.value })),
        color: 'indigo'
      },
      { 
        id: 'rev', 
        label: 'Potential Revenue', 
        value: totalPotential, 
        trend: 3.2, 
        trendDir: 'up', 
        chartData: chartData.map(d => ({ value: d.value * 1.2 })),
        color: 'emerald'
      },
      { 
        id: 'prof', 
        label: 'Projected Profit', 
        value: totalProfit, 
        trend: 1.8, 
        trendDir: 'down', 
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
    { key: 'sku', label: 'SKU', sortable: true, width: 120, render: (val) => <span className="font-mono text-[10px] bg-canvas px-2 py-0.5 rounded border border-black/5 uppercase">{val || 'N/A'}</span> },
    { key: 'name', label: 'Product Name', sortable: true, width: 250 },
    { key: 'category', label: 'Category', sortable: true, width: 140, render: (val) => <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{val || 'GENERAL'}</span> },
    { key: 'stock', label: 'Quantity', align: 'right', sortable: true, width: 100, render: (val, row) => (
      <span className={`font-black ${val <= (row.lowStockThreshold || 5) ? 'text-red-500' : 'text-emerald-600'}`}>
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
      return <span className={`font-black ${m > 25 ? 'text-emerald-600' : 'text-amber-600'}`}>{m.toFixed(1)}%</span>;
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

  return <ReportShell tabs={[inventoryTab]} />;
};

export default InventoryValuationReport;
