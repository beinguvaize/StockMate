import React, { useMemo, useState } from 'react';
import { RotateCcw, Search, Undo2, ChevronRight, ChevronDown } from 'lucide-react';
import { formatCurrency } from '../../../lib/utils';

/**
 * SalesReturnsList — credit notes raised from the Sales return flow.
 * Read-only register so processed returns are visible (the original
 * complaint: returns "weren't doing anything" because nothing showed them).
 */
const SalesReturnsList = ({ returns = [], onReverse = null }) => {
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [openId, setOpenId] = useState(null);

  const reverse = async (r) => {
    if (!onReverse) return;
    if (!window.confirm(
      `Undo return #${String(r.id).split('-').pop()} for ${formatCurrency(r.total_amount)}?\n\n` +
      `Stock will be re-deducted and the customer balance restored. The original sale becomes editable again.`
    )) return;
    setBusyId(r.id);
    await onReverse(r.id);
    setBusyId(null);
  };

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = [...returns].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!term) return list;
    return list.filter(r =>
      `${r.id} ${r.client_name || ''} ${r.reason || ''}`.toLowerCase().includes(term)
    );
  }, [returns, q]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
    [rows]
  );

  const itemCount = (r) => (Array.isArray(r.items) ? r.items.length : 0);

  if (!returns.length) {
    return (
      <div className="text-center py-16 bg-card rounded-2xl border border-border/60">
        <RotateCcw size={28} className="mx-auto text-muted-foreground mb-3" />
        <div className="text-sm font-semibold text-muted-foreground">No returns yet</div>
        <div className="text-xs font-medium text-muted-foreground mt-1">
          Processed sales returns (credit notes) appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search returns…"
            className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-xs font-semibold outline-none focus:border-black/20"
          />
        </div>
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg">
          <span className="text-[11px] font-semibold text-rose-500 uppercase tracking-wider">Total Returned</span>
          <span className="text-sm font-semibold text-rose-600">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border/60 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="w-8 px-2 py-3" />
              <th className="px-4 py-3">Credit Note</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3 text-center">Items</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3 text-right">Amount</th>
              {onReverse && <th className="px-4 py-3 text-right">Undo</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
            const open = openId === r.id;
            const lines = Array.isArray(r.items) ? r.items : [];
            return (
              <React.Fragment key={r.id}>
              <tr
                onClick={() => setOpenId(open ? null : r.id)}
                className="border-b border-border/60 last:border-0 hover:bg-canvas/50 cursor-pointer"
              >
                <td className="px-2 py-3 text-muted-foreground">
                  {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-foreground">
                  #{String(r.id).split('-').pop()}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-muted-foreground">{r.date || '—'}</td>
                <td className="px-4 py-3 text-xs font-semibold text-gray-700">{r.client_name || 'Walk-in'}</td>
                <td className="px-4 py-3 text-xs font-semibold text-muted-foreground text-center">{itemCount(r)}</td>
                <td className="px-4 py-3 text-xs font-medium text-muted-foreground max-w-[200px] truncate">{r.reason || '—'}</td>
                <td className="px-4 py-3 text-xs font-semibold text-rose-600 text-right">{formatCurrency(r.total_amount)}</td>
                {onReverse && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); reverse(r); }}
                      disabled={busyId === r.id}
                      title="Undo return — re-deducts stock, restores balance"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                    >
                      <Undo2 size={13} /> {busyId === r.id ? 'Undoing…' : 'Undo'}
                    </button>
                  </td>
                )}
              </tr>
              {open && (
                <tr className="border-b border-border/60 bg-canvas/40">
                  <td />
                  <td colSpan={onReverse ? 7 : 6} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-2 text-[11px] font-semibold text-muted-foreground">
                      <span>Credit Note <span className="text-foreground font-semibold">#{String(r.id).split('-').pop()}</span></span>
                      {r.sale_id && <span>Against sale <span className="text-foreground font-semibold">#{String(r.sale_id).split('-').pop()}</span></span>}
                      {r.invoice_id && <span>Invoice <span className="text-foreground font-semibold">#{String(r.invoice_id).split('-').pop()}</span></span>}
                      <span>Date <span className="text-foreground font-semibold">{r.date || '—'}</span></span>
                      {r.reason && <span>Reason <span className="text-foreground font-semibold">{r.reason}</span></span>}
                    </div>
                    {lines.length === 0 ? (
                      <div className="text-[11px] font-medium text-muted-foreground">No line detail stored on this return.</div>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <th className="text-left py-1">Item</th>
                            <th className="text-center py-1">Qty Returned</th>
                            <th className="text-right py-1">Rate</th>
                            <th className="text-right py-1">Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((it, i) => {
                            const qty = Number(it.quantity) || 0;
                            const rate = Number(it.rate ?? it.price ?? 0);
                            return (
                              <tr key={(it.id || i) + '-' + i} className="text-xs">
                                <td className="py-1 font-semibold text-foreground">{it.name || it.productName || 'Item'}</td>
                                <td className="py-1 text-center font-semibold text-muted-foreground">{qty}</td>
                                <td className="py-1 text-right font-semibold text-muted-foreground">{formatCurrency(rate)}</td>
                                <td className="py-1 text-right font-semibold text-rose-600">{formatCurrency(qty * rate)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
              </React.Fragment>
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesReturnsList;
