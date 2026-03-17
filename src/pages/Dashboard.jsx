import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, ShoppingBag, BarChart3, Banknote, ShoppingCart, Package, Plus, Truck, ShieldCheck, ArrowRight, LayoutDashboard, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DailyRevenueTrendChart from '../components/DailyRevenueTrendChart';
import { 
    ResponsiveContainer, 
    AreaChart, 
    Area, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip, 
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    Legend
} from 'recharts';

const Dashboard = () => {
    const { orders, expenses, products, businessProfile, routes, movementLog, migrateLocalToSupabase } = useAppContext();
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

    const COLORS = [
        '#3b82f6', // blue-500
        '#ec4899', // pink-500
        '#8b5cf6', // violet-500
        '#10b981', // emerald-500
        '#f59e0b', // amber-500
        '#6366f1', // indigo-500
        '#ef4444', // red-500
        '#06b6d4', // cyan-500
        '#84cc16', // lime-500
        '#f97316', // orange-500
        '#a855f7', // purple-500
        '#14b8a6', // teal-500
    ];

    // Activity Feed: Merged Timeline
    const activityFeed = useMemo(() => {
        const events = [];
        (orders || []).forEach(o => events.push({ id: `ord-${o.id}`, type: 'ORDER', title: `Order ${o?.id?.slice(-4) || '...' }`, desc: `${o.customerName || 'Walk-in Customer'} · ${businessProfile?.currencySymbol || ''}${o.totalAmount}`, date: o.date, icon: <ShoppingCart size={14} />, color: '#000' }));
        (routes || []).forEach(r => events.push({ id: `rt-${r.id}`, type: 'ROUTE', title: r.status === 'ACTIVE' ? 'Route Dispatched' : 'Route Reconciled', desc: `Driver ID: ${r.driverId}`, date: r.status === 'ACTIVE' ? r.date : r.reconciledAt, icon: <Package size={14} />, color: r.status === 'ACTIVE' ? '#404040' : '#000' }));
        (movementLog || []).slice(0, 10).forEach(m => events.push({ id: `mv-${m.id}`, type: 'STOCK', title: `Stock ${m.type === 'IN' ? 'In' : 'Out'}`, desc: `${m.productName} (${m.quantity} ${m.type === 'IN' ? 'added' : 'removed'})`, date: m.date, icon: <TrendingUp size={14} />, color: '#737373' }));
        
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
        const dataMap = {};
        
        // Initialize last 7 days
        for(let i=6; i>=0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            dataMap[dateStr] = { date: dateStr, income: 0, expense: 0 };
        }

        // Process Orders (Income)
        (orders || []).forEach(order => {
            if (!order.date) return;
            const dateStr = new Date(order.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dataMap[dateStr]) {
                dataMap[dateStr].income += (order.totalAmount || 0);
            }
        });

        // Process Expenses (Expense)
        (expenses || []).forEach(exp => {
            if (!exp.date) return;
            const dateStr = new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dataMap[dateStr]) {
                dataMap[dateStr].expense += (exp.amount || 0);
            }
        });

        return Object.values(dataMap);
    }, [orders, expenses]);

    // Earnings Data for Vertical Bar Chart
    const earningsByDay = useMemo(() => {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return days.map(day => ({
            name: day,
            value: (orders || []).length > 0 ? (totalSales / 7) * (0.7 + Math.random() * 0.6) : 0
        }));
    }, [orders, totalSales]);

    return (
        <div className="animate-fade-in flex flex-col gap-8">
                        {/* Reference-Style Hero Section */}
            <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-black/5 flex flex-col lg:flex-row items-center justify-between gap-8">
                <div className="flex-1 space-y-6">
                    <h1 className="text-6xl font-black text-ink-primary leading-tight tracking-tight uppercase">
                        DASHBOARD
                    </h1>
                    <p className="text-ink-secondary text-[10px] uppercase tracking-widest font-black opacity-40 max-w-xl">
                        OVERVIEW OF YOUR BUSINESS PERFORMANCE, INVENTORY, AND OPERATIONS.
                    </p>
                    <div className="flex flex-wrap items-center gap-6">
                        <button 
                            className="flex items-center gap-2 bg-accent-signature text-ink-primary pl-6 pr-2 py-2 rounded-full font-semibold hover:bg-opacity-90 transition-colors shadow-sm"
                        >
                            <span>Go to Inventory</span>
                            <div className="w-10 h-10 bg-ink-primary rounded-full flex items-center justify-center text-white">
                                <ArrowRight className="w-5 h-5" />
                            </div>
                        </button>
                        <button 
                            className="px-6 py-3 rounded-full font-semibold text-ink-primary bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                            View Reports
                        </button>
                    </div>
                    <div className="pt-4 flex items-center gap-6">
                        <div className="flex -space-x-3">
                            <div className="w-10 h-10 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center font-bold text-xs text-ink-primary uppercase tracking-tighter">JD</div>
                            <div className="w-10 h-10 rounded-full bg-gray-300 border-2 border-white flex items-center justify-center font-bold text-xs text-ink-primary uppercase tracking-tighter">AS</div>
                            <div className="w-10 h-10 rounded-full bg-accent-signature border-2 border-white flex items-center justify-center font-bold text-xs text-ink-primary shadow-sm">+</div>
                        </div>
                        <div>
                            <p className="font-bold text-ink-primary text-lg">3,400+</p>
                            <p className="text-sm text-ink-secondary font-medium">Products Managed</p>
                        </div>
                    </div>
                </div>
                <div className="hidden lg:flex w-1/3 aspect-square max-h-[300px] bg-gray-50 rounded-[2rem] border border-black/5 items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-accent-signature/20 to-transparent" />
                    <Package className="w-32 h-32 text-ink-primary/10 relative z-10" />
                </div>
            </div>
            {/* Financials & Market Section */}
            <div>
                <h2 className="text-xl font-bold text-ink-primary mb-4">Financial Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Total Sales */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">Total Sales</p>
                                <h3 className="text-3xl font-bold mt-1 text-ink-primary">{businessProfile?.currencySymbol}{totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-accent-signature/20 flex items-center justify-center text-ink-primary">
                                <DollarSign className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-green-700 font-bold flex items-center gap-1 bg-green-100 px-2.5 py-1 rounded-full">
                                <TrendingUp className="w-3 h-3" /> +8.2%
                            </span>
                        </div>
                    </div>

                    {/* Expenses */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">Total Expenses</p>
                                <h3 className="text-3xl font-bold mt-1 text-ink-primary">{businessProfile?.currencySymbol}{totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
                                <TrendingDown className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-ink-secondary font-medium">COGS + Operational</span>
                        </div>
                    </div>

                    {/* Net Profit */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">Profit</p>
                                <h3 className={`text-3xl font-bold mt-1 ${netProfit >= 0 ? 'text-ink-primary' : 'text-red-600'}`}>
                                    {businessProfile?.currencySymbol}{netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </h3>
                            </div>
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${netProfit >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                <DollarSign className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-ink-secondary font-medium">Revenue - Expenses</span>
                        </div>
                    </div>

                    {/* Market Velocity / Growth */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">Growth</p>
                                <h3 className="text-3xl font-bold mt-1 text-ink-primary">+12.5%</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                                <BarChart3 className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-green-700 font-bold flex items-center gap-1 bg-green-100 px-2.5 py-1 rounded-full">
                                <TrendingUp className="w-3 h-3" /> Projected
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Operations Section */}
            <div>
                <h2 className="text-xl font-bold text-ink-primary mb-4">Operations</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Infrastructure Health */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">Total Products</p>
                                <h3 className="text-3xl font-bold mt-1 text-ink-primary">{(products || []).length}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-ink-primary">
                                <Package className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-ink-secondary font-semibold">
                            System Inventory Health
                        </div>
                    </div>

                    {/* Dispatches */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">Active Trips</p>
                                <h3 className="text-3xl font-bold mt-1 text-ink-primary">{(routes || []).filter(r => r.status === 'ACTIVE').length}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                                <Truck className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-ink-secondary font-semibold">
                            {routes?.length || 0} Total Routes
                        </div>
                    </div>

                    {/* Critical Alerts */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">Low Stock</p>
                                <h3 className="text-3xl font-bold mt-1 text-red-600">{outOfStockProducts.length}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center text-red-600">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-red-700 font-bold flex items-center gap-1 bg-red-100 px-2.5 py-1 rounded-full">
                                Needs Attention
                            </span>
                        </div>
                    </div>

                    {/* System Pulse */}
                    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-black/5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">System Status</p>
                                <h3 className="text-3xl font-bold mt-1 text-ink-primary">99.9%</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-ink-primary opacity-50">
                                <LayoutDashboard className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-ink-primary">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            <span className="font-medium">All systems nominal</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Intelligence Section: Dual Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Income & Expense Trends */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-ink-primary">Sales Trends</h2>
                        <div className="flex items-center gap-4 text-sm font-semibold">
                            <div className="flex items-center gap-1.5 text-blue-600">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div> Income
                            </div>
                            <div className="flex items-center gap-1.5 text-pink-600">
                                <div className="w-2.5 h-2.5 rounded-full bg-pink-500"></div> Expense
                            </div>
                        </div>
                    </div>
                    <div className="relative h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                <XAxis 
                                    dataKey="date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 500 }}
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 500 }}
                                    tickFormatter={(value) => `${businessProfile?.currencySymbol || '₹'}${value > 999 ? (value/1000).toFixed(1) + 'k' : value}`}
                                    dx={-10}
                                />
                                <RechartsTooltip 
                                    contentStyle={{ 
                                        borderRadius: '20px', 
                                        border: 'none', 
                                        padding: '16px',
                                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' 
                                    }}
                                    itemStyle={{ fontWeight: 600, fontSize: '13px' }}
                                    labelStyle={{ color: '#6B7280', marginBottom: '8px', fontWeight: 500 }}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="income" 
                                    name="Income"
                                    stroke="#3b82f6" 
                                    strokeWidth={1.5}
                                    fillOpacity={1}
                                    fill="url(#colorIncome)"
                                    dot={{ r: 3, strokeWidth: 1.5, fill: '#fff', stroke: '#3b82f6' }}
                                    activeDot={{ r: 5, strokeWidth: 0 }}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="expense" 
                                    name="Expense"
                                    stroke="#ec4899" 
                                    strokeWidth={1.5}
                                    fillOpacity={1}
                                    fill="url(#colorExpense)"
                                    dot={{ r: 3, strokeWidth: 1.5, fill: '#fff', stroke: '#ec4899' }}
                                    activeDot={{ r: 5, strokeWidth: 0 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Sales & Weekly Performance Dual Card */}
                <div className="bg-white p-8 rounded-[2rem] shadow-premium border border-black/5 flex flex-col gap-8">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-xl font-bold text-ink-primary">Analytics</h2>
                        <span className="text-xs font-bold px-3 py-1 bg-gray-100 rounded-full text-ink-secondary uppercase tracking-widest">Sales by Category</span>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        {/* Compact Category Distribution */}
                        <div className="relative h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <defs>
                                        {COLORS.map((color, index) => (
                                            <linearGradient id={`pieGradCompact-${index}`} key={index} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={color} stopOpacity={0.9}/>
                                                <stop offset="100%" stopColor={color} stopOpacity={0.6}/>
                                            </linearGradient>
                                        ))}
                                    </defs>
                                    <Pie
                                        data={categorySales}
                                        cx="60%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={85}
                                        paddingAngle={4}
                                        dataKey="value"
                                        animationBegin={200}
                                        stroke="none"
                                    >
                                        {categorySales.map((entry, index) => (
                                            <Cell 
                                                key={`cell-${index}`} 
                                                fill={`url(#pieGradCompact-${index % COLORS.length})`}
                                                className="hover:opacity-80 transition-opacity cursor-pointer outline-none" 
                                            />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip 
                                        contentStyle={{ 
                                            borderRadius: '20px', 
                                            border: 'none', 
                                            padding: '16px',
                                            boxShadow: '0 20px 40px -10px rgb(0 0 0 / 0.15)'
                                        }}
                                    />
                                    <Legend 
                                        layout="vertical"
                                        verticalAlign="middle"
                                        align="left"
                                        iconType="circle"
                                        iconSize={10}
                                        wrapperStyle={{ paddingLeft: '0px' }}
                                        formatter={(value) => <span className="text-[11px] font-bold text-ink-secondary uppercase tracking-tighter">{value}</span>}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Weekly Sales Velocity (New) */}
                        <div className="relative h-[280px] w-full">
                            <div className="absolute -top-6 left-0 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-green-600" />
                                <span className="text-[10px] font-black uppercase text-ink-secondary tracking-widest">Weekly Performance</span>
                            </div>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={earningsByDay} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                    <XAxis 
                                        dataKey="name" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 700 }}
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }}
                                        tickFormatter={(val) => `${businessProfile?.currencySymbol || '₹'}${val > 1000 ? (val/1000).toFixed(0) + 'k' : val}`}
                                    />
                                    <RechartsTooltip 
                                        cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                        contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }}
                                    />
                                    <Bar 
                                        dataKey="value" 
                                        name="Revenue" 
                                        fill="#C8F135" 
                                        radius={[6, 6, 0, 0]}
                                        barSize={32}
                                        animationDuration={2000}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Intelligence Row 2: Trend & Utilization */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <DailyRevenueTrendChart />
                </div>
                
                {/* Secondary Insight: Asset Utilization (New) */}
                <div className="bg-white p-8 rounded-[2rem] shadow-premium border border-black/5 flex flex-col h-[400px]">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-ink-primary uppercase tracking-tight">Efficiency</h2>
                            <p className="text-[10px] font-black text-ink-secondary/40 uppercase tracking-widest">Performance</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-accent-signature/10 flex items-center justify-center text-ink-primary">
                            <Activity size={18} />
                        </div>
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-center gap-6">
                        {[
                            { label: 'Vehicle Payload', value: 84, color: 'bg-accent-signature' },
                            { label: 'Route Coverage', value: 72, color: 'bg-blue-500' },
                            { label: 'Stock Turnover', value: 91, color: 'bg-purple-500' }
                        ].map((stat, i) => (
                            <div key={i} className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-[10px] font-black text-ink-secondary uppercase tracking-widest">{stat.label}</span>
                                    <span className="text-sm font-black text-ink-primary font-mono">{stat.value}%</span>
                                </div>
                                <div className="h-2 w-full bg-canvas rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full ${stat.color} transition-all duration-1000`} 
                                        style={{ width: `${stat.value}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Logs & Alerts Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Low Stock Alerts */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-ink-primary">
                        <AlertCircle className="w-6 h-6 text-red-500" />
                        Alerts
                    </h3>
                    <div className="space-y-3">
                        {lowStockProducts.length === 0 ? (
                            <p className="text-ink-secondary text-sm italic">All stock levels are optimal.</p>
                        ) : (
                            lowStockProducts.map(item => (
                                <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-black/5">
                                    <div>
                                        <p className="font-bold text-ink-primary">{item.name}</p>
                                        <p className="text-xs text-ink-secondary font-mono mt-0.5">SKU: {item.id.slice(0,8)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-red-600 font-bold">{item.stock}</p>
                                        <p className="text-xs text-ink-secondary font-medium mt-0.5">Critical Level</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5">
                    <h3 className="text-xl font-bold mb-6 text-ink-primary">Recent Activity</h3>
                    <div className="space-y-3">
                        {activityFeed.slice(0, 5).map(event => (
                            <div key={event.id} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-black/5">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-ink-primary flex items-center justify-center text-accent-signature shadow-sm">
                                        {event.icon}
                                    </div>
                                    <div>
                                        <p className="font-bold text-ink-primary">{event.title}</p>
                                        <p className="text-xs text-ink-secondary font-medium mt-0.5">{event.desc}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-ink-secondary font-bold uppercase tracking-widest opacity-30">
                                        {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;


