/**
 * What columns an invoice line table has, in one place.
 *
 * WHY. Adding a column to a bill meant editing seven independent literal
 * lists: the classic table in InvoiceTemplate.jsx, the shared ItemsTable used
 * by the modern / compact / letterhead layouts, GSTInvoicePrint, CashBillPrint,
 * PremiumInvoice, and a 10-column Dart table on mobile. Nothing kept them in
 * agreement, so "put the part number on the invoice" was a seven-file change
 * with no single place to look.
 *
 * Two of those seven are gone rather than converted: GSTInvoicePrint (290
 * lines) and PremiumInvoice (354) had NO importers anywhere -- not in src, not
 * in e2e, not on mobile or desktop. Migrating a template nobody renders would
 * have been work with no reader. They are in git history if they are ever
 * wanted back.
 *
 * Still outside this registry, and deliberately: CashBillPrint (a non-GST cash
 * slip with its own two-column shape), POSReceipt (58/80mm thermal), and the
 * Dart A4 table on mobile. Each is a different medium with different
 * constraints; pulling a 10-column Dart table into a JS registry is not a
 * refactor, it is a rewrite.
 *
 * Worse, the classic table computed its colspans by hand:
 *
 *     colSpan={((isInterstate) ? 8 : 9) - (opts.hsn ? 0 : 1)}
 *
 * Two magic numbers that had to be re-derived, correctly, by whoever added the
 * eighth column. Get it wrong and the totals row silently slides one cell out
 * of line on a printed tax document. `spanOf` below counts the columns that
 * are actually visible instead.
 *
 * A column is DATA here: an id, a header, an alignment, a width, a predicate
 * saying when it appears, and a function from a line to a printable value.
 * Returning strings rather than JSX is deliberate -- it is what lets the whole
 * thing be unit tested without rendering anything.
 */

const money = (n) => Number(n || 0).toFixed(2);
const num = (v) => parseFloat(v || 0);

/** Is this bill interstate? Both spellings are in the wild. */
export const isInterstate = (invoice = {}) =>
  !!(invoice.is_interstate || invoice.isInterstate);

/**
 * Every column the app knows how to print.
 *
 * `visible(ctx)` receives { invoice, opts }. Omitting it means always shown.
 */
export const COLUMN_DEFS = {
  index:   { id: 'index',   header: '#',        align: 'center', width: 'w-8',
             value: (_it, _ctx, i) => String(i + 1) },

  name:    { id: 'name',    header: 'Description', align: 'left',
             value: (it) => it.name || '' },

  hsn:     { id: 'hsn',     header: 'HSN/SAC',  align: 'center', width: 'w-16',
             visible: ({ opts }) => !!opts?.hsn,
             value: (it) => it.hsn_code || '—' },

  qty:     { id: 'qty',     header: 'Qty',      align: 'right',  width: 'w-12',
             value: (it) => String(it.qty ?? '') },

  rate:    { id: 'rate',    header: 'Rate',     align: 'right',  width: 'w-20',
             value: (it) => money(it.rate) },

  taxable: { id: 'taxable', header: 'Taxable',  align: 'right',  width: 'w-20',
             // The line's own taxable value when it carries one, else qty x rate.
             value: (it) => money(it.taxable ?? num(it.qty) * num(it.rate)) },

  gstPct:  { id: 'gstPct',  header: 'GST%',     align: 'center', width: 'w-10',
             value: (it) => `${it.taxRate ?? 0}%` },

  igst:    { id: 'igst',    header: 'IGST',     align: 'right',  width: 'w-20',
             visible: ({ invoice }) => isInterstate(invoice),
             value: (it) => money(it.taxAmount) },

  cgst:    { id: 'cgst',    header: 'CGST',     align: 'right',  width: 'w-20',
             visible: ({ invoice }) => !isInterstate(invoice),
             value: (it) => money(num(it.taxAmount) / 2) },

  sgst:    { id: 'sgst',    header: 'SGST',     align: 'right',  width: 'w-20',
             visible: ({ invoice }) => !isInterstate(invoice),
             value: (it) => money(num(it.taxAmount) / 2) },

  amount:  { id: 'amount',  header: 'Amount',   align: 'right',  width: 'w-24',
             value: (it) => money(it.total) },
};

/**
 * The full GST tax-invoice table: per-line tax split, the document a filing
 * is built from.
 */
export const GST_INVOICE_COLUMNS = [
  'index', 'name', 'hsn', 'qty', 'rate', 'taxable', 'gstPct', 'igst', 'cgst', 'sgst', 'amount',
];

/**
 * The compact table the modern / compact / letterhead layouts share. No
 * per-line tax split -- those layouts carry it in the totals block instead.
 */
export const SIMPLE_INVOICE_COLUMNS = [
  'index', 'name', 'hsn', 'qty', 'rate', 'gstPct', 'amount',
];

/** The columns actually printed, given the invoice and the print options. */
export function resolveColumns(ids, ctx = {}) {
  return ids
    .map((id) => COLUMN_DEFS[id])
    .filter(Boolean)
    .filter((c) => (c.visible ? c.visible(ctx) : true));
}

/**
 * How many visible columns a totals row must span to reach `untilId`.
 *
 * This replaces arithmetic that had the answer written into it as a literal.
 * Counting is not cleverer, it is just the version that survives someone
 * adding a column.
 */
export function spanOf(ids, ctx, untilId) {
  const cols = resolveColumns(ids, ctx);
  const at = cols.findIndex((c) => c.id === untilId);
  return at === -1 ? cols.length : at;
}

/** Total visible column count — for a full-width spacer row. */
export function columnCount(ids, ctx) {
  return resolveColumns(ids, ctx).length;
}
