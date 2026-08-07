/**
 * A client's statement: what they were billed, what they have paid, and the
 * running balance between the two.
 *
 * Lifted out of ClientSettlement.jsx unchanged. It was the last money view
 * whose arithmetic lived inside a component, which meant it could only be
 * checked by opening the page and looking — and the supplier side had already
 * shown what that costs: a double-credit there survived until a closing balance
 * visibly disagreed with what was owed.
 *
 * The rule that is easy to get wrong is crediting the same money twice. A
 * client's receipts arrive from two directions:
 *
 *   · client_payments — a receipt against the account
 *   · sales.paidAmount / invoices.paid_amount — money taken at the counter
 *
 * A CREDIT sale settled later is covered by a client_payments row, so its
 * paidAmount must NOT also be credited. A cash sale taken at the counter has no
 * receipt row, so it must be. Getting that backwards either doubles the credit
 * or leaves the statement showing a debt already settled.
 */

const num = (v) => Number(v || 0);

export const METHOD_LABEL = {
  CASH: 'Cash', CARD: 'Card', UPI: 'UPI',
  BANK: 'Bank Transfer', CHEQUE: 'Cheque',
};

/** Items arrive as a JSONB array or as a string of one. */
export function parseItems(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v) || []; } catch { return []; } }
  return [];
}

/**
 * Rows for one client, oldest first, each carrying the balance after it.
 *
 * Returns [] when there is no client, which is what the page renders before
 * one is chosen.
 */
export function buildClientStatement({
  client, sales = [], invoices = [], paymentHistory = [],
} = {}) {
  if (!client) return [];
  const rows = [];
  const cid = String(client.id);

  const saleMethodMap = {};
  (sales || []).forEach((s) => { saleMethodMap[s.id] = String(s.paymentMethod || '').toUpperCase(); });

  // A sale covered by an invoice is billed by that invoice. Counting both
  // would charge the client twice for one delivery.
  const invoicedSaleIds = new Set(
    (invoices || [])
      .filter((inv) => String(inv.client_id) === cid && inv.deleted_at == null)
      .map((inv) => inv.sale_id)
      .filter(Boolean)
  );

  // ── Credit POS sales with no invoice ──────────────────────────────────────
  (sales || [])
    .filter((s) => String(s.clientId) === cid && s.paymentMethod === 'CREDIT')
    .filter((s) => !invoicedSaleIds.has(s.id))
    .forEach((s) => rows.push({
      id: s.id,
      date: s.date || s.created_at?.slice(0, 10),
      created_at: s.created_at,
      description: `Credit Sale #${String(s.id).split('-').pop()}`,
      debit: num(s.totalAmount),
      credit: 0,
      type: 'SALE',
      items: parseItems(s.items),
    }));

  // ── Invoices ──────────────────────────────────────────────────────────────
  // PAID with paid_amount 0 is a cash-at-POS sale settled at checkout: it never
  // entered the credit ledger, so it does not belong on the statement.
  (invoices || [])
    .filter((inv) => String(inv.client_id) === cid)
    .filter((inv) => !(inv.payment_status === 'PAID' && num(inv.paid_amount) === 0))
    .forEach((inv) => {
      const n = String(inv.invoice_number || '').replace(/^#+/, '');
      const invDate = inv.invoice_date || inv.created_at?.slice(0, 10);
      rows.push({
        id: inv.id,
        date: invDate,
        created_at: inv.created_at,
        description: `Invoice #${n}`,
        debit: num(inv.grand_total),
        credit: 0,
        type: 'INVOICE',
        items: parseItems(inv.items),
      });

      // Money taken at the counter against a non-credit sale has no receipt row
      // to credit it, so the statement supplies one. Only for a known non-CREDIT
      // method: a CREDIT sale's payment arrives as a client_payments row, and
      // crediting it here as well would count it twice.
      const saleMethod = saleMethodMap[inv.sale_id] || '';
      const orphanPaid = num(inv.paid_amount);
      if (orphanPaid > 0 && saleMethod !== 'CREDIT' && saleMethod !== '') {
        rows.push({
          id: `${inv.id}-orphan`,
          date: invDate,
          created_at: inv.created_at,
          description: `Payment (Cash) — Invoice #${n}`,
          debit: 0,
          credit: orphanPaid,
          type: 'PAYMENT',
        });
      }
    });

  // ── Part-paid cash sales with no invoice ──────────────────────────────────
  // They still owe money, so they belong on the statement: the full amount as a
  // debit and what was handed over as a credit, leaving the remainder.
  (sales || [])
    .filter((s) => String(s.shopId) === cid || String(s.clientId) === cid)
    .filter((s) => String(s.paymentMethod || '').toUpperCase() !== 'CREDIT')
    .filter((s) => ['PARTIAL', 'UNPAID', 'PENDING'].includes(String(s.paymentStatus || s.status || '').toUpperCase()))
    .filter((s) => !invoicedSaleIds.has(s.id))
    .filter((s) => !s.deleted_at)
    .forEach((s) => {
      const saleDate = s.date || s.created_at?.slice(0, 10);
      const paid = num(s.paidAmount);
      rows.push({
        id: `${s.id}-cash-debit`,
        date: saleDate,
        created_at: s.created_at,
        description: `Cash Sale #${String(s.id).split('-').pop()}`,
        debit: num(s.totalAmount),
        credit: 0,
        type: 'SALE',
        items: parseItems(s.items),
      });
      if (paid > 0) {
        rows.push({
          id: `${s.id}-cash-credit`,
          date: saleDate,
          created_at: s.created_at,
          description: `Payment (Cash) — Sale #${String(s.id).split('-').pop()}`,
          debit: 0,
          credit: paid,
          type: 'PAYMENT',
        });
      }
    });

  // ── Receipts against the account ──────────────────────────────────────────
  (paymentHistory || []).forEach((p) => rows.push({
    id: p.id,
    date: p.date,
    created_at: p.created_at,
    description: `Payment (${METHOD_LABEL[p.payment_method] || p.payment_method})${p.notes ? ' — ' + p.notes : ''}`,
    debit: 0,
    credit: num(p.amount),
    type: 'PAYMENT',
  }));

  rows.sort((a, b) => {
    const da = a.date || a.created_at || '';
    const db = b.date || b.created_at || '';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  let balance = 0;
  return rows.map((r) => {
    balance += r.debit - r.credit;
    return { ...r, balance };
  });
}

/** Closing balance — what the client still owes. */
export function closingBalance(rows = []) {
  return rows.length ? rows[rows.length - 1].balance : 0;
}
