import { describe, it, expect } from 'vitest';
import { readHandoff, saleIsConversion, markFailedWords } from './convertHandoff';

describe('readHandoff', () => {
  it('maps items to till lines and keeps where they came from', () => {
    const h = readHandoff(JSON.stringify({ estimateId: 'EST-1', clientId: 'C1', items: [{ id: 'P1', name: 'Rice', qty: 4, rate: 2150, taxRate: 5 }] }));
    expect(h.cart).toEqual([{ uid: 'P1', productId: 'P1', name: 'Rice', basePrice: 2150, price: 2150, quantity: 4, taxRate: 5, modifiers: [], modLabel: null }]);
    expect(h.clientId).toBe('C1');
    expect(h.source).toEqual({ kind: 'estimate', id: 'EST-1', productIds: ['P1'] });
  });
  it('an order source', () => {
    const h = readHandoff(JSON.stringify({ orderId: 'O1', items: [{ id: 'P2', qty: 1, rate: 5 }] }));
    expect(h.source).toEqual({ kind: 'order', id: 'O1', productIds: ['P2'] });
    expect(h.clientId).toBeNull();
  });
  it('nothing to hand over', () => {
    expect(readHandoff(null)).toBeNull();
    expect(readHandoff('not json')).toBeNull();
    expect(readHandoff(JSON.stringify({ estimateId: 'E', items: [] }))).toBeNull();
  });
  it('a stash with no source still fills the cart', () => {
    expect(readHandoff(JSON.stringify({ items: [{ id: 'P', qty: 1, rate: 1 }] })).source).toBeNull();
  });
});

describe('saleIsConversion', () => {
  const src = { kind: 'estimate', id: 'E', productIds: ['P1', 'P2'] };
  it('a sale carrying a handed-over product is the conversion', () => {
    expect(saleIsConversion(src, { items: [{ productId: 'P2' }, { productId: 'X' }] })).toBe(true);
  });
  it('another sale rung first (cart held) is not', () => {
    expect(saleIsConversion(src, { items: [{ productId: 'X' }] })).toBe(false);
  });
  it('never on an edit, never without a source', () => {
    expect(saleIsConversion(src, { items: [{ productId: 'P1' }] }, { editing: true })).toBe(false);
    expect(saleIsConversion(null, { items: [{ productId: 'P1' }] })).toBe(false);
  });
});

describe('markFailedWords', () => {
  it('says the sale saved and what did not', () => {
    expect(markFailedWords({ kind: 'estimate' }, 'permission denied')).toBe('Sale saved. The estimate could not be marked Billed: permission denied');
    expect(markFailedWords({ kind: 'order' }, 'Invalid transition')).toContain('could not be moved to Invoiced: Invalid transition');
  });
});
