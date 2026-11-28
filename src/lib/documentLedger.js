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
 *  · a payment in whose oldest open bill is a CREDIT sale goes through
 *    settle_client_payment, the server function Collect Payment calls
 *    (usePeople.recordClientPayment with no invoice ids). It spreads the
 *    amount over the client's open bills, oldest first, and its
 *    client_payments row is posted by post_client_payment_to_ledger. The
 *    browser writes no ledger or balance row for a payment in at all.
 */

export const isCreditSale = (sale) =>
  String(sale?.paymentMethod ?? sale?.payment_method ?? '').toUpperCase() === 'CREDIT';

/**
 * True when settle_sale_payment's trigger would post nothing (a CREDIT sale),
 * so the payment in must go through settle_client_payment instead.
 */
export const collectionGoesToClientSettlement = (sale) => isCreditSale(sale);

export const CREDIT_INVOICE_PAID_MSG =
  'A credit sale is not paid now. Untick Mark paid and leave Amount received empty, or choose Cash, Bank or UPI.';

/** A Credit invoice that says money was received: refused before saving. */
export const creditInvoiceTakesMoney = ({ payMethod, paidNow }) =>
  String(payMethod || '').toUpperCase() === 'CREDIT' && Number(paidNow) > 0;

/**
 * Why a payment in must NOT be sent to settle_client_payment, or null.
 *
 * settle_client_payment files the receipt under p_client_id, and the
 * allocators that later spread client_payments over credit sales match a
 * sale by "shopId" (the column process_sale, the phone and van sales write
 * the client into). The builder finds the open sale with a looser test
 * (shopId ?? shop_id ?? clientId), under which a party with no id matches a
 * walk-in sale (undefined === undefined). So the RPC is only called when the
 * party has a real id and the sale's own shopId is that same id.
 */
export const CLIENT_SETTLEMENT_NO_CLIENT_MSG =
  'Choose a saved client to record a payment against a credit bill. This party has no client record.';
export const CLIENT_SETTLEMENT_MISMATCH_MSG =
  'This credit bill is not filed under this client, so the payment cannot be matched to it. Record it from the client\'s account page instead.';

export const clientSettlementBlocker = (party, sale) => {
  const pid = party?.id == null ? '' : String(party.id).trim();
  if (!pid || party?.manual) return CLIENT_SETTLEMENT_NO_CLIENT_MSG;
  const sid = sale?.shopId ?? sale?.shop_id;
  if (sid == null || String(sid).trim() !== pid) return CLIENT_SETTLEMENT_MISMATCH_MSG;
  return null;
};
