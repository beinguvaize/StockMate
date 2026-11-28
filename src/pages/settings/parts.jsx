import React, { useCallback, useState } from 'react';
import { Lock } from 'lucide-react';
import WriteFailure from '../../components/invoices/WriteFailure';
import { Switch } from '../../components/documents/DocParts';
import { cn } from '../../lib/utils';
import { maskTail } from './lib/settingsLib';

/**
 * Shared pieces of the Settings pages (approved settings-01 to 19): the panel
 * heading, the card with header / body / footer, label-left rows, notes, and
 * one save state that tells a refusal from a dropped connection.
 */

export const PanelHead = ({ title, sub, right }) => (
  <div className="mb-4 flex items-end justify-between gap-4">
    <div>
      <h3 className="font-tight text-[20px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
      {sub && <p className="mt-[3px] max-w-[62ch] text-[13.5px] text-body">{sub}</p>}
    </div>
    {right}
  </div>
);

export const Stack = ({ children, className }) => <div className={cn('grid gap-4', className)}>{children}</div>;

export function SCard({ title, sub, right, footer, pad = false, children, className, testId }) {
  return (
    <section className={cn('overflow-hidden rounded-[14px] border border-line bg-surface', className)} data-testid={testId}>
      {(title || sub) && (
        <div className="flex items-start gap-3 border-b border-sep px-5 pb-3.5 pt-4">
          <div className="min-w-0">
            <h4 className="font-tight text-[15px] font-semibold text-ink">{title}</h4>
            {sub && <p className="mt-0.5 text-[13px] text-body">{sub}</p>}
          </div>
          {right && <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>}
        </div>
      )}
      {children != null && <div className={pad ? 'px-5 py-4' : 'px-5 py-1'}>{children}</div>}
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-sep bg-tile px-5 py-3">{footer}</div>
      )}
    </section>
  );
}

/** Label on the left, control on the right; a hairline between rows. */
export const FormRow = ({ label, hint, children, text = false }) => (
  <div className="grid items-start gap-1.5 border-t border-sep py-3.5 first:border-t-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6">
    <div>
      <b className="block font-tight text-[13.5px] font-semibold text-ink">{label}</b>
      {hint && <small className="mt-0.5 block text-[12px] leading-[1.4] text-mute">{hint}</small>}
    </div>
    <div className={cn('min-w-0 text-[13.5px] text-ink-2', text && 'pt-0.5')}>{children}</div>
  </div>
);

const NOTE = {
  am: 'bg-amber-soft text-amber-text',
  rd: 'bg-bad-soft text-bad-text',
  gr: 'bg-good-soft text-good-text',
  gy: 'bg-tile text-body shadow-[inset_0_0_0_1px_var(--color-line)]',
};
export const Note = ({ tone = 'gy', children, className, role }) => (
  <div role={role} className={cn('rounded-xl px-3.5 py-[11px] text-[13px] leading-[1.45]', NOTE[tone], className)}>{children}</div>
);

export const Pill = ({ children, tone = 'n' }) => (
  <span className={cn('inline-flex items-center rounded-pill px-2.5 py-[3px] font-tight text-[11.5px] font-semibold',
    tone === 'b' ? 'bg-info-soft text-info-text' : tone === 'a' ? 'bg-amber-soft text-amber-text' : tone === 'ink' ? 'bg-ink text-white' : 'bg-well text-ink-2')}>
    {children}
  </span>
);

export const LockPill = ({ children }) => (
  <span className="inline-flex items-center gap-[5px] rounded-pill bg-well px-2.5 py-1 font-tight text-[12px] font-semibold text-body">
    <Lock size={12} aria-hidden="true" />{children}
  </span>
);

export const TextLink = ({ children, className, ...props }) => (
  <button type="button" {...props} className={cn('inline-flex items-center gap-1 font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-4', className)}>
    {children}
  </button>
);

/** A label with its switch, one row of a show / hide list. */
export const SwitchRow = ({ label, hint, checked, onChange }) => (
  <div className="flex items-center justify-between gap-4 border-t border-sep py-[9px] text-[13.5px] text-ink-2 first:border-t-0">
    <span>{label}{hint && <small className="block text-[12px] text-mute">{hint}</small>}</span>
    <Switch checked={checked} onChange={onChange} label={label} />
  </div>
);

export const SubHead = ({ children, className }) => (
  <div className={cn('mb-1.5 mt-3.5 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute first:mt-0', className)}>{children}</div>
);

export const IconBtn = ({ label, tone, children, className, ...props }) => (
  <button type="button" aria-label={label} title={label} {...props}
    className={cn('m-press grid h-8 w-8 shrink-0 place-items-center rounded-xl hover:bg-well disabled:opacity-50 [&_svg]:size-[15px]',
      tone === 'rd' ? 'text-bad-text' : 'text-body', className)}>
    {children}
  </button>
);

export const fieldCls = 'h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)] disabled:opacity-50';

/**
 * A sensitive value (PAN, bank account) shown masked; the full value shows
 * only while the field is being edited.
 */
export function MaskedInput({ value, onChange, group = false, className, ...props }) {
  const [editing, setEditing] = useState(false);
  return (
    <input {...props}
      value={editing ? value : maskTail(value, 4, { group })}
      onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
      onChange={(e) => editing && onChange(e.target.value)}
      autoComplete="off" spellCheck={false}
      className={cn(fieldCls, !editing && value && 'tracking-[0.06em]', className)} />
  );
}

/**
 * Save state for one card. A refusal shows "Not saved" and the server's
 * reason; a dropped connection shows "could not confirm" with a re-read
 * (`recheck` resolves true when the server holds the change).
 */
export function useSaveState({ recheck } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState('');

  const run = useCallback(async (fn, okMsg = 'Saved.') => {
    setBusy(true); setError(null); setOk('');
    try {
      const res = await fn();
      const err = res?.error || (res && res.success === false ? (res.error || new Error('The server refused it and gave no reason.')) : null);
      if (err) { console.error('[settings] save failed', err); setError(err); return false; }
      setOk(okMsg);
      return true;
    } catch (e) {
      console.error('[settings] save threw', e);
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const reread = useCallback(async () => {
    if (!recheck) return;
    setBusy(true);
    try {
      const saved = await recheck();
      if (saved) { setError(null); setOk('Saved. Checked with the server.'); }
      else setError(new Error('The server does not hold this change. Your edits are still on screen.'));
    } catch (e) {
      console.error('[settings] re-read failed', e);
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [recheck]);

  const clear = useCallback(() => { setError(null); setOk(''); }, []);
  return { busy, error, ok, run, reread: recheck ? reread : undefined, clear, setError, setOk };
}

/** The footer message: the failure (truthfully), else the last success, else a hint. */
export const SaveMsg = ({ state, noun, hint }) => (
  state.error
    ? <WriteFailure error={state.error} noun={noun} onReread={state.reread} className="mr-auto min-w-0 flex-1" />
    : state.ok
      ? <span className="mr-auto font-tight text-[12.5px] font-semibold text-good-text" role="status">{state.ok}</span>
      : hint ? <span className="mr-auto text-[12.5px] text-body">{hint}</span> : null
);
