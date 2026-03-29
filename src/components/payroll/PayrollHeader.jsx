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
    openAdd 
}) => {
    return (
        <div className="flex flex-col gap-4">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-4 border-b border-black/5">
                <div>
                    <h1 className="text-3xl md:text-6xl font-black text-ink-primary uppercase tracking-tighter leading-none mb-2">PAYROLL.</h1>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-70">COMPENSATION & STAFF ACCOUNTS</p>
                </div>
            </div>

            {/* Quick Stats & Controls - Standard Metric Bar */}
            <div className="flex flex-wrap items-center bg-surface/80 backdrop-blur-xl border border-black/5 rounded-pill shadow-premium p-1 md:h-14 w-full">
                {/* Metric Section: Active Nodes */}
                <div className="flex items-center gap-3 px-5 border-r border-black/5 h-full py-2">
                    <div className="w-8 h-8 rounded-full bg-accent-signature/10 flex items-center justify-center border border-accent-signature/20">
                        <Users size={14} className="text-accent-signature" />
                    </div>
                    <div className="flex flex-col -space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Active Staff</div>
                        <div className="text-xl md:text-2xl font-black text-ink-primary tracking-tighter leading-none">{activeEmployeesCount} Staff</div>
                    </div>
                </div>

                {/* Metric Section: Monthly Cost */}
                <div className="flex items-center gap-3 px-5 border-r border-black/5 h-full py-2">
                    <div className="w-8 h-8 rounded-full bg-ink-primary/5 flex items-center justify-center border border-black/5">
                        <Banknote size={14} className="text-ink-primary" />
                    </div>
                    <div className="flex flex-col -space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Monthly Cost</div>
                        <div className="text-xl md:text-2xl font-black text-ink-primary tracking-tighter leading-none tabular-nums">
                            {currencySymbol}{totalMonthlyPayroll.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Metric Section: Last Pay Run Status */}
                <div className="flex items-center gap-3 px-5 md:border-r border-black/5 h-full py-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${lastPayRun ? 'bg-accent-signature/10 border-accent-signature/20' : 'bg-red-50 border-red-100'}`}>
                        <Calendar size={14} className={lastPayRun ? 'text-accent-signature' : 'text-red-500'} />
                    </div>
                    <div className="flex flex-col -space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Status</div>
                        <div className="flex items-baseline gap-2">
                             <div className={`text-xl md:text-2xl font-black tracking-tighter leading-none ${lastPayRun ? 'text-ink-primary' : 'text-red-500'}`}>
                                {lastPayRun ? 'SYNCED' : 'PENDING'}
                             </div>
                             {lastPayRun && (
                                <span className="text-[10px] font-black text-ink-secondary opacity-70 uppercase tracking-tight hidden md:inline">
                                    {new Date(lastPayRun.processedAt || lastPayRun.processed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                </span>
                             )}
                        </div>
                    </div>
                </div>

                {/* Interactive Section: Actions */}
                <div className="flex-1 flex items-center justify-end h-full pr-1 py-1">
                    <div className="flex flex-wrap h-full gap-2 items-center justify-end px-2">
                        {!viewOnly && hasRole('OWNER') && (
                            <button className="px-4 md:px-6 py-2 rounded-pill border border-black/10 font-bold text-ink-primary hover:bg-black/5 transition-all text-[10px] uppercase cursor-pointer h-10 flex items-center justify-center gap-2" onClick={handleMonthlyReset}>
                                <Calendar size={14} className="opacity-70" /> Reset Monthly
                            </button>
                        )}
                        {!viewOnly && (
                            <button className="px-4 md:px-6 py-2 rounded-pill border border-black/10 font-bold text-ink-primary hover:bg-black/5 transition-all text-[10px] uppercase cursor-pointer h-10 flex items-center justify-center gap-2" onClick={openPayRun} disabled={activeEmployeesCount === 0}>
                                <Receipt size={14} className="opacity-70" /> Pay Run
                            </button>
                        )}
                        {!viewOnly && (
                            <button className="btn-signature h-10 px-6 md:px-8 !py-0 !rounded-pill !text-[10px]" onClick={openAdd}>
                                ADD EMPLOYEE
                                <div className="icon-nest ml-2">
                                    <UserPlus size={14} />
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
