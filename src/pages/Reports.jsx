import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    Calendar, FileText, Download, Printer, TrendingUp, Package, Receipt, 
    ArrowUpRight, ArrowDownRight, X, Check, Users, Truck, 
    DollarSign, Activity, PieChart, Layers, ArrowRight, TrendingDown, Lock,
    CreditCard, LayoutGrid, UserCircle, Briefcase, Shield
} from 'lucide-react';

// Import New Report Components
import FinancialReports from '../components/reports/FinancialReports';
import InventoryReports from '../components/reports/InventoryReports';
import SalesReports from '../components/reports/SalesReports';
import ClientReports from '../components/reports/ClientReports';
import LogisticsReports from '../components/reports/LogisticsReports';
import HRReports from '../components/reports/HRReports';
import ReportAudit from '../components/reports/ReportAudit';
import ReportPerformance from '../components/reports/ReportPerformance';

// Import Export Utility
import { downloadCSV, exportSalesCSV, exportInventoryCSV } from '../utils/csvExport';

const Reports = () => {
    const { 
        sales, movementLog, expenses, businessProfile, clients, users, vehicles, routes,
        getShopName, getUserName, getVehicleName, getEmployeeName, employees, payrollRecords, products, updateProduct, hasPermission, isOwner, currentUser
    } = useAppContext();
    
    const [dateRange, setDateRange] = useState('MONTH');
    const [activeTab, setActiveTab] = useState('FINANCIAL');
    const [isSaving, setIsSaving] = useState(false);
    const [editedProducts, setEditedProducts] = useState([]);

    // Role-based Tab Access Control
    const userRole = currentUser?.roles?.[0] || 'STAFF';
    const isFullAccess = userRole === 'GLOBAL_ADMIN' || userRole === 'OWNER';

    const TABS = [
        { id: 'FINANCIAL', label: 'Financials', icon: <DollarSign size={18} />, permission: 'expenses' },
        { id: 'INVENTORY', label: 'Inventory', icon: <Package size={18} />, permission: 'inventory' },
        { id: 'SALES', label: 'Sales', icon: <TrendingUp size={18} />, permission: 'sales' },
        { id: 'CLIENTS', label: 'Clients', icon: <UserCircle size={18} />, permission: 'clients' },
        { id: 'LOGISTICS', label: 'Logistics', icon: <Truck size={18} />, permission: 'inventory' },
        { id: 'HR', label: 'HR/Payroll', icon: <Briefcase size={18} />, permission: 'reports' },
        { id: 'PERFORMANCE', label: 'Performance', icon: <Activity size={18} />, permission: 'reports' },
        { id: 'AUDIT', label: 'Audit Trail', icon: <Shield size={18} />, permission: 'reports' },
        { id: 'ADVANCED', label: 'Bulk Edit', icon: <LayoutGrid size={18} />, permission: 'inventory' },
    ].filter(tab => hasPermission(tab.permission, 'view'));

    useEffect(() => {
        if (activeTab === 'ADVANCED') {
            setEditedProducts(JSON.parse(JSON.stringify(products)));
        }
    }, [activeTab, products]);

    // Global filtering logic shared across tabs
    const filteredSales = useMemo(() => {
        if (dateRange === 'ALL') return sales;
        const now = new Date();
        const past = new Date();
        if (dateRange === 'TODAY') past.setHours(0, 0, 0, 0);
        else if (dateRange === 'WEEK') past.setDate(now.getDate() - 7);
        else if (dateRange === 'MONTH') past.setMonth(now.getMonth() - 1);
        return sales.filter(item => new Date(item.date) >= past);
    }, [sales, dateRange]);

    const filteredExpenses = useMemo(() => {
        if (dateRange === 'ALL') return expenses;
        const now = new Date();
        const past = new Date();
        if (dateRange === 'TODAY') past.setHours(0, 0, 0, 0);
        else if (dateRange === 'WEEK') past.setDate(now.getDate() - 7);
        else if (dateRange === 'MONTH') past.setMonth(now.getMonth() - 1);
        return expenses.filter(item => new Date(item.date) >= past);
    }, [expenses, dateRange]);

    const filteredPayroll = useMemo(() => {
        const records = payrollRecords || [];
        if (dateRange === 'ALL') return records;
        const now = new Date();
        const past = new Date();
        if (dateRange === 'TODAY') past.setHours(0, 0, 0, 0);
        else if (dateRange === 'WEEK') past.setDate(now.getDate() - 7);
        else if (dateRange === 'MONTH') past.setMonth(now.getMonth() - 1);
        return records.filter(item => new Date(item.processed_at || item.date) >= past);
    }, [payrollRecords, dateRange]);

    const handleBulkEdit = (productId, field, value) => {
        setEditedProducts(prev => prev.map(p => {
            if (p.id === productId) {
                const updated = { ...p, [field]: value };
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
            const changedProducts = editedProducts.filter(ep => {
                const original = products.find(p => p.id === ep.id);
                return JSON.stringify(original) !== JSON.stringify(ep);
            });
            if (changedProducts.length === 0) return alert("No changes detected.");
            for (const p of changedProducts) await updateProduct(p);
            alert(`Successfully updated ${changedProducts.length} items.`);
        } catch (err) {
            console.error("Bulk update failed:", err);
            alert("Failed to save some changes.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleGlobalExport = () => {
        const bName = businessProfile?.name || 'Ledgr ERP';
        
        switch (activeTab) {
            case 'FINANCIAL':
                downloadCSV(filteredExpenses, 'ledgr_expenses', bName);
                break;
            case 'INVENTORY':
                exportInventoryCSV(products, bName);
                break;
            case 'SALES':
                exportSalesCSV(filteredSales, bName, getShopName);
                break;
            case 'CLIENTS':
                downloadCSV(clients, 'ledgr_clients', bName);
                break;
            case 'LOGISTICS':
                downloadCSV(routes, 'ledgr_routes', bName);
                break;
            case 'HR':
                downloadCSV(filteredPayroll, 'ledgr_payroll', bName);
                break;
            case 'AUDIT':
                downloadCSV(movementLog, 'ledgr_audit_trail', bName);
                break;
            default:
                alert("This module does not support direct export.");
                break;
        }
    };

    return (
        <div className="flex flex-col gap-8 pb-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center no-print gap-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl md:text-8xl font-black text-ink-primary uppercase tracking-tighter leading-[0.8] mb-4">REPORTS<span className="text-accent-signature">.</span></h1>
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-4 bg-accent-signature rounded-full"></div>
                        <p className="text-[10px] font-black text-[#4b5563] tracking-[0.4em] uppercase opacity-40">
                            Business Intelligence & Audit Terminal
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-white p-2 rounded-full border border-black/5 shadow-premium">
                    <div className="flex h-12 p-1 bg-canvas rounded-full items-center px-4">
                        <Calendar size={14} className="text-[#4b5563] opacity-30" />
                        <select 
                            className="bg-transparent border-none font-black text-[10px] uppercase tracking-widest text-ink-primary outline-none px-4 cursor-pointer" 
                            value={dateRange} 
                            onChange={e => setDateRange(e.target.value)}
                        >
                            <option value="TODAY">TODAY</option>
                            <option value="WEEK">WEEK</option>
                            <option value="MONTH">MONTH</option>
                            <option value="ALL">ALL TIME</option>
                        </select>
                    </div>
                    <button className="icon-nest !w-12 !h-12 !bg-ink-primary !text-white hover:scale-105" onClick={() => window.print()}>
                        <Printer size={18} />
                    </button>
                    <button className="icon-nest !w-12 !h-12 !bg-canvas !text-ink-primary border border-black/5 hover:scale-105" onClick={handleGlobalExport}>
                        <Download size={18} />
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="no-print flex items-center gap-1 p-2 bg-white/60 backdrop-blur-xl border border-white/20 rounded-[2.5rem] shadow-glass overflow-x-auto scrollbar-hide sticky top-4 z-50">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-3 px-8 py-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                            activeTab === tab.id 
                            ? 'bg-ink-primary text-white shadow-2xl scale-[1.02]' 
                            : 'text-ink-secondary hover:bg-white/40'
                        }`}
                    >
                        <span className={`${activeTab === tab.id ? 'opacity-100' : 'opacity-40'}`}>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="min-h-[60vh]">
                {activeTab === 'FINANCIAL' && (
                    <FinancialReports 
                        sales={filteredSales} 
                        expenses={filteredExpenses} 
                        payroll={filteredPayroll}
                        businessProfile={businessProfile}
                    />
                )}

                {activeTab === 'INVENTORY' && (
                    <InventoryReports 
                        products={products} 
                        sales={sales} 
                        movementLog={movementLog}
                        businessProfile={businessProfile}
                    />
                )}

                {activeTab === 'SALES' && (
                    <SalesReports 
                        sales={filteredSales} 
                        clients={clients} 
                        products={products}
                        businessProfile={businessProfile}
                    />
                )}

                {activeTab === 'CLIENTS' && (
                    <ClientReports 
                        clients={clients} 
                        sales={sales} 
                        businessProfile={businessProfile}
                    />
                )}

                {activeTab === 'LOGISTICS' && (
                    <LogisticsReports 
                        sales={sales} 
                        vehicles={vehicles} 
                        routes={routes}
                        businessProfile={businessProfile}
                    />
                )}

                {activeTab === 'HR' && (
                    <HRReports 
                        employees={employees} 
                        payroll={filteredPayroll} 
                        businessProfile={businessProfile}
                    />
                )}

                {activeTab === 'PERFORMANCE' && (
                    <ReportPerformance 
                        sales={sales} 
                        products={products} 
                        businessProfile={businessProfile} 
                    />
                )}

                {activeTab === 'AUDIT' && (
                    <ReportAudit 
                        movementLog={movementLog} 
                        products={products} 
                        users={users} 
                        businessProfile={businessProfile}
                    />
                )}

                {activeTab === 'ADVANCED' && (
                    <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                        <div className="flex justify-between items-center mb-8 pb-8 border-b border-black/5">
                            <div>
                                <h3 className="text-2xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">Bulk Catalog Manager.</h3>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em]">Direct Schema Editing Tool</p>
                            </div>
                            <button 
                                className={`btn-signature !h-12 !px-8 !text-[10px] ${isSaving ? 'opacity-50 cursor-wait' : ''}`}
                                onClick={saveBulkChanges}
                                disabled={isSaving}
                            >
                                {isSaving ? 'SAVING...' : 'SAVE ALL CHANGES'}
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[1000px]">
                                <thead>
                                    <tr className="border-b-2 border-black/5">
                                        <th className="py-4 px-2 text-[10px] font-black uppercase tracking-widest text-[#4b5563]">Product Info</th>
                                        <th className="py-4 px-2 text-[10px] font-black uppercase tracking-widest text-[#4b5563]">Stock</th>
                                        <th className="py-4 px-2 text-[10px] font-black uppercase tracking-widest text-[#4b5563]">Cost Price</th>
                                        <th className="py-4 px-2 text-[10px] font-black uppercase tracking-widest text-[#4b5563]">Selling Price</th>
                                        <th className="py-4 px-2 text-[10px] font-black uppercase tracking-widest text-[#4b5563]">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {editedProducts.map((p, i) => (
                                        <tr key={i} className="border-b border-black/5 hover:bg-canvas/40">
                                            <td className="py-4 px-2">
                                                <div className="text-[11px] font-black text-ink-primary uppercase">{p.name}</div>
                                                <div className="text-[9px] font-black text-accent-signature-hover tracking-widest uppercase opacity-70">{p.sku}</div>
                                            </td>
                                            <td className="py-4 px-2">
                                                <input 
                                                    type="number" 
                                                    className="w-24 bg-canvas/50 border border-black/5 rounded-lg px-3 py-2 text-xs font-black outline-none focus:border-accent-signature"
                                                    value={p.stock}
                                                    onChange={e => handleBulkEdit(p.id, 'stock', e.target.value)}
                                                />
                                            </td>
                                            <td className="py-4 px-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black opacity-30">{businessProfile.currencySymbol}</span>
                                                    <input 
                                                        type="number" 
                                                        className="w-24 bg-canvas/50 border border-black/5 rounded-lg px-3 py-2 text-xs font-black outline-none focus:border-accent-signature"
                                                        value={p.costPrice}
                                                        onChange={e => handleBulkEdit(p.id, 'costPrice', e.target.value)}
                                                    />
                                                </div>
                                            </td>
                                            <td className="py-4 px-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black opacity-30">{businessProfile.currencySymbol}</span>
                                                    <input 
                                                        type="number" 
                                                        className="w-24 bg-canvas/50 border border-black/5 rounded-lg px-3 py-2 text-xs font-black outline-none focus:border-accent-signature"
                                                        value={p.sellingPrice}
                                                        onChange={e => handleBulkEdit(p.id, 'sellingPrice', e.target.value)}
                                                    />
                                                </div>
                                            </td>
                                            <td className="py-4 px-2">
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${p.stock > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                                    {p.stock > 0 ? 'In Stock' : 'Alert'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reports;
