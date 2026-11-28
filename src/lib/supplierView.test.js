import { describe, it, expect } from 'vitest';
import {
  decoratedSupplierBills, billPill, dueBands, supplierDue, supplierRows, visibleRows, filterCounts,
  supplierKpis, initialsOf, gstinError,
} from './supplierView';
import { owedBySupplier } from './supplierOwed';

const TODAY = '2026-11-26';
const suppliers = [
  { id: 's1', name: 'Supplier One', contact_person: 'Asha', phone: '90000 00001', credit_days: 15 },
  { id: 's2', name: 'Supplier Two', gstin: '29ABCDE1234F1Z5' },
  { id: 's3', name: 'Supplier Three' },
];
const row = (o) => ({ payment_type: 'CREDIT', created_at: `${o.date}T10:00:00Z`, ...o });
const purchases = [
  // s1: one bill of two lines, 2 Nov, credit 15 days -> due 17 Nov, overdue 9d
  row({ id: 'p1', supplier_id: 's1', date: '2026-11-02', total_amount: 5000, paid_amount: 0, bill_no: 'B-1' }),
  row({ id: 'p2', supplier_id: 's1', date: '2026-11-02', total_amount: 2380, paid_amount: 0, bill_no: 'B-1' }),
  // s1: 20 Nov, due 5 Dec, part paid
  row({ id: 'p3', supplier_id: 's1', date: '2026-11-20', total_amount: 1000, paid_amount: 400, bill_no: 'B-2' }),
  // s2 (older row, name only): no credit days -> 30; 1 Nov -> due 1 Dec, 5 days left
  row({ id: 'p4', supplier_name: 'Supplier Two', date: '2026-11-01', total_amount: 3000, paid_amount: 0 }),
  // s2: overpaid cash bill, an advance of 200
  row({ id: 'p5', supplier_id: 's2', date: '2026-11-10', payment_type: 'CASH', total_amount: 800, paid_amount: 1000 }),
  // s3: paid in full
  row({ id: 'p6', supplier_id: 's3', date: '2026-11-05', payment_type: 'CASH', total_amount: 600, paid_amount: 600 }),
  // a supplier no longer on the list
  row({ id: 'p7', supplier_id: 'gone', supplier_name: 'Removed', date: '2026-10-01', total_amount: 999, paid_amount: 0 }),
];
const payments = [
  { id: 'SUPP-A', supplier_id: 's1', amount: 400, date: '2026-11-21', purchase_id: 'p3' },
  { id: 'SUPP-B', supplier_id: 's2', amount: 100, date: '2026-10-28' },
];

const build = () => {
  const decorated = decoratedSupplierBills({ suppliers, purchases, payments, today: TODAY });
  const rows = supplierRows({ suppliers, purchases, supplierPayments: payments, decorated });
  return { decorated, rows, by: Object.fromEntries(rows.map((r) => [r.id, r])) };
};

describe('supplier list figures', () => {
  it('owed is exactly lib/supplierOwed.js (the ledger closing balance), no second rule', () => {
    const { rows } = build();
    const owed = owedBySupplier(suppliers, { purchases, supplierPayments: payments });
    rows.forEach((r) => expect(r._payable).toBe(owed.get(r.id).owed));
    // s2: 3000 + 800 bill, 1000 paid at the bill, 100 on account.
    expect(rows.find((r) => r.id === 's2')._payable).toBe(2700);
    expect(rows.find((r) => r.id === 's2')._advance).toBe(0);
  });

  it('bill count stays a count of purchase rows, as before', () => {
    const { by } = build();
    expect(by.s1._f.billCount).toBe(3);
    expect(by.s1._f.lastBill).toBe('2026-11-20');
    expect(by.s1._f.lastBillNo).toBe('B-2');
    expect(by.s1._f.oldestUnpaid).toBe('2026-11-02');
  });

  it('due state uses the Purchases register rule: supplier credit days, else 30', () => {
    const { by } = build();
    expect(by.s1._due.overdue).toBe(true);
    expect(by.s1._due.unpaidCount).toBe(2);           // two bills, not three rows
    expect(by.s1._due.oldest.dueOn).toBe('2026-11-17');
    expect(by.s1._due.pill).toEqual({ tone: 'bad', text: 'Overdue 9d' });
    expect(by.s2._due.oldest.dueOn).toBe('2026-12-01');
    expect(by.s2._due.pill).toEqual({ tone: 'neutral', text: 'Due in 5d' });
    expect(by.s3._due.oldest).toBe(null);
    expect(by.s3._due.pill).toBe(null);
  });

  it('due bands add up unpaid bills of listed suppliers only', () => {
    const { decorated } = build();
    const bands = dueBands(decorated);
    expect(bands.over).toEqual({ amount: 7380, count: 1 });
    expect(bands.week).toEqual({ amount: 3000, count: 1 });
    expect(bands.later).toEqual({ amount: 600, count: 1 });
    expect(bands.total).toBe(10980);
  });

  it('filters: Owing, Overdue and All, with counts; search covers GSTIN; most owed first', () => {
    const { rows } = build();
    expect(filterCounts(rows)).toEqual({ OWING: 2, OVERDUE: 1, ALL: 3 });
    expect(visibleRows(rows, { filter: 'OWING' }).map((r) => r.id)).toEqual(['s1', 's2']);
    expect(visibleRows(rows, { filter: 'OVERDUE' }).map((r) => r.id)).toEqual(['s1']);
    expect(visibleRows(rows, { filter: 'ALL', q: '29abcde' }).map((r) => r.id)).toEqual(['s2']);
    expect(visibleRows(rows, { filter: 'ALL', q: 'asha' }).map((r) => r.id)).toEqual(['s1']);
  });

  it('tiles: owed from the ledger, the rest the old figures, including the all-time payment count', () => {
    const { rows } = build();
    const k = supplierKpis({ rows, suppliers, purchases, supplierPayments: payments, now: new Date('2026-11-26T12:00:00') });
    expect(k.payable).toBe(7380 + 600 + 2700);
    expect(k.owing).toBe(2);
    expect(k.advance).toBe(0);
    expect(k.paidThisMonth).toBe(400);
    expect(k.paymentsRecorded).toBe(2);
    expect(k.billsThisMonth).toBe(6);           // rows, as before
    expect(k.oldestName).toBe('Supplier Two');
  });
});

describe('small helpers', () => {
  it('bill pill words', () => {
    expect(billPill({ state: 'paid' })).toEqual({ tone: 'good', text: 'Paid' });
    expect(billPill({ state: 'part', dleft: 3 })).toEqual({ tone: 'warn', text: 'Part paid' });
    expect(billPill({ state: 'due', dleft: 0 })).toEqual({ tone: 'neutral', text: 'Due today' });
    expect(billPill(null)).toBe(null);
  });
  it('supplierDue on no bills', () => {
    expect(supplierDue([])).toMatchObject({ unpaidCount: 0, overdue: false, pill: null });
  });
  it('initials and GSTIN length', () => {
    expect(initialsOf('Demo Kirana Store')).toBe('DK');
    expect(initialsOf('')).toBe('–');
    expect(gstinError('')).toBe(null);
    expect(gstinError('29ABCDE1234F1Z5')).toBe(null);
    expect(gstinError('29AB')).toBe('Must be 15 characters');
  });
});
