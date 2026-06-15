import React, { useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { formatCurrency } from '../../../lib/utils';

/**
 * SalesReturnsList — credit notes raised from the Sales return flow.
 * Read-only register so processed returns are visible (the original
 * complaint: returns "weren't doing anything" because nothing showed them).
 */
const SalesReturnsList = ({ returns = [] }) => {
  const [q, setQ] = useState('');

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
      <div className="text-center py-16 bg-white rounded-2xl border border-black/5">
        <RotateCcw size={28} className="mx-auto text-gray-300 mb-3" />
        <div className="text-sm font-bold text-gray-500">No returns yet</div>
        <div className="text-xs font-medium text-gray-400 mt-1">
          Processed sales returns (credit notes) appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search returns…"
            className="w-full bg-white border border-black/8 rounded-lg pl-9 pr-3 py-2 text-xs font-semibold outline-none focus:border-black/20"
          />
        </div>
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg">
          <span className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">Total Returned</span>
          <span className="text-sm font-black text-rose-600">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-black/5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-3">Credit Note</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3 text-center">Items</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-black/5 last:border-0 hover:bg-canvas/50">
                <td className="px-4 py-3 text-xs font-black text-ink-primary">
                  #{String(r.id).split('-').pop()}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-gray-500">{r.date || '—'}</td>
                <td className="px-4 py-3 text-xs font-semibold text-gray-700">{r.client_name || 'Walk-in'}</td>
                <td className="px-4 py-3 text-xs font-semibold text-gray-500 text-center">{itemCount(r)}</td>
                <td className="px-4 py-3 text-xs font-medium text-gray-400 max-w-[200px] truncate">{r.reason || '—'}</td>
                <td className="px-4 py-3 text-xs font-black text-rose-600 text-right">{formatCurrency(r.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesReturnsList;
