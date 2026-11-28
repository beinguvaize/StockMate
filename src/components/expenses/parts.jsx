import React from 'react';
import { cn } from '../../lib/utils';
import { categoryDot } from '../../lib/expenseList';

/** Small pieces the Expenses screens share (expenses-01 to 09). Presentation only. */

/** ₹84,020 (whole rupees, as the list has always shown). */
export const rupees = (n, sym = '₹') => `${sym}${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
/** ₹600.00 / ₹91.53 (paise, for one expense and its tax). */
export const rupeesPaise = (n, sym = '₹') =>
  `${sym}${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const Dot = ({ category, className }) => (
  <i aria-hidden="true" className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: categoryDot(category) }} />
);

/** "● Packing material". */
export const CategoryChip = ({ category, className }) => (
  <span className={cn('inline-flex items-center gap-[7px] whitespace-nowrap text-[13px] text-ink-2', className)}>
    <Dot category={category} />{category || 'Other'}
  </span>
);

const PILL = {
  good: 'bg-good-soft text-good-text', warn: 'bg-amber-soft text-amber-text', bad: 'bg-bad-soft text-bad-text', neutral: 'bg-well text-body',
};
export const Pill = ({ tone = 'neutral', small = false, className, children }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-pill font-tight font-semibold',
    small ? 'px-[7px] py-px text-[11px]' : 'px-[9px] py-[3px] text-[11.5px]', PILL[tone], className)}>
    {children}
  </span>
);

/** The labels a row carries beside its note: repeats, payroll, kept out of profit. */
export const rowTags = (e) => [
  e?.recurring_template_id && 'Repeats',
  e?.payroll_id && 'Payroll',
  e?.exclude_from_pl && 'Kept out of profit',
].filter(Boolean);

/** An on/off switch (amber when on). */
export const Toggle = ({ on, onChange, label, disabled }) => (
  <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled}
    onClick={() => onChange?.(!on)}
    className={cn('relative h-[22px] w-[38px] shrink-0 rounded-pill transition-colors duration-(--dur-press) disabled:opacity-50',
      on ? 'bg-amber' : 'bg-[#D9DADC]')}>
    <span aria-hidden="true" className={cn('absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(17,20,24,0.25)] transition-transform duration-(--dur-press)',
      on && 'translate-x-4')} />
  </button>
);

/** Pill segmented choice (light: white pill on the grey well). */
export const Seg = ({ items, value, onChange, ariaLabel, small = false, className }) => (
  <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-pill bg-well p-[3px]', className)}>
    {items.map(([k, label]) => {
      const on = k === value;
      return (
        <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onChange?.(k)}
          className={cn('m-press whitespace-nowrap rounded-pill font-tight font-semibold',
            small ? 'px-2.5 py-1.5 text-[12.5px]' : 'px-[15px] py-[7px] text-[13px]',
            on ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(17,20,24,0.12)]' : 'text-body hover:text-ink')}>
          {label}
        </button>
      );
    })}
  </div>
);

export const Label = ({ htmlFor, children, className }) => (
  <label htmlFor={htmlFor} className={cn('mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2', className)}>{children}</label>
);

export const Hint = ({ className, children }) => <span className={cn('text-[12px] text-mute', className)}>{children}</span>;
