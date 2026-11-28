import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { todayISOInAppTZ } from '../lib/utils';

/**
 * Smoke test: the Expenses page renders its states with every data hook
 * stubbed. The figures are tested in lib/expenseList; this catches a broken
 * page before a shopkeeper does.
 */
const state = {};
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: (p) => state.perms.includes(p) }) }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', businessProfile: { currencySymbol: '₹' } }) }));
vi.mock('../hooks/useInventory', () => ({ useInventory: () => ({ inventoryLocations: [] }) }));
vi.mock('../hooks/useFinance', () => ({ useFinance: () => state.finance }));

globalThis.React = React;
const { default: Expenses } = await import('./Expenses.jsx');

const today = todayISOInAppTZ();
const finance = (over = {}) => ({
  expenses: [
    { id: 'e1', date: today, amount: 600, category: 'Packing material', note: 'Carry bags', payment_method: 'CASH', gst_amount: 91.53, vendor_gstin: 'GSTIN0000000001' },
    { id: 'e2', date: today, amount: 340, category: 'Tea and snacks', note: 'Tea', payment_method: 'CASH', recurring_template_id: 'RET-1' },
    { id: 'e3', date: today, amount: 7500, category: 'Salary', note: 'Pay run', payment_method: 'BANK', payroll_id: 'P1' },
  ],
  loading: false, refetch() {}, addExpense() {}, updateExpense() {}, deleteExpense() {},
  expenseCategories: ['Petrol', 'Other'], recurringTemplates: [], addRecurringTemplate() {}, setRecurringActive() {},
  deleteRecurringTemplate() {}, addExpenseCategory() {}, ...over,
});
const html = () => renderToStaticMarkup(<MemoryRouter initialEntries={['/expenses']}><Expenses /></MemoryRouter>);

describe('Expenses page', () => {
  beforeEach(() => { state.perms = ['ADD_EXPENSE', 'EDIT_EXPENSE', 'DELETE_EXPENSE']; state.finance = finance(); });

  it("shows today's expenses with their figures and tags", () => {
    const out = html();
    expect(out).toContain('Carry bags');
    expect(out).toContain('₹8,440');           // spent
    expect(out).toContain('ITC ₹91.53');
    expect(out).toContain('Repeats');
    expect(out).toContain('Payroll');
    expect(out).toContain('Where it went');
    expect(out).toContain('Last 6 months');
    expect(out).toContain('New expense');
    expect(out).toContain('3 of 3 shown · newest first');
  });

  it('hides New expense and the row menu without the permissions', () => {
    state.perms = [];
    const out = html();
    expect(out).not.toContain('New expense');
    expect(out).not.toContain('Actions for');
  });

  it('shows the empty state when nothing is in the period', () => {
    state.finance = finance({ expenses: [] });
    const out = html();
    expect(out).toContain('No expenses found');
    expect(out).toContain('Log expense');
  });
});
