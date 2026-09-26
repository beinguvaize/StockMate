import { describe, it, expect } from 'vitest';
import {
  FIELD_PACKS, PACK_KEYS, fieldsFor, cleanAttributes, validateAttributes,
} from './sectorFields';
import { MODULE_KEYS, MODULE_META, DEFAULT_MODULES, BUSINESS_TYPES } from './verticals';

describe('the registry is well formed', () => {
  it('every field has a stable key, a label and a known type', () => {
    for (const pack of PACK_KEYS) {
      for (const f of FIELD_PACKS[pack].fields) {
        expect(f.key, `${pack} field key`).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(f.label, `${pack}.${f.key} label`).toBeTruthy();
        expect(['text', 'number', 'select']).toContain(f.type);
        if (f.type === 'select') expect(f.options?.length, `${pack}.${f.key} options`).toBeGreaterThan(0);
      }
    }
  });

  it('no key is claimed by two packs', () => {
    const seen = new Set();
    for (const pack of PACK_KEYS) {
      for (const f of FIELD_PACKS[pack].fields) {
        expect(seen.has(f.key), `${f.key} is declared twice`).toBe(false);
        seen.add(f.key);
      }
    }
  });
});

describe('fieldsFor', () => {
  it('returns nothing when no pack is on', () => {
    expect(fieldsFor([])).toEqual([]);
    expect(fieldsFor()).toEqual([]);
  });

  it('returns a pack’s fields in declared order, tagged with their pack', () => {
    const f = fieldsFor(['automotive']);
    expect(f.map(x => x.key)).toEqual(['part_no', 'oem_no', 'fitment', 'warranty_months']);
    expect(f.every(x => x.pack === 'automotive')).toBe(true);
  });

  it('ignores a pack this build does not have', () => {
    expect(fieldsFor(['automotive', 'not_a_pack']).map(x => x.key)).toContain('part_no');
    expect(fieldsFor(['not_a_pack'])).toEqual([]);
  });
});

describe('cleanAttributes', () => {
  const packs = ['automotive'];

  it('keeps and trims real values', () => {
    expect(cleanAttributes({ part_no: '  MF-220  ' }, packs)).toEqual({ part_no: 'MF-220' });
  });

  it('stores NOTHING for a blank field rather than an empty string', () => {
    // attributes is queried with ? and ->>. A key present with '' answers
    // "yes, present" to the first and "" to the second, which is exactly how a
    // blank field comes to look like a filled one.
    expect(cleanAttributes({ part_no: '', oem_no: '   ' }, packs)).toEqual({});
  });

  it('drops null and undefined', () => {
    expect(cleanAttributes({ part_no: null, oem_no: undefined }, packs)).toEqual({});
  });

  it('drops keys no enabled pack declares', () => {
    // A stale client must not be able to park data under a field nothing reads.
    expect(cleanAttributes({ part_no: 'X', purity: '22K' }, packs)).toEqual({ part_no: 'X' });
  });

  it('drops everything when no pack is enabled', () => {
    expect(cleanAttributes({ part_no: 'X' }, [])).toEqual({});
  });

  it('parses numbers and refuses the rest', () => {
    expect(cleanAttributes({ warranty_months: '24' }, packs)).toEqual({ warranty_months: 24 });
    expect(cleanAttributes({ warranty_months: 'two years' }, packs)).toEqual({});
    // Stored as a number, not the string the input handed over — otherwise
    // every reader has to remember to coerce, and one of them will not.
    expect(typeof cleanAttributes({ warranty_months: '6' }, packs).warranty_months).toBe('number');
  });

  it('respects a minimum', () => {
    expect(cleanAttributes({ warranty_months: '-3' }, packs)).toEqual({});
    expect(cleanAttributes({ warranty_months: '0' }, packs)).toEqual({ warranty_months: 0 });
  });

  it('is safe on junk input', () => {
    expect(cleanAttributes(undefined, packs)).toEqual({});
    expect(cleanAttributes({}, packs)).toEqual({});
  });
});

describe('validateAttributes', () => {
  const packs = ['automotive'];

  it('passes an empty form — a catalog field is not money', () => {
    // A shop half way through typing a part number must still be able to save.
    expect(validateAttributes({}, packs)).toBeNull();
    expect(validateAttributes({ part_no: '' }, packs)).toBeNull();
  });

  it('passes good values', () => {
    expect(validateAttributes({ part_no: 'MF-220', warranty_months: '12' }, packs)).toBeNull();
  });

  it('names the field when a number is not a number', () => {
    expect(validateAttributes({ warranty_months: 'abc' }, packs)).toMatch(/Warranty/);
  });

  it('names the field when a number is below its minimum', () => {
    expect(validateAttributes({ warranty_months: '-1' }, packs)).toMatch(/Warranty/);
  });

  it('ignores fields whose pack is off', () => {
    expect(validateAttributes({ warranty_months: 'abc' }, [])).toBeNull();
  });
});

describe('packs and module toggles are the same list', () => {
  it('every field pack is switchable from Settings', () => {
    // A pack with no toggle can never be turned on, so its fields would be
    // dead code that still looks implemented.
    for (const pack of PACK_KEYS) {
      expect(MODULE_KEYS, `no module toggle for pack "${pack}"`).toContain(pack);
      expect(MODULE_META[pack]?.label, `no label for pack "${pack}"`).toBeTruthy();
    }
  });

  it('a pack is OFF by default in every vertical', () => {
    // A pack adds inputs to the item form. Defaulting one on would start
    // asking existing shops for a part number they have no use for.
    for (const pack of PACK_KEYS) {
      for (const vertical of BUSINESS_TYPES) {
        expect(DEFAULT_MODULES[vertical][pack], `${pack} default in ${vertical}`).toBe(false);
      }
    }
  });
});
