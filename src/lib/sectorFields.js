/**
 * Sector-specific product fields, as data rather than as columns.
 *
 * WHY THIS EXISTS. `products` already carries 43 columns, five of which belong
 * to one vertical each and are null for everybody else — `food_type`,
 * `station`, `modifier_groups` and `is_available` are restaurant, `duration_min`
 * is services. That pattern does not survive contact with more sectors:
 * jewellery alone wants purity, gross and net weight, making charge and
 * wastage; automotive wants a part number, an OEM cross-reference and vehicle
 * fitment. Carrying on would take the table past fifty columns, almost all of
 * them empty, and docs/PLATFORM.md:219 already says not to: "vertical data in
 * own tables + jsonb, not wide columns".
 *
 * So a new sector field is an entry here and a key in `products.attributes`.
 * No migration, no column, no readers to update.
 *
 * THE EXISTING FLAT COLUMNS STAY. They work, they are indexed, and rewriting
 * them buys nothing but risk. That leaves the catalog split across two
 * mechanisms, which is worth saying out loud here rather than discovering:
 * anything that predates this file is a column, anything after it is an
 * attribute.
 *
 * Rules live in a pure module for the same reason src/lib/itemForm.js does —
 * that file exists because form rules which can only be checked by opening a
 * modal are how the services vertical shipped an item that could not be saved.
 */

/**
 * Field packs, keyed by the pack name a tenant switches on.
 *
 * `type` drives both the input and the coercion:
 *   text   — trimmed, empty becomes absent
 *   number — parsed, non-numeric becomes absent
 *   select — must be one of `options`, anything else is dropped
 *
 * Keep keys snake_case and stable: they are persisted, so renaming one orphans
 * every row that already has it.
 */
export const FIELD_PACKS = {
  automotive: {
    label: 'Automotive',
    help: 'Parts catalog fields — the number the counter actually searches by.',
    fields: [
      { key: 'part_no',  label: 'Part number',      type: 'text',   hint: 'The manufacturer’s own number.' },
      { key: 'oem_no',   label: 'OEM / cross-ref',  type: 'text',   hint: 'Equivalent number from the vehicle maker.' },
      { key: 'fitment',  label: 'Fits',             type: 'text',   hint: 'e.g. Swift 2011-2017, Alto K10.' },
      { key: 'warranty_months', label: 'Warranty',  type: 'number', hint: 'Months. Leave blank if none.', min: 0 },
    ],
  },
};

/** Every pack key, for a settings screen or a test. */
export const PACK_KEYS = Object.keys(FIELD_PACKS);

/** The fields a given set of enabled packs contributes, in declared order. */
export function fieldsFor(packKeys = []) {
  const seen = new Set();
  const out = [];
  for (const pack of packKeys) {
    for (const f of FIELD_PACKS[pack]?.fields || []) {
      // A key claimed by two packs is a registry bug, not a runtime one — but
      // silently rendering the input twice would be worse than taking the first.
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      out.push({ ...f, pack });
    }
  }
  return out;
}

/**
 * Coerce and prune a raw form object down to what is safe to persist.
 *
 * Absent beats empty. A blank input stores NOTHING rather than '' or 0:
 * `attributes` is queried with `?` and `->>`, and a key that exists with an
 * empty value answers "yes, present" to the first and "" to the second, which
 * is how a blank field comes to look like a filled one.
 *
 * Unknown keys are dropped, so a stale client cannot park data under a field
 * this build no longer has, where nothing would ever read or clear it.
 */
export function cleanAttributes(raw = {}, packKeys = []) {
  const defs = fieldsFor(packKeys);
  const out = {};

  for (const def of defs) {
    const v = raw[def.key];
    if (v == null) continue;

    if (def.type === 'number') {
      const n = typeof v === 'number' ? v : parseFloat(String(v).trim());
      if (!Number.isFinite(n)) continue;
      if (def.min != null && n < def.min) continue;
      out[def.key] = n;
      continue;
    }

    if (def.type === 'select') {
      const s = String(v).trim();
      if (!s || !(def.options || []).includes(s)) continue;
      out[def.key] = s;
      continue;
    }

    const s = String(v).trim();
    if (!s) continue;
    out[def.key] = s;
  }

  return out;
}

/**
 * Validate. Returns an error string, or null.
 *
 * Deliberately permissive: these describe a catalog, not money, and a shop
 * part-way through typing a part number must still be able to save the item.
 * Only genuinely wrong values are refused.
 */
export function validateAttributes(raw = {}, packKeys = []) {
  for (const def of fieldsFor(packKeys)) {
    const v = raw[def.key];
    if (v == null || String(v).trim() === '') continue;

    if (def.type === 'number') {
      const n = parseFloat(String(v).trim());
      if (!Number.isFinite(n)) return `${def.label} must be a number.`;
      if (def.min != null && n < def.min) return `${def.label} cannot be less than ${def.min}.`;
    }
    if (def.type === 'select' && !(def.options || []).includes(String(v).trim())) {
      return `${def.label} is not one of the allowed values.`;
    }
  }
  return null;
}
