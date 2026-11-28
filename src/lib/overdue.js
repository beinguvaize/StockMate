/**
 * Overdue, bill by bill: the one rule the web uses wherever a client's
 * overdue money is shown. Display only; nothing here writes.
 *
 * A copy of the phone's client age bar (mobile_app/lib/features/
 * clients_suppliers/data/party_aging.dart: clientAging + agingScaledTo):
 *   · each credit bill is aged from its date by what is still unpaid on it
 *     (total less paid); bills marked PAID, VOIDED or FAILED, and voided
 *     sales, are left out;
 *   · bands are 0–30 days, 31–60, and over 60 (with the part over 90);
 *   · the bands are then scaled so they add up to the client's balance,
 *     which is the figure of record (the loaded bills can lag it);
 *   · "overdue" is the 31-days-and-older part: 31–60 plus over 60.
 */

const DAY = 86400000;
const num = (v) => Number(v) || 0;

/**
 * Whole days from a bill date to `now`, never below 0, as the phone's
 * `now.difference(DateTime.parse(date)).inDays`: a bare YYYY-MM-DD is that
 * day's local midnight; a full timestamp is read as written.
 */
export function billDaysOld(date, now = Date.now()) {
  if (!date) return 0;
  const s = String(date);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const t = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : new Date(s).getTime();
  if (!Number.isFinite(t)) return 0;
  const days = Math.trunc((Number(now) - t) / DAY);
  return days < 0 ? 0 : days;
}

const empty = () => ({ d0to30: 0, d31to60: 0, d60plus: 0, d90plus: 0, unpaidBills: 0, oldestDays: null });

function addBill(acc, unpaid, days) {
  if (unpaid <= 0) return;
  if (days <= 30) acc.d0to30 += unpaid;
  else if (days <= 60) acc.d31to60 += unpaid;
  else {
    acc.d60plus += unpaid;
    if (days > 90) acc.d90plus += unpaid;
  }
  acc.unpaidBills += 1;
  if (acc.oldestDays == null || days > acc.oldestDays) acc.oldestDays = days;
}

/** Age bands of what each client owes, keyed by client id (sales' `shopId`). */
export function clientAgingByBill(sales = [], now = Date.now()) {
  const accs = {};
  for (const s of sales || []) {
    const id = s?.shopId;
    if (id == null) continue;
    const st = String(s.paymentStatus || '').toUpperCase();
    if (st === 'PAID' || st === 'VOIDED' || st === 'FAILED') continue;
    // voided_at too: the void RPC sets it with status VOIDED, so this is the
    // phone's rule on every real row, and also holds for an older row.
    if (String(s.status || '').toUpperCase() === 'VOIDED' || s.voided_at) continue;
    const due = num(s.totalAmount) - num(s.paidAmount);
    addBill((accs[id] ??= empty()), due, billDaysOld(s.date, now));
  }
  const out = {};
  for (const [id, a] of Object.entries(accs)) if (a.unpaidBills > 0) out[id] = a;
  return out;
}

export const agingTotal = (a) => (a ? a.d0to30 + a.d31to60 + a.d60plus : 0);

/** `aging` scaled so its bands add up to `owed`, keeping their proportions. */
export function agingScaledTo(aging, owed) {
  const total = agingTotal(aging);
  const o = num(owed);
  if (!aging || total <= 0 || o <= 0) return aging || null;
  const k = o / total;
  return {
    ...aging,
    d0to30: aging.d0to30 * k,
    d31to60: aging.d31to60 * k,
    d60plus: aging.d60plus * k,
    d90plus: aging.d90plus * k,
  };
}

/** The phone counts a client as owing above half a rupee. */
export const OWING_OVER = 0.5;

/**
 * How much of one client's balance is overdue (bills over 30 days old),
 * scaled to the balance. 0 when they owe nothing or no bill is that old.
 */
export function overdueAmount(aging, owed) {
  if (!aging || num(owed) <= OWING_OVER) return 0;
  const a = agingScaledTo(aging, owed);
  return a.d31to60 + a.d60plus;
}
