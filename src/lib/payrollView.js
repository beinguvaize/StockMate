/**
 * What the Payroll screens show, from what the server worked out.
 *
 * Nothing in here decides anyone's pay. Every amount comes from a pay-run line
 * the `payroll-run` server function returned (the same calculation the phone
 * uses) or from a saved pay run. This file only picks those figures out, puts
 * them in rows, labels them, and adds up rows that are on screen -- so the
 * tiles, the staff list, the employee panel and the salary statement can never
 * disagree with each other or with what Run payroll would pay.
 */

import { parsePeriod, describePeriod } from './payrollPeriods.js';
import { getAppTimezone } from './utils.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const up = (v) => String(v || '').toUpperCase();
const pad = (n) => String(n).padStart(2, '0');

// ── Dates ──────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' parts, no Date parsing (no timezone can move them). */
const parts = (day) => String(day || '').split('-').map(Number);

/** First and last day of 'YYYY-MM'. */
export function monthBounds(month) {
  const [y, m] = parts(month);
  if (!y || !m || m < 1 || m > 12) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

/** `day` moved by `n` calendar days. Worked in UTC so no clock change can skip one. */
export function addDays(day, n) {
  const [y, m, d] = parts(day);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday, for a 'YYYY-MM-DD'. */
export function weekday(day) {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday of the week `day` falls in (the phone's weekStart). */
export function mondayOf(day) {
  const w = weekday(day);
  return addDays(day, w === 0 ? -6 : 1 - w);
}

/** Calendar days from a to b, counting both. */
export function daysInclusive(a, b) {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

/** The shop's own calendar day for a timestamp (processed_at), never UTC's. */
export function shopDay(stamp) {
  if (!stamp) return null;
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: getAppTimezone(), year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/** '20 Nov 2026' (or '20 Nov' without the year). */
export function dayWords(day, { year = true } = {}) {
  const [y, m, d] = parts(day);
  if (!y || !m || !d) return '';
  return `${d} ${MON[m - 1]}${year ? ` ${y}` : ''}`;
}

/** 'November 2026'. */
export function monthWords(month) {
  const [y, m] = parts(month);
  return y && m ? `${MONTH[m - 1]} ${y}` : '';
}

/** '16 – 27 Nov 2026', '28 Nov – 4 Dec 2026', '23 Nov 2026'. */
export function rangeWords(from, to, { year = true } = {}) {
  if (!from || !to) return '';
  if (from === to) return dayWords(from, { year });
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  const tail = year ? ` ${y2}` : '';
  if (y1 === y2 && m1 === m2) return `${d1} – ${d2} ${MON[m2 - 1]}${tail}`;
  if (y1 === y2) return `${d1} ${MON[m1 - 1]} – ${d2} ${MON[m2 - 1]}${tail}`;
  return `${dayWords(from)} – ${dayWords(to)}`;
}

/** A saved run's period in words: 'November 2026' or '1 – 15 Nov 2026'. */
export function periodWords(period) {
  const p = parsePeriod(period);
  if (!p) return String(period || '');
  return String(period).includes('/') ? rangeWords(p.from, p.to) : monthWords(String(period));
}

// ── Run types ──────────────────────────────────────────────────────────────

/**
 * What kind of run a saved period was.
 *
 * A run stores only its period: 'YYYY-MM' for a whole month, 'from/to' for
 * anything else. Pay History used to call every 'from/to' run "Weekly", so a
 * run for 1 – 15 Nov read as a weekly one. A range is Weekly only when it is
 * a Monday-to-Sunday week, which is exactly what the Weekly picker makes;
 * everything else is Custom.
 */
export function runKind(period) {
  const s = String(period || '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return 'MONTHLY';
  const p = parsePeriod(s);
  if (!p || !s.includes('/')) return null;
  // A from/to range that happens to be a whole calendar month is still a month.
  const month = monthBounds(p.from.slice(0, 7));
  if (month && p.from === month.from && p.to === month.to) return 'MONTHLY';
  if (daysInclusive(p.from, p.to) === 7 && weekday(p.from) === 1) return 'WEEKLY';
  return 'CUSTOM';
}

export const RUN_KIND_LABEL = { MONTHLY: 'Monthly', WEEKLY: 'Weekly', CUSTOM: 'Custom' };
export const runKindLabel = (period) => RUN_KIND_LABEL[runKind(period)] || '';

/** The dates a run on the Run payroll dialog covers. */
export function runWindow({ mode, month, weekStart, from, to }) {
  if (mode === 'MONTHLY') return monthBounds(month);
  if (mode === 'WEEKLY') {
    if (!weekStart) return null;
    return { from: weekStart, to: addDays(weekStart, 6) };
  }
  if (!from || !to) return null;
  return { from, to };
}

/** Why a window cannot be run, or null. The server refuses the same things. */
export function windowProblem(win) {
  if (!win || !win.from || !win.to) return 'Choose a start and an end date.';
  if (win.to < win.from) return 'The end date is before the start date.';
  if (daysInclusive(win.from, win.to) > 367) return 'A pay run can cover at most a year.';
  return null;
}

// ── Payment method ─────────────────────────────────────────────────────────

export const PAY_METHODS = [['CASH', 'Cash'], ['UPI', 'UPI'], ['BANK', 'Bank']];
export const methodLabel = (m) => ({ CASH: 'Cash', UPI: 'UPI', BANK: 'Bank', CARD: 'Card' }[up(m)] || '');

// ── Staff list ─────────────────────────────────────────────────────────────

export const isDayRateType = (t) => ['DAILY', 'HOURLY'].includes(up(t));

/**
 * One row per employee for the month on screen.
 *
 * `run` is the server's answer for the whole month with nobody switched in:
 * active staff are its `items`, on-leave staff its `held`, inactive staff are
 * in neither. Inactive staff are listed but show no figures at all -- they are
 * not in any run, so a "pending" figure beside them was an amount nobody would
 * ever be paid. `run` null means the figures could not be loaded: every row is
 * then shown without numbers rather than with zeros.
 */
export function staffRows({ employees = [], run = null } = {}) {
  const lines = new Map();
  for (const l of [...(run?.items || []), ...(run?.held || [])]) lines.set(String(l.employeeId), l);
  return [...(employees || [])]
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .map((employee) => {
      const status = up(employee.status) || 'ACTIVE';
      const kind = status === 'INACTIVE' ? 'inactive' : status === 'ON_LEAVE' ? 'onleave' : 'active';
      const line = kind === 'inactive' ? null : (lines.get(String(employee.id)) || null);
      const payType = up(employee.pay_type || employee.payType || 'MONTHLY');
      return {
        id: employee.id,
        employee,
        kind,
        payType,
        dayRate: isDayRateType(payType),
        line,
        loaded: !!run,
        earned: line ? num(line.basePay) : null,
        statutory: line ? num(line.statutoryTotal) : null,
        paid: line ? num(line.alreadyPaid) : null,
        pending: line ? num(line.netPay) : null,
      };
    });
}

/**
 * The four tiles and the table foot. Adds up only the active rows, the same
 * rows a month's Run payroll would pay: on-leave staff are left out of runs
 * until switched in, inactive staff are never in one.
 */
export function listTotals(rows = []) {
  const active = rows.filter((r) => r.kind === 'active');
  const sum = (k) => active.reduce((t, r) => t + num(r[k]), 0);
  return {
    loaded: rows.length === 0 || rows.some((r) => r.loaded),
    activeCount: active.length,
    onLeaveCount: rows.filter((r) => r.kind === 'onleave').length,
    inactiveCount: rows.filter((r) => r.kind === 'inactive').length,
    earned: sum('earned'),
    statutory: sum('statutory'),
    paid: sum('paid'),
    stillToPay: sum('pending'),
  };
}

/** Rows matching a search (name, role, department) and a department. */
export function filterStaff(rows = [], { query = '', department = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return rows.filter((r) => {
    const e = r.employee || {};
    if (department && e.department !== department) return false;
    if (!q) return true;
    return [e.name, e.position, e.department].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

/** 'RK' from 'Ravi Kumar'. */
export function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return ((w[0][0] || '') + (w.length > 1 ? w[w.length - 1][0] : (w[0][1] || ''))).toUpperCase();
}

/** Days for the list's "Days worked" column, as the line counted them. */
export function daysText(n) {
  const v = num(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// ── Run payroll lines ──────────────────────────────────────────────────────

/**
 * The grey line under a name in Run payroll: pay type, leave and sick counts,
 * and a warning when paid leave went over the month's allowance.
 */
export function runLineNote(line = {}) {
  const parts2 = [];
  const t = up(line.payType);
  parts2.push(isDayRateType(t) ? 'Daily' : t === 'WEEKLY' ? 'Weekly' : 'Monthly');
  if (num(line.leaveDays) > 0) parts2.push(`${num(line.leaveDays)} leave`);
  if (num(line.sickDays) > 0) parts2.push(`${num(line.sickDays)} sick`);
  return parts2.join(' · ');
}

/** Typed extras on a line: overtime, commission and bonus. */
export const extrasOf = (item = {}) => num(item.overtime) + num(item.commission) + num(item.bonus);

/**
 * A saved line split so its columns add up: base + extras − deductions −
 * paid earlier = net.
 *
 * Pay History showed base, extras and the typed deductions only, so a line
 * with PF or professional tax, or one that netted off an earlier payment,
 * did not reach its own net figure. Statutory deductions are counted with the
 * typed ones; earlier pay is its own figure. `agrees` is false only when the
 * stored net was floored at zero (paid more than earned) or the row is
 * damaged -- the screen then says so instead of showing sums that do not add.
 */
export function historyLine(item = {}) {
  const base = num(item.basePay);
  const extras = extrasOf(item);
  const deductions = num(item.deductions) + num(item.statutoryTotal);
  const paidEarlier = num(item.alreadyPaid);
  const net = num(item.netPay);
  return {
    base, extras, deductions, paidEarlier, net,
    statutory: num(item.statutoryTotal),
    agrees: Math.round(base + extras - deductions - paidEarlier) === Math.round(net),
  };
}

/** The same split for a whole run, summed from its lines. */
export function historyTotals(items = []) {
  const lines = (items || []).map(historyLine);
  const sum = (k) => lines.reduce((t, l) => t + l[k], 0);
  return {
    base: sum('base'), extras: sum('extras'), deductions: sum('deductions'),
    paidEarlier: sum('paidEarlier'), net: sum('net'), statutory: sum('statutory'),
    paidCount: lines.filter((l) => l.net > 0).length,
  };
}

/** Lines in a run that actually paid someone something. */
export const paidLines = (items = []) => (items || []).filter((i) => num(i.netPay) > 0);

/** The reference a payslip prints for a run (lib/payslip.js uses the same). */
export const runReference = (id) => (id ? String(id).split('-')[0].toUpperCase() : null);

// ── Salary statement ───────────────────────────────────────────────────────

const overlapsWindow = (period, from, to) => {
  const p = parsePeriod(period);
  return !!p && p.from <= to && p.to >= from;
};

/**
 * One employee's salary statement for one month.
 *
 * Reads, never works out: the earned figure and the statutory lines are the
 * server's line for the month (the same line the staff list shows), and each
 * payment is a saved pay run with that employee in it. The balance column is
 * the rows added up in order. When a run also covers days outside the month,
 * only part of it counts for this month (the server's "already paid"); the
 * difference is its own row, so the paid column still reaches the list's Paid
 * figure exactly.
 *
 * Returns `{ rows, totals, closing, stillToPay, agrees }`. `agrees` is the
 * check the tests hold the screen to: closing balance equals the list's
 * Pending figure, or the employee was paid ahead and Pending is zero.
 */
export function salaryStatement({ line, month, records = [], methods = {}, accountFor, asOf } = {}) {
  const win = monthBounds(month);
  if (!line || !win) return null;
  const id = String(line.employeeId);
  const end = asOf && asOf < win.to && asOf >= win.from ? asOf : win.to;
  const rows = [];

  const dayRate = isDayRateType(line.payType);
  const earnedNote = dayRate
    ? `${daysText(line.daysWorked)} ${num(line.daysWorked) === 1 ? 'day' : 'days'} worked`
    : num(line.lopDays) > 0
      ? `${daysText(line.lopDays)} ${num(line.lopDays) === 1 ? 'day' : 'days'} absent · loss of pay ₹${num(line.lopAmount).toLocaleString('en-IN')}`
      : (num(line.periodDays) >= num(line.cycleDays) && num(line.cycleDays) > 0 ? 'Full pay for the month' : `${num(line.periodDays)} days of salary`);
  rows.push({
    key: 'earned', type: 'earned', date: win.from, dateTo: end,
    title: `${dayRate ? 'Wages' : 'Salary'} earned, ${rangeWords(win.from, end, { year: false })}`,
    note: earnedNote, earned: num(line.basePay), paid: 0,
  });

  const stat = Array.isArray(line.statutoryLines) ? line.statutoryLines : [];
  let statShown = 0;
  stat.forEach((s, i) => {
    const amt = num(s.amount);
    if (amt <= 0) return;
    statShown += amt;
    rows.push({ key: `stat-${i}`, type: 'deduction', date: end, title: s.label || 'Deduction', note: s.note || null, earned: -amt, paid: 0 });
  });
  // The run stores the rounded total; a fraction between the lines and it is shown, not hidden.
  const statGap = num(line.statutoryTotal) - statShown;
  if (Math.abs(statGap) >= 0.005) {
    rows.push({ key: 'stat-round', type: 'deduction', date: end, title: 'Rounding on deductions', note: null, earned: -statGap, paid: 0 });
  }

  const payments = (records || [])
    .filter((r) => r && !r.deleted_at && overlapsWindow(r.period, win.from, win.to))
    .map((r) => ({ r, item: (r.items || []).find((i) => String(i.employeeId) === id) }))
    .filter(({ item }) => item && num(item.netPay) > 0)
    .sort((a, b) => String(a.r.processed_at || '').localeCompare(String(b.r.processed_at || '')));
  let paidShown = 0;
  for (const { r, item } of payments) {
    const method = methods[r.id] || null;
    const account = method && accountFor ? accountFor(method) : null;
    paidShown += num(item.netPay);
    rows.push({
      key: `run-${r.id}`, type: 'paid', date: shopDay(r.processed_at) || parsePeriod(r.period)?.to,
      title: `Paid, ${periodWords(r.period)} run`,
      note: [methodLabel(method), account, runReference(r.id)].filter(Boolean).join(' · ') || null,
      earned: 0, paid: num(item.netPay), runId: r.id, record: r, item,
    });
  }
  const paidGap = num(line.alreadyPaid) - paidShown;
  if (Math.abs(paidGap) >= 0.5) {
    rows.push({
      key: 'paid-outside', type: 'adjust', date: end,
      title: paidGap < 0 ? 'Part of these runs is for days outside this month' : 'Paid for these days in other runs',
      note: paidGap < 0 ? 'Counted in the month those days fall in' : null,
      earned: 0, paid: paidGap,
    });
  }

  let bal = 0;
  for (const row of rows) { bal += row.earned - row.paid; row.balance = bal; }
  const totals = {
    earned: rows.reduce((t, r) => t + r.earned, 0),
    paid: rows.reduce((t, r) => t + r.paid, 0),
  };
  const closing = Math.round(bal);
  const stillToPay = num(line.netPay);
  return {
    from: win.from, to: win.to, asOf: end, rows, totals, closing, stillToPay,
    paidAhead: closing < 0 ? -closing : 0,
    agrees: closing === Math.round(stillToPay) || (closing < 0 && stillToPay === 0),
  };
}

// ── Sensitive numbers ──────────────────────────────────────────────────────

/**
 * A sensitive number with only its last four characters showing.
 *   Aadhaar or a bank account (digits) → 'XXXX XXXX 7734'
 *   PAN and other codes                → 'XXXXXX821L'
 *   UPI id                             → 'kXXXX@okaxis'
 * Empty in, null out, so the screen can say "Not added".
 */
export function maskSensitive(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw.includes('@')) {
    const [name, host] = raw.split('@');
    return `${(name || '').slice(0, 1)}XXXX@${host || ''}`;
  }
  const s = raw.replace(/[\s-]+/g, '');
  if (s.length <= 4) return 'X'.repeat(s.length);
  const tail = s.slice(-4);
  if (/^\d+$/.test(s)) return `XXXX XXXX ${tail}`;
  return `${'X'.repeat(s.length - 4)}${tail}`;
}

// ── Attendance counts ──────────────────────────────────────────────────────

/** How many of each mark a person has in a set of days. Counts only; no money. */
export function markTally(days = {}, from, to) {
  const out = { PRESENT: 0, HALF_DAY: 0, ABSENT: 0, LEAVE: 0, SICK: 0, customRate: 0 };
  for (const [day, a] of Object.entries(days || {})) {
    if ((from && day < from) || (to && day > to)) continue;
    const s = up(a?.status) === 'OT' ? 'PRESENT' : up(a?.status);
    if (s in out) out[s] += 1;
    if (a?.custom_rate != null) out.customRate += 1;
  }
  return out;
}

/** The financial year (April to March) a day falls in: { from, to, label }. */
export function financialYearOf(day) {
  const [y, m] = parts(day);
  const start = m >= 4 ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `${start}-${String((start + 1) % 100).padStart(2, '0')}` };
}

export { describePeriod };
