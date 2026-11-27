/**
 * GST Calculation Engine - Ledgr ERP
 * ---------------------------------
 * Handles precise tax calculations, Indian Rupee formatting,
 * and Number-to-Words conversion for GST Compliance.
 */
import { computeLineTax } from './taxLine';
import { buildShareMessage, whatsappUrl, pickClientPhone, isMobileBrowser } from './invoiceShare';

/**
 * Formats a number as Indian Rupee (INR)
 * Example: 123456.78 -> ₹1,23,456.78
 */
export const formatINR = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Converts a number to Indian Words
 * Example: 575 -> "Rupees Five Hundred Seventy Five Only"
 */
export const amountToWords = (amount) => {
  if (amount === 0) return "Rupees Zero Only";

  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (num) => {
    if ((num = num.toString()).length > 9) return 'overflow';
    let n = ('000000000' + num).substring(num.length).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return ''; 
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str.trim();
  };

  const parts = amount.toString().split('.');
  const whole = parseInt(parts[0]);
  const decimal = parts[1] ? parseInt(parts[1].substring(0, 2)) : 0;

  let result = `Rupees ${inWords(whole)}`;
  if (decimal > 0) {
    result += ` and ${inWords(decimal)} Paise`;
  }
  return `${result} Only`.replace(/\s+/g, ' ');
};

/**
 * Comprehensive GST Calculation
 * Returns all tax components and summaries for an invoice.
 */
/**
 * @param opts.taxMode  'EXCLUSIVE' (default) | 'INCLUSIVE' | 'NONE'
 *
 * INCLUSIVE means the rate on the line already contains the tax, so it is
 * extracted rather than added -- see taxLine.js. NONE is a shop that does not
 * file GST: the price is final and no tax is split out, which is what the POS
 * has always done for that mode and what sale_gst_amount does server-side.
 *
 * A fourth argument rather than a positional one because the three before it
 * are already positional and a caller passing 'INCLUSIVE' into the wrong slot
 * would silently become a client state.
 */
export const calculateGST = (items = [], businessState = '', clientState = '', opts = {}) => {
  const mode = String(opts.taxMode || 'EXCLUSIVE').toUpperCase();
  const inclusive = mode === 'INCLUSIVE';
  const noTax = mode === 'NONE';
  const safeBusinessState = typeof businessState === 'string' ? businessState.trim().toLowerCase() : '';
  const safeClientState = typeof clientState === 'string' ? clientState.trim().toLowerCase() : '';
  // Inter-state only when BOTH states are known and differ. If the seller's
  // state isn't set (common when the business profile is incomplete), default
  // to intra-state (CGST+SGST) instead of dumping everything into IGST.
  const isInterstate = safeBusinessState !== '' && safeClientState !== '' && safeBusinessState !== safeClientState;
  
  let subtotal = 0;
  let totalDiscount = 0;
  let taxableAmount = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;
  
  // HSN-wise tax summary
  const hsnMap = new Map();

  const processedItems = items.map(item => {
    const qty = parseFloat(item.qty || item.quantity || 0);
    const rate = parseFloat(item.rate || item.sellingPrice || 0);
    const discPercent = parseFloat(item.discountPercent || 0);
    // Honour an explicit 0% — `|| 18` wrongly treated 0 as "missing" and taxed
    // GST-exempt items at 18%. Only fall back to 18 when truly absent.
    const _tr = parseFloat(item.taxRate);
    // NONE: the shop does not file GST, so nothing is split out and the price
    // stands as the final figure -- the same rule the POS applies.
    const taxRate = noTax ? 0 : (Number.isFinite(_tr) ? _tr : 18);
    const hsn = item.hsn_code || item.sku || 'N/A';

    // Shared per-line math (same primitive the report engine uses).
    const L = computeLineTax({ qty, rate, discountPercent: discPercent, taxRate, interstate: isInterstate, inclusive });
    const itemSubtotal = L.gross;
    const itemDiscount = L.discount;
    const itemTaxable = L.taxable;
    const itemCGST = L.cgst;
    const itemSGST = L.sgst;
    const itemIGST = L.igst;

    const itemTotalTax = itemCGST + itemSGST + itemIGST;
    const itemTotal = itemTaxable + itemTotalTax;

    // Update Totals
    subtotal += itemSubtotal;
    totalDiscount += itemDiscount;
    taxableAmount += itemTaxable;
    cgstTotal += itemCGST;
    sgstTotal += itemSGST;
    igstTotal += itemIGST;

    // Update HSN Summary
    if (!hsnMap.has(hsn)) {
      hsnMap.set(hsn, { hsn, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, rate: taxRate });
    }
    const hsnEntry = hsnMap.get(hsn);
    hsnEntry.taxable += itemTaxable;
    hsnEntry.cgst += itemCGST;
    hsnEntry.sgst += itemSGST;
    hsnEntry.igst += itemIGST;
    hsnEntry.totalTax += itemTotalTax;

    return {
      ...item,
      qty,
      rate,
      subtotal: itemSubtotal,
      discount: itemDiscount,
      taxable: itemTaxable,
      cgst: itemCGST,
      sgst: itemSGST,
      igst: itemIGST,
      totalTax: itemTotalTax,
      total: itemTotal,
      taxRate,
      hsn
    };
  });

  const totalTax = cgstTotal + sgstTotal + igstTotal;
  const rawGrandTotal = taxableAmount + totalTax;
  const grandTotal = Math.round(rawGrandTotal);
  const roundOff = grandTotal - rawGrandTotal;

  return {
    items: processedItems,
    subtotal: parseFloat(subtotal.toFixed(2)),
    discount: parseFloat(totalDiscount.toFixed(2)),
    taxable: parseFloat(taxableAmount.toFixed(2)),
    cgst: parseFloat(cgstTotal.toFixed(2)),
    sgst: parseFloat(sgstTotal.toFixed(2)),
    igst: parseFloat(igstTotal.toFixed(2)),
    totalTax: parseFloat(totalTax.toFixed(2)),
    roundOff: parseFloat(roundOff.toFixed(2)),
    grandTotal,
    amountInWords: amountToWords(grandTotal),
    taxSummary: Array.from(hsnMap.values()).map(v => ({
      ...v,
      taxable: parseFloat(v.taxable.toFixed(2)),
      cgst: parseFloat(v.cgst.toFixed(2)),
      sgst: parseFloat(v.sgst.toFixed(2)),
      igst: parseFloat(v.igst.toFixed(2)),
      totalTax: parseFloat(v.totalTax.toFixed(2))
    })),
    isInterstate
  };
};

/**
 * Opens WhatsApp with a plain-text summary of the invoice (no link, no PDF).
 *
 * Kept for older callers only. The app's Share control
 * (components/share/ShareInvoiceDialog) is the real path: it sends the PDF
 * and a link the client can open without signing in. The old version linked
 * to /embed/invoice/<id>, which needs a sign-in, so clients saw "Invoice not
 * found"; it also read only client.contact and gst_no.
 */
export const shareToWhatsApp = (invoice, client, businessProfile) => {
  if (!invoice) return;
  const text = buildShareMessage({ invoice, business: businessProfile || {}, client: client || {} });
  const mobile = typeof navigator !== 'undefined' && isMobileBrowser(navigator.userAgent, navigator.maxTouchPoints);
  window.open(whatsappUrl({ phone: pickClientPhone(client, invoice), text, mobile }), '_blank', 'noopener');
};
