/**
 * VanLoadBuilder (web redesign, vehicles-11 to 14)
 * Pick products and quantities to move warehouse -> van (load) or
 * van -> warehouse (unload), then show what moved, line by line.
 *
 * Props:
 *  vehicle        — target vehicle ({ name, plate, type })
 *  warehouseItems — [{ productId, productName, available }]: what can be picked
 *  mode           — 'load' | 'unload'
 *  onSubmit       — async ({ items:[{productId,quantity}] }) → loadVan / unloadVan's own
 *                   { success, transferred, errors } (passed through untouched)
 *  fromNow / toNow — { productId: qty } at the source and destination, for the
 *                   before → after words on the results screen
 *  onRecheck      — re-read stock (after a dropped connection, or before a retry)
 *  onClose        — back to Vehicles
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Plus, Check, Warehouse } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useDialogClose } from '../hooks/useDialogClose';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { transferOutcome, retryItems, plural } from '../lib/vehiclesView';
import { BackLink, VehicleIcon, Initials, Stepper, IconBtn, Empty, Pill } from './vehicles/parts';
import WriteFailure from './invoices/WriteFailure';

const VanLoadBuilder = ({ vehicle, warehouseItems = [], onSubmit, onClose, mode = 'load', fromNow = {}, toNow = {}, onRecheck }) => {
  const unload = mode === 'unload';
  const vanName = vehicle?.name || 'Vehicle';
  const vanPlate = vehicle?.plate || vehicle?.plateNumber || '';
  const L = {
    title: `${unload ? 'Unload' : 'Load'} ${vanName}`,
    way: unload ? 'from the van back to the warehouse' : 'from the warehouse onto the van',
    list: unload ? 'Unload list' : 'Load list',
    search: unload ? 'Search van products' : 'Search warehouse products',
    tap: unload ? 'Tap products to unload' : 'Tap products to load',
    stockTag: unload ? 'on van' : 'in warehouse',
    cta: unload ? 'Unload vehicle' : 'Load vehicle',
    cap: unload ? 'Only %n on van' : 'Only %n in warehouse',
    from: unload ? vanName : 'Warehouse',
    to: unload ? 'Warehouse' : vanName,
  };
  const { addNotification } = useNotifications();
  useDialogClose(onClose, { lockScroll: false });

  const [loadList, setLoadList] = useState([]); // [{productId, name, quantity, max}]
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [done, setDone] = useState(null); // { outcome, before: {from, to} }

  const searchRef = useRef(null);
  useEffect(() => { searchRef.current?.focus(); }, []);

  const stockMap = useMemo(() => {
    const m = {};
    warehouseItems.forEach((i) => { m[i.productId] = i.available; });
    return m;
  }, [warehouseItems]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return warehouseItems;
    return warehouseItems.filter((p) => (p.productName || '').toLowerCase().includes(q));
  }, [warehouseItems, searchTerm]);

  const maxOf = (pid) => stockMap[pid] ?? 0;

  const addItem = (item) => {
    const avail = maxOf(item.productId);
    setLoadList((prev) => {
      const ex = prev.find((c) => c.productId === item.productId);
      if (ex) {
        if (ex.quantity >= avail) { addNotification(L.cap.replace('%n', avail), 'error'); return prev; }
        return prev.map((c) => (c.productId === item.productId ? { ...c, quantity: c.quantity + 1 } : c));
      }
      if (avail <= 0) { addNotification(`${item.productName} out of stock`, 'error'); return prev; }
      return [...prev, { productId: item.productId, name: item.productName, quantity: 1, max: avail }];
    });
  };

  const stepQty = (pid, delta) => {
    const avail = maxOf(pid);
    setLoadList((prev) => prev.map((c) => {
      if (c.productId !== pid) return c;
      const next = Math.max(0, c.quantity + delta);
      if (next > avail) { addNotification(L.cap.replace('%n', avail), 'error'); return c; }
      return { ...c, quantity: next };
    }).filter((c) => c.quantity > 0));
  };

  const setQty = (pid, val) => {
    const qty = parseInt(val, 10);
    if (isNaN(qty) || qty < 0) return;
    const avail = maxOf(pid);
    if (qty === 0) { setLoadList((prev) => prev.filter((c) => c.productId !== pid)); return; }
    if (qty > avail) {
      addNotification(L.cap.replace('%n', avail), 'error');
      setLoadList((prev) => prev.map((c) => (c.productId === pid ? { ...c, quantity: avail } : c)));
      return;
    }
    setLoadList((prev) => prev.map((c) => (c.productId === pid ? { ...c, quantity: qty } : c)));
  };

  const removeItem = (pid) => setLoadList((prev) => prev.filter((c) => c.productId !== pid));
  const totalUnits = loadList.reduce((s, c) => s + c.quantity, 0);

  /** Send lines through onSubmit and show the per-line results. */
  const send = async (lines) => {
    if (submitting || !lines.length) return;
    setSubmitError(null);
    setSubmitting(true);
    const before = { from: { ...fromNow }, to: { ...toNow } };
    try {
      const result = await onSubmit({ items: lines.map((c) => ({ productId: c.productId, quantity: c.quantity })) });
      setDone({ outcome: transferOutcome(lines, result), before });
    } catch (err) {
      // Thrown before any line could be reported: nothing to show per line.
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Results (vehicles-12, 13) ─────────────────────────────────────── */
  if (done) {
    const o = done.outcome;
    const all = o.lines.length;
    const full = o.movedCount === all;
    const retry = unload ? [] : retryItems(o.failed, fromNow);
    const retryLabel = retry.length === 1
      ? (retry[0].quantity < retry[0].asked ? `Load ${retry[0].quantity} ${retry[0].name} instead` : `Try ${retry[0].name} again`)
      : 'Load the rest again';
    return (
      <div className="mx-auto max-w-[880px] pb-16">
        <div className={cn('m-rise mb-4 flex flex-wrap items-center gap-4 rounded-2xl px-[22px] py-5', full ? 'bg-good-soft' : 'bg-amber-soft')}>
          <span className={cn('grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full', full ? 'bg-good' : 'bg-amber')}>
            {full ? <Check size={22} strokeWidth={2.6} className="text-white" /> : <span className="font-tight text-[20px] font-bold text-white">!</span>}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-tight text-[20px] font-semibold tracking-[-0.02em]">
              {full
                ? `${vanName} ${unload ? 'unloaded' : 'loaded'} · ${plural(o.movedUnits, 'unit')}`
                : `${o.movedCount} of ${plural(all, 'product')} ${unload ? 'unloaded' : 'loaded'} · ${plural(o.movedUnits, 'unit')}`}
            </h3>
            <p className={cn('mt-0.5 text-[13px]', full ? 'text-good-text' : 'text-amber-text')}>
              {full
                ? `${plural(all, 'product')} moved ${unload ? `from ${vanPlate || vanName} back to the warehouse` : `from the warehouse to ${vanPlate || vanName}`}`
                : [o.failed.length > 0 && `${o.failed.map((l) => l.name).join(', ')} did not move.`,
                  o.unconfirmed.length > 0 && `${o.unconfirmed.map((l) => l.name).join(', ')} could not be confirmed: check the van stock before trying again.`].filter(Boolean).join(' ')}
            </p>
          </div>
          {full && <Button variant="dark" onClick={onClose}>Done</Button>}
        </div>
        <div className="m-rise overflow-hidden rounded-[14px] border border-line bg-surface" style={{ '--i': 1 }}>
          {o.lines.map((l) => {
            const f = done.before.from[l.productId]; const t = done.before.to[l.productId] ?? 0;
            const moved = l.status === 'moved';
            return (
              <div key={l.productId} className={cn('grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-sep px-4 py-[11px] text-[13px] first:border-t-0', l.status === 'failed' && 'bg-[#FFFBFB]')}>
                <div className="min-w-0">
                  <b className="block font-tight text-[13.5px] font-semibold">{l.name}</b>
                  {moved
                    ? <small className="text-[12px] text-mute tabular-nums">{f !== undefined && `${L.from} ${f} → ${f - l.quantity} · `}{L.to} {t} → {t + l.quantity}</small>
                    : <small className={cn('block break-words text-[12px]', l.status === 'failed' ? 'text-bad-text' : 'text-amber-text')}>{l.reason || 'The server did not say why.'}</small>}
                </div>
                <span className="font-tight font-semibold tabular-nums">× {l.quantity}</span>
                {moved ? <Pill tone="good">Moved</Pill> : l.status === 'failed' ? <Pill tone="bad">Not moved</Pill> : <Pill tone="warn">Not confirmed</Pill>}
              </div>
            );
          })}
        </div>
        {o.general.length > 0 && <p className="mt-2.5 text-[12.5px] text-bad-text break-words">{o.general.join(' · ')}</p>}
        {!full && (
          <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2.5">
            {o.unconfirmed.length > 0 && onRecheck && <Button variant="secondary" onClick={onRecheck}>Check stock again</Button>}
            <Button variant="secondary" onClick={onClose}>Done</Button>
            {retry.length > 0 && <Button disabled={submitting} onClick={() => send(retry)}>{submitting ? 'Working…' : retryLabel}</Button>}
          </div>
        )}
      </div>
    );
  }

  /* ── Pick (vehicles-11, 14) ─────────────────────────────────────────── */
  return (
    <div className="pb-16">
      <BackLink onClick={onClose} />
      <div className="m-rise mb-4 flex items-center gap-3" style={{ '--i': 0 }}>
        <VehicleIcon type={vehicle?.type} />
        <div>
          <h3 className="font-tight text-[20px] font-semibold leading-tight tracking-[-0.02em]">{L.title}</h3>
          <p className="mt-0.5 text-[13px] text-body">{[vanPlate, L.way].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      {warehouseItems.length === 0 ? (
        <Empty icon={Warehouse} title={unload ? 'Nothing on this vehicle' : 'No warehouse stock to load'} className="m-rise">
          {unload ? 'There is nothing on the van to take off.' : 'Add stock in Inventory or record a purchase first.'}
        </Empty>
      ) : (
        <div className="m-rise grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]" style={{ '--i': 1 }}>
          <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
            <div className="relative m-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" size={16} />
              <input ref={searchRef} type="text" aria-label={L.search} placeholder={L.search} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 w-full rounded-pill bg-well pl-10 pr-9 text-[13px] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
              {searchTerm && <button type="button" aria-label="Clear search" onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-mute hover:text-ink"><X size={14} /></button>}
            </div>
            <div className="px-4 pb-2 text-[12px] text-mute">{L.tap}</div>
            {filtered.length === 0 && <p className="border-t border-sep px-4 py-10 text-center text-[13px] text-mute">No products match “{searchTerm}”</p>}
            {filtered.map((item) => {
              const stock = item.available ?? 0;
              const out = stock <= 0;
              const inList = loadList.find((c) => c.productId === item.productId);
              return (
                <button key={item.productId} type="button" disabled={out} onClick={() => addItem(item)}
                  className={cn('grid w-full grid-cols-[34px_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-sep px-4 py-2.5 text-left text-[13px] hover:bg-tile disabled:opacity-45', inList && 'bg-[#FFFBF4]')}>
                  <Initials name={item.productName} />
                  <div className="min-w-0"><b className="block truncate font-tight text-[13.5px] font-semibold">{item.productName}</b><small className="text-[12px] text-mute">{out ? 'None left' : `${stock} ${L.stockTag}`}</small></div>
                  {inList ? <span className="grid h-[22px] min-w-6 place-items-center rounded-pill bg-amber px-[7px] font-tight text-[12px] font-semibold text-white tabular-nums">{inList.quantity}</span> : <span />}
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-well text-ink-2" aria-hidden="true"><Plus size={14} /></span>
                </button>
              );
            })}
          </div>

          <div className="rounded-[14px] border border-line bg-surface lg:sticky lg:top-4">
            <div className="flex items-center gap-2 px-[18px] pt-4 pb-2.5">
              <h3 className="font-tight text-[16px] font-semibold">{L.list}</h3><span className="flex-1" />
              <span className="text-[12px] text-mute">{plural(loadList.length, 'product')}</span>
            </div>
            {loadList.length === 0 && <p className="border-t border-sep px-[18px] py-8 text-center text-[13px] text-mute">{L.tap}</p>}
            {loadList.map((item) => (
              <div key={item.productId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 border-t border-sep px-[18px] py-2.5">
                <div className="min-w-0"><b className="block truncate font-tight text-[13.5px] font-semibold">{item.name}</b><small className="text-[12px] text-mute">{L.cap.replace('%n', item.max)}</small></div>
                <Stepper value={item.quantity} label={item.name} onMinus={() => stepQty(item.productId, -1)} onPlus={() => stepQty(item.productId, 1)} onType={(v) => setQty(item.productId, v)} />
                <IconBtn label={`Remove ${item.name}`} onClick={() => removeItem(item.productId)} className="h-7 w-7"><X /></IconBtn>
              </div>
            ))}
            <div className="border-t border-line px-[18px] pt-3.5 pb-[18px]">
              <div className="flex items-baseline justify-between font-tight text-[15px] font-semibold">
                <span>Total</span><span className="text-[24px] tracking-[-0.02em] tabular-nums">{plural(totalUnits, 'unit')}</span>
              </div>
              {submitError && <WriteFailure error={submitError} noun={unload ? 'unload' : 'load'} onReread={onRecheck} className="mt-3" />}
              <Button size="lg" className="mt-3.5 w-full" disabled={!loadList.length || submitting} onClick={() => send(loadList)}>
                {submitting ? 'Working…' : L.cta}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VanLoadBuilder;
