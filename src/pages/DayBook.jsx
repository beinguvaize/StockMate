import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useFinance } from '../hooks/useFinance';
import { useSales } from '../hooks/useSales';
import { 
  Calendar, Save, ArrowUpRight, ArrowDownRight, 
  Calculator, BookOpen, Clock, AlertCircle, TrendingUp, TrendingDown, RefreshCcw, Eye
} from 'lucide-react';
import DailyLedgerDetail from '../components/reports/DailyLedgerDetail';
import { todayISOInAppTZ } from '../lib/utils';

const DayBook = () => {
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { 
    expenses, dayBook, updateDayBook, getDayBookForDate, loading: finLoading 
  } = useFinance(currentTenantId);
  const { sales, loading: salesLoading } = useSales(currentTenantId);

  const isViewOnly = () => false;
  
  const [selectedDate, setSelectedDate] = useState(todayISOInAppTZ());
  const [manualOpeningBalance, setManualOpeningBalance] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 1. Data Processing
  const ledgerData = useMemo(() => {
    const daySales = (sales || []).filter(s => s.date === selectedDate);
    const dayExpenses = (expenses || []).filter(e => e.date === selectedDate);
    
    const cashSales = daySales.filter(s => s.payment_method === 'CASH').reduce((sum, s) => sum + (s.paid_amount || 0), 0);
    const creditSales = daySales.filter(s => s.payment_method === 'CREDIT').reduce((sum, s) => sum + s.total_amount, 0);
    const bankSales = daySales.filter(s => s.payment_method === 'BANK').reduce((sum, s) => sum + (s.paid_amount || 0), 0);
    const totalReceipts = cashSales + bankSales;
    
    const totalPayments = dayExpenses.reduce((sum, e) => sum + e.amount, 0);
    
    const record = getDayBookForDate(selectedDate);
    const openingBalance = record?.opening_balance || 0;
    const closingBalance = openingBalance + totalReceipts - totalPayments;

    return {
      openingBalance,
      cashSales,
      creditSales,
      bankSales,
      totalReceipts,
      totalPayments,
      closingBalance,
      sales: daySales,
      expenses: dayExpenses,
      isLocked: !!record?.id
    };
  }, [sales, expenses, selectedDate, getDayBookForDate]);

  const handleUpdateBalance = async () => {
    if (isSaving || !manualOpeningBalance) return;
    setIsSaving(true);
    try {
      await updateDayBook({
        date: selectedDate,
        opening_balance: parseFloat(manualOpeningBalance),
        tenant_id: currentTenantId
      });
      setManualOpeningBalance('');
    } catch (err) {
      console.error("DayBook update error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (finLoading || salesLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-accent-signature/30 border-t-accent-signature rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b border-black/5">
        <div>
          <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">
            DAYBOOK<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase tracking-widest">
            Daily Financial Ledger & Physical Cash Reconcilliation
          </p>
        </div>
        
        <div className="flex items-center gap-3 no-print bg-white/60 p-2 rounded-pill border border-black/5 shadow-premium">
          <Calendar size={16} className="text-gray-400 ml-2" />
          <input 
            type="date" 
            className="bg-transparent border-none text-xs font-black uppercase outline-none cursor-pointer text-ink-primary"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settlement Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-ink-primary p-6 rounded-bento border border-white/5 relative overflow-hidden group">
              <div className="absolute top-4 right-4 text-surface opacity-10">
                <TrendingUp size={32} />
              </div>
              <p className="text-[8px] font-black text-surface/40 uppercase tracking-widest mb-1">Receipts Matrix</p>
              <p className="text-4xl font-black text-accent-signature font-sora tabular-nums leading-none mb-1 tracking-tight">
                {businessProfile.currencySymbol}{ledgerData.totalReceipts.toLocaleString()}
              </p>
              <p className="text-[9px] font-bold text-surface/60 uppercase">Day Inflow</p>
            </div>

            <div className="bg-white p-6 rounded-bento border border-black/5 shadow-premium group">
              <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Expenditure Node</p>
              <p className="text-4xl font-black text-ink-primary font-sora tabular-nums leading-none mb-1 tracking-tight">
                {businessProfile.currencySymbol}{ledgerData.totalPayments.toLocaleString()}
              </p>
              <p className="text-[9px] font-bold text-gray-500 uppercase">Settled Payments</p>
            </div>

            <div className="bg-canvas p-6 rounded-bento border border-black/5 shadow-inner group flex flex-col justify-center">
              <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Net Position</p>
              <p className="text-2xl font-black text-ink-primary font-sora tabular-nums leading-none tracking-tight">
                {businessProfile.currencySymbol}{(ledgerData.totalReceipts - ledgerData.totalPayments).toLocaleString()}
              </p>
            </div>
          </div>

          <DailyLedgerDetail 
            sales={ledgerData.sales}
            expenses={ledgerData.expenses}
            currencySymbol={businessProfile.currencySymbol}
          />
        </div>

        {/* Closing Control */}
        <div className="space-y-6">
          <div className="glass-panel !rounded-bento p-8 border border-black/5 shadow-premium relative overflow-hidden">
            <h2 className="text-xs font-black text-ink-primary mb-6 uppercase tracking-widest flex items-center gap-2">
              <Calculator size={14} className="text-accent-signature" />
              Closing Protocol
            </h2>
            
            <div className="space-y-6">
              <div className="flex justify-between items-center text-[10px] font-black uppercase text-gray-400 tracking-widest">
                <span>Opening Vector</span>
                <span className="text-ink-primary">{businessProfile.currencySymbol}{ledgerData.openingBalance.toLocaleString()}</span>
              </div>
              
              <div className="flex justify-between items-center py-4 border-y border-black/5">
                <span className="text-xs font-black text-ink-primary uppercase tracking-tight">Closing Balance</span>
                <span className="text-2xl font-black text-ink-primary font-sora tabular-nums">
                  {businessProfile.currencySymbol}{ledgerData.closingBalance.toLocaleString()}
                </span>
              </div>

              {!ledgerData.isLocked && hasPermission('finance', 'edit') && (
                <div className="space-y-4 pt-4">
                  <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                    Set opening balance for {new Date(selectedDate).toLocaleDateString()} to authorize ledger closing.
                  </p>
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="Enter Opening Amt..."
                      className="w-full h-14 bg-canvas border border-black/5 rounded-xl px-5 py-2 font-black text-lg outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all tabular-nums"
                      value={manualOpeningBalance}
                      onChange={(e) => setManualOpeningBalance(e.target.value)}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 font-bold">{businessProfile.currencySymbol}</div>
                  </div>
                  <button 
                    onClick={handleUpdateBalance}
                    disabled={isSaving || !manualOpeningBalance}
                    className="w-full btn-signature !h-14 !rounded-xl !text-sm flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isSaving ? <RefreshCcw className="animate-spin" size={18} /> : <Save size={18} />}
                    AUTHORIZE LEDGER
                  </button>
                </div>
              )}

              {ledgerData.isLocked && (
                <div className="p-4 rounded-xl bg-accent-signature/5 border border-accent-signature/20 flex flex-col items-center gap-3 text-center">
                  <ShieldCheck size={24} className="text-accent-signature" />
                  <span className="text-[9px] font-black text-ink-primary uppercase tracking-widest">Ledger Validated & Locked</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 bg-white/40 border border-black/5 rounded-bento opacity-60">
            <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">Audit Footprint</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] font-bold">
                <span className="text-gray-500 uppercase">Sync Status</span>
                <span className="text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Authorized
                </span>
              </div>
              <div className="flex justify-between text-[9px] font-bold">
                <span className="text-gray-500 uppercase">Operator</span>
                <span className="text-ink-primary uppercase">ADMIN ACCOUNT</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayBook;
