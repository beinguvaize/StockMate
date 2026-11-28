/**
 * Appointments page, the rules behind what it shows (web redesign,
 * approved mockups appointments-01 to 11). The page is thin; this is tested.
 *
 * Days and clock times are the SHOP's (the app timezone the tenant set),
 * not the browser's and never UTC. A booking at 10:00 in the shop reads
 * 10:00 on any laptop, and a time typed into the form is saved as that time
 * in the shop. appointmentCalendar.js does the month grid and clashes; this
 * file adds the shop-timezone day and time on top of it.
 */
import { getAppTimezone } from './utils.js';

export const STATUS = {
  BOOKED:    { key: 'BOOKED',    label: 'Booked',    tone: 'warn',    dot: 'var(--color-amber)' },
  COMPLETED: { key: 'COMPLETED', label: 'Completed', tone: 'good',    dot: 'var(--color-good)' },
  NOSHOW:    { key: 'NOSHOW',    label: 'No-show',   tone: 'bad',     dot: 'var(--color-bad)' },
  CANCELLED: { key: 'CANCELLED', label: 'Cancelled', tone: 'neutral', dot: 'var(--color-faint)' },
};
/** Legend order, as drawn. */
export const LEGEND = ['BOOKED', 'COMPLETED', 'NOSHOW', 'CANCELLED'].map((k) => STATUS[k]);

/** A row with no status, or one this page does not know, reads Booked (as today). */
export const statusOf = (a) => STATUS[String(a?.status || '').toUpperCase()] || STATUS.BOOKED;

/**
 * What a row offers. Today's rule: Complete & bill, No-show and Cancel only
 * while it is Booked; Delete always.
 */
export function appointmentActions(a) {
  const booked = statusOf(a).key === 'BOOKED';
  return { complete: booked, noShow: booked, cancel: booked, remove: true, edit: true };
}

/** Cancelled and no-show rows are dimmed. */
export const isDim = (a) => ['CANCELLED', 'NOSHOW'].includes(statusOf(a).key);

// ── Shop-timezone day and time ─────────────────────────────────────────

const partsIn = (date, tz) => {
  const out = {};
  for (const p of new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)) out[p.type] = p.value;
  return out;
};

const valid = (v) => {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** 'YYYY-MM-DD' of a timestamp in the shop's timezone; '' for nothing. */
export function shopDay(ts, tz = getAppTimezone()) {
  const d = valid(ts);
  if (!d) return '';
  const p = partsIn(d, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 'HH:MM' (24-hour) of a timestamp in the shop's timezone; '' for nothing. */
export function shopTime(ts, tz = getAppTimezone()) {
  const d = valid(ts);
  if (!d) return '';
  const p = partsIn(d, tz);
  return `${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

/** Today's 'YYYY-MM-DD' in the shop. */
export const shopToday = (now = new Date(), tz = getAppTimezone()) => shopDay(now, tz);

/** Minutes the shop's clock is ahead of UTC at that instant. */
const offsetMin = (ms, tz) => {
  const p = partsIn(new Date(ms), tz);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, p.hour === '24' ? 0 : +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
};

/**
 * 'YYYY-MM-DD' + 'HH:MM' read as the SHOP's wall clock → the Date to save.
 * Invalid Date for anything unreadable.
 */
export function shopInstant(dayStr, timeStr, tz = getAppTimezone()) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayStr || ''));
  const tm = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || ''));
  if (!dm || !tm) return new Date(NaN);
  const wall = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);
  if (Number.isNaN(wall)) return new Date(NaN);
  // Two passes settle the offset across a daylight-saving change.
  let ms = wall - offsetMin(wall, tz) * 60000;
  ms = wall - offsetMin(ms, tz) * 60000;
  return new Date(ms);
}

/** Bookings bucketed by shop day, each day sorted by start time. */
export function groupByShopDay(list = [], tz = getAppTimezone()) {
  const out = {};
  for (const a of list || []) {
    const k = shopDay(a?.start_at, tz);
    if (!k) continue;
    (out[k] ||= []).push(a);
  }
  for (const k of Object.keys(out)) out[k].sort((x, y) => new Date(x.start_at) - new Date(y.start_at));
  return out;
}

/** The days in date order, for the list view. */
export const sortedDays = (byDay) => Object.keys(byDay || {}).sort();

// ── Words ──────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

const ymd = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
};

/** "Thursday, 26 November"; with today, " · today" is added on that day. */
export function longDay(dayStr, today) {
  const p = ymd(dayStr);
  if (!p) return '';
  const wd = WEEKDAYS[new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay()];
  return `${wd}, ${p.d} ${MONTHS[p.m]}${today && today === dayStr ? ' · today' : ''}`;
}

/** "26 Nov 2026" */
export function shortDay(dayStr) {
  const p = ymd(dayStr);
  return p ? `${p.d} ${SHORT_MONTHS[p.m]} ${p.y}` : '';
}

export const monthLabel = ({ y, m }) => `${MONTHS[m]} ${y}`;

/** Month cursor of a 'YYYY-MM-DD'. */
export const cursorOf = (dayStr) => { const p = ymd(dayStr); return p ? { y: p.y, m: p.m } : null; };

export function shiftCursor({ y, m }, by) {
  const n = y * 12 + m + by;
  return { y: Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
}

/** "37 appointments in all" · "1 appointment in all" · "0 appointments" */
export function countLine(n) {
  const k = Number(n) || 0;
  if (!k) return '0 appointments';
  return `${k} appointment${k === 1 ? '' : 's'} in all`;
}

/** "5 bookings" · "1 booking" · "no bookings" */
export function dayCountLine(n) {
  const k = Number(n) || 0;
  if (!k) return 'no bookings';
  return `${k} booking${k === 1 ? '' : 's'}`;
}

/** Up to four status dots for a calendar cell, and how many more. */
export function dayDots(list = [], max = 4) {
  const all = (list || []).map((a) => statusOf(a));
  return { dots: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** "Rekha Sharma · Imran Shaikh"; no client reads Walk-in; no staff, just the client. */
export function whoLine(a, staffName = () => '') {
  const client = a?.client_name || 'Walk-in';
  const staff = a?.staff_id ? staffName(a.staff_id) : '';
  return staff ? `${client} · ${staff}` : client;
}

/** The line under a confirm dialog's title: "Service · Client · 10:00". */
export function dialogSub(a, tz = getAppTimezone()) {
  return [a?.service_name || 'Service', a?.client_name || 'Walk-in', shopTime(a?.start_at, tz)].filter(Boolean).join(' · ');
}

/** "Imran already has a booking then (14:00). You can still save." */
export function clashLine(staffLabel, conflicts = [], tz = getAppTimezone()) {
  if (!conflicts?.length) return '';
  const who = staffLabel || 'That staff member';
  const what = conflicts.length === 1 ? 'a booking' : `${conflicts.length} bookings`;
  const times = conflicts.map((c) => shopTime(c.start_at, tz)).join(', ');
  return `${who} already has ${what} then (${times}). You can still save.`;
}

/**
 * The two shapes today's save sends, built from the form: `book` takes the
 * camelCase payload, `update` the column patch. Nothing new is written.
 */
export function bookingPayload({ serviceId, serviceName, clientId, clientName, staffId, startAt, duration, price, notes }) {
  const common = {
    serviceId, serviceName,
    clientId, clientName,
    staffId, startAt,
    durationMin: duration, price, notes,
  };
  return {
    ...common,
    patch: {
      service_id: serviceId, service_name: serviceName,
      client_id: clientId || null, client_name: clientName,
      staff_id: staffId || null, start_at: startAt,
      duration_min: duration, price, notes: notes || null,
    },
  };
}
