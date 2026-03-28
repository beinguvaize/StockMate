import React, { useMemo } from 'react';
import { 
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip, Legend, Cell, PieChart, Pie
} from 'recharts';
import { Truck, Navigation, Fuel, Timer, MapPin, Gauge } from 'lucide-react';

const LogisticsReports = ({ sales, vehicles, routes, businessProfile }) => {
    
    // 5a. Vehicle Performance (Sales per Vehicle)
    const vehiclePerformance = useMemo(() => {
        const stats = {};
        sales.forEach(s => {
            if (!s.vehicleId) return;
            const v = vehicles.find(veh => veh.id === s.vehicleId);
            const name = v?.plateNumber || v?.model || 'Unknown Vehicle';
            if (!stats[s.vehicleId]) stats[s.vehicleId] = { name, revenue: 0, deliveries: 0 };
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
            if (!stats[s.routeId]) stats[s.routeId] = { name, revenue: 0, deliveries: 0 };
            stats[s.routeId].revenue += s.total || 0;
            stats[s.routeId].deliveries += 1;
        });
        return Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    }, [sales, routes]);

    const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Logistics KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel !p-8 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest mb-2 block opacity-70">Fleet Utilization</span>
                    <div className="text-4xl font-black text-ink-primary tracking-tighter mb-2">
                        {new Set(sales.filter(s => s.vehicleId).map(s => s.vehicleId)).size} / {vehicles.length}
                    </div>
                    <div className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Active vs Total Vehicles</div>
                </div>
                <div className="glass-panel !p-8 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest mb-2 block opacity-70">Total Deliveries</span>
                    <div className="text-4xl font-black text-accent-signature-hover tracking-tighter mb-2">
                        {sales.filter(s => s.vehicleId).length}
                    </div>
                    <div className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Logistics Events Optimized</div>
                </div>
                <div className="glass-panel !p-8 bg-ink-primary text-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2 block">Top Route Revenue</span>
                    <div className="text-4xl font-black text-accent-signature tracking-tighter mb-2">
                        {businessProfile.currencySymbol}{Math.round(routeStats[0]?.revenue || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">{routeStats[0]?.name || 'N/A'}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Vehicle Performance Chart */}
                <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <h3 className="text-xl font-black text-ink-primary tracking-tighter uppercase mb-2">Fleet Productivity.</h3>
                    <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.2em] opacity-70 mb-8">Revenue generation per vehicle unit</p>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={vehiclePerformance}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#4b5563' }} />
                                <YAxis hide />
                                <Tooltip 
                                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                    contentStyle={{ backgroundColor: '#000', border: 'none', borderRadius: '1rem', color: '#fff' }}
                                    formatter={(val) => [`${businessProfile.currencySymbol}${Math.round(val).toLocaleString()}`, 'Revenue']}
                                />
                                <Bar dataKey="revenue" fill="#6366f1" radius={[10, 10, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Route Dominance */}
                <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <h3 className="text-xl font-black text-ink-primary tracking-tighter uppercase mb-2">Route Dominance.</h3>
                    <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.2em] opacity-70 mb-8">Delivery volume distribution by region</p>
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
                                <Tooltip formatter={(val) => `${val} Deliveries`} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Comprehensive Fleet Ledger */}
            <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                <h3 className="text-2xl font-black text-ink-primary tracking-tighter uppercase mb-2">Logistics Intelligence Board.</h3>
                <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.3em] opacity-70 mb-10">Historical fleet efficiency metrics</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {vehicles.map(v => {
                        const stats = vehiclePerformance.find(stat => stat.name === (v.plateNumber || v.model)) || { revenue: 0, deliveries: 0 };
                        return (
                            <div key={v.id} className="p-6 bg-canvas/30 rounded-3xl border border-black/5 hover:bg-white hover:shadow-xl transition-all group">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="p-3 bg-white rounded-2xl group-hover:bg-ink-primary group-hover:text-white transition-all shadow-sm">
                                        <Truck size={20} />
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-black text-ink-primary uppercase truncate">{v.plateNumber}</div>
                                        <div className="text-[8px] font-black text-[#4b5563] uppercase tracking-widest opacity-60">{v.model}</div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <span className="text-[8px] font-black text-[#4b5563] uppercase tracking-widest opacity-40">Revenue generated</span>
                                        <span className="text-sm font-black text-ink-primary tracking-tighter">
                                            {businessProfile.currencySymbol}{Math.round(stats.revenue).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <span className="text-[8px] font-black text-[#4b5563] uppercase tracking-widest opacity-40">Total drops</span>
                                        <span className="text-sm font-black text-accent-signature-hover tracking-tighter">
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
