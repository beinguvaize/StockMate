import React, { useState, useMemo} from 'react';
import { Search, Filter, Edit3, Trash2, UserPlus, UserMinus, ChevronLeft, ChevronRight } from 'lucide-react';

const PAY_UNIT = { MONTHLY: 'month', WEEKLY: 'week' };

/**
 * The staff list with what each person earned, was paid and is still owed for
 * one month.
 *
 * Every figure comes from `rows` (lib/staffDues.js): days from the attendance
 * grid, paid from the pay runs. Nothing here is typed in. Days are changed on
 * the Attendance tab, money is paid with Run Payroll, the rate with Edit.
 */
const EmployeeTable = ({
 rows,
 monthLabel,
 onPrevMonth,
 onNextMonth,
 loading,
 unavailable,
 updateEmployee,
 openEdit,
 setDeleteConfirm,
 currencySymbol,
 viewOnly,
 departments
}) => {
 const [searchTerm, setSearchTerm] = useState('');
 const [deptFilter, setDeptFilter] = useState('ALL');

 const filteredEmployees = useMemo(() => {
 return rows.filter(({ employee: emp }) => {
 const matchesSearch = emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
 emp.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 emp.position?.toLowerCase().includes(searchTerm.toLowerCase());
 const matchesDept = deptFilter === 'ALL' || emp.department === deptFilter;
 return matchesSearch && matchesDept;
});
}, [rows, searchTerm, deptFilter]);

 const money = (n) => `${currencySymbol}${(Number(n) || 0).toLocaleString('en-IN')}`;
 // Shown instead of a figure while attendance is loading or could not be read:
 // a 0 there would say "nothing owed", which nobody has checked.
 const figure = (n) => (loading || unavailable ? '—' : money(n));

 return (
 <div className="flex flex-col gap-4">
 {/* Table Controls */}
 <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-canvas/30 p-4 rounded-lg border border-black/5">
 <div className="relative flex-1 w-full">
 <input 
 type="text" 
 placeholder="Search employees by name, role, dept..." 
 className="w-full bg-white border border-black/5 rounded-pill pl-12 pr-4 py-3 text-xs font-semibold text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all placeholder:opacity-[0.85]"
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 />
 <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-ink-primary opacity-60" />
 </div>
 
 <div className="flex items-center gap-2 w-full md:w-auto">
 <div className="flex items-center gap-1 bg-white border border-black/5 rounded-pill px-1.5 h-11">
 <button type="button" onClick={onPrevMonth} aria-label="Previous month" className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-primary hover:bg-black/5 transition-colors"><ChevronLeft size={14} /></button>
 <span className="min-w-[104px] text-center text-[11px] font-semibold text-ink-primary tabular-nums">{monthLabel}</span>
 <button type="button" onClick={onNextMonth} aria-label="Next month" className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-primary hover:bg-black/5 transition-colors"><ChevronRight size={14} /></button>
 </div>
 <div className="flex items-center gap-2 bg-white border border-black/5 rounded-pill px-4 h-11">
 <Filter size={14} className="text-ink-primary opacity-60" />
 <select 
 className="bg-transparent border-none text-[10px] font-semibold text-ink-primary outline-none cursor-pointer"
 value={deptFilter}
 onChange={(e) => setDeptFilter(e.target.value)}
 >
 <option value="ALL">All Departments</option>
 {departments.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
 </select>
 </div>
 </div>
 </div>

 {unavailable && (
 <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
 Attendance could not be loaded, so days, earned and pending are not shown. Check the connection and reload.
 </div>
 )}

 <div className="glass-panel !p-0 overflow-hidden border border-black/5 bg-surface shadow-premium !rounded-bento">
 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse whitespace-nowrap">
 <thead>
 <tr className="bg-canvas border-b border-black/5">
 <th className="p-4 pl-8 text-[10px] font-semibold text-ink-secondary opacity-70">Employee</th>
 <th className="p-4 text-[10px] font-semibold text-ink-secondary opacity-70">Pay</th>
 <th className="p-4 text-[10px] font-semibold text-ink-secondary opacity-70 text-center">Days Worked</th>
 <th className="p-4 text-[10px] font-semibold text-ink-secondary opacity-70 text-right">Earned</th>
 <th className="p-4 text-[10px] font-semibold text-ink-secondary opacity-70 text-right">Paid</th>
 <th className="p-4 text-[10px] font-semibold text-ink-secondary opacity-70 text-right">Pending</th>
 <th className="p-4 text-[10px] font-semibold text-ink-secondary opacity-70 text-center">Action</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/5 bg-surface">
 {filteredEmployees.length === 0 ? (
 <tr><td colSpan="7" className="p-16 text-center text-ink-secondary font-semibold text-[10px] opacity-60 italic">No matching personnel found</td></tr>
 ) : (
 filteredEmployees.map(row => {
 const emp = row.employee;
 const pending = Number(row.pending) || 0;

 return (
 <tr key={emp.id} className={`group hover:bg-canvas transition-colors duration-150 ${emp.status === 'INACTIVE' ? 'opacity-60 grayscale' : ''}`}>
 <td className="p-3 pl-8">
 <div className="text-sm font-semibold text-ink-primary leading-none mb-1">{emp.name}</div>
 <div className="flex items-center gap-2">
 <span className="px-2 py-0.5 rounded bg-black/5 text-[9px] font-semibold text-ink-secondary">{emp.department || emp.role}</span>
 {emp.status === 'ON_LEAVE'
  ? <span className="text-[8px] font-semibold text-blue-600">On leave</span>
  : emp.status !== 'ACTIVE' && <span className="text-[8px] font-semibold text-red-500">Inactive</span>}
 </div>
 </td>
 <td className="p-3">
 <span className="text-sm font-semibold text-ink-primary tabular-nums">{money(row.rate)}</span>
 <span className="text-[10px] font-semibold text-ink-secondary opacity-70"> / {row.dayRate ? 'day' : (PAY_UNIT[String(row.payType || '').toUpperCase()] || 'month')}</span>
 </td>
 <td className="p-3 text-center">
 {row.dayRate ? (
 <span className="text-sm font-semibold text-ink-primary tabular-nums">{loading || unavailable ? '—' : row.daysWorked}</span>
 ) : (
 <span className="text-[11px] font-semibold text-ink-secondary">
 {loading || unavailable ? '—' : row.absentDays > 0 ? `${row.absentDays} absent` : 'Salaried'}
 </span>
 )}
 </td>
 <td className="p-3 text-right text-sm font-semibold text-ink-primary tabular-nums">{figure(row.earned)}</td>
 <td className="p-3 text-right text-sm font-semibold text-ink-primary tabular-nums">{figure(row.paid)}</td>
 <td className="p-3 text-right">
 <span className={`text-sm font-semibold tabular-nums ${loading || unavailable ? 'text-ink-secondary' : pending > 0 ? 'text-red-500' : 'text-green-600'}`}>
 {figure(pending)}
 </span>
 </td>
 <td className="p-3 text-center">
 <div className="flex justify-center gap-1">
 <button 
 onClick={() => openEdit(emp)} 
 className="w-8 h-8 rounded-xl bg-surface border border-black/10 flex items-center justify-center text-ink-primary hover:bg-black/5 transition-all shadow-sm"
 title="Edit Details"
 ><Edit3 size={14} /></button>
 
 <button 
 onClick={() => updateEmployee({ ...emp, status: emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'})} 
 className={`w-8 h-8 rounded-xl border border-black/10 flex items-center justify-center transition-all shadow-sm ${emp.status === 'ACTIVE' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}
 title={emp.status === 'ACTIVE' ? 'Mark Inactive' : 'Mark Active'}
 >
 {emp.status === 'ACTIVE' ? <UserMinus size={14} /> : <UserPlus size={14} />}
 </button>
 
 {!viewOnly && (
 <button 
 onClick={() => setDeleteConfirm(emp.id)} 
 className="w-8 h-8 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500 hover:bg-red-100 transition-all shadow-sm"
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
