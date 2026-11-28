import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Smoke test: the Clients list, the client account page and Collect Payments
 * render with every data hook stubbed. The rules are tested in
 * lib/clientView; this catches a broken page before a shopkeeper does.
 */
const state = {};

// A query builder that answers every chained call and resolves to no rows.
const chain = () => {
  const q = new Proxy({}, {
    get: (_, k) => (k === 'then' ? (res) => Promise.resolve({ data: [], error: null }).then(res) : () => q),
  });
  return q;
};
vi.mock('../lib/supabase', () => ({ supabase: { from: () => chain(), auth: { getSession: async () => ({ data: {} }) } } }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', businessProfile: { businessName: 'Test shop', currencySymbol: '₹' } }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => state.perm }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification: () => {} }) }));
vi.mock('../hooks/usePeople', () => ({ usePeople: () => state.people }));
vi.mock('../hooks/useSales', () => ({ useSales: () => state.sales }));

globalThis.React = React;
const { default: Clients } = await import('./Clients.jsx');
const { default: ClientSettlement } = await import('./ClientSettlement.jsx');
const { default: CashCollection } = await import('./CashCollection.jsx');

const clients = [
  { id: 'c1', name: 'Shop One', contact: 'Person A', phone: '9000000001', outstanding_balance: 1200, credit_limit: 5000, credit_days: 30 },
  { id: 'c2', name: 'Shop Two', phone: '9000000002', outstanding_balance: 0 },
];
const sales = [
  { id: 'S-1', shopId: 'c1', date: '2026-09-01', totalAmount: 1000, paidAmount: 0, paymentMethod: 'CREDIT', paymentStatus: 'UNPAID' },
  { id: 'S-2', shopId: 'c1', date: '2026-11-20', totalAmount: 400, paidAmount: 200, paymentMethod: 'CREDIT', paymentStatus: 'PARTIAL' },
];
const people = (over = {}) => ({
  clients, loading: false, error: null, refetch() {}, addClient() {}, updateClient() {}, deleteClient() {},
  recordClientPayment() {}, editClientPayment() {}, deleteClientPayment() {}, ...over,
});
const html = (path, el, route) => renderToStaticMarkup(
  <MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>);

describe('Clients pages', () => {
  beforeEach(() => {
    state.perm = true;
    state.people = people();
    state.sales = { sales, invoices: [], loading: false, refetch() {} };
  });

  it('lists owing clients with today\'s figures and an Add client button', () => {
    const out = html('/clients', <Clients />, '/clients');
    expect(out).toContain('Owed to you');
    expect(out).toContain('₹1,200');
    expect(out).toContain('Shop One');
    expect(out).not.toContain('Shop Two'); // Owing is the default filter
    expect(out).toContain('Add client');
    expect(out).toContain('whole balance of 1 client with a bill 30+ days old');
  });

  it('hides Add client without the create permission', () => {
    state.perm = false;
    expect(html('/clients', <Clients />, '/clients')).not.toContain('Add client');
  });

  it('shows the empty state for a shop with no clients', () => {
    state.people = people({ clients: [] });
    expect(html('/clients', <Clients />, '/clients')).toContain('No clients yet');
  });

  it('renders the account page with the summary and Record a payment', () => {
    const out = html('/clients/settle/c1', <ClientSettlement />, '/clients/settle/:id');
    expect(out).toContain('Shop One');
    expect(out).toContain('Record a payment');
    expect(out).toContain('Customer since');
    expect(out).toContain('Sep 2026');
    expect(out).toContain('Net 30 · limit ₹5,000');
  });

  it('says so when the account page cannot find the client', () => {
    expect(html('/clients/settle/zz', <ClientSettlement />, '/clients/settle/:id')).toContain('Client not found');
  });

  it('renders Collect Payments with the owing clients only', () => {
    const out = html('/clients/collect', <CashCollection />, '/clients/collect');
    expect(out).toContain('Outstanding · 1');
    expect(out).toContain('Shop One');
    expect(out).not.toContain('Shop Two');
  });

  it('refuses Collect Payments without the edit permission', () => {
    state.perm = false;
    expect(html('/clients/collect', <CashCollection />, '/clients/collect')).toContain('No access to collecting payments');
  });
});
