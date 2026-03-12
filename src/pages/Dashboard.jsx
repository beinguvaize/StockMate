import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, ShoppingBag, BarChart3, Banknote, ShoppingCart, Package, Plus, Truck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
    const { orders, expenses, products, businessProfile, routes, movementLog } = useAppContext();
    const navigate = useNavigate();

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

    // Operational Metrics
    const activeRoutes = (routes || []).filter(r => r.status === 'ACTIVE');

    // Advanced Diagnostics: Category Sales
    const categorySales = useMemo(() => {
        const catMap = {};
        (orders || []).forEach(order => {
            (order.items || []).forEach(item => {
                const prod = (products || []).find(p => p.id === item.productId);
                const category = prod?.category || 'General';
                catMap[category] = (catMap[category] || 0) + ((item.quantity || 0) * (item.price || 0));
            });
        });
        return Object.keys(catMap).map(name => ({ name, value: catMap[name] }));
    }, [orders, products]);

    const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    // Activity Feed: Merged Timeline
    const activityFeed = useMemo(() => {
        const events = [];
        (orders || []).forEach(o => events.push({ id: `ord-${o.id}`, type: 'ORDER', title: `Order ${o?.id?.slice(-4) || '...' }`, desc: `${o.customerName || 'Walk-in Customer'} · ${businessProfile?.currencySymbol || ''}${o.totalAmount}`, date: o.date, icon: <ShoppingCart size={14} />, color: 'var(--primary)' }));
        (routes || []).forEach(r => events.push({ id: `rt-${r.id}`, type: 'ROUTE', title: r.status === 'ACTIVE' ? 'Route Dispatched' : 'Route Reconciled', desc: `Driver ID: ${r.driverId}`, date: r.status === 'ACTIVE' ? r.date : r.reconciledAt, icon: <Package size={14} />, color: r.status === 'ACTIVE' ? 'var(--warning)' : 'var(--success)' }));
        (movementLog || []).slice(0, 10).forEach(m => events.push({ id: `mv-${m.id}`, type: 'STOCK', title: `Stock ${m.type === 'IN' ? 'In' : 'Out'}`, desc: `${m.productName} (${m.quantity} ${m.type === 'IN' ? 'added' : 'removed'})`, date: m.date, icon: <TrendingUp size={14} />, color: 'var(--text-muted)' }));
        
        return events
            .filter(e => e.date && !isNaN(new Date(e.date).getTime()))
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);
    }, [orders, routes, movementLog, businessProfile]);

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
        for(let i=6; i>0; i--) {
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

            {/* Financial Summary & Management Widgets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                
                {/* Revenue Card */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Revenue</div>
                        <div style={{ color: 'var(--success)', background: 'rgba(16, 185, 129, 0.1)', padding: '0.4rem', borderRadius: '8px' }}><TrendingUp size={18} /></div>
                    </div>
                    <div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{businessProfile?.currencySymbol}{totalSales.toLocaleString()}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{orders.length} total orders</div>
                    </div>
                </div>

                {/* Net Profit Card */}
                <div className="glass-panel" style={{ borderLeft: netProfit < 0 ? '4px solid var(--danger)' : '4px solid var(--primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Profit</div>
                        <div style={{ color: 'var(--primary)', background: 'var(--primary-transparent)', padding: '0.4rem', borderRadius: '8px' }}><DollarSign size={18} /></div>
                    </div>
                    <div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: netProfit >= 0 ? 'var(--text-main)' : 'var(--danger)' }}>
                            {netProfit < 0 ? '-' : ''}{businessProfile?.currencySymbol}{Math.abs(netProfit).toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>After COGS & Expenses</div>
                    </div>
                </div>

                {/* Smart Low Stock Widget */}
                <div className="glass-panel" style={{ gridRow: 'span 2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inventory Monitor</div>
                        <div style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: outOfStockProducts.length > 0 ? 'var(--danger-light)' : 'var(--warning-light)', color: outOfStockProducts.length > 0 ? 'var(--danger)' : 'var(--warning)', fontWeight: 700 }}>
                            {outOfStockProducts.length + lowStockProducts.length} CRITICAL
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {[...outOfStockProducts, ...lowStockProducts].slice(0, 5).map(p => (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{p.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: p.stock === 0 ? 'var(--danger)' : 'var(--warning)' }}>Stock: {p.stock} {p.unit}</div>
                                </div>
                                <button className="btn" onClick={() => navigate('/inventory')} style={{ padding: '0.4rem', background: 'white', border: '1px solid var(--border-color)' }}>
                                    <Plus size={14} />
                                </button>
                            </div>
                        ))}
                        {outOfStockProducts.length === 0 && lowStockProducts.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--success)', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px' }}>
                                <Package size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                <div style={{ fontWeight: 600 }}>All Good!</div>
                                <div style={{ fontSize: '0.75rem' }}>Stock levels are healthy.</div>
                            </div>
                        )}
                        {(outOfStockProducts.length + lowStockProducts.length) > 5 && (
                            <button className="btn btn-secondary" onClick={() => navigate('/inventory')} style={{ fontSize: '0.8rem', width: '100%', marginTop: '0.5rem' }}>
                                View All Alerts
                            </button>
                        )}
                    </div>
                </div>

                {/* Fleet Status Card */}
                <div className="glass-panel" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ backgroundColor: activeRoutes.length > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)', border: activeRoutes.length > 0 ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)', color: activeRoutes.length > 0 ? 'var(--warning)' : 'var(--success)', padding: '1rem', borderRadius: '14px' }}>
                        <Truck size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Fleet Status</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{activeRoutes.length} Active</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{routes.length - activeRoutes.length} reconciled today</div>
                    </div>
                </div>

                {/* Cash & Drawer Discrepancy Card */}
                <div className="glass-panel" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ backgroundColor: cashDiscrepancy !== 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(79, 70, 229, 0.1)', border: cashDiscrepancy !== 0 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(79, 70, 229, 0.2)', color: cashDiscrepancy !== 0 ? 'var(--danger)' : 'var(--primary)', padding: '1rem', borderRadius: '14px' }}>
                        <AlertCircle size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Discrepancies</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: cashDiscrepancy < 0 ? 'var(--danger)' : cashDiscrepancy > 0 ? 'var(--primary)' : 'inherit' }}>
                            {cashDiscrepancy > 0 ? '+' : ''}{businessProfile?.currencySymbol}{cashDiscrepancy.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mismatched drawer cash</div>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
                
            {/* Insight Grid: Charts & Activity */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
                
                {/* Revenue Evolution */}
                <div className="glass-panel">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ padding: '0.5rem', backgroundColor: 'var(--primary-transparent)', borderRadius: '8px' }}>
                            <BarChart3 size={20} color="var(--primary)" />
                        </div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Revenue vs Expenses</h3>
                    </div>

                    <div style={{ height: '300px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border-color)' }} />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(value) => `${businessProfile?.currencySymbol}${value}`} axisLine={{ stroke: 'var(--border-color)' }} />
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: 'white', border: '1px solid var(--border-color)', borderRadius: '12px', fontSize: '0.8rem', boxShadow: 'var(--shadow-lg)' }}
                                    formatter={(value) => [`${businessProfile?.currencySymbol}${value.toFixed(2)}`, undefined]}
                                />
                                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '0.75rem' }} />
                                <Bar dataKey="Revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={24} />
                                <Bar dataKey="Expenses" fill="var(--danger)" opacity={0.6} radius={[4, 4, 0, 0]} barSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Sales by Category */}
                <div className="glass-panel">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ padding: '0.5rem', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: '8px' }}>
                            <ShoppingBag size={20} color="var(--primary)" />
                        </div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Sales by Category</h3>
                    </div>
                    
                    <div style={{ height: '300px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={categorySales} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                                    {categorySales.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: 'white', border: '1px solid var(--border-color)', borderRadius: '12px', fontSize: '0.8rem' }}
                                    formatter={(value) => [`${businessProfile?.currencySymbol}${value.toLocaleString()}`, 'Revenue']}
                                />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '0.75rem' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Real-time Activity Feed */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ padding: '0.5rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px' }}>
                            <TrendingUp size={20} color="var(--success)" />
                        </div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Operational Activity</h3>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', maxHeight: '400px', paddingRight: '0.5rem' }} className="custom-scrollbar">
                        {activityFeed.map((event, idx) => (
                            <div key={event.id} style={{ display: 'flex', gap: '1rem', position: 'relative' }}>
                                {idx !== activityFeed.length - 1 && <div style={{ position: 'absolute', left: '15px', top: '30px', bottom: '-15px', width: '2px', background: 'var(--border-color)', zIndex: 0 }}></div>}
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'white', border: `2px solid ${event.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: event.color, zIndex: 1, flexShrink: 0 }}>
                                    {event.icon}
                                </div>
                                <div style={{ flex: 1, paddingBottom: '1rem' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{event.title}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{event.desc}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(event.date).toLocaleDateString()}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Selling Products */}
                <div className="glass-panel">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ padding: '0.5rem', backgroundColor: 'var(--primary-transparent)', borderRadius: '8px' }}>
                            <TrendingUp size={20} color="var(--primary)" />
                        </div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Top Selling Products</h3>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {topProducts.map((p, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-color)', borderRadius: '12px', transition: 'transform 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
                                <div>
                                    <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.9rem' }}>{p.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.quantity} Units Sold</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1rem' }}>{businessProfile?.currencySymbol}{p.revenue.toLocaleString()}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            </div>
            
        </div>
    );
};

export default Dashboard;
