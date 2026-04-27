import React from 'react';
import {
  X, Printer, ArrowUpRight, ArrowDownRight,
  Calendar, Clock, FileText, TrendingUp, TrendingDown,
  CreditCard, Banknote, AlertTriangle
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-fade-in no-print">
      <div className="absolute inset-0 bg-ink-primary/20 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex justify-between items-center p-6 md:p-8 border-b border-black/5">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-[1.25rem] bg-ink-primary text-accent-signature flex items-center justify-center shadow-lg flex-shrink-0">
              <Calendar size={24} />
            </div>
            <div>
              <h2 className="text-2xl md:text-4xl font-black font-sora text-ink-primary leading-none uppercase tracking-tight">
                Daily Ledger<span className="text-accent-signature">.</span>
              </h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Report</span>
                <div className="h-0.5 w-0.5 rounded-full bg-black/20" />
                <span className="text-[10px] font-black text-ink-primary bg-canvas px-2.5 py-0.5 rounded-full border border-black/5">
                  {date ? formatDate(date) : 'Today'}
                </span>
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{transactions.length} txns</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()}
              className="w-11 h-11 rounded-full border border-black/5 bg-canvas flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary">
              <Printer size={16} />
            </button>
            <button onClick={onClose}
              className="w-11 h-11 rounded-full border border-black/5 bg-canvas flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar space-y-6">

          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Opening */}
            <div className="p-5 bg-canvas rounded-[1.5rem] border border-black/5 flex flex-col gap-3">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Opening</span>
              <div className="tabular-nums">
                <span className="text-[10px] text-gray-400 mr-0.5">{currency}</span>
                <span className="text-xl font-black text-ink-primary">{fmt(openingBalance)}</span>
              </div>
            </div>

            {/* Revenue */}
            <div className="p-5 bg-emerald-50 rounded-[1.5rem] border border-emerald-100 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-emerald-600/70 uppercase tracking-[0.2em]">Revenue</span>
                <ArrowUpRight size={14} className="text-emerald-500" />
              </div>
              <div className="tabular-nums">
                <span className="text-[10px] text-emerald-400 mr-0.5">{currency}</span>
                <span className="text-xl font-black text-emerald-600">{fmt(totalIncome)}</span>
              </div>
              {creditIn > 0 && (
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-500/70">
                  <CreditCard size={10} />
                  <span>{currency}{fmt(creditIn)} credit</span>
                </div>
              )}
            </div>

            {/* Expenses */}
            <div className="p-5 bg-red-50 rounded-[1.5rem] border border-red-100 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-red-600/70 uppercase tracking-[0.2em]">Expenses</span>
                <ArrowDownRight size={14} className="text-red-500" />
              </div>
              <div className="tabular-nums">
                <span className="text-[10px] text-red-400 mr-0.5">{currency}</span>
                <span className="text-xl font-black text-red-600">{fmt(totalExpense)}</span>
              </div>
            </div>

            {/* Closing */}
            <div className={`p-5 rounded-[1.5rem] flex flex-col gap-3 ${isDeficit ? 'bg-red-600' : 'bg-ink-primary'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${isDeficit ? 'text-red-200' : 'text-white/40'}`}>Closing</span>
                {isDeficit && <AlertTriangle size={13} className="text-red-200" />}
              </div>
              <div className="tabular-nums">
                <span className={`text-[10px] mr-0.5 ${isDeficit ? 'text-red-300' : 'text-white/30'}`}>{currency}</span>
                <span className={`text-xl font-black ${isDeficit ? 'text-white' : 'text-accent-signature'}`}>
                  {isDeficit ? '-' : ''}{fmt(Math.abs(closingBalance))}
                </span>
              </div>
              {isDeficit && (
                <span className="text-[9px] font-bold text-red-200 uppercase tracking-wide">Cash Deficit</span>
              )}
            </div>
          </div>

          {/* Transaction Table */}
          <div className="bg-white rounded-[1.5rem] border border-black/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
              <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Transaction Log</span>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${netSurplus >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {netSurplus >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {netSurplus >= 0 ? 'Surplus' : 'Deficit'} {currency}{fmt(Math.abs(netSurplus))}
              </div>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas/60 border-b border-black/5">
                  <th className="py-3 px-5 text-[9px] font-bold text-gray-400 uppercase tracking-widest">Time</th>
                  <th className="py-3 px-5 text-[9px] font-bold text-gray-400 uppercase tracking-widest">Activity</th>
                  <th className="py-3 px-5 text-[9px] font-bold text-gray-400 uppercase tracking-widest">Method</th>
                  <th className="py-3 px-5 text-[9px] font-bold text-gray-400 uppercase tracking-widest text-right">In (+)</th>
                  <th className="py-3 px-5 text-[9px] font-bold text-gray-400 uppercase tracking-widest text-right">Out (−)</th>
                  <th className="py-3 px-5 text-[9px] font-bold text-gray-400 uppercase tracking-widest text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {txWithBalance.map((tx, idx) => (
                  <tr key={tx.id || idx} className="hover:bg-canvas/40 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-1.5">
                        <Clock size={10} className="text-gray-300" />
                        <span className="text-[10px] font-black text-ink-primary font-mono tabular-nums">{tx.time}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${tx.type === 'INCOME' ? 'bg-emerald-50 text-emerald-500' : 'bg-red-50 text-red-500'}`}>
                          {tx.type === 'INCOME' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-ink-primary leading-none">{tx.category}</p>
                          <p className="text-[9px] font-bold text-gray-400 mt-0.5">{tx.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider border ${
                        tx.description?.toUpperCase() === 'CREDIT'
                          ? 'bg-blue-50 text-blue-600 border-blue-100'
                          : 'bg-canvas text-gray-500 border-black/5'
                      }`}>
                        {tx.description?.toUpperCase() === 'CREDIT' ? <CreditCard size={9} /> : <Banknote size={9} />}
                        {tx.description || 'Cash'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      {tx.type === 'INCOME' ? (
                        <span className="text-[11px] font-black text-emerald-600 tabular-nums">
                          {currency}{fmt(tx.amount)}
                        </span>
                      ) : <span className="text-gray-200">—</span>}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      {tx.type === 'EXPENSE' ? (
                        <span className="text-[11px] font-black text-red-600 tabular-nums">
                          {currency}{fmt(tx.amount)}
                        </span>
                      ) : <span className="text-gray-200">—</span>}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <span className={`text-[11px] font-black tabular-nums ${tx.runningBalance < 0 ? 'text-red-500' : 'text-ink-primary'}`}>
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
                        <span className="text-[10px] font-bold uppercase tracking-widest mt-3">No transactions recorded</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-canvas border-t border-black/5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            <span>{sales.length} sales · {expenses.length} expenses</span>
            <div className="h-3 w-px bg-black/10" />
            <span className={netSurplus >= 0 ? 'text-emerald-600' : 'text-red-600'}>
              Net {netSurplus >= 0 ? '+' : ''}{currency}{fmt(netSurplus)}
            </span>
          </div>
          <button onClick={onClose}
            className="px-8 h-11 bg-ink-primary text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-black transition-all">
            Close
          </button>
        </div>
      </div>

      {/* PRINT VERSION */}
      <div className="hidden print:block fixed inset-0 bg-white p-10 text-black">
        <div className="flex justify-between items-start border-b-2 border-black pb-8 mb-8">
          <div>
            <h1 className="text-4xl font-black uppercase mb-1">{businessProfile.name || 'Ledgr'}</h1>
            <p className="font-bold text-sm uppercase opacity-60">Daily Financial Ledger</p>
          </div>
          <div className="text-right">
            <p className="font-black text-xl">{date ? formatDate(date) : ''}</p>
            <p className="font-bold text-xs uppercase opacity-60">Locked Record</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[['Opening', openingBalance], ['Revenue', totalIncome], ['Expenses', totalExpense], ['Closing', closingBalance]].map(([label, val]) => (
            <div key={label} className={`border border-black p-4 ${label === 'Closing' ? 'bg-black text-white' : ''}`}>
              <p className="text-[10px] font-bold uppercase mb-1">{label}</p>
              <p className="text-xl font-black">{currency}{fmt(val)}</p>
            </div>
          ))}
        </div>
        <table className="w-full text-left border-collapse border border-black mb-10">
          <thead>
            <tr className="bg-gray-100">
              {['Time','Activity','Method','In (+)','Out (−)','Balance'].map(h => (
                <th key={h} className="border border-black p-2 text-[9px] font-bold uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {txWithBalance.map(tx => (
              <tr key={tx.id}>
                <td className="border border-black p-2 text-xs font-bold">{tx.time}</td>
                <td className="border border-black p-2 text-xs font-bold">{tx.category}</td>
                <td className="border border-black p-2 text-xs">{tx.description}</td>
                <td className="border border-black p-2 text-right text-xs font-bold">{tx.type === 'INCOME' ? `${currency}${fmt(tx.amount)}` : ''}</td>
                <td className="border border-black p-2 text-right text-xs font-bold">{tx.type === 'EXPENSE' ? `${currency}${fmt(tx.amount)}` : ''}</td>
                <td className="border border-black p-2 text-right text-xs font-bold">{currency}{fmt(tx.runningBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between mt-20">
          <div className="text-center w-64 border-t border-black pt-3"><p className="text-[10px] font-bold uppercase">Manager Signature</p></div>
          <div className="text-center w-64 border-t border-black pt-3"><p className="text-[10px] font-bold uppercase">Auditor Signature</p></div>
        </div>
      </div>
    </div>
  );
};

export default DailyLedgerDetail;
