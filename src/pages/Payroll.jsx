import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { DollarSign, Trash2, X, Check, CreditCard, UserPlus, Lock, Receipt } from 'lucide-react';

// Sub-components
import PayrollHeader from '../components/payroll/PayrollHeader';
import EmployeeTable from '../components/payroll/EmployeeTable';
import PayHistory from '../components/payroll/PayHistory';
import MechanicTracker from '../components/payroll/MechanicTracker';

const PAY_TYPES = ['MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY'];
const DEPARTMENTS = ['Operations', 'Sales', 'Warehouse', 'Delivery', 'Management', 'Admin'];

const Payroll = () => {
    const {
        employees, addEmployee, updateEmployee, deleteEmployee,
        payrollRecords, processPayroll, deletePayrollRecord,
        mechanicPayments, addMechanicPayment, updateMechanicPayment,
        businessProfile, isViewOnly, hasPermission, hasRole,
        resetEmployeesDailyData
    } = useAppContext();

    const [activeTab, setActiveTab] = useState('EMPLOYEES');
    const [showForm, setShowForm] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [showPayRunModal, setShowPayRunModal] = useState(false);
    const [payRunMonth, setPayRunMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [payRunItems, setPayRunItems] = useState([]);
    
    const [empForm, setEmpForm] = useState({
        name: '', email: '', phone: '', department: DEPARTMENTS[0],
        position: '', payType: 'MONTHLY', basePay: '', bankAccount: '', notes: '',
        dailyRate: 500, daysWorked: 0
    });
    
    // Modals state
    const [showSalaryModal, setShowSalaryModal] = useState(false);
    const [salaryPayment, setSalaryPayment] = useState({ empId: null, amount: '', date: new Date().toISOString().split('T')[0], notes: '' });

    const [showMechanicModal, setShowMechanicModal] = useState(false);
    const [mechForm, setMechForm] = useState({ name: '', work_description: '', total_due: '', work_date: new Date().toISOString().split('T')[0] });
    
    const [showMechPaymentModal, setShowMechPaymentModal] = useState(false);
    const [mechPayment, setMechPayment] = useState({ id: null, amount: '', date: new Date().toISOString().split('T')[0] });

    const viewOnly = isViewOnly();

    // ===== EMPLOYEE CRUD =====
    const openAdd = () => {
        setEditingEmployee(null);
        setEmpForm({ name: '', email: '', phone: '', department: DEPARTMENTS[0], position: '', payType: 'MONTHLY', basePay: '', bankAccount: '', notes: '', dailyRate: 500, daysWorked: 0 });
        setShowForm(true);
    };

    const openEdit = (emp) => {
        setEditingEmployee(emp);
        setEmpForm({
            name: emp.name, email: emp.email || '', phone: emp.phone || '',
            department: emp.department || DEPARTMENTS[0], position: emp.position || '',
            payType: emp.payType || 'MONTHLY', basePay: emp.basePay || '',
            bankAccount: emp.bankAccount || '', notes: emp.notes || '',
            dailyRate: emp.dailyRate || 500, daysWorked: emp.daysWorked || 0
        });
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSaving) return;
        const dailyRate = parseFloat(empForm.dailyRate) || 0;
        const daysWorked = parseFloat(empForm.daysWorked) || 0;
        const basePay = (dailyRate > 0 && daysWorked > 0) ? (dailyRate * daysWorked) : (parseFloat(empForm.basePay) || 0);

        const data = { 
            ...empForm, 
            basePay,
            dailyRate,
            daysWorked
        };
        setIsSaving(true);
        try {
            let success;
            if (editingEmployee) {
                await updateEmployee({ ...editingEmployee, ...data });
                success = true;
            } else {
                success = await addEmployee(data);
            }
            if (success !== false) {
                setShowForm(false);
                setEditingEmployee(null);
            }
        } catch(err) {
            console.error('Employee form error:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (empId) => {
        deleteEmployee(empId);
        setDeleteConfirm(null);
    };

    const toggleStatus = (emp) => {
        updateEmployee({ ...emp, status: emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
    };

    const handleMonthlyReset = async () => {
        if (!hasRole('OWNER')) return;
        if (confirm("Reset ALL active personnel days worked to zero for the new month?")) {
            await resetEmployeesDailyData();
        }
    };

    const handleMarkSalaryPaid = (e) => {
        e.preventDefault();
        const emp = employees.find(e => e.id === salaryPayment.empId);
        if (emp) {
            updateEmployee({
                ...emp,
                amountPaid: (emp.amountPaid || 0) + parseFloat(salaryPayment.amount)
            });
            setShowSalaryModal(false);
        }
    };

    const handleAddMechanic = (e) => {
        e.preventDefault();
        addMechanicPayment({
            name: mechForm.name,
            work_description: mechForm.work_description,
            total_due: parseFloat(mechForm.total_due) || 0,
            amount_paid: 0,
            work_date: mechForm.work_date
        });
        setShowMechanicModal(false);
    };

    const handleMechPayment = (e) => {
        e.preventDefault();
        const mech = mechanicPayments.find(m => m.id === mechPayment.id);
        if (mech) {
            updateMechanicPayment({
                ...mech,
                amount_paid: (mech.amount_paid || 0) + parseFloat(mechPayment.amount)
            });
            setShowMechPaymentModal(false);
        }
    };

    // ===== PAYROLL RUN LOGIC =====
    const openPayRun = () => {
        const activeEmployees = employees.filter(e => e.status === 'ACTIVE');
        const items = activeEmployees.map(emp => ({
            employeeId: emp.id,
            employeeName: emp.name,
            department: emp.department,
            payType: emp.payType,
            basePay: emp.basePay || 0,
            hoursWorked: 160,
            overtime: 0,
            bonus: 0,
            deductions: 0,
            netPay: emp.basePay || 0
        }));
        setPayRunItems(items);
        setShowPayRunModal(true);
    };

    const updatePayRunItem = (empId, field, value) => {
        const numVal = parseFloat(value) || 0;
        const newItems = payRunItems.map(item => {
            if (item.employeeId === empId) {
                const updated = { ...item, [field]: numVal };
                // Recalculate net
                let net = updated.basePay;
                if (updated.payType === 'HOURLY') {
                    // Simple hourly: assume basePay is hourly rate
                    const regularHours = Math.min(updated.hoursWorked, 160);
                    const otHours = Math.max(0, updated.hoursWorked - 160);
                    net = (regularHours * updated.basePay) + (otHours * updated.basePay * 1.5);
                    updated.overtime = Math.round(otHours * updated.basePay * 1.5);
                } else {
                    net = updated.basePay + updated.overtime + updated.bonus - updated.deductions;
                }
                return { ...updated, netPay: Math.round(net) };
            }
            return item;
        });
        setPayRunItems(newItems);
    };

    const handleProcessPayroll = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const totalBase = payRunItems.reduce((sum, i) => sum + i.basePay, 0);
            const totalNet = payRunItems.reduce((sum, i) => sum + i.netPay, 0);
            const totalOvertime = payRunItems.reduce((sum, i) => sum + (i.payType === 'HOURLY' ? i.overtime : i.overtime), 0);
            const totalBonus = payRunItems.reduce((sum, i) => sum + i.bonus, 0);
            const totalDeductions = payRunItems.reduce((sum, i) => sum + i.deductions, 0);

            const record = {
                period: payRunMonth,
                items: payRunItems,
                totalBase,
                totalNet,
                totalOvertime,
                totalBonus,
                totalDeductions,
                processedAt: new Date().toISOString()
            };

            const success = await processPayroll(record);
            if (success) {
                setShowPayRunModal(false);
            }
        } catch(err) {
            console.error('Payroll process error:', err);
        } finally {
            setIsSaving(false);
        }
    };

    // ===== METRICS =====
    const activeEmployeesCount = useMemo(() => employees.filter(e => e.status === 'ACTIVE').length, [employees]);
    const totalMonthlyPayroll = useMemo(() => employees.filter(e => e.status === 'ACTIVE').reduce((sum, emp) => sum + (emp.basePay || 0), 0), [employees]);
    const lastPayRun = useMemo(() => payrollRecords.length > 0 ? payrollRecords[0] : null, [payrollRecords]);

    React.useEffect(() => {
        if (showForm || showPayRunModal || showSalaryModal || showMechanicModal || showMechPaymentModal || deleteConfirm) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [showForm, showPayRunModal, showSalaryModal, showMechanicModal, showMechPaymentModal, deleteConfirm]);

    return (
        <>
            <div className="animate-fade-in flex flex-col gap-4 pb-12">
                <PayrollHeader 
                    activeEmployeesCount={activeEmployeesCount}
                    totalMonthlyPayroll={totalMonthlyPayroll}
                    lastPayRun={lastPayRun}
                    currencySymbol={businessProfile.currencySymbol}
                    viewOnly={viewOnly}
                    hasRole={hasRole}
                    handleMonthlyReset={handleMonthlyReset}
                    openPayRun={openPayRun}
                    openAdd={openAdd}
                />

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
                        <button
                            onClick={() => setActiveTab('MECHANICS')}
                            className={`px-10 py-4 rounded-pill text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'MECHANICS' ? 'bg-ink-primary text-surface shadow-premium' : 'text-ink-secondary hover:text-ink-primary'}`}
                        >
                            Mechanic Tracker
                        </button>
                    </div>

                    {activeTab === 'EMPLOYEES' && (
                        <EmployeeTable 
                            employees={employees}
                            updateEmployee={updateEmployee}
                            openEdit={openEdit}
                            setDeleteConfirm={setDeleteConfirm}
                            setSalaryPayment={setSalaryPayment}
                            setShowSalaryModal={setShowSalaryModal}
                            currencySymbol={businessProfile.currencySymbol}
                            viewOnly={viewOnly}
                            departments={DEPARTMENTS}
                        />
                    )}

                    {activeTab === 'HISTORY' && (
                        <PayHistory 
                            payrollRecords={payrollRecords}
                            currencySymbol={businessProfile.currencySymbol}
                            openPayRun={openPayRun}
                            deletePayrollRecord={deletePayrollRecord}
                        />
                    )}

                    {activeTab === 'MECHANICS' && (
                        <MechanicTracker 
                            mechanicPayments={mechanicPayments}
                            currencySymbol={businessProfile.currencySymbol}
                            viewOnly={viewOnly}
                            setMechForm={setMechForm}
                            setShowMechanicModal={setShowMechanicModal}
                            setMechPayment={setMechPayment}
                            setShowMechPaymentModal={setShowMechPaymentModal}
                        />
                    )}
                </div>
            </div>

            {/* Add Mechanic Form */}
            {showMechanicModal && (
                <div className="modal-overlay z-50">
                    <div className="glass-modal !max-w-[400px]">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-xl font-black text-ink-primary uppercase tracking-tighter">Add Mechanic</h2>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-70">Record new repair/service</p>
                            </div>
                            <button onClick={() => setShowMechanicModal(false)} className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 text-ink-primary">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleAddMechanic} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-60 block mb-1">Mechanic Name</label>
                                <input type="text" required className="w-full bg-canvas px-4 py-3 rounded-xl border border-black/10 text-sm font-black text-ink-primary outline-none uppercase" value={mechForm.name} onChange={e => setMechForm({...mechForm, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-60 block mb-1">Work Description</label>
                                <input type="text" required className="w-full bg-canvas px-4 py-3 rounded-xl border border-black/10 text-sm font-black text-ink-primary outline-none" value={mechForm.work_description} onChange={e => setMechForm({...mechForm, work_description: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-60 block mb-1">Total Due</label>
                                <div className="flex items-center gap-2 bg-canvas px-4 py-3 rounded-xl border border-black/10">
                                    <span className="text-sm font-black text-ink-secondary">{businessProfile.currencySymbol}</span>
                                    <input type="number" step="0.01" required className="w-full bg-transparent border-none text-base font-black text-ink-primary outline-none" value={mechForm.total_due} onChange={e => setMechForm({...mechForm, total_due: e.target.value})} />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-60 block mb-1">Work Date</label>
                                <input type="date" required className="w-full bg-canvas px-4 py-3 rounded-xl border border-black/10 text-sm font-black text-ink-primary outline-none" value={mechForm.work_date} onChange={e => setMechForm({...mechForm, work_date: e.target.value})} />
                            </div>
                            <button type="submit" className="w-full btn-signature py-4 rounded-xl mt-4 text-xs font-black">
                                ADD MECHANIC RECORD
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Mechanic Record Payment Modal */}
            {showMechPaymentModal && (
                <div className="modal-overlay z-50">
                    <div className="glass-modal !max-w-[400px]">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-xl font-black text-ink-primary uppercase tracking-tighter">Record Payment</h2>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-70">Mechanic Payment</p>
                            </div>
                            <button onClick={() => setShowMechPaymentModal(false)} className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 text-ink-primary">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleMechPayment} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 block mb-2">Amount Paying</label>
                                <div className="flex items-center gap-2 bg-canvas px-4 py-3 rounded-xl border border-black/10">
                                    <span className="text-sm font-black text-ink-secondary">{businessProfile.currencySymbol}</span>
                                    <input type="number" step="0.01" required className="w-full bg-transparent border-none text-base font-black text-ink-primary outline-none" value={mechPayment.amount} onChange={e => setMechPayment({...mechPayment, amount: e.target.value})} />
                                </div>
                            </div>
                            <button type="submit" className="w-full btn-signature py-4 rounded-xl mt-4 text-xs font-black">
                                RECORD COMPLETED
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Mark Salary Paid Modal */}
            {showSalaryModal && (
                <div className="modal-overlay z-50">
                    <div className="glass-modal !max-w-[400px]">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-xl font-black text-ink-primary uppercase tracking-tighter">Record Payment</h2>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-70">Pay Employee Salary</p>
                            </div>
                            <button onClick={() => setShowSalaryModal(false)} className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 text-ink-primary transition-all">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleMarkSalaryPaid} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 block mb-2">Amount Paying</label>
                                <div className="flex items-center gap-2 bg-canvas px-4 py-3 rounded-xl border border-black/10">
                                    <span className="text-sm font-black text-ink-secondary">{businessProfile.currencySymbol}</span>
                                    <input type="number" step="0.01" required className="w-full bg-transparent border-none text-base font-black text-ink-primary outline-none" value={salaryPayment.amount} onChange={e => setSalaryPayment({...salaryPayment, amount: e.target.value})} />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 block mb-2">Payment Date</label>
                                <input type="date" required className="w-full bg-canvas px-4 py-3 rounded-xl border border-black/10 text-sm font-black text-ink-primary outline-none" value={salaryPayment.date} onChange={e => setSalaryPayment({...salaryPayment, date: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 block mb-2">Notes (Optional)</label>
                                <input type="text" className="w-full bg-canvas px-4 py-3 rounded-xl border border-black/10 text-sm font-black text-ink-primary outline-none" value={salaryPayment.notes} onChange={e => setSalaryPayment({...salaryPayment, notes: e.target.value})} />
                            </div>
                            <button type="submit" className="w-full btn-signature py-4 rounded-xl mt-4 text-xs font-black">
                                RECORD SALARY PAYMENT
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Payout Form Modal */}
            {showForm && (
                <div className="modal-overlay">
                    <div className="glass-modal">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h1 className="text-2xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-1">DISBURSEMENT.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-70">INSTITUTIONAL PAYROLL SETTLEMENT</p>
                            </div>
                            <button 
                                onClick={() => setShowForm(false)}
                                className="w-8 h-8 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-60 mb-1">Full Legal Name</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-lg text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        placeholder="PERSONNEL NAME..."
                                        value={empForm.name} 
                                        onChange={e => setEmpForm({ ...empForm, name: e.target.value })} 
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-60 mb-1">Department</label>
                                    <select 
                                        className="w-full bg-canvas border-none rounded-2xl p-3.5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase appearance-none cursor-pointer" 
                                        value={empForm.department} 
                                        onChange={e => setEmpForm({ ...empForm, department: e.target.value })}
                                    >
                                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-60 mb-1">Position</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="w-full bg-canvas border-none rounded-2xl p-3.5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        placeholder="e.g. ARCHITECT"
                                        value={empForm.position} 
                                        onChange={e => setEmpForm({ ...empForm, position: e.target.value })} 
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-60 mb-1">Pay Frequency</label>
                                    <select 
                                        className="w-full bg-canvas border-none rounded-2xl p-3.5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase appearance-none cursor-pointer" 
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
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-3">Daily Wage Counter (Optional)</label>
                                    <div className="grid grid-cols-2 gap-2 bg-canvas p-3 rounded-2xl border border-black/5">
                                        <div>
                                            <label className="text-[8px] font-black opacity-50 uppercase mb-1 block">Daily Rate</label>
                                            <input 
                                                type="number" 
                                                className="w-full bg-surface border-none rounded-xl p-3 font-black text-sm text-ink-primary outline-none" 
                                                placeholder="0.00"
                                                value={empForm.dailyRate} 
                                                onChange={e => setEmpForm({ ...empForm, dailyRate: e.target.value })} 
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-black opacity-50 uppercase mb-1 block">Days Worked</label>
                                            <input 
                                                type="number" 
                                                className="w-full bg-surface border-none rounded-xl p-3 font-black text-sm text-ink-primary outline-none" 
                                                placeholder="0"
                                                value={empForm.daysWorked} 
                                                onChange={e => setEmpForm({ ...empForm, daysWorked: e.target.value })} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-3">Payment Identification</label>
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
                    <div className="glass-modal !max-w-[1100px] !p-0 !overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-black/5 flex justify-between items-start bg-canvas/30">
                            <div>
                                <h1 className="text-4xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-1.5">PROCESS PAYROLL.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.4em] opacity-70">Period: {new Date(payRunMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
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

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-surface/50">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10 bg-surface/50 backdrop-blur-xl">
                                    <tr className="border-b-2 border-ink-primary">
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70">Personnel Node</th>
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70 text-right">Hours/Period</th>
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70 text-right">Base Units</th>
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70 text-right">Overtime (1.5x)</th>
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70 text-right">Bonus</th>
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70 text-right">Deductions</th>
                                        <th className="pb-6 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70 text-right">Net Pay</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5">
                                    {payRunItems.map(item => (
                                        <tr key={item.employeeId} className="hover:bg-canvas transition-all duration-300">
                                            <td className="py-6">
                                                <div className="text-base font-black text-ink-primary uppercase tracking-tight leading-none mb-1">{item.employeeName}</div>
                                                <div className="text-[9px] font-black text-ink-secondary uppercase tracking-[0.2em] opacity-30">{item.department} | {item.payType}</div>
                                            </td>
                                            <td className="py-6 text-right">
                                                {item.payType === 'HOURLY' ? (
                                                    <input type="number" className="w-20 bg-canvas border-none rounded-xl p-3 text-right font-black text-sm text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 shadow-sm" value={item.hoursWorked} onChange={e => updatePayRunItem(item.employeeId, 'hoursWorked', e.target.value)} />
                                                ) : (
                                                    <span className="text-xs font-black opacity-30 italic">N/A</span>
                                                )}
                                            </td>
                                            <td className="py-6 text-right font-black text-xs text-ink-secondary opacity-60 tabular-nums">
                                                {businessProfile.currencySymbol}{Math.round(item.basePay).toLocaleString()}
                                            </td>
                                            <td className="py-6 text-right">
                                                {item.payType === 'HOURLY' ? (
                                                    <div className="text-sm font-black text-accent-signature-hover tabular-nums">
                                                        {businessProfile.currencySymbol}{Math.round(item.overtime).toLocaleString()}
                                                    </div>
                                                ) : (
                                                    <input type="number" className="w-28 bg-canvas border-none rounded-xl p-3 text-right font-black text-sm text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 shadow-sm" value={item.overtime} onChange={e => updatePayRunItem(item.employeeId, 'overtime', e.target.value)} />
                                                )}
                                            </td>
                                            <td className="py-6 text-right">
                                                <input type="number" className="w-24 bg-canvas border-none rounded-xl p-3 text-right font-black text-sm text-accent-signature-hover outline-none focus:ring-4 focus:ring-accent-signature/20 shadow-sm" value={item.bonus} onChange={e => updatePayRunItem(item.employeeId, 'bonus', e.target.value)} />
                                            </td>
                                            <td className="py-6 text-right">
                                                <input type="number" className="w-24 bg-canvas border-none rounded-xl p-3 text-right font-black text-sm text-red-500 outline-none focus:ring-4 focus:ring-red-500/10 shadow-sm" value={item.deductions} onChange={e => updatePayRunItem(item.employeeId, 'deductions', e.target.value)} />
                                            </td>
                                            <td className="py-6 text-right font-black text-2xl text-ink-primary tracking-tighter tabular-nums">
                                                {businessProfile.currencySymbol}{Math.round(item.netPay).toLocaleString()}
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

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-[400px] text-center">
                        <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto mb-6">
                            <Trash2 size={40} />
                        </div>
                        <h2 className="text-3xl font-black text-ink-primary tracking-tighter uppercase mb-2">CONFIRM DELETE.</h2>
                        <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-70 mb-8">
                            This action cannot be undone. All staff records will be purged.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => setDeleteConfirm(null)}
                                className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-widest hover:bg-black/5 transition-all"
                            >
                                CANCEL
                            </button>
                            <button 
                                onClick={() => handleDelete(deleteConfirm)}
                                className="px-8 py-4 rounded-pill bg-red-500 text-white font-black text-xs uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                            >
                                DELETE
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Payroll;
