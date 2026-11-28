import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Smoke test: the Manufacturing page renders its states with the data hooks
 * stubbed. The figures are tested in lib/manufacturingView.
 */
const state = {};
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) } }));
vi.mock('../context/TenantContext', () => ({
  useTenant: () => ({
    currentTenantId: 't1', businessProfile: { currencySymbol: '₹' },
    t: (k) => state.words[k],
  }),
}));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification() {} }) }));
vi.mock('../hooks/useInventory', () => ({ useInventory: () => ({ products: state.products }) }));
vi.mock('../hooks/useManufacturing', () => ({ useManufacturing: () => state.mfg }));

globalThis.React = React;
const { default: Manufacturing } = await import('./Manufacturing.jsx');

const mfg = (over = {}) => ({
  boms: [{ id: 'b1', finished_product_id: 'fin', output_qty: 1 }],
  bomComponents: [{ id: 'k1', bom_id: 'b1', raw_product_id: 'nut', quantity: 1, unit: 'BASE' }],
  orders: [
    { id: 'o1', finished_product_id: 'fin', status: 'DRAFT', qty_produced: 20, production_date: '2026-11-28' },
    { id: 'o2', finished_product_id: 'fin', status: 'COMPLETED', qty_produced: 100, production_date: '2026-11-26',
      unit_cost: 44.5, material_cost: 4450, other_cost: 0, total_cost: 4450 },
  ],
  orderMaterials: [{ id: 'm1', production_order_id: 'o1', raw_product_id: 'nut', qty_consumed: 20 }],
  orderCosts: [{ id: 'c1', production_order_id: 'o1', cost_type: 'OTHER', label: 'Packing labour', amount: 400 }],
  loading: false, error: null, refetch() {},
  createBom() {}, deleteBom() {}, createProductionOrder() {}, completeOrder() {}, deleteOrder() {}, setProducedQty() {},
  ...over,
});
const html = () => renderToStaticMarkup(<MemoryRouter><Manufacturing /></MemoryRouter>);

describe('Manufacturing page', () => {
  beforeEach(() => {
    state.words = { recipe: 'Bill of Materials', recipes: 'Bills of Materials' };
    state.products = [{ id: 'fin', name: 'Gift box', unit: 'pcs' }, { id: 'nut', name: 'Nuts pack', unit: 'pcs', costPrice: 210, stock: 26 }];
    state.mfg = mfg();
  });

  it('lists draft and completed orders with the server costs', () => {
    const out = html();
    expect(out).toContain('Bill of materials · production · costing');
    expect(out).toContain('New build');
    expect(out).toContain('Production orders');
    expect(out).toContain('20 units planned');
    expect(out).toContain('Draft');
    expect(out).toContain('Edit quantity');
    expect(out).toContain('Complete');
    expect(out).toContain('Packing labour');
    expect(out).toContain('₹44.50');
    expect(out).toContain('₹4,450.00');
    expect(out).toContain('Stock is used only when you press Complete');
    expect(out).toContain('2 production orders · newest first');
  });

  it('uses the restaurant word', () => {
    state.words = { recipe: 'Recipe', recipes: 'Recipes' };
    expect(html()).toContain('Recipes');
  });

  it('shows the empty state', () => {
    state.mfg = mfg({ orders: [] });
    const out = html();
    expect(out).toContain('No production orders yet');
    expect(out).not.toContain('Stock is used only');
  });

  it('shows the loading block, not an empty list, while loading', () => {
    state.mfg = mfg({ loading: true, orders: [] });
    const out = html();
    expect(out).toContain('aria-busy="true"');
    expect(out).not.toContain('No production orders yet');
  });

  it('says when the lists did not load instead of showing them empty', () => {
    state.mfg = mfg({ error: new Error('permission denied'), orders: [] });
    const out = html();
    expect(out).toContain('Couldn&#x27;t load manufacturing. permission denied');
    expect(out).not.toContain('No production orders yet');
  });
});
