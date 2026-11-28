import { describe, it, expect } from 'vitest';
import {
  documentGst, documentFinalTotal, documentPaidNow, estimateGrandTotal, panelTotal, panelBalance, lineAmount,
} from './documentTotals';

/**
 * The figures below were taken from the builder BEFORE the redesign moved its
 * totals into lib/documentTotals. They must not move: each is what a saved
 * document carries.
 */
const SHOP = 'Karnataka';
const CARTS = {
  intraExclusive: {
    lines: [
      { qty: 4, rate: 2150, disc: 0, taxRate: 5, hsn: '1006' },
      { qty: 3, rate: 2350, disc: 0, taxRate: 5, hsn: '1512' },
      { qty: 30, rate: 168, disc: 0, taxRate: 0, hsn: '0713' },
      { qty: 10, rate: 115, disc: 0, taxRate: 18, hsn: '3402' },
    ],
    state: 'Karnataka', gstOn: true, mode: 'EXCLUSIVE', charges: '', disc: '',
    want: { taxable: 21840, cgst: 494.75, sgst: 494.75, igst: 0, roundOff: 0.5, grandTotal: 22830, final: 22830, est: 22830, shown: 22830 },
  },
  interstateWithChargesAndDiscount: {
    lines: [
      { qty: 3, rate: 145, disc: 0, taxRate: 5 },
      { qty: 2, rate: 76, disc: 10, taxRate: 18 },
    ],
    state: 'Kerala', gstOn: true, mode: 'EXCLUSIVE', charges: '50', disc: '12.5',
    want: { taxable: 571.8, cgst: 0, sgst: 0, igst: 46.37, roundOff: -0.17, grandTotal: 618, final: 655.5, est: 655.5, shown: 655.5 },
  },
  inclusiveWithCharges: {
    lines: [
      { qty: 10, rate: 2150, disc: 0, taxRate: 5 },
      { qty: 20, rate: 115, disc: 5, taxRate: 18 },
    ],
    state: 'Karnataka', gstOn: true, mode: 'INCLUSIVE', charges: '1000', disc: '',
    want: { taxable: 22327.89, cgst: 678.56, sgst: 678.56, igst: 0, roundOff: 0, grandTotal: 23685, final: 24685, est: 24685, shown: 24685 },
  },
  nonGstChallan: {
    lines: [
      { qty: 8, rate: 420, disc: 0, taxRate: 5 },
      { qty: 24, rate: 145.5, disc: 2.5, taxRate: 5 },
    ],
    state: 'Karnataka', gstOn: false, mode: 'EXCLUSIVE', charges: '', disc: '100',
    // Today a non-GST document's Total and saved grand_total come from the
    // subtotal (before line discounts), so 6,752 while the GST engine's own
    // grand total is 6,765. Pinned as it is; reported, not fixed here.
    want: { taxable: 6764.7, cgst: 0, sgst: 0, igst: 0, roundOff: 0.3, grandTotal: 6765, final: 6665, est: 6752, shown: 6752 },
  },
  discountAboveTotal: {
    lines: [{ qty: 1.5, rate: 99.99, disc: 0, taxRate: 12 }],
    state: '', gstOn: true, mode: 'EXCLUSIVE', charges: '', disc: '500',
    want: { taxable: 149.98, cgst: 9, sgst: 9, igst: 0, roundOff: 0.02, grandTotal: 168, final: 0, est: 0, shown: 0 },
  },
};

describe('document totals stay what the builder computed before the redesign', () => {
  for (const [name, c] of Object.entries(CARTS)) {
    it(name, () => {
      const gst = documentGst(c.lines, c.gstOn, SHOP, c.state, c.mode);
      expect(gst.taxable).toBe(c.want.taxable);
      expect(gst.cgst).toBe(c.want.cgst);
      expect(gst.sgst).toBe(c.want.sgst);
      expect(gst.igst).toBe(c.want.igst);
      expect(gst.roundOff).toBe(c.want.roundOff);
      expect(gst.grandTotal).toBe(c.want.grandTotal);
      const final = documentFinalTotal(gst, c.charges, c.disc);
      expect(final).toBe(c.want.final);
      expect(estimateGrandTotal(c.gstOn, gst, final, c.charges, c.disc)).toBe(c.want.est);
      expect(panelTotal(gst, c.gstOn, c.charges, c.disc)).toBe(c.want.shown);
    });
  }

  it('a missing party state is read as no state', () => {
    const a = documentGst(CARTS.intraExclusive.lines, true, SHOP, undefined, 'EXCLUSIVE');
    const b = documentGst(CARTS.intraExclusive.lines, true, SHOP, '', 'EXCLUSIVE');
    expect(a).toEqual(b);
  });

  it('paid now is the total when marked paid, else what was typed', () => {
    expect(documentPaidNow(true, 22830, '500')).toBe(22830);
    expect(documentPaidNow(false, 22830, '500')).toBe(500);
    expect(documentPaidNow(false, 22830, '')).toBe(0);
  });

  it('balance and line amount', () => {
    expect(panelBalance(655.5, '200')).toBe(455.5);
    expect(panelBalance(100, '250')).toBe(0);
    expect(lineAmount({ qty: 2, rate: 76, disc: 10 })).toBeCloseTo(136.8, 10);
    expect(lineAmount({ qty: '', rate: 76, disc: '' })).toBe(0);
  });
});
