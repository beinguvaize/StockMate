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
 * process_sale still writes a movement row and an inventory balance for these,
 * clamped at zero — so their stock reads 0 forever and every threshold test
 * matches. Excluded from stock reporting until the sale path knows the
 * difference; that fix touches the money path and is its own change.
 */
export const isService = (p) => typeOf(p) === 'SERVICE';

/** Something that can actually run out. */
export const isStocked = (p) => !isRaw(p) && !isService(p);

/** Columns a query must select for the helpers above to work. */
export const PRODUCT_TYPE_COLUMNS = 'product_type';
