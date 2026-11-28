/**
 * Who posts the money for the document builder (pages/documents).
 * ==========================================================================
 *
 * The database does, through post_sale_to_ledger on public.sales
 * (20261007_the_triggers_that_post_money.sql):
 *
 *  · a SALES INVOICE saved by process_sale with money paid is posted IN on
 *    insert, for the paid amount, on the account of its payment method.
 *  · a PAYMENT IN that raises a sale's paidAmount through settle_sale_payment
 *    is a "collection": the trigger posts only the delta, dated when it
 *    arrived, on the account of the SALE's own payment method.
 *
 * The builder used to post both again from the browser (addTxn), so every
 * paid invoice and every payment in sat in Cash & Bank twice.
 *
 * The one thing the trigger does not post is money on a CREDIT sale: it
 * returns before writing anything when the sale's method is CREDIT, on insert
 * and on a collection alike. So:
 *
 *  · a sales invoice on Credit must not claim money received now (it would
 *    reach no account at all) -- creditInvoiceTakesMoney refuses it;
 *  · a payment in against a CREDIT sale still has no database writer through
 *    settle_sale_payment, so the browser entry is kept for exactly that case
 *    and no other (browserPostsCollection). Without it the money would not be
 *    in the ledger at all. Moving this to settle_client_payment (which posts
 *    it through client_payments) is an owner decision, not made here.
 */

export const isCreditSale = (sale) =>
  String(sale?.paymentMethod ?? sale?.payment_method ?? '').toUpperCase() === 'CREDIT';

/** True only when settle_sale_payment's trigger will post nothing. */
export const browserPostsCollection = (sale) => isCreditSale(sale);

export const CREDIT_INVOICE_PAID_MSG =
  'A credit sale is not paid now. Untick Mark paid and leave Amount received empty, or choose Cash, Bank or UPI.';

/** A Credit invoice that says money was received: refused before saving. */
export const creditInvoiceTakesMoney = ({ payMethod, paidNow }) =>
  String(payMethod || '').toUpperCase() === 'CREDIT' && Number(paidNow) > 0;
