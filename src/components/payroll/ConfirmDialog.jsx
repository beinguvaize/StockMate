import React, { useEffect, useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

/**
 * The small "are you sure" dialog (approved mockups 06, 14, 15). Replaces the
 * browser's confirm() boxes the old page used.
 *
 * `onConfirm` may return a string or an { message } to keep the dialog open
 * and show why it did not work; anything else closes it.
 */
const ICONS = { danger: Trash2, rerun: RotateCcw, warn: AlertTriangle };

export default function ConfirmDialog({ open, onClose, tone = 'danger', title, text, more, bullets = [], confirmLabel, cancelLabel = 'Cancel', onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { if (open) { setBusy(false); setError(null); } }, [open]);
  const Icon = ICONS[tone] || Trash2;

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await onConfirm?.();
      if (typeof out === 'string' && out) { setError(out); return; }
      if (out && typeof out === 'object' && out.message) { setError(out.message); return; }
      onClose();
    } catch (e) {
      console.error('[payroll] confirm action failed:', e);
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} width={460} label={typeof title === 'string' ? title : 'Confirm'}>
      <div role="alertdialog" aria-label={typeof title === 'string' ? title : undefined}>
        <div className={cn('mb-3 grid h-11 w-11 place-items-center rounded-full', tone === 'danger' ? 'bg-bad-soft text-bad-text' : 'bg-amber-soft text-amber-text')}>
          <Icon size={20} />
        </div>
        <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">{title}</h3>
        {text && <p className="mt-1.5 text-[13.5px] text-body">{text}</p>}
        {more && <p className="mt-1.5 text-[13.5px] text-body">{more}</p>}
        {bullets.length > 0 && (
          <ul className="mt-2.5 list-disc pl-[18px] text-[13px] text-ink-2">
            {bullets.filter(Boolean).map((b) => <li key={String(b)} className="my-1">{b}</li>)}
          </ul>
        )}
        {error && <p role="alert" className="mt-3 rounded-[10px] bg-bad-soft px-3 py-2 text-[12.5px] text-bad-text break-words">{error}</p>}
        <div className="mt-5 flex gap-2 [&>*]:flex-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'destructive' : 'default'} onClick={go} disabled={busy}>
            {busy ? 'Working…' : error ? 'Try again' : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
