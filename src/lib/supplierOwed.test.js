import { describe, it, expect } from 'vitest';
import { owedBySupplier, supplierOwedSummary, supplierLedgerFor, owedFromClosing } from './supplierOwed';

const suppliers = [{ id: 's1', name: 'Supplier One' }, { id: 's2', name: 'Supplier Two' }, { id: 's3', name: 'Supplier Three' }];
const bill = (o) => ({ payment_type: 'CREDIT', date: '2026-11-01', created_at: `${o.date || '2026-11-01'}T10:00:00Z`, ...o });

describe('supplier owed = the supplier ledger closing balance', () => {
  it('a bill less what was paid on it', () => {
    const by = owedBySupplier(suppliers, { purchases: [
      bill({ id: 'p1', supplier_id: 's1', date: '2026-11-01', total_amount: 1000, paid_amount: 400 }),
      bill({ id: 'p2', supplier_id: 's1', date: '2026-11-03', total_amount: 500, paid_amount: 500, payment_type: 'CASH' }),
    ] });
    expect(by.get('s1')).toEqual({ closing: 600, owed: 600, advance: 0 });
  });

  it('takes off debit notes and money paid on account, as the ledger does', () => {
    const data = {
      purchases: [bill({ id: 'p1', supplier_id: 's1', total_amount: 1000, paid_amount: 0 })],
      purchaseReturns: [{ id: 'r1', supplier_id: 's1', date: '2026-11-05', total_amount: 150 }],
      supplierPayments: [
        { id: 'pay1', supplier_id: 's1', date: '2026-11-06', amount: 200 },                 // on account
        { id: 'pay2', supplier_id: 's1', date: '2026-11-06', amount: 999, deleted_at: 'x' }, // spent advance
      ],
    };
    expect(owedBySupplier(suppliers, data).get('s1')).toEqual({ closing: 650, owed: 650, advance: 0 });
    const l = supplierLedgerFor(suppliers[0], data);
    expect(l.closing).toBe(650);
    expect(l.rows[l.rows.length - 1].balance).toBe(650);
    expect(l.onAccountPayments.map((p) => p.id)).toEqual(['pay1']);
  });

  it('a later payment against a bill is counted once', () => {
    const by = owedBySupplier(suppliers, {
      purchases: [bill({ id: 'p1', supplier_id: 's1', total_amount: 1000, paid_amount: 300 })],
      supplierPayments: [{ id: 'pay1', supplier_id: 's1', date: '2026-11-04', amount: 300, purchase_id: 'p1' }],
    });
    expect(by.get('s1').owed).toBe(700);
  });

  it('a balance below zero is an advance, not owed', () => {
    const by = owedBySupplier(suppliers, {
      purchases: [bill({ id: 'p1', supplier_id: 's1', total_amount: 100, paid_amount: 0 })],
      supplierPayments: [{ id: 'pay1', supplier_id: 's1', date: '2026-11-04', amount: 400 }],
    });
    expect(by.get('s1')).toEqual({ closing: -300, owed: 0, advance: 300 });
    expect(owedFromClosing(null)).toEqual({ closing: 0, owed: 0, advance: 0 });
  });

  it('matches older rows by supplier name, and reads total_cost when there is no total_amount', () => {
    const by = owedBySupplier(suppliers, { purchases: [bill({ id: 'p9', supplier_name: 'Supplier Two', total_cost: 250 })] });
    expect(by.get('s2').owed).toBe(250);
  });

  it('summary: total, count and the largest first', () => {
    const s = supplierOwedSummary(suppliers, { purchases: [
      bill({ id: 'a', supplier_id: 's1', total_amount: 100 }),
      bill({ id: 'b', supplier_id: 's2', total_amount: 900, paid_amount: 100 }),
      bill({ id: 'c', supplier_id: 's3', total_amount: 50, paid_amount: 50 }),
    ] });
    expect(s.total).toBe(900);
    expect(s.count).toBe(2);
    expect(s.owing.map((o) => [o.id, o.owed])).toEqual([['s2', 800], ['s1', 100]]);
  });

  it('nobody owed is zero, not an error', () => {
    expect(supplierOwedSummary([], {})).toEqual({ total: 0, advance: 0, count: 0, owing: [] });
    expect(supplierLedgerFor(null).closing).toBe(0);
  });
});
