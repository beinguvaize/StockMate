import { describe, it, expect } from 'vitest';
import { isValidHsn, normalizeHsn } from './hsn';

describe('isValidHsn', () => {
  it('accepts 4, 6 and 8 digits', () => {
    expect(isValidHsn('4823')).toBe(true);
    expect(isValidHsn('482300')).toBe(true);
    expect(isValidHsn('48230000')).toBe(true);
  });

  it('rejects the lengths the portal will not take', () => {
    expect(isValidHsn('48')).toBe(false);      // chapter, not a code
    expect(isValidHsn('482')).toBe(false);
    expect(isValidHsn('48230')).toBe(false);
    expect(isValidHsn('482300000')).toBe(false);
  });

  it('rejects the SKU codes that actually got in', () => {
    // Every one of these is live on a FUTURE DISPO product today.
    for (const bad of ['TES', 'TEB', 'LD0', 'LD00', 'HM01', 'PKT1316', 'KG1620', 'P12', 'STB']) {
      expect(isValidHsn(bad)).toBe(false);
    }
  });

  it('handles null and blank without throwing', () => {
    expect(isValidHsn(null)).toBe(false);
    expect(isValidHsn(undefined)).toBe(false);
    expect(isValidHsn('   ')).toBe(false);
  });
});

describe('normalizeHsn', () => {
  it('reports blank as empty, not invalid', () => {
    // Nothing entered is not a data error, and must not be reported as one.
    expect(normalizeHsn('')).toMatchObject({ code: null, status: 'empty' });
    expect(normalizeHsn(null)).toMatchObject({ code: null, status: 'empty' });
    expect(normalizeHsn('  ')).toMatchObject({ code: null, status: 'empty' });
  });

  it('passes a good code straight through', () => {
    expect(normalizeHsn('4823')).toMatchObject({ code: '4823', status: 'ok' });
  });

  it('recovers spreadsheet formatting', () => {
    expect(normalizeHsn(' 4823 ')).toMatchObject({ code: '4823', status: 'ok' });
    expect(normalizeHsn('4823.00')).toMatchObject({ code: '482300', status: 'ok' });
    expect(normalizeHsn('3923-00-00')).toMatchObject({ code: '39230000', status: 'ok' });
  });

  it('drops an invalid code and keeps the raw text for reporting', () => {
    const r = normalizeHsn('TES');
    expect(r.code).toBeNull();
    expect(r.status).toBe('invalid');
    expect(r.raw).toBe('TES');
  });

  it('never invents a code from a partial one', () => {
    // Padding 482 -> 4820 would be a different commodity entirely.
    expect(normalizeHsn('482')).toMatchObject({ code: null, status: 'invalid' });
    expect(normalizeHsn('PKT1316').code).toBeNull();
  });

  it('never promotes a digit-bearing SKU into a tax code', () => {
    // This is the case the first implementation got wrong: stripping non-digits
    // turned PKT1316 into "1316" and KG1620 into "1620" — both plausible HSNs
    // for unrelated goods, and nothing downstream would ever have flagged them.
    // Recovery is now limited to text containing no letters.
    for (const sku of ['PKT1316', 'KG1316', 'PKT1620', 'KG1620', 'LD0', 'STB', 'P12', 'HM01']) {
      expect(normalizeHsn(sku)).toMatchObject({ code: null, status: 'invalid' });
    }
  });
});
