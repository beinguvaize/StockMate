import React, { useState } from 'react';
import { Truck, Trash2, AlertOctagon, CheckCircle2 } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import HoldButton from '../motion/HoldButton';
import WriteFailure from '../invoices/WriteFailure';
import { DialogIcon } from '../estimates/parts';
import { rupees2 } from '../estimates/parts';
import {
  VEHICLE_TYPES, FUEL_TYPES, VEHICLE_STATUSES, TYPE_LABEL, FUEL_LABEL, STATUS, EMPTY_VEHICLE_FORM, vehicleFormOf,
  vehiclePayload, statusOf, FAILED_REASONS, invoiceNo, loadedOf, returnedStockOf, tripCounts, plural,
} from '../../lib/vehiclesView';
import { Field, inputCls, Note, Sec } from './parts';
import { cn } from '../../lib/utils';

const Head = ({ tone, icon, title, sub }) => (
  <div className="flex items-center gap-3">
    <DialogIcon tone={tone}>{icon}</DialogIcon>
    <div className="min-w-0">
      <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">{title}</h3>
      {sub && <p className="mt-0.5 text-[13px] text-body tabular-nums">{sub}</p>}
    </div>
  </div>
);

/** Run a write; keep the dialog open with the real reason when it fails. */
const useWrite = (noun) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn, onDone) => {
    setBusy(true); setError(null);
    let res;
    try { res = await fn(); } catch (e) { res = { success: false, error: e }; }
    setBusy(false);
    if (res?.success === false || res?.error) {
      console.error(`[vehicles] ${noun} failed`, res?.error);
      setError(res?.error || new Error('The server did not say why.'));
      return;
    }
    onDone?.();
  };
  return { busy, error, run };
};

/** Add / edit vehicle (vehicles-07, 08). */
export function VehicleFormDialog({ vehicle, onSave, onClose, onReread }) {
  const editing = !!vehicle;
  const [form, setForm] = useState(() => (editing ? vehicleFormOf(vehicle) : EMPTY_VEHICLE_FORM));
  const { busy, error, run } = useWrite(editing ? 'vehicle edit' : 'new vehicle');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    const payload = vehiclePayload(form);
    run(() => onSave(editing ? { ...vehicle, ...payload } : payload, editing), onClose);
  };
  const sel = (k, list, labels) => (
    <select className={cn(inputCls(), 'appearance-none')} value={form[k]} onChange={set(k)}>
      {list.map((x) => <option key={x} value={x}>{labels[x]?.label || labels[x] || x}</option>)}
    </select>
  );
  return (
    <Dialog open onClose={busy ? () => {} : onClose} width={600} label={editing ? `Edit ${vehicle.name}` : 'Add vehicle'}
      header={<Head tone="neutral" icon={<Truck />} title={editing ? `Edit ${vehicle.name}` : 'Add vehicle'} sub={editing ? vehicle.plate : 'For deliveries and van sales'} />}>
      <form onSubmit={submit}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Vehicle name" req className="sm:col-span-2">
            <input required className={inputCls()} placeholder="e.g. Delivery van 1" value={form.name} onChange={set('name')} autoFocus />
          </Field>
          <Field label="Number plate" req><input required className={inputCls()} placeholder="e.g. KA 01 AB 1234" value={form.plate} onChange={set('plate')} /></Field>
          <Field label="Type">{sel('type', VEHICLE_TYPES, TYPE_LABEL)}</Field>
          <Field label="Status">{sel('status', VEHICLE_STATUSES, STATUS)}</Field>
          <Field label="Fuel">{sel('fuelType', FUEL_TYPES, FUEL_LABEL)}</Field>
          <Field label="Usual driver (optional)"><input className={inputCls()} placeholder="e.g. Staff name" value={form.driverName} onChange={set('driverName')} /></Field>
          <Field label="Capacity"><input type="number" min="0" className={inputCls()} placeholder="e.g. 100" value={form.capacity} onChange={set('capacity')} /></Field>
          <Field label="Colour"><input className={inputCls()} placeholder="e.g. White" value={form.color} onChange={set('color')} /></Field>
          <Field label="Year"><input type="number" min="1990" max="2099" className={inputCls()} placeholder="e.g. 2022" value={form.year} onChange={set('year')} /></Field>
          <Field label="Last service"><input type="date" className={inputCls()} value={form.lastServiceDate} onChange={set('lastServiceDate')} /></Field>
          <Field label="Next service" hint="Shows a reminder 7 days before"><input type="date" className={inputCls()} value={form.nextServiceDate} onChange={set('nextServiceDate')} /></Field>
        </div>
        {error && <WriteFailure error={error} noun="vehicle" onReread={() => { onReread?.(); onClose(); }} className="mt-3" />}
        <div className="mt-5 flex gap-2 [&>*]:flex-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add vehicle'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Delete vehicle (vehicles-09). Hold to confirm; refused while on a trip or with stock on board. */
export function DeleteVehicleDialog({ vehicle, units, blocked, onDelete, onClose, onReread }) {
  const { busy, error, run } = useWrite('vehicle delete');
  if (!vehicle) return null;
  return (
    <Dialog open onClose={busy ? () => {} : onClose} width={460} label={`Delete ${vehicle.name}`}
      header={<Head tone="bad" icon={<Trash2 />} title={`Delete ${vehicle.name}?`}
        sub={[vehicle.plate, statusOf(vehicle.status).label, `${plural(units, 'unit')} on board`].filter(Boolean).join(' · ')} />}>
      <p className="text-[14px] text-ink-2">The vehicle is taken off your Fleet list. Its past trips stay in History.</p>
      <Note tone={blocked ? 'warn' : 'neutral'} className="mt-3">
        {blocked ? <><b>This vehicle cannot be deleted now.</b> {blocked}</> : 'A vehicle that is on a trip or still has stock on board cannot be deleted. End the trip or unload it first.'}
      </Note>
      {error && <WriteFailure error={error} noun="delete" onReread={() => { onReread?.(); onClose(); }} className="mt-3" />}
      <div className="mt-5 flex gap-2 [&>*]:flex-1">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <HoldButton onConfirm={() => run(() => onDelete(vehicle), onClose)} disabled={busy || !!blocked} title="Hold 1.5s to delete this vehicle"
          className="inline-flex h-10 items-center justify-center rounded-pill bg-bad-soft px-[18px] font-tight text-[13.5px] font-semibold text-bad-text disabled:opacity-50">
          <Trash2 size={15} /> {busy ? 'Deleting…' : 'Hold to delete'}
        </HoldButton>
      </div>
    </Dialog>
  );
}

/** Delivery failed (vehicles-02): back to Pending with a reason. */
export function FailedDeliveryDialog({ invoice, sym, onConfirm, onClose, onReread }) {
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const { busy, error, run } = useWrite('re-queue');
  if (!invoice) return null;
  const reason = choice === 'Other' ? other.trim() : choice;
  return (
    <Dialog open onClose={busy ? () => {} : onClose} width={460} label="Delivery failed"
      header={<Head tone="bad" icon={<AlertOctagon />} title="Delivery failed"
        sub={`${invoiceNo(invoice)} · ${invoice.client_name || '—'} · ${rupees2(invoice.grand_total, sym)}`} />}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" disabled={!reason || busy} onClick={() => run(() => onConfirm(invoice, reason), onClose)}>
            {busy ? 'Putting back…' : 'Put back in queue'}
          </Button>
        </>
      )}>
      <p className="mb-3.5 text-[13.5px] text-ink-2">The order goes back to <b>Pending</b> and waits for the next van. Nothing is charged or cancelled.</p>
      <Field label="Reason" className="mb-3">
        <select className={cn(inputCls(), 'appearance-none')} value={choice} onChange={(e) => setChoice(e.target.value)} autoFocus>
          <option value="">Select reason…</option>
          {FAILED_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      {choice === 'Other' && (
        <Field label="Describe the reason"><input className={inputCls()} value={other} onChange={(e) => setOther(e.target.value)} placeholder="What happened" autoFocus /></Field>
      )}
      {error && <WriteFailure error={error} noun="re-queue" onReread={() => { onReread?.(); onClose(); }} className="mt-3" />}
    </Dialog>
  );
}

/**
 * End trip (vehicles-20). Returned quantities and cash go to reconcileRoute
 * exactly as before (returnedStockOf). The "expected cash" box on the board
 * is not built: no server figure for it exists.
 */
export function EndTripDialog({ route, vehicle, driver, stops, products, vanNow, sym, onEnd, onClose, onReread }) {
  const loaded = loadedOf(route);
  const [returned, setReturned] = useState(() => Object.fromEntries(loaded.map((i) => [i.productId, 0])));
  const [cash, setCash] = useState('');
  const { busy, error, run } = useWrite('end trip');
  const c = tripCounts(stops);
  const submit = (e) => {
    e.preventDefault();
    run(() => onEnd(route, returnedStockOf(loaded, returned), parseFloat(cash) || 0), onClose);
  };
  return (
    <Dialog open onClose={busy ? () => {} : onClose} width={560} label="End trip"
      header={<Head tone="neutral" icon={<CheckCircle2 />} title="End trip" sub={[vehicle?.name || 'Vehicle', route.location, driver].filter(Boolean).join(' · ')} />}>
      <form onSubmit={submit}>
        {c.total > 0 && (
          <div className="mb-3.5 grid grid-cols-3 gap-2">
            {[['Delivered', c.delivered, 'text-good-text'], ['No sale', c.noSale, 'text-bad-text'], ['Pending', c.pending, '']].map(([l, n, t]) => (
              <div key={l} className="rounded-xl bg-tile px-3 py-2.5 text-center">
                <b className={cn('block font-tight text-[20px] font-semibold tabular-nums', t)}>{n}</b><span className="text-[12px] text-body">{l}</span>
              </div>
            ))}
          </div>
        )}
        {loaded.length > 0 && (
          <>
            <Sec>Take off the van (optional)</Sec>
            <p className="-mt-1 mb-1.5 text-[12px] text-mute">Leave at 0 and the stock stays on the van for the next trip</p>
            {loaded.map((item) => {
              const p = products.find((x) => x.id === item.productId);
              const now = vanNow[item.productId];
              const back = Math.max(0, Math.min(item.quantity, parseInt(returned[item.productId] || 0, 10) || 0));
              return (
                <div key={item.productId} className="grid grid-cols-[minmax(0,1fr)_64px_120px] items-center gap-2.5 border-t border-sep py-2 text-[13px] first-of-type:border-t-0">
                  <div className="min-w-0">
                    <b className="block truncate font-medium">{p?.name || item.productId}</b>
                    <small className="text-[12px] text-mute tabular-nums">Loaded {item.quantity}{now !== undefined ? ` · on van now ${now}` : ''}</small>
                  </div>
                  <input type="number" min="0" max={item.quantity} aria-label={`Take off ${p?.name || ''}`}
                    className={cn(inputCls(), 'h-8 text-center font-semibold tabular-nums')}
                    value={returned[item.productId] ?? 0} onChange={(e) => setReturned((r) => ({ ...r, [item.productId]: e.target.value }))} />
                  <span className="text-right text-[12px] text-body tabular-nums">
                    {now !== undefined ? `${Math.max(0, now - back)} stay on van` : `${back} off the van`}
                  </span>
                </div>
              );
            })}
          </>
        )}
        <Field label="Total cash collected" hint="Invoice collections plus van sale cash" className="mt-3.5">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-tight text-[22px] font-semibold text-mute">{sym}</span>
            <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0" autoFocus
              className={cn(inputCls(), 'h-[52px] pl-9 font-tight text-[22px] font-semibold tracking-[-0.02em] tabular-nums')}
              value={cash} onChange={(e) => setCash(e.target.value)} />
          </div>
        </Field>
        {error && <WriteFailure error={error} noun="trip end" onReread={() => { onReread?.(); onClose(); }} className="mt-3" />}
        <div className="mt-5 flex gap-2 [&>*]:flex-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Ending…' : 'End trip'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
