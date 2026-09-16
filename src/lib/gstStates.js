/**
 * GST state codes — the single source of truth.
 *
 * The list lived inside Clients.jsx, so the signup form and the client form
 * could not share it. It is the first two digits of every GSTIN and decides
 * CGST+SGST versus IGST, which makes a second, drifting copy a tax bug waiting
 * to happen.
 *
 * Deliberately omits the two dead codes: 25 (Daman & Diu, merged into 26 in
 * 2020) and 28 (Andhra Pradesh before the Telangana split, now 36 and 37).
 * Nobody should be able to pick them. `stateForCode` still resolves them, so
 * rows written years ago still read back with a name.
 */

export const INDIAN_STATES = [
  { name: 'Jammu & Kashmir', code: '01' }, { name: 'Himachal Pradesh', code: '02' },
  { name: 'Punjab', code: '03' }, { name: 'Chandigarh', code: '04' },
  { name: 'Uttarakhand', code: '05' }, { name: 'Haryana', code: '06' },
  { name: 'Delhi', code: '07' }, { name: 'Rajasthan', code: '08' },
  { name: 'Uttar Pradesh', code: '09' }, { name: 'Bihar', code: '10' },
  { name: 'Sikkim', code: '11' }, { name: 'Arunachal Pradesh', code: '12' },
  { name: 'Nagaland', code: '13' }, { name: 'Manipur', code: '14' },
  { name: 'Mizoram', code: '15' }, { name: 'Tripura', code: '16' },
  { name: 'Meghalaya', code: '17' }, { name: 'Assam', code: '18' },
  { name: 'West Bengal', code: '19' }, { name: 'Jharkhand', code: '20' },
  { name: 'Odisha', code: '21' }, { name: 'Chhattisgarh', code: '22' },
  { name: 'Madhya Pradesh', code: '23' }, { name: 'Gujarat', code: '24' },
  { name: 'Dadra & Nagar Haveli and Daman & Diu', code: '26' },
  { name: 'Maharashtra', code: '27' }, { name: 'Karnataka', code: '29' },
  { name: 'Goa', code: '30' }, { name: 'Lakshadweep', code: '31' },
  { name: 'Kerala', code: '32' }, { name: 'Tamil Nadu', code: '33' },
  { name: 'Puducherry', code: '34' }, { name: 'Andaman & Nicobar Islands', code: '35' },
  { name: 'Telangana', code: '36' }, { name: 'Andhra Pradesh', code: '37' },
  { name: 'Ladakh', code: '38' }, { name: 'Other Territory', code: '97' },
];

/** Retired codes. Readable, never selectable. */
const LEGACY_CODES = {
  '25': 'Dadra & Nagar Haveli and Daman & Diu',
  '28': 'Andhra Pradesh',
};

/**
 * '&' and 'and' are the same word to a shopkeeper, and typed data uses both.
 * Matching on the raw string would make "Jammu and Kashmir" a different state
 * from "Jammu & Kashmir" — two states, two tax outcomes, one shop.
 */
export const normaliseStateName = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const BY_NAME = new Map(INDIAN_STATES.map((s) => [normaliseStateName(s.name), s]));

/** State name → two-digit GST code, or '' when unrecognised. */
export const stateCodeFor = (name) => BY_NAME.get(normaliseStateName(name))?.code || '';

/** Two-digit GST code → state name, retired codes included. '' when unknown. */
export const stateForCode = (code) => {
  const c = String(code || '').trim().padStart(2, '0');
  return INDIAN_STATES.find((s) => s.code === c)?.name || LEGACY_CODES[c] || '';
};

/** The state a GSTIN belongs to — its first two digits. '' when unreadable. */
export const stateFromGstin = (gstin) => {
  const g = String(gstin || '').trim();
  return g.length >= 2 ? stateForCode(g.slice(0, 2)) : '';
};
