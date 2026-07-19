import React from 'react';
import { useDialogClose } from '../../hooks/useDialogClose';
import {
  X, Printer, ArrowUpRight, ArrowDownRight,
  Calendar, Clock, FileText, TrendingUp, TrendingDown,
  CreditCard, Banknote, AlertTriangle, ChevronLeft
} from 'lucide-react';
import { formatDate, parseLocalDate } from '../../lib/utils';

const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DailyLedgerDetail = ({
  date,
  openingBalance = 0,
  closingBalance = 0,
  sales = [],
  expenses = [],
  businessProfile = {},
  onClose
}) => {
  useDialogClose(onClose);
  const currency = businessProfile?.currencySymbol || '₹';
  const isDeficit = closingBalance < 0;

  const transactions = [
    ...sales.map(s => ({
      id: s.id,
      type: 'INCOME',
      category: s.customerInfo?.name ? `Sale · ${s.customerInfo.name}` : 'Sale',
      description: s.paymentMethod || s.payment_method || 'CASH',
      amount: Number(s.totalAmount) || Number(s.total_amount) || 0,
      time: new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: parseLocalDate(s.date).getTime(),
    })),
    ...expenses.map(e => ({
      id: e.id,
      type: 'EXPENSE',
      category: e.category || 'General',
      description: e.note || e.description || 'Expense',
      amount: parseFloat(e.amount) || 0,
      time: new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: parseLocalDate(e.date).getTime(),
    }))
  ].sort((a, b) => a.timestamp - b.timestamp);

  // Running balance
  let running = openingBalance;
  const txWithBalance = transactions.map(tx => {
    running = tx.type === 'INCOME' ? running + tx.amount : running - tx.amount;
    return { ...tx, runningBalance: running };
  });

  const totalIncome = sales.reduce((s, x) => s + (Number(x.totalAmount) || Number(x.total_amount) || 0), 0);
  const totalExpense = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const netSurplus = totalIncome - totalExpense;

  const cashIn  = sales.filter(s => (s.paymentMethod || s.payment_method || '').toUpperCase() !== 'CREDIT')
                       .reduce((s, x) => s + (Number(x.totalAmount) || Number(x.total_amount) || 0), 0);
  const creditIn = totalIncome - cashIn;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-canvas animate-fade-in no-print">

      <div className="relative w-full flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-border/60 bg-card shrink-0">
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-border/60 hover:bg-canvas transition-all text-foreground shrink-0">
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Calendar size={16} className="text-accent-signature shrink-0" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground leading-none">
                Daily Ledger<span className="text-accent-signature">.</span>
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-semibold text-foreground">{date ? formatDate(date) : 'Today'}</span>
                <span className="text-[9px] font-semibold text-muted-foreground">{transactions.length} transactions</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => window.print()}
              className="w-9 h-9 rounded-full border border-border/60 bg-canvas flex items-center justify-center hover:bg-black/5 transition-all text-foreground">
              <Printer size={14} />
            </button>
            <button onClick={onClose}
              className="w-9 h-9 rounded-full border border-border/60 bg-canvas flex items-center justify-center hover:bg-black/5 transition-all text-muted-foreground">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar space-y-6">

          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Opening */}
            <div className="p-5 bg-canvas rounded-[1.5rem] border border-border/60 flex flex-col gap-3">
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">Opening</span>
              <div className="tabular-nums">
                <span className="text-[10px] text-muted-foreground mr-0.5">{currency}</span>
                <span className="text-xl font-semibold text-foreground">{fmt(openingBalance)}</span>
              </div>
            </div>

            {/* Revenue */}
            <div className="p-5 bg-emerald-50 rounded-[1.5rem] border border-emerald-100 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-semibold text-emerald-600/70 uppercase tracking-[0.2em]">Revenue</span>
                <ArrowUpRight size={14} className="text-emerald-500" />
              </div>
              <div className="tabular-nums">
                <span className="text-[10px] text-emerald-400 mr-0.5">{currency}</span>
                <span className="text-xl font-semibold text-emerald-600">{fmt(totalIncome)}</span>
              </div>
              {creditIn > 0 && (
                <div className="flex items-center gap-1.5 text-[9px] font-semibold text-emerald-500/70">
                  <CreditCard size={10} />
                  <span>{currency}{fmt(creditIn)} credit</span>
                </div>
              )}
            </div>

            {/* Expenses */}
            <div className="p-5 bg-red-50 rounded-[1.5rem] border border-red-100 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-semibold text-red-600/70 uppercase tracking-[0.2em]">Expenses</span>
                <ArrowDownRight size={14} className="text-red-500" />
              </div>
              <div className="tabular-nums">
                <span className="text-[10px] text-red-400 mr-0.5">{currency}</span>
                <span className="text-xl font-semibold text-red-600">{fmt(totalExpense)}</span>
              </div>
            </div>

            {/* Closing */}
            <div className={`p-5 rounded-[1.5rem] flex flex-col gap-3 ${isDeficit ? 'bg-red-600' : 'bg-ink-primary'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[9px] font-semibold uppercase tracking-[0.2em] ${isDeficit ? 'text-red-200' : 'text-white/40'}`}>Closing</span>
                {isDeficit && <AlertTriangle size={13} className="text-red-200" />}
              </div>
              <div className="tabular-nums">
                <span className={`text-[10px] mr-0.5 ${isDeficit ? 'text-red-300' : 'text-white/30'}`}>{currency}</span>
                <span className={`text-xl font-semibold ${isDeficit ? 'text-white' : 'text-accent-signature'}`}>
                  {isDeficit ? '-' : ''}{fmt(Math.abs(closingBalance))}
                </span>
              </div>
              {isDeficit && (
                <span className="text-[9px] font-semibold text-red-200 uppercase tracking-wide">Cash Deficit</span>
              )}
            </div>
          </div>

          {/* Transaction Table */}
          <div className="bg-card rounded-[1.5rem] border border-border/60 overflow-hidden">
            <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-widest">Transaction Log</span>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-semibold uppercase tracking-widest ${netSurplus >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {netSurplus >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {netSurplus >= 0 ? 'Surplus' : 'Deficit'} {currency}{fmt(Math.abs(netSurplus))}
              </div>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas/60 border-b border-border/60">
                  <th className="py-3 px-5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Time</th>
                  <th className="py-3 px-5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Activity</th>
                  <th className="py-3 px-5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Method</th>
                  <th className="py-3 px-5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest text-right">In (+)</th>
                  <th className="py-3 px-5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest text-right">Out (−)</th>
                  <th className="py-3 px-5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {txWithBalance.map((tx, idx) => (
                  <tr key={tx.id || idx} className="hover:bg-canvas/40 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-1.5">
                        <Clock size={10} className="text-gray-300" />
                        <span className="text-[10px] font-semibold text-foreground tabular-nums">{tx.time}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${tx.type === 'INCOME' ? 'bg-emerald-50 text-emerald-500' : 'bg-red-50 text-red-500'}`}>
                          {tx.type === 'INCOME' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-foreground leading-none">{tx.category}</p>
                          <p className="text-[9px] font-semibold text-muted-foreground mt-0.5">{tx.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wider border ${
                        tx.description?.toUpperCase() === 'CREDIT'
                          ? 'bg-blue-50 text-blue-600 border-blue-100'
                          : 'bg-canvas text-muted-foreground border-border/60'
                      }`}>
                        {tx.description?.toUpperCase() === 'CREDIT' ? <CreditCard size={9} /> : <Banknote size={9} />}
                        {tx.description || 'Cash'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      {tx.type === 'INCOME' ? (
                        <span className="text-[11px] font-semibold text-emerald-600 tabular-nums">
                          {currency}{fmt(tx.amount)}
                        </span>
                      ) : <span className="text-gray-200">—</span>}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      {tx.type === 'EXPENSE' ? (
                        <span className="text-[11px] font-semibold text-red-600 tabular-nums">
                          {currency}{fmt(tx.amount)}
                        </span>
                      ) : <span className="text-gray-200">—</span>}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <span className={`text-[11px] font-semibold tabular-nums ${tx.runningBalance < 0 ? 'text-red-500' : 'text-foreground'}`}>
                        {tx.runningBalance < 0 ? '-' : ''}{currency}{fmt(Math.abs(tx.runningBalance))}
                      </span>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-16 text-center">
                      <div className="flex flex-col items-center opacity-20">
                        <FileText size={36} strokeWidth={1.5} />
                        <span className="text-[10px] font-semibold uppercase tracking-widest mt-3">No transactions recorded</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-canvas border-t border-border/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-[11px] font-medium text-muted-foreground">
            <span>{sales.length} sales · {expenses.length} expenses</span>
            <div className="h-3 w-px bg-black/10" />
            <span className={netSurplus >= 0 ? 'text-emerald-600' : 'text-red-600'}>
              Net {netSurplus >= 0 ? '+' : ''}{currency}{fmt(netSurplus)}
            </span>
          </div>
          <button onClick={onClose}
            className="px-8 h-11 bg-ink-primary text-white font-semibold text-[10px] uppercase tracking-widest rounded-full hover:bg-black transition-all">
            Close
          </button>
        </div>
      </div>

      {/* PRINT VERSION */}
      <div className="hidden print:block fixed inset-0 bg-card p-10 text-black">
        <div className="flex justify-between items-start border-b-2 border-black pb-8 mb-8">
          <div>
            <h1 className="text-4xl font-semibold uppercase mb-1">{businessProfile.name || 'Ledgr'}</h1>
            <p className="font-semibold text-sm uppercase opacity-60">Daily Financial Ledger</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-xl">{date ? formatDate(date) : ''}</p>
            <p className="font-semibold text-xs uppercase opacity-60">Locked Record</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[['Opening', openingBalance], ['Revenue', totalIncome], ['Expenses', totalExpense], ['Closing', closingBalance]].map(([label, val]) => (
            <div key={label} className={`border border-black p-4 ${label === 'Closing' ? 'bg-black text-white' : ''}`}>
              <p className="text-[10px] font-semibold uppercase mb-1">{label}</p>
              <p className="text-xl font-semibold">{currency}{fmt(val)}</p>
            </div>
          ))}
        </div>
        <table className="w-full text-left border-collapse border border-black mb-10">
          <thead>
            <tr className="bg-gray-100">
              {['Time','Activity','Method','In (+)','Out (−)','Balance'].map(h => (
                <th key={h} className="border border-black p-2 text-[9px] font-semibold uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {txWithBalance.map(tx => (
              <tr key={tx.id}>
                <td className="border border-black p-2 text-xs font-semibold">{tx.time}</td>
                <td className="border border-black p-2 text-xs font-semibold">{tx.category}</td>
                <td className="border border-black p-2 text-xs">{tx.description}</td>
                <td className="border border-black p-2 text-right text-xs font-semibold">{tx.type === 'INCOME' ? `${currency}${fmt(tx.amount)}` : ''}</td>
                <td className="border border-black p-2 text-right text-xs font-semibold">{tx.type === 'EXPENSE' ? `${currency}${fmt(tx.amount)}` : ''}</td>
                <td className="border border-black p-2 text-right text-xs font-semibold">{currency}{fmt(tx.runningBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between mt-20">
          <div className="text-center w-64 border-t border-black pt-3"><p className="text-[10px] font-semibold uppercase">Manager Signature</p></div>
          <div className="text-center w-64 border-t border-black pt-3"><p className="text-[10px] font-semibold uppercase">Auditor Signature</p></div>
        </div>
      </div>
    </div>
  );
};

export default DailyLedgerDetail;
