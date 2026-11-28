/**
 * Small pure helpers for the Settings pages (web redesign, approved
 * settings-01 to 19). Nothing here writes; the panels keep today's save paths.
 */

/** Show only the last `keep` characters: "••••••234F". Empty stays empty. */
export function maskTail(value, keep = 4, { group = false } = {}) {
  const s = String(value ?? '').replace(/\s+/g, '');
  if (!s) return '';
  if (s.length <= keep) return '•'.repeat(s.length);
  const tail = s.slice(-keep);
  if (group) return `•••• •••• ${tail}`;
  return `${'•'.repeat(Math.min(6, s.length - keep))}${tail}`;
}

/** JSON with sorted keys, so a jsonb round trip (which reorders keys) still
 *  compares equal. undefined becomes null, as Postgres would store it. */
export function stableStringify(v) {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Does the row read back from the server hold every field that was sent? */
export function fieldsMatch(sent, row) {
  if (!row || !sent) return false;
  return Object.keys(sent).every((k) => stableStringify(sent[k]) === stableStringify(row[k]));
}

/** Products per category name, case-insensitive (the managed list and the
 *  product's own text can differ in case). */
export function countByCategory(products = []) {
  const out = new Map();
  for (const p of products) {
    const k = String(p?.category || '').trim().toLowerCase();
    if (!k) continue;
    out.set(k, (out.get(k) || 0) + 1);
  }
  return out;
}

/** Expenses logged under a category name (exact, as the expense stores it). */
export function expensesInCategory(expenses = [], name) {
  return expenses.filter((e) => !e?.deleted_at && e?.category === name).length;
}

/** The WhatsApp reminder link, exactly as the reminders panel has built it. */
export function reminderLink(client, shopName) {
  const msg = encodeURIComponent(
    `Dear ${client.name},\nThis is a friendly reminder from ${shopName || 'us'} — ` +
    `your outstanding balance is ₹${Number(client.outstanding_balance).toFixed(2)}. ` +
    `Kindly arrange the payment at your convenience. Thank you!`,
  );
  const phone = String(client.phone || '').replace(/\D/g, '');
  const e164 = phone.length === 10 ? `91${phone}` : phone;
  return `https://wa.me/${e164}?text=${msg}`;
}

/** Whole rupees with Indian grouping: ₹47,465. */
export const rupees0 = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** The business form as today's Settings page seeds it from the profile. */
export function businessFormFrom(profile = {}) {
  const p = profile || {};
  return {
    name: p.name || '',
    country: p.country || '',
    currency: p.currency || 'USD',
    currencySymbol: p.currencySymbol || '$',
    lowStockThreshold: p.lowStockThreshold || 20,
    pan_no: p.pan_no || '',
    gst_no: p.gst_no || '',
    tax_mode: p.tax_mode || 'EXCLUSIVE',
    auto_irn_enabled: p.auto_irn_enabled ?? false,
    block_negative_stock: p.block_negative_stock ?? false,
    bank_name: p.bank_name || '',
    account_no: p.account_no || '',
    ifsc_code: p.ifsc_code || '',
    upi_id: p.upi_id || '',
    email: p.email || '',
    website: p.website || '',
    phone: p.phone || '',
    address: p.address || '',
  };
}

/** Picking a country sets its currency, as today. */
export function withCountry(form, country) {
  let { currency, currencySymbol } = form;
  if (country === 'India') { currency = 'INR'; currencySymbol = '₹'; }
  else if (country === 'United Arab Emirates') { currency = 'AED'; currencySymbol = 'AED'; }
  else if (country === 'United States') { currency = 'USD'; currencySymbol = '$'; }
  else if (country === 'United Kingdom') { currency = 'GBP'; currencySymbol = '£'; }
  return { ...form, country, currency, currencySymbol };
}

/** Days left on a trial, never negative; null without an end date. */
export function trialDaysLeft(trialEnd, now = Date.now()) {
  if (!trialEnd) return null;
  const end = new Date(trialEnd).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - now) / 86400000));
}
