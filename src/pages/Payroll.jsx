import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { DollarSign, Users, Plus, Edit3, Trash2, X, Check, Save, Calendar, Clock, Banknote, CreditCard, FileText, Printer, ChevronDown, ChevronUp, UserPlus, Receipt } from 'lucide-react';

const PAY_TYPES = ['MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY'];
const DEPARTMENTS = ['Operations', 'Sales', 'Warehouse', 'Delivery', 'Management', 'Admin'];

const Payroll = () => {
    const {
        employees, addEmployee, updateEmployee, deleteEmployee,
        payrollRecords, processPayroll, deletePayrollRecord,
        businessProfile, isViewOnly
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
    const activeEmployees = employees.filter(e => e.status === 'ACTIVE');
    const totalMonthlyPayroll = activeEmployees.reduce((sum, e) => sum + (e.basePay || 0), 0);
    const lastPayRun = payrollRecords.length > 0 ? payrollRecords[0] : null;

    const departmentBreakdown = useMemo(() => {
        const breakdown = {};
        activeEmployees.forEach(emp => {
            if (!breakdown[emp.department]) breakdown[emp.department] = { count: 0, cost: 0 };
            breakdown[emp.department].count += 1;
            breakdown[emp.department].cost += emp.basePay || 0;
        });
        return breakdown;
    }, [activeEmployees]);

    return (
        <div className="page-container animate-fade-in" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
                <div>
                    <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>Human Resources</h1>
                    <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Global payroll management & staff oversight for <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{businessProfile.name}</span></p>
                </div>
                {!viewOnly && (
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="btn btn-secondary" onClick={openPayRun} disabled={activeEmployees.length === 0}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1.5rem', fontWeight: 700 }}>
                            <Banknote size={20} strokeWidth={2} /> Initiate Pay Run
                        </button>
                        <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1.5rem', fontWeight: 800, boxShadow: '0 4px 12px var(--primary-glare)' }}>
                            <UserPlus size={20} strokeWidth={2.5} /> Onboard Staff
                        </button>
                    </div>
                )}
            </div>

            {/* KPI Cards */}
            <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                <div className="card" style={{ padding: '1.75rem', borderLeft: '6px solid var(--primary)', borderRadius: '24px', boxShadow: 'var(--shadow-md)', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Active Workforce</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.025em', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        {activeEmployees.length} 
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-dim)', fontWeight: 600 }}>Employees</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, marginTop: '0.5rem' }}>{employees.length - activeEmployees.length} currently inactive in system</div>
                </div>
                <div className="card" style={{ padding: '1.75rem', borderLeft: '6px solid var(--success)', borderRadius: '24px', boxShadow: 'var(--shadow-md)', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly Recurring Liability</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--success)', letterSpacing: '-0.025em' }}>
                        <span style={{ fontSize: '1.5rem', marginRight: '0.25rem' }}>{businessProfile.currencySymbol}</span>
                        {totalMonthlyPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, marginTop: '0.5rem' }}>Estimated base salary commitment</div>
                </div>
                <div className="card" style={{ padding: '1.75rem', borderLeft: '6px solid var(--warning)', borderRadius: '24px', boxShadow: 'var(--shadow-md)', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Most Recent Settlement</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.025em' }}>
                        {lastPayRun ? (
                            <>
                                <span style={{ fontSize: '1.5rem', marginRight: '0.25rem' }}>{businessProfile.currencySymbol}</span>
                                {lastPayRun.totalNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </>
                        ) : 'Pending'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, marginTop: '0.5rem' }}>
                        {lastPayRun ? `Processed on ${new Date(lastPayRun.processedAt).toLocaleDateString()}` : 'No pay runs recorded in cycle'}
                    </div>
                </div>
            </div>

            {/* Department Breakdown */}
            {Object.keys(departmentBreakdown).length > 0 && (
                <div className="card" style={{ padding: '2rem', borderRadius: '28px', border: '1.5px solid var(--border-light)', boxShadow: 'none', backgroundColor: '#fcfdfe' }}>
                    <h3 style={{ fontSize: '0.75rem', fontWeight: 900, marginBottom: '1.5rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={16} className="text-primary" /> Sector Allocation Breakdown
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.25rem' }}>
                        {Object.entries(departmentBreakdown).map(([dept, data]) => (
                            <div key={dept} style={{ padding: '1.25rem', borderRadius: '18px', backgroundColor: 'white', border: '1.5px solid var(--border-light)', boxShadow: 'var(--shadow-sm)' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.75rem' }}>{dept}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                    <div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--primary)' }}>{data.count} <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Staff</span></div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, marginTop: '0.25rem' }}>{businessProfile.currencySymbol}{data.cost.toFixed(2)} /mo</div>
                                    </div>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                        <Users size={18} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '2.5rem', borderBottom: '2px solid var(--border-light)', marginBottom: '1.5rem', padding: '0 1rem' }}>
                <button 
                    onClick={() => setActiveTab('EMPLOYEES')} 
                    style={{ 
                        padding: '1rem 0', background: 'none', border: 'none', 
                        borderBottom: activeTab === 'EMPLOYEES' ? '3px solid var(--primary)' : '3px solid transparent', 
                        color: activeTab === 'EMPLOYEES' ? 'var(--primary)' : 'var(--text-dim)', 
                        fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.625rem',
                        transition: 'all 0.2s ease', marginBottom: '-2px'
                    }}
                >
                    <Users size={18} strokeWidth={activeTab === 'EMPLOYEES' ? 2.5 : 2} /> Workforce Roster
                </button>
                <button 
                    onClick={() => setActiveTab('HISTORY')} 
                    style={{ 
                        padding: '1rem 0', background: 'none', border: 'none', 
                        borderBottom: activeTab === 'HISTORY' ? '3px solid var(--primary)' : '3px solid transparent', 
                        color: activeTab === 'HISTORY' ? 'var(--primary)' : 'var(--text-dim)', 
                        fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.625rem',
                        transition: 'all 0.2s ease', marginBottom: '-2px'
                    }}
                >
                    <Receipt size={18} strokeWidth={activeTab === 'HISTORY' ? 2.5 : 2} /> Dispatch History
                </button>
            </div>

            {/* Add/Edit Employee Form */}
            {showForm && (
                <div className="card animate-slide-down" style={{ marginBottom: '2.5rem', padding: '2.5rem', borderRadius: '28px', border: 'none', boxShadow: 'var(--shadow-lg)', borderLeft: `8px solid ${editingEmployee ? 'var(--warning)' : 'var(--primary)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.025em', color: 'var(--text-main)' }}>
                                {editingEmployee ? 'Update Staff Member' : 'System Intake: New Personnel'}
                            </h3>
                            <p style={{ color: 'var(--text-dim)', fontWeight: 600, marginTop: '0.25rem' }}>Operational details and remuneration structure.</p>
                        </div>
                        <button className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '12px' }} onClick={() => setShowForm(false)}><X size={20} /></button>
                    </div>
                    
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase' }}>Full Legal Name *</label>
                            <input required type="text" className="input-field" value={empForm.name} onChange={e => setEmpForm({ ...empForm, name: e.target.value })} placeholder="e.g. Alexander Hamilton" style={{ padding: '0.875rem 1.25rem', borderRadius: '14px', fontWeight: 600 }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase' }}>Communication Channel (Email)</label>
                            <input type="email" className="input-field" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} placeholder="staff@business.com" style={{ padding: '0.875rem 1.25rem', borderRadius: '14px', fontWeight: 600 }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase' }}>Contact Number</label>
                            <input type="text" className="input-field" value={empForm.phone} onChange={e => setEmpForm({ ...empForm, phone: e.target.value })} placeholder="+1 (555) 000-0000" style={{ padding: '0.875rem 1.25rem', borderRadius: '14px', fontWeight: 600 }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase' }}>Departmental Assignment</label>
                            <select className="input-field" value={empForm.department} onChange={e => setEmpForm({ ...empForm, department: e.target.value })} style={{ padding: '0.875rem 1.25rem', borderRadius: '14px', fontWeight: 700 }}>
                                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase' }}>Functional Title</label>
                            <input type="text" className="input-field" value={empForm.position} onChange={e => setEmpForm({ ...empForm, position: e.target.value })} placeholder="e.g. Senior Logistics Coordinator" style={{ padding: '0.875rem 1.25rem', borderRadius: '14px', fontWeight: 600 }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase' }}>Remuneration Cycle</label>
                            <select className="input-field" value={empForm.payType} onChange={e => setEmpForm({ ...empForm, payType: e.target.value })} style={{ padding: '0.875rem 1.25rem', borderRadius: '14px', fontWeight: 700 }}>
                                {PAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase' }}>Base Guaranteed Pay ({businessProfile.currencySymbol})</label>
                            <input required type="number" step="0.01" min="0" className="input-field" value={empForm.basePay} onChange={e => setEmpForm({ ...empForm, basePay: e.target.value })} placeholder="0.00" style={{ padding: '0.875rem 1.25rem', borderRadius: '14px', fontWeight: 800, color: 'var(--primary)' }} />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase' }}>Settlement / Banking Instructuions</label>
                            <input type="text" className="input-field" value={empForm.bankAccount} onChange={e => setEmpForm({ ...empForm, bankAccount: e.target.value })} placeholder="Routing / Account / SWIFT" style={{ padding: '0.875rem 1.25rem', borderRadius: '14px', fontWeight: 600 }} />
                        </div>
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1.25rem', marginTop: '1rem' }}>
                            <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '1rem', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontWeight: 900, boxShadow: '0 8px 20px var(--primary-glare)' }}>
                                <Save size={20} strokeWidth={2.5} /> {editingEmployee ? 'Authorize Final Correction' : 'Commit New Employment Contract'}
                            </button>
                            <button type="button" className="btn btn-secondary" style={{ padding: '1rem 2rem', borderRadius: '18px', fontWeight: 700 }} onClick={() => { setShowForm(false); setEditingEmployee(null); }}>Discard Changes</button>
                        </div>
                    </form>
                </div>
            )}

            {/* EMPLOYEES TAB */}
            {activeTab === 'EMPLOYEES' && (
                <div className="card" style={{ padding: 0, overflow: 'hidden', border: 'none', boxShadow: 'var(--shadow-md)', borderRadius: '24px' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', minWidth: '1000px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8fafc' }}>
                                    <th style={{ padding: '1.25rem 1.5rem', fontWeight: 800, color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid var(--border-light)' }}>Personnel Information</th>
                                    <th style={{ padding: '1.25rem 1.5rem', fontWeight: 800, color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid var(--border-light)' }}>Allocation</th>
                                    <th style={{ padding: '1.25rem 1.5rem', fontWeight: 800, color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid var(--border-light)' }}>Cycle</th>
                                    <th style={{ padding: '1.25rem 1.5rem', fontWeight: 800, color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid var(--border-light)', textAlign: 'right' }}>Standard Pay</th>
                                    <th style={{ padding: '1.25rem 1.5rem', fontWeight: 800, color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid var(--border-light)', textAlign: 'center' }}>Operational Status</th>
                                    <th style={{ padding: '1.25rem 1.5rem', fontWeight: 800, color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid var(--border-light)', textAlign: 'right' }}>System Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.length === 0 ? (
                                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '6rem 3rem', color: 'var(--text-dim)' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.2 }}>👥</div>
                                        <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>Personnel Registry Empty</div>
                                        <p style={{ marginTop: '0.5rem' }}>Begin your organizational digital twin by onboarding your first staff member.</p>
                                    </td></tr>
                                ) : (
                                    employees.map(emp => (
                                        <tr key={emp.id} className="table-row-hover" style={{ backgroundColor: 'white', opacity: emp.status === 'ACTIVE' ? 1 : 0.6 }}>
                                            <td style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                                    <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: 'var(--bg-main)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.1rem', border: '1.5px solid var(--border-light)', flexShrink: 0 }}>
                                                        {emp.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1rem', letterSpacing: '-0.01em' }}>{emp.name}</div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 700, marginTop: '0.125rem' }}>
                                                            {emp.position || 'Classified'} • {emp.email || emp.phone || 'No Contact Data'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
                                                <span style={{ padding: '4px 10px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, backgroundColor: 'var(--bg-main)', color: 'var(--primary)', border: '1px solid var(--primary-glare)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                                                    {emp.department}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-dim)' }}>{emp.payType}</td>
                                            <td style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', textAlign: 'right' }}>
                                                <div style={{ fontWeight: 900, fontSize: '1.125rem', color: 'var(--text-main)' }}>{businessProfile.currencySymbol}{(emp.basePay || 0).toLocaleString()}</div>
                                            </td>
                                            <td style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', textAlign: 'center' }}>
                                                <span style={{ 
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                                                    padding: '4px 10px', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 900, 
                                                    backgroundColor: emp.status === 'ACTIVE' ? 'var(--success-light)' : 'var(--danger-light)', 
                                                    color: emp.status === 'ACTIVE' ? 'var(--success)' : 'var(--danger)',
                                                    textTransform: 'uppercase', letterSpacing: '0.05em'
                                                }}>
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'currentColor' }} />
                                                    {emp.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end' }}>
                                                    {!viewOnly && (
                                                        <>
                                                            <button className="btn btn-secondary" title="Modify Record" style={{ padding: '0.625rem', borderRadius: '12px', minWidth: '40px' }} onClick={() => openEdit(emp)}>
                                                                <Edit3 size={16} strokeWidth={2.5} />
                                                            </button>
                                                            <button className="btn btn-secondary" style={{ padding: '0.625rem 1rem', fontSize: '0.75rem', fontWeight: 800, borderRadius: '12px' }} onClick={() => toggleStatus(emp)}>
                                                                {emp.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'}
                                                            </button>
                                                            {deleteConfirm === emp.id ? (
                                                                <div style={{ display: 'flex', gap: '0.375rem', background: 'var(--danger-light)', padding: '4px', borderRadius: '12px' }}>
                                                                    <button className="btn" style={{ padding: '0.5rem', backgroundColor: 'var(--danger)', color: 'white', borderRadius: '8px' }} onClick={() => handleDelete(emp.id)}>
                                                                        <Check size={16} strokeWidth={3} />
                                                                    </button>
                                                                    <button className="btn" style={{ padding: '0.5rem', borderRadius: '8px' }} onClick={() => setDeleteConfirm(null)}>
                                                                        <X size={16} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button className="btn btn-secondary" title="Purge Data" style={{ padding: '0.625rem', borderRadius: '12px', minWidth: '40px', color: 'var(--danger)' }} onClick={() => setDeleteConfirm(emp.id)}>
                                                                    <Trash2 size={16} strokeWidth={2.5} />
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
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

            {/* PAY HISTORY TAB */}
            {activeTab === 'HISTORY' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {payrollRecords.length === 0 ? (
                        <div className="card" style={{ padding: '6rem 3rem', textAlign: 'center', color: 'var(--text-dim)', borderRadius: '28px', border: '2px dashed var(--border-light)', backgroundColor: 'transparent' }}>
                            <div style={{ fontSize: '3.5rem', marginBottom: '1.5rem', opacity: 0.1 }}>🧾</div>
                            <div style={{ fontWeight: 900, fontSize: '1.5rem', color: 'var(--text-main)', letterSpacing: '-0.025em' }}>Audit Ledger Vacant</div>
                            <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>Execute a pay cycle to generate comprehensive remuneration audit logs.</p>
                            <button className="btn btn-primary" style={{ marginTop: '2rem', padding: '0.875rem 2rem', borderRadius: '18px', fontWeight: 900 }} onClick={openPayRun}>Generate First Ledger Entry</button>
                        </div>
                    ) : (
                        payrollRecords.map(record => (
                            <div key={record.id} className="card animate-scale-up" style={{ padding: 0, overflow: 'hidden', borderRadius: '28px', border: 'none', boxShadow: 'var(--shadow-md)', backgroundColor: 'white' }}>
                                {/* Header row */}
                                <div
                                    onClick={() => setExpandedRecord(expandedRecord === record.id ? null : record.id)}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.75rem 2rem', cursor: 'pointer', transition: 'background 0.2s', backgroundColor: expandedRecord === record.id ? '#fcfdfe' : 'white' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                        <div style={{ width: '56px', height: '56px', borderRadius: '18px', backgroundColor: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}>
                                            <Banknote size={28} strokeWidth={1.5} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 900, fontSize: '1.25rem', color: 'var(--text-main)', letterSpacing: '-0.025em' }}>Payroll Batch — {record.period}</div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-dim)', fontWeight: 600, marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Calendar size={14} /> Authorization Date: {new Date(record.processedAt).toLocaleDateString()} • {record.totalEmployees} Recipient Units
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.75rem', fontWeight: 950, color: 'var(--success)', letterSpacing: '-0.03em' }}>
                                                <span style={{ fontSize: '1rem', marginRight: '0.125rem' }}>{businessProfile.currencySymbol}</span>
                                                {record.totalNet.toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Net Settlement</div>
                                        </div>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }}>
                                            {expandedRecord === record.id ? <ChevronUp size={20} strokeWidth={3} /> : <ChevronDown size={20} strokeWidth={3} />}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded breakdown */}
                                {expandedRecord === record.id && (
                                    <div style={{ borderTop: '1.5px solid var(--border-light)', backgroundColor: '#fafbfd' }}>
                                        {/* Summary grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', padding: '1.5rem 2rem', backgroundColor: 'white', margin: '1rem', borderRadius: '20px', border: '1.5px solid var(--border-light)' }}>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 900, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Gross Base Pay</div>
                                                <div style={{ fontWeight: 900, fontSize: '1.125rem', color: 'var(--text-main)' }}>{businessProfile.currencySymbol}{record.totalBase.toLocaleString()}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 900, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Overtime Aggregate</div>
                                                <div style={{ fontWeight: 900, fontSize: '1.125rem', color: 'var(--warning)' }}>+{businessProfile.currencySymbol}{record.totalOvertime.toLocaleString()}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 900, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Incentive / Bonuses</div>
                                                <div style={{ fontWeight: 900, fontSize: '1.125rem', color: 'var(--success)' }}>+{businessProfile.currencySymbol}{record.totalBonus.toLocaleString()}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 900, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Statutory Deductions</div>
                                                <div style={{ fontWeight: 900, fontSize: '1.125rem', color: 'var(--danger)' }}>-{businessProfile.currencySymbol}{record.totalDeductions.toLocaleString()}</div>
                                            </div>
                                        </div>

                                        {/* Individual items table */}
                                        <div style={{ padding: '0 1rem 1rem' }}>
                                            <div style={{ backgroundColor: 'white', borderRadius: '20px', border: '1.5px solid var(--border-light)', overflow: 'hidden' }}>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                                                    <thead>
                                                        <tr style={{ backgroundColor: '#f8fafc' }}>
                                                            <th style={{ padding: '1rem 1.25rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-light)' }}>Recipient Staff</th>
                                                            <th style={{ padding: '1rem 1.25rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-light)' }}>Unit Dept</th>
                                                            <th style={{ padding: '1rem 1.25rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-light)', textAlign: 'right' }}>Base Component</th>
                                                            <th style={{ padding: '1rem 1.25rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-light)', textAlign: 'right' }}>OT/Bonus</th>
                                                            <th style={{ padding: '1rem 1.25rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-light)', textAlign: 'right' }}>Deductions</th>
                                                            <th style={{ padding: '1rem 1.25rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-light)', textAlign: 'right' }}>Net Remuneration</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {record.items.map(item => (
                                                            <tr key={item.employeeId}>
                                                                <td style={{ padding: '1rem 1.25rem', fontWeight: 800, color: 'var(--text-main)', borderBottom: '1px solid var(--border-light)' }}>{item.employeeName}</td>
                                                                <td style={{ padding: '1rem 1.25rem', color: 'var(--text-dim)', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid var(--border-light)' }}>{item.department}</td>
                                                                <td style={{ padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border-light)' }}>{businessProfile.currencySymbol}{item.basePay.toFixed(2)}</td>
                                                                <td style={{ padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 700, color: 'var(--success)', borderBottom: '1px solid var(--border-light)' }}>
                                                                    {(item.overtime + item.bonus) > 0 ? `+${businessProfile.currencySymbol}${(item.overtime + item.bonus).toFixed(2)}` : '—'}
                                                                </td>
                                                                <td style={{ padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 700, color: 'var(--danger)', borderBottom: '1px solid var(--border-light)' }}>
                                                                    {item.deductions > 0 ? `-${businessProfile.currencySymbol}${item.deductions.toFixed(2)}` : '—'}
                                                                </td>
                                                                <td style={{ padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 900, color: 'var(--text-main)', borderBottom: '1px solid var(--border-light)' }}>{businessProfile.currencySymbol}{item.netPay.toFixed(2)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div style={{ padding: '1.25rem 2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', backgroundColor: '#fcfdfe' }}>
                                            <button className="btn btn-secondary" style={{ padding: '0.75rem 1.25rem', fontSize: '0.85rem', color: 'var(--danger)', fontWeight: 800, borderRadius: '14px' }} onClick={() => deletePayrollRecord(record.id)}>
                                                <Trash2 size={16} strokeWidth={2.5} /> Nullify Audit Entry
                                            </button>
                                            <button className="btn btn-secondary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem', fontWeight: 800, borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => window.print()}>
                                                <Printer size={16} strokeWidth={2.5} /> Generate Physical Report
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ========== PAY RUN MODAL ========== */}
            {showPayRunModal && (
                <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', zIndex: 2000 }}>
                    <div className="card animate-scale-up" style={{ width: '100%', maxWidth: '1200px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: 'none', overflow: 'hidden', background: 'white' }}>
                        <div style={{ padding: '2.5rem', borderBottom: '1.5px solid var(--border-light)', backgroundColor: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.75rem', fontWeight: 950, letterSpacing: '-0.03em', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                                        <Banknote size={32} strokeWidth={2} className="text-primary" />
                                        Initialize Disbursement Cycle
                                    </h2>
                                    <p style={{ color: 'var(--text-dim)', fontWeight: 600, marginTop: '0.5rem', fontSize: '1rem' }}>Authorizing remuneration settlement for {employees.filter(e => e.status === 'ACTIVE').length} active personnel units.</p>
                                </div>
                                <button className="btn btn-secondary" style={{ padding: '0.625rem', borderRadius: '12px' }} onClick={() => setShowPayRunModal(false)}><X size={24} /></button>
                            </div>
                            
                            <div style={{ marginTop: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-dim)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Settlement Period identifier</label>
                                    <input 
                                        type="month" 
                                        className="input-field" 
                                        value={payRunMonth} 
                                        onChange={e => setPayRunMonth(e.target.value)} 
                                        style={{ padding: '1rem 1.5rem', borderRadius: '16px', fontWeight: 700, fontSize: '1.1rem', backgroundColor: '#f8fafc' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ padding: '0.75rem 1.5rem', backgroundColor: 'var(--bg-main)', borderRadius: '16px', border: '1.5px solid var(--border-light)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>Active Payload</div>
                                        <div style={{ fontWeight: 900, fontSize: '1.25rem', color: 'var(--primary)' }}>{employees.filter(e => e.status === 'ACTIVE').length} Units</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2.5rem', backgroundColor: '#fafbfd' }}>
                            <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1.5px solid var(--border-light)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8fafc' }}>
                                        <tr>
                                            <th style={{ padding: '1.25rem 1.5rem', fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1.5px solid var(--border-light)' }}>Staff Member</th>
                                            <th style={{ padding: '1.25rem 1.5rem', fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1.5px solid var(--border-light)', textAlign: 'right' }}>Base Component</th>
                                            <th style={{ padding: '1.25rem 1.5rem', fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1.5px solid var(--border-light)', textAlign: 'right', width: '160px' }}>Overtime Adj.</th>
                                            <th style={{ padding: '1.25rem 1.5rem', fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1.5px solid var(--border-light)', textAlign: 'right', width: '160px' }}>Incentive / Bonus</th>
                                            <th style={{ padding: '1.25rem 1.5rem', fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1.5px solid var(--border-light)', textAlign: 'right', width: '160px' }}>Deductions</th>
                                            <th style={{ padding: '1.25rem 1.5rem', fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1.5px solid var(--border-light)', textAlign: 'right' }}>Net Remittance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payRunItems.map(item => (
                                            <tr key={item.employeeId} style={{ backgroundColor: 'white' }}>
                                                <td style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
                                                    <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{item.employeeName}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>{item.department}</div>
                                                </td>
                                                <td style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', textAlign: 'right', fontWeight: 700 }}>
                                                    {businessProfile.currencySymbol}{item.basePay.toLocaleString()}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)' }}>
                                                    <div style={{ position: 'relative' }}>
                                                        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--warning)', fontSize: '0.9rem' }}>+</span>
                                                        <input 
                                                            type="number" 
                                                            className="input-field" 
                                                            style={{ padding: '0.625rem 1rem 0.625rem 1.75rem', borderRadius: '10px', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', border: '1.5px solid #e2e8f0' }}
                                                            value={item.overtime} 
                                                            onChange={e => updatePayRunItem(item.employeeId, 'overtime', e.target.value)} 
                                                        />
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)' }}>
                                                    <div style={{ position: 'relative' }}>
                                                        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--success)', fontSize: '0.9rem' }}>+</span>
                                                        <input 
                                                            type="number" 
                                                            className="input-field" 
                                                            style={{ padding: '0.625rem 1rem 0.625rem 1.75rem', borderRadius: '10px', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', border: '1.5px solid #e2e8f0' }}
                                                            value={item.bonus} 
                                                            onChange={e => updatePayRunItem(item.employeeId, 'bonus', e.target.value)} 
                                                        />
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)' }}>
                                                    <div style={{ position: 'relative' }}>
                                                        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--danger)', fontSize: '0.9rem' }}>-</span>
                                                        <input 
                                                            type="number" 
                                                            className="input-field" 
                                                            style={{ padding: '0.625rem 1rem 0.625rem 1.75rem', borderRadius: '10px', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', border: '1.5px solid #e2e8f0' }}
                                                            value={item.deductions} 
                                                            onChange={e => updatePayRunItem(item.employeeId, 'deductions', e.target.value)} 
                                                        />
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', textAlign: 'right' }}>
                                                    <div style={{ fontWeight: 950, fontSize: '1.1rem', color: 'var(--success)' }}>
                                                        {businessProfile.currencySymbol}{item.netPay.toLocaleString()}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 10, backgroundColor: '#f1f5f9' }}>
                                        <tr style={{ fontWeight: 900 }}>
                                            <td style={{ padding: '1.25rem 1.5rem' }}>Batch Totals ({payRunItems.length} Units)</td>
                                            <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>{businessProfile.currencySymbol}{payRunItems.reduce((s, i) => s + i.basePay, 0).toLocaleString()}</td>
                                            <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right', color: 'var(--warning)' }}>+{businessProfile.currencySymbol}{payRunItems.reduce((s, i) => s + i.overtime, 0).toLocaleString()}</td>
                                            <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right', color: 'var(--success)' }}>+{businessProfile.currencySymbol}{payRunItems.reduce((s, i) => s + i.bonus, 0).toLocaleString()}</td>
                                            <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right', color: 'var(--danger)' }}>-{businessProfile.currencySymbol}{payRunItems.reduce((s, i) => s + i.deductions, 0).toLocaleString()}</td>
                                            <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right', fontSize: '1.25rem', color: 'var(--primary)' }}>{businessProfile.currencySymbol}{payRunItems.reduce((s, i) => s + i.netPay, 0).toLocaleString()}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        <div style={{ padding: '2rem 2.5rem', backgroundColor: 'white', borderTop: '1.5px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Batch Commitment</div>
                                <div style={{ fontSize: '2.25rem', fontWeight: 950, color: 'var(--success)', letterSpacing: '-0.04em', marginTop: '0.25rem' }}>
                                    <span style={{ fontSize: '1.25rem', marginRight: '0.25rem' }}>{businessProfile.currencySymbol}</span>
                                    {payRunItems.reduce((s, i) => s + i.netPay, 0).toLocaleString()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1.25rem' }}>
                                <button className="btn btn-secondary" style={{ padding: '1rem 2rem', borderRadius: '18px', fontWeight: 700, fontSize: '1rem' }} onClick={() => setShowPayRunModal(false)}>Discard Draft</button>
                                <button className="btn btn-primary" style={{ padding: '1rem 3rem', borderRadius: '18px', fontWeight: 900, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 8px 20px var(--success-glare)' }} onClick={handleProcessPayroll}>
                                    Authorize & Finalize Batch <Check size={20} strokeWidth={3} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Payroll;
