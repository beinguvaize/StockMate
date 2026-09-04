import React from 'react';
import POSReceipt from '../../../components/invoice/POSReceipt';
import { saleToInvoice } from '../../../lib/saleToInvoice';

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
