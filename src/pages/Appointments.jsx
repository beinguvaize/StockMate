import React, { useState, useMemo } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import { useTenant } from '../context/TenantContext';
import { useAppointments } from '../hooks/useAppointments';
import { usePeople } from '../hooks/usePeople';
import { useInventory } from '../hooks/useInventory';
import { useNotifications } from '../context/NotificationContext';
import { SkeletonRows } from '../components/ui/States';
import { formatCurrency } from '../lib/utils';
import { CalendarClock, Plus, X, Clock, User2, Check, Ban } from 'lucide-react';

const STATUS_CHIP = {
  BOOKED:    'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
  NOSHOW:    'bg-red-50 text-red-600 border-red-200',
};

const dayKey = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const timeStr = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const Appointments = () => {
  const { currentTenantId } = useTenant();
  const { appointments, loading, book, setStatus, remove } = useAppointments(currentTenantId);
  const { clients = [], users: staff = [] } = usePeople(currentTenantId);
  const { products = [] } = useInventory(currentTenantId);
  const { addNotification } = useNotifications();
  const [booking, setBooking] = useState(false);

  // Group by day.
  const groups = useMemo(() => {
    const g = {};
    appointments.forEach(a => { (g[dayKey(a.start_at)] ||= []).push(a); });
    return g;
  }, [appointments]);

  return (
    <div className="flex flex-col gap-5 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 grid place-items-center">
            <CalendarClock size={18} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-ink-primary leading-none">Appointments<span className="text-amber-500">.</span></h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{appointments.length} total</p>
          </div>
        </div>
        <button onClick={() => setBooking(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-all">
          <Plus size={14} /> Book appointment
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-black/[0.07] bg-white"><SkeletonRows rows={6} /></div>
      ) : appointments.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-black/5">
          <CalendarClock size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-bold text-gray-500">No appointments yet</p>
          <p className="text-xs text-gray-400 mt-1">Book your first appointment to start scheduling.</p>
        </div>
      ) : (
        Object.entries(groups).map(([day, list]) => (
          <div key={day}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{day}</div>
            <div className="space-y-2">
              {list.map(a => {
                const cancelled = a.status === 'CANCELLED' || a.status === 'NOSHOW';
                return (
                  <div key={a.id} className={`bg-white rounded-2xl border border-black/5 shadow-sm flex items-center gap-4 px-5 py-3 ${cancelled ? 'opacity-60' : ''}`}>
                    <div className="text-center shrink-0 w-16">
                      <div className="font-mono text-[15px] font-bold text-ink-primary">{timeStr(a.start_at)}</div>
                      <div className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5"><Clock size={9} />{a.duration_min}m</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-ink-primary truncate">{a.service_name || 'Service'}</div>
                      <div className="text-[11px] text-gray-400 truncate flex items-center gap-1">
                        <User2 size={10} /> {a.client_name || 'Walk-in'}{a.staff_id ? ` · ${staff.find(s => s.id === a.staff_id)?.name || ''}` : ''}
                      </div>
                    </div>
                    {a.price > 0 && <div className="font-mono text-[13px] font-bold text-ink-primary shrink-0">{formatCurrency(a.price)}</div>}
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${STATUS_CHIP[a.status] || STATUS_CHIP.BOOKED}`}>{a.status}</span>
                    {a.status === 'BOOKED' && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setStatus(a.id, 'COMPLETED')} title="Complete"
                          className="w-7 h-7 rounded-lg grid place-items-center text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>
                        <button onClick={() => setStatus(a.id, 'NOSHOW')} title="No-show"
                          className="w-7 h-7 rounded-lg grid place-items-center text-gray-400 hover:bg-red-50 hover:text-red-500"><Ban size={13} /></button>
                      </div>
                    )}
                    <button onClick={() => { if (window.confirm('Delete this appointment?')) remove(a.id); }}
                      title="Delete" className="w-7 h-7 rounded-lg grid place-items-center text-gray-300 hover:text-red-500"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {booking && (
        <BookModal clients={clients} staff={staff} services={products}
          onClose={() => setBooking(false)}
          onSave={async (payload) => {
            const { error } = await book(payload);
            if (error) addNotification('Booking failed: ' + error.message, 'error');
            else { addNotification('Appointment booked', 'success'); setBooking(false); }
          }} />
      )}
    </div>
  );
};

const inputCls = 'w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10';
const lblCls = 'block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5';

const BookModal = ({ clients, staff, services, onClose, onSave }) => {
  useDialogClose(onClose);
  const [serviceId, setServiceId] = useState('');
  const [clientId, setClientId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const service = services.find(s => s.id === serviceId);
  const duration = service?.duration_min || 30;
  const price = service?.sellingPrice || 0;
  const canSave = serviceId && date && time;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30">
      <div className="w-full max-w-md bg-white rounded-2xl border border-black/5 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
          <div>
            <h3 className="text-base font-extrabold text-ink-primary">Book appointment</h3>
            <p className="text-[11px] text-gray-400">Schedule a service for a client</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-ink-primary"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={lblCls}>Service</label>
            <select className={inputCls} value={serviceId} onChange={e => setServiceId(e.target.value)}>
              <option value="">Select service…</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}{s.sellingPrice ? ` · ₹${s.sellingPrice}` : ''}</option>)}
            </select>
            {service && <div className="text-[11px] text-gray-400 mt-1">{duration} min · {formatCurrency(price)}</div>}
          </div>
          <div>
            <label className={lblCls}>Client</label>
            <select className={inputCls} value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">Walk-in</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lblCls}>Date</label><input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} /></div>
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
          <div><label className={lblCls}>Notes (optional)</label><input type="text" className={inputCls} placeholder="Preferences…" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <button disabled={!canSave || saving}
            onClick={async () => {
              setSaving(true);
              await onSave({
                serviceId, serviceName: service?.name,
                clientId, clientName: clients.find(c => c.id === clientId)?.name,
                staffId, startAt: new Date(`${date}T${time}`).toISOString(),
                durationMin: duration, price, notes,
              });
              setSaving(false);
            }}
            className="w-full h-11 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50 transition-all">
            {saving ? 'Booking…' : 'Book'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Appointments;
