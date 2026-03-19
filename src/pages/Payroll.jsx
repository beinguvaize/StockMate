import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { DollarSign, Users, Plus, Edit3, Trash2, X, Check, Save, Calendar, Clock, Banknote, CreditCard, FileText, Printer, ChevronDown, ChevronUp, UserPlus, Receipt, Lock } from 'lucide-react';

const PAY_TYPES = ['MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY'];
const DEPARTMENTS = ['Operations', 'Sales', 'Warehouse', 'Delivery', 'Management', 'Admin'];

const Payroll = () => {
    const {
        employees, addEmployee, updateEmployee, deleteEmployee,
        payrollRecords, processPayroll, deletePayrollRecord,
        businessProfile, isViewOnly, hasPermission
    } = useAppContext();

    const [activeTab, setActiveTab] = useState('EMPLOYEES');
    const [showForm, setShowForm] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [showPayRunModal, setShowPayRunModal] = useState(false);
    const [payRunMonth, setPayRunMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [payRunItems, setPayRunItems] = useState([]);
    const [expandedRecord, setExpandedRecord] = useState(null);

    const [empForm, setEmpForm] = useState({
        name: '', email: '', phone: '', department: DEPARTMENTS[0],
        position: '', payType: 'MONTHLY', basePay: '', bankAccount: '', notes: ''
    });

    const viewOnly = isViewOnly();

    // ===== EMPLOYEE CRUD =====
    const openAdd = () => {
        setEditingEmployee(null);
        setEmpForm({ name: '', email: '', phone: '', department: DEPARTMENTS[0], position: '', payType: 'MONTHLY', basePay: '', bankAccount: '', notes: '' });
        setShowForm(true);
    };

    const openEdit = (emp) => {
        setEditingEmployee(emp);
        setEmpForm({
            name: emp.name, email: emp.email || '', phone: emp.phone || '',
            department: emp.department || DEPARTMENTS[0], position: emp.position || '',
            payType: emp.payType || 'MONTHLY', basePay: emp.basePay || '',
            bankAccount: emp.bankAccount || '', notes: emp.notes || ''
        });
        setShowForm(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = { ...empForm, basePay: parseFloat(empForm.basePay) || 0 };
        if (editingEmployee) {
            updateEmployee({ ...editingEmployee, ...data });
        } else {
            addEmployee(data);
        }
        setShowForm(false);
        setEditingEmployee(null);
    };

    const handleDelete = (empId) => {
        deleteEmployee(empId);
        setDeleteConfirm(null);
    };

    const toggleStatus = (emp) => {
        updateEmployee({ ...emp, status: emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
    };

    // ===== PAY RUN =====
    const openPayRun = () => {
        const activeEmps = employees.filter(e => e.status === 'ACTIVE');
        setPayRunItems(activeEmps.map(emp => ({
            employeeId: emp.id,
            employeeName: emp.name,
            department: emp.department,
            basePay: emp.basePay,
            overtime: 0,
            bonus: 0,
            deductions: 0,
            netPay: emp.basePay
        })));
        setShowPayRunModal(true);
    };

    const updatePayRunItem = (empId, field, value) => {
        setPayRunItems(prev => prev.map(item => {
            if (item.employeeId !== empId) return item;
            const updated = { ...item, [field]: parseFloat(value) || 0 };
            updated.netPay = updated.basePay + updated.overtime + updated.bonus - updated.deductions;
            return updated;
        }));
    };

    const handleProcessPayroll = () => {
        const totalNet = payRunItems.reduce((sum, item) => sum + item.netPay, 0);
        const totalBase = payRunItems.reduce((sum, item) => sum + item.basePay, 0);
        const totalOvertime = payRunItems.reduce((sum, item) => sum + item.overtime, 0);
        const totalBonus = payRunItems.reduce((sum, item) => sum + item.bonus, 0);
        const totalDeductions = payRunItems.reduce((sum, item) => sum + item.deductions, 0);

        processPayroll({
            period: payRunMonth,
            items: payRunItems,
            totalEmployees: payRunItems.length,
            totalBase, totalOvertime, totalBonus, totalDeductions, totalNet
        });

        setShowPayRunModal(false);
    };

    // ===== STATS =====
    const activeEmployeesCount = employees.filter(e => e.status === 'ACTIVE').length;
    const totalMonthlyPayroll = employees.filter(e => e.status === 'ACTIVE').reduce((sum, e) => sum + (e.basePay || 0), 0);
    const lastPayRun = payrollRecords.length > 0 ? payrollRecords[0] : null;

    const departmentBreakdown = useMemo(() => {
        const breakdown = {};
        employees.filter(e => e.status === 'ACTIVE').forEach(emp => {
            if (!breakdown[emp.department]) breakdown[emp.department] = { count: 0, cost: 0 };
            breakdown[emp.department].count += 1;
            breakdown[emp.department].cost += emp.basePay || 0;
        });
        return breakdown;
    }, [employees]);

    if (!hasPermission('MANAGE_PAYROLL')) {
        return (
            <div className="animate-fade-in flex flex-col items-center justify-center min-h-[60vh] p-8">
                <div className="glass-panel !max-w-[500px] w-full text-center p-16 shadow-premium border border-black/5 bg-surface">
                    <div className="text-red-500 mb-6 flex justify-center">
                        <div className="bg-red-50 p-6 rounded-full">
                            <Lock size={64} />
                        </div>
                    </div>
                    <h2 className="text-4xl font-black mb-3 tracking-tighter text-ink-primary uppercase leading-tight">Access Prohibited.</h2>
                    <p className="text-ink-secondary mb-10 font-black uppercase text-[10px] tracking-widest opacity-60">
                        Payroll Management Locked
                    </p>
                    <button className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary hover:bg-black/5 transition-all text-xs uppercase" onClick={() => window.history.back()}>
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="animate-fade-in flex flex-col gap-4 pb-12">
                
                {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-4 border-b border-black/5">
                <div>
                    <h1 className="text-6xl font-black text-ink-primary uppercase tracking-tighter leading-none mb-2">PAYROLL.</h1>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-40">COMPENSATION & STAFF ACCOUNTS</p>
                </div>
            </div>

            {/* Quick Stats & Controls - Standard Metric Bar */}
            <div className="flex items-center bg-surface/80 backdrop-blur-xl border border-black/5 rounded-pill shadow-premium p-1 h-14 w-full">
                {/* Metric Section: Active Nodes */}
                <div className="flex items-center gap-3 px-5 border-r border-black/5 h-full">
                    <div className="w-8 h-8 rounded-full bg-accent-signature/10 flex items-center justify-center border border-accent-signature/20">
                        <Users size={14} className="text-accent-signature" />
                    </div>
                    <div className="flex flex-col -space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Active Staff</div>
                        <div className="text-2xl font-black text-ink-primary tracking-tighter leading-none">{activeEmployeesCount} Staff</div>
                    </div>
                </div>

                {/* Metric Section: Last Pay Run */}
                <div className="flex items-center gap-3 px-5 border-r border-black/5 h-full">
                    <div className="w-8 h-8 rounded-full bg-ink-primary/5 flex items-center justify-center border border-black/5">
                        <Banknote size={14} className="text-ink-primary" />
                    </div>
                    <div className="flex flex-col -space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Monthly Cost</div>
                        <div className="text-2xl font-black text-ink-primary tracking-tighter leading-none tabular-nums">
                            {businessProfile.currencySymbol}{totalMonthlyPayroll.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Metric Section: Last Run Status */}
                <div className="flex items-center gap-3 px-5 border-r border-black/5 h-full">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${lastPayRun ? 'bg-accent-signature/10 border-accent-signature/20' : 'bg-red-50 border-red-100'}`}>
                        <Calendar size={14} className={lastPayRun ? 'text-accent-signature' : 'text-red-500'} />
                    </div>
                    <div className="flex flex-col -space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Status</div>
                        <div className="flex items-baseline gap-2">
                             <div className={`text-2xl font-black tracking-tighter leading-none ${lastPayRun ? 'text-ink-primary' : 'text-red-500'}`}>
                                {lastPayRun ? 'SYNCED' : 'PENDING'}
                             </div>
                             {lastPayRun && (
                                <span className="text-[10px] font-black text-ink-secondary opacity-40 uppercase tracking-tight">
                                    {new Date(lastPayRun.processedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                </span>
                             )}
                        </div>
                    </div>
                </div>

                {/* Interactive Section: Actions */}
                <div className="flex-1 flex items-center justify-end h-full pr-1">
                    <div className="flex h-full gap-2 items-center">
                        {!viewOnly && (
                            <button className="px-6 py-0 rounded-pill border border-black/10 font-bold text-ink-primary hover:bg-black/5 transition-all text-[10px] uppercase cursor-pointer h-10 flex items-center justify-center gap-2" onClick={openPayRun} disabled={activeEmployeesCount === 0}>
                                <Receipt size={14} className="opacity-40" /> Pay Run
                            </button>
                        )}
                        {!viewOnly && (
                            <button className="btn-signature h-10 px-8 !py-0 !rounded-pill !text-[10px]" onClick={openAdd}>
                                ADD EMPLOYEE
                                <div className="icon-nest ml-2">
                                    <UserPlus size={14} />
                                </div>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs & Content */}
            <div className="flex flex-col gap-6 mt-2">
                <div className="pill-nav self-start">
                    <button
                        onClick={() => setActiveTab('EMPLOYEES')}
                        className={`px-10 py-4 rounded-pill text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'EMPLOYEES' ? 'bg-ink-primary text-surface shadow-premium' : 'text-ink-secondary hover:text-ink-primary'}`}
                    >
                        Employees
                    </button>
                    <button
                        onClick={() => setActiveTab('HISTORY')}
                        className={`px-10 py-4 rounded-pill text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'HISTORY' ? 'bg-ink-primary text-surface shadow-premium' : 'text-ink-secondary hover:text-ink-primary'}`}
                    >
                        Pay History
                    </button>
                </div>

                {activeTab === 'EMPLOYEES' && (
                    <div className="glass-panel !p-0 overflow-hidden border border-black/5 bg-surface shadow-premium !rounded-bento">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-canvas border-b border-black/5">
                                        <th className="p-4 pl-8 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-50">Employee</th>
                                        <th className="p-4 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-50">Department</th>
                                        <th className="p-4 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-50">Pay Type</th>
                                        <th className="p-4 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-50 text-right">Salary</th>
                                        <th className="p-4 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-50 text-center">Status</th>
                                        <th className="p-4 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-50 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5 bg-surface">
                                    {employees.length === 0 ? (
                                            <tr><td colSpan="6" className="p-10 text-center text-ink-secondary uppercase font-black text-[10px] tracking-[0.5em] opacity-30 italic">No employees found</td></tr>
                                        ) : (
                                            employees.map(emp => (
                                                <tr key={emp.id} className={`group hover:bg-canvas transition-all duration-300 ${emp.status !== 'ACTIVE' ? 'opacity-40 grayscale' : ''}`}>
                                                    <td className="p-1.5 pl-8">
                                                        <div className="text-sm font-black text-ink-primary uppercase tracking-tight leading-none mb-1">{emp.name}</div>
                                                        <div className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.2em] opacity-40">{emp.position || 'Standard Associate'}</div>
                                                    </td>
                                                    <td className="p-1.5">
                                                        <span className="px-3 py-1 rounded-pill bg-canvas text-[10px] font-black text-ink-primary uppercase tracking-widest border border-black/5 shadow-sm">{emp.department}</span>
                                                    </td>
                                                    <td className="p-1.5 text-[10px] font-black text-ink-secondary uppercase tracking-[0.2em] opacity-60">
                                                        {emp.payType}
                                                    </td>
                                                    <td className="p-1.5 text-right text-base font-black text-ink-primary font-mono tabular-nums">
                                                        {businessProfile.currencySymbol}{(emp.basePay || 0).toLocaleString()}
                                                    </td>
                                                    <td className="p-1.5 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <div className={`w-2 h-2 rounded-full shadow-lg ${emp.status === 'ACTIVE' ? 'bg-accent-signature shadow-accent-signature/40' : 'bg-red-500 shadow-red-500/40'}`} />
                                                            <span className={`text-[9px] font-black uppercase tracking-widest ${emp.status === 'ACTIVE' ? 'text-ink-primary' : 'text-red-500'} opacity-60`}>
                                                                {emp.status}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="p-1.5 text-right">
                                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all duration-500">
                                                            <button onClick={() => openEdit(emp)} className="w-8 h-8 rounded-xl bg-surface border border-black/5 shadow-premium flex items-center justify-center text-ink-primary hover:bg-ink-primary hover:text-accent-signature transition-all"><Edit3 size={14} /></button>
                                                            <button onClick={() => toggleStatus(emp)} className="w-8 h-8 rounded-xl bg-surface border border-black/5 shadow-premium flex items-center justify-center text-ink-primary hover:bg-ink-primary hover:text-accent-signature transition-all"><Receipt size={14} /></button>
                                                            <button onClick={() => setDeleteConfirm(emp.id)} className="w-8 h-8 rounded-xl bg-surface border border-black/5 shadow-premium flex items-center justify-center text-red-500 hover:bg-red-50 transition-all"><Trash2 size={14} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'HISTORY' && (
                        <div className="flex flex-col gap-10">
                            {payrollRecords.length === 0 ? (
                                <div className="glass-panel p-40 text-center bg-surface border border-black/5 shadow-premium !rounded-bento">
                                    <Banknote size={100} className="mx-auto mb-10 text-ink-primary opacity-5" strokeWidth={1} />
                                    <h3 className="text-sm font-black text-ink-primary uppercase tracking-[0.5em] mb-4 opacity-50">No History</h3>
                                    <p className="text-[10px] font-black text-ink-secondary uppercase opacity-40 mb-12 tracking-widest max-w-sm mx-auto leading-loose">No payroll records found in the system.</p>
                                    <button className="btn-signature mx-auto h-20" onClick={openPayRun}>RUN PAYROLL</button>
                                </div>
                            ) : (
                                payrollRecords.map(record => (
                                    <div key={record.id} className="glass-panel !p-0 overflow-hidden group bg-surface border border-black/5 shadow-premium !rounded-bento">
                                        <div
                                            onClick={() => setExpandedRecord(expandedRecord === record.id ? null : record.id)}
                                            className="p-12 flex justify-between items-center cursor-pointer hover:bg-canvas transition-all duration-500"
                                        >
                                            <div className="flex items-center gap-8">
                                                <div className="w-20 h-20 rounded-3xl bg-ink-primary flex items-center justify-center text-accent-signature shadow-2xl transition-all group-hover:scale-110">
                                                    <Receipt size={32} />
                                                </div>
                                                <div>
                                                    <div className="text-3xl font-black text-ink-primary uppercase tracking-tighter leading-none mb-2">RUN.{record.period}</div>
                                                    <div className="text-sm font-black text-ink-secondary uppercase tracking-[0.4em] opacity-40">AUTHORIZED ID: {record.id.slice(0, 12)}</div>
                                                </div>
                                            </div>
                                            <div className="text-right flex items-center gap-12">
                                                <div>
                                                    <div className="text-4xl font-black text-ink-primary tracking-tighter mb-1">
                                                        {businessProfile.currencySymbol}{record.totalNet.toLocaleString()}
                                                    </div>
                                                    <div className="text-sm font-black text-ink-secondary uppercase tracking-[0.2em] opacity-40">Total Paid</div>
                                                </div>
                                                <div className={`w-14 h-14 rounded-full border border-black/10 flex items-center justify-center transition-all duration-700 shadow-sm ${expandedRecord === record.id ? 'rotate-180 bg-ink-primary text-accent-signature' : 'bg-canvas text-ink-primary'}`}>
                                                    <ChevronDown size={24} />
                                                </div>
                                            </div>
                                        </div>
                                        {expandedRecord === record.id && (
                                            <div className="p-12 pt-0 border-t border-black/5 bg-canvas/30 animate-fade-in">
                                                <div className="grid grid-cols-4 gap-6 py-10">
                                                    <div className="p-8 rounded-bento bg-surface border border-black/5 shadow-sm">
                                                        <div className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] mb-3 opacity-40">Gross Base</div>
                                                        <div className="text-2xl font-black text-ink-primary tracking-tighter">{businessProfile.currencySymbol}{record.totalBase.toLocaleString()}</div>
                                                    </div>
                                                    <div className="p-8 rounded-bento bg-surface border border-black/5 shadow-sm">
                                                        <div className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] mb-3 opacity-40">Adjustments</div>
                                                        <div className="text-2xl font-black text-accent-signature-hover">+{businessProfile.currencySymbol}{(record.totalOvertime + record.totalBonus).toLocaleString()}</div>
                                                    </div>
                                                    <div className="p-8 rounded-bento bg-surface border border-black/5 shadow-sm">
                                                        <div className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] mb-3 opacity-40">Deductions</div>
                                                        <div className="text-2xl font-black text-red-500">-{businessProfile.currencySymbol}{record.totalDeductions.toLocaleString()}</div>
                                                    </div>
                                                    <div className="p-8 rounded-bento bg-ink-primary text-surface shadow-2xl">
                                                        <div className="text-[10px] font-black text-surface/40 uppercase tracking-[0.3em] mb-3 opacity-40">Total Net</div>
                                                        <div className="text-2xl font-black text-accent-signature">{businessProfile.currencySymbol}{record.totalNet.toLocaleString()}</div>
                                                    </div>
                                                </div>
                                                <div className="bg-surface rounded-2xl border border-black/5 overflow-hidden shadow-premium">
                                                    <table className="w-full text-left">
                                                        <thead>
                                                            <tr className="bg-canvas/50">
                                                                <th className="p-6 text-[10px] font-black text-ink-secondary uppercase tracking-[0.4em] opacity-40">Employee</th>
                                                                <th className="p-6 text-right text-[10px] font-black text-ink-secondary uppercase tracking-[0.4em] opacity-40">Net Pay</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-black/5">
                                                            {record.items.map(item => (
                                                                <tr key={item.employeeId} className="hover:bg-canvas/30 transition-colors">
                                                                    <td className="p-6 text-sm font-black text-ink-primary uppercase tracking-tight">{item.employeeName}</td>
                                                                    <td className="p-6 text-right text-base font-black text-ink-primary tracking-tight">{businessProfile.currencySymbol}{item.netPay.toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Personnel Onboarding Modal */}
            {showForm && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-[650px] !p-12">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h1 className="text-5xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">
                                    {editingEmployee ? 'STAFF PROFILE.' : 'PERSONNEL ONBOARDING.'}
                                </h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-40">HUMAN RESOURCES & COMPENSATION</p>
                            </div>
                            <button 
                                onClick={() => setShowForm(false)}
                                className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Full Legal Name</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-lg text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        placeholder="PERSONNEL NAME..."
                                        value={empForm.name} 
                                        onChange={e => setEmpForm({ ...empForm, name: e.target.value })} 
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Department</label>
                                    <select 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase appearance-none cursor-pointer" 
                                        value={empForm.department} 
                                        onChange={e => setEmpForm({ ...empForm, department: e.target.value })}
                                    >
                                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Position</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        placeholder="e.g. ARCHITECT"
                                        value={empForm.position} 
                                        onChange={e => setEmpForm({ ...empForm, position: e.target.value })} 
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Pay Frequency</label>
                                    <select 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase appearance-none cursor-pointer" 
                                        value={empForm.payType} 
                                        onChange={e => setEmpForm({ ...empForm, payType: e.target.value })}
                                    >
                                        {PAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>

                                <div className="p-4 rounded-2xl bg-ink-primary flex flex-col justify-center">
                                    <label className="block text-[8px] font-black uppercase tracking-widest text-surface/40 mb-2">Base Compensation</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl font-black text-surface/30">{businessProfile.currencySymbol}</span>
                                        <input 
                                            required 
                                            type="number" 
                                            step="0.01" 
                                            className="bg-transparent border-none w-full p-0 text-2xl font-black text-accent-signature outline-none tabular-nums" 
                                            value={empForm.basePay} 
                                            onChange={e => setEmpForm({ ...empForm, basePay: e.target.value })} 
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Payment Identification</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            className="w-full bg-canvas border-none rounded-2xl p-5 pl-14 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                            placeholder="ACCOUNT ID / IBAN..."
                                            value={empForm.bankAccount} 
                                            onChange={e => setEmpForm({ ...empForm, bankAccount: e.target.value })} 
                                        />
                                        <CreditCard size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-ink-primary opacity-20" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <button type="button" className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill">
                                    {editingEmployee ? 'SAVE CHANGES' : 'ONBOARD STAFF'}
                                    <div className="icon-nest !w-10 !h-10 ml-4">
                                        <UserPlus size={18} />
                                    </div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Pay Run Modal */}
            {showPayRunModal && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-[1300px] !p-0 !overflow-hidden flex flex-col">
                        <div className="p-12 border-b border-black/5 flex justify-between items-start bg-canvas/30">
                            <div>
                                <h1 className="text-6xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-3">PROCESS PAYROLL.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.4em] opacity-40">Period: {new Date(payRunMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                            </div>
                            <div className="flex gap-4 items-center">
                                <div className="relative group">
                                    <input type="month" className="bg-white border-none rounded-pill px-10 py-5 font-black text-sm text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all shadow-premium" value={payRunMonth} onChange={e => setPayRunMonth(e.target.value)} />
                                </div>
                                <button 
                                    onClick={() => setShowPayRunModal(false)}
                                    className="w-16 h-16 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary"
                                >
                                    <X size={28} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar bg-surface/50">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10 bg-surface/50 backdrop-blur-xl">
                                    <tr className="border-b-2 border-ink-primary">
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-50">Personnel Node</th>
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-50 text-right">Base Units</th>
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-50 text-right">Overtime</th>
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-50 text-right">Bonus</th>
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-50 text-right">Deductions</th>
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-50 text-right">Net Liquidity</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5">
                                    {payRunItems.map(item => (
                                        <tr key={item.employeeId} className="hover:bg-canvas transition-all duration-300">
                                            <td className="py-6">
                                                <div className="text-base font-black text-ink-primary uppercase tracking-tight leading-none mb-1">{item.employeeName}</div>
                                                <div className="text-[9px] font-black text-ink-secondary uppercase tracking-[0.2em] opacity-30">{item.department}</div>
                                            </td>
                                            <td className="py-6 text-right font-black text-xs text-ink-secondary opacity-60 tabular-nums">{businessProfile.currencySymbol}{item.basePay.toLocaleString()}</td>
                                            <td className="py-6 text-right">
                                                <input type="number" className="w-28 bg-canvas border-none rounded-xl p-3 text-right font-black text-sm text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 shadow-sm" value={item.overtime} onChange={e => updatePayRunItem(item.employeeId, 'overtime', e.target.value)} />
                                            </td>
                                            <td className="py-6 text-right">
                                                <input type="number" className="w-28 bg-canvas border-none rounded-xl p-3 text-right font-black text-sm text-accent-signature-hover outline-none focus:ring-4 focus:ring-accent-signature/20 shadow-sm" value={item.bonus} onChange={e => updatePayRunItem(item.employeeId, 'bonus', e.target.value)} />
                                            </td>
                                            <td className="py-6 text-right">
                                                <input type="number" className="w-28 bg-canvas border-none rounded-xl p-3 text-right font-black text-sm text-red-500 outline-none focus:ring-4 focus:ring-red-500/10 shadow-sm" value={item.deductions} onChange={e => updatePayRunItem(item.employeeId, 'deductions', e.target.value)} />
                                            </td>
                                            <td className="py-6 text-right font-black text-2xl text-ink-primary tracking-tighter tabular-nums">
                                                {businessProfile.currencySymbol}{item.netPay.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-12 bg-ink-primary flex justify-between items-center shadow-2xl relative">
                            <div className="flex gap-16">
                                <div>
                                    <div className="text-[10px] font-black text-surface/40 uppercase tracking-[0.3em] mb-2 leading-none">Total Net Disbursement</div>
                                    <div className="text-5xl font-black text-accent-signature tracking-tighter">
                                        {businessProfile.currencySymbol}{payRunItems.reduce((sum, i) => sum + i.netPay, 0).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-black text-surface/40 uppercase tracking-[0.3em] mb-2 leading-none">Authorization Count</div>
                                    <div className="text-5xl font-black text-surface tracking-tighter">{payRunItems.length} PERSONNEL</div>
                                </div>
                            </div>
                            <button className="btn-signature !h-20 !px-16 !text-lg" onClick={handleProcessPayroll}>
                                AUTHORIZE PAYROLL
                                <div className="icon-nest !w-12 !h-12 ml-6">
                                    <Check size={28} />
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Payroll;
