import React, { useMemo } from 'react';
import { 
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip, Legend, LineChart, Line, Cell, PieChart, Pie
} from 'recharts';
import { TrendingUp, Users, ShoppingBag, Calendar, ArrowUpRight, Target, Award } from 'lucide-react';

const SalesReports = ({ sales, clients, products, businessProfile }) => {
    
    // 3a. Top Customers by Revenue
    const topCustomers = useMemo(() => {
        const customerRevenue = {};
        sales.forEach(s => {
            if (!s.clientId) return;
            const client = clients.find(c => c.id === s.clientId);
            const clientName = client?.name || 'Guest Client';
            if (!customerRevenue[s.clientId]) {
                customerRevenue[s.clientId] = { id: s.clientId, name: clientName, revenue: 0, count: 0 };
            }
            customerRevenue[s.clientId].revenue += s.total || 0;
            customerRevenue[s.clientId].count += 1;
        });

        return Object.values(customerRevenue)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
    }, [sales, clients]);

    // 3b. Category Performance
    const categoryPerformance = useMemo(() => {
        const performance = {};
        sales.forEach(s => {
            s.items?.forEach(item => {
                const product = products.find(p => p.id === item.productId);
                const cat = product?.category || 'Uncategorized';
                if (!performance[cat]) performance[cat] = { name: cat, revenue: 0, units: 0 };
                performance[cat].revenue += (item.price * item.quantity);
                performance[cat].units += item.quantity;
            });
        });
        return Object.values(performance).sort((a, b) => b.revenue - a.revenue);
    }, [sales, products]);

    // 3c. Sales Trends (Daily for last 30 days)
    const salesTrends = useMemo(() => {
        const last30Days = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            last30Days[key] = { date: key, amount: 0 };
        }

        sales.forEach(s => {
            const date = new Date(s.date).toISOString().split('T')[0];
            if (last30Days[date]) {
                last30Days[date].amount += s.total || 0;
            }
        });

        return Object.values(last30Days);
    }, [sales]);

    const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b'];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Sales Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel !p-8 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-ink-tertiary uppercase tracking-widest mb-2 block">Total Net Sales</span>
                    <div className="text-4xl font-black text-ink-primary tracking-tighter mb-2">
                        {businessProfile.currencySymbol}{Math.round(sales.reduce((sum, s) => sum + (s.total || 0), 0)).toLocaleString()}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black text-green-500 uppercase tracking-widest">
                        <ArrowUpRight size={14} /> Performance Growth
                    </div>
                </div>
                <div className="glass-panel !p-8 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-ink-tertiary uppercase tracking-widest mb-2 block">Client Participation</span>
                    <div className="text-4xl font-black text-accent-signature-hover tracking-tighter mb-2">
                        {new Set(sales.map(s => s.clientId)).size}
                    </div>
                    <div className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Active Transacting Accounts</div>
                </div>
                <div className="glass-panel !p-8 bg-ink-primary text-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2 block">Average Ticket Size</span>
                    <div className="text-4xl font-black text-accent-signature tracking-tighter mb-2">
                        {businessProfile.currencySymbol}{Math.round(sales.length ? sales.reduce((sum, s) => sum + (s.total || 0), 0) / sales.length : 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">Value Per Transaction</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 30-Day Trend */}
                <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <h3 className="text-xl font-black text-ink-primary tracking-tighter uppercase mb-2">Revenue Velocity.</h3>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.2em] mb-8">Daily sales performance (30D Overvview)</p>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={salesTrends}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
                                <XAxis dataKey="date" hide />
                                <YAxis hide />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#000', border: 'none', borderRadius: '1rem', color: '#fff' }}
                                    formatter={(val) => [`${businessProfile.currencySymbol}${Math.round(val).toLocaleString()}`, 'Revenue']}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="amount" 
                                    stroke="#6366f1" 
                                    strokeWidth={4} 
                                    dot={false} 
                                    activeDot={{ r: 8, strokeWidth: 0 }} 
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Sales */}
                <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <h3 className="text-xl font-black text-ink-primary tracking-tighter uppercase mb-2">Category Dominance.</h3>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.2em] mb-8">Revenue distribution by catalog grouping</p>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryPerformance}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="revenue"
                                >
                                    {categoryPerformance.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(val) => `${businessProfile.currencySymbol}${Math.round(val).toLocaleString()}`} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Top Customers Leaderboard */}
            <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                <div className="flex justify-between items-center mb-10">
                    <div>
                        <h3 className="text-2xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">Premium Client Board.</h3>
                        <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em]">Top revenue generating partners</p>
                    </div>
                    <Award size={32} className="text-accent-signature opacity-20" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {topCustomers.map((customer, index) => (
                        <div key={customer.id} className="p-6 bg-canvas/40 rounded-[1.5rem] border border-black/5 hover:bg-white hover:shadow-xl transition-all group relative overflow-hidden">
                            <div className="absolute top-2 right-4 text-4xl font-black opacity-5 group-hover:opacity-10">#{index + 1}</div>
                            <h4 className="text-xs font-black text-ink-primary uppercase mb-1 truncate">{customer.name}</h4>
                            <p className="text-[9px] font-black text-accent-signature-hover uppercase tracking-widest mb-4">{customer.count} Transactions</p>
                            <div className="text-2xl font-black text-ink-primary tracking-tighter">
                                {businessProfile.currencySymbol}{Math.round(customer.revenue).toLocaleString()}
                            </div>
                        </div>
                    ))}
                    {topCustomers.length === 0 && (
                        <div className="col-span-full py-20 text-center text-ink-tertiary italic uppercase tracking-[0.3em] text-[10px]">
                            Awaiting transactional data...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SalesReports;
