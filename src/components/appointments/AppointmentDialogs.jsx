import React, { useMemo, useState } from 'react';
import { Check, X, Trash2, AlertTriangle } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import WriteFailure from '../invoices/WriteFailure';
import { DialogIcon, InfoBox, rupees } from '../estimates/parts';
import { findConflicts } from '../../lib/appointmentCalendar';
import {
  shopDay, shopTime, shopInstant, dialogSub, clashLine, bookingPayload,
} from '../../lib/appointmentView';

const selCls = 'h-10 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow duration-(--dur-press) focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)]';
const fieldCls = 'h-10';

const Field = ({ label, children, htmlFor }) => (
  <div>
    <label htmlFor={htmlFor} className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">{label}</label>
    {children}
  </div>
);

const ConfirmHead = ({ icon, tone, title, sub }) => (
  <div className="flex items-center gap-3">
    <DialogIcon tone={tone}>{icon}</DialogIcon>
    <div className="min-w-0">
      <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">{title}</h3>
      {sub && <p className="mt-0.5 text-[13px] text-body tabular-nums">{sub}</p>}
    </div>
  </div>
);

/** Sentinel for the "add a new one" row in the client picker. */
const NEW_CLIENT = '__new__';

/**
 * Book or edit an appointment (appointments-03, 04, 05, 11). The save is
 * today's: `book` with the camelCase payload, `update` with the column patch.
 * A first-time client is created first (addClient), as before. Clashes warn,
 * never block. The time typed is the shop's clock.
 */
export function BookDialog({ appointment, defaultDay, clients, staff, services, existing, onAddClient, onSave, onClose, onOpenCatalog, onReread }) {
  const isEdit = !!appointment;
  const [serviceId, setServiceId] = useState(appointment?.service_id || '');
  const [clientId, setClientId] = useState(appointment?.client_id || '');
  const [staffId, setStaffId] = useState(appointment?.staff_id || '');
  const [day, setDay] = useState(() => (appointment ? shopDay(appointment.start_at) : defaultDay));
  const [time, setTime] = useState(() => (appointment ? shopTime(appointment.start_at) : '10:00'));
  const [notes, setNotes] = useState(appointment?.notes || '');
  const [newClient, setNewClient] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [errorNoun, setErrorNoun] = useState('booking');
  const addingClient = clientId === NEW_CLIENT;

  const service = services.find((s) => s.id === serviceId);
  const duration = service?.duration_min || appointment?.duration_min || 30;
  const price = service?.sellingPrice ?? appointment?.price ?? 0;
  const startAt = shopInstant(day, time);
  const validAt = !Number.isNaN(startAt.getTime());
  const canSave = !!serviceId && validAt && (!addingClient || !!newClient.name.trim());

  const conflicts = useMemo(() => (
    validAt ? findConflicts(
      { id: appointment?.id, staff_id: staffId || null, start_at: startAt.toISOString(), duration_min: duration, status: 'BOOKED' },
      existing,
    ) : []
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [appointment?.id, staffId, startAt.getTime(), duration, existing, validAt]);

  const submit = async () => {
    setSaving(true); setError(null);
    let useClientId = addingClient ? '' : clientId;
    let useClientName = clients.find((c) => c.id === useClientId)?.name || null;
    if (addingClient) {
      let res;
      try { res = await onAddClient({ name: newClient.name.trim(), phone: newClient.phone.trim() || null }); } catch (err) { res = { error: err }; }
      if (!res?.success) {
        setSaving(false);
        setErrorNoun('new client');
        setError(res?.error || new Error('The client was not added.'));
        return;
      }
      useClientId = res.id;
      useClientName = newClient.name.trim();
    }
    const payload = bookingPayload({
      serviceId, serviceName: service?.name || appointment?.service_name,
      clientId: useClientId, clientName: useClientName,
      staffId, startAt: startAt.toISOString(),
      duration, price, notes,
    });
    let res;
    try { res = await onSave(payload); } catch (err) { res = { error: err }; }
    setSaving(false);
    if (res?.error) { setErrorNoun(isEdit ? 'change' : 'booking'); setError(res.error); }
  };

  return (
    <Dialog open onClose={saving ? () => {} : onClose} width={480}
      title={isEdit ? 'Edit appointment' : 'Book appointment'}
      subtitle={isEdit ? 'Reschedule or change the details' : 'Schedule a service for a client'}
      footer={(
        <Button onClick={submit} disabled={!canSave || saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Book'}
        </Button>
      )}>
      <div className="grid gap-3.5">
        <Field label="Service" htmlFor="ap-service">
          {services.length === 0 ? (
            <div className="rounded-xl bg-tile px-3.5 py-3 text-[13px] text-body">
              No services in your catalogue yet. Add one under Service Catalog first.
              {onOpenCatalog && (
                <button type="button" onClick={onOpenCatalog}
                  className="mt-1.5 block font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-4">
                  Open Service Catalog
                </button>
              )}
            </div>
          ) : (
            <>
              <select id="ap-service" className={selCls} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">Select service…</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.sellingPrice ? ` · ₹${s.sellingPrice}` : ''}</option>)}
              </select>
              {service && <div className="mt-1.5 text-[12.5px] text-body tabular-nums">{duration} min · {rupees(price)}</div>}
            </>
          )}
        </Field>

        <Field label="Client" htmlFor="ap-client">
          <select id="ap-client" className={selCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Walk-in</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_CLIENT}>+ Add new client</option>
          </select>
          {addingClient && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Input autoFocus className={fieldCls} aria-label="Client name" placeholder="Client name"
                value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
              <Input className={fieldCls} aria-label="Phone" placeholder="Phone (optional)" inputMode="tel"
                value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
            </div>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="ap-date"><Input id="ap-date" type="date" className={fieldCls} value={day} onChange={(e) => setDay(e.target.value)} /></Field>
          <Field label="Time" htmlFor="ap-time"><Input id="ap-time" type="time" className={fieldCls} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>

        {staff.length > 0 && (
          <Field label="Staff (optional)" htmlFor="ap-staff">
            <select id="ap-staff" className={selCls} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}

        {conflicts.length > 0 && (
          <div role="status" className="flex items-start gap-2.5 rounded-xl bg-amber-soft px-3 py-2.5 text-[13px] leading-[1.45] text-amber-text">
            <AlertTriangle size={17} className="mt-px shrink-0" />
            <div>{clashLine(staff.find((s) => s.id === staffId)?.name, conflicts)}</div>
          </div>
        )}

        <Field label="Notes (optional)" htmlFor="ap-notes">
          <Input id="ap-notes" className={fieldCls} placeholder="Preferences" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {error && <WriteFailure error={error} noun={errorNoun} onReread={() => { onReread?.(); onClose(); }} />}
      </div>
    </Dialog>
  );
}

const KINDS = {
  complete: { tone: 'good', icon: <Check />, busy: 'Recording…', go: 'Complete and bill', keep: 'Not now', variant: 'default', noun: 'sale' },
  cancel:   { tone: 'warn', icon: <X />, busy: 'Cancelling…', go: 'Cancel booking', keep: 'Keep booking', variant: 'destructive', noun: 'change' },
  remove:   { tone: 'bad', icon: <Trash2 />, busy: 'Deleting…', go: 'Delete', keep: 'Keep it', variant: 'destructive', noun: 'delete' },
};

/**
 * Complete and bill (06), Cancel (07), Delete (08). Each runs today's call;
 * the failure shows the server's reason, or "may have saved" when the
 * connection dropped.
 */
export function AppointmentConfirm({ kind, appointment, onConfirm, onClose, onReread }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!appointment) return null;
  const k = KINDS[kind];
  const a = appointment;
  const go = async () => {
    setBusy(true); setError(null);
    let res;
    try { res = await onConfirm(a); } catch (err) { res = { error: err }; }
    setBusy(false);
    if (res?.error) { console.error(`[appointments] ${kind} failed`, res.error); setError(res.error); return; }
    onClose();
  };
  const title = kind === 'complete' ? `Complete and record a ${rupees(a.price || 0)} sale?`
    : kind === 'cancel' ? 'Cancel this booking?' : 'Delete this appointment?';
  return (
    <Dialog open onClose={busy ? () => {} : onClose} width={460} label={title}
      header={<ConfirmHead tone={k.tone} icon={k.icon} title={title} sub={dialogSub(a)} />}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{k.keep}</Button>
          <Button variant={k.variant} onClick={go} disabled={busy}>{busy ? k.busy : k.go}</Button>
        </>
      )}>
      {kind === 'complete' && (
        <>
          <p className="text-[13.5px] text-body [&_b]:font-semibold [&_b]:text-ink">
            A sale of <b>{rupees(a.price || 0)}</b> is recorded for {a.client_name ? <b>{a.client_name}</b> : 'a walk-in'} and the booking is marked Completed. If the sale fails, the booking stays Booked.
          </p>
          <InfoBox>Recorded as paid in <b>cash</b>, as today.</InfoBox>
        </>
      )}
      {kind === 'cancel' && (
        <p className="text-[13.5px] text-body">It stays on the calendar as Cancelled, so the history is kept. Nothing is billed.</p>
      )}
      {kind === 'remove' && (
        <p className="text-[13.5px] text-body">It is removed from the calendar. To keep a record that it did not happen, use Cancel or No-show instead.</p>
      )}
      {error && <WriteFailure error={error} noun={k.noun} onReread={() => { onReread?.(); onClose(); }} className="mt-3" />}
    </Dialog>
  );
}
