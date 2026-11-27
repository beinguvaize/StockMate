import React, { useState, useMemo } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { formatCurrency, todayISOInAppTZ } from '../../../lib/utils';

/**
 * SalesReturnForm — accepts a sale record and lets user pick
 * which items to return + how many.
 */
const SalesReturnForm = ({ sale, clients, products = [], onSave, loading, onCancel = null }) => {
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

  // The stepper's − and + move a line by one, between nothing and what was
  // sold; the box between them still takes any figure (a part kilo).
  const stepQty = (idx, delta) => {
    setReturnItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const cur = parseFloat(it.returnQty) || 0;
      const next = Math.min(it.maxQty, Math.max(0, cur + delta));
      return { ...it, returnQty: next === 0 ? '' : String(next) };
    }));
  };

  if (!sale || items.length === 0) {
    return (
      <div className="text-center py-8 text-[13px] text-body">
        No line items found on this sale.
        {onCancel && (
          <div className="mt-4"><Button variant="secondary" onClick={onCancel}>Close</Button></div>
        )}
      </div>
    );
  }

  const label = 'block mb-1.5 font-tight text-[12.5px] font-semibold text-ink-2';
  const fieldCls = 'w-full h-9 rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-(--dur-press) placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]';

  return (
    <form onSubmit={handleSubmit}>
      {/* Sale context */}
      <div className="flex items-center gap-3 rounded-xl bg-tile px-3 py-2.5 mb-3">
        <div className="min-w-0">
          <span className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Original sale</span>
          <b className="block font-tight text-[13.5px] font-semibold text-ink truncate">
            #{sale.id?.split('-').pop()}{client ? ` · ${client.name}` : ''}
          </b>
        </div>
        <span className="ml-auto font-tight font-semibold tabular-nums">{formatCurrency(sale.totalAmount ?? sale.total_amount)}</span>
      </div>

      {/* Items */}
      <span className={label}>Choose what comes back</span>
      <div>
        {returnItems.map((it, idx) => {
          const q = parseFloat(it.returnQty);
          const lineVal = q > 0 ? q * it.rate : 0;
          return (
            <div key={it.id || idx} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2.5 border-t border-sep first:border-t-0">
              <div className="min-w-0">
                <b className="block font-tight text-[13.5px] font-semibold text-ink truncate">{it.name}</b>
                <small className="text-[12px] text-mute tabular-nums">Sold {it.maxQty} at {formatCurrency(it.rate)}</small>
              </div>
              <div className="flex items-center rounded-pill bg-well h-7 focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
                <button type="button" onClick={() => stepQty(idx, -1)} aria-label={`One less ${it.name}`}
                  className="m-press grid place-items-center w-7 h-7 rounded-xl text-ink-2 hover:bg-[#E8E8E7]"><Minus size={13} /></button>
                <input
                  type="number"
                  min="0"
                  max={it.maxQty}
                  step="any"
                  placeholder="0"
                  aria-label={`Quantity of ${it.name} to return`}
                  className="w-11 h-7 bg-transparent text-center font-tight text-[13px] font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={it.returnQty}
                  onChange={e => setQty(idx, e.target.value)}
                />
                <button type="button" onClick={() => stepQty(idx, 1)} aria-label={`One more ${it.name}`}
                  className="m-press grid place-items-center w-7 h-7 rounded-xl text-ink-2 hover:bg-[#E8E8E7]"><Plus size={13} /></button>
              </div>
              <span className={`min-w-[64px] text-right font-tight font-semibold tabular-nums ${lineVal > 0 ? 'text-ink' : 'text-faint'}`}>
                {formatCurrency(lineVal)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-1.5 pt-3 border-t border-line font-tight text-[14px] font-semibold">
        <span>Total return value</span>
        <span className="tabular-nums">{formatCurrency(returnTotal)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3.5">
        <div>
          <label htmlFor="ret-date" className={label}>Date</label>
          <input
            id="ret-date"
            required
            type="date"
            className={fieldCls}
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="ret-reason" className={label}>Reason</label>
          <input
            id="ret-reason"
            type="text"
            className={fieldCls}
            placeholder="Damaged, wrong item"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 mt-5 [&>*]:flex-1">
        {onCancel && <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>}
        <Button
          type="submit"
          disabled={loading || returnTotal <= 0}
        >
          {loading ? 'Processing' : `Process return${returnTotal > 0 ? ' · ' + formatCurrency(returnTotal) : ''}`}
        </Button>
      </div>
    </form>
  );
};

export default SalesReturnForm;
