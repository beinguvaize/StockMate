/**
 * Phase 4 — read a sale's lines from the sale_items TABLE, not the blob.
 *
 * WHY THIS IS A MAPPING AND NOT 26 REWRITES.
 *
 * Twenty-six places read a sale's lines: every profit report, the GST returns,
 * the CSV export, the day book. Rewriting each to query a new table would be
 * twenty-six chances to change a money figure by accident, in code that
 * produces statutory returns and a profit number that is explicitly frozen.
 *
 * So the change happens at the SOURCE instead. The table is read, mapped back
 * to the line shape every reader already expects, and the readers do not
 * change at all. What changes is where the numbers come from.
 *
 * THE BLOB IS STILL THE FALLBACK, deliberately. A sale with no rows in
 * sale_items keeps its blob lines. That covers the one case the dual-write
 * trigger is allowed to produce -- a line it could not represent is skipped
 * rather than raised, because a bill must complete even if a ledger row
 * cannot -- and it means this phase cannot lose a line even if the trigger
 * misses one. The nightly reconciliation is what reports such a sale.
 *
 * Phase 5 removes the fallback, once the blob is no longer written.
 */

/**
 * Map one sale_items row to the line shape the readers expect.
 *
 * The key names are the BLOB's, not the table's, on purpose: `taxRate` rather
 * than `tax_rate`, `id` rather than `product_id`. This is the compatibility
 * layer, and a reader that has always said `item.taxRate` should keep working
 * without knowing the storage changed underneath it.
 */
export function rowToLine(row) {
  if (!row) return null;
  return {
    // Readers reach for `productId` first and fall back to `id`; the blob only
    // ever carried `id`. Both are populated so either spelling resolves.
    id: row.product_id ?? null,
    productId: row.product_id ?? null,
    name: row.product_name ?? '',
    quantity: Number(row.quantity) || 0,
    rate: Number(row.rate) || 0,
    taxRate: Number(row.tax_rate) || 0,
    cess: Number(row.cess_rate) || 0,
    hsn: row.hsn_code ?? null,
    discount: Number(row.discount) || 0,
    unit: row.unit ?? null,
    uqc: row.unit ?? null,
    // Alt-unit snapshot, so a receipt still prints "4 Packet @ Rs 40".
    ...(row.sell_unit_name ? {
      sellUnitName: row.sell_unit_name,
      sellQty: Number(row.sell_qty) || 0,
      sellUnitPrice: Number(row.sell_unit_price) || 0,
    } : {}),
    // Serials arrive as an embedded collection when the caller asked for them.
    ...(Array.isArray(row.sale_item_serials) && row.sale_item_serials.length
      ? { imeis: row.sale_item_serials.map(s => s.serial).filter(Boolean) }
      : {}),
  };
}

/**
 * Replace a sale's `items` with the lines held in the table.
 *
 * Returns the sale UNCHANGED when the table holds nothing for it, so a sale
 * whose lines could not be represented keeps the blob it already had. Silently
 * emptying `items` would turn a reporting gap into a bill that looks like it
 * sold nothing, which is far worse than reading the older copy.
 */
export function hydrateSale(sale) {
  if (!sale || typeof sale !== 'object') return sale;
  const rows = sale.sale_items;
  if (!Array.isArray(rows) || rows.length === 0) return sale;

  const lines = [...rows]
    .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
    .map(rowToLine)
    .filter(Boolean);

  // Drop the embedded collection so it does not travel on with the row and
  // get cached, counted or exported as if it were a field of the sale.
  const { sale_items: _embedded, ...rest } = sale;
  return { ...rest, items: lines };
}

export function hydrateSales(sales) {
  if (!Array.isArray(sales)) return sales;
  return sales.map(hydrateSale);
}

/** The PostgREST embed that makes the above possible. */
export const SALE_ITEMS_EMBED =
  'sale_items(line_no, product_id, product_name, hsn_code, quantity, rate, ' +
  'tax_rate, cess_rate, discount, unit, sell_unit_name, sell_qty, ' +
  'sell_unit_price, sale_item_serials(serial))';

/* ────────────────────────────────────────────────────────────────────────────
 * Phase 6 — an invoice's lines come from its sale.
 *
 * 152 of 152 live sale-linked invoices held a line-for-line copy of their
 * sale's lines. Not "mostly": every one, once numeric formatting (28 vs 28.0)
 * and line ORDER are normalised. The copy is written once and then drifts on
 * its own, and there is no mechanism that would ever bring the two back
 * together -- editing a sale does not touch the invoice's copy.
 *
 * Two things looked at first like the invoice holding something the sale did
 * not, and neither survived checking:
 *
 *   * Thirty invoices appeared to differ. They differ only in the ORDER of the
 *     same lines, and in one case in 28.0 against 28.
 *   * Five invoice lines carried an `hsn` the sale lacked. That value is the
 *     literal string "N/A" -- not an HSN code, and something that would
 *     pollute the GSTR-1 HSN summary if it were preserved.
 *
 * The two invoices that DO genuinely differ (INV-0042, INV-0072) are both
 * soft-deleted, and are reached by the fallback below rather than rewritten.
 *
 * This derives from the sales already in hand rather than issuing a second
 * query: useSales fetches both, and an invoice's lines are its sale's lines.
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Give each invoice the lines of the sale it was raised from.
 *
 * Falls back to the invoice's own `items` whenever the sale is not available:
 * a standalone invoice with no `sale_id`, a sale outside the fetched window,
 * or a sale whose lines could not be represented. An invoice is a document a
 * customer has been sent; showing it with no lines because a lookup missed
 * would be far worse than showing the copy it has always carried.
 */
export function hydrateInvoicesFromSales(invoices, sales) {
  if (!Array.isArray(invoices)) return invoices;
  if (!Array.isArray(sales) || sales.length === 0) return invoices;

  const linesBySaleId = new Map();
  for (const s of sales) {
    if (s?.id && Array.isArray(s.items) && s.items.length) {
      linesBySaleId.set(s.id, s.items);
    }
  }
  if (linesBySaleId.size === 0) return invoices;

  return invoices.map((inv) => {
    const saleId = inv?.sale_id;
    if (!saleId) return inv;
    const lines = linesBySaleId.get(saleId);
    if (!lines) return inv;
    return { ...inv, items: lines };
  });
}
