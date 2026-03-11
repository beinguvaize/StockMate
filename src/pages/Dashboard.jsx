import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, ShoppingBag, BarChart3, Banknote, ShoppingCart, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

const Dashboard = () => {
    const { orders, expenses, products, businessProfile, routes } = useAppContext();

    // Core Metrics Calculation
    const totalSales = (orders || []).reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const totalCreditSales = (orders || []).filter(o => o.paymentMethod === 'CREDIT').reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalCashSales = totalSales - totalCreditSales;

    const cashDiscrepancy = useMemo(() => {
        return (routes || []).filter(r => r.status === 'COMPLETED').reduce((sum, r) => {
            const expectedCash = (orders || []).filter(o => o.routeId === r.id && o.paymentMethod === 'CASH').reduce((s, o) => s + (o.totalAmount || 0), 0);
            return sum + ((r.actualCash || 0) - expectedCash);
        }, 0);
    }, [routes, orders]);

    const totalExpenses = (expenses || []).reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const totalCOGS = (orders || []).reduce((sum, order) => sum + (order.totalCogs || 0), 0);

    const grossProfit = totalSales - totalCOGS;
    const netProfit = grossProfit - totalExpenses;

    const lowStockProducts = (products || []).filter(p => p.stock > 0 && p.stock <= (businessProfile?.lowStockThreshold || 20));
    const outOfStockProducts = (products || []).filter(p => p.stock === 0);

    // Best Selling Products Calculation
    const topProducts = useMemo(() => {
        const productSales = {};
        (orders || []).forEach(order => {
            (order.items || []).forEach(item => {
                if (!productSales[item.productId]) {
                    productSales[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
                }
                productSales[item.productId].quantity += (item.quantity || 0);
                productSales[item.productId].revenue += ((item.quantity || 0) * (item.price || 0));
            });
        });

        return Object.values(productSales)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);
    }, [orders]);

    // Chart Data Preparation (Group by Date)
    const chartData = useMemo(() => {
        const dailyData = {};
        for(let i=6; i>=0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            dailyData[label] = { date: label, Revenue: 0, Expenses: 0 };
        }

        (orders || []).forEach(order => {
            const date = new Date(order.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            if (dailyData[date]) dailyData[date].Revenue += (order.totalAmount || 0);
        });

        (expenses || []).forEach(expense => {
            const date = new Date(expense.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            if (dailyData[date]) dailyData[date].Expenses += (expense.amount || 0);
        });

        return Object.values(dailyData);
    }, [orders, expenses]);

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            <div>
                <h1 className="page-title">Dashboard Overview</h1>
                <p style={{ color: 'var(--text-muted)' }}>Welcome back to {businessProfile?.name || 'CashBook System'}</p>
            </div>

            {/* Profit & Loss Section */}
            <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-main)' }}>Financial Summary</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                    
                    <div className="glass-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Revenue</div>
                            <div style={{ color: 'var(--success)' }}><TrendingUp size={20} /></div>
                        </div>
                        <div style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>{businessProfile?.currencySymbol}{totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>

                    <div className="glass-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>COGS & Expenses</div>
                            <div style={{ color: 'var(--warning)' }}><TrendingDown size={20} /></div>
                        </div>
                        <div style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>{businessProfile?.currencySymbol}{(totalCOGS + totalExpenses).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>

                    <div className="glass-panel" style={{ borderLeft: netProfit < 0 ? '4px solid var(--danger)' : '4px solid var(--primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Profit</div>
                            <div style={{ color: 'var(--primary)' }}><DollarSign size={20} /></div>
                        </div>
                        <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: netProfit >= 0 ? 'var(--text-main)' : 'var(--danger)' }}>
                            {netProfit < 0 ? '-' : ''}{businessProfile?.currencySymbol}{Math.abs(netProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>

                    <div className="glass-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inventory Alerts</div>
                            <div style={{ color: outOfStockProducts.length > 0 ? 'var(--danger)' : 'var(--warning)' }}><AlertCircle size={20} /></div>
                        </div>
                        <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: outOfStockProducts.length > 0 ? 'var(--danger)' : 'var(--warning)' }}>
                            {outOfStockProducts.length + lowStockProducts.length}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            {outOfStockProducts.length} out of stock, {lowStockProducts.length} low
                        </div>
                    </div>
                </div>
            </div>

            {/* Operational Metrics Section */}
            <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-main)' }}>Operational Metrics</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                    
                    <div className="glass-panel" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: 'var(--warning)', padding: '1rem', borderRadius: '50%' }}><ShoppingCart size={24} /></div>
                        <div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Accounts Receivable</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{businessProfile?.currencySymbol}{totalCreditSales.toLocaleString()}</div>
                        </div>
                    </div>

                    <div className="glass-panel" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: 'var(--success)', padding: '1rem', borderRadius: '50%' }}><Banknote size={24} /></div>
                        <div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Cash Receipts</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{businessProfile?.currencySymbol}{totalCashSales.toLocaleString()}</div>
                        </div>
                    </div>

                    <div className="glass-panel" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ backgroundColor: cashDiscrepancy !== 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)', border: cashDiscrepancy !== 0 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(99, 102, 241, 0.2)', color: cashDiscrepancy !== 0 ? 'var(--danger)' : 'var(--primary)', padding: '1rem', borderRadius: '50%' }}><Package size={24} /></div>
                        <div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Drawer Discrepancy</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: cashDiscrepancy < 0 ? 'var(--danger)' : cashDiscrepancy > 0 ? 'var(--primary)' : 'inherit' }}>
                                {cashDiscrepancy > 0 ? '+' : ''}{businessProfile?.currencySymbol}{cashDiscrepancy.toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
                
                {/* Left Column: Revenue Chart */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ padding: '0.5rem', backgroundColor: 'var(--primary-transparent)', borderRadius: '8px' }}>
                            <BarChart3 size={20} color="var(--primary)" />
                        </div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Revenue vs Expenses (7 Days)</h3>
                    </div>

                    <div style={{ height: '300px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border-color)' }} />
                                <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(value) => `${businessProfile?.currencySymbol}${value}`} axisLine={{ stroke: 'var(--border-color)' }} />
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'white' }}
                                    formatter={(value) => [`${businessProfile?.currencySymbol}${value.toFixed(2)}`, undefined]}
                                />
                                <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '20px' }} />
                                <Bar dataKey="Revenue" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="Expenses" fill="var(--danger)" opacity={0.7} radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Right Column: Top Products */}
                <div className="glass-panel">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ padding: '0.5rem', backgroundColor: 'var(--primary-transparent)', borderRadius: '8px' }}>
                            <ShoppingBag size={20} color="var(--primary)" />
                        </div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Top Selling Products</h3>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {topProducts.map((p, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', transition: 'var(--transition)' }} onMouseOver={e => e.currentTarget.style.transform = 'translateX(5px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateX(0)'}>
                                <div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.name}</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{p.quantity} Units Sold</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{businessProfile?.currencySymbol}{p.revenue.toLocaleString()}</div>
                                </div>
                            </div>
                        ))}
                        {topProducts.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                No sales data available yet.
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
        </div>
    );
};

export default Dashboard;
