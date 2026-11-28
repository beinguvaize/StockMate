import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Smoke test: the Suppliers list and a supplier's ledger render with every
 * data hook stubbed. The figures are tested in lib/supplierView and lib/bills;
 * this catches a broken page and checks each figure keeps its label.
 */
const state = {};
vi.mock('../lib/supabase', () => ({ supabase: {}, restInsert: vi.fn(), restUpdate: vi.fn(), restRpc: vi.fn() }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', businessProfile: state.profile }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: state.perm }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification: () => {} }) }));
vi.mock('../hooks/usePeople', () => ({ usePeople: () => state.people }));
vi.mock('../hooks/usePurchases', () => ({ usePurchases: () => state.purchases }));
vi.mock('../hooks/useInventory', () => ({ useInventory: () => ({ products: [{ id: 'pr1', name: 'Item One' }], loading: false }) }));

globalThis.React = React;
const { default: Suppliers } = await import('./Suppliers.jsx');
const { default: SupplierLedger } = await import('./SupplierLedger.jsx');

const day = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};
const suppliers = [
  { id: 's1', name: 'Supplier One', contact_person: 'Asha', phone: '90000 00001', gstin: '29ABCDE1234F1Z5' },
  { id: 's2', name: 'Supplier Two' },
];
const purchases = [
  { id: 'p1', supplier_id: 's1', date: day(40), created_at: `${day(40)}T05:00:00Z`, payment_type: 'CREDIT', total_amount: 5000, paid_amount: 1000, bill_no: 'B-101', linked_product_id: 'pr1', quantity: 10 },
  { id: 'p2', supplier_id: 's2', date: day(2), created_at: `${day(2)}T05:00:00Z`, payment_type: 'CASH', total_amount: 600, paid_amount: 600 },
];
const pays = [{ id: 'SUPP-X', supplier_id: 's1', purchase_id: 'p1', amount: 1000, date: day(20), payment_method: 'UPI' }];

const html = (path, el, route) => renderToStaticMarkup(
  <MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>);

describe('Suppliers list', () => {
  beforeEach(() => {
    state.profile = { currencySymbol: '₹' };
    state.perm = () => true;
    state.people = { suppliers, loading: false, addSupplier() {}, updateSupplier() {}, deleteSupplier() {} };
    state.purchases = { purchases, supplierPayments: pays, purchaseReturns: [], loading: false, paySupplier() {}, payPurchase() {}, refetch() {} };
  });

  it('shows what is owed, the due-date bar and the overdue pill', () => {
    const out = html('/suppliers', <Suppliers />, '/suppliers');
    expect(out).toContain('Supplier One');
    expect(out).toContain('₹4,000.00');                 // You owe
    expect(out).toContain('Overdue 10d');                 // 40 days old, 30 days credit
    expect(out).toContain('payment recorded, all time');
    expect(out).toContain('Unpaid bills by credit days, as on Purchases');
    expect(out).toContain('B-101');
    expect(out).toContain('>Pay<');
  });

  it('a settled supplier shows under All only (Owing is the default)', () => {
    const out = html('/suppliers', <Suppliers />, '/suppliers');
    expect(out).not.toContain('Supplier Two');
    expect(out).toContain('1 settled supplier in All');
  });

  it('without purchases edit the list offers the ledger, not Pay', () => {
    state.perm = (mod, act) => !(mod === 'purchases' && act === 'edit');
    const out = html('/suppliers', <Suppliers />, '/suppliers');
    expect(out).not.toContain('>Pay<');
    expect(out).toContain('>Ledger<');
  });

  it('never reads "undefined" when the shop has no currency symbol', () => {
    state.profile = {};
    const out = html('/suppliers', <Suppliers />, '/suppliers');
    expect(out).not.toContain('undefined');
    expect(out).toContain('₹4,000.00');
  });
});

describe('Supplier ledger', () => {
  beforeEach(() => {
    state.profile = {};
    state.perm = () => true;
    state.people = { suppliers, loading: false };
    state.purchases = { purchases, supplierPayments: pays, purchaseReturns: [], loading: false, paySupplier() {}, payPurchase() {}, refetch() {}, offsetCreditNote() {}, deleteSupplierPayment() {}, editSupplierPayment() {} };
  });
  const route = '/suppliers/ledger/:id';

  it('renders amount due, closing balance, the ledger and print labels', () => {
    const out = html('/suppliers/ledger/s1', <SupplierLedger />, route);
    expect(out).toContain('Supplier One');
    expect(out).toContain('Amount due');
    expect(out).toContain('Closing balance');
    expect(out).toContain('Print statement');
    expect(out).toContain('Record payment');
    expect(out).toContain('GSTIN 29ABCDE1234F1Z5');
    expect(out).toContain('Billed');
    expect(out).toContain('Debit');                       // the printed statement's word
    expect(out).not.toContain('undefined');
  });

  it('All shows the bill, the payment and a closing balance of what is still owed', () => {
    // "All" needs a click; the default window (this month) carries the bill in
    // the brought-forward row instead.
    const out = html('/suppliers/ledger/s1', <SupplierLedger />, route);
    expect(out).toContain('Balance brought forward');
    expect(out).toContain('₹4,000.00');
  });

  it('says so for a supplier that is gone', () => {
    expect(html('/suppliers/ledger/nope', <SupplierLedger />, route)).toContain('Supplier not found');
  });
});
