import React, { useMemo } from 'react';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import { 
  Truck, Navigation, Fuel, Timer, MapPin, 
  Gauge, Download, Activity, Globe, TrendingUp
} from 'lucide-react';

const LogisticsReport = () => {
  // 1. Fetch Logistics Master Data
  const { data: sales, loading: salesLoading } = useReportData({
    table: 'sales',
    select: 'totalAmount, vehicleId, routeId',
    dateColumn: 'date'
  });

  const { data: vehicles, loading: vehiclesLoading } = useReportData({
    table: 'vehicles',
    select: '*',
    dateColumn: 'created_at'
  });

  const { data: routes, loading: routesLoading } = useReportData({
    table: 'routes',
    select: '*'
  });

  const loading = salesLoading || vehiclesLoading || routesLoading;

  // 2. Process Fleet Metrics
  const fleetMetrics = useMemo(() => {
    if (!vehicles.length) return { utilization: 0, performance: [], kpis: [] };

    const activeVehicleIds = new Set(sales.filter(s => s.vehicleId).map(s => s.vehicleId));
    const activeCount = activeVehicleIds.size;
    const utilization = (activeCount / vehicles.length) * 100;

    const performanceMap = vehicles.map(v => {
      const vSales = sales.filter(s => s.vehicleId === v.id);
      return {
        id: v.id,
        name: v.plateNumber || v.model || 'Unknown',
        model: v.model,
        revenue: vSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0),
        deliveries: vSales.length
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const kpis = [
      { id: 'util', label: 'Fleet Utilization', value: `${utilization.toFixed(1)}%`, trend: 2, trendDir: 'up', color: 'indigo', chartData: [{ value: 60 }, { value: 70 }, { value: utilization }] },
      { id: 'active', label: 'Active Units', value: activeCount, trend: 0, trendDir: 'none', color: 'emerald', chartData: [] }
    ];

    return { utilization, performance: performanceMap, kpis };
  }, [vehicles, sales]);

  // 3. Process Route Metrics
  const routeMetrics = useMemo(() => {
    const routeStats = routes.map(r => {
      const rSales = sales.filter(s => s.routeId === r.id);
      return {
        id: r.id,
        name: r.name || 'Unknown Route',
        revenue: rSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0),
        deliveries: rSales.length
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const kpis = [
      { id: 'top_route', label: 'Primary Route Rev', value: routeStats[0]?.revenue || 0, trend: 0.5, trendDir: 'up', color: 'amber', chartData: [] },
      { id: 'total_drops', label: 'Total Drops', value: sales.filter(s => s.routeId).length, trend: 0, trendDir: 'none', color: 'rose', chartData: [] }
    ];

    return { routeStats, kpis };
  }, [routes, sales]);

  // 4. Tab Definitions
  const fleetTab = {
    id: 'FLEET_PERFORMANCE',
    label: 'Fleet Deployment',
    icon: <Truck size={18} />,
    data: fleetMetrics.performance,
    loading: loading,
    totals: { revenue: fleetMetrics.performance.reduce((acc, p) => acc + p.revenue, 0) },
    columns: [
      { key: 'name', label: 'Authorized Unit', sortable: true, width: 220, render: (val, row) => (
        <div className="flex flex-col">
          <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span>
          <span className="text-[10px] font-bold text-gray-400 font-mono">{row.model}</span>
        </div>
      )},
      { key: 'deliveries', label: 'Service Events', align: 'right', sortable: true, width: 150, render: (val) => <span className="font-mono font-bold text-gray-400">{val} Drops</span> },
      { key: 'revenue', label: 'Revenue Magnitude', type: 'currency', align: 'right', sortable: true, width: 180 },
      { key: 'efficiency', label: 'Load Factor', align: 'right', width: 120, render: (_, row) => (
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-black text-emerald-500">{(row.revenue / (row.deliveries || 1)).toFixed(0)} / DROP</span>
        </div>
      )}
    ],
    kpis: fleetMetrics.kpis,
    chartConfig: { 
      title: "Revenue by vehicle node", type: 'bar', data: fleetMetrics.performance.slice(0, 10).map(v => ({ name: v.name, value: v.revenue })),
      series: [{ key: 'value', name: 'Revenue Contribution', color: '#6366f1' }] 
    }
  };

  const routeTab = {
    id: 'ROUTE_EFFICIENCY',
    label: 'Regional Coverage',
    icon: <Globe size={18} />,
    data: routeMetrics.routeStats,
    loading: loading,
    totals: { revenue: routeMetrics.routeStats.reduce((acc, r) => acc + r.revenue, 0) },
    columns: [
      { key: 'name', label: 'Territory Domain', sortable: true, width: 250, render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span> },
      { key: 'deliveries', label: 'Volume', align: 'right', sortable: true, width: 150 },
      { key: 'revenue', label: 'Account Yield', type: 'currency', align: 'right', sortable: true, width: 180 },
      { key: 'density', label: 'Territory Density', align: 'right', width: 120, render: (_, row) => (
        <div className="w-16 h-1 bg-canvas rounded-full overflow-hidden">
          <div className="h-full bg-accent-signature" style={{ width: `${Math.min((row.deliveries / 20) * 100, 100)}%` }} />
        </div>
      )}
    ],
    kpis: routeMetrics.kpis,
    chartConfig: { 
      title: "Delivery distribution by territory", type: 'pie', data: routeMetrics.routeStats.map(r => ({ name: r.name, value: r.deliveries }))
    }
  };

  return <ReportShell tabs={[fleetTab, routeTab]} />;
};

export default LogisticsReport;
