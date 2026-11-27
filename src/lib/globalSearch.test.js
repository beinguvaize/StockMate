import { describe, it, expect } from 'vitest';
import {
  cleanTerm, isSearchable, matchScore, rankRows, pageResults, toResult, RANK_FIELDS,
  buildGroups, flatten, moveActive, destinationFor, paletteState, isPaletteShortcut, shortcutLabel,
} from './globalSearch';

describe('cleanTerm', () => {
  it('drops what would break a PostgREST or() filter', () => {
    expect(cleanTerm('rice, (5kg)')).toBe('rice 5kg');
    expect(cleanTerm('50% off*')).toBe('50 off');
    expect(cleanTerm('a"b\'c\\d:e')).toBe('a b c d e');
  });
  it('trims, collapses spaces and caps length', () => {
    expect(cleanTerm('   amul    butter  ')).toBe('amul butter');
    expect(cleanTerm('x'.repeat(100))).toHaveLength(60);
    expect(cleanTerm(null)).toBe('');
  });
  it('needs two characters before it searches', () => {
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable(' ,a, ')).toBe(false);
    expect(isSearchable('am')).toBe(true);
  });
});

describe('matchScore', () => {
  it('ranks exact > prefix > word start > contains > none', () => {
    expect(matchScore('Rice', 'rice')).toBe(4);
    expect(matchScore('Rice 5kg', 'ric')).toBe(3);
    expect(matchScore('Basmati Rice', 'ric')).toBe(2);
    expect(matchScore('Licorice', 'ric')).toBe(1);
    expect(matchScore('Sugar', 'ric')).toBe(0);
    expect(matchScore(null, 'x')).toBe(0);
  });
});

describe('rankRows', () => {
  it('sorts best match first, then by name, and keeps unmatched rows last', () => {
    const rows = [
      { name: 'Licorice' }, { name: 'Rice' }, { name: 'Basmati Rice' }, { name: 'Zed', barcode: '890' }, { name: 'Rice Bran' },
    ];
    const out = rankRows(rows, 'rice', RANK_FIELDS.product).map(r => r.name);
    expect(out).toEqual(['Rice', 'Rice Bran', 'Basmati Rice', 'Licorice', 'Zed']);
  });
  it('matches a product on SKU or barcode', () => {
    const rows = [{ name: 'A', sku: 'X1' }, { name: 'B', barcode: '8901' }];
    expect(rankRows(rows, '8901', RANK_FIELDS.product)[0].name).toBe('B');
  });
});

describe('pageResults', () => {
  const items = [
    { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
    { key: 'payroll', label: 'Payroll', path: '/payroll' },
    { key: 'purchases', label: 'Purchases', path: '/purchases' },
    { key: 'reports', label: 'Reports', path: '/reports', locked: true },
    { key: 'settings', label: 'Settings', path: '/settings', hidden: true },
  ];
  it('offers only pages the menu would open', () => {
    const all = pageResults(items, '').map(r => r.label);
    expect(all).toEqual(['Dashboard', 'Payroll', 'Purchases']);
    expect(pageResults(items, 'rep')).toEqual([]);
    expect(pageResults(items, 'sett')).toEqual([]);
  });
  it('words the result as a jump and ranks it', () => {
    const r = pageResults(items, 'pa');
    expect(r[0]).toMatchObject({ type: 'page', title: 'Go to Payroll', path: '/payroll' });
    expect(r.map(x => x.label)).toEqual(['Payroll']);
  });
});

describe('toResult', () => {
  const fmt = { money: (n) => `₹${n}`, date: (d) => `d(${d})` };
  it('describes each kind in plain words', () => {
    expect(toResult('product', { id: 'p1', name: 'Rice', sku: 'R1', barcode: '89' }, fmt))
      .toMatchObject({ id: 'product:p1', title: 'Rice', sub: 'SKU R1 · Barcode 89' });
    expect(toResult('client', { id: 'c1', name: 'Anand', phone: '98', outstanding_balance: 400 }, fmt).sub)
      .toBe('98 · Owes ₹400');
    expect(toResult('client', { id: 'c2', name: 'B', outstanding_balance: 0 }, fmt).sub).toBe('');
    expect(toResult('sale', { id: 'SAL-1', customerInfo: null, totalAmount: 90, created_at: 't', voided_at: 'x' }, fmt))
      .toMatchObject({ title: 'Bill SAL-1', sub: 'Walk-in · d(t) · ₹90 · Voided' });
    expect(toResult('invoice', { id: 'i1', invoice_number: 'INV-7', client_name: 'Anand', grand_total: 5, invoice_date: '2026-11-22' }, fmt))
      .toMatchObject({ title: 'Invoice INV-7', sub: 'Anand · d(2026-11-22) · ₹5' });
  });
});

describe('grouping and keys', () => {
  it('keeps the display order and leaves empty groups out, but keeps failed ones', () => {
    const groups = buildGroups({
      invoice: { items: [{ id: 'i' }] },
      client: { items: [], error: 'boom' },
      product: { items: [{ id: 'p' }] },
      supplier: { items: [] },
    });
    expect(groups.map(g => g.key)).toEqual(['product', 'client', 'invoice']);
    expect(groups[1]).toMatchObject({ label: 'Clients', error: 'boom' });
    expect(flatten(groups).map(i => i.id)).toEqual(['p', 'i']);
  });
  it('wraps the highlight at both ends', () => {
    expect(moveActive(-1, 1, 3)).toBe(0);
    expect(moveActive(-1, -1, 3)).toBe(2);
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, -1, 3)).toBe(2);
    expect(moveActive(0, 1, 0)).toBe(-1);
  });
});

describe('destinationFor', () => {
  it('opens each record where the app can show it', () => {
    expect(destinationFor({ type: 'page', path: '/payroll' })).toBe('/payroll');
    expect(destinationFor({ type: 'client', recordId: 'c 1' }, '/shop')).toBe('/shop/clients/settle/c%201');
    expect(destinationFor({ type: 'supplier', recordId: 's1' })).toBe('/suppliers/ledger/s1');
    expect(destinationFor({ type: 'product', recordId: 'p1' })).toBe('/inventory');
    expect(destinationFor({ type: 'sale', recordId: 'x' })).toBe('/sales');
    expect(destinationFor({ type: 'invoice', recordId: 'x' })).toBe('/invoices');
    expect(destinationFor(null)).toBeNull();
  });
});

describe('paletteState', () => {
  const g = (items, error = null) => ({ key: 'product', items, error });
  it('never calls a failed read "nothing found"', () => {
    expect(paletteState({ query: 'ri', groups: [g([], 'down')], pending: false })).toBe('error');
    expect(paletteState({ query: 'ri', groups: [], pending: false })).toBe('empty');
    expect(paletteState({ query: 'ri', groups: [], pending: true })).toBe('loading');
    expect(paletteState({ query: 'ri', groups: [g([{ id: 1 }]), g([], 'down')], pending: false })).toBe('results');
  });
  it('shows pages with nothing typed', () => {
    expect(paletteState({ query: '', groups: [{ key: 'page', items: [{ id: 'x' }] }] })).toBe('results');
    expect(paletteState({ query: 'a', groups: [] })).toBe('short');
  });
});

describe('the shortcut', () => {
  it('is Ctrl K or Cmd K and nothing else', () => {
    expect(isPaletteShortcut({ key: 'k', ctrlKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: 'K', metaKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: 'k' })).toBe(false);
    expect(isPaletteShortcut({ key: 'k', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isPaletteShortcut({ key: 'k', ctrlKey: true, altKey: true })).toBe(false);
    expect(isPaletteShortcut({ key: 'Enter', ctrlKey: true })).toBe(false);
  });
  it('labels the hint for the platform', () => {
    expect(shortcutLabel('MacIntel')).toBe('⌘ K');
    expect(shortcutLabel('Win32')).toBe('Ctrl K');
  });
});
