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
    <div className="fixed inset-0 z-[180] flex items-start justify-center overflow-y-auto px-4 pt-[18vh] pb-8">
      <div className="m-scrim fixed inset-0 bg-[rgba(17,20,24,0.28)]" onClick={onChange} aria-hidden="true" />
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} data-testid="price-check-dialog"
        className="m-dialog relative w-full max-w-[440px] rounded-[18px] bg-surface text-ink shadow-[0_24px_60px_-20px_rgba(17,20,24,0.45)]">
        <div className="flex items-start gap-3 px-[22px] pt-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber-text">
            <AlertTriangle size={19} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="font-tight text-[18px] font-semibold tracking-[-0.01em]">
              {one ? 'Is this price right?' : 'Are these prices right?'}
            </h2>
            <p className="mt-0.5 text-[13px] text-body">
              {one ? 'It is' : 'They are'} more than {PRICE_CHECK_PCT}% away from the last purchase.
            </p>
          </div>
        </div>

        <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto px-[22px] py-4">
          {flagged.map((f) => (
            <li key={f.key} data-testid="price-check-line" data-direction={f.direction}
              className="rounded-xl bg-tile px-3.5 py-[11px] text-[13px] leading-[1.45] tabular-nums text-ink">
              {priceCheckMessage(f)}
            </li>
          ))}
        </ul>

        <div className="flex gap-2 px-[22px] pb-5">
          <button type="button" onClick={onChange} autoFocus
            className="m-press h-11 rounded-pill bg-well px-5 font-tight text-[13.5px] font-semibold text-ink hover:bg-[#E8E8E7]">
            Change it
          </button>
          <button type="button" onClick={onConfirm} disabled={saving}
            className="m-press h-11 flex-1 rounded-pill bg-amber font-tight text-[13.5px] font-semibold text-white hover:bg-amber-hover disabled:opacity-50">
            {saving ? 'Saving…' : one ? 'Yes, this price is right' : 'Yes, these prices are right'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PriceCheckDialog;
