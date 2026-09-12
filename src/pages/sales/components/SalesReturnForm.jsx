import React, { useState, useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import Button from '../../../shared/Button';
import { formatCurrency, todayISOInAppTZ } from '../../../lib/utils';

/**
 * SalesReturnForm — accepts a sale record and lets user pick
 * which items to return + how many.
 */
const SalesReturnForm = ({ sale, clients, products = [], onSave, loading }) => {
  const items = useMemo(() => {
    if (!sale) return [];
    const raw = sale.items || [];

    // Total qty across all items — used to distribute sale.totalAmount proportionally
    // when per-item rate was not stored (legacy sales pre-fix).
    const totalQty = raw.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const saleTotal = Number(sale.totalAmount ?? sale.total_amount ?? 0);

    return raw.map(it => {
      const pid = it.productId || it.id;
      const storedRate = Number(it.rate ?? it.price ?? it.unitPrice ?? 0);
      const qty = Number(it.quantity) || 0;

      // Derive rate from actual sale amount (proportional by qty share)
      const derivedRate = (storedRate > 0)
        ? storedRate
        : (totalQty > 0 ? (saleTotal * (qty / totalQty)) / qty : 0);

      return {
        id:       pid,
        name:     it.name || it.productName || 'Item',
        maxQty:   qty,
        rate:     Math.round(derivedRate * 100) / 100,
        returnQty: 0,
      };
    });
  }, [sale]);

  const [returnItems, setReturnItems] = useState(
    () => items.map(it => ({ ...it, returnQty: '' }))
  );
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(todayISOInAppTZ());

  const client = clients?.find(c => c.id === sale?.clientId || c.id === sale?.client_id);

  const setQty = (idx, val) => {
    setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, returnQty: val } : it));
  };

  const returnTotal = useMemo(() => {
    return returnItems.reduce((sum, it) => {
      const q = parseFloat(it.returnQty);
      if (isNaN(q) || q <= 0) return sum;
      return sum + q * it.rate;
    }, 0);
  }, [returnItems]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const selected = returnItems.filter(it => {
      const q = parseFloat(it.returnQty);
      return !isNaN(q) && q > 0;
    });
    if (selected.length === 0) {
      alert('Enter return quantity for at least one item.');
      return;
    }
    for (const it of selected) {
      const q = parseFloat(it.returnQty);
      if (q > it.maxQty) {
        alert(`${it.name}: return qty (${q}) exceeds sold qty (${it.maxQty})`);
        return;
      }
    }

    const payload = {
      sale_id:      sale.id,
      invoice_id:   sale.invoiceId || sale.invoice_id || null,
      client_id:    sale.clientId || sale.client_id || null,
      client_name:  client?.name || sale.clientName || null,
      items:        selected.map(it => ({
        id:       it.id,
        name:     it.name,
        quantity: parseFloat(it.returnQty),
        rate:     it.rate,
      })),
      total_amount: Math.round(returnTotal * 100) / 100,
      reason,
      date,
    };
    onSave(payload);
  };

  if (!sale || items.length === 0) {
    return (
      <div className="text-center py-8 text-sm font-semibold text-muted-foreground">
        No line items found on this sale.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Sale context */}
      <div className="bg-canvas rounded-2xl p-4 space-y-1">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Original Sale</div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-foreground">#{sale.id?.split('-').pop()}</span>
          {client && <span className="text-xs font-semibold text-muted-foreground">{client.name}</span>}
          <span className="text-xs font-semibold text-muted-foreground">{formatCurrency(sale.totalAmount ?? sale.total_amount)}</span>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Select Items to Return</div>
        {returnItems.map((it, idx) => (
          <div key={it.id || idx} className="flex items-center gap-3 p-3 bg-canvas rounded-xl border border-border/60">
            <div className="flex-1">
              <div className="text-xs font-semibold text-foreground">{it.name}</div>
              <div className="text-[10px] font-semibold text-muted-foreground">
                Sold: {it.maxQty} · {formatCurrency(it.rate)} each
              </div>
            </div>
            <div className="w-24">
              <input
                type="number"
                min="0"
                max={it.maxQty}
                step="any"
                placeholder="0"
                className="w-full bg-card border border-border rounded-lg p-2 text-xs font-semibold text-center outline-none focus:ring-2 focus:ring-accent-signature/20"
                value={it.returnQty}
                onChange={e => setQty(idx, e.target.value)}
              />
            </div>
            {parseFloat(it.returnQty) > 0 && (
              <div className="text-xs font-semibold text-rose-600 w-20 text-right">
                {formatCurrency(parseFloat(it.returnQty) * it.rate)}
              </div>
            )}
          </div>
        ))}
      </div>

      {returnTotal > 0 && (
        <div className="flex justify-between items-center px-3 py-2 bg-rose-50 rounded-xl border border-rose-100">
          <span className="text-xs font-semibold text-rose-600">Total Return Value</span>
          <span className="text-sm font-semibold text-rose-600">{formatCurrency(returnTotal)}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Date</label>
          <input
            required
            type="date"
            className="w-full bg-card border border-border shadow-sm rounded-xl p-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Reason</label>
          <input
            type="text"
            className="w-full bg-card border border-border shadow-sm rounded-xl p-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20"
            placeholder="Damaged, wrong item..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={loading || returnTotal <= 0}
        className="w-full !rounded-xl !h-12 shadow-xl !bg-rose-600 hover:!bg-rose-700"
        icon={RotateCcw}
      >
        {loading ? 'Processing...' : `Process Return ${returnTotal > 0 ? '· ' + formatCurrency(returnTotal) : ''}`}
      </Button>
    </form>
  );
};

export default SalesReturnForm;
