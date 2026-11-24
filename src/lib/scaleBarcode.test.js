import { describe, it, expect } from 'vitest';
import { ean13CheckDigit } from './labelPrint';
import {
  parseScaleBarcode, quantityFrom, VALUE_KINDS, DEFAULT_SCALE_FORMAT,
} from './scaleBarcode';

/** Build a valid 13-digit scale label: prefix + item + value + check digit. */
const label = (prefix, item, value, { itemDigits = 5, valueDigits = 5 } = {}) => {
  const body = prefix
    + String(item).padStart(itemDigits, '0')
    + String(value).padStart(valueDigits, '0');
  return body + ean13CheckDigit(body);
};

describe('parseScaleBarcode', () => {
  it('reads a weight label into kilograms', () => {
    // 380 g of tomatoes under PLU 01234.
    const code = label('21', 1234, 380);
    const p = parseScaleBarcode(code);
    expect(p.itemCode).toBe('01234');
    expect(p.quantity).toBeCloseTo(0.38, 6);
  });

  it('reads a price label into rupees', () => {
    const code = label('20', 55, 14250); // ₹142.50
    const p = parseScaleBarcode(code, { ...DEFAULT_SCALE_FORMAT, prefixes: ['20'], valueKind: VALUE_KINDS.PRICE_PAISE });
    expect(p.lineTotal).toBeCloseTo(142.5, 6);
    expect(p.quantity).toBeUndefined();
  });

  it('reads a 10-gram-unit scale', () => {
    const code = label('21', 7, 38); // 38 x 10g = 380g
    const p = parseScaleBarcode(code, { ...DEFAULT_SCALE_FORMAT, valueKind: VALUE_KINDS.WEIGHT_10G });
    expect(p.quantity).toBeCloseTo(0.38, 6);
  });

  it('honours a different field split', () => {
    // Four-digit PLU, six-digit value.
    const code = label('22', 42, 1500, { itemDigits: 4, valueDigits: 6 });
    const p = parseScaleBarcode(code, { prefixes: ['22'], itemDigits: 4, valueDigits: 6, valueKind: VALUE_KINDS.WEIGHT_G });
    expect(p.itemCode).toBe('0042');
    expect(p.quantity).toBeCloseTo(1.5, 6);
  });

  describe('refuses anything that is not a scale label', () => {
    it('an ordinary product barcode', () => {
      // 890... is a normal Indian GS1 prefix, not restricted circulation.
      const body = '890123456789';
      expect(parseScaleBarcode(body + ean13CheckDigit(body))).toBeNull();
    });

    it('a mis-scan with a bad check digit', () => {
      // Pricing off a corrupted read would invent a weight.
      const good = label('21', 1234, 380);
      const bad = good.slice(0, 12) + (good[12] === '0' ? '1' : '0');
      expect(parseScaleBarcode(bad)).toBeNull();
    });

    it('short, long, empty and non-numeric input', () => {
      for (const v of ['', '   ', null, undefined, '12345', '21' + '0'.repeat(20), 'ABCDEFGHIJKLM']) {
        expect(parseScaleBarcode(v)).toBeNull();
      }
    });

    it('a format whose fields do not fill the 12-digit body', () => {
      // A misconfiguration must not be guessed at by trimming an end.
      const code = label('21', 1234, 380);
      expect(parseScaleBarcode(code, { prefixes: ['21'], itemDigits: 4, valueDigits: 5, valueKind: VALUE_KINDS.WEIGHT_G })).toBeNull();
    });

    it('an unknown value kind', () => {
      const code = label('21', 1234, 380);
      expect(parseScaleBarcode(code, { ...DEFAULT_SCALE_FORMAT, valueKind: 'SOMETHING_ELSE' })).toBeNull();
    });
  });

  it('keeps the default prefix set narrow', () => {
    // Every prefix claimed here is one that can no longer be an ordinary
    // product barcode, so a shop's packaged goods get priced by accident.
    expect(DEFAULT_SCALE_FORMAT.prefixes.every(p => /^2\d$/.test(p))).toBe(true);
    expect(DEFAULT_SCALE_FORMAT.prefixes.length).toBeLessThanOrEqual(3);
  });
});

describe('quantityFrom', () => {
  const weight = parseScaleBarcode(label('21', 1234, 380));
  const priced = parseScaleBarcode(label('20', 55, 14250),
    { ...DEFAULT_SCALE_FORMAT, prefixes: ['20'], valueKind: VALUE_KINDS.PRICE_PAISE });

  it('passes a weight straight through', () => {
    expect(quantityFrom(weight, 999)).toBeCloseTo(0.38, 6);
  });

  it('derives a quantity from an embedded price', () => {
    // ₹142.50 at ₹95/kg = 1.5 kg
    expect(quantityFrom(priced, 95)).toBeCloseTo(1.5, 6);
  });

  it('rounds to 3dp, matching what stock can hold', () => {
    expect(quantityFrom(priced, 7)).toBe(20.357);
  });

  it('refuses to guess when the unit price is missing or zero', () => {
    // Silently adding 0 or Infinity of something to a bill is worse than
    // asking the cashier.
    expect(quantityFrom(priced, 0)).toBeNull();
    expect(quantityFrom(priced, undefined)).toBeNull();
    expect(quantityFrom(priced, -5)).toBeNull();
  });

  it('is null for a non-label', () => {
    expect(quantityFrom(null, 95)).toBeNull();
  });
});
