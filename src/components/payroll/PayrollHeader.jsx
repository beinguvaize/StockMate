import React from 'react';
import { Users, Banknote, Calendar, Receipt, UserPlus } from 'lucide-react';

const PayrollHeader = ({
  activeEmployeesCount,
  totalMonthlyPayroll,
  lastPayRun,
  currencySymbol,
  viewOnly,
  hasRole,
  handleMonthlyReset,
  openPayRun,
  openAdd,
}) => {
  const lastRunDate = lastPayRun
    ? new Date(lastPayRun.processedAt || lastPayRun.processed_at).toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null;

  return (
    <div className="flex flex-col gap-6 mb-6">
      {/* Title */}
      <div className="flex justify-between items-center py-2 border-b border-black/5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black font-sora text-ink-primary leading-none">
            Payroll<span className="text-accent-signature">.</span>
          </h1>
          <span className="text-[10px] font-semibold text-muted-foreground hidden sm:block">Staff salaries & pay runs</span>
        </div>
        <div className="text-[10px] font-semibold text-muted-foreground">
          {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* KPI + Actions row */}
      <div className="flex flex-col md:flex-row items-stretch gap-4">
        {/* KPI cards */}
        <div className="flex-1 grid grid-cols-3 gap-4">
          <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm flex flex-col gap-1">
            <div className="w-9 h-9 rounded-xl bg-accent-signature/10 border border-accent-signature/20 flex items-center justify-center mb-2">
              <Users size={16} className="text-ink-primary" />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Staff</span>
            <div className="text-2xl font-bold text-ink-primary tabular-nums leading-none">
              {activeEmployeesCount}
            </div>
          </div>

          <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm flex flex-col gap-1">
            <div className="w-9 h-9 rounded-xl bg-ink-primary/5 border border-black/5 flex items-center justify-center mb-2">
              <Banknote size={16} className="text-ink-primary/70" />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Monthly Payroll</span>
            <div className="text-2xl font-bold text-ink-primary tabular-nums leading-none">
              <span className="text-accent-signature/70 text-base mr-0.5">{currencySymbol}</span>
              {totalMonthlyPayroll.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm flex flex-col gap-1">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${lastPayRun ? 'bg-green-50 border border-green-100' : 'bg-muted border border-border'}`}>
              <Calendar size={16} className={lastPayRun ? 'text-green-600' : 'text-muted-foreground'} />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Last Pay Run</span>
            <div className={`text-sm font-bold leading-tight ${lastPayRun ? 'text-green-600' : 'text-muted-foreground'}`}>
              {lastRunDate || 'None yet'}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 md:w-56 justify-center">
          {!viewOnly && hasRole('OWNER') && (
            <button
              className="h-10 rounded-xl bg-white border border-black/5 text-ink-primary font-bold text-[9px] uppercase tracking-widest hover:bg-black/5 transition-all shadow-sm flex items-center justify-center gap-2"
              onClick={handleMonthlyReset}
            >
              <Calendar size={12} className="opacity-40" />
              Reset Days (New Month)
            </button>
          )}
          {!viewOnly && (
            <button
              className="h-10 rounded-xl bg-white border border-black/5 text-ink-primary font-bold text-[9px] uppercase tracking-widest hover:bg-black/5 transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={openPayRun}
              disabled={activeEmployeesCount === 0}
            >
              <Receipt size={12} className="opacity-40" />
              Run Payroll
            </button>
          )}
          {!viewOnly && (
            <button
              className="btn-signature flex items-center gap-3 text-xs font-black"
              onClick={openAdd}
            >
              <span className="text-xs font-black uppercase tracking-tight">ADD EMPLOYEE</span>
              <div className="w-8 h-8 rounded-lg bg-black/10 flex items-center justify-center">
                <UserPlus size={16} />
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayrollHeader;
