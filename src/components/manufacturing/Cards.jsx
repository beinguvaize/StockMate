import React from 'react';
import { Layers, Package, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Pill } from '../suppliers/parts';
import { cn } from '../../lib/utils';

/**
 * The production-order and bill-of-materials cards (mockups manufacturing-01
 * and 02). Presentation only: every figure arrives worked out from
 * lib/manufacturingView, and every cost on a completed order is the server's.
 */

export const selCls = 'h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)] disabled:opacity-60';

export const Ico = ({ icon: Icon = Package, tone }) => (
  <span className={cn('grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px]',
    tone === 'bad' ? 'bg-bad-soft text-bad-text' : 'bg-tile text-ink-2')}>
    <Icon size={19} strokeWidth={1.8} />
  </span>
);

export const IconBtn = ({ label, onClick, disabled, children }) => (
  <Button variant="secondary" size="icon-sm" aria-label={label} title={label} onClick={onClick} disabled={disabled}
    className="shrink-0 hover:text-bad-text [&_svg]:size-3.5">
    {children || <Trash2 />}
  </Button>
);

/** Section eyebrow inside cards and dialogs ("Materials used"). */
export const Sec = ({ children, className }) => (
  <div className={cn('mb-2 flex items-center gap-1.5 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute', className)}>{children}</div>
);

const Lines = ({ lines }) => (lines.length > 0 ? (
  <div className="grid grid-cols-1 gap-x-10 gap-y-1 px-[18px] py-3 md:grid-cols-2">
    {lines.map((l) => (
      <div key={l.key} className="flex justify-between gap-3 py-[3px] text-[13px] text-ink-2">
        <span className="min-w-0 truncate">{l.label}</span>
        <span className={cn('shrink-0 font-tight font-semibold tabular-nums', l.kind === 'cost' ? 'text-amber-text' : 'text-ink')}>{l.value}</span>
      </div>
    ))}
  </div>
) : null);

const Head = ({ icon, title, sub, children }) => (
  <div className="flex flex-wrap items-center gap-3.5 border-b border-sep px-[18px] py-3.5">
    <Ico icon={icon} />
    <div className="min-w-0 flex-1">
      <h4 className="truncate font-tight text-[15px] font-semibold">{title}</h4>
      <small className="mt-0.5 block text-[12.5px] text-body">{sub}</small>
    </div>
    {children}
  </div>
);

export function OrderCard({ card, money, onEditQty, onComplete, onDelete, busy }) {
  return (
    <article className="mb-2.5 overflow-hidden rounded-[14px] border border-line bg-surface" aria-label={card.name}>
      <Head icon={Package} title={card.name} sub={card.sub}>
        <Pill tone={card.pill.tone}>{card.pill.text}</Pill>
        {card.done ? (
          <div className="text-right">
            <b className="block font-tight text-[15px] font-semibold tabular-nums">{money(card.unitCost)}</b>
            <span className="text-[11.5px] text-mute">unit cost</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" onClick={onEditQty} disabled={busy}>Edit quantity</Button>
            <Button variant="dark" size="sm" onClick={onComplete} disabled={busy}>Complete</Button>
            <IconBtn label={`Delete draft build ${card.name}`} onClick={onDelete} disabled={busy} />
          </div>
        )}
      </Head>
      <Lines lines={card.lines} />
      <div className="flex flex-wrap justify-end gap-6 border-t border-sep bg-tile px-[18px] py-2.5 text-[13px] text-body">
        {card.totals ? (
          <>
            <span>Material <b className="font-semibold text-ink tabular-nums">{money(card.totals.material)}</b></span>
            <span>Other <b className="font-semibold text-ink tabular-nums">{money(card.totals.other)}</b></span>
            <span>Total <b className="font-semibold text-ink tabular-nums">{money(card.totals.total)}</b></span>
          </>
        ) : <span>Stock is used only when you press Complete</span>}
      </div>
    </article>
  );
}

export function BomCard({ card, onDelete, deleteLabel }) {
  return (
    <article className="mb-2.5 overflow-hidden rounded-[14px] border border-line bg-surface" aria-label={card.name}>
      <Head icon={Layers} title={card.name} sub={card.sub}>
        <IconBtn label={deleteLabel || `Delete ${card.name}`} onClick={onDelete} />
      </Head>
      <Lines lines={card.lines} />
    </article>
  );
}

/** The loading block (mockup 10, "While loading"). */
export const LoadingBars = () => (
  <div className="rounded-[14px] border border-line bg-surface px-[18px] py-3.5" aria-busy="true" aria-label="Loading">
    {[70, 55, 80, 40, 65, 50].map((w) => (
      <div key={w} className="my-2.5 h-3 rounded-pill bg-well" style={{ width: `${w}%` }} />
    ))}
  </div>
);
