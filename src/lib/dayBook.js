/**
 * What a sale actually put in the drawer on its own day.
 *
 * `sales.paidAmount` is a running total, not "taken on this date". When a
 * customer settles an old credit sale, settle_client_payment raises that sale's
 * paidAmount — and the DayBook was adding the money to the SALE's day. Two
 * things followed:
 *
 *  · a closed day's takings grew after the fact — 11 Jul gained ₹15,000 on
 *    1 Aug, and 17 Jun reported ₹13,860 of cash on a day whose real receipts
 *    were ₹0
 *  · the same money was counted twice — once on the sale's day here, again on
 *    the receipt's day through client_payments
 *
 * The settlement is already counted correctly, on its own date, from
 * client_payments. So a credit sale contributes to a day only when it has not
 * been written to since: that is what separates cash handed over at the counter
 * from a settlement that arrived later.
 *
 * Measured before choosing the rule: of 71 credit sales on the live tenant,
 * ZERO carry a paidAmount that was never touched again — so on today's data
 * this removes only wrongly-dated money and drops nothing genuine. The rule is
 * still a date comparison rather than "ignore credit sales", because a real
 * same-day part payment must keep counting.
 */

const num = (v) => Number(v || 0);
const day = (v) => String(v || '').slice(0, 10);

/** True when the sale was written to on a later day than it was made. */
export function settledLater(s = {}) {
  const d = day(s.date);
  const u = day(s.updated_at);
  return Boolean(d && u && u > d);
}

/**
 * Money received for this sale ON ITS OWN DATE.
 *
 * Non-credit sales with no recorded paidAmount are treated as fully received —
 * they predate paidAmount being tracked, and a cash sale with no figure means
 * the cash was taken.
 */
export function receivedOnDay(s = {}) {
  const total = num(s.totalAmount);
  const method = String(s.paymentMethod || '').toUpperCase();

  // A credit sale settled afterwards contributes nothing to its own day.
  if (method === 'CREDIT' && settledLater(s)) return 0;

  const status = String(s.paymentStatus ?? s.status ?? '').toUpperCase();
  if (status === 'PAID' || status === 'COMPLETED') return total;

  const rawPaid = s.paidAmount ?? s.paid_amount;
  if (rawPaid == null && method !== 'CREDIT') return total;

  return Math.min(num(rawPaid), total);
}

/** The part of a sale still owed at the end of its own day. */
export function receivableOnDay(s = {}) {
  return Math.max(0, num(s.totalAmount) - receivedOnDay(s));
}

/**
 * The cash a day starts with, when nobody opened it.
 *
 * `openingBal` was `Number(record?.opening_balance) || 0`, so a day with no
 * day_book row began at ZERO. Opening a day is a manual act, and on the live
 * tenant only 2 of the 14 days in August had a row at all — while twelve of
 * them moved cash, including ₹30,000 to suppliers on the 5th and ₹35,685 on the
 * 10th. Every one of those days showed a cash position starting from nothing.
 *
 * The previous closing was already known to the page and merely OFFERED as a
 * suggestion to accept by hand, which is the same manual act again.
 *
 * So: carry forward from the last day that was actually CLOSED and counted, then
 * replay the net cash movement of every day since. Not "yesterday's closing" —
 * on this data most days have no row, and an open day stores a closing of 0
 * until it is closed, so inheriting that would carry a zero forward.
 *
 * Returns `null` when no closed day exists at all; the caller keeps the old
 * behaviour rather than inventing a position out of nothing.
 */
export function carriedOpening(selectedDate, dayBookRows = [], netByDay = {}) {
  const target = day(selectedDate);
  if (!target) return null;

  // The most recent CLOSED day strictly before the one being viewed. A counted
  // day is the only thing worth trusting as a starting point.
  const anchor = (dayBookRows || [])
    .filter(r => r && r.is_closed && day(r.date) && day(r.date) < target)
    .sort((a, b) => (day(a.date) < day(b.date) ? 1 : -1))[0];

  if (!anchor) return null;

  const from = day(anchor.date);
  // What was actually counted that night, falling back to the computed close.
  const start = anchor.physical_cash != null
    ? num(anchor.physical_cash)
    : num(anchor.closing_balance);

  // Replay every day AFTER the anchor and BEFORE the target.
  let bal = start;
  Object.keys(netByDay || {})
    .filter(d => d > from && d < target)
    .sort()
    .forEach(d => { bal += num(netByDay[d]); });

  return { opening: bal, from, counted: anchor.physical_cash != null };
}

/**
 * Which payment methods land in a bank-type account rather than the drawer.
 *
 * Lived in DayBook.jsx while saleReceiptsByMode needed the same rule; two
 * copies of "what counts as bank" is how a card sale ends up in neither total.
 * CREDIT is deliberately absent: it is settled later, not received now.
 */
export const BANK_METHODS = ['BANK', 'UPI', 'TRANSFER', 'NEFT', 'RTGS', 'CARD', 'CHEQUE'];
export const isBankMethod = (m) => BANK_METHODS.includes(String(m || '').toUpperCase());

/**
 * Sale money that reached the drawer on a given day, split by where it landed.
 *
 * Read from the ledger, not from the sales rows, because a sale is dated when
 * the BILL was raised. A ₹1,185 collection made on 31 Aug against a 10 Aug bill
 * is not in the 31st's sales at all, while the 10th counts the whole
 * paidAmount — later collections included. That is how a closed day grew after
 * it was signed off. The ledger carries one row per payment event with its own
 * date, so it is the only source that answers "what came in today".
 *
 * Pass only ref_type='SALE' rows. Client payments reach the drawer through
 * their own table; counting them here as well would double them.
 *
 * @param {Array} rows account_transactions rows for the day
 * @returns {{cash:number, bank:number, total:number}}
 */
export function saleReceiptsByMode(rows = []) {
  let cash = 0;
  let bank = 0;
  for (const r of rows || []) {
    if (!r) continue;
    // OUT on a sale is a reversal (a refund or a correction); it reduces the
    // day's takings rather than being ignored.
    const signed = String(r.direction || 'IN').toUpperCase() === 'OUT'
      ? -num(r.amount)
      : num(r.amount);
    const mode = String(r.mode || 'CASH').toUpperCase();
    if (mode === 'CASH') cash += signed;
    else if (isBankMethod(mode)) bank += signed;
    // Anything else (an unrecognised mode) is deliberately left out of both
    // rather than guessed into one — a drawer count must not inherit a guess.
  }
  return { cash, bank, total: cash + bank };
}
