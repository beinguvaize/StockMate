/**
 * What the shop owes each supplier: the Suppliers list's figure, in one place.
 *
 * The code has three different "owed to a supplier" figures (this one, the
 * Purchases screen's bills.js, and the supplier ledger). The Suppliers list
 * (SupplierWorkspace) shows this one, and the Dashboard's "You owe" tile and
 * "You owe most" list read the same function, so the two screens cannot
 * disagree. The rule is unchanged from SupplierWorkspace:
 *
 *   per bill   due = max(0, total - paid)       total = total_amount ?? total_cost
 *              an overpaid bill (total - paid < 0) is money sitting with the
 *              supplier: it is tracked as `advance`
 *   per supplier owed = max(0, Σ due - advance)
 *
 * A purchase is matched to a supplier by supplier_id, or by supplier_name for
 * older rows that carry only the name.
 */

export const purchaseTotal = (p) => Number(p?.total_amount ?? p?.total_cost ?? 0);
export const purchasePaid = (p) => Number(p?.paid_amount ?? 0);

/**
 * Map of supplier id -> { payable, advance, owed } for every supplier given.
 * `payable` is Σ of each bill's floored due, `advance` the overpaid amounts,
 * `owed` what the Suppliers list shows.
 */
export function owedBySupplier(suppliers = [], purchases = []) {
  const by = new Map();
  (suppliers || []).forEach(s => by.set(s.id, { payable: 0, advance: 0, owed: 0 }));
  (purchases || []).forEach(p => {
    const sup = (suppliers || []).find(s => s.id === p.supplier_id || s.name === p.supplier_name);
    if (!sup) return;
    const f = by.get(sup.id);
    const raw = purchaseTotal(p) - purchasePaid(p);
    f.payable += Math.max(0, raw);
    if (raw < 0) f.advance += -raw;
  });
  by.forEach(f => { f.owed = Math.max(0, f.payable - f.advance); });
  return by;
}

/**
 * The "You owe" total and the suppliers owed, largest first.
 * A supplier counts as owed above 0.01, as on the Suppliers list.
 */
export function supplierOwedSummary(suppliers = [], purchases = []) {
  const by = owedBySupplier(suppliers, purchases);
  let total = 0, advance = 0;
  const owing = [];
  (suppliers || []).forEach(s => {
    const f = by.get(s.id);
    total += f.owed;
    advance += f.advance;
    if (f.owed > 0.01) owing.push({ id: s.id, name: s.name, owed: f.owed });
  });
  owing.sort((a, b) => b.owed - a.owed);
  return { total, advance, count: owing.length, owing };
}
