import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { Truck, Package, DollarSign, Calendar, Info, Tag, User } from 'lucide-react';

const PurchasesReport = () => {
  const { data: rawData, loading } = useReportData({
    table: 'purchases',
    select: '*',
    dateColumn: 'date'
  });

  const metrics = useMemo(() => {
    if (!rawData.length) return { total: 0, kpis: [], chartData: [] };
    const total = rawData.reduce((acc, p) => acc + (p.total_amount || 0), 0);
    const suppliers = [...new Set(rawData.map(p => p.supplier_name))].length;
    
    const supplierMap = rawData.reduce((acc, p) => {
      const s = p.supplier_name || 'Direct Procurement';
      acc[s] = (acc[s] || 0) + (p.total_amount || 0);
      return acc;
    }, {});

    const chartData = Object.entries(supplierMap).map(([name, value]) => ({ name, value })).slice(0, 5);

    const kpis = [
      { id: 'proc', label: 'Total Procurement', value: total, trend: 4.2, trendDir: 'up', color: 'indigo', chartData: chartData.map(d => ({ value: d.value })) },
      { id: 'supp', label: 'Unique Suppliers', value: suppliers, trend: 1, trendDir: 'none', color: 'emerald', chartData: [{ value: 2 }, { value: suppliers }] },
      { id: 'unit', label: 'Items Procured', value: rawData.reduce((acc, p) => acc + (p.quantity || 0), 0), trend: 12, trendDir: 'up', color: 'amber', chartData: chartData.map(d => ({ value: d.value / 10 })) }
    ];

    return { total, kpis, chartData };
  }, [rawData]);

  const purchaseTab = {
    id: 'PURCHASES',
    label: 'Purchases',
    icon: <Truck size={18} />,
    data: rawData,
    loading: loading,
    totals: { total_amount: metrics.total, quantity: rawData.reduce((acc, p) => acc + (p.quantity || 0), 0) },
    columns: [
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: 140 },
      { key: 'supplier_name', label: 'Supplier Entity', sortable: true, width: 220 },
      { key: 'product_id', label: 'Product Node', width: 180, render: (val) => <span className="font-mono text-[10px] uppercase">{val || 'BATCH-ITEM'}</span> },
      { key: 'quantity', label: 'Volume', align: 'right', width: 100 },
      { key: 'total_amount', label: 'Gross Amount', type: 'currency', align: 'right', sortable: true, width: 160 },
      { key: 'payment_type', label: 'Payment Method', width: 140, render: (val) => <span className="text-[10px] font-black uppercase text-gray-400">{val || 'CASH'}</span> }
    ],
    kpis: metrics.kpis,
    chartConfig: { title: "Procurement Distribution by Supplier", type: 'pie', data: metrics.chartData },
    detailFields: [
      { key: 'total_amount', label: 'Procurement magnitude', type: 'currency', isHero: true },
      { key: 'supplier_name', label: 'Entity Profile', icon: <User size={12} /> },
      { key: 'date', label: 'Logistics Date', type: 'date', icon: <Calendar size={12} /> },
      { key: 'notes', label: 'Operational Note', icon: <Info size={12} /> }
    ]
  };

  return <ReportShell tabs={[purchaseTab]} />;
};

export default PurchasesReport;
