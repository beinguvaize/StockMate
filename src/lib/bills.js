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

export function groupPurchasesIntoBills(rows = []) {
  const byKey = {};
  rows.forEach((p) => {
    const key = [
      p.supplier_id || p.supplier_name,
      p.date,
      String(p.payment_type || '').toUpperCase(),
    ].join('|');
    (byKey[key] = byKey[key] || []).push(p);
  });

  const groups = [];
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
