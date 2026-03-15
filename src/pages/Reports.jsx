import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    Calendar, FileText, Download, Printer, TrendingUp, Package, Receipt, 
    ArrowUpRight, ArrowDownRight, X, Check, Users, Truck, 
    DollarSign, Activity, PieChart, Layers, ArrowRight
} from 'lucide-react';

const Reports = () => {
    const { 
        orders, movementLog, expenses, businessProfile, shops, users, vehicles, routes,
        employees, payrollRecords, getUserName, getVehicleName, getEmployeeName, hasPermission 
    } = useAppContext();
    const [dateRange, setDateRange] = useState('MONTH');
    const [activeTab, setActiveTab] = useState('SALES');
    const [invoiceOrder, setInvoiceOrder] = useState(null);

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
        let collectionRate = 0;

        filteredData.sales.forEach(o => {
            sales += o.totalAmount;
            cogs += (o.totalCogs || 0);
            if (o.paymentStatus === 'PAID') {
                recovered += o.totalAmount;
            } else {
                recovered += (o.paidAmount || 0);
                pending += (o.totalAmount - (o.paidAmount || 0));
            }
        });

        const expensesTotal = filteredData.expenses.reduce((sum, e) => sum + e.amount, 0);
        const payrollTotal = filteredData.payroll.reduce((sum, p) => sum + p.amount, 0);
        const netProfit = recovered - expensesTotal - payrollTotal - cogs;
        
        collectionRate = sales > 0 ? (recovered / sales) * 100 : 100;

        return { 
            sales, 
            cogs, 
            recovered, 
            pending, 
            collectionRate,
            netProfit, 
            expenses: expensesTotal, 
            payroll: payrollTotal 
        };
    }, [filteredData]);
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
            <div className="animate-fade-in flex flex-col gap-6 pb-12 print-area">
                <div className="no-print flex flex-col md:flex-row justify-between items-start md:items-center pb-8 border-b border-black/5 gap-8">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-10 bg-accent-signature rounded-full"></div>
                            <h1 className="text-7xl font-black tracking-tighter text-ink-primary uppercase leading-tight">Intelligence.</h1>
                        </div>
                        <p className="text-sm font-black text-[#747576] tracking-tight uppercase opacity-60 ml-4 flex items-center gap-2">
                            <Activity size={14} className="text-accent-signature" />
                            Strategic Data Analytics & Performance Audit Matrix
                        </p>
                    </div>
                    <div className="flex items-center gap-4 bg-canvas/30 p-2 rounded-2xl border border-black/5 shadow-inner">
                        <div className="flex flex-col text-right px-4 border-r border-black/5">
                            <span className="text-[9px] font-black text-[#747576] uppercase tracking-widest opacity-40">System Status</span>
                            <span className="text-xs font-black text-green-500 uppercase tracking-tighter flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                Live Sync Active
                            </span>
                        </div>
                        <div className="flex -space-x-3 px-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="w-8 h-8 rounded-full border-2 border-surface bg-canvas flex items-center justify-center text-[10px] font-black">
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
                            <div className="text-[10px] font-black uppercase tracking-widest text-[#747576] opacity-40">Active Node</div>
                            <div className="text-sm font-black text-ink-primary tracking-tighter leading-none">Operational Matrix</div>
                        </div>
                    </div>
                </div>

                <div className="flex h-14 p-1 bg-surface rounded-pill border border-black/5 shadow-inner items-center col-span-2 px-6">
                    <Calendar size={16} className="text-[#747576] opacity-40 shrink-0" />
                    <div className="h-4 w-px bg-black/10 mx-4"></div>
                    <select 
                        className="flex-1 bg-transparent border-none font-black text-[11px] uppercase tracking-[0.2em] text-ink-primary outline-none cursor-pointer appearance-none" 
                        value={dateRange} 
                        onChange={e => setDateRange(e.target.value)}
                    >
                        <option value="TODAY">IMMEDIATE OCTANT (24H)</option>
                        <option value="WEEK">7-DAY VECTOR (W)</option>
                        <option value="MONTH">30-DAY CYCLE (M)</option>
                        <option value="ALL">HISTORICAL ARCHIVE (∞)</option>
                    </select>
                    <div className="w-8 h-8 rounded-full bg-canvas flex items-center justify-center text-[#747576] opacity-40">
                        <ArrowDownRight size={14} />
                    </div>
                </div>

                {hasPermission('EXPORT_REPORTS') && (
                    <button className="btn-signature !h-14 !py-0 !text-[11px] !font-black !tracking-[0.2em] !rounded-pill group" onClick={handlePrint}>
                        PRINT AUDIT
                        <div className="icon-nest ml-4 !w-10 !h-10 group-hover:bg-ink-primary group-hover:text-accent-signature transition-all">
                            <Printer size={18} />
                        </div>
                    </button>
                )}
            </div>

            {/* Print Header */}
            <div className="print-only hidden mb-10 text-center">
                <h2 className="text-3xl font-black uppercase tracking-tighter">{businessProfile.name}</h2>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mt-2">Strategic Performance Audit | Generated: {new Date().toLocaleDateString()}</div>
            </div>

            {/* Top Level KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Revenue Matrix Card */}
                <div className="glass-panel !p-8 flex flex-col justify-between min-h-[220px] group hover:scale-[1.02] transition-all duration-500 bg-white border-black/5 shadow-premium !rounded-[2.5rem] relative overflow-hidden h-full">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-green-500/20 transition-all duration-700"></div>
                    
                    <div className="flex justify-between items-start relative z-10 w-full mb-auto">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#747576] opacity-40">Realized Cash</span>
                            <div className="text-4xl font-black text-green-500 tracking-tighter tabular-nums">
                                {businessProfile?.currencySymbol || '₹'}{Math.round(metrics.recovered).toLocaleString()}
                            </div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center border border-green-100 group-hover:rotate-12 transition-transform shadow-sm shrink-0">
                            <DollarSign size={20} />
                        </div>
                    </div>

                    <div className="mt-auto relative z-10 space-y-4">
                        <div className="flex justify-between items-baseline">
                            <span className="text-[10px] font-black text-[#747576] uppercase tracking-widest opacity-40">Projected Turn</span>
                            <span className="text-sm font-black text-ink-primary font-mono tabular-nums">{businessProfile?.currencySymbol || '₹'}{Math.round(metrics.sales).toLocaleString()}</span>
                        </div>
                        <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 transition-all duration-1000" style={{ width: `${Math.min(100, (metrics.sales > 0 ? (metrics.recovered / metrics.sales) * 100 : 0))}%` }}></div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black text-green-600 uppercase tracking-widest bg-green-50 w-fit px-3 py-1 rounded-full border border-green-100">
                            <Activity size={12} className="animate-pulse" /> {Math.round(metrics.collectionRate)}% Efficiency
                        </div>
                    </div>
                </div>

                {/* Capital Split Card */}
                <div className="glass-panel !p-8 flex flex-col justify-between min-h-[220px] group hover:scale-[1.02] transition-all duration-500 bg-white border-black/5 shadow-premium !rounded-[2.5rem] relative overflow-hidden h-full">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-blue-500/20 transition-all duration-700"></div>
                    
                    <div className="flex justify-between items-start relative z-10 w-full mb-auto">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#747576] opacity-40">Debt Exposure</span>
                            <div className="text-4xl font-black text-red-500 tracking-tighter tabular-nums">
                                {businessProfile?.currencySymbol || '₹'}{Math.round(metrics.pending).toLocaleString()}
                            </div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 group-hover:rotate-12 transition-transform shadow-sm shrink-0">
                            <PieChart size={20} />
                        </div>
                    </div>

                    <div className="mt-auto relative z-10 space-y-4">
                        <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden mb-3">
                            <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${Math.min(100, (metrics.sales > 0 ? (metrics.recovered / metrics.sales) * 100 : 100))}%` }}></div>
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                            <span className="text-blue-600 font-black">Liquid Matrix</span>
                            <span className="text-red-500 font-black">Receivables</span>
                        </div>
                        <div className="text-[9px] font-bold text-[#747576] uppercase tracking-[0.2em] opacity-40 leading-relaxed italic">
                            * Credit exposure within current cycle
                        </div>
                    </div>
                </div>

                {/* Expenditure Matrix Card */}
                <div className="glass-panel !p-8 flex flex-col justify-between min-h-[220px] group hover:scale-[1.02] transition-all duration-500 bg-ink-primary !text-surface shadow-premium !rounded-[2.5rem] relative overflow-hidden border-none shadow-2xl h-full">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -mr-24 -mt-24 blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                    
                    <div className="flex justify-between items-start relative z-10 w-full mb-auto">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-surface opacity-30">Operational Burn</span>
                            <div className="text-4xl font-black text-surface tracking-tighter tabular-nums">
                                {businessProfile?.currencySymbol || '₹'}{Math.round(metrics.expenses + metrics.payroll).toLocaleString()}
                            </div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-white/10 text-accent-signature flex items-center justify-center border border-white/5 group-hover:rotate-12 transition-transform shadow-inner shrink-0">
                            <Receipt size={20} />
                        </div>
                    </div>

                    <div className="mt-auto relative z-10 space-y-4">
                        <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-surface/40 uppercase tracking-widest mb-1">Efficiency Goal</span>
                                <span className="text-lg font-black text-accent-signature font-mono">{( (metrics.recovered / (metrics.expenses + metrics.payroll + metrics.cogs || 1)) * 10 ).toFixed(1)}x ROI</span>
                            </div>
                            <ArrowUpRight className="text-accent-signature opacity-40" size={24} />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black text-surface/40 uppercase tracking-[0.2em]">
                            <div className="w-1.5 h-1.5 rounded-full bg-accent-signature shadow-[0_0_8px_#C8F135]"></div>
                            Authorized Disbursements
                        </div>
                    </div>
                </div>

                {/* Net Position Card */}
                <div className="glass-panel !p-8 flex flex-col justify-between min-h-[220px] group hover:scale-[1.02] transition-all duration-500 bg-white border-black/5 shadow-premium !rounded-[2.5rem] relative overflow-hidden h-full">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-accent-signature/20 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-accent-signature/40 transition-all duration-700"></div>
                    
                    <div className="flex justify-between items-start relative z-10 w-full mb-auto">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#747576] opacity-40">Net Position</span>
                            <div className={`text-4xl font-black tracking-tighter tabular-nums ${metrics.netProfit >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                                {businessProfile?.currencySymbol || '₹'}{Math.round(metrics.netProfit).toLocaleString()}
                            </div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-canvas text-ink-primary flex items-center justify-center border border-black/5 group-hover:scale-110 transition-transform shadow-sm shrink-0">
                            <Layers size={20} />
                        </div>
                    </div>

                    <div className="mt-auto relative z-10 space-y-4">
                        <div className="p-4 bg-canvas/50 rounded-2xl border border-black/5">
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest mb-1 opacity-40">Gross Margin</div>
                            <div className="text-xl font-black text-ink-primary tracking-tight">
                                {businessProfile?.currencySymbol || '₹'}{Math.round(metrics.sales - metrics.cogs).toLocaleString()}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-[#747576] opacity-40 uppercase tracking-widest bg-canvas px-3 py-1 rounded-full border border-black/5 w-fit">
                            Realized Value Audit
                        </div>
                    </div>
                </div>
            </div>

            {/* Attribution Breakdown Cards */}
            <div className="no-print grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem] flex flex-col h-full hover:shadow-2xl transition-all duration-700">
                    <div className="flex justify-between items-center mb-10 border-b border-black/5 pb-6">
                        <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-canvas flex items-center justify-center text-ink-primary shadow-sm border border-black/5 group-hover:scale-110 transition-transform">
                                <Users size={24} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-ink-primary">Personnel Yield Audit.</h3>
                                <p className="text-[10px] font-black text-[#747576] uppercase tracking-widest opacity-40 mt-1">Revenue Attribution per Agent</p>
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-canvas flex items-center justify-center text-ink-primary/20">
                            <ArrowRight size={18} />
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-4 flex-1">
                        {Object.entries(attributionByRep).length > 0 ? (
                            Object.entries(attributionByRep).sort((a, b) => b[1] - a[1]).map(([repId, amount]) => (
                                <div key={repId} className="flex justify-between items-center p-5 bg-canvas/40 rounded-[2rem] border border-black/5 group hover:bg-ink-primary transition-all duration-500 cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-1">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-ink-primary text-surface flex items-center justify-center text-[10px] font-black uppercase group-hover:bg-accent-signature group-hover:text-ink-primary transition-colors">
                                            {(getUserName(repId) !== 'Unknown User' ? getUserName(repId) : getEmployeeName(repId)).split(' ').map(n => n[0]).join('')}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-ink-primary uppercase tracking-tight group-hover:text-surface transition-colors">
                                                {getUserName(repId) !== 'Unknown User' ? getUserName(repId) : getEmployeeName(repId)}
                                            </span>
                                            <span className="text-[9px] font-black text-[#747576] uppercase tracking-widest group-hover:text-surface/40 transition-colors">
                                                {getUserName(repId) !== 'Unknown User' ? 'Booking Agent' : 'Field Agent'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-black text-ink-primary group-hover:text-accent-signature transition-colors tabular-nums">{businessProfile.currencySymbol}{amount.toLocaleString()}</div>
                                        <div className="text-[8px] font-black text-[#747576] uppercase tracking-[0.2em] group-hover:text-surface/30">Yield Score</div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center opacity-10 grayscale group-hover:grayscale-0 transition-all">
                                <Activity size={64} strokeWidth={1} className="mb-6" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] max-w-[200px] leading-relaxed">System Synchronizing: No Yield Metadata Recorded</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="glass-panel !p-10 bg-ink-primary !text-surface shadow-2xl !rounded-[2.5rem] relative overflow-hidden flex flex-col h-full hover:shadow-accent-signature/20 transition-all duration-700">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-accent-signature/5 rounded-full -mr-40 -mt-40 blur-[100px]"></div>
                    
                    <div className="flex justify-between items-center mb-10 border-b border-surface/10 pb-6 relative z-10">
                        <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-accent-signature shadow-inner border border-white/5">
                                <Truck size={24} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-surface">Infrastructure Yield.</h3>
                                <p className="text-[10px] font-black text-surface/30 uppercase tracking-widest mt-1">Fleet & Route Matrix Audit</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-accent-signature/10 rounded-full border border-accent-signature/20">
                            <span className="w-2 h-2 rounded-full bg-accent-signature animate-pulse shadow-[0_0_8px_#C8F135]"></span>
                            <span className="text-[9px] font-black text-accent-signature uppercase tracking-widest">Active Scan</span>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-4 relative z-10 flex-1">
                        {Object.entries(attributionByFleet).length > 0 ? (
                            Object.entries(attributionByFleet).sort((a, b) => b[1] - a[1]).map(([routeId, amount]) => {
                                const route = routes.find(r => r.id === routeId);
                                const vehicleName = route ? getVehicleName(route.vehicleId) : 'CENTRAL CORE';
                                return (
                                    <div key={routeId} className="flex justify-between items-center p-5 bg-white/5 rounded-[2rem] border border-white/5 hover:bg-white/10 transition-all duration-500 hover:-translate-y-1">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-accent-signature text-ink-primary flex items-center justify-center">
                                                <Package size={20} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black uppercase tracking-tight text-surface mb-1">{vehicleName}</span>
                                                <span className="text-[9px] font-black text-accent-signature uppercase tracking-[0.2em]">{getEmployeeName(route?.driverId)}</span>
                                                {route && <span className="text-[8px] font-black text-surface/20 uppercase tracking-[0.3em] font-mono mt-1">{route.id.split('-').pop()}</span>}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-black text-accent-signature font-mono tabular-nums">{businessProfile.currencySymbol}{amount.toLocaleString()}</div>
                                            <div className="text-[8px] font-black text-surface/20 uppercase tracking-widest italic tracking-tighter">Asset Utilization Peak</div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center opacity-10">
                                <Layers size={64} strokeWidth={1} className="mb-6" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] max-w-[200px] leading-relaxed">Logistic Nodes Idle: Waiting for Distribution Matrix</span>
                                {hasPermission('GLOBAL_ADMIN') && (
                                    <button 
                                        className="mt-8 px-10 py-4 bg-accent-signature text-ink-primary rounded-full text-[10px] font-black uppercase tracking-[0.3em] hover:scale-105 transition-all shadow-xl active:scale-95"
                                        onClick={() => useAppContext().resetAndSeedLocal()}
                                    >
                                        RE-SEED INFRASTRUCTURE
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="no-print flex flex-col md:flex-row items-stretch md:items-center justify-between mt-8 gap-6">
                <div className="pill-nav !p-2 bg-canvas/30 backdrop-blur-xl rounded-[2.5rem] border border-black/5 shadow-inner flex items-center w-fit">
                    <button
                        onClick={() => setActiveTab('SALES')}
                        className={`px-8 py-3 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500 flex items-center gap-2 ${activeTab === 'SALES' ? 'bg-ink-primary text-surface shadow-2xl scale-105 -translate-y-0.5' : 'text-[#747576] hover:text-ink-primary'}`}
                    >
                        <DollarSign size={14} className={activeTab === 'SALES' ? 'text-accent-signature' : 'opacity-40'} />
                        Capital Ledger
                    </button>
                    <button
                        onClick={() => setActiveTab('MOVEMENTS')}
                        className={`px-8 py-3 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500 flex items-center gap-2 ${activeTab === 'MOVEMENTS' ? 'bg-ink-primary text-surface shadow-2xl scale-105 -translate-y-0.5' : 'text-[#747576] hover:text-ink-primary'}`}
                    >
                        <Truck size={14} className={activeTab === 'MOVEMENTS' ? 'text-accent-signature' : 'opacity-40'} />
                        Asset Logistics
                    </button>
                    <button
                        onClick={() => setActiveTab('EXPENSES')}
                        className={`px-8 py-3 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500 flex items-center gap-2 ${activeTab === 'EXPENSES' ? 'bg-ink-primary text-surface shadow-2xl scale-105 -translate-y-0.5' : 'text-[#747576] hover:text-ink-primary'}`}
                    >
                        <Receipt size={14} className={activeTab === 'EXPENSES' ? 'text-accent-signature' : 'opacity-40'} />
                        Operating Costs
                    </button>
                    <button
                        onClick={() => setActiveTab('ADVANCED')}
                        className={`px-8 py-3 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500 flex items-center gap-2 ${activeTab === 'ADVANCED' ? 'bg-ink-primary text-surface shadow-2xl scale-105 -translate-y-0.5' : 'text-[#747576] hover:text-ink-primary'}`}
                    >
                        <Activity size={14} className={activeTab === 'ADVANCED' ? 'text-accent-signature' : 'opacity-40'} />
                        Advanced
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-[10px] font-black text-[#747576] uppercase tracking-[0.2em] opacity-40 mr-2 flex items-center gap-2">
                        <Activity size={12} className="text-accent-signature" />
                        Export Protocol
                    </div>
                    <button className="w-12 h-12 rounded-2xl bg-white border border-black/5 flex items-center justify-center text-ink-primary hover:bg-ink-primary hover:text-accent-signature transition-all shadow-sm hover:scale-110 active:scale-95" onClick={exportToCSV}>
                        <Download size={18} />
                    </button>
                    <button className="w-12 h-12 rounded-2xl bg-white border border-black/5 flex items-center justify-center text-ink-primary hover:bg-ink-primary hover:text-accent-signature transition-all shadow-sm hover:scale-110 active:scale-95">
                        <FileText size={18} />
                    </button>
                </div>
            </div>

            {/* Table Content */}
            <div className="glass-panel !p-0 overflow-hidden border border-black/5 bg-white shadow-premium !rounded-[2.5rem] mt-4">
                <div className="overflow-x-auto">
                    {activeTab === 'SALES' && (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-canvas/30 border-b border-black/5">
                                    <th className="py-4 pl-12 text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60">Transmission Index</th>
                                    <th className="py-4 text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60">Protocol</th>
                                    <th className="py-4 text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60 text-center">Status</th>
                                    <th className="py-4 text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60 text-right">Net Yield</th>
                                    <th className="no-print py-4 pr-12 text-right text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5 bg-white">
                                {filteredOrders.map(order => (
                                    <tr key={order.id} className="hover:bg-canvas transition-all duration-300 group">
                                        <td className="py-3 pl-12">
                                            <div className="text-sm font-black text-ink-primary uppercase tracking-tight leading-none mb-1">{order.id}</div>
                                            <div className="text-[10px] font-black text-[#747576] uppercase opacity-40 tracking-[0.1em]">{order.customerInfo?.name || 'GENERIC UNIT'}</div>
                                        </td>
                                        <td className="py-3">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full ${order.paymentMethod === 'CASH' ? 'bg-accent-signature' : 'bg-sky-500'}`}></div>
                                                <span className="text-xs font-black text-ink-primary uppercase tracking-widest">
                                                    {order.paymentMethod}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3 text-center">
                                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${order.status === 'COMPLETED' ? 'bg-accent-signature/20 text-ink-primary border border-accent-signature/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                                {order.status || 'VERIFIED'}
                                            </span>
                                        </td>
                                        <td className="py-3 text-right text-base font-black text-ink-primary font-mono tabular-nums leading-none">
                                            <div className="flex flex-col">
                                                <span>{businessProfile.currencySymbol}{order.totalAmount.toLocaleString()}</span>
                                            </div>
                                        </td>
                                        <td className="no-print py-3 pr-12 text-right">
                                            <button 
                                                className="w-8 h-8 rounded-full border border-black/5 text-ink-primary hover:bg-ink-primary hover:text-accent-signature transition-all shadow-sm bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 mx-auto mr-0" 
                                                onClick={() => setInvoiceOrder(order)}
                                            >
                                                <ArrowRight size={14} />
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
                                    <th className="py-4 pl-12 text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60">Chronological Index</th>
                                    <th className="py-4 text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60">Asset Unit</th>
                                    <th className="py-4 text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60 text-center">Delta</th>
                                    <th className="py-4 pr-12 text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60 text-right">Audit Context</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5 bg-white">
                                {filteredMovements.map(log => (
                                    <tr key={log.id} className="hover:bg-canvas transition-all duration-300">
                                        <td className="py-3 pl-12">
                                            <div className="text-sm font-black text-ink-primary uppercase leading-none mb-1">{new Date(log.date).toLocaleDateString()}</div>
                                            <div className="text-[10px] font-black text-[#747576] uppercase opacity-30 tracking-widest">{new Date(log.date).toLocaleTimeString()}</div>
                                        </td>
                                        <td className="py-3">
                                            <div className="text-xs font-black text-ink-primary uppercase tracking-tight mb-1">{log.productName}</div>
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${log.type === 'IN' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                {log.type}
                                            </span>
                                        </td>
                                        <td className="py-3 text-center">
                                            <div className={`text-xl font-black tracking-tighter ${log.type === 'IN' ? 'text-green-500' : 'text-red-500'} font-mono tabular-nums leading-none`}>
                                                {log.type === 'IN' ? '+' : '-'}{log.quantity.toLocaleString()}
                                            </div>
                                        </td>
                                        <td className="py-3 pr-12 text-right">
                                            <div className="text-[10px] font-black text-[#747576] uppercase italic max-w-[200px] ml-auto leading-relaxed border-l-2 border-black/5 pl-4 opacity-60">
                                                "{log.reason}"
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
                                    <th className="py-4 pl-12 text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60">Disbursement</th>
                                    <th className="py-4 text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60">Classification</th>
                                    <th className="py-4 text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60">Purpose</th>
                                    <th className="py-4 pr-12 text-right text-xs font-black uppercase tracking-[0.2em] text-[#747576] opacity-60">Value</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5 bg-white">
                                {filteredExpenses.map(expense => (
                                    <tr key={expense.id} className="hover:bg-canvas transition-all duration-300">
                                        <td className="py-3 pl-12">
                                            <div className="text-sm font-black text-ink-primary uppercase leading-none mb-1">{new Date(expense.date).toLocaleDateString()}</div>
                                            <div className="text-[10px] font-black text-[#747576] uppercase opacity-20 tracking-widest">{expense.id.slice(0, 8)}</div>
                                        </td>
                                        <td className="py-3">
                                            <span className="px-2 py-0.5 rounded-lg bg-ink-primary text-surface text-[9px] font-black uppercase tracking-widest border border-white/10">
                                                {expense.category}
                                            </span>
                                        </td>
                                        <td className="py-3">
                                            <div className="text-xs font-black text-ink-primary uppercase tracking-tight mb-1">{expense.title || expense.description}</div>
                                            {expense.routeId && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-accent-signature animate-pulse"></div>
                                                    <span className="text-[9px] font-black text-[#747576] uppercase tracking-widest opacity-40">HUB: {expense.routeId.slice(-6).toUpperCase()}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 pr-12 text-right">
                                            <div className="text-xl font-black text-red-400 tracking-tighter font-mono tabular-nums leading-none">
                                                -{businessProfile.currencySymbol}{expense.amount.toLocaleString()}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'ADVANCED' && (
                        <div className="p-12 space-y-12 bg-white">
                            <div className="max-w-2xl">
                                <h3 className="text-2xl font-black text-ink-primary uppercase tracking-tight mb-2">Systems Maintenance</h3>
                                <p className="text-sm font-medium text-ink-secondary mb-8">Authorised operations for data management and structural synchronization.</p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="p-8 rounded-[2rem] border border-black/5 bg-canvas/30 space-y-4">
                                        <div className="flex items-center gap-4 mb-2">
                                            <Activity size={20} className="text-accent-signature" />
                                            <h4 className="text-sm font-black uppercase tracking-widest">Infrastructure Seeder</h4>
                                        </div>
                                        <p className="text-[10px] font-bold text-ink-secondary leading-relaxed uppercase opacity-60">Generate 1200+ simulated entries for stress testing and load auditing.</p>
                                        <button 
                                            className="w-full py-3 bg-ink-primary text-accent-signature rounded-pill text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:scale-105 transition-all"
                                            onClick={() => useAppContext().resetAndSeedLocal()}
                                        >
                                            RE-SEED DATABASE
                                        </button>
                                    </div>

                                    <div className="p-8 rounded-[2rem] border border-black/5 bg-canvas/30 space-y-4">
                                        <div className="flex items-center gap-4 mb-2">
                                            <Layers size={20} className="text-red-500" />
                                            <h4 className="text-sm font-black uppercase tracking-widest">Wipe Protocol</h4>
                                        </div>
                                        <p className="text-[10px] font-bold text-ink-secondary leading-relaxed uppercase opacity-60">Irreversible deletion of all local storage metrics and transaction history.</p>
                                        <button 
                                            className="w-full py-3 border border-red-200 text-red-500 rounded-pill text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-50 transition-all"
                                            onClick={() => { if(confirm("ABSOLUTE DATA WIPE?")) localStorage.clear(); window.location.reload(); }}
                                        >
                                            ABORT & ERASE
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ========== VOUCHER MODAL ========== */}
            {invoiceOrder && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-[600px] !p-8 md:!p-12 !overflow-y-auto flex flex-col relative !rounded-[2.5rem]">
                        <button 
                            onClick={() => setInvoiceOrder(null)}
                            className="absolute top-6 right-6 w-10 h-10 rounded-pill bg-canvas flex items-center justify-center text-ink-primary hover:scale-110 transition-transform z-20 shadow-premium"
                        >
                            <X size={18} />
                        </button>

                        <div className="absolute top-0 left-0 w-2 h-full bg-accent-signature"></div>

                        <div id="invoice-print-area" className="flex-1">
                            <div className="flex justify-between items-start mb-12 border-b-2 border-ink-primary pb-8">
                                <div>
                                    <h2 className="text-6xl font-black text-ink-primary uppercase tracking-tighter leading-none mb-4">VOUCHER.</h2>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-1.5 bg-accent-signature rounded-full"></div>
                                        <p className="text-[10px] font-black text-[#747576] uppercase tracking-[0.4em] opacity-60">Settlement Protocol</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-black text-ink-primary uppercase tracking-tighter leading-none mb-3">{businessProfile.name}</div>
                                    <div className="text-[10px] font-black text-[#747576] uppercase tracking-[0.2em] opacity-40">
                                        {new Date(invoiceOrder.date).toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}
                                    </div>
                                    <div className="mt-6 px-6 py-2 bg-ink-primary text-accent-signature inline-block rounded-xl font-black tracking-widest text-[10px] shadow-xl">
                                        REF-{invoiceOrder.id.slice(-8).toUpperCase()}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-canvas/50 border border-black/5 p-10 rounded-[2.5rem] mb-12 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-signature/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                                <div className="grid grid-cols-2 gap-12 relative z-10">
                                    <div>
                                        <div className="text-[9px] font-black text-[#747576] uppercase tracking-[0.4em] mb-4 opacity-40">Counterparty</div>
                                        <div className="text-3xl font-black text-ink-primary uppercase tracking-tighter leading-tight mb-3">
                                            {invoiceOrder.customerInfo?.name || 'GENERIC CLIENT'}
                                        </div>
                                        <div className="text-[10px] font-bold text-[#747576] uppercase tracking-widest opacity-60">
                                            {getClientName(invoiceOrder.shopId)}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[9px] font-black text-[#747576] uppercase tracking-[0.4em] mb-4 opacity-40">Status</div>
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
                                        <th className="py-4 text-[10px] font-black text-[#747576] uppercase tracking-[0.4em] opacity-40">Asset Designation</th>
                                        <th className="py-4 text-[10px] font-black text-[#747576] uppercase tracking-[0.4em] opacity-40 text-center">Volume</th>
                                        <th className="py-4 text-right text-[10px] font-black text-ink-primary uppercase tracking-[0.4em]">Net Value</th>
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
                                                    <div className="text-[9px] font-bold text-[#747576] uppercase tracking-[0.2em] opacity-30">{item.sku}</div>
                                                </td>
                                                <td className="py-6 text-center">
                                                    <span className="text-lg font-black text-ink-primary font-mono">{item.quantity}</span>
                                                    <span className="text-[10px] font-black text-[#747576] uppercase opacity-40 ml-1">UNITS</span>
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
                                        <span className="text-[10px] font-black text-surface/40 uppercase tracking-[0.3em] mb-1">Final Settlement</span>
                                        <span className="text-[9px] font-black text-accent-signature uppercase tracking-widest">Calculated Net</span>
                                    </div>
                                    <span className="text-4xl font-black text-accent-signature tracking-tighter font-mono">{businessProfile.currencySymbol}{invoiceOrder.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 no-print flex gap-4">
                            <button className="flex-1 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-[10px] uppercase tracking-widest hover:bg-black/5 transition-all shadow-sm bg-surface" onClick={() => setInvoiceOrder(null)}>Return</button>
                            <button className="flex-[2] btn-signature group !py-4 !rounded-pill !text-xs" onClick={handlePrintInvoice}>
                                EXECUTE PRINT
                                <div className="icon-nest !w-10 !h-10 ml-4">
                                    <Printer size={20} />
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
