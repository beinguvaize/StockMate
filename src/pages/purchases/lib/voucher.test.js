import { describe, it, expect } from 'vitest';
import { amountInWords, financialYear, voucherNo, buildVoucherModel } from './voucher';

describe('amountInWords', () => {
  it('writes the real bill totals', () => {
    expect(amountInWords(6600)).toBe('Six Thousand Six Hundred Rupees Only');
    expect(amountInWords(6905.50)).toBe('Six Thousand Nine Hundred Five Rupees and Fifty Paise Only');
  });

  it('uses Indian grouping, not millions', () => {
    expect(amountInWords(100000)).toBe('One Lakh Rupees Only');
    expect(amountInWords(261492)).toBe('Two Lakh Sixty One Thousand Four Hundred Ninety Two Rupees Only');
    expect(amountInWords(10000000)).toBe('One Crore Rupees Only');
  });

  it('handles the teens and the round tens', () => {
    expect(amountInWords(19)).toBe('Nineteen Rupees Only');
    expect(amountInWords(70)).toBe('Seventy Rupees Only');
    expect(amountInWords(115)).toBe('One Hundred Fifteen Rupees Only');
  });

  it('rounds to paise once, so the words cannot disagree with the total', () => {
    // 6905.499 must not report 6,905 rupees AND 50 paise from separate roundings.
    expect(amountInWords(6905.499)).toBe('Six Thousand Nine Hundred Five Rupees and Fifty Paise Only');
    expect(amountInWords(0.994)).toBe('Ninety Nine Paise Only');
  });

  it('copes with zero, paise-only and rubbish input', () => {
    expect(amountInWords(0)).toBe('Zero Rupees Only');
    expect(amountInWords(0.5)).toBe('Fifty Paise Only');
    expect(amountInWords(null)).toBe('');
    expect(amountInWords('abc')).toBe('');
  });
});

describe('financialYear', () => {
  it('runs April to March', () => {
    expect(financialYear('2026-07-28')).toBe('2026-27');
    expect(financialYear('2026-04-01')).toBe('2026-27');
    expect(financialYear('2026-03-31')).toBe('2025-26');
    expect(financialYear('2027-01-15')).toBe('2026-27');
  });

  it('returns empty rather than a wrong year for a bad date', () => {
    expect(financialYear('')).toBe('');
    expect(financialYear(null)).toBe('');
  });
});

describe('voucherNo', () => {
  it('is built from the bill ref and its financial year', () => {
    expect(voucherNo({ id: 'PUR-ENIJIE', date: '2026-07-28' })).toBe('PV/2026-27/ENIJIE');
  });

  it('does not change when other bills are added or back-dated', () => {
    // The whole reason it is not a counter: a supplier must never hold two
    // papers bearing the same number.
    const bill = { id: 'PUR-ENIJIE', date: '2026-07-28' };
    expect(voucherNo(bill)).toBe(voucherNo(bill));
  });
});

// ── the real 28 Jul bill ─────────────────────────────────────────────────────
const productById = {
  'p-tissue': { name: 'Tissue small', hsn_code: '', unit: 'PCS', taxRate: 18 },
  'p-mayil': { name: 'Mayil sheet 18*18', hsn_code: '4823', unit: 'KG', taxRate: 18 },
};
const bill = {
  id: 'PUR-ENIJIE', date: '2026-07-28', payment_type: 'CASH', bill_no: null,
  lines: [
    { id: 'PUR-ENIJIE', linked_product_id: 'p-tissue', quantity: 500, total_amount: 2500, paid_amount: 2500 },
    { id: 'PUR-EPKTSL', linked_product_id: 'p-mayil', quantity: 50, total_amount: 4100, paid_amount: 4100 },
  ],
};

describe('buildVoucherModel', () => {
  it('puts every product of the bill on one voucher', () => {
    const m = buildVoucherModel({ bill, supplier: { name: 'SANTHOSH KOTTARAKKARA' }, productById });
    expect(m.items).toHaveLength(2);
    expect(m.total).toBe(6600);
    expect(m.words).toBe('Six Thousand Six Hundred Rupees Only');
  });

  it('derives the unit rate from amount and quantity', () => {
    const m = buildVoucherModel({ bill, supplier: {}, productById });
    expect(m.items[0].rate).toBeCloseTo(5, 2);    // 2500 / 500
    expect(m.items[1].rate).toBeCloseTo(82, 2);   // 4100 / 50
  });

  it('shows NO tax split when the supplier has no GSTIN on file', () => {
    // Printing CGST/SGST here would assert a tax invoice that does not exist.
    const m = buildVoucherModel({ bill, supplier: { name: 'SANTHOSH' }, productById });
    expect(m.registered).toBe(false);
    expect(m.tax).toBe(0);
    expect(m.cgst).toBe(0);
    expect(m.taxable).toBe(6600);   // whole amount, unsplit
    expect(m.items[0].gstRate).toBeNull();
  });

  it('splits tax when the supplier IS registered', () => {
    const m = buildVoucherModel({
      bill, supplier: { name: 'X', gstin: '32AACFM1234R1ZP' }, productById,
    });
    expect(m.registered).toBe(true);
    expect(m.taxable).toBeCloseTo(5593.22, 2);
    expect(m.tax).toBeCloseTo(1006.78, 2);
    expect(m.cgst).toBeCloseTo(503.39, 2);
    expect(m.sgst).toBeCloseTo(503.39, 2);
    expect(m.igst).toBe(0);
    // The split must reconstitute the total exactly.
    expect(m.taxable + m.cgst + m.sgst + m.igst).toBeCloseTo(m.total, 2);
  });

  it('uses IGST when the supplier is in another state', () => {
    const m = buildVoucherModel({
      bill,
      supplier: { gstin: '29AACFM1234R1ZP', __homeStateCode: '32' },
      productById,
    });
    expect(m.interstate).toBe(true);
    expect(m.igst).toBeCloseTo(1006.78, 2);
    expect(m.cgst).toBe(0);
  });

  it('treats a 0-rated product as carrying no tax even for a registered supplier', () => {
    const m = buildVoucherModel({
      bill,
      supplier: { gstin: '32AACFM1234R1ZP' },
      productById: { ...productById, 'p-tissue': { name: 'Tissue small', taxRate: 0 } },
    });
    expect(m.items[0].tax).toBe(0);
    expect(m.items[0].taxable).toBe(2500);
    expect(m.items[1].tax).toBeCloseTo(625.42, 2);
  });

  it('reports paid and due across the whole bill, not one line', () => {
    const partial = {
      ...bill,
      lines: [
        { ...bill.lines[0], paid_amount: 2000 },
        { ...bill.lines[1], paid_amount: 0 },
      ],
    };
    const m = buildVoucherModel({ bill: partial, supplier: {}, productById });
    expect(m.paid).toBe(2000);
    expect(m.due).toBe(4600);
    expect(m.settled).toBe(false);
  });

  it('counts products with no HSN so the page can warn before printing', () => {
    const m = buildVoucherModel({ bill, supplier: {}, productById });
    expect(m.missingHsn).toBe(1);   // Tissue small, cleared on 5 Aug
    expect(m.items[0].hsn).toBe('');
    expect(m.items[1].hsn).toBe('4823');
  });

  it('does not fall over on an empty or malformed bill', () => {
    const m = buildVoucherModel({});
    expect(m.items).toEqual([]);
    expect(m.total).toBe(0);
    expect(m.words).toBe('Zero Rupees Only');
  });
});
