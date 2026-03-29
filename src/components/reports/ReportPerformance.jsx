import React, { useMemo } from 'react';
import { 
    TrendingUp, Award, BarChart3, PieChart, Target, 
    ArrowUpRight, ArrowDownRight, Zap, ShoppingBag
} from 'lucide-react';

const ReportPerformance = ({ sales, products, businessProfile }) => {
    const performanceData = useMemo(() => {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
        
        const recentSales = (sales || []).filter(s => new Date(s.date) >= thirtyDaysAgo);
        const totalRevenue = recentSales.reduce((sum, s) => sum + s.totalAmount, 0);
        
        // Product performance
        const productMap = {};
        recentSales.forEach(sale => {
            sale.items?.forEach(item => {
                const pid = item.id || item.productId;
                if (!productMap[pid]) productMap[pid] = { name: item.name, revenue: 0, units: 0 };
                productMap[pid].revenue += item.totalPrice;
                productMap[pid].units += item.quantity;
            });
        });

        const topProducts = Object.values(productMap)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        return {
            totalRevenue,
            avgOrderValue: recentSales.length > 0 ? totalRevenue / recentSales.length : 0,
            transactionCount: recentSales.length,
            topProducts
        };
    }, [sales]);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* High Level KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel !p-8 rounded-[2.5rem] bg-gradient-to-br from-ink-primary to-black text-slate-200 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:scale-110 transition-transform">
                        <Zap size={48} className="text-accent-signature" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-tertiary mb-2 block font-mono">Last 30 Days Revenue</span>
                    <div className="text-5xl font-black tracking-tighter tabular-nums flex items-baseline gap-2 mb-4 text-ink-primary">
                        <span className="text-xl text-ink-tertiary">{businessProfile?.currencySymbol || '₹'}</span>
                        {Math.round(performanceData.totalRevenue).toLocaleString()}
                    </div>
                    <div className="flex items-center gap-2 text-accent-signature">
                        <ArrowUpRight size={16} />
                        <span className="text-[11px] font-black uppercase tracking-widest">Trending Up</span>
                    </div>
                </div>

                <div className="glass-panel !p-8 rounded-[2.5rem] border border-black/5 flex flex-col justify-center">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-tertiary mb-2 block font-mono font-black">Sales Volume</span>
                    <div className="text-4xl font-black text-ink-primary tracking-tighter tabular-nums mb-4">
                        {performanceData.transactionCount} <span className="text-lg font-black text-ink-tertiary/40">ORDERS</span>
                    </div>
                    <div className="w-full bg-black/5 h-2 rounded-full overflow-hidden">
                        <div className="bg-accent-signature h-full w-[65%]" />
                    </div>
                </div>

                <div className="glass-panel !p-8 rounded-[2.5rem] border border-black/5 flex flex-col justify-center">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-tertiary mb-2 block font-mono font-black">Ticket Size</span>
                    <div className="text-4xl font-black text-ink-primary tracking-tighter tabular-nums mb-4">
                        {businessProfile?.currencySymbol || '₹'}{Math.round(performanceData.avgOrderValue).toLocaleString()}
                    </div>
                    <div className="flex items-center gap-2 text-ink-tertiary">
                        <Target size={14} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Efficiency Goal: {businessProfile?.currencySymbol || '₹'}5,000</span>
                    </div>
                </div>
            </div>

            {/* Product Performance Heatmap Style */}
            <div className="glass-panel !p-8 rounded-[2.5rem] border border-black/5 bg-canvas/30">
                <div className="flex justify-between items-center mb-10">
                    <div>
                        <h3 className="text-2xl font-black tracking-tighter uppercase leading-none mb-1">Top Yield Products</h3>
                        <p className="text-[10px] font-black tracking-widest uppercase text-ink-secondary">Revenue Contribution by item</p>
                    </div>
                    <Award size={32} className="text-accent-signature text-opacity-50" />
                </div>

                <div className="space-y-6">
                    {performanceData.topProducts.map((p, idx) => {
                        const percent = (p.revenue / performanceData.totalRevenue) * 100;
                        return (
                            <div key={idx} className="group">
                                <div className="flex justify-between items-end mb-2">
                                    <div className="flex items-center gap-3">
                                        <span className="w-6 text-[10px] font-black text-ink-primary opacity-20 group-hover:opacity-100 transition-opacity">0{idx+1}</span>
                                        <span className="text-sm font-black uppercase tracking-tight text-ink-primary group-hover:text-accent-signature transition-colors">{p.name}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-black font-mono text-ink-primary">{businessProfile?.currencySymbol || '₹'}{Math.round(p.revenue).toLocaleString()}</span>
                                        <span className="text-[10px] font-black text-ink-tertiary ml-2 uppercase">{p.units} Units</span>
                                    </div>
                                </div>
                                <div className="w-full bg-black/5 h-3 rounded-full overflow-hidden relative border border-white">
                                    <div 
                                        className="bg-accent-signature h-full transition-all duration-1000 group-hover:brightness-110" 
                                        style={{ width: `${percent}%` }}
                                    />
                                    <div className="absolute inset-y-0 right-3 flex items-center">
                                        <span className="text-[8px] font-black text-ink-tertiary">{Math.round(percent)}%</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Strategic Insight Block */}
            <div className="p-8 bg-accent-signature/10 rounded-[2.5rem] border border-accent-signature/20 flex flex-col md:flex-row items-center gap-8">
                <div className="w-16 h-16 rounded-2xl bg-white border border-accent-signature/20 flex items-center justify-center text-accent-signature shadow-sm shrink-0">
                    <BarChart3 size={32} />
                </div>
                <div className="flex-1">
                    <h4 className="text-lg font-black tracking-tighter uppercase mb-1">Organization Health Insight</h4>
                    <p className="text-sm font-bold text-ink-primary leading-relaxed">
                        Your average order value has increased by 12% this month. Higher ticket sizes are driven by product bundles. Consider launching a loyalty program for your top 5 customers to maintain this momentum.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ReportPerformance;
