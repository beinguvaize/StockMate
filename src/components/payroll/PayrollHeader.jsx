import React from 'react';
import { Users, Banknote, Calendar, Receipt, UserPlus, ShieldCheck, Activity } from 'lucide-react';

const PayrollHeader = ({ 
  activeEmployeesCount, 
  totalMonthlyPayroll, 
  lastPayRun, 
  currencySymbol, 
  viewOnly, 
  hasRole, 
  handleMonthlyReset, 
  openPayRun, 
  openAdd 
}) => {
  return (
    <div className="flex flex-col gap-6 mb-8">
      {/* Top Brand Section */}
      <div className="flex justify-between items-start">
        <div className="relative">
          <div className="absolute -left-4 top-0 w-1 h-12 bg-accent-signature rounded-full opacity-50 blur-[2px]"></div>
          <h1 className="text-5xl md:text-8xl font-black font-sora text-ink-primary leading-[0.8] tracking-tighter uppercase mb-2">
            PAYROLL<span className="text-accent-signature">.</span>
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-ink-tertiary tracking-[0.3em] uppercase opacity-60">System Accounts & Ledger</span>
            <div className="h-px w-12 bg-black/10"></div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/5 border border-black/5">
              <ShieldCheck size={10} className="text-ink-secondary" />
              <span className="text-[8px] font-bold text-ink-secondary uppercase tracking-widest">SECURE DATASET</span>
            </div>
          </div>
        </div>
        
        <div className="hidden md:flex flex-col items-end text-right">
          <div className="text-[10px] font-black text-ink-tertiary tracking-widest uppercase opacity-40 mb-1">Current Fiscal Cycle</div>
          <div className="text-xl font-bold text-ink-primary tracking-tight">
            {new Date().toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Main Glass Control Console */}
      <div className="relative group">
        {/* Subtle Background Glow */}
        <div className="absolute -inset-1 bg-gradient-to-r from-accent-signature/5 via-transparent to-emerald-500/5 rounded-[2rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
        
        <div className="relative flex flex-col md:flex-row items-stretch bg-surface/60 backdrop-blur-3xl border border-white/20 rounded-[1.5rem] shadow-premium overflow-hidden">
          
          {/* Metric 01: Node Capacity */}
          <div className="flex-1 flex flex-col p-6 border-b md:border-b-0 md:border-r border-black/[0.03] hover:bg-white/40 transition-colors relative group/node">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent-signature/10 flex items-center justify-center border border-accent-signature/20 shadow-inner">
                <Users size={18} className="text-black/80" />
              </div>
              <Activity size={14} className="text-black/10 group-hover/node:text-accent-signature transition-colors" />
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-tertiary mb-1 opacity-60">Staff Allocation</div>
            <div className="text-3xl font-black text-ink-primary tracking-tighter leading-none">
              {activeEmployeesCount} 
              <span className="text-xs font-medium text-ink-tertiary opacity-40 ml-2 tracking-normal uppercase">Active Nodes</span>
            </div>
          </div>

          {/* Metric 02: Resource Loading */}
          <div className="flex-1 flex flex-col p-6 border-b md:border-b-0 md:border-r border-black/[0.03] hover:bg-white/40 transition-colors relative group/node">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-ink-primary/5 flex items-center justify-center border border-black/5 shadow-inner">
                <Banknote size={18} className="text-ink-primary/80" />
              </div>
              <div className="px-2 py-0.5 rounded bg-black/5 text-[8px] font-bold text-ink-tertiary uppercase">Monthly</div>
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-tertiary mb-1 opacity-60">Financial Commitment</div>
            <div className="text-3xl font-black text-ink-primary tracking-tighter leading-none tabular-nums">
              <span className="text-xl font-medium opacity-30 mr-1">{currencySymbol}</span>
              {totalMonthlyPayroll.toLocaleString()}
            </div>
          </div>

          {/* Metric 03: Engine Status */}
          <div className="flex-1 flex flex-col p-6 hover:bg-white/40 transition-colors relative group/node">
            <div className="flex justify-between items-start mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-inner ${lastPayRun ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                <Calendar size={18} className={lastPayRun ? 'text-emerald-600' : 'text-rose-600'} />
              </div>
              {lastPayRun && (
                <div className="text-[8px] font-black text-emerald-600/60 uppercase tracking-widest bg-emerald-500/5 px-2 py-0.5 rounded">Verified</div>
              )}
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-tertiary mb-1 opacity-60">System State</div>
            <div className="flex flex-col">
              <div className={`text-3xl font-black tracking-tighter leading-none flex items-center gap-3 ${lastPayRun ? 'text-emerald-600' : 'text-rose-600'}`}>
                {lastPayRun ? 'READY' : 'PENDING'}
                <div className="relative flex h-3 w-3">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${lastPayRun ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${lastPayRun ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                </div>
              </div>
              <div className="text-[9px] font-bold text-ink-tertiary opacity-40 uppercase tracking-widest mt-1">
                {lastPayRun ? `Last Pulse: ${new Date(lastPayRun.processedAt || lastPayRun.processed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase()}` : 'Cycle Awaiting Initiation'}
              </div>
            </div>
          </div>

          {/* Action Hub */}
          <div className="bg-black/[0.02] md:w-80 p-6 flex flex-col justify-center gap-3">
            <div className="flex gap-2">
              {!viewOnly && hasRole('OWNER') && (
                <button 
                  className="flex-1 h-10 rounded-xl bg-white border border-black/5 text-ink-primary font-bold text-[9px] uppercase tracking-widest hover:bg-black/5 transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
                  onClick={handleMonthlyReset}
                >
                  <Calendar size={12} className="opacity-40" />
                  Reset
                </button>
              )}
              {!viewOnly && (
                <button 
                  className="flex-1 h-10 rounded-xl bg-white border border-black/5 text-ink-primary font-bold text-[9px] uppercase tracking-widest hover:bg-black/5 transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  onClick={openPayRun}
                  disabled={activeEmployeesCount === 0}
                >
                  <Receipt size={12} className="opacity-40" />
                  Run
                </button>
              )}
            </div>
            
            {!viewOnly && (
              <button 
                className="w-full h-14 btn-signature rounded-xl shadow-xl shadow-accent-signature/20 flex items-center justify-center gap-4 group/btn" 
                onClick={openAdd}
              >
                <div className="flex flex-col items-start leading-none gap-1">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Administrative</span>
                  <span className="text-xs font-black uppercase tracking-tighter">ADD STAFF RESOURCE</span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-black/10 flex items-center justify-center group-hover/btn:scale-110 transition-transform">
                  <UserPlus size={18} />
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayrollHeader;
