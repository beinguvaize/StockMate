import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Smoke test: the Estimates and Orders pages render their states with every
 * data hook stubbed. The rules are tested in lib/estimateView and
 * lib/orderView; this catches a broken page before a shopkeeper does.
 */
const state = {};
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}), rpc: async () => ({}) } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ currentUser: { id: 'u1' }, hasPermission: () => true }) }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', businessProfile: { currencySymbol: '₹', name: 'Test Shop' } }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification() {} }) }));
vi.mock('../hooks/useInventory', () => ({ useInventory: () => ({ products: [] }) }));
vi.mock('../hooks/usePeople', () => ({ usePeople: () => ({ clients: [] }) }));
vi.mock('../hooks/useEstimates', () => ({ useEstimates: () => state.est }));
vi.mock('../hooks/useOrders', () => ({ useOrders: () => state.ord }));
vi.mock('../hooks/useSales', () => ({ useSales: () => ({ invoices: state.invoices, refetch() {} }) }));

globalThis.React = React;
const { default: Estimates } = await import('./Estimates.jsx');
const { default: Orders } = await import('./Orders.jsx');

const noop = async () => ({ error: null });
const est = (over = {}) => ({ estimates: [], loading: false, refetch() {}, create: noop, update: noop, setStatus: noop, remove: noop, ...over });
const ord = (over = {}) => ({ orders: [], priceLists: [], loading: false, refetch() {}, createOrder: noop, updateOrder: noop, advanceStatus: noop, deleteOrder: noop, ...over });
const render = (Page, path) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Page /></MemoryRouter>);

describe('Estimates page', () => {
  beforeEach(() => { state.est = est(); });

  it('lists estimates with type, status, validity and the strip', () => {
    state.est = est({ estimates: [
      { id: 'a', estimate_number: 'EST-2026-0017', client_name: 'Client A', status: 'SENT', grand_total: 28038, valid_until: '2099-12-05', estimate_date: '2026-11-25' },
      { id: 'b', estimate_number: 'MB-X1', client_name: 'Client B', status: 'ACCEPTED', grand_total: 2950, doc_type: 'MANUAL_INVOICE' },
      { id: 'c', estimate_number: 'EST-2026-0014', client_name: 'Client C', status: 'CONVERTED', grand_total: 9615 },
    ] });
    const out = render(Estimates, '/estimates');
    expect(out).toContain('EST-2026-0017');
    expect(out).toContain('Waiting for an answer');
    expect(out).toContain('₹28,038');
    expect(out).toContain('1 to bill · 1 is a manual bill');
    expect(out).toContain('Manual bill');
    expect(out).toContain('Billed');
    expect(out).toContain('Valid until 5 Dec 2099');
    expect(out).toContain('3 of 3 shown · newest first');
  });

  it('shows the empty state', () => {
    const out = render(Estimates, '/estimates');
    expect(out).toContain('No estimates yet');
    expect(out).toContain('New estimate');
  });
});

describe('Orders page', () => {
  beforeEach(() => { state.ord = ord(); state.invoices = []; });

  it('lists orders and invoices in the pipeline with their actions', () => {
    state.ord = ord({ orders: [
      { id: 'o1', order_number: 'SO-0024', client_name: 'Client A', status: 'CONFIRMED', order_type: 'B2B', price_tier: 'WHOLESALE', grand_total: 26800, items: [{ productName: 'Rice', qty: 4, unitPrice: 2150, total: 8600 }], created_at: '2026-11-26T05:00:00Z' },
      { id: 'o2', order_number: 'SO-0021', client_name: 'Client B', status: 'DELIVERED', order_type: 'B2B', price_tier: 'RETAIL', grand_total: 14380, items: [], created_at: '2026-11-25T05:00:00Z' },
      { id: 'o3', order_number: 'SO-0019', client_name: 'Client C', status: 'CANCELLED', grand_total: 1850, items: [], created_at: '2026-11-20T05:00:00Z' },
    ] });
    state.invoices = [{ id: 'INV-1', invoice_number: 'INV-0141', client_name: 'Client D', grand_total: 5240, created_at: '2026-11-26T04:00:00Z' }];
    const out = render(Orders, '/orders');
    expect(out).toContain('SO-0024');
    expect(out).toContain('INV-0141');
    expect(out).toContain('Wholesale');
    expect(out).toContain('Dispatched');
    expect(out).toContain('₹ Convert to sale');
    expect(out).toContain('View invoice');
    expect(out).toContain('Open pipeline');
    expect(out).toContain('₹46,420');
    expect(out).toContain('Cancelled');
    expect(out).toContain('4 orders · newest first');
  });

  it('shows the empty state', () => {
    const out = render(Orders, '/orders');
    expect(out).toContain('No open orders');
    expect(out).toContain('Create first order');
  });
});
