/**
 * Everything an A4 invoice model prints, from the stored invoice.
 *
 * No tax or money is calculated here. The figures are:
 *   - the invoice's stored totals (taxable_amount, tax_total, cgst_amount,
 *     sgst_amount, igst_amount, round_off, grand_total, paid_amount), with the
 *     same fallback InvoiceTemplate has always used when a stored total is 0
 *     (the sum of the line figures; half the tax each for CGST and SGST);
 *   - per line, gstDocument.lineFigures: the figures calculateGST stored on
 *     the line when they are there, else the templates' own qty x rate;
 *   - the tax summary, gstDocument.taxSummaryByRate over those lines.
 *
 * What the document is called and what it must show (tax invoice, bill of
 * supply, plain invoice) is gstDocument.documentRules, the one rule table
 * every template reads. gstDocument.js is the invoice-compliance branch's
 * file, unchanged, so the two branches agree.
 */
import {
  documentRules, lineFigures, taxSummaryByRate, taxLabels, stateWithCode, reverseChargeText,
} from './gstDocument';
import { amountToWords } from './gstEngine';
import { formatDate } from './utils';
import { lockedOptsFor, DOC_TYPE_KEYS } from './printSettings';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const present = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(parseFloat(v));

const DEFAULT_TERMS = (state) => [
  'Goods once sold will not be taken back.',
  `All disputes subject to ${state || 'local'} jurisdiction.`,
  'E. & O.E.',
];

export function buildInvoicePrintData({ invoice = {}, business = {}, client = null, opts = {}, texts = {}, defaultTerms = '', customFields = [] } = {}) {
  const inv = invoice || {};
  const biz = business || {};
  const cli = client || { name: inv.client_name || 'Walk-in Customer' };

  const rules = documentRules(biz, { kind: 'invoice' });
  const docKey = DOC_TYPE_KEYS[rules.regType] || 'TAX_INVOICE';
  const show = { ...opts, ...lockedOptsFor(docKey) };
  const showTax = rules.showTax;

  const taxMode = String(biz.tax_mode || inv.tax_mode || 'EXCLUSIVE').toUpperCase();
  const isInterstate = !!(inv.is_interstate || inv.isInterstate);
  const labels = taxLabels(biz.state_code || biz.state || '');

  const lines = (Array.isArray(inv.items) ? inv.items : []).map((item) => {
    const f = lineFigures(item, { taxMode, interstate: isInterstate });
    const discPct = num(item.discountPercent ?? item.discount_percent);
    return {
      name: item.name || 'Unnamed Product',
      note: item.description || item.desc || item.note || (item.sku && item.sku !== item.hsn_code ? `SKU ${item.sku}` : ''),
      hsn: item.hsn_code || item.hsn || '',
      unit: item.unit || 'PCS',
      qty: f.qty,
      rate: f.rate,
      taxRate: f.taxRate,
      // The discount as stored on the line (calculateGST keeps the amount);
      // a line that stored only a percentage shows the percentage.
      discount: present(item.discount) ? num(item.discount) : null,
      discountPct: discPct > 0 ? discPct : null,
      taxable: f.taxable,
      cgst: f.cgst, sgst: f.sgst, igst: f.igst, tax: f.tax,
      total: f.total,
    };
  });

  // Totals: stored when non-zero, else derived from the lines, exactly as
  // InvoiceTemplate does.
  const derivedTaxable = lines.reduce((s, l) => s + l.taxable, 0);
  const derivedTax = lines.reduce((s, l) => s + l.tax, 0);
  const storedTaxable = num(inv.taxable_amount ?? inv.taxable);
  const storedTax = num(inv.tax_total ?? inv.totalTax);
  const storedCgst = num(inv.cgst_amount ?? inv.cgst);
  const storedSgst = num(inv.sgst_amount ?? inv.sgst);
  const storedIgst = num(inv.igst_amount ?? inv.igst);
  const grandTotal = num(inv.grand_total ?? inv.grandTotal);
  const taxable = storedTaxable > 0 ? storedTaxable : derivedTaxable;
  const totalTax = storedTax > 0 ? storedTax : derivedTax;
  const cgst = storedCgst > 0 ? storedCgst : (isInterstate ? 0 : derivedTax / 2);
  const sgst = storedSgst > 0 ? storedSgst : (isInterstate ? 0 : derivedTax / 2);
  const igst = storedIgst > 0 ? storedIgst : (isInterstate ? derivedTax : 0);
  const payable = grandTotal > 0 ? grandTotal : taxable + totalTax;
  const roundOff = num(inv.round_off ?? inv.roundOff);
  const paid = num(inv.paid_amount);
  const balance = Math.max(0, payable - paid);
  const previous = num(cli.outstanding_balance ?? cli.outstanding);

  // The UPI QR, on the same terms as the classic layout: switched on, a UPI
  // ID set, and something still to pay. It asks for the balance, not the total.
  const billSettings = biz.bill_settings || {};
  const qrOn = (billSettings.show_upi_invoice ?? true) && show.upiQr;
  const due = Math.max(0, +(payable - paid).toFixed(2));
  const upiUri = qrOn && biz.upi_id && inv.payment_status !== 'PAID' && due > 0
    ? `upi://pay?pa=${biz.upi_id}&pn=${encodeURIComponent(biz.name || '')}&am=${due.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Invoice ' + (inv.invoice_number || ''))}`
    : null;

  const buyerGstin = inv.client_gstin || cli.gst_no || cli.gstin || '';
  const buyerAddress = inv.client_address || (cli.address && cli.address !== '---' ? cli.address : '') || '';

  // Terms: what the shop wrote on the Customise page, else its business
  // terms, else the classic layout's three lines.
  const customTerms = texts.invTerms && texts.invTerms !== defaultTerms ? texts.invTerms : '';
  const termsSource = customTerms || biz.invoice_terms || '';
  const terms = termsSource
    ? String(termsSource).split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 4)
    : DEFAULT_TERMS(biz.state);

  return {
    rules, docKey, showTax, labels, show,
    title: rules.title,
    declaration: rules.declaration,
    business: {
      name: biz.name || 'Business Name',
      address: biz.address || '',
      phone: biz.phone || '',
      email: biz.email || '',
      gstin: rules.showSellerGstin ? (biz.gst_no || '') : '',
      state: stateWithCode(biz.state || '', biz.state_code || ''),
      logo: biz.logo_url || null,
      signature: biz.signature_url || null,
      upi: biz.upi_id || '',
      bank: { name: biz.bank_name || '', account: biz.account_no || '', ifsc: biz.ifsc_code || biz.ifsc || '' },
    },
    buyer: {
      name: cli.name || inv.client_name || 'Walk-in Customer',
      address: buyerAddress,
      gstin: buyerGstin,
      state: stateWithCode(cli.state || '', cli.state_code || ''),
      phone: cli.contact || cli.phone || '',
      shipAddress: inv.delivery_address || buyerAddress,
    },
    meta: {
      number: inv.invoice_number || 'Pending',
      date: formatDate(inv.invoice_date || inv.date),
      due: inv.due_date ? formatDate(inv.due_date) : null,
      placeOfSupply: stateWithCode(inv.place_of_supply || cli.state || ''),
      reverseCharge: reverseChargeText(inv),
      eway: inv.eway_no || inv.eway_bill_no || null,
      vehicle: inv.vehicle_no || null,
      isInterstate,
    },
    lines,
    rateSummary: taxSummaryByRate(lines),
    totals: { taxable, cgst, sgst, igst, totalTax, roundOff, payable, paid, balance, previous },
    amountWords: amountToWords(payable),
    upiUri, due,
    terms,
    footer: texts.invFooter || '',
    // The shop's own label: value lines (print_settings.customFields).
    customFields: (Array.isArray(customFields) ? customFields : []).filter((f) => f && f.label && f.value),
    signLabel: texts.signLabel || 'Authorised signatory',
  };
}

/** Rupee figures as the models print them: 12,345.60 (no symbol). */
export const amt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** With the rupee sign, for totals: ₹12,345.60. */
export const rupees = (n) => `₹${amt(n)}`;
