import React from 'react';
import { cn } from '../../lib/utils';
import { stageOf } from '../../lib/orderView';

/** Stage pill colours (orders.css): one soft fill per stage, Invoiced dark. */
export const STAGE_TONE = {
  draft: 'bg-well text-body',
  conf: 'bg-info-soft text-info-text',
  disp: 'bg-amber-soft text-amber-text',
  deliv: 'bg-good-soft text-good-text',
  inv: 'bg-ink text-white',
  can: 'bg-bad-soft text-bad-text',
};

/** The dot beside a stage chip. */
export const STAGE_DOT = {
  draft: 'bg-faint', conf: 'bg-info-text', disp: 'bg-amber', deliv: 'bg-good-text', inv: 'bg-ink', can: 'bg-bad-text',
};

export const StagePill = ({ status, className }) => {
  const s = stageOf(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-[9px] py-[3px] font-tight text-[12px] font-semibold', STAGE_TONE[s.tone], className)}>
      <i className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />{s.label}
    </span>
  );
};

/** The small grey tags under an order number (B2B, Wholesale) or the amber Invoice tag. */
export const Tag = ({ amber = false, children }) => (
  <span className={cn('rounded-pill px-[7px] py-0.5 font-tight text-[10.5px] font-semibold', amber ? 'bg-amber-soft text-amber-text' : 'bg-well text-body')}>{children}</span>
);

/** The square outlined icon button in a row. */
export const SquareBtn = ({ title, onClick, children, danger = false, disabled = false, ...rest }) => (
  <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} {...rest}
    className={cn('m-press grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] text-mute shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile hover:text-ink disabled:opacity-50 [&_svg]:size-3.5',
      danger && 'hover:bg-bad-soft hover:text-bad-text')}>
    {children}
  </button>
);
