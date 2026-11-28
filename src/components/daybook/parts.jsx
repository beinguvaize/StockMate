import React from 'react';
import { cn } from '../../lib/utils';
import { Eyebrow } from '../ui/FigureStrip';

/** Day Book building blocks (web redesign, mockups daybook-01 to 12). */

export const fmt = (n) =>
  (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "₹1,240.00", or "−₹80.00" when negative and `signed`. */
export const money = (n, cy, { signed = false, plus = false } = {}) => {
  const v = Number(n) || 0;
  const sign = v < 0 && signed ? '−' : plus && v > 0 ? '+' : '';
  return `${sign}${cy}${fmt(signed || plus ? Math.abs(v) : v)}`;
};

const TILE_TONE = {
  plain: 'bg-tile text-ink',
  pos: 'bg-tile [&_b]:text-good-text',
  neg: 'bg-tile [&_b]:text-bad-text',
  dark: 'bg-ink text-white [&_.eb]:text-white/70 [&_small]:text-white/70',
  deficit: 'bg-bad text-white [&_.eb]:text-white/80 [&_small]:text-white/80',
};

/** A key-figure tile: grey, green / red figure, or the dark closing one. */
export function Tile({ label, value, sub, tone = 'plain' }) {
  return (
    <div className={cn('min-w-0 rounded-[14px] px-4 py-3.5', TILE_TONE[tone])}>
      <Eyebrow className="eb">{label}</Eyebrow>
      <b className="mt-1.5 mb-[3px] block whitespace-nowrap font-tight text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] tabular-nums">{value}</b>
      {sub && <small className="block truncate text-[12.5px] text-body">{sub}</small>}
    </div>
  );
}

export const Tiles = ({ className, children, ...props }) => (
  <div className={cn('mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4', className)} {...props}>{children}</div>
);

/** A bordered card with a heading row. */
export function Box({ title, icon: Icon, sub, right, children, className, bodyClassName, flush = false, ...props }) {
  return (
    <section className={cn('overflow-hidden rounded-[14px] border border-line bg-surface', className)} {...props}>
      {(title || right) && (
        <div className="flex flex-wrap items-baseline gap-2.5 px-4 pt-3.5 pb-3">
          <div className="min-w-0">
            <h3 className="font-tight text-[15px] font-semibold text-ink">
              {Icon && <Icon size={14} strokeWidth={2} className="mr-1.5 inline -translate-y-px text-amber-text" aria-hidden="true" />}
              {title}
            </h3>
            {sub && <small className="mt-0.5 block text-[12.5px] text-mute">{sub}</small>}
          </div>
          {right}
        </div>
      )}
      {flush ? children : <div className={cn('px-4 pt-1 pb-4', bodyClassName)}>{children}</div>}
    </section>
  );
}

const LINE_TONE = { good: 'text-good-text', bad: 'text-bad-text', amber: 'text-amber-text', plain: 'text-ink-2' };

/** One "label … figure" line of the breakdown and the equation. */
export function Line({ label, value, tone = 'plain', total = false, muted = false, big = false }) {
  return (
    <div className={cn('flex justify-between gap-3 py-[3px] text-[13px] text-body',
      total && 'mt-1 border-t border-sep pt-[7px] font-semibold text-ink', muted && 'opacity-55')}>
      <span>{label}</span>
      <b className={cn('font-tight text-[13.5px] font-semibold tabular-nums', LINE_TONE[tone], big && 'text-[15px] text-ink')}>{value}</b>
    </div>
  );
}

const VAR_TONE = { good: 'bg-good-soft text-good-text', bad: 'bg-bad-soft text-bad-text', info: 'bg-info-soft text-info-text' };

/** The coloured count-against-book strip. */
export function VarianceStrip({ look, value, className }) {
  if (!look) return null;
  return (
    <div role="status" className={cn('mt-2.5 flex items-center justify-between rounded-[10px] px-3 py-2.5 font-tight text-[13px] font-semibold', VAR_TONE[look.tone], className)}>
      <span>{look.label}</span>
      {value && <b className="font-semibold tabular-nums">{value}</b>}
    </div>
  );
}

const BANNER_TONE = { amber: 'bg-amber-soft text-amber-text', good: 'bg-good-soft text-good-text' };
export const Banner = ({ tone = 'amber', className, children }) => (
  <div className={cn('rounded-xl px-3.5 py-3 text-[13px] leading-[1.45]', BANNER_TONE[tone], className)}>{children}</div>
);

/** An amount field with the currency on the right, as drawn. */
export const AmountField = React.forwardRef(({ cy, className, ...props }, ref) => (
  <label className={cn('relative block', className)}>
    <input ref={ref} type="number" inputMode="decimal"
      className="h-10 w-full rounded-[10px] bg-surface pl-3 pr-8 text-[13.5px] text-ink tabular-nums shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-(--dur-press) placeholder:text-mute focus-visible:shadow-[inset_0_0_0_2px_var(--color-amber)]"
      {...props} />
    <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-mute">{cy}</span>
  </label>
));
AmountField.displayName = 'AmountField';
