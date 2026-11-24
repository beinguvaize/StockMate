import { describe, it, expect } from 'vitest';
import { computeLineTax } from './taxLine.js';
import { calculateGST } from './gstEngine.js';

/**
 * Inclusive vs exclusive is not a display choice.
 * ==========================================================================
 *
 * At 18%, a Rs 125 line is Rs 147.50 exclusive and Rs 125 inclusive. Getting
 * it wrong does not misformat a number, it charges the customer the tax twice
 * or absorbs it — and the same figures go onto the GST return.
 *
 * The rule lived only inside the POS screen, so every document built on
 * calculateGST could only be exclusive. These pin the behaviour now that the
 * primitive carries it, including the property that matters most: the two
 * modes must agree about tax when they collect the same money.
 */

describe('a line, exclusive', () => {
  it('adds the tax on top, as it always did', () => {
    const L = computeLineTax({ qty: 1, rate: 125, taxRate: 8 });
    expect(L.taxable).toBeCloseTo(125, 2);
    expect(L.tax).toBeCloseTo(10, 2);
    expect(L.taxable + L.tax).toBeCloseTo(135, 2);
  });

  it('splits intra-state tax in half and keeps IGST at zero', () => {
    const L = computeLineTax({ qty: 1, rate: 100, taxRate: 18 });
    expect(L.cgst).toBeCloseTo(9, 2);
    expect(L.sgst).toBeCloseTo(9, 2);
    expect(L.igst).toBe(0);
  });
});

describe('a line, inclusive', () => {
  it('extracts the tax out of the price instead of adding it', () => {
    // Rs 100 at 18% inclusive: the customer pays 100, of which 15.25 is tax.
    const L = computeLineTax({ qty: 1, rate: 100, taxRate: 18, inclusive: true });
    expect(L.taxable).toBeCloseTo(84.75, 2);
    expect(L.tax).toBeCloseTo(15.25, 2);
    expect(L.taxable + L.tax).toBeCloseTo(100, 2);
  });

  it('leaves the customer paying exactly the rate on the line', () => {
    // The whole point: an inclusive price IS the money that changes hands.
    for (const rate of [5, 12, 18, 28]) {
      const L = computeLineTax({ qty: 3, rate: 250, taxRate: rate, inclusive: true });
      expect(L.taxable + L.tax).toBeCloseTo(750, 2);
    }
  });

  it('agrees with exclusive when both collect the same money', () => {
    // 100 exclusive at 18% collects 118. 118 inclusive at 18% must report the
    // same taxable value and the same tax, or billing and filing disagree.
    const exc = computeLineTax({ qty: 1, rate: 100, taxRate: 18 });
    const inc = computeLineTax({ qty: 1, rate: 118, taxRate: 18, inclusive: true });
    expect(inc.taxable).toBeCloseTo(exc.taxable, 2);
    expect(inc.tax).toBeCloseTo(exc.tax, 2);
  });

  it('extracts cess out of the price too, not on top of it', () => {
    // Cess is levied the same way, so an inclusive price contains both.
    const L = computeLineTax({ qty: 1, rate: 100, taxRate: 18, cessRate: 12, inclusive: true });
    expect(L.taxable + L.tax + L.cess).toBeCloseTo(100, 2);
  });

  it('discounts the money the customer hands over, then extracts', () => {
    // A 10% discount on an inclusive Rs 100 line means they pay 90, and the
    // tax inside it shrinks with it.
    const L = computeLineTax({ qty: 1, rate: 100, discountPercent: 10, taxRate: 18, inclusive: true });
    expect(L.taxable + L.tax).toBeCloseTo(90, 2);
  });

  it('is a no-op at a zero rate, rather than dividing by something odd', () => {
    const L = computeLineTax({ qty: 2, rate: 50, taxRate: 0, inclusive: true });
    expect(L.taxable).toBeCloseTo(100, 2);
    expect(L.tax).toBe(0);
  });
});

describe('a whole document', () => {
  const lines = [
    { qty: 1, rate: 125, taxRate: 8, hsn_code: '3923' },
    { qty: 2, rate: 120, taxRate: 18, hsn_code: '3924' },
  ];

  it('defaults to exclusive, so nothing that exists changes', () => {
    const a = calculateGST(lines, 'Kerala', 'Kerala');
    const b = calculateGST(lines, 'Kerala', 'Kerala', { taxMode: 'EXCLUSIVE' });
    expect(a.grandTotal).toBe(b.grandTotal);
    expect(a.taxable).toBeCloseTo(b.taxable, 2);
    // 125 + 240 = 365 taxable, tax 10 + 43.20
    expect(a.taxable).toBeCloseTo(365, 2);
    expect(a.totalTax).toBeCloseTo(53.2, 2);
  });

  it('bills the printed rate when inclusive', () => {
    const g = calculateGST(lines, 'Kerala', 'Kerala', { taxMode: 'INCLUSIVE' });
    // The customer pays 125 + 240 = 365, not 418.20.
    expect(g.grandTotal).toBe(365);
    expect(g.taxable).toBeLessThan(365);
    expect(g.taxable + g.totalTax).toBeCloseTo(365, 0);
  });

  it('splits no tax at all under NONE', () => {
    // A shop not filing GST: the price is final and nothing is split out,
    // which is what the POS and sale_gst_amount already do for that mode.
    const g = calculateGST(lines, 'Kerala', 'Kerala', { taxMode: 'NONE' });
    expect(g.totalTax).toBe(0);
    expect(g.cgst).toBe(0);
    expect(g.sgst).toBe(0);
    expect(g.grandTotal).toBe(365);
  });

  it('puts inclusive tax in IGST on an inter-state bill', () => {
    const g = calculateGST(lines, 'Kerala', 'Tamil Nadu', { taxMode: 'INCLUSIVE' });
    expect(g.cgst).toBe(0);
    expect(g.sgst).toBe(0);
    expect(g.igst).toBeGreaterThan(0);
    expect(g.grandTotal).toBe(365);
  });
});
