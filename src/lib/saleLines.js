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
