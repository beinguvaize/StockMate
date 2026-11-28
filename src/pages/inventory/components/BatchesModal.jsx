import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import Dialog from '../../../components/ui/Dialog';
import { Badge } from '../../../components/ui/badge';
import { supabase } from '../../../lib/supabase';
import { formatDate, cn } from '../../../lib/utils';
import { Notice } from './parts';

const toNum = (v) => Number(v ?? 0);
const fix2 = (n) => toNum(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * A product's cost batches with the margin each one sells at (approved
 * inventory-09). Read only: batches are made and used up by the database
 * (purchases, adjustments, FIFO), never here.
 *
 * Unreachable before the redesign; it is now opened from a row's menu and
 * from the product panel's Batches tab.
 */
const BatchesModal = ({ isOpen, onClose, product, tenantId, currencySymbol = '₹' }) => {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!isOpen || !product?.id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      let q = supabase
        .from('product_batches')
        .select('id, received_date, unit_cost, qty_received, qty_remaining, supplier_id, purchase_id, note, created_at')
        .eq('product_id', product.id);
      // Every tenant-table read carries the tenant (CLAUDE.md): a global
      // admin is entitled to every tenant's rows, and RLS is not the filter.
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data, error } = await q
        .order('received_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error('[BatchesModal] fetch failed', error);
        setBatches([]);
        setLoadError(error);
      } else {
        setBatches(data || []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, product?.id, tenantId]);

  const sellPrice = toNum(product?.sellingPrice);
  const openBatches = batches.filter(b => toNum(b.qty_remaining) > 0);
  const totalOpenQty = openBatches.reduce((a, b) => a + toNum(b.qty_remaining), 0);
  const totalOpenValue = openBatches.reduce((a, b) => a + toNum(b.qty_remaining) * toNum(b.unit_cost), 0);
  const wAvg = totalOpenQty > 0 ? totalOpenValue / totalOpenQty : 0;
  const lossRiskBatches = openBatches.filter(b => toNum(b.unit_cost) > sellPrice && sellPrice > 0);
  const unit = (product?.unit || 'pcs').toUpperCase();

  return (
    <Dialog open={isOpen} onClose={onClose} width={720}
      title={product ? `${product.name}, Batches` : 'Batches'}
      subtitle="Oldest batch is sold first (FIFO)">
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Open batches" value={openBatches.length} />
        <Stat label="Total quantity" value={`${fix2(totalOpenQty)} ${unit}`} />
        <Stat label="Weighted average cost" value={`${currencySymbol}${fix2(wAvg)}`} />
      </div>

      {lossRiskBatches.length > 0 && (
        <Notice tone="r" className="mb-3" title="Selling below cost, loss risk">
          {lossRiskBatches.length} {lossRiskBatches.length > 1 ? 'batches cost' : 'batch costs'} more than the selling price ({currencySymbol}{fix2(sellPrice)}).
          {' '}{lossRiskBatches.length > 1 ? 'They are' : 'It is'} sold first, so every sale of {lossRiskBatches.length > 1 ? 'them' : 'it'} makes a loss.
        </Notice>
      )}

      {loadError ? (
        <div role="alert" className="rounded-xl bg-bad-soft px-3.5 py-3 text-[12.5px] text-bad-text">
          <b className="block font-tight font-semibold">Batches did not load</b>
          <span className="block break-words">{String(loadError.message || loadError)}</span>
        </div>
      ) : loading ? (
        <div className="py-12 text-center text-[13px] text-mute">Loading batches…</div>
      ) : batches.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-body">
          <Layers size={28} className="mx-auto mb-2 text-faint" />
          <b className="block font-tight font-semibold text-ink">No batches yet</b>
          <span className="mt-1 block text-[12px] text-mute">Batches are made by purchases. Stock from before them is costed at the saved cost until the next purchase.</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="[&>th]:bg-tile [&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-tight [&>th]:text-[11.5px] [&>th]:font-semibold [&>th]:text-mute">
                <th className="rounded-l-lg">Received</th>
                <th className="!text-right">Unit cost</th>
                <th className="!text-right">Qty received</th>
                <th className="!text-right">Left</th>
                <th className="!text-right">Value</th>
                <th className="!text-right">Margin</th>
                <th className="rounded-r-lg">Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const remaining = toNum(b.qty_remaining);
                const received = toNum(b.qty_received);
                const cost = toNum(b.unit_cost);
                const depleted = remaining === 0;
                const pct = received > 0 ? (remaining / received) * 100 : 0;
                const margin = sellPrice > 0 ? ((sellPrice - cost) / sellPrice) * 100 : null;
                const isLoss = margin !== null && margin < 0;
                const marginCls = isLoss ? 'text-bad-text' : (margin !== null && margin < 20) ? 'text-amber-text' : 'text-good-text';
                return (
                  <tr key={b.id} className={cn('[&>td]:px-3 [&>td]:py-2.5 [&>td]:border-b [&>td]:border-sep tabular-nums',
                    depleted && '[&>td]:text-faint', isLoss && !depleted && '[&>td]:bg-[#FFF7F7]')}>
                    <td className="whitespace-nowrap">{formatDate(b.received_date)}</td>
                    <td className={cn('text-right font-tight', isLoss && !depleted && '!text-bad-text')}>{currencySymbol}{fix2(cost)}</td>
                    <td className="text-right font-tight">{fix2(received)}</td>
                    <td className="text-right font-tight font-semibold">{fix2(remaining)}</td>
                    <td className="text-right font-tight">{currencySymbol}{fix2(remaining * cost)}</td>
                    <td className={cn('text-right font-tight font-semibold', !depleted && marginCls)}>
                      {margin !== null ? `${margin < 0 ? '−' : ''}${Math.abs(margin).toFixed(1)}%` : '—'}
                    </td>
                    <td>
                      {depleted ? <Badge tone="neutral">Used up</Badge>
                        : pct < 25 ? <Badge tone="warn">Low</Badge>
                        : <Badge tone="good">Open</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
};

const Stat = ({ label, value }) => (
  <div className="rounded-[10px] bg-tile px-3 py-[9px]">
    <span className="block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">{label}</span>
    <b className="mt-px block font-tight text-[13.5px] font-semibold tabular-nums">{value}</b>
  </div>
);

export default BatchesModal;
