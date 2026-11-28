/**
 * What the shop owes each supplier: ONE figure for the whole web app.
 *
 * The single truth is the supplier ledger's closing balance (owner approved):
 * every bill, less what was paid at the bill and every later payment, less
 * debit notes (purchase returns), less money paid on account. The Supplier
 * ledger page, the Suppliers list, the supplier panel and the Dashboard's
 * "You owe" / "You owe most" all read it from here, so no two screens can
 * disagree. Display only; nothing here writes.
 *
 * The ledger is built exactly as the ledger page always built it
 * (supplierLedgerFor below, buildSupplierLedger in lib/bills):
 *   · purchases and returns belong to a supplier by supplier_id, or by
 *     supplier_name on older rows;
 *   · payments the same, leaving out soft-deleted (spent) advances;
 *   · a payment with no purchase_id is money on account.
 *
 * A closing balance above 0 is owed; below 0 is an advance with the supplier.
 */
import { groupPurchasesIntoBills, buildSupplierLedger } from './bills';

export const purchaseTotal = (p) => Number(p?.total_amount ?? p?.total_cost ?? 0);
export const purchasePaid = (p) => Number(p?.paid_amount ?? 0);

const belongs = (s, row) => row.supplier_id === s.id || row.supplier_name === s.name;
const newestFirst = (a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0);

/**
 * One supplier's ledger, as the Supplier ledger page shows it.
 * Returns the rows behind it and `closing`, the balance across all history.
 */
export function supplierLedgerFor(supplier, { purchases = [], purchaseReturns = [], supplierPayments = [] } = {}) {
  if (!supplier) {
    return { supplierPurchases: [], supplierReturns: [], payments: [], onAccountPayments: [], bills: [], rows: [], closing: 0 };
  }
  const supplierPurchases = (purchases || []).filter((p) => belongs(supplier, p)).sort(newestFirst);
  const supplierReturns = (purchaseReturns || []).filter((r) => belongs(supplier, r)).sort(newestFirst);
  // Spent advances are soft-deleted and replaced by allocation rows; the
  // offline cache can still hold one, and counting both would credit the
  // same money twice.
  const payments = (supplierPayments || [])
    .filter((p) => !p.deleted_at)
    .filter((p) => belongs(supplier, p))
    .sort(newestFirst);
  const onAccountPayments = payments.filter((p) => !p.purchase_id);
  const bills = groupPurchasesIntoBills(supplierPurchases);
  const rows = buildSupplierLedger({ bills, payments, returns: supplierReturns, onAccountPayments });
  const closing = rows.length ? rows[rows.length - 1].balance : 0;
  return { supplierPurchases, supplierReturns, payments, onAccountPayments, bills, rows, closing };
}

/** The ledger closing balance split into owed (> 0) and advance (< 0). */
export const owedFromClosing = (closing) => {
  const c = Number(closing) || 0;
  return { closing: c, owed: Math.max(0, c), advance: Math.max(0, -c) };
};

/** Map of supplier id -> { closing, owed, advance } for every supplier given. */
export function owedBySupplier(suppliers = [], data = {}) {
  const by = new Map();
  (suppliers || []).forEach((s) => by.set(s.id, owedFromClosing(supplierLedgerFor(s, data).closing)));
  return by;
}

/**
 * The "You owe" total and the suppliers owed, largest first.
 * A supplier counts as owed above 0.01, as on the Suppliers list.
 */
export function supplierOwedSummary(suppliers = [], data = {}) {
  const by = owedBySupplier(suppliers, data);
  let total = 0, advance = 0;
  const owing = [];
  (suppliers || []).forEach((s) => {
    const f = by.get(s.id);
    total += f.owed;
    advance += f.advance;
    if (f.owed > 0.01) owing.push({ id: s.id, name: s.name, owed: f.owed });
  });
  owing.sort((a, b) => b.owed - a.owed);
  return { total, advance, count: owing.length, owing };
}
