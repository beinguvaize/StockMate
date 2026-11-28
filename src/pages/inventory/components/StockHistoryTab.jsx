import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { History, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatShortDateTime } from '../../../lib/utils';
import { FilterPills } from '../../../components/ui/Tabs';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { classifyMovement, filterMovements, MOVEMENT_LABEL, MOVEMENT_TONE } from '../../../lib/inventoryView';
import { ProductAvatar } from './parts';

const LIMIT = 500;

/**
 * Stock history (approved inventory-14): the shop's latest 500 stock
 * movements, newest first, searchable by product or reason and filterable by
 * kind. Read only; the same movement_log read as before.
 */
export default function StockHistoryTab({ tenantId, products }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const load = useCallback(() => {
    if (!tenantId) { setLoading(false); return () => {}; }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    supabase
      .from('movement_log')
      .select('*')
      .is('deleted_at', null)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(LIMIT)
      .then(({ data, error }) => {
        if (cancelled) return;
        // A failed read used to show "No movements found", which reads as a
        // shop with no history rather than a list that did not load.
        if (error) setLoadError(error);
        else setLog(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantId]);
  useEffect(() => load(), [load]);

  const byId = useMemo(() => new Map((products || []).map(p => [p.id, p])), [products]);
  const nameOf = useCallback((id) => byId.get(id)?.name || '', [byId]);
  const filtered = useMemo(() => filterMovements(log, { query: search, type: typeFilter, nameOf }), [log, search, typeFilter, nameOf]);

  return (
    <div className="flex flex-col">
      <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 1 }}>
        <div className="relative w-full sm:w-[280px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" size={16} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Search product or reason" placeholder="Search product or reason"
            className="h-9 w-full rounded-pill bg-well pl-10 pr-4 text-[13px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
        </div>
        <FilterPills ariaLabel="Kind of movement" value={typeFilter} onChange={setTypeFilter}
          items={[
            { key: 'ALL', label: 'All' }, { key: 'IN', label: 'Stock in' }, { key: 'OUT', label: 'Stock out' },
            { key: 'ADJUST', label: 'Adjustment' }, { key: 'TRANSFER', label: 'Transfer' },
          ]} />
        <span className="flex-1" />
        <span className="text-[13px] text-mute">{LIMIT} latest movements</span>
      </div>

      {loadError ? (
        <div role="alert" className="m-rise rounded-[14px] bg-bad-soft px-5 py-8 text-center text-[13px] text-bad-text">
          <b className="mb-1 block font-tight text-[14px] font-semibold">Stock history did not load</b>
          <span className="block break-words">{String(loadError.message || loadError)}</span>
          <Button variant="secondary" size="sm" className="mt-3 bg-surface" onClick={load}>Try again</Button>
        </div>
      ) : loading ? (
        <div className="m-rise py-16 text-center text-[13px] text-mute">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="m-rise rounded-[14px] px-5 py-[54px] text-center shadow-[inset_0_0_0_1px_var(--color-line)]">
          <span className="mx-auto mb-3.5 grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-tile text-mute"><History size={22} strokeWidth={1.7} /></span>
          <b className="block font-tight text-[15px] font-semibold text-ink">No movements found</b>
          <p className="mt-1 text-[13px] text-body">Stock adjustments and sales will appear here</p>
        </div>
      ) : (
        <div className="m-rise relative w-full overflow-x-auto" style={{ '--i': 2 }}>
          <table className="w-full border-collapse text-[13.5px] text-ink">
            <thead>
              <tr className="[&>th]:px-3.5 [&>th]:py-2.5 [&>th]:text-left [&>th]:font-tight [&>th]:text-[12px] [&>th]:font-semibold [&>th]:text-mute [&>th]:border-b [&>th]:border-line">
                <th>Date</th><th>Product</th><th>Reason</th><th>Type</th><th className="!text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const kind = classifyMovement(row);
                const product = byId.get(row.product_id);
                const name = row.product_name || product?.name || row.product_id || '—';
                const qty = Number(row.quantity) || 0;
                const isOut = (row.type || '').toUpperCase() === 'OUT';
                return (
                  <tr key={row.id} className="[&>td]:px-3.5 [&>td]:py-2.5 [&>td]:border-b [&>td]:border-sep hover:[&>td]:bg-tile">
                    <td className="whitespace-nowrap text-ink-2 tabular-nums">{formatShortDateTime(row.created_at || row.date) || '—'}</td>
                    <td>
                      <div className="flex min-w-0 items-center gap-[11px]">
                        <ProductAvatar product={product || { name, category: '' }} name={name} />
                        <b className="truncate font-tight text-[13.5px] font-semibold">{name}</b>
                      </div>
                    </td>
                    <td className="text-body">{row.reason || '—'}</td>
                    <td><Badge tone={MOVEMENT_TONE[kind]}>{MOVEMENT_LABEL[kind]}</Badge></td>
                    <td className={`text-right font-tight font-semibold tabular-nums ${isOut ? 'text-bad-text' : 'text-good-text'}`}>
                      {isOut ? '−' : '+'}{Math.abs(qty)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !loadError && log.length > 0 && (
        <div className="m-rise px-1 pt-3.5 text-[13px] text-body tabular-nums">
          {filtered.length.toLocaleString('en-IN')} of {log.length.toLocaleString('en-IN')} movements shown
        </div>
      )}
    </div>
  );
}
