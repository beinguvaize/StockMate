import { describe, it, expect } from 'vitest';
import {
  BUSINESS_TYPES,
  VERTICAL_META,
  DEFAULT_MODULES,
  MODULE_META,
  MODULE_KEYS,
  normalizeType,
  resolveModules,
  isModuleEnabled,
  overridesFrom,
  term,
} from './verticals';

/**
 * The vertical layer had no tests, and it is the thing every future sector
 * pack extends. These pin the behaviours that are load-bearing and quiet —
 * the ones a plausible-looking edit would break without failing anything.
 */

describe('normalizeType', () => {
  it('accepts the known types', () => {
    for (const t of BUSINESS_TYPES) expect(normalizeType(t)).toBe(t);
  });

  it('uppercases whatever the database hands back', () => {
    expect(normalizeType('retail')).toBe('RETAIL');
    expect(normalizeType('Restaurant')).toBe('RESTAURANT');
  });

  it('falls back to RETAIL for null, empty and unknown values', () => {
    // This is the safety net for a tenant whose business_type predates a
    // vertical, or is a value this build has never heard of.
    expect(normalizeType(undefined)).toBe('RETAIL');
    expect(normalizeType(null)).toBe('RETAIL');
    expect(normalizeType('')).toBe('RETAIL');
    expect(normalizeType('JEWELLERY')).toBe('RETAIL');
  });

  it('means a tenant on a NEWER vertical silently looks like RETAIL here', () => {
    // Worth stating rather than discovering: the fallback is deliberate, but
    // it also means an older client build shows a jeweller the retail app
    // instead of refusing. Any new vertical must ship to clients before it is
    // offered at signup.
    expect(BUSINESS_TYPES).not.toContain('JEWELLERY');
    expect(normalizeType('JEWELLERY')).toBe('RETAIL');
  });
});

describe('the registry is internally consistent', () => {
  it('every business type has metadata and a default module set', () => {
    for (const t of BUSINESS_TYPES) {
      expect(VERTICAL_META[t], `VERTICAL_META.${t}`).toBeTruthy();
      expect(DEFAULT_MODULES[t], `DEFAULT_MODULES.${t}`).toBeTruthy();
    }
  });

  it('every vertical declares the same set of toggles', () => {
    // A key present for one vertical and absent for another is not "off" —
    // isModuleEnabled treats an unknown key as ON. That asymmetry is exactly
    // how a restaurant-only feature would appear in a retail shop.
    const keys = Object.keys(DEFAULT_MODULES.RETAIL).sort();
    for (const t of BUSINESS_TYPES) {
      expect(Object.keys(DEFAULT_MODULES[t]).sort(), `DEFAULT_MODULES.${t}`).toEqual(keys);
    }
  });
});

describe('resolveModules', () => {
  it('returns the vertical defaults when the tenant overrides nothing', () => {
    expect(resolveModules({ business_type: 'RESTAURANT' }).tables).toBe(true);
    expect(resolveModules({ business_type: 'RETAIL' }).tables).toBe(false);
  });

  it('lets a tenant override a default in either direction', () => {
    const on = resolveModules({ business_type: 'RETAIL', modules: { tables: true } });
    expect(on.tables).toBe(true);
    const off = resolveModules({ business_type: 'RETAIL', modules: { inventory: false } });
    expect(off.inventory).toBe(false);
  });

  it('keeps the other defaults when one key is overridden', () => {
    const m = resolveModules({ business_type: 'RETAIL', modules: { tables: true } });
    expect(m.pos).toBe(true);
    expect(m.appointments).toBe(false);
  });

  it('ignores a modules value that is not an object', () => {
    // The column is jsonb and defaults to {}, but a string or null must not
    // spread into the defaults and blank them.
    for (const bad of [null, 'tables', 42, undefined]) {
      expect(resolveModules({ business_type: 'RETAIL', modules: bad }).pos).toBe(true);
    }
  });

  it('treats an unknown business_type as RETAIL', () => {
    expect(resolveModules({ business_type: 'NOPE' })).toEqual(DEFAULT_MODULES.RETAIL);
  });

  it('survives a null tenant', () => {
    expect(resolveModules(null)).toEqual(DEFAULT_MODULES.RETAIL);
  });
});

describe('isModuleEnabled', () => {
  it('reports a declared toggle', () => {
    const m = DEFAULT_MODULES.RESTAURANT;
    expect(isModuleEnabled(m, 'kot')).toBe(true);
    expect(isModuleEnabled(m, 'vehicles')).toBe(false);
  });

  it('defaults an UNKNOWN key to enabled', () => {
    // Load-bearing: spine modules (dashboard, clients, invoices, reports …)
    // are deliberately absent from DEFAULT_MODULES and must never be hidden.
    // Flipping this default to false would blank the nav for every tenant.
    expect(isModuleEnabled(DEFAULT_MODULES.RETAIL, 'dashboard')).toBe(true);
    expect(isModuleEnabled(DEFAULT_MODULES.RETAIL, 'invoices')).toBe(true);
    expect(isModuleEnabled(DEFAULT_MODULES.RETAIL, 'not_a_real_module')).toBe(true);
  });

  it('defaults to enabled when there is no module map at all', () => {
    expect(isModuleEnabled(null, 'anything')).toBe(true);
    expect(isModuleEnabled(undefined, 'anything')).toBe(true);
  });
});

describe('term', () => {
  it('relabels per vertical', () => {
    expect(term('RESTAURANT', 'product')).toBe('Dish');
    expect(term('SERVICES', 'sale')).toBe('Booking');
    expect(term('RETAIL', 'product')).toBe('Product');
  });

  it('falls back to the base word for a key a vertical does not override', () => {
    expect(term('SERVICES', 'build')).toBe('Build');
  });

  it('returns the key itself when nothing defines it', () => {
    // So a missing term renders as a visible key rather than as "undefined".
    expect(term('RETAIL', 'no_such_term')).toBe('no_such_term');
  });

  it('falls back to RETAIL wording for an unknown vertical', () => {
    expect(term('JEWELLERY', 'product')).toBe('Product');
  });
});

describe('MODULE_META', () => {
  it('describes every switchable toggle', () => {
    // A key with no metadata renders in Settings as a raw column name.
    for (const key of MODULE_KEYS) {
      expect(MODULE_META[key], `MODULE_META.${key}`).toBeTruthy();
      expect(MODULE_META[key].label, `MODULE_META.${key}.label`).toBeTruthy();
    }
  });

  it('describes nothing that is not a toggle', () => {
    for (const key of Object.keys(MODULE_META)) {
      expect(MODULE_KEYS, `MODULE_META has a stale key: ${key}`).toContain(key);
    }
  });
});

describe('overridesFrom', () => {
  it('stores nothing when the choice matches the vertical default', () => {
    // The whole point: tenants.modules holds DEVIATIONS. Writing the resolved
    // map instead would freeze today's defaults into the row, and a later
    // change to DEFAULT_MODULES would never reach anyone who had opened the
    // settings screen once.
    expect(overridesFrom('RETAIL', DEFAULT_MODULES.RETAIL)).toEqual({});
    expect(overridesFrom('RESTAURANT', DEFAULT_MODULES.RESTAURANT)).toEqual({});
  });

  it('stores only the keys that differ', () => {
    const desired = { ...DEFAULT_MODULES.RETAIL, tables: true, vehicles: false };
    expect(overridesFrom('RETAIL', desired)).toEqual({ tables: true, vehicles: false });
  });

  it('round-trips through resolveModules', () => {
    const desired = { ...DEFAULT_MODULES.SERVICES, vehicles: true };
    const modules = overridesFrom('SERVICES', desired);
    const resolved = resolveModules({ business_type: 'SERVICES', modules });
    expect(resolved).toEqual(desired);
  });

  it('drops keys this build does not know about', () => {
    // A stale client must not be able to persist a toggle that no longer
    // exists, where it would sit in the jsonb forever meaning nothing.
    const out = overridesFrom('RETAIL', { tables: true, ancient_feature: true });
    expect(out).toEqual({ tables: true });
  });

  it('ignores keys the caller simply did not mention', () => {
    expect(overridesFrom('RETAIL', { tables: true })).toEqual({ tables: true });
  });

  it('coerces truthiness rather than storing whatever it was handed', () => {
    // A checkbox can hand over '' or undefined; jsonb would keep them verbatim
    // and isModuleEnabled would then read a string as true.
    expect(overridesFrom('RETAIL', { tables: 1 })).toEqual({ tables: true });
    expect(overridesFrom('RETAIL', { inventory: 0 })).toEqual({ inventory: false });
  });

  it('treats an unknown vertical as RETAIL, like everything else here', () => {
    expect(overridesFrom('JEWELLERY', { tables: true })).toEqual({ tables: true });
  });
});
