import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { todayISOInAppTZ } from '../lib/utils';

/**
 * Smoke test: the Day Book renders its states with every data hook stubbed.
 * The figures are tested in lib/dayBookView; this catches a broken page.
 */
const state = {};
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ lte: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) }) }) } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => state.canEdit, currentUser: { id: 'u1' } }) }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', businessProfile: { currencySymbol: '₹', name: 'Sample Shop' } }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification() {} }) }));
vi.mock('../hooks/useInventory', () => ({ useInventory: () => ({ inventoryLocations: state.stores }) }));
vi.mock('../hooks/useAccounts', () => ({ useAccounts: () => ({ accounts: [], addTxn: async () => ({ error: null }) }), accountForMethod: () => null }));
vi.mock('../hooks/useDayBookData', () => ({ useDayBookData: () => state.data }));

globalThis.React = React;
const { default: DayBook } = await import('./DayBook.jsx');

const today = todayISOInAppTZ();
const data = (over = {}) => {
  const dayBook = over.dayBook || [];
  return {
    sales: [{ id: 's1', date: today, totalAmount: 1240, paidAmount: 1240, paymentStatus: 'PAID', paymentMethod: 'CASH', created_at: `${today}T09:12:00+05:30`, items: [{ name: 'Flour' }] }],
    expenses: [{ id: 'e1', date: today, amount: 340, payment_method: 'CASH', category: 'Tea and snacks', created_at: `${today}T18:55:00+05:30` }],
    clientPayments: [], purchases: [], supplierPayments: [],
    saleReceipts: [{ id: 't1', date: today, direction: 'IN', amount: 1240, mode: 'CASH', ref_type: 'SALE' }],
    dayBook, loading: false, refetch() {}, updateDayBook: async () => ({ error: null }),
    getDayBookForDate: (d) => dayBook.find((r) => r.date === d),
    getPrevDayBook: () => null,
    ...over,
  };
};
const html = () => renderToStaticMarkup(<MemoryRouter><DayBook /></MemoryRouter>);

describe('Day Book page', () => {
  beforeEach(() => { state.canEdit = true; state.stores = []; state.data = data(); });

  it('shows an open day with its figures and the close button', () => {
    state.data = data({ dayBook: [{ id: 'DB-1', date: today, opening_balance: 1000 }] });
    const out = html();
    expect(out).toContain('Transaction Log');
    expect(out).toContain('Sale (Walk-in)');
    expect(out).toContain('+₹1,240.00');
    expect(out).toContain('−₹340.00');
    expect(out).toContain('₹1,900.00');            // 1000 + 1240 − 340
    expect(out).toContain('Close &amp; Lock Day');
    expect(out).toContain('Bank Reconciliation');
    expect(out).not.toContain('Opening not set');
  });

  it('marks a day nobody opened', () => {
    const out = html();
    expect(out).toContain('Opening not set');
    expect(out).not.toContain('Close &amp; Lock Day');
  });

  it('shows a closed day read-only', () => {
    state.data = data({ dayBook: [{ id: 'DB-1', date: today, opening_balance: 1000, is_closed: true, physical_cash: 1900, variance: 0, closed_at: `${today}T16:12:00Z` }] });
    const out = html();
    expect(out).toContain('Day Closed &amp; Locked');
    expect(out).toContain('Counted');
    expect(out).not.toContain('Save Opening Balance');
  });

  it('is view-only without the finance permission', () => {
    state.canEdit = false;
    const out = html();
    expect(out).toContain('View-only');
    expect(out).not.toContain('Save Opening Balance');
  });

  it('offers the store picker only with more than one store', () => {
    expect(html()).not.toContain('All Stores');
    state.stores = [{ id: 'L1', name: 'Main store' }, { id: 'L2', name: 'Branch' }];
    expect(html()).toContain('All Stores');
  });
});
