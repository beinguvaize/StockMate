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
import { useSales } from '../hooks/useSales';
import { useTenant } from '../context/TenantContext';
import { usePeople } from '../hooks/usePeople';
import { parseLocalDate } from '../lib/utils';
import { Card, CardHeader } from './ui/card';

/**
 * DailyRevenueTrendChart
 * A stacked bar chart showing Daily Cash vs Credit sales over the last 14 days.
 * Drawn in the web redesign's card (Dashboard, "Last 14 days").
 */
const DailyRevenueTrendChart = ({ playing = false, className = '', style }) => {
 const { currentTenantId, businessProfile } = useTenant();
 const { sales } = useSales(currentTenantId, { lean: true });
 const { employees } = usePeople(currentTenantId);
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
 const oDate = parseLocalDate(o.date);
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
 const cash = payload.find(p => p.dataKey === 'cash')?.value || 0;
 const credit = payload.find(p => p.dataKey === 'credit')?.value || 0;
 return (
 <div className="rounded-[10px] bg-ink px-3 py-2 text-[12px] leading-snug text-white shadow-lg">
 <p className="text-white/70 mb-1">{label}</p>
 <p className="flex justify-between gap-5"><span className="flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-[#9AA0A8]" />Cash</span><span className="font-tight font-semibold tabular-nums">{currency}{cash.toLocaleString()}</span></p>
 <p className="flex justify-between gap-5"><span className="flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-amber" />Credit</span><span className="font-tight font-semibold tabular-nums">{currency}{credit.toLocaleString()}</span></p>
 <p className="flex justify-between gap-5 mt-1 pt-1 border-t border-white/15"><span>Total</span><span className="font-tight font-semibold tabular-nums">{currency}{(cash + credit).toLocaleString()}</span></p>
 </div>
 );
}
 return null;
};

 // Web redesign: "Last 14 days", stacked bars, cash in ink, credit in amber.
 // Same days and the same cash / credit rule as before.
 return (
 <Card className={`flex flex-col ${className}`} style={style}>
 <CardHeader title="Last 14 days" aside={
 <>
 <span className="flex items-center gap-1.5 text-body"><i className="size-2.5 rounded-[3px] bg-ink-2" />Cash sales</span>
 <span className="flex items-center gap-1.5 text-body"><i className="size-2.5 rounded-[3px] bg-amber" />Credit sales</span>
 </>
 } />

 <div className="relative mt-3.5 h-[190px]">
 {!hasData ? (
 <div className="absolute inset-0 flex items-center justify-center text-[13px] text-mute">No sales in the last 14 days yet</div>
 ) : (
 <ResponsiveContainer width="100%" height="100%" debounce={50}>
 <BarChart data={data} margin={{ top: 6, right: 0, left: -14, bottom: 0}} barCategoryGap="22%">
 <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#F0EFED" />
 <XAxis dataKey="date" axisLine={false} tickLine={false} interval="preserveStartEnd"
 tick={{ fill: '#8A9099', fontSize: 11 }} tickFormatter={(v) => String(v).replace(/^\D+\s*/, '')} />
 <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8A9099', fontSize: 11 }} tickFormatter={formatYAxis} width={52} />
 <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(17,20,24,0.03)'}} />
 <Bar dataKey="cash" stackId="a" fill="#2E343B" radius={[0, 0, 1, 1]} maxBarSize={22}
 isAnimationActive={playing} animationBegin={200} animationDuration={280} animationEasing="ease-out" />
 <Bar dataKey="credit" stackId="a" fill="#E8890C" radius={[3, 3, 0, 0]} maxBarSize={22}
 isAnimationActive={playing} animationBegin={200} animationDuration={280} animationEasing="ease-out" />
 </BarChart>
 </ResponsiveContainer>
 )}
 </div>
 </Card>
 );
};

export default DailyRevenueTrendChart;
