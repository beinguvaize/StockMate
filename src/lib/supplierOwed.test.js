import { describe, it, expect } from 'vitest';
import { owedBySupplier, supplierOwedSummary } from './supplierOwed';

const suppliers = [{ id: 's1', name: 'Supplier One' }, { id: 's2', name: 'Supplier Two' }, { id: 's3', name: 'Supplier Three' }];

describe('supplier owed (the Suppliers list figure)', () => {
  it('sums each bill still due, floored at zero', () => {
    const by = owedBySupplier(suppliers, [
      { supplier_id: 's1', total_amount: 1000, paid_amount: 400 },
      { supplier_id: 's1', total_amount: 500, paid_amount: 500 },
    ]);
    expect(by.get('s1')).toEqual({ payable: 600, advance: 0, owed: 600 });
  });

  it('an overpaid bill is money with the supplier and is netted off', () => {
    const by = owedBySupplier(suppliers, [
      { supplier_id: 's1', total_amount: 1000, paid_amount: 0 },
      { supplier_id: 's1', total_amount: 300, paid_amount: 600 },
    ]);
    expect(by.get('s1')).toEqual({ payable: 1000, advance: 300, owed: 700 });
  });

  it('matches older rows by supplier name, and reads total_cost when there is no total_amount', () => {
    const by = owedBySupplier(suppliers, [{ supplier_name: 'Supplier Two', total_cost: 250 }]);
    expect(by.get('s2').owed).toBe(250);
  });

  it('summary: total, count and the largest first', () => {
    const s = supplierOwedSummary(suppliers, [
      { supplier_id: 's1', total_amount: 100 },
      { supplier_id: 's2', total_amount: 900, paid_amount: 100 },
      { supplier_id: 's3', total_amount: 50, paid_amount: 50 },
    ]);
    expect(s.total).toBe(900);
    expect(s.count).toBe(2);
    expect(s.owing.map(o => [o.id, o.owed])).toEqual([['s2', 800], ['s1', 100]]);
  });

  it('nobody owed is zero, not an error', () => {
    expect(supplierOwedSummary([], [])).toEqual({ total: 0, advance: 0, count: 0, owing: [] });
  });
});
