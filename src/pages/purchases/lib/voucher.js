// Purchase voucher — the model behind the printed document.
//
// Kept apart from the page and free of React so the arithmetic can be tested.
// The markup is the easy part; what matters is that the tax split, the totals
// and the amount in words agree with the bill, because this is handed to a
// supplier and filed.
//
// A bill is what groupPurchasesIntoBills() returns: one physical bill, several
// `purchases` rows. The old voucher printed a single row, so a two-product bill
// came out as two half-vouchers that each showed part of the money.

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
  'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy',
  'Eighty', 'Ninety'];

function under100(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return TENS[t] + (o ? ' ' + ONES[o] : '');
}

function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? under100(r) : '');
}

/**
 * Indian-format words for a rupee amount: crore / lakh / thousand, not the
 * western million. Paise are named separately when present.
 */
export function amountInWords(value) {
  // Number(null) and Number('') are both 0, so without this an absent amount
  // would print "Zero Rupees Only" — a definite claim about money on a document
  // handed to a supplier. Absent stays blank; only a real 0 says zero.
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const neg = n < 0;
  const abs = Math.abs(n);

  // Round to paise first, so 6905.499 does not report 49 paise AND 6,905 rupees
  // that disagree with the printed total.
  const totalPaise = Math.round(abs * 100);
  let rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  const parts = [];
  const crore = Math.floor(rupees / 10000000);
  if (crore) { parts.push(under1000(crore) + ' Crore'); rupees %= 10000000; }
  const lakh = Math.floor(rupees / 100000);
  if (lakh) { parts.push(under100(lakh) + ' Lakh'); rupees %= 100000; }
  const thousand = Math.floor(rupees / 1000);
  if (thousand) { parts.push(under100(thousand) + ' Thousand'); rupees %= 1000; }
  if (rupees) parts.push(under1000(rupees));

  const rupeeWords = parts.join(' ').trim();
  let out;
  if (!rupeeWords && !paise) out = 'Zero Rupees Only';
  else if (!paise) out = `${rupeeWords} Rupees Only`;
  else if (!rupeeWords) out = `${under100(paise)} Paise Only`;
  else out = `${rupeeWords} Rupees and ${under100(paise)} Paise Only`;

  return neg ? `Minus ${out}` : out;
}

/**
 * Indian financial year for a date: April to March. 28 Jul 2026 → "2026-27".
 * A voucher series that restarts each FY is what an accountant expects.
 */
export function financialYear(dateStr) {
  const d = new Date(`${String(dateStr || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1; // month 3 = April
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * Voucher number.
 *
 * Deliberately derived from the bill's own reference rather than a running
 * counter. A counter needs a stored sequence, and any back-dated bill would
 * renumber every voucher printed after it — so a supplier could hold two
 * different papers bearing the same number. This is stable forever and traces
 * straight back to the row.
 */
export function voucherNo(bill) {
  const ref = String(bill?.id || bill?.lines?.[0]?.id || '').split('-').pop();
  const fy = financialYear(bill?.date);
  return fy ? `PV/${fy}/${ref}` : `PV/${ref}`;
}

/**
 * Everything the document needs, computed once.
 *
 * `total_amount` on a purchase is GST-inclusive, which is the convention the
 * rest of the app uses (see the ITC back-out on the Purchases summary).
 *
 * The tax split is shown only when the supplier has a GSTIN on file. Without
 * one there is no tax invoice to point at, so printing a CGST/SGST breakdown
 * would state something unsupported on a document that leaves the building.
 * A blank GSTIN means "not recorded", not "unregistered" — the wording says so.
 */
export function buildVoucherModel({ bill, supplier, productById = {} } = {}) {
  const lines = bill?.lines || [];
  const gstin = String(supplier?.gstin || '').trim();
  const registered = gstin.length > 0;

  let total = 0, taxable = 0, tax = 0;

  const items = lines.map((l) => {
    const prod = productById[l.linked_product_id] || {};
    const amount = Number(l.total_amount) || 0;
    const qty = Number(l.quantity) || 0;
    const rate = qty > 0 ? amount / qty : 0;

    const gstRate = Number(prod.taxRate);
    const hasRate = registered && Number.isFinite(gstRate) && gstRate > 0;
    const lineTaxable = hasRate ? amount / (1 + gstRate / 100) : amount;
    const lineTax = hasRate ? amount - lineTaxable : 0;

    total += amount;
    taxable += lineTaxable;
    tax += lineTax;

    return {
      id: l.id,
      ref: String(l.id || '').split('-').pop(),
      name: prod.name || l.notes || 'Item',
      hsn: String(prod.hsn_code || '').trim(),
      unit: prod.unit || 'PCS',
      qty, rate, amount,
      gstRate: hasRate ? gstRate : null,
      taxable: lineTaxable,
      tax: lineTax,
    };
  });

  // Intra-state splits into CGST+SGST; a different state code means IGST.
  // Falls back to intra-state when either side has no GSTIN to compare.
  const homeState = String(supplier?.__homeStateCode || '').trim();
  const supplierState = registered ? gstin.slice(0, 2) : '';
  const interstate = Boolean(homeState && supplierState && homeState !== supplierState);

  const paid = lines.reduce((s, l) => s + (Number(l.paid_amount) || 0), 0);
  const due = Math.max(0, total - paid);

  return {
    voucherNo: voucherNo(bill),
    date: bill?.date || '',
    supplierName: supplier?.name || bill?.supplier_name || '—',
    supplierPhone: supplier?.phone || '',
    supplierAddress: supplier?.address || '',
    gstin, registered, interstate,
    billNo: String(bill?.bill_no || '').trim(),
    paymentType: bill?.payment_type || 'CASH',
    items,
    total, taxable, tax,
    cgst: interstate ? 0 : tax / 2,
    sgst: interstate ? 0 : tax / 2,
    igst: interstate ? tax : 0,
    paid, due,
    settled: due <= 0.005,
    words: amountInWords(total),
    missingHsn: items.filter(i => !i.hsn).length,
  };
}
