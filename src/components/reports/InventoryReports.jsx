import React, { useMemo, useState} from 'react';
import { 
 ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
 Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { Package, TrendingDown, ClipboardList, Database, AlertCircle, ArrowRight, Layers, Download} from 'lucide-react';
import { exportInventoryCSV, downloadCSV} from '../../utils/csvExport';

const InventoryReports = ({ products, sales, movementLog, businessProfile}) => {
 const [deadStockThreshold, setDeadStockThreshold] = useState(30);

 // 2a. Stock Valuation
 const valuationData = useMemo(() => {
 const totalValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.costPrice || 0)), 0);
 const totalPotentialRevenue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.sellingPrice || 0)), 0);
 
 // Category breakdown for valuation
 const categories = {};
 products.forEach(p => {
 const cat = p.category || 'Uncategorized';
 if (!categories[cat]) categories[cat] = { name: cat, value: 0};
 categories[cat].value += (p.stock || 0) * (p.costPrice || 0);
});

 return {
 totalValue,
 totalPotentialRevenue,
 potentialProfit: totalPotentialRevenue - totalValue,
 categoryBreakdown: Object.values(categories).sort((a, b) => b.value - a.value)
};
}, [products]);

 // 2b. Dead Stock Identification
 const deadStock = useMemo(() => {
 const now = new Date();
 const thresholdDate = new Date();
 thresholdDate.setDate(now.getDate() - deadStockThreshold);

 return products.filter(p => {
 // Check if there are any sales for this product since the threshold date
 const hasSales = sales.some(s => {
 const isAfterThreshold = new Date(s.date) >= thresholdDate;
 const includesProduct = s.items?.some(item => item.productId === p.id);
 return isAfterThreshold && includesProduct;
});
 return !hasSales && p.stock > 0;
}).sort((a, b) => (b.stock * b.costPrice) - (a.stock * a.costPrice));
}, [products, sales, deadStockThreshold]);

 // 2c. Top Movement Products
 const movementTrends = useMemo(() => {
 const trends = {};
 movementLog.slice(-100).forEach(m => {
 const p = products.find(prod => prod.id === m.productId);
 if (!p) return;
 if (!trends[p.id]) trends[p.id] = { name: p.name, in: 0, out: 0};
 if (m.type === 'IN') trends[p.id].in += m.quantity;
 else trends[p.id].out += m.quantity;
});
 return Object.values(trends).sort((a, b) => (b.in + b.out) - (a.in + a.out)).slice(0, 10);
}, [movementLog, products]);

 const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];

 return (
 <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  {/* Inventory Premium Ribbon */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
    {/* Valuation Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-accent-signature-hover">
        <Package size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Inventory Valuation</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile.currencySymbol}</span>
          {Math.round(valuationData.totalValue).toLocaleString()}
        </div>
        <div className="flex items-center gap-1.5 text-green-500/70 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">System Asset Value</span>
        </div>
      </div>
    </div>

    {/* Potential Profit Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-ink-primary">
        <Layers size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Potential Profit</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile.currencySymbol}</span>
          {Math.round(valuationData.potentialProfit).toLocaleString()}
        </div>
        <div className="flex items-center gap-1.5 text-gray-400 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">Expected Margin Allocation</span>
        </div>
      </div>
    </div>

    {/* Dead Stock Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-red-500">
        <AlertCircle size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Dead Stock Index</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          {deadStock.length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">SKUS</span>
        </div>
        <div className="flex items-center gap-1.5 text-red-500/70 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">{deadStockThreshold} Days Idle</span>
        </div>
      </div>
    </div>
  </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 {/* Category Valuation Chart */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <h3 className="text-xl font-semibold text-ink-primary mb-2">Valuation by Category.</h3>
 <p className="text-[10px] font-semibold text-gray-700 mb-8">Asset distribution across catalog</p>
 <div className="h-[300px] w-full">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={valuationData.categoryBreakdown}
 cx="50%"
 cy="50%"
 innerRadius={60}
 outerRadius={100}
 paddingAngle={5}
 dataKey="value"
 >
 {valuationData.categoryBreakdown.map((entry, index) => (
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
 formatter={(val) => `${businessProfile.currencySymbol}${val.toLocaleString()}`} 
 />
 <Legend />
 </PieChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* Top Stock Movements */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <h3 className="text-xl font-semibold text-ink-primary mb-2">High Velocity SKUs.</h3>
 <p className="text-[10px] font-semibold text-gray-700 mb-8">Most active products in last 100 logs</p>
 <div className="h-[300px] w-full">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={movementTrends} layout="vertical">
 <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(0,0,0,0.03)" />
 <XAxis type="number" hide />
 <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#4b5563'}} width={100} />
 <Tooltip 
 cursor={{ fill: 'transparent'}} 
 contentStyle={{ 
 backgroundColor: '#111', 
 border: 'none', 
 borderRadius: '1rem', 
 padding: '15px'
}}
 itemStyle={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 900}}
 labelStyle={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 900, marginBottom: '5px', textTransform: ''}}
 />
 <Legend />
 <Bar name="Stock In" dataKey="in" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={20} />
 <Bar name="Stock Out" dataKey="out" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>
 </div>

 {/* Dead Stock Analysis Table */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
 <div>
 <p className="text-[10px] font-semibold text-gray-700">Identify underperforming capital</p>
 </div>
 <div className="flex items-center gap-4">
 <button 
 onClick={() => downloadCSV(deadStock, 'dead_stock_report', businessProfile.name)}
 className="flex items-center gap-2 px-6 py-3 bg-ink-primary text-accent-signature rounded-full text-[10px] font-semibold hover:bg-black transition-all shadow-premium"
 >
 <Download size={16} />
 Export Dead Stock
 </button>
 <div className="flex items-center gap-2 bg-canvas/50 p-2 rounded-full border border-black/5">
 {[30, 60, 90].map(days => (
 <button
 key={days}
 onClick={() => setDeadStockThreshold(days)}
 className={`px-5 py-2 rounded-full text-[9px] font-semibold transition-all ${
 deadStockThreshold === days ? 'bg-ink-primary text-slate-200 shadow-lg' : 'text-[#4b5563] hover:bg-canvas'
}`}
 >
 {days}D
 </button>
 ))}
 </div>
 </div>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="border-b border-black/5">
 <th className="py-2 px-2 text-[10px] font-semibold text-[#4b5563]">Product</th>
 <th className="py-2 px-2 text-[10px] font-semibold text-[#4b5563]">Current Stock</th>
 <th className="py-2 px-2 text-[10px] font-semibold text-[#4b5563]">Valuation (Cost)</th>
 <th className="py-2 px-2 text-[10px] font-semibold text-[#4b5563]">Potential Profit</th>
 <th className="py-2 px-2 text-[10px] font-semibold text-[#4b5563]">Action</th>
 </tr>
 </thead>
 <tbody>
 {deadStock.slice(0, 5).map((p, i) => (
 <tr key={i} className="border-b border-black/5 hover:bg-canvas/30 transition-colors">
 <td className="py-2 px-2">
 <div className="text-xs font-semibold text-ink-primary">{p.name}</div>
 <div className="text-[9px] font-semibold text-accent-signature-hover opacity-70">{p.sku}</div>
 </td>
 <td className="py-2 px-2 text-sm font-semibold text-ink-primary tabular-nums">
 {p.stock} <span className="text-[10px] opacity-70">Units</span>
 </td>
 <td className="py-2 px-2 text-sm font-semibold text-ink-primary tabular-nums">
 {businessProfile.currencySymbol}{Math.round(p.stock * p.costPrice).toLocaleString()}
 </td>
 <td className="py-2 px-2 text-sm font-semibold text-green-500 tabular-nums">
 {businessProfile.currencySymbol}{Math.round(p.stock * (p.sellingPrice - p.costPrice)).toLocaleString()}
 </td>
 <td className="py-2 px-2">
 <button className="flex items-center gap-2 text-[9px] font-semibold text-accent-signature-hover hover:gap-3 transition-all">
 Liquidate <ArrowRight size={14} />
 </button>
 </td>
 </tr>
 ))}
 {deadStock.length === 0 && (
 <tr>
 <td colSpan={5} className="py-20 text-center text-ink-tertiary italic">
 No dead stock found for the selected threshold.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 {deadStock.length > 5 && (
 <p className="mt-4 text-[9px] font-semibold text-[#4b5563] text-center opacity-[0.85]">
 Showing top 5 of {deadStock.length} dead SKUs
 </p>
 )}
 </div>
 </div>
 </div>
 );
};

export default InventoryReports;
