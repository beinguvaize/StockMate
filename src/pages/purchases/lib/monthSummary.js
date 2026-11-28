/**
 * The Purchases header figures: what was bought this month and the input tax
 * credit on it.
 * ==========================================================================
 *
 * Moved here from the page unchanged, with one exception the owner allowed
 * (display only): "this month" is the SHOP's month, from `today` in the
 * shop's time zone (todayISOInAppTZ). It used to be the UTC month, so for the
 * first five and a half hours of the 1st in India the header still showed the
 * month before.
 *
 * ITC uses each product's own rate, so a 0-rated item contributes nothing.
 * A blank supplier GSTIN means "not recorded", not "unregistered", so that
 * credit is counted separately as "pending" rather than in either total.
 */

/**
 * @param {object} args
 * @param {Array} args.purchases  purchase rows (lines)
 * @param {Array} args.suppliers
 * @param {Array} args.products
 * @param {(row) => number} args.dueOf  what a row still owes (src/lib/bills.js)
 * @param {string} args.today  'YYYY-MM-DD' in the shop's time zone
 */
export function monthSummary({ purchases = [], suppliers = [], products = [], dueOf, today }) {
  const ym = String(today || '').slice(0, 7);

  const gstinOf = new Map((suppliers || []).map((s) => [s.id, String(s.gstin || '').trim()]));
  const rateOf = new Map((products || []).map((p) => [p.id, Number(p.taxRate)]));

  let month = 0, itc = 0, payable = 0, itcUnverified = 0, missingGstinCount = 0;
  const missingGstinSuppliers = new Set();

  (purchases || []).forEach((p) => {
    const amt = Number(p.total_amount) || 0;
    payable += dueOf ? dueOf(p) : 0;
    if (String(p.date || '').slice(0, 7) !== ym) return;

    month += amt;

    const rate = Number(rateOf.get(p.linked_product_id));
    if (!Number.isFinite(rate) || rate <= 0) return;

    // total_amount is GST-inclusive.
    const credit = amt - amt / (1 + rate / 100);

    if (gstinOf.get(p.supplier_id)) {
      itc += credit;
    } else {
      itcUnverified += credit;
      missingGstinCount += 1;
      if (p.supplier_id) missingGstinSuppliers.add(p.supplier_id);
    }
  });

  return {
    month, count: (purchases || []).length, payable, itc,
    itcUnverified, missingGstinCount,
    missingGstinSuppliers: missingGstinSuppliers.size,
    monthStart: `${ym}-01`,
  };
}
