import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Ban, X, Trash2, ChevronLeft, ChevronRight, CalendarDays, List, CalendarClock, Clock } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useAppointments } from '../hooks/useAppointments';
import { usePeople } from '../hooks/usePeople';
import { useInventory } from '../hooks/useInventory';
import { useNotifications } from '../context/NotificationContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { PageSkeleton } from '../components/ui/States';
import { rupees, failWords } from '../components/estimates/parts';
import { BookDialog, AppointmentConfirm } from '../components/appointments/AppointmentDialogs';
import { isService } from '../lib/productTypes';
import { monthMatrix, inMonth } from '../lib/appointmentCalendar';
import {
  LEGEND, statusOf, appointmentActions, isDim, shopToday, shopTime, groupByShopDay, sortedDays,
  longDay, monthLabel, cursorOf, shiftCursor, countLine, dayCountLine, dayDots, whoLine,
} from '../lib/appointmentView';

/**
 * Appointments (approved mockups appointments-01 to 11): a month calendar
 * with the chosen day beside it, or a list by day. Book, edit, complete and
 * bill, no-show, cancel and delete all run the calls they ran before; the
 * rules are in lib/appointmentView. Days and times are the shop's.
 *
 * Complete and bill is the only money path: the complete_appointment RPC
 * records the sale through process_sale on the server, unchanged.
 */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const Appointments = () => {
  const { currentTenantId } = useTenant();
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { appointments, loading, error: loadError, refresh, book, update, complete, setStatus, remove } = useAppointments(currentTenantId);
  // Staff are EMPLOYEES, not app logins, so a barber or tutor without an
  // account can still be assigned the work.
  const { clients = [], employees = [], addClient } = usePeople(currentTenantId);
  const { products = [] } = useInventory(currentTenantId);
  const { addNotification } = useNotifications();

  const today = shopToday();
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => cursorOf(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [editing, setEditing] = useState(null);   // appointment | 'new' | null
  const [confirm, setConfirm] = useState(null);   // { kind, appointment }

  // The catalogue lists everything; only services can be booked.
  const services = useMemo(() => products.filter(isService), [products]);
  const byDay = useMemo(() => groupByShopDay(appointments), [appointments]);
  const grid = useMemo(() => monthMatrix(cursor.y, cursor.m), [cursor]);
  const dayList = byDay[selectedDay] || [];
  const staffName = (id) => employees.find((s) => s.id === id)?.name || '';
  const base = tenantSlug ? `/${tenantSlug}` : '';

  const goToday = () => { setCursor(cursorOf(today)); setSelectedDay(today); };

  const save = async (payload) => {
    const isNew = editing === 'new';
    const res = isNew ? await book(payload) : await update(editing.id, payload.patch);
    if (res?.error) return res;
    addNotification(isNew ? 'Appointment booked' : 'Appointment updated', 'success');
    setEditing(null);
    return res;
  };

  // No-show runs straight away, as before; a failure says why.
  const markNoShow = async (a) => {
    let res;
    try { res = await setStatus(a.id, 'NOSHOW'); } catch (err) { res = { error: err }; }
    if (res?.error) addNotification(failWords(res.error, 'change'), 'error', 9000);
  };

  const confirmed = {
    // The booking stays BOOKED unless the sale exists (the RPC does both in
    // one transaction). complete() passes CASH, as it always has.
    complete: async (a) => {
      const res = await complete({ id: a.id });
      if (!res?.error) addNotification(`Completed. Sale ${res.saleId} recorded`, 'success');
      return res;
    },
    cancel: (a) => setStatus(a.id, 'CANCELLED'),
    remove: async (a) => {
      const res = await remove(a.id);
      if (!res?.error) addNotification('Appointment deleted', 'success');
      return res;
    },
  };

  if (loading && !appointments.length) return <PageSkeleton cards={0} rows={6} />;

  const rowFor = (a) => (
    <AppointmentRow key={a.id} a={a} staffName={staffName}
      onEdit={() => setEditing(a)}
      onComplete={() => setConfirm({ kind: 'complete', appointment: a })}
      onNoShow={() => markNoShow(a)}
      onCancel={() => setConfirm({ kind: 'cancel', appointment: a })}
      onDelete={() => setConfirm({ kind: 'remove', appointment: a })}
      onOpenSales={() => navigate(`${base}/sales`)} />
  );

  return (
    <div className="flex flex-col pb-16">
      <div className="m-rise mb-4 flex flex-wrap items-center gap-2.5">
        <span className="text-[13px] text-mute">{countLine(appointments.length)}</span>
        <span className="flex-1" />
        <div role="tablist" aria-label="View" className="inline-flex rounded-pill bg-well p-[3px]">
          {[['month', CalendarDays, 'Month'], ['list', List, 'List']].map(([k, Icon, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={`m-press inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-tight text-[13px] font-semibold transition-colors duration-(--dur-press) ${view === k ? 'bg-ink text-white' : 'text-body hover:text-ink'}`}>
              <Icon size={14} strokeWidth={1.9} /> {label}
            </button>
          ))}
        </div>
        <Button onClick={() => setEditing('new')}>Book appointment</Button>
      </div>

      {loadError && (
        <div role="alert" className="m-rise mb-4 flex flex-wrap items-center gap-3 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] text-bad-text">
          <div className="min-w-0 flex-1">
            <b className="block font-tight font-semibold">Couldn't load appointments</b>
            <span className="break-words">{String(loadError.message || loadError)}</span>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>Try again</Button>
        </div>
      )}

      {view === 'month' ? (
        <div className="m-rise grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]" style={{ '--i': 1 }}>
          <div className="rounded-[14px] border border-line bg-surface px-5 py-[18px]">
            <div className="mb-2.5 flex items-center">
              <Button variant="secondary" size="icon-sm" aria-label="Previous month" onClick={() => setCursor((c) => shiftCursor(c, -1))}><ChevronLeft /></Button>
              <b className="ml-2.5 font-tight text-[15px] font-semibold">{monthLabel(cursor)}</b>
              <button type="button" onClick={goToday}
                className="m-press ml-2.5 mr-auto rounded-pill px-3 py-1.5 font-tight text-[12.5px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
                Today
              </button>
              <Button variant="secondary" size="icon-sm" aria-label="Next month" onClick={() => setCursor((c) => shiftCursor(c, 1))}><ChevronRight /></Button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => (
                <span key={d} className="py-1 text-center font-tight text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.flat().map((day) => {
                const { dots, more } = dayDots(byDay[day]);
                const out = !inMonth(day, cursor.y, cursor.m);
                const isToday = day === today;
                const on = day === selectedDay;
                return (
                  <button key={day} type="button" data-card onClick={() => setSelectedDay(day)} aria-pressed={on}
                    aria-label={`${longDay(day)}${dots.length ? `, ${dayCountLine(dots.length + more)}` : ''}`}
                    className={`flex h-[66px] flex-col items-start gap-[5px] rounded-xl px-2 py-[7px] text-left transition-colors duration-(--dur-press) ${on ? 'bg-amber-soft shadow-[inset_0_0_0_1.5px_var(--color-amber)]' : 'hover:bg-tile'}`}>
                    <span className={`font-tight text-[13px] font-semibold tabular-nums ${isToday ? '-ml-1 -mt-[3px] grid h-6 w-6 place-items-center rounded-full bg-amber text-white' : out ? 'text-faint' : 'text-ink'}`}>
                      {Number(day.slice(-2))}
                    </span>
                    <span className="flex flex-wrap items-center gap-[3px]">
                      {dots.map((s, i) => <i key={i} className="h-[7px] w-[7px] rounded-full" style={{ background: s.dot }} />)}
                      {more > 0 && <em className="font-tight text-[10.5px] font-semibold not-italic text-mute">+{more}</em>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3.5 text-[12px] text-body">
              {LEGEND.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5"><i className="h-[7px] w-[7px] rounded-full" style={{ background: s.dot }} />{s.label}</span>
              ))}
            </div>
          </div>

          <div className="rounded-[14px] border border-line bg-surface px-5 py-[18px]">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <b className="font-tight text-[15px] font-semibold">{longDay(selectedDay)}</b>
              <small className="text-[12.5px] text-mute">{dayCountLine(dayList.length)}</small>
            </div>
            {dayList.length === 0 ? (
              <button type="button" data-card onClick={() => setEditing('new')}
                className="mt-2 w-full rounded-[14px] border-[1.5px] border-dashed border-line px-5 py-11 text-center text-[13px] text-body transition-colors duration-(--dur-press) hover:bg-tile">
                <Clock size={24} strokeWidth={1.8} className="mx-auto mb-2 text-mute" />
                <b className="mb-0.5 block font-tight text-[14px] font-semibold text-ink">Nothing booked</b>
                Tap to add one.
              </button>
            ) : (
              <div>{dayList.map(rowFor)}</div>
            )}
          </div>
        </div>
      ) : appointments.length === 0 ? (
        !loadError && (
          <div className="m-rise rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center" style={{ '--i': 1 }}>
            <span className="mx-auto mb-3.5 grid h-[52px] w-[52px] place-items-center rounded-2xl bg-tile text-ink-2"><CalendarClock size={24} strokeWidth={1.7} /></span>
            <h3 className="font-tight text-[17px] font-semibold">No appointments yet</h3>
            <p className="mx-auto mt-1.5 max-w-[52ch] text-[13.5px] text-body">Book your first appointment to start scheduling.</p>
          </div>
        )
      ) : (
        <div className="m-rise" style={{ '--i': 1 }}>
          {sortedDays(byDay).map((day) => (
            <div key={day} className="mb-[18px]">
              <span className="mb-1 block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">{longDay(day, today)}</span>
              <div className="rounded-[14px] border border-line bg-surface px-[18px] py-1">{byDay[day].map(rowFor)}</div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <BookDialog
          appointment={editing === 'new' ? null : editing}
          defaultDay={selectedDay || today}
          clients={clients} staff={employees} services={services} onAddClient={addClient}
          existing={appointments}
          onOpenCatalog={() => { setEditing(null); navigate(`${base}/inventory`); }}
          onReread={refresh}
          onClose={() => setEditing(null)}
          onSave={save} />
      )}
      {confirm && (
        <AppointmentConfirm key={`${confirm.kind}-${confirm.appointment.id}`} kind={confirm.kind} appointment={confirm.appointment}
          onConfirm={confirmed[confirm.kind]} onReread={refresh} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
};

const Sq = ({ label, onClick, children }) => (
  <button type="button" title={label} aria-label={label} onClick={onClick}
    className="m-press grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-surface text-mute shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors duration-(--dur-press) hover:text-ink [&_svg]:size-3.5">
    {children}
  </button>
);

/** One booking, in either view. Clicking the body opens it for editing. */
export const AppointmentRow = ({ a, staffName, onEdit, onComplete, onNoShow, onCancel, onDelete, onOpenSales }) => {
  const s = statusOf(a);
  const act = appointmentActions(a);
  const dim = isDim(a);
  return (
    <div className="grid grid-cols-[62px_minmax(0,1fr)_auto] items-center gap-3 border-t border-sep py-3 first:border-t-0">
      <button type="button" onClick={onEdit} className={`text-left ${dim ? 'opacity-55' : ''}`} aria-label={`Edit ${a.service_name || 'appointment'}`}>
        <b className="block font-tight text-[15px] font-semibold tabular-nums">{shopTime(a.start_at)}</b>
        <small className="text-[12px] text-mute">{a.duration_min} min</small>
      </button>
      <button type="button" onClick={onEdit} className={`min-w-0 text-left ${dim ? 'opacity-55' : ''}`}>
        <b className="block truncate font-tight text-[14px] font-semibold">{a.service_name || 'Service'}</b>
        <small className="block truncate text-[12.5px] text-mute">{whoLine(a, staffName)}</small>
        <span className="mt-[5px] flex flex-wrap items-center gap-1.5">
          {a.price > 0 && <span className="mr-0.5 font-tight text-[13px] font-semibold tabular-nums text-ink-2">{rupees(a.price)}</span>}
          {a.sale_id && (
            <Badge tone="good" title={`Billed as ${a.sale_id}`}
              onClick={(e) => { e.stopPropagation(); onOpenSales?.(); }} role="link" className="cursor-pointer">Billed</Badge>
          )}
          <Badge tone={s.tone}>{s.label}</Badge>
        </span>
      </button>
      <div className="flex items-center justify-end gap-1.5">
        {act.complete && (
          <button type="button" onClick={onComplete}
            className="m-press inline-flex items-center gap-[5px] whitespace-nowrap rounded-pill bg-surface px-3 py-1.5 font-tight text-[12.5px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
            <Check size={13} strokeWidth={2.2} /> Complete &amp; bill
          </button>
        )}
        {act.noShow && <Sq label="No-show" onClick={onNoShow}><Ban /></Sq>}
        {act.cancel && <Sq label="Cancel" onClick={onCancel}><X /></Sq>}
        {act.remove && <Sq label="Delete" onClick={onDelete}><Trash2 /></Sq>}
      </div>
    </div>
  );
};

export default Appointments;
