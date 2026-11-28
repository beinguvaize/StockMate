import React, { useEffect, useState } from 'react';
import { AlertCircle, Layers, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label, Hint } from '../suppliers/parts';
import MfgDialog, { Note } from './MfgDialog';
import { Sec, selCls } from './Cards';
import { canSaveBom } from '../../lib/manufacturingView';
import { classifyWriteFailure } from '../../lib/writeOutcome';

const blank = () => ({ productId: '', quantity: '', unit: 'BASE' });

/** A write failure in words: the server's reason, or "may have saved". */
export function FailNote({ fail, onReread, rereading }) {
  if (!fail) return null;
  return (
    <div className="mt-3">
      <Note tone={fail.maySaved ? 'a' : 'r'} icon={AlertCircle} title={`${fail.title}.`}>
        {fail.detail}
        {fail.maySaved && ' It may have gone through. Check again before trying a second time.'}
      </Note>
      {fail.maySaved && onReread && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onReread} disabled={rereading}>
          {rereading ? 'Checking…' : 'Check again'}
        </Button>
      )}
    </div>
  );
}

/**
 * New bill of materials / recipe (mockup manufacturing-03). Same fields and
 * the same createBom call as before: finished product (raw materials left
 * out), how many a batch makes, and the materials with quantity and unit.
 */
export default function NewBomDialog({ open, onClose, products = [], words, createBom, onSaved, onReread }) {
  const [finishedId, setFinishedId] = useState('');
  const [outputQty, setOutputQty] = useState('1');
  const [rows, setRows] = useState([blank()]);
  const [saving, setSaving] = useState(false);
  const [fail, setFail] = useState(null);
  const [rereading, setRereading] = useState(false);

  useEffect(() => {
    if (open) { setFinishedId(''); setOutputQty('1'); setRows([blank()]); setSaving(false); setFail(null); }
  }, [open]);

  const setRow = (i, k, v) => setRows((rs) => rs.map((r, idx) => {
    if (idx !== i) return r;
    const next = { ...r, [k]: v };
    if (k === 'productId') next.unit = 'BASE'; // reset unit when product changes
    return next;
  }));
  const filled = rows.filter((r) => r.productId && Number(r.quantity) > 0).length;
  const ok = canSaveBom({ finishedId, outputQty, rows });

  const save = async () => {
    if (!ok || saving) return;
    setSaving(true);
    setFail(null);
    try {
      const r = await createBom({ finishedProductId: finishedId, name: null, outputQty: Number(outputQty), components: rows });
      if (r?.success) { onSaved?.(); onClose(); return; }
      console.error('[manufacturing] save bill of materials failed:', r?.error);
      setFail(classifyWriteFailure(r?.error, { noun: words.lower }));
    } finally {
      setSaving(false);
    }
  };

  const reread = async () => {
    setRereading(true);
    try { await onReread?.(); onClose(); } finally { setRereading(false); }
  };

  return (
    <MfgDialog open={open} onClose={saving ? () => {} : onClose} width={720} icon={Layers}
      title={`New ${words.lower}`} subtitle="The materials and how many it makes"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!ok || saving || fail?.maySaved}>{saving ? 'Saving…' : `Save ${words.lower}`}</Button>
        </>
      )}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <Label htmlFor="bom-product">Finished product</Label>
          <select id="bom-product" className={selCls} value={finishedId} onChange={(e) => setFinishedId(e.target.value)}>
            <option value="">Select product…</option>
            {products.filter((p) => p.product_type !== 'RAW').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Hint className="mt-1 block">Raw-material items are left out of this list</Hint>
        </div>
        <div>
          <Label htmlFor="bom-makes">Makes</Label>
          <Input id="bom-makes" type="number" min="1" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} />
          <Hint className="mt-1 block">units per batch</Hint>
        </div>
      </div>

      <Sec className="mt-[18px]">
        Materials · {filled}
        <span className="flex-1" />
        <button type="button" onClick={() => setRows((rs) => [...rs, blank()])}
          className="font-tight text-[12.5px] font-semibold normal-case tracking-normal text-amber-text hover:underline">+ Add material</button>
      </Sec>
      <div className="mb-1.5 mt-1 grid grid-cols-[minmax(0,1fr)_90px_90px_34px] gap-2.5 font-tight text-[11.5px] font-semibold text-mute sm:grid-cols-[minmax(0,1fr)_110px_110px_34px]">
        <span>Material</span><span className="text-center">Quantity</span><span>Unit</span><span />
      </div>
      {rows.map((r, i) => {
        const rp = products.find((p) => p.id === r.productId);
        return (
          <div key={i} className="mb-2 grid grid-cols-[minmax(0,1fr)_90px_90px_34px] items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_110px_110px_34px]">
            <select aria-label={`Material ${i + 1}`} className={selCls} value={r.productId} onChange={(e) => setRow(i, 'productId', e.target.value)}>
              <option value="">Material…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Input aria-label={`Quantity ${i + 1}`} type="number" min="0" placeholder="0" className="text-center"
              value={r.quantity} onChange={(e) => setRow(i, 'quantity', e.target.value)} />
            <select aria-label={`Unit ${i + 1}`} className={selCls} value={r.unit} onChange={(e) => setRow(i, 'unit', e.target.value)}
              disabled={!rp?.secondary_unit}>
              <option value="BASE">{rp?.unit || 'unit'}</option>
              {rp?.secondary_unit && <option value="SECONDARY">{rp.secondary_unit}</option>}
            </select>
            <button type="button" aria-label={`Remove material ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
              className="m-press grid h-[34px] w-[34px] place-items-center rounded-full bg-well text-ink-2 hover:text-bad-text">
              <X size={14} />
            </button>
          </div>
        );
      })}
      <FailNote fail={fail} onReread={reread} rereading={rereading} />
    </MfgDialog>
  );
}
