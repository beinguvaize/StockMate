/**
 * The document builder's totals (pages/documents/CreateDocument and the
 * TotalsPanel in components/documents/DocParts).
 * ==========================================================================
 *
 * MOVED, NOT REWRITTEN. Each function below is the expression the builder
 * computed inline before the redesign, lifted out word for word so the page
 * and its tests share one copy. documentTotals.test.js pins the figures for a
 * few fixed carts; if one of those changes, the money on a saved document
 * changed with it.
 */
import { calculateGST } from './gstEngine';

/** Live GST totals for the builder's lines (calculateGST, as the page called it). */
export const documentGst = (lines, gstOn, businessState, partyState, taxMode) => calculateGST(
  lines.map((l) => ({
    qty: l.qty, rate: l.rate, discountPercent: l.disc,
    taxRate: gstOn ? l.taxRate : 0, hsn_code: l.hsn,
  })),
  businessState, partyState || '',
  { taxMode: gstOn ? taxMode : 'NONE' },
);

/** Final payable = line totals + extra charges − bill discount. */
export const documentFinalTotal = (gst, charges, billDiscount) =>
  Math.max(0, (Number(gst.grandTotal) || 0) + (Number(charges) || 0) - (Number(billDiscount) || 0));

/** What a sales invoice says was paid now. */
export const documentPaidNow = (markPaid, finalTotal, received) => (markPaid ? finalTotal : (Number(received) || 0));

/** grand_total of a quotation, proforma or delivery challan (estimates row). */
export const estimateGrandTotal = (gstOn, gst, finalTotal, charges, billDiscount) =>
  (gstOn ? finalTotal : (Number(gst.subtotal) + (Number(charges) || 0) - (Number(billDiscount) || 0)));

/** The Total the totals panel shows. */
export const panelTotal = (gst, gstOn, charges, billDiscount) => {
  const base = gstOn ? Number(gst.grandTotal) || 0 : Number(gst.subtotal) || 0;
  return Math.max(0, base + (Number(charges) || 0) - (Number(billDiscount) || 0));
};

/** The Balance under Amount received on a sales invoice. */
export const panelBalance = (total, received) => Math.max(0, total - (Number(received) || 0));

/** One line's Amount cell (display only). */
export const lineAmount = (l) => (Number(l.qty) || 0) * (Number(l.rate) || 0) * (1 - (Number(l.disc) || 0) / 100);
