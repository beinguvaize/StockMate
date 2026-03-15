import React, { useMemo } from 'react';
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer 
} from 'recharts';
import { useAppContext } from '../context/AppContext';

/**
 * DailyRevenueTrendChart
 * A stacked bar chart showing Daily Cash vs Credit sales over the last 14 days.
 * Follows the high-performance "Obsidian-glass" aesthetic.
 */
const DailyRevenueTrendChart = () => {
    const { orders, businessProfile } = useAppContext();
    const currency = businessProfile?.currencySymbol || '₹';

    const data = useMemo(() => {
        const result = [];
        const now = new Date();
        
        // Generate list for the last 14 days
        for (let i = 13; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(now.getDate() - i);
            
            // Format date for label (Mar 1, Mar 2...)
            const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            // Get ISO date string (YYYY-MM-DD) for matching
            const isoString = date.toISOString().split('T')[0];
            
            // Group orders for this specific date
            const dayOrders = (orders || []).filter(o => {
                if (!o.date) return false;
                return o.date.split('T')[0] === isoString;
            });
            
            const cash = dayOrders
                .filter(o => o.paymentMethod === 'CASH')
                .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
            
            const credit = dayOrders
                .filter(o => o.paymentMethod === 'CREDIT')
                .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
            
            result.push({
                date: label,
                cash,
                credit,
                total: cash + credit
            });
        }
        
        return result;
    }, [orders]);

    const hasData = useMemo(() => {
        return data.some(d => d.total > 0);
    }, [data]);

    const formatYAxis = (value) => {
        if (value >= 1000) return `${currency}${(value / 1000).toFixed(1)}k`;
        return `${currency}${value}`;
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white/90 backdrop-blur-xl border border-black/5 p-4 rounded-2xl shadow-2xl text-ink-primary">
                    <p className="text-ink-secondary text-xs font-bold mb-2 uppercase tracking-widest">{label}</p>
                    <div className="space-y-1">
                        <p className="flex justify-between gap-8 text-sm">
                            <span className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#7F77DD]" />
                                Credit
                            </span>
                            <span className="font-bold">{currency}{payload[1].value.toLocaleString()}</span>
                        </p>
                        <p className="flex justify-between gap-8 text-sm">
                            <span className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#378ADD]" />
                                Cash
                            </span>
                            <span className="font-bold">{currency}{payload[0].value.toLocaleString()}</span>
                        </p>
                        <div className="h-[1px] bg-black/5 my-1" />
                        <p className="flex justify-between gap-8 text-sm font-black">
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
        <div className="bg-white p-8 rounded-[2rem] shadow-premium border border-black/5 flex flex-col h-[400px] overflow-hidden">
            {/* Legend & Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-xl font-bold text-ink-primary mb-1">Revenue Trend</h2>
                    <p className="text-ink-secondary text-xs font-semibold uppercase tracking-widest leading-none">Last 14 days</p>
                </div>
                
                <div className="flex items-center gap-6 text-[10px] md:text-xs">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-[#378ADD]" />
                        <span className="font-bold text-ink-secondary uppercase tracking-tighter">Cash Sales</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-[#7F77DD]" />
                        <span className="font-bold text-ink-secondary uppercase tracking-tighter">Credit Sales</span>
                    </div>
                </div>
            </div>

            <div className="relative flex-1">
                {!hasData ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-ink-secondary font-medium italic">No sales data yet</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%" debounce={10}>
                        <BarChart
                            data={data}
                            margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis 
                                dataKey="date" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 700 }}
                                angle={-45}
                                textAnchor="end"
                                interval={0}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }}
                                tickFormatter={formatYAxis}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
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
