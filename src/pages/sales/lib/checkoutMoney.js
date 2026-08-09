/**
 * What the big block at the top of checkout says right now.
 *
 * It used to be two small things at the bottom of the payment panel: an
 * "Amount Received (optional)" input, and under it a chip reading "Change due".
 * Those are the two numbers that matter most at a counter and they were the
 * smallest on the screen — the cashier read the change off a chip while the
 * customer waited. One large block carries it instead, renaming itself as the
 * sale progresses rather than making anyone hunt for the right line.
 *
 * Presentation only. Nothing here decides what is charged: `handleCompleteSale`
 * remains the single writer, and this reads the same `total` and
 * `amountReceived` it does. Extracted so the five branches can be tested — a
 * block that says "Change to return" when the customer still owes money would
 * be a worse bug than the small chip ever was.
 */

/**
 * @param {number} total    the bill
 * @param {string} received raw contents of the amount-received field
 * @param {string} method   CASH / UPI / BANK / CARD / CREDIT
 * @param {(n:number)=>string} fmt money formatter; defaults to a plain 2dp
 *        number so the tests do not depend on a currency symbol
 * @returns {{tone:string, label:string, value:number, sub:string|null}}
 */
export function checkoutMoney(total, received, method, fmt = (n) => Number(n).toFixed(2)) {
  const bill     = Number(total) || 0;
  const isCredit = String(method || '').toUpperCase() === 'CREDIT';
  const typed    = String(received ?? '').trim() !== '';
  const paid     = Math.max(0, parseFloat(received) || 0);
  const diff     = paid - bill;

  if (!typed) {
    return isCredit
      ? { tone: 'credit', label: 'To client account', value: bill, sub: 'Nothing collected now' }
      : { tone: 'due',    label: 'Amount due',        value: bill, sub: null };
  }

  // On credit the money is never "change" — anything beyond the bill is the
  // customer paying down an older debt, which the outstanding prompt handles
  // after the sale. Showing it as change here would invite handing it back.
  if (isCredit) {
    return {
      tone: 'credit',
      label: 'To client account',
      value: Math.max(0, bill - paid),
      sub: `${fmt(Math.min(paid, bill))} collected now`,
    };
  }

  // Tolerance, not equality: 1185 entered against a total of 1184.999999
  // must read as paid in full, not as one paisa still to collect.
  if (diff > 0.001) {
    return { tone: 'change', label: 'Change to return', value: diff,
             sub: `${fmt(paid)} received · ${fmt(bill)} bill` };
  }
  if (diff < -0.001) {
    return { tone: 'short', label: 'Still to collect', value: -diff,
             sub: `${fmt(paid)} of ${fmt(bill)}` };
  }
  return { tone: 'exact', label: 'Paid in full', value: bill, sub: 'No change due' };
}
