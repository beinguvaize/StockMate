import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { describeTransferError } from '../../../lib/transferRefusal';
import {
  X, ChevronLeft, ArrowRight, AlertCircle, Loader2, CheckCircle2,
  Warehouse, Truck, Search, ChevronDown,
} from 'lucide-react';

/**
 * Moving stock from one of the shop's locations to another.
 * ==========================================================================
 *
 * A shop with two stores has had no way to do this. The hook called an RPC
 * that did not exist, and no screen called the hook.
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
 * Two people transferring the same stock at once is exactly the case a local
 * check gets wrong.
 */

const LOCATION_ICON = { VEHICLE: Truck, WAREHOUSE: Warehouse };

export default function TransferStockModal({
  products = [],
  locations = [],
  balances = [],
  onTransfer,
  onClose,
  userId,
}) {
  useDialogClose(onClose);

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
  }, [products, fromId, search, stockAt]);

  const product = products.find(p => p.id === productId) || null;
  const available = product ? at(fromId, product.id) : 0;
  const destHas = product && toId ? at(toId, product.id) : 0;
  const qtyNum = parseFloat(qty) || 0;
  const unit = product?.unit || 'pcs';

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
  if (locations.length < 2) return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas animate-fade-in">
      <Header title="Transfer Stock" onClose={onClose} />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-3 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-canvas border border-border/60 flex items-center justify-center mx-auto">
            <Warehouse size={26} className="text-muted-foreground" />
          </div>
          <p className="text-base font-semibold text-foreground">Only one location</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A transfer moves stock between two of your places. Add a second one in
            Settings → Locations, then come back.
          </p>
          <button onClick={onClose} className="btn-signature w-full text-xs font-semibold h-11 rounded-2xl">Close</button>
        </div>
      </div>
    </div>,
    document.body
  );

  /* ── Done ── */
  if (done) return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas animate-fade-in">
      <Header title="Transfer Stock" onClose={onClose} />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-5 max-w-sm w-full">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <div>
            <p data-testid="transfer-done" className="text-base font-semibold text-foreground">Stock Moved</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              <span className="font-semibold text-foreground">{done.qty} {done.unit}</span> of{' '}
              <span className="font-semibold text-foreground">{done.name}</span> moved from{' '}
              <span className="font-semibold text-foreground">{done.from}</span> to{' '}
              <span className="font-semibold text-foreground">{done.to}</span>.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setDone(null)}
              className="flex-1 h-12 rounded-pill border border-border/60 bg-card text-xs font-semibold text-foreground hover:bg-black/[0.03] transition-colors">
              Move something else
            </button>
            <button onClick={onClose} className="btn-signature flex-1 text-xs font-semibold h-12 rounded-pill">Done</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  /* ── Main form ── */
  return createPortal(
    <div data-testid="transfer-modal" className="fixed inset-0 z-50 flex flex-col bg-canvas animate-fade-in">
      <Header title="Transfer Stock" subtitle="Move stock between your locations" onClose={onClose} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-6 space-y-6">

          {/* ── From / To ── */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-3">
              Route
            </label>
            <div className="flex items-stretch gap-2">
              <LocationPicker
                label="From"
                value={fromId}
                locations={locations}
                onChange={(id) => { setFromId(id); setProductId(''); setQty(''); }}
              />
              <button
                onClick={swap}
                title="Swap source and destination"
                className="w-10 shrink-0 self-center h-10 rounded-xl border border-border/60 bg-card flex items-center justify-center text-muted-foreground hover:bg-black/5 hover:text-foreground transition-colors active:scale-[0.96]"
              >
                <ArrowRight size={15} />
              </button>
              <LocationPicker
                label="To"
                value={toId}
                locations={locations}
                onChange={setToId}
                invalid={samePlace}
              />
            </div>
            {samePlace && (
              <p className="text-[10px] text-rose-500 font-semibold mt-2 flex items-center gap-1">
                <AlertCircle size={11} /> Pick two different places — stock cannot move to where it already is
              </p>
            )}
          </div>

          {/* ── Product ── */}
          <div>
            <div className="flex items-baseline justify-between mb-2 gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Product
              </label>
              <span className="text-[10px] text-muted-foreground">
                in stock at {locName(fromId)}
              </span>
            </div>

            {product ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border shadow-sm rounded-2xl">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {product.sku || '—'} · {available} {unit} at {locName(fromId)}
                    {toId && !samePlace && <> · {destHas} {unit} at {locName(toId)}</>}
                  </p>
                </div>
                <button
                  onClick={() => { setProductId(''); setQty(''); setProblem(null); }}
                  className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-black/5 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search name, SKU or barcode…"
                    className="w-full pl-10 pr-4 py-3 bg-card border border-border shadow-sm rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-accent-signature/25 transition-all"
                  />
                </div>
                <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-border/60 divide-y divide-border/60 bg-card">
                  {candidates.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[11px] text-muted-foreground">
                      {search.trim()
                        ? `Nothing matching “${search.trim()}” is in stock at ${locName(fromId)}.`
                        : `Nothing is in stock at ${locName(fromId)} yet.`}
                    </p>
                  ) : candidates.map(p => (
                    <button
                      key={p.id}
                      data-testid="transfer-candidate"
                      onClick={() => { setProductId(p.id); setProblem(null); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas transition-colors"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-foreground truncate">{p.name}</span>
                        <span className="block text-[10px] text-muted-foreground">{p.sku || '—'}</span>
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground">
                        {at(fromId, p.id)} <span className="font-normal text-muted-foreground">{p.unit || 'pcs'}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Quantity ── */}
          {product && (
            <div>
              <div className="flex items-baseline justify-between mb-2 gap-2">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Quantity to move
                </label>
                <button
                  onClick={() => setQty(String(available))}
                  className="text-[10px] font-semibold text-accent-signature hover:underline"
                >
                  Move all {available}
                </button>
              </div>
              <input
                data-testid="transfer-qty"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={qty}
                onChange={e => { setQty(e.target.value); setProblem(null); }}
                placeholder="0"
                className="w-full text-center text-2xl font-semibold bg-card border border-border shadow-sm rounded-2xl py-3 outline-none focus:ring-2 focus:ring-accent-signature/25 transition-all tabular-nums"
              />
              {overDraw && (
                <p className="text-[10px] text-rose-500 font-semibold mt-2 flex items-center gap-1">
                  <AlertCircle size={11} /> Only {available} {unit} at {locName(fromId)}
                </p>
              )}

              {/* Before / after at both ends, so the move is answerable before
                  it is made rather than checked afterwards. */}
              {qtyNum > 0 && !overDraw && !samePlace && (
                <div className="flex items-center gap-3 px-4 py-3.5 mt-3 bg-card border border-border shadow-sm rounded-2xl">
                  <div className="flex-1 text-center min-w-0">
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest mb-0.5 truncate">{locName(fromId)}</p>
                    <p className="text-lg font-semibold text-foreground tabular-nums">{available} → {available - qtyNum}</p>
                    <p className="text-[9px] text-muted-foreground font-medium">{unit}</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent-signature/10 text-accent-signature tabular-nums">
                      {qtyNum}
                    </span>
                    <ArrowRight size={14} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 text-center min-w-0">
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest mb-0.5 truncate">{locName(toId)}</p>
                    <p className="text-lg font-semibold text-foreground tabular-nums">{destHas} → {destHas + qtyNum}</p>
                    <p className="text-[9px] text-muted-foreground font-medium">{unit}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Note ── */}
          {product && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-2">
                Note <span className="font-medium normal-case tracking-normal text-muted-foreground">· shown on both stock movements</span>
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Topping up the second counter"
                className="w-full bg-card border border-border shadow-sm rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-accent-signature/25 transition-all"
              />
            </div>
          )}

          {/* ── What the server said, kept word for word ── */}
          {problem && (
            <div data-testid="transfer-problem" className={`rounded-2xl border px-4 py-3 ${
              problem.refused
                ? 'bg-amber-50 border-amber-200'
                : 'bg-rose-50 border-rose-200'
            }`}>
              <p className={`text-xs font-semibold flex items-center gap-1.5 ${
                problem.refused ? 'text-amber-800' : 'text-rose-700'
              }`}>
                <AlertCircle size={13} /> {problem.title}
              </p>
              {problem.detail && (
                <p className={`text-[11px] mt-1 leading-relaxed ${
                  problem.refused ? 'text-amber-800/90' : 'text-rose-700/90'
                }`}>
                  {problem.detail}
                </p>
              )}
              {!problem.refused && (
                <p className="text-[10px] text-rose-700/80 mt-1.5">
                  Nothing was moved. Check the stock at both places before trying again.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="max-w-lg mx-auto px-6 pb-8">
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="btn-signature w-full flex items-center justify-center gap-2 text-xs font-semibold h-12 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Moving…</>
              : <><ArrowRight size={14} /> Move Stock</>
            }
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Header({ title, subtitle, onClose }) {
  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b border-border/60 bg-card shrink-0">
      <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/60 hover:bg-canvas transition-all text-foreground shrink-0">
        <ChevronLeft size={18} />
      </button>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-foreground leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">{subtitle}</p>
        )}
      </div>
      <button onClick={onClose} className="ml-auto w-8 h-8 flex items-center justify-center rounded-xl hover:bg-black/5 transition-all text-muted-foreground shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}

function LocationPicker({ label, value, locations, onChange, invalid }) {
  const current = locations.find(l => l.id === value);
  const Icon = LOCATION_ICON[current?.type] || Warehouse;
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 px-1">{label}</p>
      <div className={`flex items-center gap-2 bg-card border shadow-sm rounded-2xl px-3 ${
        invalid ? 'border-rose-300' : 'border-border'
      }`}>
        <Icon size={15} className="text-muted-foreground shrink-0" />
        <select
          data-testid={`transfer-${label.toLowerCase()}`}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent py-3 text-sm font-semibold text-foreground outline-none appearance-none truncate"
        >
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {/* appearance-none strips the native arrow, and without one the field
            reads as a label rather than something to choose from. */}
        <ChevronDown size={14} className="text-muted-foreground shrink-0 pointer-events-none" />
      </div>
    </div>
  );
}
