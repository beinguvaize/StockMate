import React, { useMemo, useState } from 'react';
import { Search, CreditCard, Download, Wallet, Smartphone, Landmark, TrendingUp, Users, Calendar } from 'lucide-react';
import { formatDate, formatCurrency } from '../../lib/utils';

const METHOD_ICON = { CASH: Wallet, CARD: CreditCard, UPI: Smartphone, BANK: Landmark, CHEQUE: Landmark };
const METHOD_LABEL = { CASH: 'Cash', CARD: 'Card', UPI: 'UPI', BANK: 'Bank Transfer', CHEQUE: 'Cheque' };
const METHOD_COLOR = {
  CASH:   'bg-emerald-50 text-emerald-700 border-emerald-100',
  CARD:   'bg-blue-50   text-blue-700   border-blue-100',
  UPI:    'bg-purple-50 text-purple-700 border-purple-100',
  BANK:   'bg-sky-50    text-sky-700    border-sky-100',
  CHEQUE: 'bg-accent-signature/10  text-accent-signature-hover  border-accent-signature/15',
};

const ClientPayments = ({ clientPayments, clients, businessProfile }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const sym = businessProfile?.currencySymbol || '₹';

  const enriched = useMemo(() => {
    return (clientPayments || []).map(p => {
      const client = (clients || []).find(c => String(c.id) === String(p.client_id));
      return { ...p, client_name: client?.name || 'Unknown Client' };
    });
  }, [clientPayments, clients]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return enriched.filter(p =>
      (p.client_name || '').toLowerCase().includes(q) ||
      (p.notes || '').toLowerCase().includes(q) ||
      (METHOD_LABEL[p.payment_method] || '').toLowerCase().includes(q)
    );
  }, [enriched, searchTerm]);

  const totalCollected = enriched.reduce((s, p) => s + Number(p.amount), 0);
  const uniqueClients  = new Set(enriched.map(p => p.client_id)).size;

  const exportCSV = () => {
    const rows = [
      ['Date', 'Client', 'Method', 'Amount', 'Notes', 'Recorded At'],
      ...filtered.map(p => [
        p.date,
        p.client_name,
        METHOD_LABEL[p.payment_method] || p.payment_method,
        p.amount,
        p.notes || '',
        p.created_at ? new Date(p.created_at).toLocaleString() : '',
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'payment-history.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Collected', value: `${sym}${Math.round(totalCollected).toLocaleString()}`, icon: <TrendingUp size={32} strokeWidth={1.5} />, color: 'text-emerald-500' },
          { label: 'Transactions',    value: enriched.length,                                         icon: <CreditCard size={32} strokeWidth={1.5} />,  color: 'text-accent-signature' },
          { label: 'Clients Paid',    value: uniqueClients,                                           icon: <Users size={32} strokeWidth={1.5} />,        color: 'text-blue-400' },
        ].map((m, i) => (
          <div key={i} className="bg-white rounded-[1.5rem] border border-black/5 shadow-sm p-5 flex flex-col justify-center relative overflow-hidden group hover:border-black/10 transition-all">
            <div className={`absolute top-4 right-4 opacity-[0.07] group-hover:opacity-[0.13] transition-opacity pointer-events-none ${m.color}`}>{m.icon}</div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">{m.label}</span>
            <div className="text-2xl font-black text-ink-primary tabular-nums">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between bg-white border border-black/5 rounded-[2rem] shadow-sm p-2 gap-2">
        <div className="relative group flex-1 max-w-xs ml-2">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by client, method, notes…"
            className="w-full h-11 pl-9 pr-4 rounded-pill bg-white border border-border shadow-sm text-xs font-bold text-ink-primary placeholder:text-muted-foreground outline-none focus:border-black/20 focus:bg-white transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          onClick={exportCSV}
          className="btn-signature h-11 !rounded-pill !pl-5 !pr-2 flex items-center gap-3 shrink-0"
        >
          <span className="text-xs font-bold tracking-wide">EXPORT CSV</span>
          <div className="w-8 h-8 rounded-full bg-ink-primary flex items-center justify-center">
            <Download size={14} className="text-accent-signature" />
          </div>
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[2rem] border border-black/5 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-24 text-center">
            <CreditCard size={48} className="mx-auto mb-4 opacity-10" strokeWidth={1} />
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">No Payments Logged</p>
            <p className="text-xs text-muted-foreground mt-1">Record a client payment from the Settle Account page.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas/60 border-b border-black/5">
                  <th className="py-3.5 px-5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Date</th>
                  <th className="py-3.5 px-5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Client</th>
                  <th className="py-3.5 px-5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Method</th>
                  <th className="py-3.5 px-5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Notes</th>
                  <th className="py-3.5 px-5 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.map(p => {
                  const Icon = METHOD_ICON[p.payment_method] || Wallet;
                  const badge = METHOD_COLOR[p.payment_method] || 'bg-muted text-ink-secondary border-border';
                  return (
                    <tr key={p.id} className="hover:bg-canvas/50 transition-colors group">
                      <td className="py-4 px-5">
                        <div className="text-sm font-semibold text-ink-primary">{formatDate(p.date)}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {p.created_at ? new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-accent-signature/10 border border-accent-signature/20 flex items-center justify-center text-xs font-black text-ink-primary shrink-0">
                            {p.client_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-bold text-ink-primary">{p.client_name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${badge}`}>
                          <Icon size={10} />
                          {METHOD_LABEL[p.payment_method] || p.payment_method}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-xs text-muted-foreground max-w-[200px] truncate">{p.notes || '—'}</td>
                      <td className="py-4 px-5 text-right">
                        <span className="text-sm font-black text-emerald-600 tabular-nums">{formatCurrency(p.amount)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-black/10 bg-canvas/30">
                <tr>
                  <td colSpan="4" className="py-3 px-5 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    {filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'}
                  </td>
                  <td className="py-3 px-5 text-right">
                    <span className="text-sm font-black text-emerald-600 tabular-nums">
                      {formatCurrency(filtered.reduce((s, p) => s + Number(p.amount), 0))}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientPayments;
