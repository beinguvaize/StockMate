import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Smoke test for the Inventory redesign (approved inventory-01, -10, -15):
 * the list renders with its tabs, strip, chips, groups and rows; the item
 * form renders all four sections; the price lists tab renders its breaks.
 * Data hooks are stubbed; nothing is written.
 */
const PRODUCTS = [
  { id: 'p1', name: 'Test Rice 1 kg', sku: 'RICE-1', category: 'Staples', stock: 30, costPrice: 50, sellingPrice: 60, unit: 'PCS', lowStockThreshold: 10 },
  { id: 'p2', name: 'Test Salt 1 kg', sku: 'SALT-1', category: 'Staples', stock: 3, costPrice: 20, sellingPrice: 22, unit: 'PCS', lowStockThreshold: 10 },
  { id: 'p3', name: 'Test Oil 1 L', sku: 'OIL-1', category: 'Oil', stock: 0, costPrice: 100, sellingPrice: 120, unit: 'PCS' },
];
const PRICES = [{ product_id: 'p1', tier: 'WHOLESALE', min_qty: 10, price: 55 }];

// A query chain that resolves to no rows, whatever is called on it.
const chain = () => {
  const q = new Proxy(function () {}, {
    get: (_, k) => (k === 'then' ? (res) => Promise.resolve({ data: [], error: null }).then(res) : () => q),
    apply: () => q,
  });
  return q;
};
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => chain(), rpc: () => chain() }, uploadProductImage: async () => ({}), listTenantProductImages: async () => [] }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ currentUser: { id: 'U1' }, isOwner: true }) }));
vi.mock('../../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 'T1', businessProfile: { currencySymbol: '₹' }, businessType: 'RETAIL', isModuleOn: () => false }) }));
vi.mock('../../hooks/useInventory', () => ({
  useInventory: () => ({
    products: PRODUCTS, productCategories: [], inventoryBalances: [], inventoryLocations: [{ id: 'L1', name: 'Main' }],
    loading: false, refetch: () => {}, addProduct: async () => ({}), updateProduct: async () => ({}), deleteProduct: async () => ({}),
    adjustStock: async () => ({}), transferStock: async () => ({}),
  }),
}));
vi.mock('../../hooks/useOrders', () => ({ useOrders: () => ({ priceLists: PRICES, upsertPrice: async () => ({ success: true }), deletePrice: async () => ({ success: true }) }) }));

globalThis.React = React;
const { default: Inventory } = await import('./index.jsx');
const { default: AddItemModal } = await import('./components/AddItemModal.jsx');
const { default: PriceListsTab } = await import('./components/PriceListsTab.jsx');

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('inventory renders', () => {
  it('shows the tabs, the strip, the chips and the grouped rows', () => {
    const t = text(renderToStaticMarkup(<MemoryRouter><Inventory /></MemoryRouter>));
    for (const s of ['Products', 'Stock history', 'Price lists', 'Bulk import', 'Add product',
      'Stock value at cost', 'Retail value', 'Low stock', 'Out of stock', '1 in, 1 low, 1 out',
      'Category', 'Staples', 'Oil', 'Test Rice 1 kg', 'RICE-1', 'Showing 3 of 3 products']) {
      expect(t).toContain(s);
    }
    // Only one location, so no transfer (as before).
    expect(t).not.toContain('Transfer stock');
    // Margin on the selling price in the table: (60 - 50) / 60.
    expect(t).toContain('16.7%');
  });

  it('the item form has its four sections and the summary', () => {
    const t = text(renderToStaticMarkup(
      <AddItemModal isOpen onClose={() => {}} onSave={async () => ({})} editingProduct={null}
        productCategories={[]} tenantId="T1" existingBarcodes={new Set()} />,
    ));
    for (const s of ['Add Product', 'Details', 'Pricing and Units', 'Tax', 'Photo', 'Track IMEI or serial per unit',
      'Price tiers', 'Minimum margin, %', 'Tax status', 'GST slab', 'HSN code', 'Save product', 'Ctrl Enter saves']) {
      expect(t).toContain(s);
    }
  });

  it('edit says so', () => {
    const t = text(renderToStaticMarkup(
      <AddItemModal isOpen onClose={() => {}} onSave={async () => ({})} editingProduct={PRODUCTS[0]}
        productCategories={[]} tenantId="T1" existingBarcodes={new Set()} />,
    ));
    expect(t).toContain('Edit Product');
    expect(t).toContain('Save changes');
  });

  it('price lists show the tier and its products', () => {
    const t = text(renderToStaticMarkup(
      <PriceListsTab products={PRODUCTS} priceLists={PRICES} onUpsert={async () => ({})} onDelete={async () => ({})} />,
    ));
    expect(t).toContain('Wholesale · 1 product');
    expect(t).toContain('Test Rice 1 kg');
    expect(t).toContain('1 break');
    expect(t).toContain('Add price break');
  });
});
