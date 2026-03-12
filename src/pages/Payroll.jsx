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

    return (
        <>
            <div className="page-container animate-fade-in" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 className="page-title">Human Resources</h1>
                        <p style={{ color: 'var(--text-muted)' }}>Payroll management & staff oversight for {businessProfile.name}</p>
                    </div>
                    {!viewOnly && (
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="btn btn-secondary" onClick={openPayRun} disabled={activeEmployeesCount === 0}>
                                <Banknote size={18} /> Initiate Pay Run
                            </button>
                            <button className="btn btn-primary" onClick={openAdd}>
                                <UserPlus size={18} /> Onboard Staff
                            </button>
                        </div>
                    )}
                </div>

                {/* KPI Cards */}
                <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '0' }}>
                    <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--primary)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Total Active Workforce</span>
                            <Users size={16} className="text-primary" />
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>
                            {activeEmployeesCount} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>Employees</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>{employees.length - activeEmployeesCount} currently inactive</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--success)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Monthly Payroll</span>
                            <Banknote size={16} className="text-success" />
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>
                            {businessProfile.currencySymbol}{totalMonthlyPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>Estimated base salary commitment</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--warning)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Last Pay Run</span>
                            <Calendar size={16} className="text-warning" />
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>
                            {lastPayRun ? (
                                <>{businessProfile.currencySymbol}{lastPayRun.totalNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                            ) : 'Pending'}
                        </div>
                        <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                            {lastPayRun ? `Processed on ${new Date(lastPayRun.processedAt).toLocaleDateString()}` : 'No pay runs recorded'}
                        </div>
                    </div>
                </div>

                {/* Department Breakdown */}
                {Object.keys(departmentBreakdown).length > 0 && (
                    <div className="glass-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                            <span>Department Breakdown</span>
                            <Users size={16} className="text-primary" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                            {Object.entries(departmentBreakdown).map(([dept, data]) => (
                                <div key={dept} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{dept}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{data.count} Staff • {businessProfile.currencySymbol}{data.cost.toFixed(2)}/mo</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                    <button
                        onClick={() => setActiveTab('EMPLOYEES')}
                        style={{ padding: '0.75rem 1.5rem', background: 'none', border: 'none', borderBottom: activeTab === 'EMPLOYEES' ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === 'EMPLOYEES' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Workforce Roster
                    </button>
                    <button
                        onClick={() => setActiveTab('HISTORY')}
                        style={{ padding: '0.75rem 1.5rem', background: 'none', border: 'none', borderBottom: activeTab === 'HISTORY' ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === 'HISTORY' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Pay History
                    </button>
                </div>

                {/* EMPLOYEES TAB */}
                {activeTab === 'EMPLOYEES' && (
                    <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', minWidth: '900px' }}>
                                <thead>
                                    <tr>
                                        <th>Employee</th>
                                        <th>Department</th>
                                        <th>Pay Cycle</th>
                                        <th style={{ textAlign: 'right' }}>Base Pay</th>
                                        <th style={{ textAlign: 'center' }}>Status</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.length === 0 ? (
                                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                            No employees yet. Add one to get started.
                                        </td></tr>
                                    ) : (
                                        employees.map(emp => (
                                            <tr key={emp.id} style={{ opacity: emp.status === 'ACTIVE' ? 1 : 0.6 }}>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{emp.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{emp.position || 'No title'} • {emp.email || emp.phone || 'No contact'}</div>
                                                </td>
                                                <td>
                                                    <span className="badge badge-blue">{emp.department}</span>
                                                </td>
                                                <td style={{ color: 'var(--text-muted)' }}>{emp.payType}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{businessProfile.currencySymbol}{(emp.basePay || 0).toLocaleString()}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span className={`badge ${emp.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>{emp.status}</span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                        {!viewOnly && (
                                                            <>
                                                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => openEdit(emp)}>
                                                                    <Edit3 size={14} /> Edit
                                                                </button>
                                                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => toggleStatus(emp)}>
                                                                    {emp.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'}
                                                                </button>
                                                                {deleteConfirm === emp.id ? (
                                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                                        <button className="btn btn-danger" style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDelete(emp.id)}>
                                                                            <Check size={14} />
                                                                        </button>
                                                                        <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setDeleteConfirm(null)}>
                                                                            <X size={14} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', color: 'var(--danger)' }} onClick={() => setDeleteConfirm(emp.id)}>
                                                                        <Trash2 size={14} />
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
                            <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <h3>No Pay History</h3>
                                <p>Run your first payroll to see records here.</p>
                                <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={openPayRun}>Start First Pay Run</button>
                            </div>
                        ) : (
                            payrollRecords.map(record => (
                                <div key={record.id} className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                                    <div
                                        onClick={() => setExpandedRecord(expandedRecord === record.id ? null : record.id)}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem', cursor: 'pointer', transition: 'background 0.2s' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <Banknote size={20} className="text-success" />
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>Payroll — {record.period}</div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Calendar size={14} /> Authorization Date: {new Date(record.processedAt).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div>
                                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)' }}>
                                                    {businessProfile.currencySymbol}{record.totalNet.toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Net</div>
                                            </div>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }}>
                                                {expandedRecord === record.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                            </div>
                                        </div>
                                    </div>
                                    {expandedRecord === record.id && (
                                        <div style={{ borderTop: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', padding: '1.5rem 2rem' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Gross Base</div>
                                                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{businessProfile.currencySymbol}{record.totalBase.toLocaleString()}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Overtime</div>
                                                    <div style={{ fontWeight: 700, color: 'var(--warning)' }}>+{businessProfile.currencySymbol}{record.totalOvertime.toLocaleString()}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Bonuses</div>
                                                    <div style={{ fontWeight: 700, color: 'var(--success)' }}>+{businessProfile.currencySymbol}{record.totalBonus.toLocaleString()}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Deductions</div>
                                                    <div style={{ fontWeight: 700, color: 'var(--danger)' }}>-{businessProfile.currencySymbol}{record.totalDeductions.toLocaleString()}</div>
                                                </div>
                                            </div>
                                            <div style={{ padding: '0 2rem 1.5rem' }}>
                                                <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                                                    <thead>
                                                        <tr>
                                                            <th>Employee</th>
                                                            <th style={{ textAlign: 'right' }}>Net Pay</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {record.items.map(item => (
                                                            <tr key={item.employeeId}>
                                                                <td>{item.employeeName}</td>
                                                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{businessProfile.currencySymbol}{item.netPay.toLocaleString()}</td>
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

            {/* MODALS */}
            {showForm && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(12px)' }}>
                    <div className="glass-panel animate-scale-up" style={{ padding: '2.5rem', width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '24px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                    {editingEmployee ? 'Update Staff Member' : 'Add New Employee'}
                                </h3>
                                <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>Fill in the details below.</p>
                            </div>
                            <button className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '12px', minWidth: '40px' }} onClick={() => setShowForm(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Full Name *</label>
                                <input required type="text" className="input-field" value={empForm.name} onChange={e => setEmpForm({ ...empForm, name: e.target.value })} placeholder="e.g. Alexander Hamilton" />
                            </div>
                            <div style={{ gridColumn: 'span 1' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Email</label>
                                <input type="email" className="input-field" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} placeholder="staff@business.com" />
                            </div>
                            <div style={{ gridColumn: 'span 1' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Phone</label>
                                <input type="text" className="input-field" value={empForm.phone} onChange={e => setEmpForm({ ...empForm, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Department</label>
                                <select className="input-field" value={empForm.department} onChange={e => setEmpForm({ ...empForm, department: e.target.value })}>
                                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Position</label>
                                <input type="text" className="input-field" value={empForm.position} onChange={e => setEmpForm({ ...empForm, position: e.target.value })} placeholder="e.g. Senior Coordinator" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Pay Cycle</label>
                                <select className="input-field" value={empForm.payType} onChange={e => setEmpForm({ ...empForm, payType: e.target.value })}>
                                    {PAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Base Pay ({businessProfile.currencySymbol})</label>
                                <input required type="number" step="0.01" min="0" className="input-field" value={empForm.basePay} onChange={e => setEmpForm({ ...empForm, basePay: e.target.value })} placeholder="0.00" />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Bank Account</label>
                                <input type="text" className="input-field" value={empForm.bankAccount} onChange={e => setEmpForm({ ...empForm, bankAccount: e.target.value })} placeholder="Routing / Account" />
                            </div>
                            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                    <Save size={16} /> {editingEmployee ? 'Update Employee' : 'Add Employee'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showPayRunModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(12px)' }}>
                    <div className="glass-panel animate-scale-up" style={{ width: '100%', maxWidth: '1100px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', background: '#ffffff', borderRadius: '24px', position: 'relative' }}>
                        <div style={{ padding: '2rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <Banknote size={24} className="text-primary" />
                                        Pay Run
                                    </h2>
                                    <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>Processing payroll for {activeEmployeesCount} active employees.</p>
                                </div>
                                <button className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '12px', minWidth: '40px' }} onClick={() => setShowPayRunModal(false)}><X size={20} /></button>
                            </div>
                            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Period</label>
                                    <input type="month" className="input-field" value={payRunMonth} onChange={e => setPayRunMonth(e.target.value)} />
                                </div>
                                <div style={{ padding: '0.75rem 1rem', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Workforce</div>
                                    <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{activeEmployeesCount} Active</div>
                                </div>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>
                            <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                    <tr>
                                        <th>Employee</th>
                                        <th style={{ textAlign: 'right' }}>Base Pay</th>
                                        <th style={{ textAlign: 'right', width: '140px' }}>Overtime</th>
                                        <th style={{ textAlign: 'right', width: '140px' }}>Bonus</th>
                                        <th style={{ textAlign: 'right', width: '140px' }}>Deductions</th>
                                        <th style={{ textAlign: 'right' }}>Net Pay</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payRunItems.map(item => (
                                        <tr key={item.employeeId}>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{item.employeeName}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.department}</div>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>{businessProfile.currencySymbol}{item.basePay.toLocaleString()}</td>
                                            <td style={{ padding: '0.5rem' }}><input type="number" className="input-field" style={{ textAlign: 'right' }} value={item.overtime} onChange={e => updatePayRunItem(item.employeeId, 'overtime', e.target.value)} /></td>
                                            <td style={{ padding: '0.5rem' }}><input type="number" className="input-field" style={{ textAlign: 'right' }} value={item.bonus} onChange={e => updatePayRunItem(item.employeeId, 'bonus', e.target.value)} /></td>
                                            <td style={{ padding: '0.5rem' }}><input type="number" className="input-field" style={{ textAlign: 'right' }} value={item.deductions} onChange={e => updatePayRunItem(item.employeeId, 'deductions', e.target.value)} /></td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{businessProfile.currencySymbol}{item.netPay.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Grand Total</div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)' }}>{businessProfile.currencySymbol}{payRunItems.reduce((s, i) => s + i.netPay, 0).toLocaleString()}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button className="btn btn-secondary" onClick={() => setShowPayRunModal(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleProcessPayroll}>Confirm & Process <Check size={16} /></button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Payroll;
