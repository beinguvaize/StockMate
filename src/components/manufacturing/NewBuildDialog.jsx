import React, { useEffect, useMemo, useState } from 'react';
import { Factory, Package, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../suppliers/parts';
import MfgDialog, { Note } from './MfgDialog';
import { FailNote } from './NewBomDialog';
import { Sec, selCls } from './Cards';
import { todayISOInAppTZ, cn } from '../../lib/utils';
import {
  buildMaterials, buildRollup, shortages, shortNotice, productName, qtyText, unitSuffix,
} from '../../lib/manufacturingView';
import { classifyWriteFailure } from '../../lib/writeOutcome';

/**
 * New build (mockups manufacturing-04 and 05): a draft production order from
 * a bill of materials. Same createProductionOrder call and payload as before.
 * Nothing leaves stock here; the costs shown are the cost-price estimate.
 */
export default function NewBuildDialog({ open, onClose, products = [], boms = [], bomComponents = [], words, money, createProductionOrder, onSaved, onReread }) {
  const [bomId, setBomId] = useState('');
  const [qty, setQty] = useState('');
  const [costs, setCosts] = useState([{ label: '', amount: '' }]);
  const [prodDate, setProdDate] = useState(() => todayISOInAppTZ());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [fail, setFail] = useState(null);
  const [rereading, setRereading] = useState(false);

  useEffect(() => {
    if (open) {
      setBomId(''); setQty(''); setCosts([{ label: '', amount: '' }]); setProdDate(todayISOInAppTZ());
      setNotes(''); setSaving(false); setFail(null);
    }
  }, [open]);

  const bom = boms.find((b) => b.id === bomId);
  const materials = useMemo(() => buildMaterials({ bom, qty, bomComponents, products }), [bom, qty, bomComponents, products]);
  const roll = buildRollup(materials, costs, qty);
  const notice = shortNotice(shortages(materials, products));
  const setCost = (i, k, v) => setCosts((cs) => cs.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
  const ok = !!bom && Number(qty) > 0;

  const save = async () => {
    if (!ok || saving) return;
    setSaving(true);
    setFail(null);
    try {
      const r = await createProductionOrder({
        bomId, finishedProductId: bom.finished_product_id,
        qtyProduced: Number(qty), materials,
        costs: costs.map((c) => ({ type: 'OTHER', label: c.label, amount: c.amount })),
        productionDate: prodDate, notes: notes.trim() || null,
      });
      if (r?.success) { onSaved?.(); onClose(); return; }
      console.error('[manufacturing] create build failed:', r?.error);
      setFail(classifyWriteFailure(r?.error, { noun: 'build' }));
    } finally {
      setSaving(false);
    }
  };

  const reread = async () => {
    setRereading(true);
    try { await onReread?.(); onClose(); } finally { setRereading(false); }
  };

  return (
    <MfgDialog open={open} onClose={saving ? () => {} : onClose} width={620} icon={Factory}
      title="New build" subtitle={`A production order from a ${words.lower}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!ok || saving || fail?.maySaved}>{saving ? 'Saving…' : 'Create build (draft)'}</Button>
        </>
      )}>
      <div className="mb-3">
        <Label htmlFor="build-bom">{words.one}</Label>
        <select id="build-bom" className={selCls} value={bomId} onChange={(e) => setBomId(e.target.value)}>
          <option value="">Select {words.lower}…</option>
          {boms.map((b) => <option key={b.id} value={b.id}>{b.name || productName(products, b.finished_product_id)}</option>)}
        </select>
      </div>
      {bom && (
        <div className="-mt-1 mb-3 flex items-center gap-2 text-[13px] text-body">
          <Package size={14} className="text-amber" />
          Makes <b className="font-semibold text-ink">{Number(qty) > 0 ? qtyText(qty) : qtyText(bom.output_qty)} × {productName(products, bom.finished_product_id)}</b>
          · {qtyText(bom.output_qty)} per batch
        </div>
      )}
      <div className="mb-3">
        <Label htmlFor="build-qty">Quantity to make</Label>
        <Input id="build-qty" type="number" min="1" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>

      {bom && (
        <div className="mb-3.5 mt-1 rounded-[14px] bg-tile px-4 py-3">
          <Sec>Materials used</Sec>
          {materials.length === 0 || !(Number(qty) > 0)
            ? <p className="text-[12.5px] text-mute">Enter a quantity to see materials.</p>
            : (
              <>
                {materials.map((m, i) => (
                  <div key={m.productId}
                    className={cn('grid grid-cols-[minmax(0,1fr)_auto_70px_90px] items-center gap-2.5 py-2 text-[13px] sm:grid-cols-[minmax(0,1fr)_150px_70px_90px]',
                      i > 0 && 'border-t border-sep', m.short && 'bg-[#FFF8F8]')}>
                    <span className="min-w-0 truncate">{productName(products, m.productId)}</span>
                    <span className={cn('text-right text-[12px]', m.short ? 'font-semibold text-bad-text' : 'text-mute')}>
                      {m.short ? 'Short · ' : ''}have {qtyText(m.available)}{unitSuffix(m.unit)}
                    </span>
                    <span className="text-right font-tight text-[13.5px] font-semibold tabular-nums">× {qtyText(m.quantity)}</span>
                    <span className="text-right font-tight tabular-nums text-body">{money(m.cost)}</span>
                  </div>
                ))}
                <div className="mt-1.5 border-t border-line pt-2 text-[13px]">
                  <div className="flex justify-between py-0.5 text-body"><span>Material cost</span><span className="font-tight tabular-nums">{money(roll.materialCost)}</span></div>
                  <div className="flex justify-between py-0.5 text-body"><span>Other costs</span><span className="font-tight tabular-nums">{money(roll.otherCost)}</span></div>
                  <div className="flex justify-between py-0.5 font-semibold text-ink"><span>Estimated total</span><span className="font-tight tabular-nums">{money(roll.total)}</span></div>
                  <div className="flex justify-between py-0.5 font-semibold text-amber-text"><span>Unit cost</span><span className="font-tight tabular-nums">{money(roll.unit)}</span></div>
                </div>
              </>
            )}
        </div>
      )}
      {notice && Number(qty) > 0 && <Note tone="r" title={notice.title}>{notice.text}</Note>}

      <Sec className="mt-3.5">
        Other costs
        <span className="flex-1" />
        <button type="button" onClick={() => setCosts((cs) => [...cs, { label: '', amount: '' }])}
          className="font-tight text-[12.5px] font-semibold normal-case tracking-normal text-amber-text hover:underline">+ Add</button>
      </Sec>
      {costs.map((c, i) => (
        <div key={i} className="mb-2 grid grid-cols-[minmax(0,1fr)_130px_34px] gap-2">
          <Input aria-label={`Cost ${i + 1} name`} placeholder="e.g. Labour, electricity" value={c.label} onChange={(e) => setCost(i, 'label', e.target.value)} />
          <Input aria-label={`Cost ${i + 1} amount`} type="number" min="0" placeholder="Amount" className="text-right" value={c.amount} onChange={(e) => setCost(i, 'amount', e.target.value)} />
          <button type="button" aria-label={`Remove cost ${i + 1}`} onClick={() => setCosts((cs) => cs.filter((_, idx) => idx !== i))}
            className="m-press grid h-[34px] w-[34px] place-items-center self-center rounded-full bg-well text-ink-2 hover:text-bad-text">
            <X size={14} />
          </button>
        </div>
      ))}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="build-date">Production date</Label>
          <Input id="build-date" type="date" value={prodDate} onChange={(e) => setProdDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="build-notes">Notes (optional)</Label>
          <Input id="build-notes" type="text" placeholder="Batch ref, shift…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <p className="mt-2.5 text-[12px] text-mute">
        Costs here use each material's cost price, so they are an estimate. Stock is used only when you Complete the build.
      </p>
      <FailNote fail={fail} onReread={reread} rereading={rereading} />
    </MfgDialog>
  );
}
