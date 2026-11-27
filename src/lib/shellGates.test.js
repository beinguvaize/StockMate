import { describe, it, expect } from 'vitest';
import { shellGates, lowStockBadge, openItem } from './shellGates';
import { posStoresFrom, currentStoreOf, readPosStore } from './posStore';

const items = (over = {}) => ['dashboard', 'sales', 'invoices', 'inventory', 'clients', 'suppliers', 'reports']
  .map(key => ({ key, path: `/${key}`, label: key, ...(over[key] || {}) }));

describe('shellGates', () => {
  it('follows the menu item gates', () => {
    const all = shellGates(items(), () => true);
    expect(all).toMatchObject({ kpis: true, lowStock: true, collect: true, sell: true });
    expect(all.search).toEqual({ product: true, client: true, supplier: true, sale: true, invoice: true });

    const g = shellGates(items({ inventory: { hidden: true }, invoices: { locked: true } }), () => true);
    expect(g.lowStock).toBe(false);
    expect(g.search.product).toBe(false);
    expect(g.search.invoice).toBe(false);
    expect(g.notify.inventory).toBe(false);
  });

  it('collect payment needs the right to record client payments', () => {
    const can = (m, a) => !(m === 'clients' && a === 'edit');
    expect(shellGates(items(), can).collect).toBe(false);
    expect(shellGates(items({ clients: { hidden: true } }), () => true).collect).toBe(false);
  });

  it('dashboard figures are read only for someone who may see the dashboard', () => {
    const noDash = shellGates(items(), (m) => m !== 'dashboard');
    expect(noDash.kpis).toBe(false);
    expect(noDash.lowStock).toBe(false);
    expect(noDash.notify.clients).toBe(false);
    expect(shellGates(items({ dashboard: { hidden: true } }), () => true).kpis).toBe(false);
  });

  it('openItem ignores hidden and locked items', () => {
    expect(openItem(items({ sales: { locked: true } }), 'sales')).toBeNull();
    expect(openItem(items(), 'sales')).toMatchObject({ key: 'sales' });
    expect(openItem(null, 'sales')).toBeNull();
  });
});

describe('lowStockBadge', () => {
  it('shows the Dashboard figure, and nothing for zero or unknown', () => {
    expect(lowStockBadge({ low_stock_items: 47 })).toBe('47');
    expect(lowStockBadge({ low_stock_items: '12' })).toBe('12');
    expect(lowStockBadge({ low_stock_items: 4000 })).toBe('999+');
    expect(lowStockBadge({ low_stock_items: 0 })).toBeNull();
    expect(lowStockBadge({ low_stock_items: null })).toBeNull();
    expect(lowStockBadge({})).toBeNull();
    expect(lowStockBadge(null)).toBeNull();
  });
});

describe('posStore', () => {
  const locs = [
    { id: 'a', name: 'Main', type: 'BRANCH' }, { id: 'v', name: 'Van', type: 'VEHICLE' },
    { id: 'b', name: 'Godown' }, { id: 'c', name: 'Old', deleted_at: 'x' },
  ];
  it('lists the stores the Sales screen lists', () => {
    expect(posStoresFrom(locs).map(s => s.id)).toEqual(['a', 'b']);
  });
  it('falls back to the first store as the Sales screen does', () => {
    const stores = posStoresFrom(locs);
    expect(currentStoreOf(stores, 'b').id).toBe('b');
    expect(currentStoreOf(stores, 'gone').id).toBe('a');
    expect(currentStoreOf([], 'a')).toBeNull();
  });
  it('reads nothing from storage that throws', () => {
    expect(readPosStore({ getItem: () => { throw new Error('x'); } })).toBe('');
  });
});
