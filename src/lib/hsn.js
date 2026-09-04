// HSN / SAC codes.
//
// A valid code is 4, 6 or 8 digits. Nothing else is accepted by the GST portal,
// and an invalid one flows straight into the GSTR-1 HSN summary (Table 12) and
// onto printed invoices and vouchers.
//
// The Add Item form already strips non-digits at the input. The two bulk paths
// did not, so a spreadsheet with SKU codes in the HSN column wrote them
// verbatim: FUTURE DISPO has 19 products carrying things like TES, LD0, HM01
// and PKT1316 as their HSN.
//
// 2 digits is a chapter and 3 is not a thing; both are rejected rather than
// padded, because guessing a tax code is worse than leaving it blank.

const VALID = /^(\d{4}|\d{6}|\d{8})$/;

/** True when `v` is exactly 4, 6 or 8 digits. */
export function isValidHsn(v) {
  return VALID.test(String(v ?? '').trim());
}

/**
 * What an entered HSN should become.
 *
 * Returns { code, status }:
 *   empty   → code null. Nothing was entered; that is not an error.
 *   ok      → code is the cleaned, valid digits.
 *   invalid → code null, and `raw` is kept so the caller can report what it
 *             dropped. Never silently coerce: a wrong tax code that looks
 *             deliberate is worse than an absent one.
 */
export function normalizeHsn(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { code: null, status: 'empty', raw: s };
  if (VALID.test(s)) return { code: s, status: 'ok', raw: s };

  // A code written as "4823.00" is a formatting artefact of the spreadsheet,
  // not a different code — recover it rather than dropping it.
  //
  // Only when the text carries no letters. Stripping non-digits from anything
  // would turn PKT1316 into 1316 and KG1620 into 1620 — both legal-looking HSNs
  // for entirely unrelated goods. A SKU quietly promoted to a tax code is worse
  // than a blank one, because nothing downstream would ever flag it.
  if (/^[\d\s.\-/]+$/.test(s)) {
    const digits = s.replace(/\D/g, '');
    if (VALID.test(digits)) return { code: digits, status: 'ok', raw: s };
  }

  return { code: null, status: 'invalid', raw: s };
}
