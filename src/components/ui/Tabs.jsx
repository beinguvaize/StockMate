import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Underlined sub-tabs (web redesign): Inter Tight labels, amber underline on
 * the open tab, optional count bubble.
 *   items: [{ key, label, count? }]
 */
export function Tabs({ items, value, onChange, className, ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('flex items-end gap-[22px] border-b border-line', className)}>
      {items.map(({ key, label, count }) => {
        const on = key === value;
        return (
          <button key={key} type="button" role="tab" aria-selected={on} onClick={() => onChange?.(key)}
            className={cn('-mb-px py-2.5 border-b-2 font-tight text-[14px] font-semibold transition-colors duration-(--dur-press)',
              on ? 'text-ink border-amber' : 'text-body border-transparent hover:text-ink')}>
            {label}
            {count !== undefined && count !== null && (
              <span className="ml-1.5 rounded-pill bg-well px-[7px] py-px text-[11.5px] text-mute tabular-nums">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Filter pills with counts (web redesign): outlined pills, the chosen one
 * dark. Presses to 96%.
 *   items: [{ key, label, count? }]
 */
export function FilterPills({ items, value, onChange, className, ariaLabel }) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map(({ key, label, count }) => {
        const on = key === value;
        return (
          <button key={key} type="button" aria-pressed={on} onClick={() => onChange?.(key)}
            className={cn('m-press whitespace-nowrap rounded-pill px-3.5 py-[7px] font-tight text-[13px] font-semibold',
              on ? 'bg-ink text-white' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
            {label}
            {count !== undefined && count !== null && (
              <b className={cn('ml-[5px] font-semibold tabular-nums', on ? 'text-white/60' : 'text-mute')}>{count}</b>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
