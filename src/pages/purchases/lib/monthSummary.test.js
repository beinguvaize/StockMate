import { describe, it, expect } from 'vitest';
import { monthSummary } from './monthSummary';

const products = [
  { id: 'p5', taxRate: 5 },
  { id: 'p0', taxRate: 0 },
];
const suppliers = [
  { id: 's-reg', gstin: '29ABCDE1234F1Z5' },
  { id: 's-blank', gstin: '' },
];
const row = (o) => ({ id: Math.random().toString(36), quantity: 1, ...o });

describe('monthSummary', () => {
  it('counts the shop month from the date passed in, not the UTC clock', () => {
    // 1 Dec in the shop; a UTC clock would still say November until 05:30 IST.
    const purchases = [
      row({ date: '2026-12-01', total_amount: 105, linked_product_id: 'p5', supplier_id: 's-reg' }),
      row({ date: '2026-11-30', total_amount: 500, linked_product_id: 'p5', supplier_id: 's-reg' }),
    ];
    const s = monthSummary({ purchases, suppliers, products, today: '2026-12-01' });
    expect(s.month).toBe(105);
    expect(s.monthStart).toBe('2026-12-01');
  });

  it('takes ITC at each product’s own rate, and none on a 0% item', () => {
    const purchases = [
      row({ date: '2026-11-10', total_amount: 105, linked_product_id: 'p5', supplier_id: 's-reg' }),
      row({ date: '2026-11-11', total_amount: 300, linked_product_id: 'p0', supplier_id: 's-reg' }),
    ];
    const s = monthSummary({ purchases, suppliers, products, today: '2026-11-26' });
    expect(s.month).toBe(405);
    expect(s.itc).toBeCloseTo(5, 6);
    expect(s.itcUnverified).toBe(0);
  });

  it('keeps credit from a supplier with no GSTIN apart, as pending', () => {
    const purchases = [
      row({ date: '2026-11-10', total_amount: 210, linked_product_id: 'p5', supplier_id: 's-blank' }),
    ];
    const s = monthSummary({ purchases, suppliers, products, today: '2026-11-26' });
    expect(s.itc).toBe(0);
    expect(s.itcUnverified).toBeCloseTo(10, 6);
    expect(s.missingGstinSuppliers).toBe(1);
  });

  it('sums what is owed over every row, whatever the month', () => {
    const purchases = [
      row({ date: '2025-01-10', total_amount: 100 }),
      row({ date: '2026-11-10', total_amount: 50 }),
    ];
    const s = monthSummary({ purchases, suppliers, products, dueOf: (p) => p.total_amount, today: '2026-11-26' });
    expect(s.payable).toBe(150);
  });
});
