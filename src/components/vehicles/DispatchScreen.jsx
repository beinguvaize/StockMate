import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../ui/button';
import WriteFailure from '../invoices/WriteFailure';
import { rupees2 } from '../estimates/parts';
import { money } from '../../lib/clientView';
import { cn } from '../../lib/utils';
import { invoiceNo, selectedTotal, dispatchProblem, dispatchPayload, dayMon, dayMonYear, ymdOf, plural } from '../../lib/vehiclesView';
import { getAppTimezone } from '../../lib/utils';
import { BackLink, Field, inputCls, Note, Pill, Sec, Zp, Eyebrow } from './parts';

const Card = ({ className, children }) => <div className={cn('rounded-2xl border border-line bg-surface p-[18px]', className)}>{children}</div>;
const Mini = ({ left, right }) => (
  <div className="mb-1.5 flex justify-between gap-3 rounded-[10px] bg-tile px-3 py-2 text-[13px]"><span className="min-w-0 truncate">{left}</span><span className="font-tight font-semibold tabular-nums">{right}</span></div>
);

/**
 * Send a van out (vehicles-15, 16). Same checks, same dispatchRoute payload
 * as before (lib/vehiclesView dispatchPayload); the van's stock is read-only
 * here, loaded from the Fleet tab.
 */
export default function DispatchScreen({
  vehicles, employees, pending, deliveryInvoices, vanStockFor, today, sym, onDispatch, onClose, onDone, onReread,
}) {
  const [form, setForm] = useState({ vehicleId: vehicles[0]?.id || '', driverId: '', location: '' });
  const [selected, setSelected] = useState(() => pending.map((i) => i.id));
  const [problem, setProblem] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const vanStock = vanStockFor(form.vehicleId);
  const vehicle = vehicles.find((v) => v.id === form.vehicleId);
  const total = selectedTotal(selected, deliveryInvoices);
  const units = vanStock.reduce((s, i) => s + i.qty, 0);
  const tz = getAppTimezone();
  const all = selected.length === pending.length && pending.length > 0;

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setProblem(null); };
  const toggle = (id) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const go = async (e) => {
    e.preventDefault();
    if (busy) return;
    const p = dispatchProblem(form, selected, vanStock);
    if (p) { setProblem(p); setFailure(null); return; }
    setBusy(true); setProblem(null); setFailure(null);
    let result;
    try { result = await onDispatch(dispatchPayload(form, selected, deliveryInvoices, vanStock)); } catch (err) { result = { error: err }; }
    setBusy(false);
    if (result?.error) { console.error('[vehicles] dispatch failed', result.error); setFailure(result.error); return; }
    onDone();
  };

  return (
    <form onSubmit={go} className="pb-16">
      <BackLink onClick={onClose} />
      <div className="m-rise mb-4 flex flex-wrap items-end gap-3" style={{ '--i': 0 }}>
        <div>
          <h3 className="font-tight text-[20px] font-semibold leading-tight tracking-[-0.02em]">Send a van out</h3>
          <p className="mt-0.5 text-[13px] text-body">Pick the vehicle, the driver and the deliveries</p>
        </div>
        <span className="flex-1" />
        <div className="text-right">
          <span className="text-[12px] text-mute">{selected.length} of {plural(pending.length, 'delivery', 'deliveries')}</span>
          <div className="font-tight text-[20px] font-semibold tabular-nums">{rupees2(total, sym)}</div>
        </div>
      </div>

      <div className="m-rise grid items-start gap-5 lg:grid-cols-[420px_minmax(0,1fr)]" style={{ '--i': 1 }}>
        <div>
          <Card>
            <Sec>Route</Sec>
            <Field label="Which vehicle?" className="mb-3">
              <select className={cn(inputCls(problem?.field === 'vehicle'), 'appearance-none')} value={form.vehicleId} onChange={set('vehicleId')}>
                <option value="">Select vehicle…</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.plate ? ` · ${v.plate}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Driver" req hint="Any staff member from Payroll" className="mb-3">
              <select className={cn(inputCls(problem?.field === 'driver'), 'appearance-none')} value={form.driverId} onChange={set('driverId')}>
                <option value="">Pick a driver</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}{emp.position ? ` · ${emp.position}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Route or area">
              <input className={inputCls()} placeholder="e.g. North Zone" value={form.location} onChange={set('location')} />
            </Field>
          </Card>
          <Card className="mt-3">
            <Sec>Stock on the van{vanStock.length > 0 && <Pill tone="good" className="ml-auto normal-case tracking-normal">Loaded</Pill>}</Sec>
            {vanStock.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-mute">
                The van is empty. The driver will only deliver invoices.<br />To load it, use Load van on the Fleet tab.
              </p>
            ) : (
              <>
                <div className="max-h-56 overflow-y-auto">{vanStock.map((i) => <Mini key={i.productId} left={i.productName} right={`${i.qty} pcs`} />)}</div>
                <div className="mt-1.5 flex text-[12px] text-mute">
                  <span>{units} units on van</span><span className="flex-1" />
                  <b className="font-semibold text-ink tabular-nums">{money(vanStock.reduce((s, i) => s + i.qty * i.sellingPrice, 0), sym)} at selling price</b>
                </div>
                <p className="mt-2 text-[12px] text-mute">To change it, use Load van on the Fleet tab. An empty van only delivers invoices.</p>
              </>
            )}
          </Card>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
          <div className="flex items-center border-b border-line px-4 py-3">
            <Eyebrow>Deliveries · {selected.length} of {pending.length}</Eyebrow>
            <span className="flex-1" />
            {pending.length > 0 && (
              <button type="button" onClick={() => setSelected(all ? [] : pending.map((i) => i.id))}
                className="font-tight text-[12.5px] font-semibold text-amber-text hover:underline underline-offset-4">{all ? 'Deselect all' : 'Select all'}</button>
            )}
          </div>
          {pending.length === 0 && <p className="px-4 py-12 text-center text-[13px] text-mute">No pending deliveries</p>}
          {pending.map((inv) => {
            const on = selected.includes(inv.id);
            return (
              <button key={inv.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(inv.id)}
                className={cn('grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 border-t border-sep px-4 py-3 text-left text-[13px] first-of-type:border-t-0 hover:bg-tile', !on && 'text-mute')}>
                <span className={cn('grid h-[18px] w-[18px] place-items-center rounded-[5px]', on ? 'bg-ink' : 'bg-surface shadow-[inset_0_0_0_1.5px_var(--color-faint)]')} aria-hidden="true">
                  {on && <Check size={12} strokeWidth={3} className="text-white" />}
                </span>
                <div className="min-w-0">
                  <span className={cn('font-tight text-[13.5px] font-semibold tabular-nums', on ? 'text-ink' : 'text-body')}>{invoiceNo(inv)}</span>
                  <span className={on ? 'text-ink' : ''}> · {inv.client_name}</span>
                  {inv.delivery_zone && <span className="ml-1.5"><Zp>{inv.delivery_zone}</Zp></span>}
                  <small className="mt-0.5 block truncate text-[12px] text-mute">
                    {[inv.delivery_date && (dayMon(ymdOf(inv.delivery_date, tz)) || inv.delivery_date), inv.delivery_address].filter(Boolean).join(' · ')}
                  </small>
                </div>
                <span className={cn('font-tight font-semibold tabular-nums', on && 'text-ink')}>{rupees2(inv.grand_total, sym)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {problem && <Note tone="bad" className="mt-4"><b>{problem.message}</b></Note>}
      {failure && <WriteFailure error={failure} noun="dispatch" onReread={onReread} className="mt-4" />}

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-[14px] border border-line bg-surface px-[18px] py-3.5 text-[13px] text-body">
        <span><b className="font-semibold text-ink">{selected.length}</b> {selected.length === 1 ? 'delivery' : 'deliveries'}</span>
        {units > 0 && <span><b className="font-semibold text-ink">{units}</b> van units</span>}
        <span>{dayMonYear(today)}</span>
        <span className="ml-auto font-tight text-[18px] font-semibold text-ink tabular-nums">Total {rupees2(total, sym)}</span>
        <Button type="submit" size="lg" disabled={busy}>{busy ? 'Sending…' : `Send ${vehicle?.name || 'the van'} out`}</Button>
      </div>
    </form>
  );
}
