/**
 * What counts as one supplier bill.
 *
 * A physical bill is stored as one `purchases` row PER PRODUCT — the
 * multi-product form writes them in a burst, milliseconds apart. Screens that
 * list those rows directly show a five-product delivery as five purchases; on
 * FUTURE DISPO that turns 54 real bills into 137 rows.
 *
 * This lived twice, copied between the supplier ledger and the purchases list.
 * Two copies of a rule that decides what a bill *is* will drift the first time
 * one of them is corrected, and the two screens would then disagree about how
 * much a supplier billed. One definition, used by both, tested here.
 */

const BURST_MS = 10 * 60 * 1000;

const at = (p) => new Date(p.created_at || p.date).getTime();
const num = (v) => Number(v || 0);

export const isCreditType = (pt) =>
  ['CREDIT', 'UDHAAR', 'POST-CAPITAL'].includes(String(pt || '').toUpperCase());

export const paidOf = (p) => num(p.paid_amount);
export const amountOf = (p) => Number(p.total_amount ?? p.total_cost ?? 0);
export const dueOf = (p) => Math.max(0, amountOf(p) - paidOf(p));

/**
 * Collapse purchase rows into the bills they came from.
 *
 * Key: supplier + date + payment_type, chained only while consecutive
 * created_at gaps stay inside ten minutes. Every part earns its place:
 *
 *  · payment_type — SAJJAD ALAMCODU has a CREDIT and a CASH row 59 seconds
 *    apart on 24 Jul. Two bills. Merging them re-blurs the pair behind the
 *    duplicate ₹6,900 payment.
 *  · the burst guard — MADEENA AGENCY has four rows spanning 2.9 hours on
 *    9 May. Separate trips, and a supplier+date key alone fuses them into one.
 *
 * Derived at render time. Nothing is merged in the database and no id changes.
 */
/**
 * A supplier's ledger: bills as debits, everything that reduces them as
 * credits, in date order with a running balance.
 *
 * The one rule that is easy to get wrong is crediting the same money twice.
 * A bill's paid_amount already contains anything settled through a linked
 * payment row, so only the remainder — what was handed over at the counter when
 * the bill was raised — may be credited alongside those rows. Credit both in
 * full and the closing balance stops matching what is actually owed.
 */
/**
 * Root id of a payment.
 *
 * settle_supplier_payment writes one row per bill it allocates to, named
 * SUPP-X, SUPP-X-1, SUPP-X-2 ... and apply_supplier_advances appends -APPn.
 * They are slices of a single handover, so they share a root.
 */
export function paymentRoot(id) {
  return String(id || '').replace(/-APP\d+$/, '').replace(/-\d+$/, '');
}

export function buildSupplierLedger({
  bills = [], payments = [], returns = [], onAccountPayments = [],
} = {}) {
  const rows = [];
  const linkedByRoot = new Map();

  bills.forEach((b) => {
    const linked = payments.filter((p) => b.lines.some((l) => l.id === p.purchase_id));
    const linkedSum = linked.reduce((s, p) => s + num(p.amount), 0);
    const atBill = b.paid - linkedSum;

    // Money handed over at the counter is part of the bill, not a second event.
    // It used to get its own credit row, so a cash bill read as a debit and a
    // credit that cancel -- two lines, one transaction, and a ledger twice as
    // long as the trade it records. MADEENA's page was almost entirely this.
    rows.push({
      kind: 'BILL', date: b.date, bill: b,
      debit: b.total,
      credit: atBill > 0.01 ? atBill : 0,
      atBill: atBill > 0.01 ? atBill : 0,
    });

    // Later payments are real events and keep their own rows -- but one
    // handover split across several bills is still ONE payment. Collect them
    // by root and emit them together below.
    linked.forEach((p) => {
      const root = paymentRoot(p.id);
      if (!linkedByRoot.has(root)) {
        linkedByRoot.set(root, { root, date: p.date, pay: p, credit: 0, allocations: [] });
      }
      const g = linkedByRoot.get(root);
      g.credit += num(p.amount);
      g.allocations.push({ bill: b, purchaseId: p.purchase_id, amount: num(p.amount) });
      // Oldest date wins, so a payment sorts where it was actually made.
      if (String(p.date) < String(g.date)) g.date = p.date;
    });
  });

  linkedByRoot.forEach((g) => {
    const single = g.allocations.length === 1;
    const only = g.allocations[0];
    rows.push({
      kind: 'PAY', date: g.date, pay: g.pay, debit: 0, credit: g.credit,
      allocations: g.allocations,
      // One allocation still names its bill and line, as before.
      bill: single ? only.bill : null,
      lineRef: single && only.bill && only.bill.lines.length > 1
               && only.purchaseId && only.purchaseId !== only.bill.id
        ? String(only.purchaseId).split('-').pop()
        : null,
    });
  });

  // A debit note reduces what is owed, and belongs in date order among the
  // bills rather than in a block of its own at the end.
  returns.forEach((r) =>
    rows.push({ kind: 'RETURN', date: r.date, ret: r, debit: 0, credit: num(r.total_amount) }));

  onAccountPayments.forEach((p) =>
    rows.push({ kind: 'PAY', date: p.date, pay: p, onAccount: true, debit: 0, credit: num(p.amount) }));

  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let balance = 0;
  rows.forEach((r) => { balance += r.debit - r.credit; r.balance = balance; });
  return rows;
}

/**
 * Filter whole bills.
 *
 * Order matters, and getting it wrong is not a cosmetic bug. Filter the product
 * rows first and a bill whose lines only partly match comes back missing the
 * rest: tick "Unpaid" and SAJJAD's 1 Aug bill reads Rs 10,260 with Rs 3,260
 * paid, because its three settled lines were dropped before the total was
 * added up. The bill is Rs 28,770 with Rs 21,770 paid.
 *
 * So: group everything, then decide whether each whole bill belongs. A bill
 * matches a text search if ANY of its lines does, but keeps ALL of them.
 */
export function filterBills(bills = [], opts = {}) {
  const {
    q = '', supplierId = 'ALL', pay = 'ALL', status = 'ALL',
    onlyUnpaid = false, productNameOf = () => '',
  } = opts;
  const needle = String(q).trim().toLowerCase();

  return bills.filter((b) => {
    if (supplierId !== 'ALL' && b.supplier_id !== supplierId) return false;
    if (pay === 'CASH' && b.credit) return false;
    if (pay === 'CREDIT' && !b.credit) return false;
    if (status !== 'ALL' && String(b.status || 'RECEIVED').toUpperCase() !== status) return false;
    if (onlyUnpaid && b.due <= 0.5) return false;
    if (!needle) return true;

    const hay = [
      b.id, b.bill_no, b.supplier_name,
      ...b.lines.map((l) => l.id),
      ...b.lines.map((l) => l.notes),
      ...b.lines.map((l) => productNameOf(l.linked_product_id)),
    ];
    return hay.some((v) => String(v || '').toLowerCase().includes(needle));
  });
}

/**
 * A bill is `purchases.bill_id` when the row carries one.
 *
 * It used to be derived every render from supplier + date + payment_type inside
 * a 10-minute burst. That worked for display and was hopeless for editing: those
 * three fields ARE the key, so correcting a bill's date on one line silently
 * moved that line into a bill of its own. There was nothing stable to edit, and
 * the bill-level menu was disabled rather than made to work.
 *
 * The heuristic stays as a fallback for rows written before the column existed
 * or queued offline against an older client, so a missing bill_id degrades to
 * the old behaviour instead of scattering every line into its own bill.
 */
export function groupPurchasesIntoBills(rows = []) {
  const byBillId = {};
  const legacy = [];
  rows.forEach((p) => {
    if (p.bill_id) (byBillId[p.bill_id] = byBillId[p.bill_id] || []).push(p);
    else legacy.push(p);
  });

  const groups = Object.values(byBillId).map((list) =>
    [...list].sort((a, b) => at(a) - at(b)));

  const byKey = {};
  legacy.forEach((p) => {
    const key = [
      p.supplier_id || p.supplier_name,
      p.date,
      String(p.payment_type || '').toUpperCase(),
    ].join('|');
    (byKey[key] = byKey[key] || []).push(p);
  });

  Object.values(byKey).forEach((list) => {
    const sorted = [...list].sort((a, b) => at(a) - at(b));
    let chunk = [];
    sorted.forEach((r) => {
      const prev = chunk[chunk.length - 1];
      if (prev && Math.abs(at(r) - at(prev)) > BURST_MS) {
        groups.push(chunk);
        chunk = [];
      }
      chunk.push(r);
    });
    if (chunk.length) groups.push(chunk);
  });

  return groups.map((lines) => {
    const total = lines.reduce((s, r) => s + amountOf(r), 0);
    // paid_amount is the single source of truth for what has been handed over.
    // Summing per-line payment rows instead let a bill settled by writing
    // paid_amount alone still read as owing.
    const paid = lines.reduce((s, r) => s + paidOf(r), 0);
    return {
      id: lines[0].id,
      // What a bill-level write targets. Falls back to the group's first id for
      // legacy rows, which is exactly what the backfill used, so the two agree.
      bill_id: lines[0].bill_id || lines[0].id,
      lines,
      date: lines[0].date,
      bill_no: lines[0].bill_no,
      supplier_id: lines[0].supplier_id,
      supplier_name: lines[0].supplier_name,
      payment_type: lines[0].payment_type,
      status: lines[0].status,
      credit: isCreditType(lines[0].payment_type),
      total,
      paid,
      due: Math.max(0, total - paid),
    };
  });
}
