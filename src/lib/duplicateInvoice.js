/**
 * Duplicate an invoice: what a NEW, unsaved sales invoice starts with when it
 * is made from an old one (approved mockups invoices-15 and 16).
 *
 * Copied: the client, the items with their quantities, prices, discounts,
 * HSN and tax rates, and the notes.
 * Never copied: payments (the new invoice starts unpaid, Mark paid off), the
 * e-Way bill, the IRN, the invoice number (given on save) and the date (today).
 *
 * Nothing is saved here. The copy is a form; saving it goes through the
 * document builder's existing create path like any other new invoice.
 */

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

let seq = 0;

/** Lines in the document builder's shape. */
export function duplicateLines(items = []) {
  return (Array.isArray(items) ? items : []).map((it, i) => {
    const productId = it?.productId ?? it?.product_id ?? it?.id ?? null;
    seq += 1;
    return {
      uid: `DUP-${productId || 'line'}-${i}-${seq}`,
      productId,
      name: it?.name || '',
      hsn: String(it?.hsn_code || it?.hsn || '').replace(/[^0-9]/g, ''),
      qty: num(it?.qty ?? it?.quantity, 1),
      rate: num(it?.rate ?? it?.price ?? it?.sellingPrice),
      disc: num(it?.discountPercent ?? it?.discount_percent ?? it?.disc),
      taxRate: num(it?.taxRate ?? it?.tax_rate),
    };
  });
}

/**
 * The whole starting point for the form.
 * @returns {{ party: object|null, lines: Array, notes: string, source: object }}
 *   party is the stored client when the invoice had one, else null (a
 *   walk-in invoice has no client to bill again; the form asks for one).
 */
export function duplicateInvoiceDraft(invoice = {}, clients = []) {
  const party = invoice?.client_id
    ? (clients.find((c) => String(c.id) === String(invoice.client_id)) || null)
    : null;
  return {
    party,
    lines: duplicateLines(invoice?.items),
    notes: String(invoice?.notes ?? invoice?.note ?? ''),
    source: {
      id: invoice?.id ?? null,
      number: invoice?.invoice_number || null,
      date: invoice?.invoice_date || null,
      clientName: party?.name || invoice?.client_name || null,
    },
  };
}
