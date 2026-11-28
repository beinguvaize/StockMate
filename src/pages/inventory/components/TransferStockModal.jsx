import React, { useState, useMemo } from 'react';
import { describeTransferError } from '../../../lib/transferRefusal';
import { X, AlertCircle, ArrowLeftRight, Search, CheckCircle2, Warehouse } from 'lucide-react';
import Dialog from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { ProductAvatar, Label, Hint, Select, BigQty, BeforeAfter, BASide } from './parts';

/**
 * Moving stock from one of the shop's locations to another (approved
 * inventory-13).
 * ==========================================================================
 *
 * WHAT THIS SCREEN IS CAREFUL ABOUT
 *
 * It shows the quantity AT THE SOURCE, not the product's total stock. Those
 * are different numbers the moment a shop has two locations, and a transfer
 * form that shows the total invites the user to move stock that is standing
 * somewhere else. The source figure is also what the server checks, so the
 * form and the refusal agree.
 *
 * It does not pre-empt the server's rule. The button is disabled for things
 * that are plainly wrong (no product, same place, zero), but the authority on
 * "is there enough" is `transfer_inventory_atomic`, which locks the row first.
 */
export default function TransferStockModal({
  products = [],
  locations = [],
  balances = [],
  onTransfer,
  onClose,
  userId,
}) {
  const [fromId, setFromId] = useState(locations[0]?.id || '');
  const [toId, setToId] = useState(locations[1]?.id || '');
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null); // { title, detail, refused }
  const [done, setDone] = useState(null);       // { name, qty, from, to }

  /** Quantity on hand per product at a given location. */
  const stockAt = useMemo(() => {
    const m = new Map();
    for (const b of balances) {
      m.set(`${b.location_id}::${b.product_id}`, Number(b.quantity) || 0);
    }
    return m;
  }, [balances]);

  const at = (locId, prodId) => stockAt.get(`${locId}::${prodId}`) || 0;

  const locName = (id) => locations.find(l => l.id === id)?.name || '—';

  /**
   * Only what is actually standing at the source is offered. A product with
   * nothing there cannot be transferred from there, and listing it would put
   * the user's first attempt straight into a refusal.
   */
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter(p => at(fromId, p.id) > 0)
      .filter(p => !q || `${p.name || ''} ${p.sku || ''} ${p.barcode || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .slice(0, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, fromId, search, stockAt]);

  const product = products.find(p => p.id === productId) || null;
  const available = product ? at(fromId, product.id) : 0;
  const destHas = product && toId ? at(toId, product.id) : 0;
  const qtyNum = parseFloat(qty) || 0;
  const unit = (product?.unit || 'pcs').toUpperCase();

  const samePlace = Boolean(fromId) && fromId === toId;
  const overDraw = qtyNum > available;
  const canSubmit = Boolean(product) && Boolean(fromId) && Boolean(toId)
    && !samePlace && qtyNum > 0 && !overDraw && !saving;

  const swap = () => { setFromId(toId); setToId(fromId); setProductId(''); setQty(''); };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setProblem(null);
    const { error } = await onTransfer(product.id, fromId, toId, qtyNum, { note, userId });
    setSaving(false);
    if (error) {
      // The form is left exactly as it was: a refusal is one number away from
      // a valid transfer, and clearing it would make the user start again.
      setProblem(describeTransferError(error));
      return;
    }
    setDone({ name: product.name, qty: qtyNum, unit, from: locName(fromId), to: locName(toId) });
    setProductId(''); setQty(''); setNote(''); setSearch('');
  };

  /* ── Not enough places to move anything between ── */
  if (locations.length < 2) {
    return (
      <Dialog open onClose={onClose} title="Transfer Stock" footer={<Button onClick={onClose}>Close</Button>}>
        <div className="py-4 text-center">
          <span className="mx-auto mb-3 grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-tile text-mute"><Warehouse size={22} strokeWidth={1.7} /></span>
          <b className="block font-tight text-[15px] font-semibold">Only one location</b>
          <p className="mt-1 text-[13px] text-body">
            A transfer moves stock between two of your places. Add a second one in
            Settings, Locations, then come back.
          </p>
        </div>
      </Dialog>
    );
  }

  /* ── Done ── */
  if (done) {
    return (
      <Dialog open onClose={onClose} title="Stock moved"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDone(null)}>Move something else</Button>
            <Button onClick={onClose}>Done</Button>
          </>
        )}>
        <div className="flex items-start gap-3 rounded-xl bg-good-soft px-3.5 py-3 text-[13px] text-good-text">
          <CheckCircle2 size={20} className="mt-px shrink-0" />
          <p data-testid="transfer-done" className="leading-relaxed">
            <b className="font-tight font-semibold">{done.qty} {done.unit}</b> of{' '}
            <b className="font-tight font-semibold">{done.name}</b> moved from{' '}
            <b className="font-tight font-semibold">{done.from}</b> to{' '}
            <b className="font-tight font-semibold">{done.to}</b>.
          </p>
        </div>
      </Dialog>
    );
  }

  /* ── Main form ── */
  return (
    <Dialog open onClose={onClose} width={560} title="Transfer Stock" subtitle="Move stock between your locations">
      <div data-testid="transfer-modal">
        {/* From / To */}
        <div className="grid grid-cols-[1fr_36px_1fr] items-end gap-2">
          <div className="min-w-0">
            <Label htmlFor="tr-from">From</Label>
            <Select id="tr-from" data-testid="transfer-from" value={fromId}
              onChange={(e) => { setFromId(e.target.value); setProductId(''); setQty(''); }}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
          <button type="button" onClick={swap} title="Swap source and destination" aria-label="Swap source and destination"
            className="m-press grid h-9 w-9 place-items-center rounded-xl bg-well text-ink-2 hover:bg-[#E8E8E7]">
            <ArrowLeftRight size={15} />
          </button>
          <div className="min-w-0">
            <Label htmlFor="tr-to">To</Label>
            <Select id="tr-to" data-testid="transfer-to" value={toId} onChange={(e) => setToId(e.target.value)}
              className={samePlace ? 'shadow-[inset_0_0_0_2px_var(--color-bad)]' : ''}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
        </div>
        {samePlace && (
          <p className="mt-2 flex items-center gap-1 text-[12.5px] font-medium text-bad-text">
            <AlertCircle size={13} /> Pick two different places — stock cannot move to where it already is
          </p>
        )}

        {/* Product */}
        <div className="mt-4 mb-1.5 flex items-baseline justify-between gap-2.5">
          <span className="font-tight text-[12.5px] font-semibold text-ink-2">Product</span>
          <span className="text-[12px] text-mute">In stock at {locName(fromId)}</span>
        </div>
        {product ? (
          <div className="flex items-center gap-[11px] rounded-xl px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
            <ProductAvatar product={product} />
            <div className="min-w-0 flex-1">
              <b className="block truncate font-tight text-[13.5px] font-semibold">{product.name}</b>
              <small className="block text-[12px] text-mute tabular-nums">
                {product.sku || '—'} · {available} {unit} at {locName(fromId)}
                {toId && !samePlace && <> · {destHas} {unit} at {locName(toId)}</>}
              </small>
            </div>
            <Button variant="secondary" size="icon-sm" className="h-7 w-7" aria-label="Change product"
              onClick={() => { setProductId(''); setQty(''); setProblem(null); }}><X size={14} /></Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                aria-label="Search name, SKU or barcode" placeholder="Search name, SKU or barcode…"
                className="h-9 w-full rounded-pill bg-well pl-10 pr-4 text-[13px] text-ink outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl shadow-[inset_0_0_0_1px_var(--color-line)]">
              {candidates.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12.5px] text-mute">
                  {search.trim()
                    ? `Nothing matching “${search.trim()}” is in stock at ${locName(fromId)}.`
                    : `Nothing is in stock at ${locName(fromId)} yet.`}
                </p>
              ) : candidates.map(p => (
                <button key={p.id} type="button" data-testid="transfer-candidate"
                  onClick={() => { setProductId(p.id); setProblem(null); }}
                  className="flex w-full items-center gap-3 border-t border-sep px-3.5 py-2 text-left first:border-t-0 hover:bg-tile">
                  <ProductAvatar product={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-tight text-[13px] font-semibold text-ink">{p.name}</span>
                    <span className="block text-[11.5px] text-mute">{p.sku || '—'}</span>
                  </span>
                  <span className="shrink-0 font-tight text-[12.5px] font-semibold tabular-nums text-ink">
                    {at(fromId, p.id)} <span className="font-normal text-mute">{(p.unit || 'pcs').toUpperCase()}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Quantity */}
        {product && (
          <>
            <div className="mt-4 mb-1.5 flex items-baseline justify-between gap-2.5">
              <label htmlFor="tr-qty" className="font-tight text-[12.5px] font-semibold text-ink-2">Quantity to move</label>
              <button type="button" onClick={() => setQty(String(available))}
                className="font-tight text-[12.5px] font-semibold text-amber-text hover:underline">Move all {available}</button>
            </div>
            <BigQty id="tr-qty" label="Quantity to move" value={qty}
              onChange={(v) => { setQty(v); setProblem(null); }}
              onStep={(d) => { setQty(String(Math.max(0, (parseFloat(qty) || 0) + d))); setProblem(null); }}
              inputProps={{ 'data-testid': 'transfer-qty', step: 'any' }} />
            {overDraw && (
              <p className="mt-2 flex items-center gap-1 text-[12.5px] font-medium text-bad-text">
                <AlertCircle size={13} /> Only {available} {unit} at {locName(fromId)}
              </p>
            )}
            {/* Before / after at both ends, so the move is answerable before
                it is made rather than checked afterwards. */}
            {qtyNum > 0 && !overDraw && !samePlace && (
              <BeforeAfter
                left={<BASide label={locName(fromId)} value={`${available} → ${available - qtyNum}`} unit={unit} />}
                right={<BASide label={locName(toId)} value={`${destHas} → ${destHas + qtyNum}`} unit={unit} />}
                delta={qtyNum} deltaTone="a" />
            )}

            <Label htmlFor="tr-note" className="mt-3.5">Note, shown on both stock movements</Label>
            <input id="tr-note" type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Topping up the second counter"
              className="h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
          </>
        )}

        {/* What the server said, kept word for word */}
        {problem && (
          <div data-testid="transfer-problem" role="alert"
            className={cn('mt-3 rounded-xl px-3.5 py-3 text-[12.5px]', problem.refused ? 'bg-amber-soft text-amber-text' : 'bg-bad-soft text-bad-text')}>
            <b className="flex items-center gap-1.5 font-tight text-[13px] font-semibold"><AlertCircle size={13} /> {problem.title}</b>
            {problem.detail && <span className="mt-1 block leading-relaxed">{problem.detail}</span>}
            {!problem.refused && (
              <Hint className="text-current opacity-80">Check the stock at both places before trying again.</Hint>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2 [&>*]:flex-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>{saving ? 'Moving…' : 'Move stock'}</Button>
        </div>
      </div>
    </Dialog>
  );
}
