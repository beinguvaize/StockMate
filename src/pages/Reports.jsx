import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    Calendar, FileText, Download, Printer, TrendingUp, Package, Receipt, 
    ArrowUpRight, ArrowDownRight, X, Check, Users, Truck, 
    DollarSign, Activity, PieChart, Layers, ArrowRight, TrendingDown
} from 'lucide-react';
import { 
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
    Tooltip, BarChart, Bar, Cell, ComposedChart, Line
} from 'recharts';

const Reports = () => {
    const { 
        orders, movementLog, expenses, businessProfile, shops, users, vehicles, routes,
        employees, payrollRecords, products, updateProduct, getUserName, getVehicleName, getEmployeeName, hasPermission 
    } = useAppContext();
    const [dateRange, setDateRange] = useState('MONTH');
    const [activeTab, setActiveTab] = useState('SALES');
    const [invoiceOrder, setInvoiceOrder] = useState(null);
    const [editedProducts, setEditedProducts] = useState([]);
    const [bulkSearch, setBulkSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Sync edited products when tab switches to ADVANCED
    useEffect(() => {
        if (activeTab === 'ADVANCED') {
            setEditedProducts(JSON.parse(JSON.stringify(products))); // Deep clone
        }
    }, [activeTab, products]);

    const handleBulkEdit = (productId, field, value) => {
        setEditedProducts(prev => prev.map(p => {
            if (p.id === productId) {
                const updated = { ...p, [field]: value };
                // Ensure numbers are handled
                if (['costPrice', 'sellingPrice', 'stock', 'taxRate'].includes(field)) {
                    updated[field] = parseFloat(value) || 0;
                }
                return updated;
            }
            return p;
        }));
    };

    const saveBulkChanges = async () => {
        setIsSaving(true);
        try {
            // Only update products that actually changed
            const changedProducts = editedProducts.filter(ep => {
                const original = products.find(p => p.id === ep.id);
                return JSON.stringify(original) !== JSON.stringify(ep);
            });

            if (changedProducts.length === 0) {
                alert("No changes detected.");
                return;
            }

            for (const p of changedProducts) {
                await updateProduct(p);
            }
            alert(`Successfully updated ${changedProducts.length} items.`);
        } catch (err) {
            console.error("Bulk update failed:", err);
            alert("Failed to save some changes.");
        } finally {
            setIsSaving(false);
        }
    };

    // Export Logic
    const exportToCSV = () => {
        let headers = [];
        let rows = [];
        let filename = `Report_${activeTab}_${dateRange}_${new Date().toISOString().split('T')[0]}.csv`;

        if (activeTab === 'SALES') {
            headers = ['Order ID', 'Customer', 'Method', 'Status', 'Total', 'COGS', 'Date'];
            rows = filteredOrders.map(o => [
                o.id, 
                o.customerInfo?.name || 'Walk-in', 
                o.paymentMethod, 
                o.status, 
                o.totalAmount, 
                o.totalCogs || 0, 
                o.date
            ]);
        } else if (activeTab === 'MOVEMENTS') {
            headers = ['Date', 'Product', 'Type', 'Quantity', 'Reason'];
            rows = filteredMovements.map(m => [
                m.date, m.productName, m.type, m.quantity, m.reason
            ]);
        } else if (activeTab === 'EXPENSES') {
            headers = ['Date', 'Category', 'Title', 'Amount', 'Notes'];
            rows = filteredExpenses.map(e => [
                e.date, e.category, e.title, e.amount, e.notes || ''
            ]);
        }

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Filter Logic
    const filterByDate = (items, dateKey) => {
        if (dateRange === 'ALL') return items;
        const now = new Date();
        const past = new Date();

        if (dateRange === 'TODAY') past.setHours(0, 0, 0, 0);
        else if (dateRange === 'WEEK') past.setDate(now.getDate() - 7);
        else if (dateRange === 'MONTH') past.setMonth(now.getMonth() - 1);

        return items.filter(item => new Date(item[dateKey]) >= past);
    };

    const filteredOrders = useMemo(() => filterByDate(orders, 'date'), [orders, dateRange]);
    const filteredMovements = useMemo(() => filterByDate(movementLog, 'date'), [movementLog, dateRange]);
    const filteredExpenses = useMemo(() => filterByDate(expenses, 'date'), [expenses, dateRange]);
    const filteredPayroll = useMemo(() => filterByDate(payrollRecords || [], 'processed_at'), [payrollRecords, dateRange]);

    const filteredData = {
        sales: filteredOrders,
        expenses: filteredExpenses,
        payroll: filteredPayroll
    };

    // Sales Metrics
    const metrics = useMemo(() => {
        let sales = 0;
        let cogs = 0;
        let recovered = 0;
        let pending = 0;
        let totalRecoveryDays = 0;
        let recoveryCount = 0;

        filteredData.sales.forEach(o => {
            sales += o.totalAmount;
            const orderCogs = (o.totalCogs || 0);
            cogs += orderCogs;
            
            // Profit per order calculation
            o.orderProfit = o.totalAmount - orderCogs;
            o.totalItems = o.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

            if (o.paymentStatus === 'PAID') {
                recovered += o.totalAmount;
                // Calculate recovery velocity if both dates exist
                if (o.date && o.lastPaymentDate) {
                    const days = Math.ceil((new Date(o.lastPaymentDate) - new Date(o.date)) / (1000 * 60 * 60 * 24));
                    totalRecoveryDays += Math.max(0, days);
                    recoveryCount++;
                }
            } else {
                recovered += (o.paidAmount || 0);
                pending += (o.totalAmount - (o.paidAmount || 0));
            }
        });

        const expensesTotal = filteredData.expenses.reduce((sum, e) => sum + e.amount, 0);
        const payrollTotal = filteredData.payroll.reduce((sum, p) => sum + p.amount, 0);
        const totalOutgoings = expensesTotal + payrollTotal + cogs;
        const netProfit = recovered - totalOutgoings;
        
        const collectionRate = sales > 0 ? (recovered / sales) * 100 : 100;
        const recoveryVelocity = recoveryCount > 0 ? (totalRecoveryDays / recoveryCount).toFixed(1) : '0.0';
        const expenseRatio = sales > 0 ? ((expensesTotal + payrollTotal) / sales * 100).toFixed(1) : '0.0';

        return { 
            sales, 
            cogs, 
            recovered, 
            pending, 
            collectionRate,
            netProfit, 
            expenses: expensesTotal, 
            payroll: payrollTotal,
            recoveryVelocity,
            expenseRatio
        };
    }, [filteredData]);

    const movementDetails = useMemo(() => {
        return filteredMovements.map(m => ({
            ...m,
            staffName: getEmployeeName(m.processedBy) || 'SYSTEM',
            // Simple heuristic for stock after if not provided
            stockAfter: m.currentStock || (m.type === 'IN' ? (m.prevStock || 0) + m.quantity : (m.prevStock || 0) - m.quantity)
        }));
    }, [filteredMovements, getEmployeeName]);
    // Movement Metrics
    const itemsIn = filteredMovements.filter(m => m.type === 'IN').reduce((sum, m) => sum + m.quantity, 0);
    const itemsOut = filteredMovements.filter(m => m.type === 'OUT').reduce((sum, m) => sum + m.quantity, 0);

    // Expense Metrics
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Sales Attribution Metrics
    const attributionByRep = filteredOrders.reduce((acc, order) => {
        if (order.status !== 'CANCELLED') {
            // Primary attribution: Booking Agent
            if (order.bookedBy) {
                acc[order.bookedBy] = (acc[order.bookedBy] || 0) + order.totalAmount;
            }
            // Secondary attribution: Driver (from route)
            if (order.deliveredBy) {
                const route = routes.find(r => r.id === order.deliveredBy);
                if (route && route.driverId) {
                    acc[route.driverId] = (acc[route.driverId] || 0) + order.totalAmount;
                }
            }
        }
        return acc;
    }, {});

    const attributionByFleet = filteredOrders.reduce((acc, order) => {
        if (order.status === 'COMPLETED' && order.deliveredBy) {
            acc[order.deliveredBy] = (acc[order.deliveredBy] || 0) + order.totalAmount;
        }
        return acc;
    }, {});

    // --- Analytics Data Preparation ---
    const chartData = useMemo(() => {
        const dataMap = {};
        const days = dateRange === 'WEEK' ? 7 : (dateRange === 'MONTH' ? 30 : 14);
        
        for(let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            dataMap[dateStr] = { date: dateStr, sales: 0, expenses: 0, profit: 0 };
        }

        filteredOrders.forEach(o => {
            const ds = new Date(o.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dataMap[ds]) {
                dataMap[ds].sales += o.totalAmount;
                dataMap[ds].profit += (o.totalAmount - (o.totalCogs || 0));
            }
        });

        filteredExpenses.forEach(e => {
            const ds = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dataMap[ds]) {
                dataMap[ds].expenses += e.amount;
                dataMap[ds].profit -= e.amount;
            }
        });

        return Object.values(dataMap);
    }, [filteredOrders, filteredExpenses, dateRange]);

    const performanceData = useMemo(() => {
        return Object.entries(attributionByRep)
            .map(([id, val]) => ({ 
                name: getUserName(id) !== 'Unknown User' ? getUserName(id) : getEmployeeName(id), 
                value: val 
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [attributionByRep, getUserName, getEmployeeName]);

    const handlePrint = () => {
        window.print();
    };

    const handlePrintInvoice = () => {
        window.print();
    };

    const getClientName = (shopId) => {
        if (shopId === 'POS-WALKIN') return 'Walk-in Customer';
        const shop = shops.find(s => s.id === shopId);
        return shop ? shop.name : shopId;
    };

    return (
        <>
            <div className="flex flex-col gap-5 pb-8 print-area">
                <div className="no-print flex flex-col md:flex-row justify-between items-start md:items-center pb-8 border-b border-black/5 gap-6">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-10 bg-accent-signature rounded-full"></div>
                            <h1 className="text-6xl font-black text-ink-primary uppercase tracking-tighter leading-none">REPORTS.</h1>
                        </div>
                        <p className="text-[10px] font-black text-[#4b5563] tracking-[0.4em] uppercase opacity-85 flex items-center gap-3 mt-3">
                            <Activity size={12} className="text-accent-signature" />
                            BUSINESS PERFORMANCE & REPORTS
                        </p>
                    </div>
                    <div className="flex items-center gap-4 bg-white p-3 rounded-[2rem] border border-black/5 shadow-premium">
                        <div className="flex flex-col text-right px-5 border-r border-black/5">
                            <span className="text-[8px] font-black text-[#4b5563] uppercase tracking-widest opacity-70 mb-1">SYSTEM STATUS</span>
                            <span className="text-[10px] font-black text-green-500 uppercase tracking-widest flex items-center justify-end gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></span>
                                SECURE CONNECTION
                            </span>
                        </div>
                        <div className="flex -space-x-4 px-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="w-10 h-10 rounded-full border-4 border-white bg-canvas flex items-center justify-center text-[10px] font-black shadow-sm uppercase">
                                    {String.fromCharCode(64 + i)}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            {/* Global Control Toolbar - h-12 Sync */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 no-print items-center">
                 <div className="glass-panel !p-1 bg-white border border-black/5 flex items-center justify-between rounded-pill shadow-sm !h-14 overflow-hidden col-span-1">
                    <div className="flex items-center gap-4 pl-4">
                        <div className="w-10 h-10 rounded-xl bg-accent-signature text-ink-primary flex items-center justify-center shrink-0 shadow-lg group-hover:rotate-12 transition-transform">
                            <TrendingUp size={20} />
                        </div>
                        <div className="flex flex-col">
                            <div className="text-[10px] font-black uppercase tracking-widest text-[#4b5563] opacity-70">Summary</div>
                            <div className="text-sm font-black text-ink-primary tracking-tighter leading-none">Business Overview</div>
                        </div>
                    </div>
                </div>

                <div className="flex h-14 p-1 bg-surface rounded-pill border border-black/5 shadow-inner items-center col-span-2 px-6">
                    <Calendar size={16} className="text-[#4b5563] opacity-70 shrink-0" />
                    <div className="h-4 w-px bg-black/10 mx-4"></div>
                    <select 
                        className="flex-1 bg-transparent border-none font-black text-[11px] uppercase tracking-[0.2em] text-ink-primary outline-none cursor-pointer appearance-none" 
                        value={dateRange} 
                        onChange={e => setDateRange(e.target.value)}
                    >
                        <option value="TODAY">TODAY</option>
                        <option value="WEEK">LAST 7 DAYS</option>
                        <option value="MONTH">LAST 30 DAYS</option>
                        <option value="ALL">ALL TIME</option>
                    </select>
                    <div className="w-8 h-8 rounded-full bg-canvas flex items-center justify-center text-[#4b5563] opacity-70">
                        <ArrowDownRight size={14} />
                    </div>
                </div>

                {hasPermission('EXPORT_REPORTS') && (
                    <button className="btn-signature !h-14 !py-0 !text-[11px] !font-black !tracking-[0.2em] !rounded-pill group" onClick={handlePrint}>
                        PRINT
                        <div className="icon-nest ml-4 !w-10 !h-10 group-hover:bg-ink-primary group-hover:text-accent-signature transition-all">
                            <Printer size={18} />
                        </div>
                    </button>
                )}
            </div>

            {/* Print Header */}
            <div className="print-only hidden mb-10 text-center">
                <h2 className="text-3xl font-black uppercase tracking-tighter">{businessProfile.name}</h2>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-70 mt-2">Business Performance Report | Generated: {new Date().toLocaleDateString()}</div>
            </div>

            {/* Top Level KPI Cards */}
            {/* Top Level KPI Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {/* LARGE HUB: Revenue & Collection */}
                <div className="md:col-span-2 lg:col-span-3 glass-panel !p-7 flex flex-col justify-between min-h-[280px] group hover:scale-[1.01] transition-all duration-700 bg-white border-black/5 shadow-premium !rounded-[2.5rem] relative overflow-hidden">
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent-signature/10 rounded-full blur-[100px] group-hover:bg-accent-signature/20 transition-all duration-1000"></div>
                    
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <span className="text-[9px] font-black uppercase tracking-[0.4em] text-[#4b5563] opacity-85 mb-1 block">TOTAL MONEY COLLECTED</span>
                                <h3 className="text-6xl font-black text-ink-primary tracking-tighter leading-none tabular-nums">
                                    {businessProfile?.currencySymbol || '₹'}{Math.round(metrics.recovered).toLocaleString()}
                                </h3>
                            </div>
                            <div className="w-14 h-14 rounded-2xl bg-ink-primary text-accent-signature flex items-center justify-center shadow-xl group-hover:rotate-12 transition-transform duration-500">
                                <DollarSign size={24} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <span className="text-[8px] font-black text-[#4b5563] uppercase tracking-widest opacity-85 mb-1 block">Total Sales Value</span>
                                <div className="text-xl font-black text-ink-primary tracking-tight font-mono">{businessProfile?.currencySymbol || '₹'}{Math.round(metrics.sales).toLocaleString()}</div>
                                <div className="h-1.5 w-full bg-black/5 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-accent-signature shadow-[0_0_12px_#C8F135]" style={{ width: `${Math.round(metrics.collectionRate)}%` }}></div>
                                </div>
                            </div>
                            <div className="flex flex-col justify-between">
                                <span className="text-[8px] font-black text-[#4b5563] uppercase tracking-widest opacity-85 mb-1 block">Collection Success</span>
                                <div className="text-xl font-black text-accent-signature-hover tracking-tight">{Math.round(metrics.collectionRate)}%</div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[8px] font-black text-green-600 uppercase tracking-widest">Normal Yield</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-5 border-t border-black/5 flex justify-between items-center relative z-10">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-[#4b5563] uppercase tracking-widest opacity-70">Recovery Cycle Velocity</span>
                            <span className="text-sm font-black text-ink-primary">{metrics.recoveryVelocity} Days avg</span>
                        </div>
                        <div className="flex -space-x-2">
                            {[1,2,3].map(i => <div key={i} className="w-5 h-5 rounded-full border-2 border-white bg-canvas"></div>)}
                        </div>
                    </div>
                </div>

                {/* TALL: Net Position */}
                <div className="md:col-span-2 lg:col-span-2 glass-panel !p-7 flex flex-col justify-between min-h-[280px] group bg-white border-black/5 shadow-premium !rounded-[2.5rem] relative overflow-hidden cursor-pointer">
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-black/[0.02] to-transparent"></div>
                    
                    <div className="relative z-10">
                        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-[#4b5563] mb-4 block opacity-85">PROFITS AFTER COSTS</span>
                        <div className="flex items-end gap-2 mb-2">
                            <h3 className={`text-5xl font-black tracking-tighter leading-none tabular-nums ${metrics.netProfit >= 0 ? 'text-ink-primary' : 'text-red-500'}`}>
                                {businessProfile?.currencySymbol || '₹'}{Math.round(metrics.netProfit).toLocaleString()}
                            </h3>
                        </div>
                        <p className="text-[11px] font-medium text-[#4b5563] leading-relaxed max-w-[200px] opacity-90">
                            Remaining cash after accounting for stock costs, pay, and all bills.
                        </p>
                    </div>

                    <div className="relative z-10 space-y-4">
                        <div className="p-4 bg-canvas/50 rounded-2xl border border-black/5 backdrop-blur-md">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[8px] font-black text-[#4b5563] uppercase tracking-widest opacity-85">Expense Ratio</span>
                                <span className="text-[10px] font-black text-ink-primary">{metrics.expenseRatio}%</span>
                            </div>
                            <div className="h-1 w-full bg-black/5 rounded-full mt-1 overflow-hidden">
                                <div className="h-full bg-accent-signature" style={{ width: `${metrics.expenseRatio}%` }}></div>
                            </div>
                        </div>
                        <button className="w-full py-3 bg-accent-signature text-ink-primary rounded-pill text-[9px] font-black uppercase tracking-[0.2em] hover:scale-105 transition-all shadow-xl">
                            Quick Summary
                        </button>
                    </div>
                </div>

                {/* SQUARE: Credit Exposure */}
                <div className="lg:col-span-1 glass-panel !p-8 flex flex-col justify-between group hover:bg-canvas transition-all duration-500 bg-white border-black/5 shadow-premium !rounded-[3rem] relative overflow-hidden h-full">
                    <div>
                        <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <Activity size={20} />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-[#4b5563] opacity-70 block mb-1">MONEY OWED TO YOU</span>
                        <div className="text-3xl font-black text-ink-primary tracking-tighter tabular-nums mb-2">
                            {businessProfile?.currencySymbol || '₹'}{Math.round(metrics.pending).toLocaleString()}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black text-red-500 uppercase px-2 py-0.5 bg-red-50 rounded-full border border-red-100">Pending</span>
                        </div>
                    </div>
                    
                    <div className="h-2 w-full bg-black/5 rounded-full overflow-hidden mt-6">
                        <div className="h-full bg-red-400" style={{ width: `${Math.min(100, (metrics.pending / (metrics.sales || 1)) * 100)}%` }}></div>
                    </div>
                </div>

                {/* WIDE: Expenditure Matrix Overlay */}
                <div className="md:col-span-4 lg:col-span-4 glass-panel !p-7 flex flex-col md:flex-row justify-between items-center gap-6 bg-white border-black/5 shadow-premium !rounded-[2.5rem] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-canvas to-transparent pointer-events-none"></div>
                    
                    <div className="flex-1 space-y-4 relative z-10 w-full">
                        <div>
                            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-[#4b5563] opacity-85 mb-2 block">TOTAL BUSINESS EXPENSES</span>
                            <h4 className="text-4xl font-black text-ink-primary tracking-tighter leading-none">
                                {businessProfile?.currencySymbol || '₹'}{Math.round(metrics.expenses + metrics.payroll).toLocaleString()}
                            </h4>
                        </div>
                        
                        <div className="flex gap-6">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-3 bg-blue-500 rounded-full"></div>
                                <div>
                                    <div className="text-[7px] font-black text-[#4b5563] uppercase opacity-85">Wages</div>
                                    <div className="text-xs font-black text-ink-primary leading-none">{businessProfile?.currencySymbol || '₹'}{Math.round(metrics.payroll).toLocaleString()}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-3 bg-pink-500 rounded-full"></div>
                                <div>
                                    <div className="text-[7px] font-black text-[#4b5563] uppercase opacity-85">Other</div>
                                    <div className="text-xs font-black text-ink-primary leading-none">{businessProfile?.currencySymbol || '₹'}{Math.round(metrics.expenses).toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full md:w-64 h-32 relative z-10">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[
                                { name: 'Payroll', value: metrics.payroll },
                                { name: 'Overhead', value: metrics.expenses }
                            ]}>
                                <Bar dataKey="value" radius={[10, 10, 10, 10]} barSize={40}>
                                    <Cell fill="#3b82f6" />
                                    <Cell fill="#ec4899" />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* SMALL: Stock Flow Velocity */}
                <div className="md:col-span-2 lg:col-span-2 glass-panel !p-8 flex items-center gap-6 bg-white border-black/5 shadow-premium !rounded-[3rem] group">
                    <div className="w-16 h-16 rounded-3xl bg-accent-signature/10 flex items-center justify-center text-ink-primary group-hover:scale-110 transition-transform">
                        <Package size={28} />
                    </div>
                    <div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-[#4b5563] opacity-70 block mb-1">TOTAL ITEMS MOVED</span>
                        <div className="text-3xl font-black text-ink-primary tracking-tighter leading-none mb-2">
                            {itemsIn + itemsOut} <span className="text-xs opacity-30">ITEMS</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black text-green-600 uppercase">+{itemsIn} IN</span>
                            <div className="w-1 h-1 bg-black/10 rounded-full"></div>
                            <span className="text-[8px] font-black text-red-500 uppercase">-{itemsOut} OUT</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* NEW: Intelligence Terminal - Main Analytics Chart */}
            <div className="glass-panel !p-12 bg-white border border-black/5 shadow-premium !rounded-[3rem] relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-accent-signature/5 rounded-full blur-[120px] -mr-32 -mt-32"></div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 relative z-10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-2 h-2 rounded-full bg-accent-signature"></div>
                            <span className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.4em] opacity-70">SALES & EXPENSE TRENDS</span>
                        </div>
                        <h3 className="text-4xl font-black text-ink-primary tracking-tighter uppercase leading-none">Performance Overview.</h3>
                    </div>
                    
                    <div className="flex items-center gap-6 bg-canvas/50 p-3 rounded-[2rem] border border-black/5">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-accent-signature"></div>
                            <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Revenue</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                            <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Expenses</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                            <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Profit</span>
                        </div>
                    </div>
                </div>

                <div className="h-[400px] w-full relative z-10">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#C8F135" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#C8F135" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
                            <XAxis 
                                dataKey="date" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 9, fontWeight: 900, fill: '#4b5563', opacity: 0.8 }}
                                dy={15}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 9, fontWeight: 900, fill: '#4b5563', opacity: 0.8 }}
                                tickFormatter={(value) => `${businessProfile.currencySymbol}${value.toLocaleString()}`}
                            />
                            <Tooltip 
                                contentStyle={{ 
                                    backgroundColor: '#000', 
                                    border: 'none', 
                                    borderRadius: '1.5rem', 
                                    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                                    padding: '20px'
                                }}
                                itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                                labelStyle={{ color: 'rgba(255,255,255,0.7)', marginBottom: '10px', fontSize: '9px', fontWeight: '900' }}
                                cursor={{ stroke: 'rgba(0,0,0,0.05)', strokeWidth: 2 }}
                            />
                            <Area type="monotone" dataKey="sales" stroke="#C8F135" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
                            <Area type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={4} fill="transparent" />
                            <Area type="monotone" dataKey="expenses" stroke="#ec4899" strokeWidth={3} fillOpacity={1} fill="url(#colorExpenses)" strokeDasharray="10 5" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Attribution Breakdown Cards */}
            <div className="no-print grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Staff Intelligence Hub */}
                <div className="glass-panel !p-12 bg-white border border-black/5 shadow-premium !rounded-[3rem] flex flex-col h-full hover:shadow-2xl transition-all duration-700 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-signature to-transparent opacity-30"></div>
                    <div className="flex justify-between items-center mb-10">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-canvas flex items-center justify-center text-ink-primary shadow-sm border border-black/5">
                                <Users size={28} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-ink-primary">Staff Performance.</h3>
                                <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.3em] opacity-70 mt-1">Sales by Each Staff Member</p>
                            </div>
                        </div>
                        <div className="text-right">
                             <span className="text-[9px] font-black text-green-500 uppercase tracking-widest px-3 py-1 bg-green-50 rounded-full border border-green-100">Live Status</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 space-y-4">
                        {performanceData.length > 0 ? (
                            performanceData.map((item, idx) => (
                                <div key={idx} className="group cursor-pointer">
                                    <div className="flex justify-between items-end mb-2 px-2">
                                        <span className="text-xs font-black text-ink-primary uppercase tracking-tight">{item.name}</span>
                                        <span className="text-sm font-black text-ink-primary font-mono">{businessProfile.currencySymbol}{item.value.toLocaleString()}</span>
                                    </div>
                                    <div className="h-4 w-full bg-canvas rounded-full overflow-hidden border border-black/5 relative">
                                        <div 
                                            className="h-full bg-ink-primary transition-all duration-1000 ease-out flex items-center justify-end px-3"
                                            style={{ width: `${(item.value / (performanceData[0].value || 1)) * 100}%` }}
                                        >
                                            <span className="text-[8px] font-black text-accent-signature uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Highest Sales</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center py-20 opacity-10">
                                <Activity size={64} strokeWidth={1} className="mb-6" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em]">No staff data available</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Fleet Logistics Matrix */}
                <div className="glass-panel !p-12 bg-white border border-black/5 shadow-premium !rounded-[3rem] relative overflow-hidden flex flex-col h-full hover:shadow-2xl transition-all duration-700">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-accent-signature/5 rounded-full -mr-40 -mt-40 blur-[100px]"></div>
                    
                    <div className="flex justify-between items-center mb-10 border-b border-black/5 pb-8 relative z-10">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-canvas flex items-center justify-center text-ink-primary shadow-sm border border-black/5">
                                <Truck size={28} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-ink-primary">Vehicle Performance.</h3>
                                <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.3em] opacity-70 mt-1">Sales by Vehicle</p>
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-canvas flex items-center justify-center text-ink-primary/20">
                            <Activity size={20} />
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-4 relative z-10 flex-1">
                        {Object.entries(attributionByFleet).length > 0 ? (
                            Object.entries(attributionByFleet).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([routeId, amount]) => {
                                const route = routes.find(r => r.id === routeId);
                                const vehicleName = route ? getVehicleName(route.vehicleId) : 'CENTRAL HUB';
                                return (
                                    <div key={routeId} className="flex justify-between items-center p-6 bg-canvas/50 rounded-[2rem] border border-black/5 hover:bg-canvas transition-all duration-500 hover:-translate-y-1 group">
                                        <div className="flex items-center gap-5">
                                            <div className="w-12 h-12 rounded-xl bg-accent-signature text-ink-primary flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform">
                                                <Package size={22} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black uppercase tracking-tight text-ink-primary mb-1 group-hover:text-accent-signature-hover transition-colors">{vehicleName}</span>
                                                <span className="text-[9px] font-black text-[#4b5563] uppercase tracking-[0.2em] opacity-70">{getEmployeeName(route?.driverId)}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xl font-black text-ink-primary font-mono tabular-nums leading-none mb-1 group-hover:text-accent-signature transition-colors">{businessProfile.currencySymbol}{amount.toLocaleString()}</div>
                                            <div className="text-[8px] font-black text-accent-signature-hover uppercase tracking-widest opacity-80">Active Route</div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center py-20 opacity-10">
                                <Layers size={64} strokeWidth={1} className="mb-6" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em]">No trip data available</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs & Navigation */}
            <div className="no-print flex flex-col md:flex-row items-stretch md:items-center justify-between mt-12 gap-8">
                <div className="p-2 bg-white rounded-[3rem] border border-black/5 shadow-premium flex items-center w-fit">
                    <button
                        onClick={() => setActiveTab('SALES')}
                        className={`px-10 py-4 rounded-[2.5rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500 flex items-center gap-3 ${activeTab === 'SALES' ? 'bg-ink-primary text-surface shadow-2xl' : 'text-[#4b5563] hover:text-ink-primary opacity-70 hover:opacity-100'}`}
                    >
                        <DollarSign size={14} className={activeTab === 'SALES' ? 'text-accent-signature' : ''} />
                        Sales
                    </button>
                    <button
                        onClick={() => setActiveTab('MOVEMENTS')}
                        className={`px-10 py-4 rounded-[2.5rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500 flex items-center gap-3 ${activeTab === 'MOVEMENTS' ? 'bg-ink-primary text-surface shadow-2xl' : 'text-[#4b5563] hover:text-ink-primary opacity-70 hover:opacity-100'}`}
                    >
                        <Truck size={14} className={activeTab === 'MOVEMENTS' ? 'text-accent-signature' : ''} />
                        Stock
                    </button>
                    <button
                        onClick={() => setActiveTab('EXPENSES')}
                        className={`px-10 py-4 rounded-[2.5rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500 flex items-center gap-3 ${activeTab === 'EXPENSES' ? 'bg-ink-primary text-surface shadow-2xl' : 'text-[#4b5563] hover:text-ink-primary opacity-70 hover:opacity-100'}`}
                    >
                        <Receipt size={14} className={activeTab === 'EXPENSES' ? 'text-accent-signature' : ''} />
                        Expenses
                    </button>
                    <button
                        onClick={() => setActiveTab('ADVANCED')}
                        className={`px-10 py-4 rounded-[2.5rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500 flex items-center gap-3 ${activeTab === 'ADVANCED' ? 'bg-ink-primary text-surface shadow-2xl' : 'text-[#4b5563] hover:text-ink-primary opacity-70 hover:opacity-100'}`}
                    >
                        <Activity size={14} className={activeTab === 'ADVANCED' ? 'text-accent-signature' : ''} />
                        Advanced
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <button className="h-14 px-8 rounded-pill bg-white border border-black/5 text-[10px] font-black uppercase tracking-[0.3em] text-ink-primary hover:bg-ink-primary hover:text-accent-signature transition-all shadow-sm flex items-center gap-4" onClick={exportToCSV}>
                        EXPORT CSV
                        <Download size={18} />
                    </button>
                </div>
            </div>

            {/* Table High-Density View */}
            <div className="glass-panel !p-0 overflow-hidden border border-black/5 bg-white shadow-premium !rounded-[3rem] mt-6">
                <div className="overflow-x-auto">
                    {activeTab === 'SALES' && (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-canvas/30 border-b border-black/5">
                                    <th className="py-3 pl-8 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Order Ref</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Customer/Details</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80 text-center">Items</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Payment</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80 text-center">Status</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80 text-right">Yield</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80 text-right">Profit</th>
                                    <th className="no-print py-3 pr-8 text-right text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5 bg-white">
                                {filteredOrders.map(order => (
                                    <tr key={order.id} className="hover:bg-canvas transition-all duration-300 group">
                                        <td className="py-2.5 pl-8">
                                            <div className="text-[11px] font-black text-ink-primary uppercase tracking-tight leading-none mb-1">#{order.id.slice(-6)}</div>
                                            <div className="text-[9px] font-black text-[#4b5563] uppercase opacity-85 tracking-widest">{new Date(order.date).toLocaleDateString()}</div>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <div className="text-[11px] font-black text-ink-primary uppercase tracking-tight leading-none mb-1">{order.customerInfo?.name || 'GENERIC UNIT'}</div>
                                            <div className="text-[9px] font-black text-[#4b5563] uppercase opacity-85 tracking-widest">{order.items?.length || 0} Products</div>
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            <span className="text-[11px] font-black text-ink-primary tabular-nums">
                                                {order.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full ${order.paymentMethod === 'CASH' ? 'bg-accent-signature' : 'bg-sky-500'}`}></div>
                                                <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">
                                                    {order.paymentMethod}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${order.status === 'COMPLETED' ? 'bg-accent-signature/20 text-ink-primary border border-accent-signature/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                                {order.status || 'VERIFIED'}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-right">
                                            <div className="text-sm font-black text-ink-primary font-mono tabular-nums leading-none">
                                                {businessProfile.currencySymbol}{order.totalAmount.toLocaleString()}
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-4 text-right">
                                            <div className="text-sm font-black text-green-600 font-mono tabular-nums leading-none">
                                                {businessProfile.currencySymbol}{Math.round(order.totalAmount - (order.totalCogs || 0)).toLocaleString()}
                                            </div>
                                        </td>
                                        <td className="no-print py-2.5 pr-8 text-right">
                                            <button 
                                                className="w-7 h-7 rounded-full border border-black/5 text-ink-primary hover:bg-ink-primary hover:text-accent-signature transition-all shadow-sm bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 mx-auto mr-0" 
                                                onClick={() => setInvoiceOrder(order)}
                                            >
                                                <ArrowRight size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'MOVEMENTS' && (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-canvas/50 border-b border-black/5">
                                    <th className="py-3 pl-8 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Movement Ref</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Reason / Details</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Staff Member</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80 text-center">Direction</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80 text-right">Quantity</th>
                                    <th className="py-3 pr-8 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80 text-right">Stock After</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5 bg-white">
                                {movementDetails.map(log => (
                                    <tr key={log.id} className="hover:bg-canvas transition-all duration-300">
                                        <td className="py-2.5 pl-8">
                                            <div className="text-[11px] font-black text-ink-primary uppercase leading-none mb-1">REF-{log.id.slice(-4).toUpperCase()}</div>
                                            <div className="text-[9px] font-black text-[#4b5563] uppercase opacity-85 tracking-widest">{new Date(log.date).toLocaleDateString()}</div>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <div className="text-[11px] font-black text-ink-primary uppercase tracking-tight mb-1">{log.productName}</div>
                                            <div className="text-[9px] font-black text-[#4b5563] uppercase opacity-85">{log.reason || 'General Adjustment'}</div>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <div className="text-[10px] font-black text-ink-primary uppercase tracking-widest opacity-95">{log.staffName}</div>
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${log.type === 'IN' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                {log.type}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            <div className={`text-sm font-black tracking-tighter ${log.type === 'IN' ? 'text-green-500' : 'text-red-500'} font-mono tabular-nums leading-none text-right`}>
                                                {log.type === 'IN' ? '+' : '-'}{log.quantity.toLocaleString()}
                                            </div>
                                        </td>
                                        <td className="py-2.5 pr-8 text-right">
                                            <div className="text-[11px] font-black text-[#4b5563] tabular-nums opacity-90">
                                                {log.stockAfter.toLocaleString()}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'EXPENSES' && (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-canvas/50 border-b border-black/5">
                                    <th className="py-3 pl-8 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Date / ID</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Category</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Title / Entity</th>
                                    <th className="py-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Method</th>
                                    <th className="py-3 pr-8 text-right text-[10px] font-black uppercase tracking-[0.2em] text-ink-primary opacity-80">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5 bg-white">
                                {filteredExpenses.map(expense => (
                                    <tr key={expense.id} className="hover:bg-canvas transition-all duration-300">
                                        <td className="py-2.5 pl-8">
                                            <div className="text-[11px] font-black text-ink-primary uppercase leading-none mb-1">{new Date(expense.date).toLocaleDateString()}</div>
                                            <div className="text-[9px] font-black text-[#4b5563] uppercase opacity-85 tracking-widest">{expense.id.slice(0, 8).toUpperCase()}</div>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <span className="px-2 py-0.5 rounded-lg bg-ink-primary text-surface text-[9px] font-black uppercase tracking-widest border border-white/10">
                                                {expense.category}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <div className="text-[11px] font-black text-ink-primary uppercase tracking-tight mb-1">{expense.title || expense.description}</div>
                                            {expense.routeId && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-accent-signature"></div>
                                                    <span className="text-[9px] font-black text-[#4b5563] uppercase tracking-widest opacity-85">DRV: {expense.routeId.slice(-6).toUpperCase()}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest opacity-95">
                                                {expense.paymentMethod || 'CASH'}
                                            </span>
                                        </td>
                                        <td className="py-2.5 pr-8 text-right">
                                            <div className="text-sm font-black text-red-400 tracking-tighter font-mono tabular-nums leading-none">
                                                -{businessProfile.currencySymbol}{expense.amount.toLocaleString()}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'ADVANCED' && (
                        <div className="bg-white min-h-[600px] flex flex-col">
                            {/* Header & Search */}
                            <div className="p-8 border-b border-black/5 flex justify-between items-center bg-canvas/30">
                                <div>
                                    <h3 className="text-2xl font-black text-ink-primary uppercase tracking-tighter">Bulk Item Editor</h3>
                                    <p className="text-[10px] font-bold text-[#4b5563] uppercase tracking-[0.3em] opacity-60">High-density catalog management</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="relative">
                                        <Activity size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4b5563] opacity-40" />
                                        <input 
                                            type="text" 
                                            placeholder="FILTER BY NAME / SKU..." 
                                            className="pl-10 pr-4 py-2.5 bg-white border border-black/5 rounded-xl text-[10px] font-black uppercase tracking-widest focus:ring-2 ring-accent-signature/30 outline-none w-64"
                                            value={bulkSearch}
                                            onChange={e => setBulkSearch(e.target.value)}
                                        />
                                    </div>
                                    <button 
                                        onClick={() => setEditedProducts(JSON.parse(JSON.stringify(products)))}
                                        className="px-6 py-2.5 bg-canvas text-ink-primary border border-black/5 rounded-pill text-[10px] font-black uppercase tracking-widest hover:bg-black/5 transition-colors"
                                    >
                                        Discard
                                    </button>
                                    <button 
                                        onClick={saveBulkChanges}
                                        disabled={isSaving}
                                        className="px-8 py-2.5 bg-ink-primary text-accent-signature rounded-pill text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50"
                                    >
                                        {isSaving ? 'SAVING...' : 'COMMIT CHANGES'}
                                    </button>
                                </div>
                            </div>

                            {/* Spreadsheet Table */}
                            <div className="flex-1 overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-canvas/50 text-left border-b border-black/5">
                                            <th className="p-4 text-[9px] font-black uppercase tracking-[0.3em] text-[#4b5563] opacity-60">SKU</th>
                                            <th className="p-4 text-[9px] font-black uppercase tracking-[0.3em] text-[#4b5563] opacity-60">Product Name</th>
                                            <th className="p-4 text-[9px] font-black uppercase tracking-[0.3em] text-[#4b5563] opacity-60">Category</th>
                                            <th className="p-4 text-[9px] font-black uppercase tracking-[0.3em] text-[#4b5563] opacity-60">Cost</th>
                                            <th className="p-4 text-[9px] font-black uppercase tracking-[0.3em] text-[#4b5563] opacity-60">Price</th>
                                            <th className="p-4 text-[9px] font-black uppercase tracking-[0.3em] text-[#4b5563] opacity-60">Tax %</th>
                                            <th className="p-4 text-[9px] font-black uppercase tracking-[0.3em] text-[#4b5563] opacity-60 text-right">Stock</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/5">
                                        {editedProducts.filter(p => 
                                            p.name.toLowerCase().includes(bulkSearch.toLowerCase()) || 
                                            p.sku.toLowerCase().includes(bulkSearch.toLowerCase())
                                        ).map(product => (
                                            <tr key={product.id} className="hover:bg-canvas/20 transition-colors">
                                                <td className="p-2">
                                                    <input 
                                                        type="text" 
                                                        className="w-full bg-transparent p-2 text-[11px] font-black text-ink-primary uppercase tracking-tight outline-none focus:bg-white focus:ring-1 ring-accent-signature rounded"
                                                        value={product.sku}
                                                        onChange={e => handleBulkEdit(product.id, 'sku', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <input 
                                                        type="text" 
                                                        className="w-full bg-transparent p-2 text-[11px] font-black text-ink-primary uppercase tracking-tight outline-none focus:bg-white focus:ring-1 ring-accent-signature rounded"
                                                        value={product.name}
                                                        onChange={e => handleBulkEdit(product.id, 'name', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <input 
                                                        type="text" 
                                                        className="w-full bg-transparent p-2 text-[11px] font-black text-ink-primary uppercase tracking-tight outline-none focus:bg-white focus:ring-1 ring-accent-signature rounded"
                                                        value={product.category}
                                                        onChange={e => handleBulkEdit(product.id, 'category', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-2 w-24">
                                                    <input 
                                                        type="number" 
                                                        className="w-full bg-transparent p-2 text-[11px] font-black text-ink-primary tracking-tighter outline-none focus:bg-white focus:ring-1 ring-accent-signature rounded font-mono"
                                                        value={product.costPrice}
                                                        onChange={e => handleBulkEdit(product.id, 'costPrice', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-2 w-24">
                                                    <input 
                                                        type="number" 
                                                        className="w-full bg-transparent p-2 text-[11px] font-black text-ink-primary tracking-tighter outline-none focus:bg-white focus:ring-1 ring-accent-signature rounded font-mono"
                                                        value={product.sellingPrice}
                                                        onChange={e => handleBulkEdit(product.id, 'sellingPrice', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-2 w-20">
                                                    <input 
                                                        type="number" 
                                                        className="w-full bg-transparent p-2 text-[11px] font-black text-ink-primary tracking-tighter outline-none focus:bg-white focus:ring-1 ring-accent-signature rounded font-mono"
                                                        value={product.taxRate}
                                                        onChange={e => handleBulkEdit(product.id, 'taxRate', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-2 w-24 text-right">
                                                    <input 
                                                        type="number" 
                                                        className="w-full bg-transparent p-2 text-[11px] font-black text-ink-primary tracking-tighter outline-none focus:bg-white focus:ring-1 ring-accent-signature rounded font-mono text-right"
                                                        value={product.stock}
                                                        onChange={e => handleBulkEdit(product.id, 'stock', e.target.value)}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer Actions - System Utilities */}
                            <div className="p-8 border-t border-black/5 bg-canvas/30 grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-1 h-4 bg-red-500 rounded-full"></div>
                                        <h4 className="text-xs font-black text-ink-primary uppercase tracking-widest">System Infrastructure</h4>
                                    </div>
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={() => useAppContext().resetAndSeedLocal()}
                                            className="px-6 py-3 bg-white border border-black/5 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-canvas transition-colors flex items-center gap-3 shadow-sm"
                                        >
                                            <Activity size={14} className="text-accent-signature" />
                                            Seed Stress Data
                                        </button>
                                        <button 
                                            onClick={() => { if(confirm("ABSOLUTE DATA WIPE?")) localStorage.clear(); window.location.reload(); }}
                                            className="px-6 py-3 bg-white border border-black/5 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-red-50 transition-colors flex items-center gap-3 shadow-sm"
                                        >
                                            <Layers size={14} className="text-red-500" />
                                            Factory Reset
                                        </button>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col justify-end">
                                    <p className="text-[10px] font-bold text-[#4b5563] uppercase tracking-[0.2em] opacity-40">
                                        All modifications are staged locally before commit.<br/>
                                        Database integrity is maintained via transactional sync.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ========== VOUCHER MODAL ========== */}
            {invoiceOrder && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-[800px] !p-12 !overflow-y-auto flex flex-col relative !rounded-[2.5rem]">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h1 className="text-5xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">INVOICE.</h1>
                                <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.3em] opacity-70">COMMERCIAL TRANSACTION RECORD</p>
                            </div>
                            <button 
                                onClick={() => setInvoiceOrder(null)}
                                className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div id="invoice-print-area" className="flex-1">
                            <div className="flex justify-between items-end mb-12 border-b-2 border-ink-primary pb-8">
                                <div className="text-3xl font-black text-ink-primary uppercase tracking-tighter leading-none">{businessProfile.name}</div>
                                <div className="text-right">
                                    <div className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.2em] opacity-70 mb-2">
                                        {new Date(invoiceOrder.date).toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}
                                    </div>
                                    <div className="px-6 py-2 bg-black text-accent-signature inline-block rounded-xl font-black tracking-widest text-[10px]">
                                        ORD-{invoiceOrder.id.slice(-8).toUpperCase()}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-canvas/50 border border-black/5 p-10 rounded-[2.5rem] mb-12 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-signature/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                                <div className="grid grid-cols-2 gap-12 relative z-10">
                                    <div>
                                        <div className="text-[9px] font-black text-[#4b5563] uppercase tracking-[0.4em] mb-4 opacity-70">Customer</div>
                                        <div className="text-3xl font-black text-ink-primary uppercase tracking-tighter leading-tight mb-3">
                                            {invoiceOrder.customerInfo?.name || 'GENERIC CLIENT'}
                                        </div>
                                        <div className="text-[10px] font-bold text-[#4b5563] uppercase tracking-widest opacity-85">
                                            {getClientName(invoiceOrder.shopId)}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[9px] font-black text-[#4b5563] uppercase tracking-[0.4em] mb-4 opacity-70">Status</div>
                                        <div className="text-2xl font-black text-ink-primary uppercase tracking-tighter opacity-80 mb-5 flex items-center justify-end gap-2">
                                            {invoiceOrder.paymentMethod}
                                            <div className="w-2 h-2 rounded-full bg-accent-signature"></div>
                                        </div>
                                        <div className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-premium inline-block ${invoiceOrder.status === 'COMPLETED' ? 'bg-accent-signature text-ink-primary' : 'bg-red-500 text-surface'}`}>
                                            {invoiceOrder.status || 'VERIFIED'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <table className="w-full text-left mb-12">
                                <thead>
                                    <tr className="border-b border-black/10">
                                        <th className="py-4 text-[10px] font-black text-[#4b5563] uppercase tracking-[0.4em] opacity-70">Item</th>
                                        <th className="py-4 text-[10px] font-black text-[#4b5563] uppercase tracking-[0.4em] opacity-70 text-center">Quantity</th>
                                        <th className="py-4 text-right text-[10px] font-black text-ink-primary uppercase tracking-[0.4em]">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5">
                                    {invoiceOrder.items.map((item, idx) => {
                                        const lineGross = item.price * item.quantity;
                                        const lineDiscount = lineGross * ((item.discount || 0) / 100);
                                        const afterDiscount = lineGross - lineDiscount;
                                        const lineTax = afterDiscount * ((item.taxRate || 0) / 100);
                                        const lineTotal = afterDiscount + lineTax;
                                        return (
                                            <tr key={item.productId || idx} className="group">
                                                <td className="py-6">
                                                    <div className="text-base font-black text-ink-primary uppercase tracking-tight leading-none mb-1.5">{item.name}</div>
                                                    <div className="text-[9px] font-bold text-[#4b5563] uppercase tracking-[0.2em] opacity-70">{item.sku}</div>
                                                </td>
                                                <td className="py-6 text-center">
                                                    <span className="text-lg font-black text-ink-primary font-mono">{item.quantity}</span>
                                                    <span className="text-[10px] font-black text-[#4b5563] uppercase opacity-70 ml-1">UNITS</span>
                                                </td>
                                                <td className="py-6 text-right font-black text-lg text-ink-primary font-mono tabular-nums">{businessProfile.currencySymbol}{lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            <div className="max-w-[340px] ml-auto">
                                <div className="p-10 bg-ink-primary rounded-[2.5rem] shadow-2xl flex justify-between items-center group hover:scale-105 transition-transform duration-500">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-surface/70 uppercase tracking-[0.3em] mb-1">Total Amount</span>
                                        <span className="text-[9px] font-black text-accent-signature uppercase tracking-widest">Net Total</span>
                                    </div>
                                    <span className="text-4xl font-black text-accent-signature tracking-tighter font-mono">{businessProfile.currencySymbol}{invoiceOrder.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 no-print grid grid-cols-2 gap-4">
                            <button className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => setInvoiceOrder(null)}>Dismiss</button>
                            <button className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill" onClick={handlePrintInvoice}>
                                PRINT DOCUMENT
                                <div className="icon-nest !w-10 !h-10 ml-4">
                                    <Printer size={18} />
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #invoice-print-area, #invoice-print-area * { visibility: visible; }
                    #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                }
            `}</style>
            </div>
        </>
    );
};

export default Reports;
