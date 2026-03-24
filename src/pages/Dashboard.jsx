import React, { useMemo, useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, ShoppingBag, BarChart3, Banknote, ShoppingCart, Package, Plus, Truck, ShieldCheck, ArrowRight, LayoutDashboard, Activity, Users, Calendar } from 'lucide-react';
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
    const { 
        sales, purchases, expenses, products, businessProfile, routes, 
        movementLog, clients, employees, payrollRecords, clientPayments, dayBook
    } = useAppContext();
    const navigate = useNavigate();

    // Core Metrics Calculation
    const [datePreset, setDatePreset] = useState('Today');
    const [customRange, setCustomRange] = useState({ start: '', end: '' });

    const isWithinRange = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        d.setHours(0,0,0,0);
        const today = new Date();
        today.setHours(0,0,0,0);
        
        if (datePreset === 'Today') {
            return d.getTime() === today.getTime();
        } else if (datePreset === 'This Week') {
            const currentDay = today.getDay() === 0 ? 7 : today.getDay(); 
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - currentDay + 1);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            return d >= startOfWeek && d <= endOfWeek;
        } else if (datePreset === 'This Month') {
            return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        } else if (datePreset === 'Last Month') {
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
        } else if (datePreset === 'Custom Range') {
            if (!customRange.start || !customRange.end) return true;
            const start = new Date(customRange.start);
            const end = new Date(customRange.end);
            return d >= start && d <= end;
        }
        return true;
    };

    // New KPIs
    const rangeSales = (sales || []).filter(s => isWithinRange(s.date)).reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const rangeExpenses = (expenses || []).filter(e => isWithinRange(e.date)).reduce((sum, e) => sum + (e.amount || 0), 0);
    const rangePurchases = (purchases || []).filter(p => isWithinRange(p.date)).reduce((sum, p) => sum + (p.total_cost || 0), 0);
    
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysDayBook = (dayBook || []).find(db => db.date === todayStr);
    const currentCashBalance = todaysDayBook ? (todaysDayBook.closing_balance || 0) : 0;
    
    const totalOutstanding = (clients || []).reduce((sum, c) => sum + (c.outstanding_balance || 0), 0);

    const salariesPending = (employees || []).reduce((sum, e) => {
        const earned = (e.dailyRate ?? e.daily_rate ?? 500) * (e.daysWorked ?? e.days_worked ?? 0);
        return sum + Math.max(0, earned - (e.amountPaid ?? e.amount_paid ?? 0));
    }, 0);

    const lowStockProducts = (products || []).filter(p => p.stock <= (p.low_stock_threshold || 10));
    const pendingSalaryAlerts = (employees || []).filter(e => ((e.dailyRate ?? e.daily_rate ?? 500) * (e.daysWorked ?? e.days_worked ?? 0)) > (e.amountPaid ?? e.amount_paid ?? 0));

    // Chart 1: Daily Sales This Week
    const chart1Data = useMemo(() => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dayMap = {};
        orderedDays.forEach(d => dayMap[d] = 0);
        const now = new Date();
        const currentDay = now.getDay() === 0 ? 7 : now.getDay(); 
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - currentDay + 1);
        startOfWeek.setHours(0,0,0,0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23,59,59,999);

        (sales || []).forEach(s => {
            const d = new Date(s.date);
            if (d >= startOfWeek && d <= endOfWeek) {
                dayMap[days[d.getDay()]] += (s.totalAmount || 0);
            }
        });
        return orderedDays.map(day => ({ name: day, value: dayMap[day] }));
    }, [sales]);

    // Chart 2: This Month vs Last Month
    const chart2Data = useMemo(() => {
        const data = [];
        const today = new Date();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const thisMonthSales = {};
        const lastMonthSales = {};
        for(let i=1; i<=31; i++) { thisMonthSales[i] = 0; lastMonthSales[i] = 0; }
        (sales || []).forEach(s => {
            if(!s.date) return;
            const d = new Date(s.date);
            if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) {
                thisMonthSales[d.getDate()] += (s.totalAmount || 0);
            } else {
                const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                if (d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear()) {
                    lastMonthSales[d.getDate()] += (s.totalAmount || 0);
                }
            }
        });
        for(let i=1; i<=31; i++) {
            if (i <= daysInMonth || lastMonthSales[i] > 0) {
                data.push({ date: i.toString(), thisMonth: thisMonthSales[i], lastMonth: lastMonthSales[i] });
            }
        }
        return data;
    }, [sales]);

    // Chart 3: Cash vs Credit Donut
    const chart3Data = useMemo(() => {
        let cash = 0;
        let credit = 0;
        (sales || []).filter(s => {
            const d = new Date(s.date);
            const today = new Date();
            return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        }).forEach(s => {
            if (s.payment_type === 'cash' || s.paymentMethod === 'CASH') cash += (s.totalAmount || 0);
            else credit += (s.totalAmount || 0);
        });
        return [
            { name: 'Cash Sales', value: cash, color: '#10B981' },
            { name: 'Credit Sales', value: credit, color: '#F59E0B' }
        ];
    }, [sales]);

    const chart3Total = chart3Data.reduce((acc, curr) => acc + curr.value, 0);

    // Chart 4: Expenses by Category
    const chart4Data = useMemo(() => {
        const categories = {};
        (expenses || []).filter(e => {
            const d = new Date(e.date);
            const today = new Date();
            return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        }).forEach(e => {
            categories[e.category] = (categories[e.category] || 0) + (e.amount || 0);
        });
        return Object.keys(categories).map(c => ({ name: c, value: categories[c] })).sort((a,b) => b.value - a.value);
    }, [expenses]);
    
    // Recent Transactions
    const recentTransactions = useMemo(() => {
        const txs = [];
        (sales || []).forEach(s => txs.push({ id: `sale-${s.id}`, time: s.date, type: 'Sale', desc: `Sale to ${s.customerName || 'Walk-in'}`, amount: s.totalAmount, isPositive: true }));
        (expenses || []).forEach(e => txs.push({ id: `exp-${e.id}`, time: e.date, type: 'Expense', desc: e.description || e.category, amount: e.amount, isPositive: false }));
        return txs.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10);
    }, [sales, expenses]);

    // Operational Metrics
    const activeRoutes = (routes || []).filter(r => r.status === 'ACTIVE');

    const topDebtors = useMemo(() => {
        return (clients || [])
            .filter(c => (c.outstanding_balance || 0) > 0)
            .sort((a, b) => (b.outstanding_balance || 0) - (a.outstanding_balance || 0))
            .slice(0, 5);
    }, [clients]);

    // Expense Distribution by Category
    const expenseByCategory = useMemo(() => {
        const catMap = {};
        (expenses || []).forEach(exp => {
            catMap[exp.category] = (catMap[exp.category] || 0) + (exp.amount || 0);
        });
        return Object.keys(catMap).map(name => ({ name, value: catMap[name] }));
    }, [expenses]);

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
        (sales || []).forEach(s => events.push({ id: `ord-${s.id}`, type: 'ORDER', title: `Sale ${s?.id?.slice(-4) || '...' }`, desc: `Client: ${s.customerName || 'Walk-in'} · ₹${s.totalAmount}`, date: s.date, icon: <ShoppingCart size={14} />, color: '#000' }));
        (routes || []).forEach(r => events.push({ id: `rt-${r.id}`, type: 'ROUTE', title: r.status === 'ACTIVE' ? 'Route Dispatched' : 'Route Reconciled', desc: `Driver ID: ${r.driverId}`, date: r.status === 'ACTIVE' ? r.date : r.reconciledAt, icon: <Package size={14} />, color: r.status === 'ACTIVE' ? '#404040' : '#000' }));
        (movementLog || []).slice(0, 10).forEach(m => {
            events.push({ 
                id: `mv-${m.id}`, 
                type: 'STOCK', 
                title: `Stock ${m.type === 'IN' ? 'In' : 'Out'}`, 
                desc: `${m.productName} (${m.quantity} ${m.type === 'IN' ? 'added' : 'removed'})`, 
                date: m.date, 
                icon: <TrendingUp size={14} />, 
                color: '#737373' 
            });
        });
        
        return events
            .filter(e => e.date && !isNaN(new Date(e.date).getTime()))
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);
    }, [sales, routes, movementLog, businessProfile]);

    // Best Selling Products Calculation
    const topProducts = useMemo(() => {
        const productSales = {};
        (sales || []).forEach(order => {
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
    }, [sales]);

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

        // Process Sales (Income)
        (sales || []).forEach(s => {
            if (!s.date) return;
            const dateStr = new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dataMap[dateStr]) {
                dataMap[dateStr].income += (s.totalAmount || 0);
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
    }, [sales, expenses]);

    // Earnings Data for Weekly Performance (Last 7 Days)
    const earningsByDay = useMemo(() => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayMap = {};
        days.forEach(d => dayMap[d] = 0);
        
        const now = new Date();
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        (sales || []).forEach(o => {
            const oDate = new Date(o.date);
            if (oDate >= last7Days && !isNaN(oDate.getTime())) {
                const dayName = days[oDate.getDay()];
                dayMap[dayName] += (o.totalAmount || 0);
            }
        });

        const orderedWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return orderedWeek.map(day => ({
            name: day,
            value: dayMap[day]
        }));
    }, [sales]);

    // System Status Check
    const isConnected = useMemo(() => products !== null && products !== undefined, [products]);

    // Efficiency Metrics Calculation
    const efficiencyStats = useMemo(() => {
        const completedRoutes = (routes || []).filter(r => r.status === 'COMPLETED').length;
        const totalRoutes = (routes || []).length || 1;
        
        const totalStock = (products || []).reduce((sum, p) => sum + (p.stock || 0), 0) || 1;
        const totalMovedOut = (movementLog || []).filter(m => m.type === 'OUT').reduce((sum, m) => sum + (m.quantity || 0), 0);
        
        return [
            { label: 'Vehicle Payload', value: activeRoutes.length > 0 ? 85 : 0, color: 'bg-accent-signature' },
            { label: 'Route Coverage', value: Math.round((completedRoutes / totalRoutes) * 100), color: 'bg-blue-500' },
            { label: 'Stock Turnover', value: Math.min(100, Math.round((totalMovedOut / totalStock) * 100)), color: 'bg-purple-500' }
        ];
    }, [routes, products, movementLog, activeRoutes]);

    // Real Growth Calculation (This 7 days vs Previous 7 days)
    const growthPercent = useMemo(() => {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const currentWeekSales = (sales || []).filter(o => new Date(o.date) >= sevenDaysAgo).reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const previousWeekSales = (sales || []).filter(o => {
            const d = new Date(o.date);
            return d >= fourteenDaysAgo && d < sevenDaysAgo;
        }).reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        if (previousWeekSales === 0) return currentWeekSales > 0 ? 100 : 0;
        return ((currentWeekSales - previousWeekSales) / previousWeekSales) * 100;
    }, [sales]);

    return (
        <div className="animate-fade-in flex flex-col gap-8">
                        {/* Reference-Style Hero Section */}
            <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-black/5 flex flex-col lg:flex-row items-center justify-between gap-8">
                <div className="flex-1 space-y-6">
                    <h1 className="text-6xl font-black text-ink-primary leading-tight tracking-tight">
                        Manage your business <br className="hidden md:block" /> operations easily
                    </h1>
                    <p className="text-ink-secondary text-lg max-w-xl opacity-70">
                        Streamline your inventory, payroll, and fleet operations from a single, powerful dashboard designed for modern retail.
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
            </div>            {/* Financial Overview & Date Range Selector */}
            <div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <h2 className="text-xl font-bold text-ink-primary">Financial Overview</h2>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center text-sm font-bold text-ink-secondary mr-2">
                            <Calendar size={16} className="mr-2 opacity-50" />
                            Date Range
                        </div>
                        <select 
                            value={datePreset}
                            onChange={e => setDatePreset(e.target.value)}
                            className="bg-surface border border-black/10 rounded-pill px-4 py-2 text-sm font-bold text-ink-primary shadow-sm outline-none cursor-pointer hover:border-black/20 transition-all"
                        >
                            <option value="Today">Today</option>
                            <option value="This Week">This Week</option>
                            <option value="This Month">This Month</option>
                            <option value="Last Month">Last Month</option>
                            <option value="All Time">All Time</option>
                            <option value="Custom Range">Custom Range</option>
                        </select>
                        {datePreset === 'Custom Range' && (
                            <div className="flex items-center gap-2">
                                <input type="date" value={customRange.start} onChange={e => setCustomRange({...customRange, start: e.target.value})} className="bg-surface border border-black/10 rounded-pill px-3 py-1.5 text-xs font-bold font-mono text-ink-primary outline-none" />
                                <span className="text-ink-secondary opacity-50 text-xs font-black">TO</span>
                                <input type="date" value={customRange.end} onChange={e => setCustomRange({...customRange, end: e.target.value})} className="bg-surface border border-black/10 rounded-pill px-3 py-1.5 text-xs font-bold font-mono text-ink-primary outline-none" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Today's Sales -> Selected Range Sales */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent pointer-events-none" />
                        <div className="flex justify-between items-start mb-4 relative">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">{datePreset} Sales</p>
                                <h3 className="text-3xl font-bold mt-1 text-green-600">₹{Math.round(rangeSales).toLocaleString()}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-600 shadow-sm group-hover:scale-110 transition-transform">
                                <Banknote className="w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    {/* Today's Expenses -> Selected Range Expenses */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none" />
                        <div className="flex justify-between items-start mb-4 relative">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">{datePreset} Expenses</p>
                                <h3 className="text-3xl font-bold mt-1 text-red-600">₹{Math.round(rangeExpenses).toLocaleString()}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 shadow-sm group-hover:scale-110 transition-transform">
                                <TrendingDown className="w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    {/* Current Cash Balance */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
                        <div className="flex justify-between items-start mb-4 relative">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">Current Cash Balance</p>
                                <h3 className="text-3xl font-bold mt-1 text-blue-600">₹{Math.round(currentCashBalance).toLocaleString()}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm group-hover:scale-110 transition-transform">
                                <DollarSign className="w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    {/* Outstanding Collections */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none" />
                        <div className="flex justify-between items-start mb-4 relative">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">Outstanding Collections</p>
                                <h3 className="text-3xl font-bold mt-1 text-orange-600">₹{Math.round(totalOutstanding).toLocaleString()}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 shadow-sm group-hover:scale-110 transition-transform">
                                <Activity className="w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    {/* Total Purchases This Month -> Range Purchases */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none" />
                        <div className="flex justify-between items-start mb-4 relative">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">{datePreset} Purchases</p>
                                <h3 className="text-3xl font-bold mt-1 text-purple-600">₹{Math.round(rangePurchases).toLocaleString()}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 shadow-sm group-hover:scale-110 transition-transform">
                                <ShoppingBag className="w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    {/* Salary Pending */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent pointer-events-none" />
                        <div className="flex justify-between items-start mb-4 relative">
                            <div>
                                <p className="text-ink-secondary text-sm font-medium">Salary Pending</p>
                                <h3 className="text-3xl font-bold mt-1 text-yellow-600">₹{Math.round(salariesPending).toLocaleString()}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-yellow-50 flex items-center justify-center text-yellow-600 shadow-sm group-hover:scale-110 transition-transform">
                                <Users className="w-6 h-6" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Application Data Visualizations (Task 7 Specs) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart 1: Daily Sales This Week */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col h-[380px]">
                    <h2 className="text-xl font-bold text-ink-primary mb-6">Sales This Week</h2>
                    <div className="flex-1 w-full relative">
                        {chart1Data.reduce((s, d) => s + d.value, 0) === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-ink-secondary opacity-40">
                                <BarChart3 size={32} className="mb-2" />
                                <span className="text-sm font-bold uppercase tracking-widest">No Sales Data for This Week</span>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chart1Data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 700 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }} tickFormatter={(val) => `₹${val > 999 ? (val/1000).toFixed(1) + 'k' : val}`} />
                                    <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }} />
                                    <Bar dataKey="value" fill="#2563EB" radius={[4, 4, 0, 0]} barSize={32} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Chart 2: This Month vs Last Month Area Chart */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col h-[380px]">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-ink-primary">Monthly Sales Comparison</h2>
                        <div className="flex gap-4 text-xs font-bold text-ink-secondary">
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-600 rounded-sm"></div> This Month</span>
                            <span className="flex items-center gap-1"><div className="w-3 h-3 border-2 border-dashed border-slate-400 rounded-sm"></div> Last Month</span>
                        </div>
                    </div>
                    <div className="flex-1 w-full relative">
                        {chart2Data.reduce((s, d) => s + d.thisMonth + d.lastMonth, 0) === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-ink-secondary opacity-40">
                                <TrendingUp size={32} className="mb-2" />
                                <span className="text-sm font-bold uppercase tracking-widest">No Monthly Progression Data</span>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chart2Data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="fillThisMonth" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }} tickFormatter={(val) => `₹${val > 999 ? (val/1000).toFixed(1) + 'k' : val}`} />
                                    <RechartsTooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }} />
                                    <Area type="monotone" dataKey="thisMonth" name="This Month" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#fillThisMonth)" />
                                    <Area type="monotone" dataKey="lastMonth" name="Last Month" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 5" fill="none" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Chart 3: Cash vs Credit Sales Donut */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col h-[380px]">
                    <h2 className="text-xl font-bold text-ink-primary mb-6">Payment Breakdown</h2>
                    <div className="flex-1 w-full relative">
                        {chart3Total === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-ink-secondary opacity-40">
                                <DollarSign size={32} className="mb-2" />
                                <span className="text-sm font-bold uppercase tracking-widest">Awaiting Transactions</span>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={chart3Data} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value" stroke="none">
                                        {chart3Data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                    </Pie>
                                    <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="text-xs font-black uppercase text-ink-secondary opacity-50 tracking-widest">Total</text>
                                    <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-black text-ink-primary tracking-tighter">₹{chart3Total.toLocaleString()}</text>
                                    <RechartsTooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }} formatter={(value) => `₹${value.toLocaleString()}`} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Chart 4: Expense Category Breakdown */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col h-[380px] overflow-hidden">
                    <h2 className="text-xl font-bold text-ink-primary mb-6">Expenses by Category</h2>
                    <div className="flex-1 w-full relative -ml-16">
                        {chart4Data.length === 0 ? (
                            <div className="absolute inset-0 pl-16 flex flex-col items-center justify-center text-ink-secondary opacity-40">
                                <TrendingDown size={32} className="mb-2" />
                                <span className="text-sm font-bold uppercase tracking-widest">No Expenses Currently</span>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chart4Data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(0,0,0,0.05)" />
                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }} tickFormatter={(val) => `₹${val > 999 ? (val/1000).toFixed(0) + 'k' : val}`} />
                                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#1F2937', fontSize: 11, fontWeight: 700 }} width={120} />
                                    <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }} formatter={(value) => `₹${value.toLocaleString()}`} />
                                    <Bar dataKey="value" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
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
                                <p className="text-ink-secondary text-sm font-medium">Low Stock Items</p>
                                <h3 className="text-3xl font-bold mt-1 text-red-600">{lowStockProducts.length}</h3>
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
                            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                            <span className="font-medium">{isConnected ? 'System Dynamic & Syncing' : 'Local Mode / Disconnected'}</span>
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
                                        data={expenseByCategory}
                                        cx="60%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={85}
                                        paddingAngle={4}
                                        dataKey="value"
                                        animationBegin={200}
                                        stroke="none"
                                    >
                                        {expenseByCategory.map((entry, index) => (
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
                        {efficiencyStats.map((stat, i) => (
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

            {/* Actionable Alerts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Low Stock Alerts */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col h-[400px]">
                    <h3 className="text-xl font-bold mb-4 flex items-center justify-between text-ink-primary">
                        <span className="flex items-center gap-2"><AlertCircle className="w-5 h-5 text-red-500" /> Low Stock</span>
                        <span className="bg-red-100 text-red-700 text-[10px] font-black uppercase px-2 py-1 rounded-full">{lowStockProducts.length}</span>
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {lowStockProducts.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-ink-secondary italic text-sm">All products are stocked.</div>
                        ) : (
                            lowStockProducts.map(item => (
                                <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl bg-red-50 border border-red-100/30">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-bold text-ink-primary truncate text-sm">{item.name}</p>
                                            <span className="bg-red-500 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded shadow-sm shrink-0">Low</span>
                                        </div>
                                        <p className="text-[10px] text-ink-secondary font-mono tracking-tighter">Current: <strong className="text-red-600">{item.stock || 0}</strong> / Min: {item.low_stock_threshold || 10}</p>
                                    </div>
                                    <button onClick={() => navigate('/purchases')} className="ml-3 shrink-0 bg-white border border-red-200 text-red-600 hover:bg-red-600 hover:text-white transition-colors text-xs font-bold px-3 py-1.5 rounded-xl shadow-sm">
                                        Restock
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Salary Pending Alerts */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col h-[400px]">
                    <h3 className="text-xl font-bold mb-4 flex items-center justify-between text-ink-primary">
                        <span className="flex items-center gap-2"><Users className="w-5 h-5 text-amber-500" /> Salary Dues</span>
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-black uppercase px-2 py-1 rounded-full">{pendingSalaryAlerts.length}</span>
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {pendingSalaryAlerts.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-ink-secondary italic text-sm">All salaries cleared.</div>
                        ) : (
                            pendingSalaryAlerts.map(emp => {
                                const rate = emp.dailyRate ?? emp.daily_rate ?? 500;
                                const days = emp.daysWorked ?? emp.days_worked ?? 0;
                                const total = rate * days;
                                const paid = emp.amountPaid ?? emp.amount_paid ?? 0;
                                const pending = Math.max(0, total - paid);
                                return (
                                    <div key={emp.id} className="flex flex-col p-4 rounded-2xl bg-amber-50 border border-amber-100/30 gap-3">
                                        <div className="flex items-start justify-between">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-ink-primary truncate text-sm">{emp.name}</p>
                                                <p className="text-[10px] text-ink-secondary font-medium tracking-tight mt-0.5">{days} days × ₹{rate}</p>
                                            </div>
                                            <span className="bg-amber-500 text-white text-[10px] font-black uppercase px-2 py-1 rounded-lg shadow-sm shrink-0">₹{pending.toLocaleString()} Due</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-mono text-ink-secondary">Paid: ₹{paid.toLocaleString()} / Total: ₹{total.toLocaleString()}</p>
                                            <button onClick={() => navigate('/payroll')} className="shrink-0 bg-white border border-amber-200 text-amber-700 hover:bg-amber-600 hover:text-white transition-colors text-xs font-bold px-3 py-1 rounded-xl shadow-sm">
                                                Pay Now
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Top Outstanding Clients */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col h-[400px]">
                    <h3 className="text-xl font-bold mb-4 flex items-center justify-between text-ink-primary">
                        <span className="flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-500" /> Top Debtors</span>
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {(!clients || clients.filter(c => c.outstanding_balance > 0).length === 0) ? (
                            <div className="h-full flex items-center justify-center text-ink-secondary italic text-sm">No outstanding balances.</div>
                        ) : (
                            [...(clients || [])]
                                .filter(c => c.outstanding_balance > 0)
                                .sort((a,b) => (b.outstanding_balance || 0) - (a.outstanding_balance || 0))
                                .slice(0, 5)
                                .map((client, idx) => {
                                    const out = client.outstanding_balance || 0;
                                    const colorClass = out > 5000 ? 'text-red-600' : out >= 1000 ? 'text-orange-600' : 'text-green-600';
                                    const bgClass = out > 5000 ? 'bg-red-50' : out >= 1000 ? 'bg-orange-50' : 'bg-green-50';
                                    const borderClass = out > 5000 ? 'border-red-100' : out >= 1000 ? 'border-orange-100' : 'border-green-100';
                                    
                                    return (
                                        <div key={client.id} className={`flex items-center justify-between p-4 rounded-2xl ${bgClass} border cursor-pointer border-opacity-50 ${borderClass}`}>
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-6 h-6 shrink-0 rounded-full bg-white text-ink-primary font-black text-[10px] flex items-center justify-center shadow-sm">
                                                    #{idx + 1}
                                                </div>
                                                <p className="font-bold text-ink-primary text-sm truncate">{client.name}</p>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0">
                                                <p className={`text-sm font-black font-mono tracking-tighter ${colorClass}`}>
                                                    ₹{Math.round(out).toLocaleString()}
                                                </p>
                                                <button onClick={() => navigate('/clients')} className="bg-white text-ink-primary hover:bg-ink-primary hover:text-white transition-colors text-[10px] uppercase font-black tracking-widest px-2.5 py-1.5 rounded-lg shadow-sm">
                                                    Collect
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                        )}
                    </div>
                </div>
            </div>

            {/* Recent Transactions Table */}
            <div className="bg-white p-6 rounded-[2rem] shadow-premium border border-black/5 flex flex-col mt-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-ink-primary flex items-center gap-2">
                        <Banknote className="w-5 h-5 text-green-500" /> Recent Transactions
                    </h2>
                    <span className="text-[10px] font-black bg-gray-100 px-3 py-1 rounded-full text-ink-secondary uppercase tracking-widest">
                        Last 10 Records
                    </span>
                </div>
                
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                            <tr className="border-b border-black/5 text-ink-secondary text-xs uppercase tracking-wider font-bold">
                                <th className="pb-4 pl-4 font-black">Time</th>
                                <th className="pb-4 font-black">Type</th>
                                <th className="pb-4 font-black">Description</th>
                                <th className="pb-4 pr-4 font-black text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                            {recentTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="py-8 text-center text-sm font-medium text-ink-secondary italic">
                                        No transactions recorded yet.
                                    </td>
                                </tr>
                            ) : (
                                recentTransactions.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="py-4 pl-4">
                                            <p className="text-sm font-bold text-ink-primary">
                                                {new Date(tx.time).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                            </p>
                                            <p className="text-[10px] font-black tracking-widest uppercase text-ink-secondary opacity-50 mt-0.5">
                                                {new Date(tx.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </td>
                                        <td className="py-4">
                                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm ${tx.isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {tx.type}
                                            </span>
                                        </td>
                                        <td className="py-4">
                                            <p className="text-sm font-bold text-ink-primary">{tx.desc}</p>
                                        </td>
                                        <td className="py-4 pr-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <span className={`text-[10px] font-black ${tx.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                                                    {tx.isPositive ? '+' : '−'}
                                                </span>
                                                <p className={`text-sm font-bold font-mono tracking-tight ${tx.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                                    ₹{Math.round(tx.amount || 0).toLocaleString()}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
