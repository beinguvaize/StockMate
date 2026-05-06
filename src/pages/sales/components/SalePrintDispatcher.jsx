import React, { useState } from 'react';
import InvoiceTemplate from '../../../components/invoice/InvoiceTemplate';
import POSReceipt from '../../../components/invoice/POSReceipt';
import { shareToWhatsApp } from '../../../lib/gstEngine';

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
    payment_status: (sale.status === 'COMPLETED' || sale.paymentStatus === 'PAID') ? 'PAID' : 'UNPAID',
    round_off:      0,
  };
};

const SalePrintDispatcher = ({ sale, client, business, onClose }) => {
  const [mode, setMode] = useState('gst'); // 'gst' | 'pos'

  if (!sale) return null;

  const invoice = saleToInvoice(sale);
  const safeClient = client || { name: 'Walk-in' };

  const closeAll = () => { setMode('gst'); onClose(); };

  if (mode === 'pos') {
    return (
      <POSReceipt
        invoice={invoice}
        businessProfile={business}
        client={safeClient}
        onClose={closeAll}
      />
    );
  }

  return (
    <InvoiceTemplate
      invoice={invoice}
      businessProfile={business}
      client={safeClient}
      onPrint={() => window.print()}
      onShare={(type) => {
        if (type === 'whatsapp') shareToWhatsApp(invoice, safeClient, business);
      }}
      onToggleMode={() => setMode('pos')}
      onClose={closeAll}
    />
  );
};

export default SalePrintDispatcher;
