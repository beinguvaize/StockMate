/**
 * Reading somebody else's spreadsheet.
 * ==========================================================================
 *
 * A shop with 2,000 SKUs in another product cannot move to this one by
 * retyping them, so an importer is not a convenience feature — it is the
 * thing that makes leaving a competitor possible. That also means the sheet
 * being imported was NOT written for us: it is a Vyapar export, a Tally dump,
 * or whatever the previous accountant kept, with their column names, their
 * date formats and their idea of what "tax" means.
 *
 * So the rules here are deliberately forgiving about SHAPE and completely
 * unforgiving about VALUES:
 *
 *   · headers match case-insensitively, ignoring spaces, underscores and
 *     punctuation, against a list of aliases that includes the competitors'
 *     own column names;
 *   · a row with a bad number is REJECTED with a reason naming the column,
 *     never silently coerced to 0 — an item that imports at price 0 is a
 *     product sold for nothing until somebody notices.
 *
 * Pure functions on purpose. The whole value of an importer is that you can
 * see what it will do before it does it, and that preview is only trustworthy
 * if the same code produces it that performs the write.
 */

/** Strip everything that varies between people writing the same header. */
const headerKey = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Column aliases. First entry is this app's own field name.
 *
 * The competitors' headers are in here on purpose: a Vyapar "Item Name" or
 * "Sale Price" sheet should import without the shopkeeper editing a single
 * cell. That is the difference between an importer and a format.
 */
export const ITEM_COLUMNS = {
  name:            ['name', 'itemname', 'productname', 'item', 'product', 'description'],
  sku:             ['sku', 'itemcode', 'code', 'productcode', 'itemid'],
  barcode:         ['barcode', 'ean', 'upc', 'barcodeno'],
  category:        ['category', 'itemcategory', 'group', 'itemgroup'],
  hsn_code:        ['hsncode', 'hsn', 'hsnsac', 'sac'],
  unit:            ['unit', 'baseunit', 'uom', 'measuringunit'],
  sellingPrice:    ['sellingprice', 'saleprice', 'price', 'mrp', 'rate', 'sellprice'],
  costPrice:       ['costprice', 'purchaseprice', 'buyprice', 'cost'],
  taxRate:         ['taxrate', 'gst', 'gstrate', 'tax', 'gstpercent'],
  cess_rate:       ['cessrate', 'cess'],
  stock:           ['stock', 'openingstock', 'openingstockquantity', 'quantity', 'qty', 'currentstock'],
  lowStockThreshold: ['lowstockthreshold', 'minimumstock', 'minimumstockquantity', 'minstock', 'reorderlevel', 'reorderpoint'],
  wholesale_price: ['wholesaleprice', 'wholesalerate'],
};

export const SUPPLIER_COLUMNS = {
  name:           ['name', 'partyname', 'suppliername', 'vendorname', 'supplier', 'vendor'],
  contact_person: ['contactperson', 'contact', 'contactname', 'person'],
  phone:          ['phone', 'phoneno', 'phonenumber', 'mobile', 'mobileno', 'contactno'],
  email:          ['email', 'emailid', 'mail'],
  address:        ['address', 'billingaddress', 'addressline'],
  notes:          ['notes', 'note', 'remarks', 'description'],
  gstin:          ['gstno', 'gstin', 'gstnumber', 'gstinuin'],
};

export const PARTY_COLUMNS = {
  name:             ['name', 'partyname', 'customername', 'clientname', 'party', 'customer'],
  phone:            ['phone', 'phoneno', 'phonenumber', 'mobile', 'mobileno', 'contact', 'contactno'],
  email:            ['email', 'emailid', 'mail'],
  gst_no:           ['gstno', 'gstin', 'gstnumber', 'gstinuin'],
  address:          ['address', 'billingaddress', 'addressline', 'partyaddress'],
  state:            ['state', 'placeofsupply', 'statename'],
  pin_code:         ['pincode', 'pin', 'postalcode', 'zip'],
  outstanding_balance: ['outstandingbalance', 'openingbalance', 'balance', 'amount', 'closingbalance'],
};

/**
 * Which incoming header feeds which field.
 *
 * Returns the mapping AND the headers it could not place, because "your file
 * imported but three columns were ignored" is something the shopkeeper must
 * be told BEFORE the write, not discovered later from missing data.
 */
export function mapHeaders(headers = [], columns = ITEM_COLUMNS) {
  const mapping = {};      // field -> source header
  const used = new Set();
  for (const [field, aliases] of Object.entries(columns)) {
    const hit = headers.find((h) => aliases.includes(headerKey(h)) && !used.has(h));
    if (hit) { mapping[field] = hit; used.add(hit); }
  }
  const ignored = headers.filter((h) => String(h ?? '').trim() && !used.has(h));
  return { mapping, ignored };
}

/**
 * A number from a spreadsheet cell.
 *
 * Sheets carry "1,250.00", "₹1250", "12%", " 5 " and empty strings, and a
 * naive Number() turns most of those into NaN. Returns undefined for "not
 * given" and null for "given but not a number", because those are different
 * outcomes: the first keeps the default, the second rejects the row.
 */
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s) return undefined;
  const cleaned = s.replace(/[₹$,\s]/g, '').replace(/%$/, '');
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 'Y' / 'yes' / 'true' / '1' → true. Anything else present → false. */
export function parseBool(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return undefined;
  return ['y', 'yes', 'true', '1'].includes(s);
}

const REQUIRE_POSITIVE = new Set(['sellingPrice', 'costPrice', 'wholesale_price']);
const REQUIRE_NON_NEGATIVE = new Set(['taxRate', 'cess_rate', 'lowStockThreshold']);

/**
 * Resolve a sheet's headers to this app's field keys.
 *
 * The existing importer matched a header against its own label, lowercased:
 * "Selling Price" and nothing else. A sheet exported from another billing app
 * says "Sale Price", so every one of them failed at the header check and the
 * shopkeeper had to rename columns by hand before importing — which is where
 * most migrations are abandoned.
 *
 * @param headers  the sheet's own first row
 * @param columns  ITEM_COLUMNS / PARTY_COLUMNS / SUPPLIER_COLUMNS
 * @param labels   the importer's own column definitions, so its labels keep
 *                 working alongside the aliases
 * @returns { headerToKey, ignored, missingRequired }
 */
export function resolveHeaders(headers = [], columns = ITEM_COLUMNS, labels = []) {
  const aliasToField = new Map();
  for (const [field, aliases] of Object.entries(columns)) {
    for (const a of aliases) aliasToField.set(a, field);
  }
  // The importer's own labels win over the alias table, so a sheet downloaded
  // from this app keeps behaving exactly as it did.
  for (const c of labels) aliasToField.set(headerKey(c.label), c.key);

  const headerToKey = {};
  const taken = new Set();
  const ignored = [];
  for (const h of headers) {
    const field = aliasToField.get(headerKey(h));
    if (field && !taken.has(field)) { headerToKey[h] = field; taken.add(field); }
    else if (String(h ?? '').trim()) ignored.push(h);
  }

  const missingRequired = labels.filter((c) => c.required && !taken.has(c.key)).map((c) => c.label);
  return { headerToKey, ignored, missingRequired };
}
