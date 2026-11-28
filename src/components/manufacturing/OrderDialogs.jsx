import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Pencil } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../suppliers/parts';
import MfgDialog, { Note } from './MfgDialog';
import { FailNote } from './NewBomDialog';
import { draftEstimate, lossOf, qtyText, isQty } from '../../lib/manufacturingView';
import { classifyWriteFailure } from '../../lib/writeOutcome';

/**
 * Complete build (mockups manufacturing-06 and 09).
 *
 * The same two calls as before, in the same order: when fewer (or more) were
 * made than planned, setProducedQty first, then complete_production_order,
 * which takes the materials out of stock and sets the cost. The browser
 * works out nothing that is saved.
 *
 * One press, one completion: the button is disabled from the first press
 * until the server answers (a ref guards the gap before React re-renders).
 * A rejection shows the server's own reason; a dropped connection says the
 * build may have completed and offers only "Check again", never a second
 * Complete.
 */
export function CompleteDialog({ open, onClose, card, data, money, setProducedQty, completeOrder, onDone, onEditQty, onReread }) {
  const order = card?.order;
  const planned = Number(order?.qty_produced) || 0;
  const [actual, setActual] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState('');
  const [fail, setFail] = useState(null); // { title, detail, maySaved }
  const [rereading, setRereading] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (open) { setActual(String(planned || '')); setBusy(false); setBad(''); setFail(null); inFlight.current = false; }
  }, [open, planned]);

  if (!card) return null;
  const est = draftEstimate({ order, ...data, actual });
  const loss = lossOf(planned, actual);

  const go = async () => {
    if (inFlight.current) return;
    const a = Number(actual);
    if (!isQty(a)) { setBad('Quantity must be more than 0'); return; }
    inFlight.current = true;
    setBusy(true);
    setBad('');
    try {
      if (a !== planned) {
        const { error } = await setProducedQty(order.id, a);
        if (error) {
          console.error('[manufacturing] set produced quantity failed:', error);
          const f = classifyWriteFailure(error, { noun: 'quantity' });
          setFail(f.maySaved ? f : { ...f, title: 'Quantity not changed' });
          return;
        }
      }
      const r = await completeOrder(order.id);
      if (r?.success) { onDone?.(r, a); onClose(); return; }
      console.error('[manufacturing] complete build failed:', r?.error);
      setFail(classifyWriteFailure(r?.error, { noun: 'build' }));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const reread = async () => {
    setRereading(true);
    try { await onReread?.(); onClose(); } finally { setRereading(false); }
  };

  // ── Rejected: the server's reason, in full (mockup 09) ───────────────
  if (fail && !fail.maySaved) {
    return (
      <MfgDialog open={open} onClose={onClose} width={500} icon={AlertCircle} tone="bad"
        title="Build not completed" subtitle={`${card.name} · ${qtyText(planned)} planned`}
        footer={(
          <>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button onClick={() => { onClose(); onEditQty?.(); }}>Edit quantity</Button>
          </>
        )}>
        <Note tone="r" icon={AlertCircle} title={fail.detail}>
          Nothing was taken out of stock and the build is still a draft.
        </Note>
      </MfgDialog>
    );
  }

  // ── Dropped connection: it may have completed ────────────────────────
  if (fail && fail.maySaved) {
    return (
      <MfgDialog open={open} onClose={onClose} width={500} icon={AlertCircle} tone="bad"
        title={fail.title} subtitle={`${card.name} · ${qtyText(planned)} planned`}
        footer={(
          <>
            <Button variant="secondary" onClick={onClose} disabled={rereading}>Close</Button>
            <Button onClick={reread} disabled={rereading}>{rereading ? 'Checking…' : 'Check again'}</Button>
          </>
        )}>
        <Note tone="a" icon={AlertCircle} title={fail.detail}>
          The build may have completed. Check again to see what the server holds before pressing Complete a second time.
        </Note>
      </MfgDialog>
    );
  }

  return (
    <MfgDialog open={open} onClose={busy ? () => {} : onClose} width={500} icon={CheckCircle2}
      title="Complete build" subtitle={`${card.name} · ${qtyText(planned)} planned`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={go} disabled={busy} aria-busy={busy}>{busy ? 'Completing…' : 'Complete build'}</Button>
        </>
      )}>
      <Label htmlFor="complete-actual">How many did you actually make?</Label>
      <div className="flex items-center gap-3">
        <Input id="complete-actual" type="number" min="0" autoFocus value={actual} disabled={busy}
          onChange={(e) => setActual(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
          className="h-[52px] w-40 justify-center text-center font-tight text-[22px] font-semibold" />
        <span className="text-[13px] text-body">of {qtyText(planned)} planned</span>
      </div>
      {bad && <p role="alert" className="mt-2 text-[12.5px] text-bad-text">{bad}</p>}
      {loss && (
        <div className="mt-3 flex justify-between rounded-xl bg-amber-soft px-3.5 py-2.5 text-[13px] text-amber-text">
          <span>{qtyText(loss.short)} short of plan</span><b className="font-semibold">{loss.pct}% loss</b>
        </div>
      )}
      <div className="mt-3 rounded-[14px] bg-tile px-4 py-3 text-[13px]">
        <div className="flex justify-between py-0.5 text-body"><span>Materials taken out of stock</span><span>as saved on this draft</span></div>
        <div className="flex justify-between py-0.5 text-body"><span>Estimated total</span><span className="font-tight tabular-nums">{money(est.total)}</span></div>
        {isQty(actual) && (
          <div className="flex justify-between py-0.5 font-semibold text-amber-text"><span>Unit cost, about</span><span className="font-tight tabular-nums">{money(est.unit)}</span></div>
        )}
      </div>
      <p className="mt-3 text-[12px] text-mute">
        The final unit cost comes from the batches the materials are taken from, and shows on the order once done.
        {isQty(actual) ? ` ${qtyText(actual)} ${card.name} are added to stock.` : ''}
      </p>
    </MfgDialog>
  );
}

/**
 * Edit quantity (mockup manufacturing-07): the planned number on a draft.
 * The same setProducedQty call as before; the materials on the draft stay
 * as they were saved.
 */
export function EditQtyDialog({ open, onClose, card, setProducedQty, onSaved, onReread }) {
  const planned = Number(card?.order?.qty_produced) || 0;
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState('');
  const [fail, setFail] = useState(null);
  const [rereading, setRereading] = useState(false);

  useEffect(() => { if (open) { setQty(String(planned || '')); setBusy(false); setBad(''); setFail(null); } }, [open, planned]);
  if (!card) return null;

  const save = async () => {
    if (busy) return;
    const q = Number(qty);
    if (!isQty(q)) { setBad('Quantity must be more than 0'); return; }
    if (q === planned) { onClose(); return; }
    setBusy(true);
    setBad('');
    setFail(null);
    try {
      const { error } = await setProducedQty(card.id, q);
      if (!error) { onSaved?.(); onClose(); return; }
      console.error('[manufacturing] edit quantity failed:', error);
      setFail(classifyWriteFailure(error, { noun: 'quantity' }));
    } finally {
      setBusy(false);
    }
  };

  const reread = async () => {
    setRereading(true);
    try { await onReread?.(); onClose(); } finally { setRereading(false); }
  };

  return (
    <MfgDialog open={open} onClose={busy ? () => {} : onClose} width={440} icon={Pencil}
      title="Edit quantity" subtitle={`${card.name} · draft`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || fail?.maySaved}>{busy ? 'Saving…' : 'Save'}</Button>
        </>
      )}>
      <div className="mb-3">
        <Label htmlFor="edit-qty">Planned quantity</Label>
        <Input id="edit-qty" type="number" min="1" autoFocus value={qty} disabled={busy}
          onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        {bad && <p role="alert" className="mt-1.5 text-[12.5px] text-bad-text">{bad}</p>}
      </div>
      <Note tone="n" icon={Info}>
        Changes the number to make only. The materials on this draft stay as they are (for {qtyText(planned)}), so redo the build if the materials should change too.
      </Note>
      <FailNote fail={fail} onReread={reread} rereading={rereading} />
    </MfgDialog>
  );
}
