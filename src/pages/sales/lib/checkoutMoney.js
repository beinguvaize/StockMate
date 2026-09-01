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

/**
 * How to describe money handed over beyond the bill, on a sale already saved.
 *
 * "Excess received" covered two opposite outcomes and so told the reader
 * neither. On a cash sale it reads as money the shop is holding when it was
 * handed back at the counter, and crediting that against the client's dues
 * pays the same rupees out twice.
 *
 * But the fate is NOT implied by the payment method. After a sale to a client
 * with dues, checkout asks the cashier to choose: apply the surplus to the
 * outstanding balance, or give it as change. Applying it writes a
 * `client_payments` row and nothing on the sale records which was chosen — so
 * from the sale row alone, a cash surplus could be either.
 *
 * Only the CREDIT case is knowable here: a credit sale collects nothing at the
 * till, so anything beyond the bill is by definition against older dues and is
 * never handed back (see the branch above).
 *
 * So this states the fact and declines to invent the fate. Saying "Change
 * returned" on a surplus that actually cleared debt is the same class of error
 * as the label it replaces, pointing the other way.
 *
 * @param {string} method CASH / UPI / BANK / CARD / CREDIT
 * @returns {{label:string, hint:string, certain:boolean}}
 */
export function surplusLabel(method) {
  const isCredit = String(method || '').toUpperCase() === 'CREDIT';
  return isCredit
    ? {
        label: 'Credited to account',
        hint: 'A credit sale collects nothing at the till, so this went against older dues.',
        certain: true,
      }
    : {
        label: 'Paid over this bill',
        hint: 'Either handed back as change or applied to the client\'s dues — the client account shows which.',
        certain: false,
      };
}
