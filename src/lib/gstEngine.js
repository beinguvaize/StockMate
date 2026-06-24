/**
 * GST Calculation Engine - Ledgr ERP
 * ---------------------------------
 * Handles precise tax calculations, Indian Rupee formatting,
 * and Number-to-Words conversion for GST Compliance.
 */
import { computeLineTax } from './taxLine';

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
export const calculateGST = (items = [], businessState = '', clientState = '') => {
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
    const taxRate = Number.isFinite(_tr) ? _tr : 18;
    const hsn = item.hsn_code || item.sku || 'N/A';

    // Shared per-line math (same primitive the report engine uses).
    const L = computeLineTax({ qty, rate, discountPercent: discPercent, taxRate, interstate: isInterstate });
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
 * Generates a professionally formatted WhatsApp message for an invoice
 * and opens the WhatsApp Web/App sharing interface.
 */
export const shareToWhatsApp = (invoice, client, businessProfile) => {
  if (!invoice || !client || !businessProfile) return;

  const formatDate = (date) => new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
  const viewLink = (origin && invoice.id) ? `${origin}/embed/invoice/${invoice.id}` : '';

  // POS-sourced invoices store only grand_total (no taxable / tax split).
  // Derive the breakup from the line items so the message isn't blank/NaN.
  const hasSplit = invoice.cgst_amount != null || invoice.sgst_amount != null || invoice.igst_amount != null;
  const g = (!hasSplit && Array.isArray(invoice.items) && invoice.items.length)
    ? calculateGST(invoice.items, businessProfile.state || '', client.state || '')
    : null;
  const taxable = invoice.subtotal ?? invoice.taxable_amount ?? g?.taxable;
  const cgst = invoice.cgst_amount ?? g?.cgst ?? 0;
  const sgst = invoice.sgst_amount ?? g?.sgst ?? 0;
  const igst = invoice.igst_amount ?? g?.igst ?? 0;
  const interstate = invoice.is_interstate ?? (g ? g.isInterstate : false);
  const grand = invoice.grand_total ?? g?.grandTotal ?? 0;

  const msg = `
*${businessProfile.name}*
*GST Invoice: ${invoice.invoice_number}*
Date: ${formatDate(invoice.invoice_date)}

*Bill To:* ${client.name}
${client.gst_no ? `GSTIN: ${client.gst_no}` : 'GSTIN: URD'}

*Items:*
${(invoice.items || []).map(i => {
  const qty  = Number(i.qty ?? i.quantity ?? 0);
  const rate = Number(i.rate ?? i.price ?? i.sellingPrice ?? 0);
  const disc = Number(i.discountPercent ?? 0);
  const line = Number(
    i.total ??
    (i.taxable != null ? Number(i.taxable) + Number(i.totalTax || 0) : qty * rate * (1 - disc / 100))
  ) || 0;
  return `• ${i.name} × ${qty} = ${formatINR(line)}`;
}).join('\n')}

*Subtotal:* ${formatINR(taxable ?? grand)}
${interstate ?
  `*IGST:* ${formatINR(igst)}` :
  `*CGST:* ${formatINR(cgst)}
*SGST:* ${formatINR(sgst)}`}
*─────────────────*
*TOTAL: ${formatINR(grand)}*

${invoice.payment_status?.toUpperCase() === 'UNPAID' ? 
  `⚠️ *Amount Due: ${formatINR(invoice.balance_due ?? (grand - (invoice.paid_amount || 0)))}*` :
  '✅ *PAID*'}

${businessProfile.upi_id ?
  `💳 Pay via UPI: ${businessProfile.upi_id}` : ''}
${viewLink ? `\n🔗 View invoice: ${viewLink}` : ''}

Thank you for your business! 🙏
  `.trim();

  const encoded = encodeURIComponent(msg);
  const phone = client.contact?.replace(/[^0-9]/g, '');
  
  // Use 91 prefix for Indian numbers if it's 10 digits
  const targetPhone = (phone && phone.length === 10) ? `91${phone}` : phone;

  const url = targetPhone 
    ? `https://wa.me/${targetPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
    
  window.open(url, '_blank');
};
