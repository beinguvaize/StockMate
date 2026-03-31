import React, { useMemo} from 'react';
import { 
 ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
 Tooltip, Legend, Cell, PieChart, Pie
} from 'recharts';
import { Truck, Navigation, Fuel, Timer, MapPin, Gauge, Download} from 'lucide-react';
import { downloadCSV} from '../../utils/csvExport';

const LogisticsReports = ({ sales, vehicles, routes, businessProfile}) => {
 
 // 5a. Vehicle Performance (Sales per Vehicle)
 const vehiclePerformance = useMemo(() => {
 const stats = {};
 sales.forEach(s => {
 if (!s.vehicleId) return;
 const v = vehicles.find(veh => veh.id === s.vehicleId);
 const name = v?.plateNumber || v?.model || 'Unknown Vehicle';
 if (!stats[s.vehicleId]) stats[s.vehicleId] = { name, revenue: 0, deliveries: 0};
 stats[s.vehicleId].revenue += s.total || 0;
 stats[s.vehicleId].deliveries += 1;
});
 return Object.values(stats).sort((a, b) => b.revenue - a.revenue);
}, [sales, vehicles]);

 // 5b. Route Efficiency (Sales per Route)
 const routeStats = useMemo(() => {
 const stats = {};
 sales.forEach(s => {
 if (!s.routeId) return;
 const r = routes.find(rt => rt.id === s.routeId);
 const name = r?.name || 'Unknown Route';
 if (!stats[s.routeId]) stats[s.routeId] = { name, revenue: 0, deliveries: 0};
 stats[s.routeId].revenue += s.total || 0;
 stats[s.routeId].deliveries += 1;
});
 return Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
}, [sales, routes]);

 const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];

 return (
 <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  {/* Logistics Premium Ribbon */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
    {/* Fleet Utilization Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-ink-primary">
        <Truck size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Fleet Utilization</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          {new Set(sales.filter(s => s.vehicleId).map(s => s.vehicleId)).size} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">/ {vehicles.length}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-400 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">Active vs Total Fleet</span>
        </div>
      </div>
    </div>

    {/* Delivery Volume Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-accent-signature-hover">
        <Navigation size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Delivery Volume</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          {sales.filter(s => s.vehicleId).length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">UNITS</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-400 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">Logistics Events Optimized</span>
        </div>
      </div>
    </div>

    {/* Top Route Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-purple-500">
        <MapPin size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Top Route Revenue</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile.currencySymbol}</span>
          {Math.round(routeStats[0]?.revenue || 0).toLocaleString()}
        </div>
        <div className="flex items-center gap-1.5 text-purple-500/70 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">{routeStats[0]?.name || 'N/A'} Primary</span>
        </div>
      </div>
    </div>
  </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 {/* Vehicle Performance Chart */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <h3 className="text-xl font-semibold text-ink-primary mb-2">Fleet Productivity.</h3>
 <p className="text-[10px] font-semibold text-gray-700 mb-8">Revenue generation per vehicle unit</p>
 <div className="h-[300px] w-full">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={vehiclePerformance}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#4b5563'}} />
 <YAxis hide />
 <Tooltip 
 cursor={{ fill: 'rgba(0,0,0,0.02)'}}
 contentStyle={{ 
 backgroundColor: '#111', 
 border: 'none', 
 borderRadius: '1rem', 
 padding: '15px', 
 boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
}}
 itemStyle={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 900}}
 labelStyle={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 900, marginBottom: '5px', textTransform: ''}}
 formatter={(val) => [`${businessProfile.currencySymbol}${Math.round(val).toLocaleString()}`, 'Revenue']}
 />
 <Bar dataKey="revenue" fill="#6366f1" radius={[10, 10, 0, 0]} barSize={40} />
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* Route Dominance */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <h3 className="text-xl font-semibold text-ink-primary mb-2">Route Dominance.</h3>
 <p className="text-[10px] font-semibold text-gray-700 mb-8">Delivery volume distribution by region</p>
 <div className="h-[300px] w-full">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={routeStats}
 cx="50%"
 cy="50%"
 innerRadius={60}
 outerRadius={100}
 paddingAngle={5}
 dataKey="deliveries"
 >
 {routeStats.map((entry, index) => (
 <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
 ))}
 </Pie>
 <Tooltip 
 contentStyle={{ 
 backgroundColor: '#111', 
 border: 'none', 
 borderRadius: '1rem', 
 padding: '15px'
}}
 itemStyle={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 900}}
 formatter={(val) => `${val} Deliveries`} 
 />
 <Legend />
 </PieChart>
 </ResponsiveContainer>
 </div>
 </div>
 </div>

 {/* Comprehensive Fleet Ledger */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <div className="flex justify-between items-center mb-10">
 <div>
 <h3 className="text-2xl font-semibold text-ink-primary mb-2">Logistics Intelligence Board.</h3>
 <p className="text-[10px] font-semibold text-gray-700">Historical fleet efficiency metrics</p>
 </div>
 <button 
 onClick={() => downloadCSV(vehicles, 'ledgr_fleet_list', businessProfile.name)}
 className="flex items-center gap-2 px-6 py-3 bg-ink-primary text-accent-signature rounded-full text-[10px] font-semibold hover:bg-black transition-all shadow-premium"
 >
 <Download size={16} />
 Export Fleet
 </button>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 {vehicles.map(v => {
 const stats = vehiclePerformance.find(stat => stat.name === (v.plateNumber || v.model)) || { revenue: 0, deliveries: 0};
 return (
 <div key={v.id} className="p-6 bg-canvas/30 rounded-xl border border-black/5 hover:bg-white hover:shadow-xl transition-all group">
 <div className="flex items-center gap-4 mb-6">
 <div className="w-12 h-12 rounded-lg bg-white group-hover:bg-ink-primary transition-all shadow-sm overflow-hidden flex items-center justify-center">
 <img src="/assets/van.png" className="w-full h-full object-cover" alt="Vehicle" />
 </div>
 <div>
 <div className="text-[11px] font-semibold text-ink-primary truncate">{v.plateNumber}</div>
 <div className="text-[8px] font-semibold text-ink-tertiary">{v.model}</div>
 </div>
 </div>
 <div className="space-y-4">
 <div className="flex justify-between items-end">
 <span className="text-[8px] font-semibold text-ink-tertiary">Revenue generated</span>
 <span className="text-sm font-semibold text-ink-primary">
 {businessProfile.currencySymbol}{Math.round(stats.revenue).toLocaleString()}
 </span>
 </div>
 <div className="flex justify-between items-end">
 <span className="text-[8px] font-semibold text-ink-tertiary">Total drops</span>
 <span className="text-sm font-semibold text-accent-signature-hover">
 {stats.deliveries}
 </span>
 </div>
 </div>
 </div>
 );
})}
 </div>
 </div>
 </div>
 );
};

export default LogisticsReports;
