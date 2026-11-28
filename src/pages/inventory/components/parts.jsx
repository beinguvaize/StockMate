import React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { initials, avatarTone } from '../../../lib/inventoryView';

/**
 * Small pieces the Inventory screens share (approved inventory-01…16).
 * Presentation only.
 */

const TONES = {
  1: 'bg-[#F4EADC] text-[#8A5A1F]',
  2: 'bg-[#E7EFE6] text-[#3F6B3A]',
  3: 'bg-[#E8EDF5] text-[#3E5A86]',
  4: 'bg-[#F3E6E6] text-[#8A3B3B]',
  5: 'bg-[#EFEAF4] text-[#5E4A80]',
  6: 'bg-[#F1EFE7] text-[#6B6447]',
};

const SIZES = {
  sm: 'h-[34px] w-[34px] rounded-[9px] text-[11.5px]',
  md: 'h-11 w-11 rounded-xl text-[13px]',
  lg: 'h-[72px] w-[72px] rounded-[14px] text-[18px]',
};

/** The product's photo when it has one, otherwise its initials on a tint keyed by category. */
export function ProductAvatar({ product, name, size = 'sm', className }) {
  const label = name ?? product?.name ?? '';
  const img = product?.image;
  if (img) {
    return <img src={img} alt="" aria-hidden="true" className={cn('shrink-0 object-cover', SIZES[size], className)} />;
  }
  return (
    <span aria-hidden="true"
      className={cn('grid shrink-0 place-items-center font-tight font-semibold tracking-[0.02em]', SIZES[size], TONES[avatarTone(product?.category || label)], className)}>
      {initials(label)}
    </span>
  );
}

/** Square checkbox: white with a grey ring, ink when ticked, a dash when part-ticked. */
export function CheckBox({ checked = false, partial = false, onChange, label, className }) {
  const on = checked || partial;
  return (
    <button type="button" role="checkbox" aria-checked={partial ? 'mixed' : checked} aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange?.(); }}
      className={cn('inline-grid h-[15px] w-[15px] place-items-center rounded-[4px] align-middle transition-colors duration-(--dur-press)',
        on ? 'bg-ink text-white' : 'bg-surface shadow-[inset_0_0_0_1.5px_#C9CDD2] hover:shadow-[inset_0_0_0_1.5px_var(--color-mute)]', className)}>
      {checked && !partial && <Check size={10} strokeWidth={3.5} />}
      {partial && <Minus size={10} strokeWidth={3.5} />}
    </button>
  );
}

/** A soft notice: amber, green, red or neutral. */
export function Notice({ tone = 'n', title, children, className }) {
  const T = {
    a: 'bg-amber-soft text-amber-text',
    g: 'bg-good-soft text-good-text',
    r: 'bg-bad-soft text-bad-text',
    n: 'bg-tile text-body',
  };
  return (
    <div className={cn('rounded-xl px-3.5 py-[11px] text-[12.5px] leading-[1.45]', T[tone], className)}>
      {title && <b className="mb-px block font-tight text-[13px] font-semibold">{title}</b>}
      {children}
    </div>
  );
}

export const Label = ({ htmlFor, className, children }) => (
  <label htmlFor={htmlFor} className={cn('mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2', className)}>{children}</label>
);

export const Hint = ({ className, children }) => <span className={cn('mt-1 block text-[12px] text-mute', className)}>{children}</span>;

/** Native select in the 36px field look. */
export const Select = React.forwardRef(({ className, children, ...props }, ref) => (
  <select ref={ref}
    className={cn('h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-(--dur-press) focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)] disabled:opacity-50', className)}
    {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';

/** The big − 20 + quantity stepper. */
export function BigQty({ value, onChange, onStep, id, label, inputProps = {} }) {
  return (
    <div className="flex items-center gap-2.5">
      <button type="button" onClick={() => onStep(-1)} aria-label="One less"
        className="m-press grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-well font-tight text-[18px] font-semibold text-ink-2 hover:bg-[#E8E8E7]">−</button>
      <input id={id} aria-label={label} type="number" min="0" inputMode="decimal" value={value} placeholder="0"
        onChange={(e) => onChange(e.target.value)}
        className="h-[52px] min-w-0 flex-1 rounded-[14px] bg-surface text-center font-tight text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]"
        {...inputProps} />
      <button type="button" onClick={() => onStep(1)} aria-label="One more"
        className="m-press grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-well font-tight text-[18px] font-semibold text-ink-2 hover:bg-[#E8E8E7]">+</button>
    </div>
  );
}

/** Before → after strip (Adjust and Transfer). */
export function BeforeAfter({ left, right, delta, deltaTone = 'g' }) {
  return (
    <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 rounded-xl bg-tile px-3.5 py-2.5 text-center">
      <div className="min-w-0">{left}</div>
      <span className={cn('rounded-pill px-[9px] py-0.5 font-tight text-[12px] font-semibold tabular-nums',
        deltaTone === 'a' ? 'bg-amber-soft text-amber-text' : deltaTone === 'r' ? 'bg-bad-soft text-bad-text' : 'bg-good-soft text-good-text')}>{delta}</span>
      <div className="min-w-0">{right}</div>
    </div>
  );
}

export const BASide = ({ label, value, unit }) => (
  <>
    <small className="block truncate text-[11.5px] text-mute">{label}</small>
    <b className="block font-tight text-[18px] font-semibold tabular-nums">{value}</b>
    <small className="block text-[11.5px] text-mute">{unit}</small>
  </>
);
