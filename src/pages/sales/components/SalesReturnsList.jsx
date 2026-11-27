import React, { useMemo, useState } from 'react';
import { RotateCcw, Search, Undo2, ChevronRight } from 'lucide-react';
import { formatCurrency, formatShortDateTime } from '../../../lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/table';
import { Button } from '../../../components/ui/button';

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
      <div className="m-rise text-center py-16 rounded-[14px] border border-line">
        <RotateCcw size={26} className="mx-auto text-faint mb-3" />
        <div className="font-tight text-[14px] font-semibold text-ink">No returns yet</div>
        <div className="text-[12.5px] text-body mt-1">
          Processed sales returns (credit notes) appear here.
        </div>
      </div>
    );
  }

  const cols = onReverse ? 7 : 6;

  return (
    <div>
      <div className="m-rise flex items-center gap-3 flex-wrap mb-3" style={{ '--i': 1 }}>
        <div className="relative w-full sm:w-[280px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mute pointer-events-none" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search returns"
            placeholder="Search returns"
            className="w-full h-9 rounded-pill bg-well pl-10 pr-4 text-[13px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]"
          />
        </div>
        <div className="flex-1" />
        <span className="text-[13px] text-body">Total returned</span>
        <b className="font-tight text-[20px] font-semibold text-ink tabular-nums">{formatCurrency(total)}</b>
      </div>

      <div className="m-rise" style={{ '--i': 2 }}>
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Credit note</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead numeric>Items</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead numeric>Amount</TableHead>
              {onReverse && <TableHead numeric>Undo</TableHead>}
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map(r => {
            const open = openId === r.id;
            const lines = Array.isArray(r.items) ? r.items : [];
            return (
              <React.Fragment key={r.id}>
              <TableRow
                onClick={() => setOpenId(open ? null : r.id)}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpenId(open ? null : r.id); } }}
                tabIndex={0}
                aria-expanded={open}
                data-state={open ? 'selected' : undefined}
                className="cursor-pointer"
              >
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 font-tight text-[13.5px] font-semibold text-ink">
                    <ChevronRight size={14} data-open={open} className="chevron-turn text-mute" aria-hidden="true" />
                    #{String(r.id).split('-').pop()}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-ink-2">{formatShortDateTime(r.date) || r.date || '—'}</TableCell>
                <TableCell>{r.client_name || 'Walk-in'}</TableCell>
                <TableCell numeric>{itemCount(r)}</TableCell>
                <TableCell className="max-w-[220px] truncate text-ink-2">{r.reason || '—'}</TableCell>
                <TableCell numeric>{formatCurrency(r.total_amount)}</TableCell>
                {onReverse && (
                  <TableCell numeric>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={(e) => { e.stopPropagation(); reverse(r); }}
                      disabled={busyId === r.id}
                      title="Undo return, re-deducts stock and restores the balance"
                    >
                      <Undo2 /> {busyId === r.id ? 'Undoing' : 'Undo'}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
              {open && (
                <tr>
                  <td colSpan={cols} className="bg-tile px-3.5 py-3 border-b border-sep">
                    <div className="grid gap-x-6 gap-y-3 md:grid-cols-[220px_1fr]">
                      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px] self-start">
                        <dt className="text-mute">Credit note</dt><dd className="m-0 font-medium">#{String(r.id).split('-').pop()}</dd>
                        {r.sale_id && <><dt className="text-mute">Against sale</dt><dd className="m-0 font-medium">#{String(r.sale_id).split('-').pop()}</dd></>}
                        {r.invoice_id && <><dt className="text-mute">Invoice</dt><dd className="m-0 font-medium">#{String(r.invoice_id).split('-').pop()}</dd></>}
                        <dt className="text-mute">Date</dt><dd className="m-0 font-medium">{formatShortDateTime(r.date) || r.date || '—'}</dd>
                        {r.reason && <><dt className="text-mute">Reason</dt><dd className="m-0 font-medium">{r.reason}</dd></>}
                      </dl>
                      {lines.length === 0 ? (
                        <div className="text-[12.5px] text-body">No line detail stored on this return.</div>
                      ) : (
                        <table className="w-full border-collapse text-[13px]">
                          <thead>
                            <tr className="font-tight text-[11.5px] font-semibold text-mute">
                              <th className="text-left px-2.5 py-1.5">Item</th>
                              <th className="text-right px-2.5 py-1.5">Qty returned</th>
                              <th className="text-right px-2.5 py-1.5">Rate</th>
                              <th className="text-right px-2.5 py-1.5">Line total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((it, i) => {
                              const qty = Number(it.quantity) || 0;
                              const rate = Number(it.rate ?? it.price ?? 0);
                              return (
                                <tr key={(it.id || i) + '-' + i}>
                                  <td className="px-2.5 py-[7px] text-ink">{it.name || it.productName || 'Item'}</td>
                                  <td className="px-2.5 py-[7px] text-right font-tight font-medium tabular-nums">{qty}</td>
                                  <td className="px-2.5 py-[7px] text-right font-tight font-medium tabular-nums">{formatCurrency(rate)}</td>
                                  <td className="px-2.5 py-[7px] text-right font-tight font-medium tabular-nums">{formatCurrency(qty * rate)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="m-rise px-1 pt-3.5 text-[13px] text-body" style={{ '--i': 3 }}>
        {rows.length} {rows.length === 1 ? 'return' : 'returns'} shown · click a row for its items
      </div>
    </div>
  );
};

export default SalesReturnsList;
