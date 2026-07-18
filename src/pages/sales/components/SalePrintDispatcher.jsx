import React from 'react';
import POSReceipt from '../../../components/invoice/POSReceipt';

/**
 * Maps a POS sale record → InvoiceTemplate / POSReceipt invoice shape.
 * Identical format to the Invoices page so print output is the same.
 */
const saleToInvoice = (sale) => {
  const items = (sale.items || []).map(i => {
    const qty  = parseFloat(i.quantity || i.qty || 1);
    const rate = parseFloat(i.price || i.sellingPrice || i.rate || 0);
    const taxRate = parseFloat(i.taxRate ?? 0);
    const taxAmount = qty * rate * taxRate / 100;
    return {
      name:     i.name || i.productName || 'Item',
      sku:      i.sku || '',
      hsn_code: i.hsn_code || i.hsn || '---',
      qty, rate, taxRate, taxAmount,
      unit:  i.unit || 'PCS',
      total: qty * rate + taxAmount,
    };
  });

  const taxableAmt = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const totalTax   = items.reduce((s, i) => s + i.taxAmount, 0);
  const grandTotal = parseFloat(sale.totalAmount || taxableAmt + totalTax);

  return {
    id:             sale.id,
    invoice_number: sale.id?.split('-').pop() || sale.id,
    invoice_date:   sale.date,
    items,
    taxable_amount: taxableAmt,
    tax_total:      totalTax,
    cgst_amount:    totalTax / 2,
    sgst_amount:    totalTax / 2,
    igst_amount:    0,
    is_interstate:  false,
    grand_total:    grandTotal,
    paid_amount:    parseFloat(sale.paidAmount || 0),
    // Real cash tendered — needed for the "Cash received / Extra paid to
    // account" lines; the mapper used to drop it.
    amount_received: sale.amount_received != null ? parseFloat(sale.amount_received) : null,
    client_id:       sale.shopId || sale.clientId || null,
    // Preserve the real status (esp. VOIDED/FAILED) so POSReceipt can
    // suppress the payment-due line + scan-to-pay QR on cancelled sales.
    payment_status: (sale.status === 'COMPLETED')
      ? 'PAID'
      : (sale.paymentStatus || 'UNPAID').toUpperCase(),
    round_off:      0,
  };
};

/**
 * Architectural rule:
 *   - POS sales print POS receipts (thermal / 80mm).
 *   - GST tax invoices are a separate legal document, printed from the
 *     Invoices tab AFTER the sale has been converted to an invoice.
 *
 * Therefore: a sale-row Print action always renders POSReceipt — no toggle
 * to the InvoiceTemplate. If the sale has been converted (sale.invoice_id
 * is set) the receipt shows a small reference so the user knows where to
 * find the GST document.
 */
const SalePrintDispatcher = ({ sale, client, business, onClose }) => {
  if (!sale) return null;

  const invoice = saleToInvoice(sale);
  const safeClient = client || { name: 'Walk-in' };
  return (
    <POSReceipt
      invoice={invoice}
      businessProfile={business}
      client={safeClient}
      onClose={onClose}
    />
  );
};

export default SalePrintDispatcher;
