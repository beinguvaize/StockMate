import React from 'react';
import { Banknote, Landmark, Wallet, CreditCard } from 'lucide-react';
import { cn } from '../../lib/utils';

/** Small pieces the Cash and Bank screens share (accounts-01 to 13). Presentation only. */

const ICONS = { CASH: Banknote, BANK: Landmark, UPI: Wallet, CARD: CreditCard, LOAN: Landmark };
export const AccountIcon = ({ type, className }) => {
  const Icon = ICONS[type] || Landmark;
  return (
    <span aria-hidden="true" className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-tile text-ink-2', className)}>
      <Icon size={16} strokeWidth={1.9} />
    </span>
  );
};

/** A row of pill choices (mockup .chipq): the picked one is ink. */
export const Chips = ({ items, value, onChange, ariaLabel, className, toneFor }) => (
  <div role="radiogroup" aria-label={ariaLabel} className={cn('flex flex-wrap gap-1.5', className)}>
    {items.map(([k, label]) => {
      const on = k === value;
      return (
        <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onChange?.(k)}
          className={cn('m-press whitespace-nowrap rounded-pill px-[11px] py-[5px] font-tight text-[12px] font-semibold',
            on ? (toneFor?.(k) || 'bg-ink text-white') : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
          {label}
        </button>
      );
    })}
  </div>
);

export const Field = ({ label, hint, htmlFor, className, children }) => (
  <div className={cn('mt-3.5 first:mt-0', className)}>
    <label htmlFor={htmlFor} className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">
      {label}{hint && <small className="ml-1 font-sans text-[12px] font-medium text-mute">{hint}</small>}
    </label>
    {children}
  </div>
);

export const fieldCls = 'h-10 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink tabular-nums shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-(--dur-press) placeholder:text-mute focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)]';
