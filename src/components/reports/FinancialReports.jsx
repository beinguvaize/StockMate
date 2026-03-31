import React, { useMemo} from 'react';
import { 
 ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
 Tooltip, BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import { DollarSign, TrendingUp, CreditCard, PieChart as PieChartIcon, ArrowUpRight, ArrowDownRight, Download} from 'lucide-react';
import { downloadCSV} from '../../utils/csvExport';

const FinancialReports = ({ sales, expenses, payroll, businessProfile}) => {
 // 1a. P&L Statement Aggregation
 const plData = useMemo(() => {
 const monthlyData = {};
 const now = new Date();
 
 // Initialize last 6 months
 for (let i = 5; i >= 0; i--) {
 const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
 const monthKey = d.toLocaleString('default', { month: 'short', year: '2-digit'});
 monthlyData[monthKey] = { month: monthKey, revenue: 0, expenses: 0, netProfit: 0};
}

 sales.forEach(sale => {
 const d = new Date(sale.date);
 const monthKey = d.toLocaleString('default', { month: 'short', year: '2-digit'});
 if (monthlyData[monthKey]) {
 monthlyData[monthKey].revenue += sale.totalAmount;
}
});

 expenses.forEach(exp => {
 const d = new Date(exp.date);
 const monthKey = d.toLocaleString('default', { month: 'short', year: '2-digit'});
 if (monthlyData[monthKey]) {
 monthlyData[monthKey].expenses += exp.amount;
}
});

 payroll.forEach(pay => {
 const d = new Date(pay.processed_at || pay.date);
 const monthKey = d.toLocaleString('default', { month: 'short', year: '2-digit'});
 if (monthlyData[monthKey]) {
 monthlyData[monthKey].expenses += pay.amount;
}
});

 return Object.values(monthlyData).map(d => ({
 ...d,
 netProfit: d.revenue - d.expenses,
 margin: d.revenue > 0 ? ((d.revenue - d.expenses) / d.revenue * 100).toFixed(1) : 0
}));
}, [sales, expenses, payroll]);

 // 1b. Payment Method Breakdown
 const paymentData = useMemo(() => {
 const methods = {
 CASH: { name: 'Cash', value: 0, count: 0},
 BANK: { name: 'Bank', value: 0, count: 0},
 CREDIT: { name: 'Credit', value: 0, count: 0}
};

 sales.forEach(sale => {
 const method = sale.paymentMethod?.toUpperCase() || 'CASH';
 if (methods[method]) {
 methods[method].value += sale.totalAmount;
 methods[method].count += 1;
}
});

 return Object.values(methods).filter(m => m.value > 0);
}, [sales]);

  const totalRevenue = useMemo(() => sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0), [sales]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + (e.amount || 0), 0), [expenses]);
  const totalPayroll = useMemo(() => payroll.reduce((sum, p) => sum + (p.amount || 0), 0), [payroll]);
  const totalExpenditure = totalExpenses + totalPayroll;
  const netLiquidity = totalRevenue - totalExpenditure;

 const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444'];

 if (sales.length === 0 && expenses.length === 0) {
 return (
 <div className="flex flex-col items-center justify-center py-20 text-ink-tertiary/40">
 <DollarSign size={80} strokeWidth={1} />
 <p className="text-xl font-semibold mt-4">No Financial Data Available</p>
 </div>
 );
}

 return (
 <div className="space-y-8 animate-in fade-in duration-700">
      {/* Financial Premium Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Gross Revenue Card */}
        <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
          <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-accent-signature-hover">
            <TrendingUp size={40} strokeWidth={2} />
          </div>
          <div className="relative z-10 flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Gross Revenue</span>
            <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
              <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile.currencySymbol}</span>
              {Math.round(totalRevenue).toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 text-gray-400 mt-3">
              <span className="text-[9px] font-bold uppercase tracking-wider">Historical Total Sales</span>
            </div>
          </div>
        </div>

        {/* Total Expenditure Card */}
        <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
          <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-red-500">
            <CreditCard size={40} strokeWidth={2} />
          </div>
          <div className="relative z-10 flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Total Expenditure</span>
            <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
              <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile.currencySymbol}</span>
              {Math.round(totalExpenditure).toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 text-red-500/70 mt-3">
              <span className="text-[9px] font-bold uppercase tracking-wider">Ops + Payroll Load</span>
            </div>
          </div>
        </div>

        {/* Net Liquidity Card */}
        <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
          <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-green-500">
            <DollarSign size={40} strokeWidth={2} />
          </div>
          <div className="relative z-10 flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Net Liquidity</span>
            <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
              <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile.currencySymbol}</span>
              {Math.round(netLiquidity).toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 text-green-500/70 mt-3">
              <span className="text-[9px] font-bold uppercase tracking-wider">Unencumbered Revenue</span>
            </div>
          </div>
        </div>
      </div>

 {/* 1a. P&L Statement */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <div className="flex justify-between items-center mb-10">
 <div>
 <h3 className="text-3xl font-semibold text-ink-primary leading-none mb-2">P&L Statement.</h3>
 <p className="text-[10px] font-semibold text-gray-700">Revenue vs Expenditure Performance</p>
 </div>
 <button 
 onClick={() => downloadCSV(plData, 'profit_loss_statement', businessProfile.name)}
 className="flex items-center gap-2 px-6 py-3 bg-ink-primary text-accent-signature rounded-lg text-[10px] font-semibold hover:bg-black transition-all shadow-premium"
 >
 <Download size={16} />
 Export P&L
 </button>
 </div>

 <div className="h-[350px] w-full mb-10">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={plData}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
 <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#4b5563'}} />
 <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#4b5563'}} />
 <Tooltip 
 contentStyle={{ backgroundColor: '#111', border: 'none', borderRadius: '1rem', padding: '15px'}}
 itemStyle={{ color: '#cbd5e1', fontSize: '10px'}}
 labelStyle={{ color: 'rgba(255,255,255,0.4)', marginBottom: '5px'}}
 />
 <Legend />
 <Bar name="Revenue" dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
 <Bar name="Expenses" dataKey="expenses" fill="#ef4444" radius={[6, 6, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="border-b border-black/5">
 <th className="py-2 px-2 text-[10px] font-semibold text-[#4b5563]">Month</th>
 <th className="py-2 px-2 text-[10px] font-semibold text-[#4b5563]">Revenue</th>
 <th className="py-2 px-2 text-[10px] font-semibold text-[#4b5563]">Expenses</th>
 <th className="py-2 px-2 text-[10px] font-semibold text-[#4b5563]">Net Profit</th>
 <th className="py-2 px-2 text-[10px] font-semibold text-[#4b5563]">Margin %</th>
 </tr>
 </thead>
 <tbody>
 {plData.map((row, i) => (
 <tr key={i} className="border-b border-black/5 hover:bg-canvas/30 transition-colors">
 <td className="py-2 px-2 font-semibold text-xs text-ink-primary">{row.month}</td>
 <td className="py-2 px-2 text-sm font-semibold text-ink-primary tabular-nums">
 {businessProfile.currencySymbol}{Math.round(row.revenue).toLocaleString()}
 </td>
 <td className="py-2 px-2 text-sm font-semibold text-red-500 tabular-nums">
 {businessProfile.currencySymbol}{Math.round(row.expenses).toLocaleString()}
 </td>
 <td className={`py-2 px-2 text-sm font-semibold tabular-nums ${row.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
 {businessProfile.currencySymbol}{Math.round(row.netProfit).toLocaleString()}
 </td>
 <td className="py-2 px-2">
 <span className={`px-2 py-1 rounded-full text-[9px] font-semibold ${row.netProfit >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
 {row.margin}%
 </span>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 {/* 1b. Payment Method Breakdown */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <h3 className="text-xl font-semibold text-ink-primary mb-8">Payment Mix.</h3>
 <div className="h-[300px] w-full mb-8">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={paymentData}
 cx="50%"
 cy="50%"
 innerRadius={60}
 outerRadius={100}
 paddingAngle={5}
 dataKey="value"
 >
 {paymentData.map((entry, index) => (
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
 />
 <Legend />
 </PieChart>
 </ResponsiveContainer>
 </div>
 <div className="space-y-4">
 {paymentData.map((item, i) => (
 <div key={i} className="flex justify-between items-center p-4 bg-canvas/30 rounded-lg border border-black/5">
 <div className="flex items-center gap-3">
 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length]}}></div>
 <span className="text-xs font-semibold text-ink-primary">{item.name}</span>
 </div>
 <div className="text-right">
 <div className="text-sm font-semibold text-ink-primary tabular-nums">{businessProfile.currencySymbol}{Math.round(item.value).toLocaleString()}</div>
 <div className="text-[9px] font-semibold text-ink-tertiary">{item.count} Trans. | Avg: {businessProfile.currencySymbol}{Math.round(item.value / item.count).toLocaleString()}</div>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* 1c. Revenue Metrics Hub */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem] flex flex-col justify-between">
 <div>
 <h3 className="text-xl font-semibold text-ink-primary mb-2">Revenue Insights.</h3>
 <p className="text-[10px] font-semibold text-gray-700 mb-8">Key performance milestones</p>
 </div>

 <div className="grid grid-cols-1 gap-4">
 <div className="p-5 bg-canvas/40 rounded-[2rem] border border-black/5 relative overflow-hidden group">
 <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:scale-110 transition-transform">
 <TrendingUp size={120} />
 </div>
 <span className="text-[10px] font-semibold text-ink-tertiary mb-2 block font-mono">Best Month Overall</span>
 <div className="text-4xl font-semibold text-ink-primary mb-2">
 {plData.reduce((prev, current) => (prev.revenue > current.revenue) ? prev : current).month}
 </div>
 <div className="flex items-center gap-2 text-green-500 font-semibold text-[10px]">
 <ArrowUpRight size={14} />
 High Velocity
 </div>
 </div>

 <div className="p-5 bg-ink-primary rounded-[2rem] text-slate-200 relative overflow-hidden group">
 <span className="text-[10px] font-semibold text-ink-tertiary mb-2 block">Current Net Worth</span>
 <div className="text-4xl font-semibold text-accent-signature mb-2">
 {businessProfile.currencySymbol}{plData.reduce((sum, d) => sum + d.netProfit, 0).toLocaleString()}
 </div>
 <p className="text-[9px] font-semibold text-ink-tertiary/70">6-Month Rolling Profit</p>
 </div>
 </div>

 <button className="mt-8 w-full py-2 border border-black/10 rounded-pill text-[10px] font-semibold text-ink-primary hover:bg-black/5 transition-all">
 View Detailed Ledger
 </button>
 </div>
 </div>
 </div>
 );
};

export default FinancialReports;
