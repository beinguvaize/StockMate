import React from 'react';
import { 
  X, Printer, ArrowUpRight, ArrowDownRight, 
  Calendar, DollarSign, Clock, Receipt, ShoppingCart, 
  FileText, TrendingUp, TrendingDown 
} from 'lucide-react';

const DailyLedgerDetail = ({ 
  date, 
  openingBalance, 
  closingBalance, 
  sales = [], 
  expenses = [], 
  businessProfile = {}, 
  onClose 
}) => {
  const currency = businessProfile?.currencySymbol || '₹';
  
  // Combine and sort transactions chronologically
  const transactions = [
    ...sales.map(s => ({
      id: s.id,
      type: 'INCOME',
      category: 'Sale',
      description: `Sale to ${s.customerInfo?.name || 'Walk-in Customer'}`,
      amount: s.totalAmount,
      time: new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date(s.date).getTime(),
      method: s.paymentMethod || 'Cash'
    })),
    ...expenses.map(e => ({
      id: e.id,
      type: 'EXPENSE',
      category: e.category || 'General',
      description: e.note || 'Operational Expense',
      amount: parseFloat(e.amount) || 0,
      time: new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date(e.date).getTime(),
      method: 'Cash'
    }))
  ].sort((a, b) => a.timestamp - b.timestamp);

  const totalIncome = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  const totalExpense = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const netSurplus = totalIncome - totalExpense;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-fade-in no-print">
      <div className="absolute inset-0 bg-ink-primary/20 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-6 md:p-10 border-b border-black/5">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-[1.5rem] bg-ink-primary text-accent-signature flex items-center justify-center shadow-premium">
              <Calendar size={32} />
            </div>
            <div>
              <h2 className="text-3xl md:text-5xl font-black font-sora text-ink-primary leading-none uppercase tracking-tight">
                DAILY LEDGER<span className="text-accent-signature">.</span>
              </h2>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">TRANSACTION MANIFEST</span>
                <div className="h-1 w-1 rounded-full bg-black/10"></div>
                <span className="text-[11px] font-black text-ink-primary uppercase tracking-wider bg-canvas px-3 py-1 rounded-pill">
                  {new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handlePrint}
              className="w-14 h-14 rounded-full border border-black/5 bg-canvas flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary"
            >
              <Printer size={20} />
            </button>
            <button 
              onClick={onClose}
              className="w-14 h-14 rounded-full border border-black/5 bg-canvas flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
          {/* Top Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
            <div className="p-6 bg-canvas rounded-[2rem] border border-black/5">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em] block mb-3">Opening</span>
              <div className="text-2xl font-black text-ink-primary tabular-nums">
                <span className="text-xs opacity-30 mr-1">{currency}</span>
                {openingBalance.toLocaleString()}
              </div>
            </div>
            <div className="p-6 bg-green-50/50 rounded-[2rem] border border-green-500/10">
              <span className="text-[9px] font-bold text-green-600/60 uppercase tracking-[0.2em] block mb-3">Revenue (In)</span>
              <div className="text-2xl font-black text-green-600 tabular-nums">
                <span className="text-xs opacity-30 mr-1">{currency}</span>
                {totalIncome.toLocaleString()}
              </div>
            </div>
            <div className="p-6 bg-red-50/50 rounded-[2rem] border border-red-500/10">
              <span className="text-[9px] font-bold text-red-600/60 uppercase tracking-[0.2em] block mb-3">Expenses (Out)</span>
              <div className="text-2xl font-black text-red-600 tabular-nums">
                <span className="text-xs opacity-30 mr-1">{currency}</span>
                {totalExpense.toLocaleString()}
              </div>
            </div>
            <div className="p-6 bg-ink-primary rounded-[2rem] shadow-premium">
              <span className="text-[9px] font-bold text-surface/40 uppercase tracking-[0.2em] block mb-3">Closing</span>
              <div className="text-2xl font-black text-accent-signature tabular-nums">
                <span className="text-xs opacity-30 mr-1 text-surface/20">{currency}</span>
                {closingBalance.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Transaction Table */}
          <div className="bg-white rounded-[2rem] border border-black/5 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas/50 border-b border-black/5">
                  <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Time</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Transaction</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Method</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Credit (+)</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Debit (-)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {transactions.map((tx, idx) => (
                  <tr key={tx.id || idx} className="hover:bg-canvas/30 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <Clock size={12} className="text-gray-400" />
                        <span className="text-[10px] font-black text-ink-primary font-mono">{tx.time}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-ink-primary leading-none mb-1">{tx.category}</span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{tx.description}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-3 py-1 bg-canvas border border-black/5 rounded-pill text-[9px] font-bold text-gray-600 uppercase tracking-wider">
                        {tx.method}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {tx.type === 'INCOME' ? (
                        <div className="flex items-center justify-end gap-2 text-green-600 font-black tabular-nums">
                          <span className="text-[10px] opacity-40">{currency}</span>
                          <span className="text-sm">{tx.amount.toLocaleString()}</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {tx.type === 'EXPENSE' ? (
                        <div className="flex items-center justify-end gap-2 text-red-600 font-black tabular-nums">
                          <span className="text-[10px] opacity-40">{currency}</span>
                          <span className="text-sm">{tx.amount.toLocaleString()}</span>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-20 text-center">
                      <div className="flex flex-col items-center opacity-20">
                        <FileText size={48} strokeWidth={1} />
                        <span className="text-xs font-bold uppercase tracking-widest mt-4">Zero Movement Recorded</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer / Actions */}
        <div className="p-8 bg-canvas border-t border-black/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-6">
            <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border ${netSurplus >= 0 ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
              {netSurplus >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {netSurplus >= 0 ? 'Operational Surplus' : 'Operational Deficit'}
            </div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden md:block">
              Net Result: <span className="text-ink-primary">{currency}{Math.abs(netSurplus).toLocaleString()}</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-full md:w-auto px-12 h-14 bg-ink-primary text-white font-black text-xs rounded-full hover:bg-black transition-all shadow-premium"
          >
            DISMISS REPORT
          </button>
        </div>
      </div>

      {/* PRINT VERSION (Hidden visually, visible on print) */}
      <div className="hidden print:block fixed inset-0 bg-white p-10 text-black">
        <div className="flex justify-between items-start border-b-2 border-black pb-8 mb-8">
          <div>
            <h1 className="text-4xl font-black uppercase mb-2">{businessProfile.name || 'StockMate'}</h1>
            <p className="font-bold text-sm uppercase opacity-60">Daily Financial Ledger</p>
          </div>
          <div className="text-right">
            <p className="font-black text-xl">{new Date(date).toLocaleDateString()}</p>
            <p className="font-bold text-xs uppercase opacity-60">Status: Locked Record</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="border border-black p-4">
            <p className="text-[10px] font-bold uppercase mb-1">Opening</p>
            <p className="text-xl font-black">{currency}{openingBalance.toLocaleString()}</p>
          </div>
          <div className="border border-black p-4">
            <p className="text-[10px] font-bold uppercase mb-1">Revenue</p>
            <p className="text-xl font-black">{currency}{totalIncome.toLocaleString()}</p>
          </div>
          <div className="border border-black p-4">
            <p className="text-[10px] font-bold uppercase mb-1">Expenses</p>
            <p className="text-xl font-black">{currency}{totalExpense.toLocaleString()}</p>
          </div>
          <div className="border border-black p-4 bg-black text-white">
            <p className="text-[10px] font-bold uppercase mb-1">Closing</p>
            <p className="text-xl font-black">{currency}{closingBalance.toLocaleString()}</p>
          </div>
        </div>

        <table className="w-full text-left border-collapse border border-black mb-10">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black p-3 text-[10px] font-bold uppercase">Time</th>
              <th className="border border-black p-3 text-[10px] font-bold uppercase">Activity</th>
              <th className="border border-black p-3 text-[10px] font-bold uppercase text-right">In (+)</th>
              <th className="border border-black p-3 text-[10px] font-bold uppercase text-right">Out (-)</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr key={tx.id}>
                <td className="border border-black p-3 text-xs font-bold">{tx.time}</td>
                <td className="border border-black p-3">
                  <p className="text-xs font-black uppercase">{tx.category}</p>
                  <p className="text-[9px] font-bold text-gray-500 uppercase">{tx.description}</p>
                </td>
                <td className="border border-black p-3 text-right text-xs font-bold">
                  {tx.type === 'INCOME' ? `${currency}${tx.amount.toLocaleString()}` : ''}
                </td>
                <td className="border border-black p-3 text-right text-xs font-bold">
                  {tx.type === 'EXPENSE' ? `${currency}${tx.amount.toLocaleString()}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between mt-20">
          <div className="text-center w-64 border-t border-black pt-4">
            <p className="text-[10px] font-bold uppercase">Manager Signature</p>
          </div>
          <div className="text-center w-64 border-t border-black pt-4">
            <p className="text-[10px] font-bold uppercase">Auditor Signature</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyLedgerDetail;
