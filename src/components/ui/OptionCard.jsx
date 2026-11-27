import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Option cards (web redesign), for choosing one of a few ways to do
 * something: payment method, "what next" after a sale.
 *
 *   <OptionGroup cols={2}>
 *     <OptionCard selected={m === 'cash'} onClick={() => setM('cash')} icon={<Banknote />} title="Cash" hint="Into the drawer" />
 *   </OptionGroup>
 *
 * `variant="choice"` is the larger row with an arrow; `primary` marks the
 * suggested one in amber.
 */
const GROUP_COLS = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' };

export function OptionGroup({ cols = 1, className, children, ...props }) {
  return <div role="radiogroup" className={cn('grid gap-2', GROUP_COLS[cols] || GROUP_COLS[1], className)} {...props}>{children}</div>;
}

export default function OptionCard({ title, hint, icon, selected = false, primary = false, variant = 'option', onClick, disabled, className }) {
  const choice = variant === 'choice';
  return (
    <button type="button" data-card role={choice ? undefined : 'radio'} aria-checked={choice ? undefined : selected}
      onClick={onClick} disabled={disabled}
      className={cn('m-press flex w-full items-center gap-2.5 text-left disabled:opacity-50 disabled:cursor-not-allowed',
        choice ? 'rounded-[14px] px-4 py-3.5 gap-3' : 'rounded-xl px-3 py-[11px]',
        selected ? 'bg-surface shadow-[inset_0_0_0_2px_var(--color-ink)]'
          : primary ? 'bg-amber-soft shadow-[inset_0_0_0_2px_var(--color-amber)]'
          : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile',
        className)}>
      {icon && <span className="shrink-0 text-ink-2 [&_svg]:size-[18px]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <b className={cn('block font-tight font-semibold text-ink', choice ? 'text-[14.5px]' : 'text-[13.5px]')}>{title}</b>
        {hint && <small className={cn('block tabular-nums', choice ? 'text-[12.5px] text-body' : 'text-[12px] text-mute')}>{hint}</small>}
      </span>
      {choice && <ChevronRight size={16} className="ml-auto shrink-0 text-mute" aria-hidden="true" />}
    </button>
  );
}
