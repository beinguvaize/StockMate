/**
 * What a product IS, for the reports that assume everything is stock.
 *
 * `isRaw` was written out by hand in two report files and `isService` in none,
 * which is why a service — permanently at stock 0, because it has no stock —
 * appeared in the low-stock report forever.
 */

const typeOf = (p) => String(p?.product_type || 'STANDARD').toUpperCase();

/** Raw material: consumed in manufacturing, never sold, so never "sellable". */
export const isRaw = (p) => typeOf(p) === 'RAW';

/**
 * Labour, repair, a tuition hour. Has a price and no stock.
 *
 * The database no longer records stock movements for these: a BEFORE INSERT
 * trigger on movement_log and inventory_balances drops those rows, so the four
 * money functions stay byte-identical while the ledger stops describing goods
 * that do not exist. Their stock still reads 0 because there is nothing to
 * count, which is why they remain excluded from stock reporting.
 */
export const isService = (p) => typeOf(p) === 'SERVICE';

/** Something that can actually run out. */
export const isStocked = (p) => !isRaw(p) && !isService(p);

/** Columns a query must select for the helpers above to work. */
export const PRODUCT_TYPE_COLUMNS = 'product_type';
