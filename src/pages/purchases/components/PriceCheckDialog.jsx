import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { PRICE_CHECK_PCT, priceCheckMessage } from '../lib/priceCheck';

/**
 * "Is this price right?" -- asked once before a purchase saves, listing every
 * line more than PRICE_CHECK_PCT away from what the item last cost.
 *
 * It never blocks: "Yes" saves exactly what was typed. "Change it" (and
 * Escape) goes back to the form; the caller puts the cursor on the first
 * flagged line's amount.
 */
const PriceCheckDialog = ({ flagged, onChange, onConfirm, saving }) => {
  useDialogClose(onChange);
  const titleId = useId();
  const one = flagged.length === 1;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onChange} />
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} data-testid="price-check-dialog"
        className="relative w-full max-w-md bg-card rounded-2xl border border-border/60 shadow-2xl p-5 flex flex-col gap-4 animate-fade-in">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 shrink-0 rounded-xl bg-amber-50 text-amber-600 grid place-items-center">
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold text-foreground">
              {one ? 'Is this price right?' : 'Are these prices right?'}
            </h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {one ? 'It is' : 'They are'} more than {PRICE_CHECK_PCT}% away from the last purchase.
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
          {flagged.map((f) => (
            <li key={f.key} data-testid="price-check-line" data-direction={f.direction}
              className="rounded-xl bg-canvas border border-border/60 px-3 py-2.5 text-[12.5px] leading-snug tabular-nums text-foreground">
              {priceCheckMessage(f)}
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <button type="button" onClick={onChange} autoFocus
            className="h-11 px-5 rounded-pill border border-border text-[12.5px] font-semibold text-foreground hover:bg-canvas transition-[background-color,transform] duration-(--dur-press) ease-(--ease-out) active:scale-[0.98]">
            Change it
          </button>
          <button type="button" onClick={onConfirm} disabled={saving}
            className="flex-1 h-11 rounded-pill bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-black transition-[background-color,transform] duration-(--dur-press) ease-(--ease-out) active:scale-[0.98] disabled:opacity-40">
            {saving ? 'Saving…' : 'Yes, these prices are right'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PriceCheckDialog;
