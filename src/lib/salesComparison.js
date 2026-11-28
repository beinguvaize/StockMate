/**
 * The Sales history's revenue comparison (web redesign, sales-09).
 *
 * Which earlier sales the Revenue figure is compared with. The figure itself
 * and the rule for a bill counting (failed bills left out) stay in
 * InvoiceList; this file only picks the earlier window.
 *
 *   Today          the same weekday last week, up to the same time of day
 *                  ("vs last Thursday", "19 Nov, same time"). A Thursday
 *                  morning compared with a whole Thursday would always look
 *                  like a bad day.
 *   7 / 30 days    the window of equal length just before it
 *   Custom         the same, when both dates are set
 *   All time       nothing before it
 *
 * Dates are business dates (YYYY-MM-DD) in the shop's timezone.
 */
import { addDays, comparisonRange, shortDate, spanLabel, ymdOf } from './dashboardFigures';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayOf = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

/** Minutes past midnight of a timestamp, in timezone `tz`. null if unreadable. */
export function minutesOfDay(ts, tz) {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const h = Number(parts.find(p => p.type === 'hour')?.value);
  const m = Number(parts.find(p => p.type === 'minute')?.value);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/**
 * The window a Sales history filter covers, as the list already reads it
 * ({ start, end } business dates, null for all time). 7 and 30 days keep the
 * list's own reading: from today minus 7 (or 30) days to today.
 */
export function historyRange(filter, today, custom = {}) {
  switch (filter) {
    case 'TODAY': return { start: today, end: today };
    case '7D': return { start: addDays(today, -7), end: today };
    case '30D': return { start: addDays(today, -30), end: today };
    case 'CUSTOM': {
      const s = ymdOf(custom.from), e = ymdOf(custom.to);
      return s && e ? { start: s, end: e } : null;
    }
    default: return null;
  }
}

/**
 * What to compare with. Returns null, or
 *   { kind: 'sameTime', date, cutoff, label, detail }  for Today
 *   { kind: 'range', range, label, detail }             otherwise
 * `cutoff` is minutes past midnight now; `detail` names the earlier window
 * for the small line under the figure.
 */
export function revenueComparison(filter, today, nowMinutes, custom = {}) {
  if (filter === 'TODAY') {
    const date = addDays(today, -7);
    return { kind: 'sameTime', date, cutoff: nowMinutes, label: `vs last ${weekdayOf(date)}`, detail: `${shortDate(date)}, same time` };
  }
  const range = historyRange(filter, today, custom);
  const prior = comparisonRange(range);
  if (!prior) return null;
  return { kind: 'range', range: prior, label: 'vs the period before', detail: spanLabel(prior) };
}

/**
 * Does a sale fall in the comparison window? For 'sameTime' a sale needs a
 * timestamp (created_at) to be placed in the day; one without is left out
 * rather than counted as if it happened this morning (as the phone does).
 */
export function inComparison(sale, cmp, tz) {
  if (!cmp) return false;
  const d = ymdOf(sale?.date);
  if (!d) return false;
  if (cmp.kind === 'sameTime') {
    if (d !== cmp.date) return false;
    const m = minutesOfDay(sale.created_at, tz);
    return m !== null && m <= cmp.cutoff;
  }
  return d >= cmp.range.start && d <= cmp.range.end;
}

/**
 * The change, for the line under Revenue: { diff, pct, dir } where dir is
 * 1 up, -1 down, 0 flat; null when the earlier figure is 0 (nothing to
 * compare with: a first week is not "+100%").
 */
export function revenueChange(current, prior) {
  const c = Number(current) || 0, p = Number(prior) || 0;
  if (p === 0) return null;
  const diff = c - p;
  const pct = (diff / Math.abs(p)) * 100;
  return { diff, pct, dir: Math.abs(diff) < 0.005 ? 0 : diff > 0 ? 1 : -1 };
}
