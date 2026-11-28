import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Trash2 } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import HoldButton from '../motion/HoldButton';
import { cn } from '../../lib/utils';
import { initialsOf } from '../../lib/supplierView';

/**
 * Small pieces the Suppliers screens share (approved mockups suppliers-01 … 14).
 * Presentation only: no figure is worked out here.
 */

const nf2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 25,800.00 (no symbol) -- table cells. */
export const num2 = (n) => nf2.format(Math.round((Number(n) || 0) * 100) / 100);
/** ₹1,22,635.50 -- figures that carry paise. */
export const money = (n, cur = '₹') => `${cur || '₹'}${num2(n)}`;
/** ₹25,800 -- whole rupees, for buttons and tiles that never showed paise. */
export const rupees = (n, cur = '₹') => `${cur || '₹'}${nf0.format(Math.round(Number(n) || 0))}`;

const PILL = {
  good: 'bg-good-soft text-good-text', warn: 'bg-amber-soft text-amber-text', bad: 'bg-bad-soft text-bad-text',
  info: 'bg-info-soft text-info-text', neutral: 'bg-well text-body',
};
export const Pill = ({ tone = 'neutral', className, children }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-pill px-[9px] py-[3px] font-tight text-[11.5px] font-semibold leading-tight tabular-nums', PILL[tone] || PILL.neutral, className)}>
    {children}
  </span>
);

/** A pill from billPill() ({ tone, text }) or nothing. */
export const BillPill = ({ pill, className }) => (pill ? <Pill tone={pill.tone} className={className}>{pill.text}</Pill> : null);

const AV = { bad: 'bg-bad-soft text-bad-text', warn: 'bg-amber-soft text-amber-text', neutral: 'bg-tile text-ink-2' };
export const Avatar = ({ name, tone = 'neutral', size = 'sm' }) => (
  <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full font-tight font-semibold', AV[tone] || AV.neutral,
    size === 'lg' ? 'h-11 w-11 text-[14px]' : 'h-[30px] w-[30px] text-[11.5px]')}>
    {initialsOf(name)}
  </span>
);

export const Eyebrow = ({ className, children }) => (
  <span className={cn('block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute', className)}>{children}</span>
);

export const Hint = ({ className, children }) => <span className={cn('text-[12px] text-mute', className)}>{children}</span>;

/** The field label used in the dialogs. */
export const Label = ({ htmlFor, children, className }) => (
  <label htmlFor={htmlFor} className={cn('mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2', className)}>{children}</label>
);

/** A red bar with an optional action. */
export const ErrorBar = ({ children, action, onAction, className }) => (
  <div role="alert" className={cn('flex items-start gap-2.5 rounded-xl bg-bad-soft px-3.5 py-[11px] text-[13px] text-bad-text', className)}>
    <AlertCircle size={17} className="mt-px shrink-0" />
    <span className="min-w-0 flex-1 break-words">{children}</span>
    {action && <Button variant="secondary" size="xs" onClick={onAction} className="ml-auto bg-surface">{action}</Button>}
  </div>
);

/** An amber notice (warnings inside dialogs). */
export const WarnBox = ({ children, className }) => (
  <div className={cn('flex items-start gap-2.5 rounded-xl bg-amber-soft px-3 py-2.5 text-[12.5px] leading-snug text-amber-text', className)}>
    <AlertTriangle size={16} className="mt-px shrink-0" />
    <span className="min-w-0 flex-1">{children}</span>
  </div>
);

/** Message line in a dialog: bad (red), warn (amber), info (grey). */
export const Msg = ({ tone = 'bad', children }) => (
  <p role="alert" className={cn('mt-3 rounded-[10px] px-3 py-2 text-[12.5px] break-words',
    tone === 'bad' ? 'bg-bad-soft text-bad-text' : tone === 'warn' ? 'bg-amber-soft text-amber-text' : 'bg-tile text-ink-2')}>{children}</p>
);

/**
 * "Are you sure" with a hold-to-confirm button (mockups 09 and 13), as the
 * phone does for deletes. `onConfirm` may return a string (or { message,
 * tone }) to stay open and say why; anything else closes it.
 */
export function HoldConfirmDialog({ open, onClose, title, text, children, holdLabel, outline = false, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (open) { setBusy(false); setMsg(null); } }, [open]);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const out = await onConfirm?.();
      if (typeof out === 'string' && out) { setMsg({ tone: 'bad', text: out }); return; }
      if (out && typeof out === 'object' && out.message) { setMsg({ tone: out.tone || 'bad', text: out.message }); return; }
      onClose();
    } catch (e) {
      console.error('[suppliers] confirm action failed:', e);
      setMsg({ tone: 'bad', text: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} width={440} label={typeof title === 'string' ? title : 'Confirm'}>
      <div role="alertdialog" aria-label={typeof title === 'string' ? title : undefined} className="-mt-[48px]">
        <div className="flex items-start gap-3 pr-10">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bad-soft text-bad-text"><Trash2 size={19} /></span>
          <div className="min-w-0">
            <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">{title}</h3>
            {text && <p className="mt-0.5 text-[13px] text-body">{text}</p>}
          </div>
        </div>
        {children && <div className="mt-4">{children}</div>}
        {msg && <Msg tone={msg.tone}>{msg.text}</Msg>}
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy} className="shrink-0 px-[18px]">Cancel</Button>
          <HoldButton onConfirm={go} disabled={busy} title={holdLabel}
            className={cn('m-press inline-flex h-10 flex-1 items-center justify-center rounded-pill px-[18px] font-tight text-[13.5px] font-semibold tabular-nums disabled:opacity-50',
              outline ? 'bg-surface text-bad-text shadow-[inset_0_0_0_1.5px_#F5C2C2]' : 'bg-bad text-white')}>
            {busy ? 'Deleting…' : holdLabel}
          </HoldButton>
        </div>
        <p className="mt-2 text-center text-[11.5px] text-mute">Press and hold to confirm</p>
      </div>
    </Dialog>
  );
}

/** Dashed empty state, as on the other redrawn pages. */
export const EmptyCard = ({ icon: Icon, title, text, children }) => (
  <div className="rounded-2xl border border-dashed border-[#D9DADC] bg-surface px-6 py-14 text-center">
    {Icon && <div className="mx-auto mb-3.5 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-body"><Icon size={22} strokeWidth={1.8} /></div>}
    <h3 className="font-tight text-[17px] font-semibold">{title}</h3>
    {text && <p className="mx-auto mt-1.5 max-w-[440px] text-[13.5px] text-body">{text}</p>}
    {children && <div className="mt-[18px]">{children}</div>}
  </div>
);
