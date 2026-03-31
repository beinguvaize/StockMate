import React, { useMemo} from 'react';
import { 
 ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
 Tooltip, Legend, LineChart, Line, Cell, PieChart, Pie
} from 'recharts';
import { TrendingUp, Users, ShoppingBag, Calendar, ArrowUpRight, Target, Award, Download, ShieldAlert} from 'lucide-react';
import { exportSalesCSV} from '../../utils/csvExport';

const SalesReports = ({ sales, clients, products, businessProfile}) => {
 
 // 3a. Top Customers by Revenue
 const topCustomers = useMemo(() => {
 const customerRevenue = {};
 sales.forEach(s => {
 if (!s.clientId) return;
 const client = clients.find(c => c.id === s.clientId);
 const clientName = client?.name || 'Guest Client';
 if (!customerRevenue[s.clientId]) {
 customerRevenue[s.clientId] = { id: s.clientId, name: clientName, revenue: 0, count: 0};
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
 if (!performance[cat]) performance[cat] = { name: cat, revenue: 0, units: 0};
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
 last30Days[key] = { date: key, amount: 0};
}

 sales.forEach(s => {
 const date = new Date(s.date).toISOString().split('T')[0];
 if (last30Days[date]) {
 last30Days[date].amount += s.total || 0;
}
});

 return Object.values(last30Days);
}, [sales]);

  // 3d. Ribbon Metrics
  const ribbonMetrics = useMemo(() => {
    const totalNetSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const activeAccounts = new Set(sales.map(s => s.clientId)).size;
    const avgTicketSize = sales.length ? totalNetSales / sales.length : 0;
    
    // Top Debtor Selection
    const topDebtor = [...clients]
      .filter(c => c.balance > 0)
      .sort((a, b) => b.balance - a.balance)[0] || null;

    return { totalNetSales, activeAccounts, avgTicketSize, topDebtor };
  }, [sales, clients]);

 const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b'];

 return (
 <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Sales Premium Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Net Sales Card */}
        <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
          <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-accent-signature-hover">
            <ShoppingBag size={40} strokeWidth={2} />
          </div>
          <div className="relative z-10 flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Total Net Sales</span>
            <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
              <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile.currencySymbol}</span>
              {Math.round(ribbonMetrics.totalNetSales).toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 text-green-500/70 mt-3">
              <ArrowUpRight size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Performance Growth</span>
            </div>
          </div>
        </div>

        {/* Active Accounts Card */}
        <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
          <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-ink-primary">
            <Users size={40} strokeWidth={2} />
          </div>
          <div className="relative z-10 flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Active Accounts</span>
            <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
              {ribbonMetrics.activeAccounts} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">Entities</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-400 mt-3">
              <span className="text-[9px] font-bold uppercase tracking-wider">Transacting Partners</span>
            </div>
          </div>
        </div>

        {/* Top Debtor Exposure Card */}
        <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
          <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-red-500">
            <ShieldAlert size={40} strokeWidth={2} />
          </div>
          <div className="relative z-10 flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Top Debtor Exposure</span>
            <div className="text-3xl font-black text-red-500 tabular-nums tracking-tight leading-none mt-0.5">
              <span className="text-[16px] text-red-500/30 mr-1">{businessProfile.currencySymbol}</span>
              {Math.round(ribbonMetrics.topDebtor?.balance || 0).toLocaleString()}
            </div>
            <div className="mt-3">
              <span className="text-[11px] font-bold text-ink-primary truncate block max-w-full">
                {ribbonMetrics.topDebtor?.name || 'N/A (No Debt)'}
              </span>
            </div>
          </div>
        </div>

        {/* Ticket Size Card */}
        <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
          <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-purple-500">
            <Target size={40} strokeWidth={2} />
          </div>
          <div className="relative z-10 flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Avg Ticket Size</span>
            <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
              <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile.currencySymbol}</span>
              {Math.round(ribbonMetrics.avgTicketSize).toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 text-purple-500/70 mt-3">
              <span className="text-[9px] font-bold uppercase tracking-wider">Revenue Per Order</span>
            </div>
          </div>
        </div>
      </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 {/* 30-Day Trend */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <h3 className="text-xl font-semibold text-ink-primary mb-2">Revenue Velocity.</h3>
 <p className="text-[10px] font-semibold text-gray-700 mb-8">Daily sales performance (30D Overvview)</p>
 <div className="h-[300px] w-full">
 <ResponsiveContainer width="100%" height="100%">
 <LineChart data={salesTrends}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
 <XAxis dataKey="date" hide />
 <YAxis hide />
 <Tooltip 
 contentStyle={{ 
 backgroundColor: '#111', 
 border: 'none', 
 borderRadius: '1rem', 
 padding: '15px'
}}
 itemStyle={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 900}}
 labelStyle={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 900, marginBottom: '5px', textTransform: ''}}
 formatter={(val) => [`${businessProfile.currencySymbol}${Math.round(val).toLocaleString()}`, 'Revenue']}
 />
 <Line 
 type="monotone" 
 dataKey="amount" 
 stroke="#6366f1" 
 strokeWidth={4} 
 dot={false} 
 activeDot={{ r: 8, strokeWidth: 0}} 
 />
 </LineChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* Category Sales */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <h3 className="text-xl font-semibold text-ink-primary mb-2">Category Dominance.</h3>
 <p className="text-[10px] font-semibold text-gray-700 mb-8">Revenue distribution by catalog grouping</p>
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
 <Tooltip 
 contentStyle={{ 
 backgroundColor: '#111', 
 border: 'none', 
 borderRadius: '1rem', 
 padding: '15px'
}}
 itemStyle={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 900}}
 formatter={(val) => `${businessProfile.currencySymbol}${Math.round(val).toLocaleString()}`} 
 />
 <Legend />
 </PieChart>
 </ResponsiveContainer>
 </div>
 </div>
 </div>

 {/* Top Customers Leaderboard */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <div className="flex justify-between items-center mb-10">
 <div>
 <h3 className="text-2xl font-semibold text-ink-primary leading-none mb-2">Premium Client Board.</h3>
 <p className="text-[10px] font-semibold text-gray-700">Top revenue generating partners</p>
 </div>
 <button 
 onClick={() => exportSalesCSV(sales, businessProfile.name, (id) => clients.find(c => c.id === id)?.name || id)}
 className="flex items-center gap-2 px-6 py-3 bg-ink-primary text-accent-signature rounded-full text-[10px] font-semibold hover:bg-black transition-all shadow-premium"
 >
 <Download size={16} />
 Export Sales Ledger
 </button>
 <Award size={32} className="text-accent-signature opacity-20" />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {topCustomers.map((customer, index) => (
 <div key={customer.id} className="p-6 bg-canvas/40 rounded-[1.5rem] border border-black/5 hover:bg-white hover:shadow-xl transition-all group relative overflow-hidden">
 <div className="absolute top-2 right-4 text-4xl font-semibold opacity-5 group-hover:opacity-10">#{index + 1}</div>
 <h4 className="text-xs font-semibold text-ink-primary mb-1 truncate">{customer.name}</h4>
 <p className="text-[9px] font-semibold text-accent-signature-hover mb-4">{customer.count} Transactions</p>
 <div className="text-2xl font-semibold text-ink-primary">
 {businessProfile.currencySymbol}{Math.round(customer.revenue).toLocaleString()}
 </div>
 </div>
 ))}
 {topCustomers.length === 0 && (
 <div className="col-span-full py-20 text-center text-ink-tertiary italic text-sm">
 Awaiting transactional data...
 </div>
 )}
 </div>
 </div>
 </div>
 );
};

export default SalesReports;
