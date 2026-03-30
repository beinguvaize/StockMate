import React, { useState, useMemo } from 'react';
import { Search, Filter, Edit3, Trash2, UserPlus, UserMinus, DollarSign, Calendar } from 'lucide-react';

const EmployeeTable = ({ 
    employees, 
    updateEmployee, 
    openEdit, 
    setDeleteConfirm, 
    setSalaryPayment, 
    setShowSalaryModal, 
    currencySymbol, 
    viewOnly,
    departments
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [deptFilter, setDeptFilter] = useState('ALL');

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const matchesSearch = emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                 emp.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                 emp.position?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesDept = deptFilter === 'ALL' || emp.department === deptFilter;
            return matchesSearch && matchesDept;
        });
    }, [employees, searchTerm, deptFilter]);

    const activeCount = filteredEmployees.filter(e => e.status === 'ACTIVE').length;

    return (
        <div className="flex flex-col gap-6">
            {/* Table Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-canvas/30 p-4 rounded-2xl border border-black/5">
                <div className="relative flex-1 w-full">
                    <input 
                        type="text" 
                        placeholder="Search employees by name, role, dept..." 
                        className="w-full bg-white border border-black/5 rounded-pill pl-12 pr-4 py-3 text-xs font-black text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all placeholder:opacity-50"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-ink-primary opacity-30" />
                </div>
                
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-white border border-black/5 rounded-pill px-4 h-11">
                        <Filter size={14} className="text-ink-primary opacity-30" />
                        <select 
                            className="bg-transparent border-none text-[10px] font-black text-ink-primary outline-none uppercase cursor-pointer"
                            value={deptFilter}
                            onChange={(e) => setDeptFilter(e.target.value)}
                        >
                            <option value="ALL">All Departments</option>
                            {departments.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="glass-panel !p-0 overflow-hidden border border-black/5 bg-surface shadow-premium !rounded-bento">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead>
                            <tr className="bg-canvas border-b border-black/5">
                                <th className="p-4 pl-8 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-70">Employee</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-70">Daily Rate</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-70 text-center">Days Worked</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-70 text-right">Total Salary</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-70 text-right">Paid</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-70 text-right">Pending</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-70 text-center uppercase tracking-widest">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 bg-surface">
                            {filteredEmployees.length === 0 ? (
                                    <tr><td colSpan="7" className="p-16 text-center text-ink-secondary uppercase font-black text-[10px] tracking-[0.5em] opacity-30 italic">No matching personnel found</td></tr>
                                ) : (
                                    filteredEmployees.map(emp => {
                                        const dailyRate = emp.dailyRate || emp.daily_rate || 0;
                                        const daysWorked = emp.days_worked !== undefined ? emp.days_worked : (emp.daysWorked || 0);
                                        const amountPaid = emp.amount_paid !== undefined ? emp.amount_paid : (emp.amountPaid || 0);
                                        const totalSalary = dailyRate * daysWorked;
                                        const pending = totalSalary - amountPaid;
                                        
                                        return (
                                            <tr key={emp.id} className={`group hover:bg-canvas transition-all duration-300 ${emp.status !== 'ACTIVE' ? 'opacity-60 grayscale' : ''}`}>
                                                <td className="p-2 pl-8">
                                                    <div className="text-sm font-black text-ink-primary uppercase tracking-tight leading-none mb-1">{emp.name}</div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-2 py-0.5 rounded bg-black/5 text-[9px] font-black text-ink-secondary uppercase tracking-[0.2em]">{emp.department || emp.role}</span>
                                                        {emp.status !== 'ACTIVE' && <span className="text-[8px] font-black text-red-500 uppercase">Inactive</span>}
                                                    </div>
                                                </td>
                                                <td className="p-2">
                                                    <div className="flex items-center gap-1 w-24 border border-black/10 rounded-lg overflow-hidden bg-white group-hover:border-accent-signature/30 transition-all shadow-sm">
                                                        <span className="pl-2 text-xs font-black text-ink-secondary opacity-40">{currencySymbol}</span>
                                                        <input 
                                                            type="number" 
                                                            className="w-full bg-transparent border-none p-1.5 text-xs font-black text-ink-primary outline-none tabular-nums" 
                                                            defaultValue={dailyRate}
                                                            onBlur={(e) => updateEmployee({...emp, dailyRate: parseFloat(e.target.value)||0})}
                                                            disabled={viewOnly}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-2 align-middle">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button 
                                                            disabled={viewOnly} 
                                                            onClick={() => updateEmployee({...emp, daysWorked: Math.max(0, daysWorked - 1)})} 
                                                            className="w-7 h-7 rounded-lg border border-black/10 flex items-center justify-center hover:bg-black/5 text-ink-secondary font-black cursor-pointer transition-colors"
                                                        >-</button>
                                                        <span className="w-8 text-center text-sm font-black text-ink-primary tabular-nums">{daysWorked}</span>
                                                        <button 
                                                            disabled={viewOnly} 
                                                            onClick={() => updateEmployee({...emp, daysWorked: daysWorked + 1})} 
                                                            className="w-7 h-7 rounded-lg border border-black/10 flex items-center justify-center hover:bg-black/5 text-ink-secondary font-black cursor-pointer transition-colors"
                                                        >+</button>
                                                    </div>
                                                </td>
                                                <td className="p-2 text-right">
                                                    <div className="text-sm font-black text-ink-primary font-mono tabular-nums bg-canvas px-3 py-1.5 rounded-lg inline-block border border-black/5">
                                                        {currencySymbol}{totalSalary.toLocaleString()}
                                                    </div>
                                                </td>
                                                <td className="p-2">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <div className="flex items-center gap-1 w-24 border border-black/10 rounded-lg overflow-hidden bg-white group-hover:border-accent-signature/30 transition-all shadow-sm">
                                                            <span className="pl-2 text-xs font-black text-ink-secondary opacity-40">{currencySymbol}</span>
                                                            <input 
                                                                type="number" 
                                                                className="w-full bg-transparent border-none p-1.5 text-xs font-black text-ink-primary outline-none tabular-nums text-right pr-2" 
                                                                defaultValue={amountPaid}
                                                                onBlur={(e) => updateEmployee({...emp, amountPaid: parseFloat(e.target.value)||0})}
                                                                disabled={viewOnly}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-2 text-right">
                                                    <div className="flex items-center justify-end gap-2 pr-2">
                                                        <div className={`text-sm font-black font-mono tabular-nums ${pending > 0 ? 'text-red-500' : pending < 0 ? 'text-amber-500' : 'text-green-500'}`}>
                                                            {currencySymbol}{pending.toLocaleString()}
                                                        </div>
                                                        <div className={`w-1.5 h-1.5 rounded-full ${pending > 0 ? 'bg-red-500 animate-pulse' : pending < 0 ? 'bg-amber-500' : 'bg-green-500 shadow-lg shadow-green-500/50'}`}></div>
                                                    </div>
                                                </td>
                                                <td className="p-2 text-center">
                                                    <div className="flex justify-center gap-1">
                                                        {!viewOnly && (
                                                            <button 
                                                                onClick={() => { setSalaryPayment({ empId: emp.id, amount: '', date: new Date().toISOString().split('T')[0], notes: '' }); setShowSalaryModal(true); }} 
                                                                className="px-3 py-1.5 rounded-lg bg-surface border border-black/10 text-[9px] font-black uppercase text-ink-primary hover:bg-ink-primary hover:text-accent-signature transition-all shadow-sm"
                                                            >Pay</button>
                                                        )}
                                                        <button 
                                                            onClick={() => openEdit(emp)} 
                                                            className="w-8 h-8 rounded-lg bg-surface border border-black/10 flex items-center justify-center text-ink-primary hover:bg-black/5 transition-all shadow-sm"
                                                            title="Edit Details"
                                                        ><Edit3 size={14} /></button>
                                                        
                                                        <button 
                                                            onClick={() => updateEmployee({ ...emp, status: emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })} 
                                                            className={`w-8 h-8 rounded-lg border border-black/10 flex items-center justify-center transition-all shadow-sm ${emp.status === 'ACTIVE' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}
                                                            title={emp.status === 'ACTIVE' ? 'Mark Inactive' : 'Mark Active'}
                                                        >
                                                            {emp.status === 'ACTIVE' ? <UserMinus size={14} /> : <UserPlus size={14} />}
                                                        </button>
                                                        
                                                        {!viewOnly && (
                                                            <button 
                                                                onClick={() => setDeleteConfirm(emp.id)} 
                                                                className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-500 hover:bg-red-100 transition-all shadow-sm"
                                                                title="Delete Record"
                                                            ><Trash2 size={14} /></button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
    );
};

export default EmployeeTable;
