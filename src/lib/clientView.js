/**
 * Clients (web redesign): what the list, the panel and the account page show.
 *
 * Display only. Nothing here writes, and nothing here decides what a client
 * owes: the balance is `clients.outstanding_balance`, kept by the database.
 *
 * clientFacts / clientRows / clientKpis are today's ClientWorkspace rules,
 * moved here unchanged so they can be tested. Two of them are known to differ
 * from the phone and are kept on purpose (see the notes on each):
 *   · "Overdue 30+" counts a client's WHOLE balance once their oldest unpaid
 *     bill is 30 days old; the phone ages bill by bill.
 *   · a client with a balance of 0 or less shows as Settled, an advance too.
 *
 * clientSummary and reminderText are new and read-only.
 */
import { isCountableSale } from '../components/reports/reportUtils';

const DAY = 86400000;
const num = (v) => Number(v) || 0;

/** Days since a bill date. Today's rule, unchanged (it reads the date as UTC). */
export const daysSince = (d, now = Date.now()) => (d ? Math.floor((now - new Date(d).getTime()) / DAY) : null);

/** Age band for the "Oldest bill" pill: neutral under 30, amber 30+, red 60+. */
export const ageTone = (n) => {
  if (n == null) return 'neutral';
  if (n >= 60) return 'bad';
  if (n >= 30) return 'warn';
  return 'neutral';
};

/** "1 day" / "41 days" / "today". */
export const ageWords = (n) => (n == null ? '' : n <= 0 ? 'today' : `${n} day${n === 1 ? '' : 's'}`);

/**
 * Rupees, Indian grouping. Paise only when there are any, so a list reads
 * "₹12,400" and a part-rupee balance still shows exactly.
 */
export const money = (n, cur = '₹', { paise = 'auto' } = {}) => {
  const v = num(n);
  const abs = Math.abs(v);
  const frac = paise === 'always' || (paise === 'auto' && Math.round(abs * 100) % 100 !== 0);
  const body = abs.toLocaleString('en-IN', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: frac ? 2 : 0 });
  return `${v < 0 ? '−' : ''}${cur}${body}`;
};

/** Two-letter initials for an avatar. */
export const initialsOf = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
};

/**
 * Per-client money facts: unpaid bills (oldest first), payments (newest
 * first), the oldest unpaid bill's date and the last activity.
 * Moved from ClientWorkspace unchanged: sales are matched on `shopId`,
 * receipts on `client_id`, and a bill is unpaid when total − paid > 0.01.
 */
export function clientFacts(clients = [], sales = [], clientPayments = []) {
  const byClient = {};
  (clients || []).forEach((c) => {
    byClient[c.id] = { unpaid: [], payments: [], oldestUnpaid: null, lastActivity: null, lastActivityAt: null, lastKind: '' };
  });

  (sales || []).forEach((s) => {
    const f = byClient[s.shopId];
    if (!f) return;
    const total = num(s.totalAmount);
    const paid = num(s.paidAmount);
    const due = Math.max(0, total - paid);
    if (due > 0.01) {
      f.unpaid.push({ id: s.id, date: s.date, createdAt: s.created_at || null, total, paid, due });
      if (!f.oldestUnpaid || String(s.date) < String(f.oldestUnpaid)) f.oldestUnpaid = s.date;
    }
    if (!f.lastActivity || String(s.date) > String(f.lastActivity)) {
      f.lastActivity = s.date; f.lastActivityAt = s.created_at || null; f.lastKind = 'Sale';
    }
  });

  (clientPayments || []).forEach((p) => {
    const f = byClient[p.client_id];
    if (!f) return;
    f.payments.push(p);
    if (!f.lastActivity || String(p.date) > String(f.lastActivity)) {
      f.lastActivity = p.date; f.lastActivityAt = null; f.lastKind = 'Payment';
    }
  });

  Object.values(byClient).forEach((f) => {
    f.unpaid.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    f.payments.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  });
  return byClient;
}

/** Overdue, today's rule: owes something and the oldest unpaid bill is 30+ days. */
export const isOverdue = (row) => row._out > 0 && (row._age ?? 0) >= 30;

/** Every client with its balance, age and facts attached, biggest then oldest first. */
export function clientRows(clients = [], facts = {}, now = Date.now()) {
  return (clients || [])
    .map((c) => {
      const f = facts[c.id] || { unpaid: [], payments: [] };
      const outstanding = num(c.outstanding_balance);
      return {
        ...c,
        _out: outstanding,
        _age: outstanding > 0 ? daysSince(f.oldestUnpaid, now) : null,
        _last: f.lastActivity,
        _lastAt: f.lastActivityAt,
        _lastKind: f.lastKind,
        _facts: f,
      };
    })
    // Biggest, oldest debts first — the order you would actually work in.
    .sort((a, b) => (b._out - a._out) || ((b._age ?? 0) - (a._age ?? 0)));
}

/** The list's filter chips and search, as today: Owing · Overdue · All. */
export function filterClientRows(rows = [], { filter = 'OWING', query = '' } = {}) {
  const term = String(query || '').trim().toLowerCase();
  return rows.filter((c) => {
    if (filter === 'OWING' && c._out <= 0) return false;
    if (filter === 'OVERDUE' && !isOverdue(c)) return false;
    if (!term) return true;
    return [c.name, c.contact, c.phone, c.gstin].some((v) => String(v || '').toLowerCase().includes(term));
  });
}

export function chipCounts(rows = []) {
  return {
    OWING: rows.filter((r) => r._out > 0).length,
    OVERDUE: rows.filter(isOverdue).length,
    ALL: rows.length,
  };
}

/**
 * The four figures over the list. Today's arithmetic, unchanged.
 * `overdue` is the whole balance of every client whose oldest unpaid bill is
 * 30+ days old (not the part of it that is 30+ days old).
 * `monthStart` is the shop's first of the month, YYYY-MM-DD.
 */
export function clientKpis(clients = [], facts = {}, clientPayments = [], { now = Date.now(), monthStart } = {}) {
  let receivable = 0, overdue = 0, owingCount = 0, overdueCount = 0, oldest = null, oldestName = '';
  (clients || []).forEach((c) => {
    const out = num(c.outstanding_balance);
    if (out <= 0) return;
    receivable += out; owingCount += 1;
    const age = daysSince(facts[c.id]?.oldestUnpaid, now);
    if (age != null && age >= 30) { overdue += out; overdueCount += 1; }
    if (age != null && (oldest == null || age > oldest)) { oldest = age; oldestName = c.name; }
  });
  const inMonth = (clientPayments || []).filter((p) => String(p.date || '').slice(0, 10) >= monthStart);
  const collected = inMonth.reduce((s, p) => s + num(p.amount), 0);
  return { receivable, overdue, overdueCount, owingCount, oldest, oldestName, collected, receipts: inMonth.length };
}

/** "B2B · Wholesale price". */
export const accountWords = (c = {}) => {
  const tier = { RETAIL: 'Retail price', WHOLESALE: 'Wholesale price', DISTRIBUTOR: 'Distributor price' }[String(c.price_tier || '').toUpperCase()];
  return [c.client_type || null, tier || null].filter(Boolean).join(' · ');
};

/** "Net 30 · limit ₹15,000" / "Cash on delivery". */
export const creditWords = (c = {}, cur = '₹') => {
  const days = num(c.credit_days);
  const limit = num(c.credit_limit);
  return [days > 0 ? `Net ${days}` : 'Cash on delivery', limit > 0 ? `limit ${money(limit, cur)}` : null].filter(Boolean).join(' · ');
};

/** The panel's credit-limit bar: share used (0–100, as the old bar) and what is left. */
export function limitUse(outstanding, limit) {
  const l = num(limit);
  if (l <= 0) return null;
  const out = num(outstanding);
  return { pct: Math.min(100, (Math.max(0, out) / l) * 100), over: out > l, left: l - out };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "16 Oct" from a YYYY-MM-DD (no timezone shift). */
export const dayMonth = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : '';
};

/** "1 year 8 months" between two YYYY-MM-DD days, by calendar month. */
export function spanWords(from, to) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(from || ''));
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(to || ''));
  if (!a || !b) return '';
  let months = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
  if (Number(b[3]) < Number(a[3])) months -= 1;
  if (months <= 0) return 'under a month';
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} year${y === 1 ? '' : 's'}` : null, m ? `${m} month${m === 1 ? '' : 's'}` : null].filter(Boolean).join(' ');
}

/**
 * The client summary (new, read-only): what they have bought, how many bills,
 * since when and when last. Over this client's sales as loaded (matched on
 * `shopId`, like the list), leaving out voided sales the way the reports do.
 * Bills are bills as rung up; returns are not taken off.
 */
export function clientSummary(sales = [], clientId, today) {
  const id = String(clientId ?? '');
  const mine = (sales || []).filter((s) => id && String(s.shopId ?? '') === id && isCountableSale(s));
  if (!mine.length) return { bills: 0, total: 0, avg: 0, first: null, last: null, lastAt: null, since: '', sinceSpan: '', lastWords: '' };
  let total = 0, first = null, last = null, lastAt = null;
  for (const s of mine) {
    total += num(s.totalAmount);
    const d = String(s.date || '').slice(0, 10);
    if (d && (!first || d < first)) first = d;
    if (d && (!last || d > last || (d === last && String(s.created_at || '') > String(lastAt || '')))) { last = d; lastAt = s.created_at || null; }
  }
  const fm = /^(\d{4})-(\d{2})/.exec(first || '');
  return {
    bills: mine.length,
    total,
    avg: total / mine.length,
    first,
    last,
    lastAt,
    since: fm ? `${MONTHS[Number(fm[2]) - 1]} ${fm[1]}` : '',
    sinceSpan: spanWords(first, today),
    lastWords: last === today ? 'Today' : dayMonth(last),
  };
}

/**
 * The account page's period, as today: this month, three months back, the
 * Indian financial year, or everything. `today` is the shop's YYYY-MM-DD.
 */
export function rangeStartFor(range, today) {
  if (range === 'ALL') return null;
  const [y, m, d] = String(today).split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  if (range === '1M') return `${y}-${pad(m)}-01`;
  if (range === '3M') {
    const t = new Date(Date.UTC(y, m - 1 - 3, d));
    // Date rolls a missing day over (31 Aug − 3 months → 1 Jun), as today's did.
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  const fy = m >= 4 ? y : y - 1;
  return `${fy}-04-01`;
}

/** Digits for wa.me / sms: a bare 10-digit Indian number gets 91 in front. */
export function phoneDigits(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`;
  return d;
}

/**
 * A payment reminder's words (new). Text only: the screen opens WhatsApp or
 * Messages with it filled in, and nothing is sent from here.
 */
export function reminderText({ client = {}, shopName = '', amount = 0, bills = [], withBills = true, tone = 'POLITE', upi = '', cur = '₹' } = {}) {
  const who = String(client.contact || '').trim().split(/\s+/)[0] || String(client.name || '').trim() || 'there';
  const from = shopName ? ` from ${shopName}` : '';
  const oldest = bills.length ? dayMonth(bills[0].date) : '';
  const since = oldest ? `, the oldest bill from ${oldest}` : '';
  const head = tone === 'FIRM'
    ? `Dear ${who}, this is a reminder${from}. ${money(amount, cur)} is due on your account${since}. Please clear it at the earliest.`
    : `Namaste ${who}, a reminder${from}. Your account shows ${money(amount, cur)} due${since}. Please clear it when you can.`;
  const list = withBills && bills.length
    ? `\n\n${bills.map((b) => `${b.id} · ${dayMonth(b.date)} · ${money(b.due, cur)}`).join('\n')}`
    : '';
  const pay = upi ? `\n\nUPI: ${upi}` : '';
  return `${head}${list}${pay}`;
}

export const whatsappUrl = (phone, text) => {
  const d = phoneDigits(phone);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
};

export const smsUrl = (phone, text) => `sms:${phoneDigits(phone)}?body=${encodeURIComponent(text)}`;
