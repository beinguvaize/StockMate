/**
 * Which A4 invoice design a shop prints, and with what options.
 *
 * Settings live where they always have: business_profile.print_settings, a
 * JSON object (invoiceTemplate, invAccent, invOpts, docTexts, ...).
 *
 * The approved redesign adds one key, written ONLY when a shop saves on the
 * Customise invoice page:
 *
 *   print_settings.docTypes = {
 *     TAX_INVOICE:    { invoiceTemplate, invAccent, invOpts, docTexts },
 *     BILL_OF_SUPPLY: { ... },
 *     INVOICE:        { ... },   // a shop with no GST registration
 *   }
 *
 * Reading is backward compatible: a value saved for the document type wins,
 * then the old flat value, then the default. So a shop that never opens the
 * new page prints exactly as it did, and the old flat keys keep working for
 * every reader that knows only them.
 *
 * Who prints what:
 *   - a shop with a saved invoiceTemplate (any of the older designs or a new
 *     model) keeps it exactly;
 *   - a shop that never saved one gets DEFAULT_INVOICE_TEMPLATE, the new
 *     Modern model (the owner's choice). Before the redesign those shops got
 *     the old Classic layout, so their printed invoice changes on release.
 */
import { documentRules } from './gstDocument';
import { DEFAULT_INV_OPTS, DEFAULT_DOC_TEXTS } from '../components/invoice/invoiceLayouts';

/** The four approved models (invoices-18 to 21). */
export const INVOICE_MODELS = [
  { id: 'model-classic', name: 'Classic GST',    blurb: 'Bordered grid; every GST field in its own box' },
  { id: 'model-modern',  name: 'Modern minimal', blurb: 'White space, one big balance due figure' },
  { id: 'model-bold',    name: 'Bold header',    blurb: 'Brand colour band with the logo' },
  { id: 'model-compact', name: 'Compact',        blurb: 'Small type; fits about 30 items on a page' },
];
export const INVOICE_MODEL_IDS = INVOICE_MODELS.map((m) => m.id);

/** Owner's choice for shops that never saved a design. */
export const DEFAULT_INVOICE_TEMPLATE = 'model-modern';

/** The designs that existed before the redesign; still printed for shops that chose them. */
export const LEGACY_TEMPLATE_IDS = ['classic', 'modern', 'compact', 'letterhead', 'emerald', 'bold'];

export const isInvoiceModel = (id) => INVOICE_MODEL_IDS.includes(id);

/** Accent swatches offered for the models (dark ones read in black and white). */
export const MODEL_ACCENTS = ['#111418', '#1e3a5f', '#166534', '#0e7490', '#7e22ce', '#b91c1c', '#b45309'];
export const DEFAULT_MODEL_ACCENT = '#111418';

/** Options the models read, beyond the ones every layout already had. */
export const MODEL_OPT_DEFAULTS = {
  ...DEFAULT_INV_OPTS,
  discountCol: true,     // discount column on the item table
  unitCol: true,         // unit column
  taxSummary: 'below',   // 'below' the items, 'beside' the totals, or 'off'
  thanks: true,          // the footer line (docTexts.invFooter)
};

/** Words the models print that a shop may change. */
export const MODEL_TEXT_DEFAULTS = {
  ...DEFAULT_DOC_TEXTS,
  signLabel: 'Authorised signatory',
};

/** The document-type tab a shop's A4 invoice falls under. */
export const DOC_TYPE_KEYS = { REGULAR: 'TAX_INVOICE', COMPOSITION: 'BILL_OF_SUPPLY', UNREGISTERED: 'INVOICE' };
export const DOC_TYPE_TABS = [
  { key: 'TAX_INVOICE', label: 'Tax invoice', regType: 'REGULAR' },
  { key: 'BILL_OF_SUPPLY', label: 'Bill of supply', regType: 'COMPOSITION' },
  { key: 'INVOICE', label: 'Invoice, no GST', regType: 'UNREGISTERED' },
];
export const docTypeKeyFor = (business = {}) => DOC_TYPE_KEYS[documentRules(business || {}).regType] || 'TAX_INVOICE';

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/**
 * The design, accent, options and texts for one document type.
 * `prefs` is print_settings as stored (any shape, old or new).
 */
export function resolvePrintFor(prefs = {}, docKey = 'TAX_INVOICE') {
  const p = obj(prefs);
  const per = obj(obj(p.docTypes)[docKey]);
  return {
    template: per.invoiceTemplate || p.invoiceTemplate || DEFAULT_INVOICE_TEMPLATE,
    accent: per.invAccent || p.invAccent || null,
    opts: { ...MODEL_OPT_DEFAULTS, ...obj(p.invOpts), ...obj(per.invOpts) },
    texts: { ...MODEL_TEXT_DEFAULTS, ...obj(p.docTexts), ...obj(per.docTexts) },
    savedForType: !!per.invoiceTemplate,
  };
}

/** The design a shop prints: what InvoiceTemplate asks for. */
export const resolveInvoiceTemplate = (prefs = {}, business = {}) =>
  resolvePrintFor(prefs, docTypeKeyFor(business)).template;

/**
 * GST fields a document type may not hide (shown locked on the Customise
 * page, forced on when printing). From the shop's document rules, never
 * from the mockup: a regular shop's tax invoice locks them; a bill of supply
 * and a plain invoice leave HSN and the rest switchable.
 */
export function lockedOptsFor(docKey) {
  if (docKey !== 'TAX_INVOICE') return {};
  return { gstin: true, hsn: true, clientAddr: true };
}

/**
 * print_settings with one document type's choices saved, every other key
 * kept as it was. This is the only writer of the new docTypes shape.
 */
export function withDocTypeSaved(prefs = {}, docKey, values = {}) {
  const p = obj(prefs);
  const docTypes = { ...obj(p.docTypes) };
  docTypes[docKey] = {
    invoiceTemplate: values.invoiceTemplate,
    invAccent: values.invAccent,
    invOpts: { ...obj(values.invOpts) },
    docTexts: { ...obj(values.docTexts) },
  };
  return { ...p, docTypes };
}
