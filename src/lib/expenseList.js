/**
 * The Expenses list (web redesign, expenses-01 to 09). Pure, so it can be
 * tested.
 *
 * Nothing here works money out in a new way. Every figure is the sum the
 * page has always shown: an expense's `amount` added up over the rows in the
 * window. This file decides WHICH rows (the period, search and category
 * filters, moved out of the page unchanged) and words them.
 *
 * Dates are the shop's business dates (YYYY-MM-DD in the shop's timezone,
 * see todayISOInAppTZ). Day arithmetic goes through UTC calendar days, so a
 * browser in another timezone gets the same windows.
 */
import { getAppTimezone } from './utils';

const pad = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (ymd) => ymd.split('-').map(Number);
const toYMD = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utcDate = (ymd) => { const [y, m, d] = parts(ymd); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (ymd, n) => { const d = utcDate(ymd); d.setUTCDate(d.getUTCDate() + n); return toYMD(d); };
/** Last day of the month that `ym` (YYYY-MM) names. */
const monthEnd = (y, m) => toYMD(new Date(Date.UTC(y, m, 0)));

export const amountOf = (e) => parseFloat(e?.amount) || 0;

/**
 * An expense's business day. A plain date (the column is a date) is taken as
 * it is; a timestamp is read in the shop's timezone, not the browser's.
 */
export function expenseDay(date) {
  if (!date) return '';
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: getAppTimezone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// ── Period ───────────────────────────────────────────────────────────────

export const PERIODS = [
  { key: 'all', label: 'All' }, { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }, { key: 'lastmonth', label: 'Last month' },
  { key: 'range', label: 'Range' },
];

/**
 * The inclusive { from, to } window a period covers; null on a side means
 * open. The same rules the page has always used:
 *   today / yesterday    that one day
 *   week                 Monday to today
 *   month                the 1st to today
 *   lastmonth            the whole of last month
 *   range                the two dates picked (either may be blank)
 *   all                  everything
 */
export function periodWindow(period, today, range = {}) {
  const [y, m] = parts(today);
  switch (period) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const d = addDays(today, -1); return { from: d, to: d }; }
    case 'week': { const dow = utcDate(today).getUTCDay() || 7; return { from: addDays(today, 1 - dow), to: today }; }
    case 'month': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'lastmonth': {
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: monthEnd(py, pm) };
    }
    case 'range': return { from: range.from || null, to: range.to || null };
    default: return { from: null, to: null };
  }
}

export const inWindow = (e, win) => {
  const d = expenseDay(e?.date);
  if (win.from && d < win.from) return false;
  if (win.to && d > win.to) return false;
  return true;
};

/** Search (note or category, any case) and category, as the page has always matched. */
export function matchesFilters(e, { query = '', category = 'ALL' } = {}) {
  if (!e) return false;
  const q = String(query).toLowerCase();
  const hit = !q || (e.note || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q);
  return hit && (category === 'ALL' || (e.category || 'Other') === category);
}

/** The rows the list shows: in the window, matching the filters, sorted. */
export function filterExpenses(expenses, { win, query, category, sortKey = 'date', sortDir = 'desc' }) {
  const dir = sortDir === 'asc' ? 1 : -1;
  return (Array.isArray(expenses) ? expenses : [])
    .filter((e) => e && inWindow(e, win) && matchesFilters(e, { query, category }))
    .sort((a, b) => {
      if (sortKey === 'amount') return (amountOf(a) - amountOf(b)) * dir;
      if (sortKey === 'category') return (a.category || '').localeCompare(b.category || '') * dir;
      const ad = a.date || '', bd = b.date || '';
      return (ad < bd ? -1 : ad > bd ? 1 : 0) * dir;
    });
}

/**
 * The strip: spent, entries, average per entry, and input tax credit. ITC
 * counts only rows with a vendor GSTIN, as it always has (a row claimed
 * without one is saved but not counted: a known defect, left as it is).
 */
export function summarize(rows) {
  const spent = rows.reduce((s, e) => s + amountOf(e), 0);
  const itc = rows.reduce((s, e) => s + (e.vendor_gstin ? (parseFloat(e.gst_amount) || 0) : 0), 0);
  return { spent, entries: rows.length, avg: rows.length ? spent / rows.length : 0, itc };
}

/** "Where it went": spend per category over the rows shown, biggest first. */
export function categoryTotals(rows) {
  const map = {};
  rows.forEach((e) => { const c = e.category || 'Other'; map[c] = (map[c] || 0) + amountOf(e); });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/** One page of the list; `page` is 0-based and clamped. */
export function pageOf(rows, page, size = 50) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  const start = p * size;
  return { rows: rows.slice(start, start + size), page: p, pages, total, shown: Math.min(size, total - start), hasPrev: p > 0, hasNext: p < pages - 1 };
}

// ── Words ────────────────────────────────────────────────────────────────

/** "26 Nov". */
export const dayMonth = (ymd) => { if (!ymd) return '—'; const [, m, d] = parts(ymd); return `${d} ${MON[m - 1]}`; };
/** "26 Nov 2026". */
export const fullDate = (ymd) => { if (!ymd) return '—'; const [y, m, d] = parts(ymd); return `${d} ${MON[m - 1]} ${y}`; };

/** "1 Nov to 26 Nov", "26 Nov", "All time", "From 3 Oct". */
export function windowWords(win, { year = false } = {}) {
  const f = year ? fullDate : dayMonth;
  if (!win.from && !win.to) return 'All time';
  if (!win.to) return `From ${f(win.from)}`;
  if (!win.from) return `Up to ${f(win.to)}`;
  return win.from === win.to ? f(win.from) : `${f(win.from)} to ${f(win.to)}`;
}

/** "1 to 26 Nov" inside one month, else "28 Oct to 3 Nov". */
export function spanWords(from, to) {
  const [fy, fm, fd] = parts(from), [ty, tm, td] = parts(to);
  if (from === to) return `${fd} ${MON[fm - 1]}`;
  if (fy === ty && fm === tm) return `${fd} to ${td} ${MON[tm - 1]}`;
  return `${dayMonth(from)} to ${dayMonth(to)}`;
}

// ── vs last month (expenses-09, read-only) ──────────────────────────────

/**
 * The same dates last month: the 1st to today's date. On the 31st after a
 * 30-day month (or the 29th to 31st after February) it stops at the end of
 * last month, so the comparison is never with days that do not exist.
 */
export function sameDatesLastMonth(today) {
  const [y, m, d] = parts(today);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const last = Number(monthEnd(py, pm).slice(8));
  return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(Math.min(d, last))}` };
}

/**
 * This month so far compared with the same dates last month, over the rows
 * that match the same search and category. null when last month had nothing
 * on those dates (a first month is not "+100%").
 *   { now, before, diff, pct, dir, nowSpan, beforeSpan }
 */
export function monthToDateComparison(expenses, today, filters = {}) {
  const nowWin = periodWindow('month', today);
  const beforeWin = sameDatesLastMonth(today);
  let now = 0, before = 0;
  (expenses || []).forEach((e) => {
    if (!matchesFilters(e, filters)) return;
    if (inWindow(e, nowWin)) now += amountOf(e);
    else if (inWindow(e, beforeWin)) before += amountOf(e);
  });
  const out = { now, before, nowSpan: spanWords(nowWin.from, nowWin.to), beforeSpan: spanWords(beforeWin.from, beforeWin.to) };
  if (before === 0) return { ...out, diff: null, pct: null, dir: null };
  const diff = now - before;
  return { ...out, diff, pct: (diff / before) * 100, dir: Math.abs(diff) < 0.005 ? 0 : diff > 0 ? 1 : -1 };
}

/**
 * Spent in each of the last six calendar months, oldest first; the current
 * month is up to today. Same search and category as the list.
 *   [{ ym, label, long, from, to, total, current }]
 */
export function lastSixMonths(expenses, today, filters = {}) {
  const [y, m] = parts(today);
  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const my = d.getUTCFullYear(), mm = d.getUTCMonth() + 1;
    const current = i === 0;
    months.push({
      ym: `${my}-${pad(mm)}`, label: MON[mm - 1], long: MONTH_LONG[mm - 1],
      from: `${my}-${pad(mm)}-01`, to: current ? today : monthEnd(my, mm), current, total: 0,
    });
  }
  const byYm = Object.fromEntries(months.map((x) => [x.ym, x]));
  (expenses || []).forEach((e) => {
    if (!matchesFilters(e, filters)) return;
    const d = expenseDay(e.date);
    const slot = byYm[d.slice(0, 7)];
    if (slot && d <= slot.to) slot.total += amountOf(e);
  });
  return months;
}

/** "115.7k", "840". The bar labels. */
export const shortAmount = (n) => {
  const v = Math.round(Number(n) || 0);
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
};

// ── Export ───────────────────────────────────────────────────────────────

/** The CSV rows the page has always exported, for the rows shown. */
export const csvRows = (rows) => rows.map((e) => ({
  Date: (e.date || '').split('T')[0],
  Description: e.note || '',
  Category: e.category || 'Other',
  PaidVia: e.payment_method || 'CASH',
  Amount: amountOf(e),
  GST_Rate: e.gst_rate ?? '',
  ITC_Amount: parseFloat(e.gst_amount) || 0,
  Vendor_GSTIN: e.vendor_gstin || '',
}));

export function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

// ── Category colours ─────────────────────────────────────────────────────

/** The dot beside a category; the same colours the page has always used. */
export function categoryDot(category) {
  const c = String(category || '').toLowerCase();
  if (c === 'petrol') return '#FB923C';
  if (c === 'food') return '#F87171';
  if (c === 'salary') return '#22C55E';
  if (c === 'rent') return '#3B82F6';
  if (c === 'utility') return '#E8890C';
  if (c === 'purchase') return '#A78BFA';
  if (c === 'maintenance') return '#14B8A6';
  if (c.includes('credit')) return '#E879F9';
  if (c.includes('delivery')) return '#38BDF8';
  return '#C9CDD2';
}
