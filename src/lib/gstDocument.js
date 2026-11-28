/**
 * What a printed sales document must say, decided in ONE place.
 *
 * GST law gives a shop one of three positions, and each prints differently:
 *
 *   REGULAR       a normal GST registration. Issues a "Tax Invoice" with the
 *                 shop's GSTIN and the tax split out per line and in total.
 *   COMPOSITION   registered under the composition scheme (section 10). May
 *                 not collect tax from the buyer, so it issues a "Bill of
 *                 Supply" (rule 49) carrying the declaration printed below,
 *                 and no tax columns or tax amounts.
 *   UNREGISTERED  no GST registration. No GSTIN and no tax on the document:
 *                 an "Invoice" (or a "Cash Bill" over the counter).
 *
 * Every template (classic A4, the hidden alternative layouts, the thermal
 * receipt, the web cash bill) asks this module rather than deciding for
 * itself; the phone fallbacks in mobile_app mirror the same table.
 *
 * Nothing here calculates tax for a sale or an invoice. Tax is calculated and
 * stored at save time (calculateGST / the server); this module only decides
 * how the stored figures are PRESENTED.
 */
import { computeLineTax } from './taxLine';
import { stateCodeFor, stateForCode, normaliseStateName } from './gstStates';

export const REG_TYPES = Object.freeze({
  REGULAR: 'REGULAR',
  COMPOSITION: 'COMPOSITION',
  UNREGISTERED: 'UNREGISTERED',
});

/** The plain sentence Settings shows beside each choice. */
export const REG_TYPE_OPTIONS = [
  { value: 'REGULAR', label: 'Regular GST', desc: 'You charge GST and file regular returns. Bills print as Tax Invoice.' },
  { value: 'COMPOSITION', label: 'Composition scheme', desc: 'You pay tax at a fixed rate and cannot charge GST. Bills print as Bill of Supply.' },
  { value: 'UNREGISTERED', label: 'Not registered', desc: 'You have no GSTIN. Bills print as Invoice or Cash Bill, with no tax.' },
];

/** The rule 49 declaration a composition dealer prints at the top. */
export const COMPOSITION_DECLARATION =
  'Composition taxable person, not eligible to collect tax on supplies';

/**
 * The shop's registration type.
 *
 * An explicit choice wins. When none has been saved (every existing shop on
 * the day this ships) it is derived from what the app already knew, so
 * nothing on a printed bill changes until the shop chooses:
 *   tax mode NONE, or no GSTIN  -> UNREGISTERED
 *   otherwise                   -> REGULAR
 */
export function resolveRegistrationType(business = {}) {
  const b = business || {};
  const explicit = String(b.gst_registration_type || '').trim().toUpperCase();
  if (REG_TYPES[explicit]) return explicit;
  const mode = String(b.tax_mode || '').trim().toUpperCase();
  const gstin = String(b.gst_no || b.gstin || '').trim();
  if (mode === 'NONE' || !gstin) return REG_TYPES.UNREGISTERED;
  return REG_TYPES.REGULAR;
}

/**
 * Everything a template needs to know about the document it is printing.
 *
 * @param business  business_profile row
 * @param opts.kind 'invoice' (A4) | 'counter' (receipt / cash bill)
 * @returns {{
 *   regType: string, title: string, declaration: string|null,
 *   showTax: boolean, showSellerGstin: boolean, isTaxInvoice: boolean,
 *   lockGstColumns: boolean
 * }}
 *   showTax          tax columns, tax rate, CGST/SGST/IGST lines and the HSN
 *                    tax summary print only when true.
 *   showSellerGstin  the shop's GSTIN line prints only when true.
 *   lockGstColumns   GSTIN and HSN may not be switched off in print settings.
 */
export function documentRules(business = {}, { kind = 'invoice' } = {}) {
  const regType = resolveRegistrationType(business);
  if (regType === REG_TYPES.COMPOSITION) {
    return {
      regType, title: 'Bill of Supply', declaration: COMPOSITION_DECLARATION,
      showTax: false, showSellerGstin: true, isTaxInvoice: false, lockGstColumns: false,
    };
  }
  if (regType === REG_TYPES.UNREGISTERED) {
    return {
      regType, title: kind === 'counter' ? 'Cash Bill' : 'Invoice', declaration: null,
      showTax: false, showSellerGstin: false, isTaxInvoice: false, lockGstColumns: false,
    };
  }
  return {
    regType, title: 'Tax Invoice', declaration: null,
    showTax: true, showSellerGstin: true, isTaxInvoice: true, lockGstColumns: true,
  };
}

// ── States ────────────────────────────────────────────────────────────────

/**
 * Union territories WITHOUT a legislature. Intra-state supply there is taxed
 * CGST + UTGST, not CGST + SGST (UTGST Act 2017, s.2(8)). Delhi, Puducherry
 * and Jammu & Kashmir have legislatures and use SGST.
 * 25 is the retired Daman & Diu code, still readable on old rows.
 */
const UTGST_CODES = new Set(['04', '25', '26', '31', '35', '38']);

/** 'CGST' / 'SGST' or 'UTGST' labels for a seller in this state. */
export function taxLabels(sellerState = '') {
  const code = /^\d{2}$/.test(String(sellerState).trim())
    ? String(sellerState).trim()
    : stateCodeFor(sellerState);
  return { cgst: 'CGST', sgst: UTGST_CODES.has(code) ? 'UTGST' : 'SGST', igst: 'IGST' };
}

/** "Maharashtra (27)" from a state name or code; '' when nothing is known. */
export function stateWithCode(nameOrCode = '', explicitCode = '') {
  const raw = String(nameOrCode || '').trim();
  if (!raw && !explicitCode) return '';
  if (/^\d{1,2}$/.test(raw)) {
    const c = raw.padStart(2, '0');
    const n = stateForCode(c);
    return n ? `${n} (${c})` : c;
  }
  const code = String(explicitCode || '').trim() || stateCodeFor(raw);
  return code ? `${raw} (${code})` : raw;
}

const GSTIN_STATE = /^(\d{2})/;

/**
 * Inter-state or not, for a NEW document made on the create page.
 *
 * The buyer's GSTIN decides when present: its first two digits are the state
 * it is registered in. Otherwise the buyer's state name, compared through
 * normaliseStateName so "Jammu and Kashmir" and "Jammu & Kashmir" agree.
 * Unknown on either side stays intra-state, which is today's behaviour.
 */
export function decideInterstate({ sellerState = '', sellerGstin = '', buyerGstin = '', buyerState = '' } = {}) {
  const sellerCode = (String(sellerGstin).trim().match(GSTIN_STATE) || [])[1] || stateCodeFor(sellerState);
  const buyerFromGstin = (String(buyerGstin).trim().match(GSTIN_STATE) || [])[1] || '';
  if (buyerFromGstin && sellerCode) return buyerFromGstin !== sellerCode;
  const s = normaliseStateName(sellerState);
  const b = normaliseStateName(buyerState);
  if (!s || !b) return false;
  if (sellerCode && stateCodeFor(buyerState)) return sellerCode !== stateCodeFor(buyerState);
  return s !== b;
}

// ── Line figures ──────────────────────────────────────────────────────────

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const has = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(parseFloat(v));

/**
 * The figures one printed line shows.
 *
 * When the line carries what calculateGST stored (taxable, cgst, sgst, igst,
 * total) those are printed as they are, so discounts and tax-inclusive prices
 * agree with the stored invoice totals. A line without them (old invoices,
 * counter sales, whose lines store only price and rate) falls back to the
 * computation the templates have always done.
 */
export function lineFigures(item = {}, { taxMode = 'EXCLUSIVE', interstate = false } = {}) {
  const qty = num(item.qty ?? item.quantity);
  const rate = num(item.rate ?? item.price ?? item.sellingPrice);
  const mode = String(taxMode || 'EXCLUSIVE').toUpperCase();
  const noTax = mode === 'NONE';
  const taxRate = noTax ? 0 : num(item.taxRate ?? item.tax_rate);

  if (has(item.taxable) && (has(item.cgst) || has(item.sgst) || has(item.igst))) {
    const cgst = num(item.cgst), sgst = num(item.sgst), igst = num(item.igst);
    const tax = cgst + sgst + igst;
    const taxable = num(item.taxable);
    return {
      qty, rate, taxRate, taxable, cgst, sgst, igst, tax,
      total: has(item.total) ? num(item.total) : taxable + tax,
      stored: true,
    };
  }

  // Exactly the templates' old arithmetic: qty x rate, no line discount (a
  // line that had one was saved through calculateGST and so carries stored
  // figures, handled above).
  const L = computeLineTax({
    qty, rate, taxRate, interstate, inclusive: mode === 'INCLUSIVE',
  });
  const tax = noTax ? 0 : L.tax;
  return {
    qty, rate, taxRate,
    taxable: L.taxable,
    cgst: noTax ? 0 : L.cgst,
    sgst: noTax ? 0 : L.sgst,
    igst: noTax ? 0 : L.igst,
    tax,
    total: L.taxable + tax,
    stored: false,
  };
}

/** Tax summary grouped by rate: [{ rate, taxable, cgst, sgst, igst }], rate ascending. */
export function taxSummaryByRate(lines = []) {
  const m = new Map();
  for (const l of lines) {
    const r = num(l.taxRate);
    if (!m.has(r)) m.set(r, { rate: r, taxable: 0, cgst: 0, sgst: 0, igst: 0 });
    const g = m.get(r);
    g.taxable += num(l.taxable);
    g.cgst += num(l.cgst);
    g.sgst += num(l.sgst);
    g.igst += num(l.igst);
  }
  return [...m.values()].sort((a, b) => a.rate - b.rate);
}

/**
 * HSN summary: one row per HSN and rate. A line with no rate is 0%, never the
 * 18% the old summary assumed.
 */
export function hsnSummary(lines = []) {
  const m = new Map();
  for (const l of lines) {
    const hsn = String(l.hsn_code || l.hsn || '').trim() || '—';
    const r = num(l.taxRate);
    const k = `${hsn}|${r}`;
    if (!m.has(k)) m.set(k, { hsn, rate: r, taxable: 0, cgst: 0, sgst: 0, igst: 0 });
    const g = m.get(k);
    g.taxable += num(l.taxable);
    g.cgst += num(l.cgst);
    g.sgst += num(l.sgst);
    g.igst += num(l.igst);
  }
  return [...m.values()];
}

/** "Reverse charge" line: Yes only when the data says so. */
export function reverseChargeText(invoice = {}) {
  const v = invoice?.reverse_charge ?? invoice?.reverseCharge;
  return v === true || String(v).toUpperCase() === 'Y' || String(v).toUpperCase() === 'YES' ? 'Yes' : 'No';
}
