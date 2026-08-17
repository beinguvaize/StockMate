/**
 * A POS sale, in the shape POSReceipt and InvoiceTemplate expect.
 *
 * There were two copies of this: one in SalePrintDispatcher (what the desktop
 * prints through) and one in ReceiptEmbed (what MOBILE prints through, since
 * the phone loads /embed/receipt in a WebView and prints that). Same job, two
 * implementations, and they had already drifted:
 *
 *  · `created_at` — added to the dispatcher when the receipt gained a time,
 *    and missed in the embed. So the desktop slip showed the time and the
 *    phone's did not, from the same component.
 *  · `client_id` — the dispatcher falls back to `clientId`, the embed did not.
 *  · `payment_status` — the dispatcher reads a COMPLETED sale as PAID, the
 *    embed did not, so such a sale could print "PAYMENT DUE" with a
 *    scan-to-pay QR on the phone and nothing of the sort on the desktop.
 *    Zero sales are in that state today; it was one status write away.
 *
 * Two surfaces printing the same sale differently is the bug this prevents.
 * The union of both behaviours is kept, since each difference was the more
 * complete side of the pair.
 */

const num = (v) => parseFloat(v) || 0;

/** Sale line items → the receipt's item shape. */
function mapItems(sale) {
  return (sale.items || []).map((i) => {
    const qty = parseFloat(i.quantity ?? i.qty ?? 1);
    const rate = num(i.price ?? i.sellingPrice ?? i.rate);
    const taxRate = num(i.taxRate);
    // NOTE: treats rate as tax-exclusive. POSReceipt recomputes taxable and tax
    // itself from the business's tax_mode and uses grand_total for the total,
    // so these two fields are advisory; the slip's arithmetic is its own.
    const taxAmount = (qty * rate * taxRate) / 100;
    return {
      name: i.name || i.productName || 'Item',
      sku: i.sku || '',
      hsn_code: i.hsn_code || i.hsn || '---',
      qty, rate, taxRate, taxAmount,
      unit: i.unit || 'PCS',
      total: qty * rate + taxAmount,
    };
  });
}

export function saleToInvoice(sale) {
  if (!sale) return null;
  const items = mapItems(sale);
  const taxableAmt = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const totalTax = items.reduce((s, i) => s + i.taxAmount, 0);
  const grandTotal = sale.totalAmount != null
    ? num(sale.totalAmount)
    : taxableAmt + totalTax;

  return {
    id: sale.id,
    invoice_number: sale.id?.split('-').pop() || sale.id,
    invoice_date: sale.date,
    // The time on the slip. invoice_date is date-only, so without this the
    // receipt can only say which day.
    created_at: sale.created_at || null,
    items,
    taxable_amount: taxableAmt,
    tax_total: totalTax,
    cgst_amount: totalTax / 2,
    sgst_amount: totalTax / 2,
    igst_amount: 0,
    is_interstate: false,
    grand_total: grandTotal,
    paid_amount: num(sale.paidAmount),
    // Cash actually handed over, which may exceed the bill. Without it the
    // receipt cannot print "Cash received" or the change line.
    amount_received: sale.amount_received != null ? num(sale.amount_received) : null,
    client_id: sale.shopId || sale.clientId || null,
    // A COMPLETED sale is paid. Collapsing everything non-PAID to UNPAID hid
    // that, and hid VOIDED too — a voided sale's receipt printed "PAYMENT DUE"
    // and a scan-to-pay QR for money that had been cancelled.
    payment_status: String(sale.status || '').toUpperCase() === 'COMPLETED'
      ? 'PAID'
      : String(sale.paymentStatus || 'UNPAID').toUpperCase(),
    round_off: 0,
  };
}

export default saleToInvoice;
