/**
 * Audit log view rules (web redesign, mockups audit-01 to 08).
 *
 * Pure functions. The filters are the same ones the page has always sent to
 * `audit_log` (moved here so they can be tested); the rest is wording,
 * dates in the shop's time zone, and laying the stored metadata out to read.
 */
import { AUDIT_ACTIONS } from './auditLog';
import { getAppTimezone, getAppLocale } from './utils';

export const PAGE_SIZE = 25;

/** Label and tint per action. Tints: rd red, am amber, bl blue, gr green. */
export const ACTION_META = {
  [AUDIT_ACTIONS.SALE_REFUND]: { label: 'Sale refund', tone: 'am', icon: 'refund' },
  [AUDIT_ACTIONS.PERMISSION_CHANGE]: { label: 'Permission change', tone: 'bl', icon: 'shield' },
  [AUDIT_ACTIONS.SALE_DELETE]: { label: 'Sale deleted', tone: 'rd', icon: 'trash' },
  [AUDIT_ACTIONS.PAYROLL_PROCESS]: { label: 'Payroll processed', tone: 'gr', icon: 'pay' },
  [AUDIT_ACTIONS.PAYROLL_DELETE]: { label: 'Payroll deleted', tone: 'rd', icon: 'trash' },
  [AUDIT_ACTIONS.ROLE_CHANGE]: { label: 'Role change', tone: 'bl', icon: 'shield' },
  [AUDIT_ACTIONS.USER_CREATE]: { label: 'User created', tone: 'gr', icon: 'user' },
  [AUDIT_ACTIONS.USER_DELETE]: { label: 'User deleted', tone: 'rd', icon: 'user' },
  [AUDIT_ACTIONS.TENANT_PLAN_CHANGE]: { label: 'Plan change', tone: 'am', icon: 'plan' },
};

export const actionMeta = (action) => ACTION_META[action] || { label: action || 'Event', tone: '', icon: 'event' };
export const actionOptions = () => Object.entries(ACTION_META).map(([value, { label }]) => ({ value, label }));

/** Groups for the figure strip. */
export const MONEY_ACTIONS = [AUDIT_ACTIONS.SALE_REFUND, AUDIT_ACTIONS.SALE_DELETE, AUDIT_ACTIONS.PAYROLL_PROCESS, AUDIT_ACTIONS.PAYROLL_DELETE];
export const LOGIN_ACTIONS = [AUDIT_ACTIONS.USER_CREATE, AUDIT_ACTIONS.ROLE_CHANGE, AUDIT_ACTIONS.PERMISSION_CHANGE];

export const blankFilters = () => ({ search: '', action: 'ALL', start: '', end: '' });

export function activeFilterCount(f) {
  return [f.action !== 'ALL', !!f.start, !!f.end, !!String(f.search || '').trim()].filter(Boolean).length;
}

/**
 * Apply the filters to a Supabase query, exactly as the page always has.
 * `q` is a PostgREST builder; only eq/gte/lte/or are used.
 */
export function applyAuditFilters(q, f) {
  let query = q;
  if (f.action && f.action !== 'ALL') query = query.eq('action', f.action);
  if (f.start) query = query.gte('created_at', `${f.start}T00:00:00`);
  if (f.end) query = query.lte('created_at', `${f.end}T23:59:59`);
  const term = String(f.search || '').trim();
  if (term) query = query.or(`actor_email.ilike.%${term}%,summary.ilike.%${term}%`);
  return query;
}

export const pageRange = (page) => {
  const from = page * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
};

/** Up to five page numbers around the current page (0-based), as before. */
export function pageNumbers(page, totalPages) {
  const n = Math.min(totalPages, 5);
  return Array.from({ length: n }, (_, i) => {
    if (totalPages <= 5 || page < 3) return i;
    if (page > totalPages - 4) return totalPages - 5 + i;
    return page - 2 + i;
  });
}

/* ── dates, in the shop's time zone ── */

const tz = () => getAppTimezone();
const loc = () => getAppLocale();

function parts(d) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .formatToParts(d).reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
  return { y: +p.year, m: +p.month, d: +p.day, wd: p.weekday };
}

const timeWords = (d, seconds = false) => d.toLocaleTimeString(loc(), {
  hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), timeZone: tz(),
}).replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`);

/** "28 Nov, 2:14 pm". */
export function whenShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz() })}, ${timeWords(d)}`;
}

/** "20 Nov 2026" and "7:12:44 pm" for the opened entry. */
export function whenLong(iso) {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  if (isNaN(d)) return { date: '—', time: '' };
  return { date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz() }), time: timeWords(d, true) };
}

/** "2h ago" (unchanged rule). */
export function relativeTime(iso, now = Date.now()) {
  if (!iso) return '';
  const sec = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/** YYYY-MM-DD of the shop's day for an instant. */
export function shopDay(now = Date.now()) {
  const p = parts(new Date(now));
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/**
 * The Monday of this week in the shop's time zone, and N days back, as
 * YYYY-MM-DD. Compared the same way the date filter compares (start of day).
 */
export function weekStartDay(now = Date.now()) {
  const p = parts(new Date(now));
  const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.wd);
  const base = Date.UTC(p.y, p.m - 1, p.d) - Math.max(0, idx) * 86400000;
  return new Date(base).toISOString().slice(0, 10);
}
export function daysBackDay(n, now = Date.now()) {
  const p = parts(new Date(now));
  return new Date(Date.UTC(p.y, p.m - 1, p.d) - n * 86400000).toISOString().slice(0, 10);
}

/** "Mon 23 Nov" from YYYY-MM-DD. */
export function dayWords(ymd, { year = false, weekday = false } = {}) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), ...(weekday ? { weekday: 'short' } : {}), timeZone: 'UTC',
  }).replace(',', '');
}

/* ── rows ── */

export const shortId = (id) => (id ? String(id).slice(0, 8) : '');

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

/** "Sale · 6e1f09a2". */
export function entityLine(row) {
  if (!row?.entity_type) return '';
  return row.entity_id ? `${cap(row.entity_type)} · ${shortId(row.entity_id)}` : cap(row.entity_type);
}

/** Who did it: a known name with the email under it, else the email, else System. */
export function actorOf(row, names = {}) {
  const name = row?.actor_id ? names[row.actor_id] : null;
  if (!row?.actor_email && !row?.actor_id) return { name: 'System', sub: 'Automatic' };
  if (name) return { name, sub: row.actor_email || '' };
  return { name: row.actor_email || 'Unknown login', sub: '' };
}

/**
 * The stored metadata laid out to read: one key per line, keys padded to the
 * same width, nested values as compact JSON. Same keys and values as stored;
 * nothing is dropped or renamed beyond underscores to spaces.
 */
export function metadataLines(metadata) {
  if (!metadata || typeof metadata !== 'object' || !Object.keys(metadata).length) return '';
  const keys = Object.keys(metadata);
  const label = (k) => k.replace(/_/g, ' ');
  const width = Math.max(...keys.map((k) => label(k).length)) + 2;
  return keys.map((k) => {
    const v = metadata[k];
    const text = v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return label(k).padEnd(width, ' ') + text;
  }).join('\n');
}

/** "No refund by priya between 1 Nov and 28 Nov 2026." */
export function noMatchWords(f) {
  const what = f.action && f.action !== 'ALL' ? actionMeta(f.action).label.toLowerCase() : 'event';
  const term = String(f.search || '').trim();
  let s = `No ${what}`;
  if (term) s += ` matching “${term}”`;
  if (f.start && f.end) s += ` between ${dayWords(f.start)} and ${dayWords(f.end, { year: true })}`;
  else if (f.start) s += ` since ${dayWords(f.start, { year: true })}`;
  else if (f.end) s += ` up to ${dayWords(f.end, { year: true })}`;
  return `${s}.`;
}

export const eventsWord = (n) => `${Number(n || 0).toLocaleString('en-IN')} event${n === 1 ? '' : 's'}`;

/**
 * The instant a shop day starts (00:00 in the shop's time zone), as ISO.
 * Used by the figure strip so "this week" means the shop's week.
 */
export function shopDayStartISO(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const wall = (t) => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(t)).reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  };
  const offset = wall(guess) - guess;
  return new Date(guess - offset).toISOString();
}
