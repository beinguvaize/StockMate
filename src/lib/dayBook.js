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
