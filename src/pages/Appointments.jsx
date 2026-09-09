import React, { useState, useMemo } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import { useTenant } from '../context/TenantContext';
import { useAppointments } from '../hooks/useAppointments';
import { usePeople } from '../hooks/usePeople';
import { useInventory } from '../hooks/useInventory';
import { useNotifications } from '../context/NotificationContext';
import { SkeletonRows } from '../components/ui/States';
import { formatCurrency } from '../lib/utils';
import { isService } from '../lib/productTypes';
import { iso, parseISO } from '../lib/reportPeriods';
import {
  monthMatrix, inMonth, groupByDay, findConflicts, localDateTime, dayOf,
} from '../lib/appointmentCalendar';
import {
  CalendarClock, Plus, X, Clock, User2, Check, Ban, ChevronLeft, ChevronRight,
  CalendarDays, List, AlertTriangle,
} from 'lucide-react';

const STATUS_CHIP = {
  BOOKED:    'bg-accent-signature/10 text-accent-signature-hover border-accent-signature/25',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-muted text-muted-foreground border-border',
  NOSHOW:    'bg-red-50 text-red-600 border-red-200',
};
const DOT = {
  BOOKED: 'bg-accent-signature', COMPLETED: 'bg-emerald-500',
  CANCELLED: 'bg-muted-foreground/40', NOSHOW: 'bg-red-400',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const timeStr = (v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const longDay = (d) => parseISO(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

const Appointments = () => {
  const { currentTenantId } = useTenant();
  const { appointments, loading, book, update, setStatus, remove } = useAppointments(currentTenantId);
  // Staff are EMPLOYEES, not app logins. This used to read `users`, so a
  // barber or tutor without an account could never be assigned the work.
  const { clients = [], employees = [] } = usePeople(currentTenantId);
  const { products = [] } = useInventory(currentTenantId);
  const { addNotification } = useNotifications();

  const [editing, setEditing] = useState(null);   // appointment | 'new' | null
  const [view, setView] = useState('month');      // month | list
  const today = iso(new Date());
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedDay, setSelectedDay] = useState(today);

  // The catalogue lists everything; only services can be booked.
  const services = useMemo(() => products.filter(isService), [products]);
  const byDay = useMemo(() => groupByDay(appointments), [appointments]);
  const grid = useMemo(() => monthMatrix(cursor.y, cursor.m), [cursor]);
  const dayList = byDay[selectedDay] || [];
  const staffName = (id) => employees.find(s => s.id === id)?.name || '';

  const shiftMonth = (by) => setCursor(({ y, m }) => {
    const d = new Date(y, m + by, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const save = async (payload) => {
    const isNew = editing === 'new';
    const { error } = isNew ? await book(payload) : await update(editing.id, payload.patch);
    if (error) { addNotification((isNew ? 'Booking failed: ' : 'Could not save: ') + error.message, 'error'); return; }
    addNotification(isNew ? 'Appointment booked' : 'Appointment updated', 'success');
    setEditing(null);
  };

  const changeStatus = async (id, status) => {
    const { error } = await setStatus(id, status);
    if (error) addNotification('Could not update: ' + error.message, 'error');
  };

  return (
    <div className="flex flex-col gap-5 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent-signature/10 border border-accent-signature/25 grid place-items-center">
            <CalendarClock size={18} className="text-accent-signature" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-ink-primary leading-none">Appointments<span className="text-accent-signature">.</span></h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{appointments.length} total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-black/10 bg-white p-0.5">
            {[['month', CalendarDays, 'Month'], ['list', List, 'List']].map(([k, Icon, label]) => (
              <button key={k} onClick={() => setView(k)} title={label}
                className={`w-8 h-8 rounded-lg grid place-items-center transition-colors ${view === k ? 'bg-accent-signature text-white' : 'text-muted-foreground hover:text-ink-primary'}`}>
                <Icon size={14} />
              </button>
            ))}
          </div>
          <button onClick={() => setEditing('new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-signature text-white text-xs font-bold hover:bg-accent-signature-hover transition-all">
            <Plus size={14} /> Book appointment
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-black/[0.07] bg-white"><SkeletonRows rows={6} /></div>
      ) : view === 'month' ? (
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 items-start">
          {/* ── Month grid ─────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted"><ChevronLeft size={16} /></button>
              <div className="text-sm font-extrabold text-ink-primary">{MONTHS[cursor.m]} {cursor.y}</div>
              <button onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map(d => <div key={d} className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground text-center py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.flat().map(day => {
                const list = byDay[day] || [];
                const outside = !inMonth(day, cursor.y, cursor.m);
                const isToday = day === today;
                const active = day === selectedDay;
                return (
                  <button key={day} onClick={() => setSelectedDay(day)}
                    className={`aspect-square rounded-lg border p-1 flex flex-col items-center justify-start gap-0.5 transition-colors
                      ${active ? 'border-accent-signature bg-accent-signature/10' : 'border-transparent hover:bg-muted'}
                      ${outside ? 'opacity-35' : ''}`}>
                    <span className={`text-[11px] tabular-nums leading-none mt-1 ${isToday ? 'font-extrabold text-accent-signature' : 'font-semibold text-ink-primary'}`}>
                      {Number(day.slice(-2))}
                    </span>
                    <span className="flex flex-wrap gap-0.5 justify-center">
                      {list.slice(0, 4).map(a => (
                        <span key={a.id} className={`w-1.5 h-1.5 rounded-full ${DOT[a.status] || DOT.BOOKED}`} />
                      ))}
                      {list.length > 4 && <span className="text-[8px] font-bold text-muted-foreground leading-none">+{list.length - 4}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── The selected day ───────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-extrabold text-ink-primary">{longDay(selectedDay)}</div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {dayList.length || 'no'} booking{dayList.length === 1 ? '' : 's'}
              </span>
            </div>
            {dayList.length === 0 ? (
              <button onClick={() => setEditing('new')} className="w-full py-10 text-center rounded-xl border border-dashed border-black/10 hover:border-accent-signature/40 transition-colors">
                <Clock size={22} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-xs font-semibold text-muted-foreground">Nothing booked. Tap to add one.</p>
              </button>
            ) : (
              <div className="space-y-2">
                {dayList.map(a => (
                  <Row key={a.id} a={a} staffName={staffName}
                    onEdit={() => setEditing(a)} onStatus={changeStatus}
                    onDelete={() => { if (window.confirm('Delete this appointment?')) remove(a.id); }} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : appointments.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-black/5">
          <CalendarClock size={36} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-bold text-muted-foreground">No appointments yet</p>
          <p className="text-xs text-muted-foreground mt-1">Book your first appointment to start scheduling.</p>
        </div>
      ) : (
        Object.entries(byDay).map(([day, list]) => (
          <div key={day}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{longDay(day)}</div>
            <div className="space-y-2">
              {list.map(a => (
                <Row key={a.id} a={a} staffName={staffName}
                  onEdit={() => setEditing(a)} onStatus={changeStatus}
                  onDelete={() => { if (window.confirm('Delete this appointment?')) remove(a.id); }} />
              ))}
            </div>
          </div>
        ))
      )}

      {editing && (
        <BookModal
          appointment={editing === 'new' ? null : editing}
          defaultDay={selectedDay}
          clients={clients} staff={employees} services={services}
          existing={appointments}
          onClose={() => setEditing(null)}
          onSave={save} />
      )}
    </div>
  );
};

/** One booking, in either view. Clicking the body opens it for editing. */
const Row = ({ a, staffName, onEdit, onStatus, onDelete }) => {
  const dimmed = a.status === 'CANCELLED' || a.status === 'NOSHOW';
  return (
    <div className={`bg-white rounded-2xl border border-black/5 shadow-sm flex items-center gap-4 px-5 py-3 ${dimmed ? 'opacity-60' : ''}`}>
      <button onClick={onEdit} className="flex items-center gap-4 flex-1 min-w-0 text-left">
        <div className="text-center shrink-0 w-16">
          <div className="tabular-nums text-[15px] font-bold text-ink-primary">{timeStr(a.start_at)}</div>
          <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><Clock size={9} />{a.duration_min}m</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink-primary truncate">{a.service_name || 'Service'}</div>
          <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
            <User2 size={10} /> {a.client_name || 'Walk-in'}{a.staff_id && staffName(a.staff_id) ? ` · ${staffName(a.staff_id)}` : ''}
          </div>
        </div>
      </button>
      {a.price > 0 && <div className="tabular-nums text-[13px] font-bold text-ink-primary shrink-0">{formatCurrency(a.price)}</div>}
      <span className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${STATUS_CHIP[a.status] || STATUS_CHIP.BOOKED}`}>{a.status}</span>
      {a.status === 'BOOKED' && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onStatus(a.id, 'COMPLETED')} title="Complete"
            className="w-7 h-7 rounded-lg grid place-items-center text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>
          <button onClick={() => onStatus(a.id, 'NOSHOW')} title="No-show"
            className="w-7 h-7 rounded-lg grid place-items-center text-muted-foreground hover:bg-red-50 hover:text-red-500"><Ban size={13} /></button>
          {/* CANCELLED was a defined status with no way to reach it — only
              Delete existed, which throws away the record of the booking. */}
          <button onClick={() => onStatus(a.id, 'CANCELLED')} title="Cancel"
            className="w-7 h-7 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted"><X size={13} /></button>
        </div>
      )}
      <button onClick={onDelete} title="Delete"
        className="w-7 h-7 rounded-lg grid place-items-center text-muted-foreground hover:text-red-500"><X size={14} /></button>
    </div>
  );
};

const inputCls = 'w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10';
const lblCls = 'block text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5';

const BookModal = ({ appointment, defaultDay, clients, staff, services, existing, onClose, onSave }) => {
  useDialogClose(onClose);
  const isEdit = !!appointment;

  const [serviceId, setServiceId] = useState(appointment?.service_id || '');
  const [clientId, setClientId]   = useState(appointment?.client_id || '');
  const [staffId, setStaffId]     = useState(appointment?.staff_id || '');
  // iso(), never toISOString().slice(0,10) — that reports the UTC day, which is
  // yesterday for anyone west of UTC and the wrong cell east of it.
  const [day, setDay]   = useState(() => (appointment ? dayOf(appointment.start_at) : (defaultDay || iso(new Date()))));
  const [time, setTime] = useState(() => (appointment ? new Date(appointment.start_at).toTimeString().slice(0, 5) : '10:00'));
  const [notes, setNotes] = useState(appointment?.notes || '');
  const [saving, setSaving] = useState(false);

  const service  = services.find(s => s.id === serviceId);
  const duration = service?.duration_min || appointment?.duration_min || 30;
  const price    = service?.sellingPrice ?? appointment?.price ?? 0;
  const startAt  = localDateTime(day, time);
  const validAt  = !Number.isNaN(startAt.getTime());
  const canSave  = serviceId && validAt;

  // Warn, never block: a shop may deliberately double-book, and refusing would
  // just get worked around by leaving staff unassigned.
  const conflicts = useMemo(() => (
    validAt ? findConflicts(
      { id: appointment?.id, staff_id: staffId || null, start_at: startAt.toISOString(), duration_min: duration, status: 'BOOKED' },
      existing,
    ) : []
  ), [appointment?.id, staffId, startAt, duration, existing, validAt]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30">
      <div className="w-full max-w-md bg-white rounded-2xl border border-black/5 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
          <div>
            <h3 className="text-base font-extrabold text-ink-primary">{isEdit ? 'Edit appointment' : 'Book appointment'}</h3>
            <p className="text-[11px] text-muted-foreground">{isEdit ? 'Reschedule or change the details' : 'Schedule a service for a client'}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-ink-primary"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={lblCls}>Service</label>
            {services.length === 0 ? (
              <p className="text-[11px] text-muted-foreground bg-muted rounded-xl px-3.5 py-2.5">
                No services in your catalogue yet — add one under Service Catalog first.
              </p>
            ) : (
              <select className={inputCls} value={serviceId} onChange={e => setServiceId(e.target.value)}>
                <option value="">Select service…</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}{s.sellingPrice ? ` · ₹${s.sellingPrice}` : ''}</option>)}
              </select>
            )}
            {service && <div className="text-[11px] text-muted-foreground mt-1">{duration} min · {formatCurrency(price)}</div>}
          </div>
          <div>
            <label className={lblCls}>Client</label>
            <select className={inputCls} value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">Walk-in</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lblCls}>Date</label><input type="date" className={inputCls} value={day} onChange={e => setDay(e.target.value)} /></div>
            <div><label className={lblCls}>Time</label><input type="time" className={inputCls} value={time} onChange={e => setTime(e.target.value)} /></div>
          </div>
          {staff.length > 0 && (
            <div>
              <label className={lblCls}>Staff (optional)</label>
              <select className={inputCls} value={staffId} onChange={e => setStaffId(e.target.value)}>
                <option value="">Unassigned</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {conflicts.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5">
              <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-semibold text-amber-800">
                {staff.find(s => s.id === staffId)?.name || 'That staff member'} already has {conflicts.length === 1 ? 'a booking' : `${conflicts.length} bookings`} then
                {' '}({conflicts.map(c => timeStr(c.start_at)).join(', ')}). You can still save.
              </p>
            </div>
          )}
          <div><label className={lblCls}>Notes (optional)</label><input type="text" className={inputCls} placeholder="Preferences…" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <button disabled={!canSave || saving}
            onClick={async () => {
              setSaving(true);
              const common = {
                serviceId, serviceName: service?.name || appointment?.service_name,
                clientId, clientName: clients.find(c => c.id === clientId)?.name || null,
                staffId, startAt: startAt.toISOString(),
                durationMin: duration, price, notes,
              };
              await onSave({
                ...common,
                // The hook only accepts real column names on edit.
                patch: {
                  service_id: serviceId, service_name: common.serviceName,
                  client_id: clientId || null, client_name: common.clientName,
                  staff_id: staffId || null, start_at: common.startAt,
                  duration_min: duration, price, notes: notes || null,
                },
              });
              setSaving(false);
            }}
            className="w-full h-11 rounded-xl bg-accent-signature text-white text-sm font-bold hover:bg-accent-signature-hover disabled:opacity-50 transition-all">
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Book'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Appointments;
