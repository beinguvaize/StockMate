import React, { useEffect, useState } from 'react';
import { Layers, Package, TrendingUp } from 'lucide-react';
import Modal from '../../../shared/Modal';
import { supabase } from '../../../lib/supabase';
import { formatDate } from '../../../lib/utils';

const toNum = (v) => Number(v ?? 0);

const BatchesModal = ({ isOpen, onClose, product, currencySymbol = '₹' }) => {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !product?.id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('product_batches')
        .select('id, received_date, unit_cost, qty_received, qty_remaining, supplier_id, purchase_id, note, created_at')
        .eq('product_id', product.id)
        .order('received_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error('[BatchesModal] fetch failed', error);
        setBatches([]);
      } else {
        setBatches(data || []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, product?.id]);

  const openBatches = batches.filter(b => toNum(b.qty_remaining) > 0);
  const totalOpenQty = openBatches.reduce((a, b) => a + toNum(b.qty_remaining), 0);
  const totalOpenValue = openBatches.reduce((a, b) => a + toNum(b.qty_remaining) * toNum(b.unit_cost), 0);
  const wAvg = totalOpenQty > 0 ? totalOpenValue / totalOpenQty : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product ? `${product.name} — Batches` : 'Batches'}
      subtitle="FIFO lots · oldest consumed first"
      maxWidth="max-w-3xl"
    >
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="p-4 rounded-xl bg-canvas border border-black/5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
            <Layers size={12} /> Open Batches
          </div>
          <div className="text-2xl font-black tabular-nums">{openBatches.length}</div>
        </div>
        <div className="p-4 rounded-xl bg-canvas border border-black/5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
            <Package size={12} /> Total Qty
          </div>
          <div className="text-2xl font-black tabular-nums">
            {totalOpenQty.toFixed(2)}
            <span className="text-[10px] font-bold opacity-40 ml-1">{product?.unit || 'pcs'}</span>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-canvas border border-black/5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
            <TrendingUp size={12} /> Wtd Avg Cost
          </div>
          <div className="text-2xl font-black tabular-nums">
            {currencySymbol}{wAvg.toFixed(2)}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm font-semibold opacity-50 animate-pulse">Loading batches...</div>
      ) : batches.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          <Layers size={32} className="mx-auto mb-2 opacity-30" />
          <div className="font-semibold">No batches yet</div>
          <div className="text-xs opacity-70 mt-1">Batches are created automatically on purchase. Pre-existing stock uses legacy cost until next purchase.</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-gray-400 font-bold border-b border-black/5">
                <th className="text-left py-2 px-2">Received</th>
                <th className="text-right py-2 px-2">Unit Cost</th>
                <th className="text-right py-2 px-2">Received Qty</th>
                <th className="text-right py-2 px-2">Remaining</th>
                <th className="text-right py-2 px-2">Value</th>
                <th className="text-center py-2 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const remaining = toNum(b.qty_remaining);
                const received = toNum(b.qty_received);
                const depleted = remaining === 0;
                const pct = received > 0 ? (remaining / received) * 100 : 0;
                return (
                  <tr key={b.id} className={`border-b border-black/5 ${depleted ? 'opacity-40' : ''}`}>
                    <td className="py-3 px-2 font-semibold text-ink-primary">
                      {formatDate(b.received_date)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums font-semibold">
                      {currencySymbol}{toNum(b.unit_cost).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-gray-500">
                      {received.toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums font-bold">
                      {remaining.toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-emerald-600 font-semibold">
                      {currencySymbol}{(remaining * toNum(b.unit_cost)).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-center">
                      {depleted ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Depleted</span>
                      ) : pct < 25 ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Low</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Open</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

export default BatchesModal;
