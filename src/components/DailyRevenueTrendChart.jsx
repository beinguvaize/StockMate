import React, { useMemo} from 'react';
import { 
 BarChart, 
 Bar, 
 XAxis, 
 YAxis, 
 CartesianGrid, 
 Tooltip, 
 ResponsiveContainer 
} from 'recharts';
import { useAppContext} from '../context/AppContext';

/**
 * DailyRevenueTrendChart
 * A stacked bar chart showing Daily Cash vs Credit sales over the last 14 days.
 * Follows the high-performance"Obsidian-glass" aesthetic.
 */
const DailyRevenueTrendChart = () => {
 const { sales, businessProfile, employees} = useAppContext();
 const currency = businessProfile?.currencySymbol || '₹';

 const getEmployeeName = (empId) => {
 // Note: 'employees' is not defined in this component's scope.
 // This function might be intended for a different context or requires 'employees' to be passed/fetched.
 const emp = employees.find(e => e.id === empId); 
 return emp ? emp.name : 'Unknown Driver';
};
 
 const data = useMemo(() => {
 const result = [];
 const now = new Date();
 
 // Generate list for the last 14 days
 for (let i = 13; i >= 0; i--) {
 const d = new Date(now);
 d.setDate(now.getDate() - i);
 
 // Format date for label (Mar 1, Mar 2...)
 const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric'});
 
 // Get ISO date string (YYYY-MM-DD) for matching (though not used in new filter logic)
 const isoString = d.toISOString().split('T')[0];
 
 // Group sales for this specific date
 const daySales = (sales || []).filter(o => {
 const oDate = new Date(o.date);
 return oDate.getFullYear() === d.getFullYear() &&
 oDate.getMonth() === d.getMonth() &&
 oDate.getDate() === d.getDate();
});

  const cash = daySales
  .filter(o => o.paymentMethod?.toUpperCase() === 'CASH')
  .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
 
  const credit = daySales // Corrected from dayOrders to daySales
  .filter(o => o.paymentMethod?.toUpperCase() === 'CREDIT')
  .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
 
 result.push({
 date: label,
 cash,
 credit,
 total: cash + credit
});
}
 
 return result;
}, [sales]);

 const hasData = useMemo(() => {
 return data.some(d => d.total > 0);
}, [data]);

 const formatYAxis = (value) => {
 if (value >= 1000) return `${currency}${(value / 1000).toFixed(1)}k`;
 return `${currency}${value}`;
};

 const CustomTooltip = ({ active, payload, label}) => {
 if (active && payload && payload.length) {
 return (
 <div className="bg-white/90 backdrop-blur-xl border border-black/5 p-4 rounded-lg shadow-2xl text-ink-primary">
 <p className="text-gray-700 text-xs font-bold mb-2">{label}</p>
 <div className="space-y-1">
 <p className="flex justify-between gap-5 text-sm">
 <span className="flex items-center gap-2">
 <div className="w-2 h-2 rounded-full bg-[#7F77DD]" />
 Credit
 </span>
 <span className="font-bold">{currency}{payload[1].value.toLocaleString()}</span>
 </p>
 <p className="flex justify-between gap-5 text-sm">
 <span className="flex items-center gap-2">
 <div className="w-2 h-2 rounded-full bg-[#378ADD]" />
 Cash
 </span>
 <span className="font-bold">{currency}{payload[0].value.toLocaleString()}</span>
 </p>
 <div className="h-[1px] bg-black/5 my-1" />
 <p className="flex justify-between gap-5 text-sm font-semibold">
 <span>Total</span>
 <span className="text-blue-600">{currency}{(payload[0].value + payload[1].value).toLocaleString()}</span>
 </p>
 </div>
 </div>
 );
}
 return null;
};

 return (
 <div className="bg-white p-5 rounded-[2rem] shadow-premium border border-black/5 flex flex-col h-[400px] overflow-hidden">
 {/* Legend & Header */}
 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
 <div>
 <h2 className="text-xl font-bold text-ink-primary mb-1">Revenue Trend</h2>
 <p className="text-gray-700 text-xs font-semibold leading-none">Last 14 days</p>
 </div>
 
 <div className="flex items-center gap-4 text-[10px] md:text-xs">
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded-sm bg-[#378ADD]" />
 <span className="font-bold text-gray-700">Cash Sales</span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded-sm bg-[#7F77DD]" />
 <span className="font-bold text-gray-700">Credit Sales</span>
 </div>
 </div>
 </div>

 <div className="relative flex-1">
 {!hasData ? (
 <div className="absolute inset-0 flex items-center justify-center">
 <p className="text-gray-700 font-medium italic">No sales data yet</p>
 </div>
 ) : (
 <ResponsiveContainer width="100%" height="100%" debounce={50} minHeight={300}>
 <BarChart
 data={data}
 margin={{ top: 10, right: 10, left: -20, bottom: 20}}
 >
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
 <XAxis 
 dataKey="date" 
 axisLine={false} 
 tickLine={false} 
 tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 700}}
 angle={-45}
 textAnchor="end"
 interval={0}
 />
 <YAxis 
 axisLine={false} 
 tickLine={false} 
 tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700}}
 tickFormatter={formatYAxis}
 />
 <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)'}} />
 <Bar 
 dataKey="cash" 
 stackId="a" 
 fill="#378ADD" 
 radius={[0, 0, 0, 0]}
 animationDuration={1000}
 animationEasing="ease-out"
 />
 <Bar 
 dataKey="credit" 
 stackId="a" 
 fill="#7F77DD" 
 radius={[4, 4, 0, 0]}
 animationDuration={1000}
 animationEasing="ease-out"
 />
 </BarChart>
 </ResponsiveContainer>
 )}
 </div>
 </div>
 );
};

export default DailyRevenueTrendChart;
