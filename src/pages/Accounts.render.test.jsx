import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Smoke test: the Cash and Bank page renders its states with the accounts
 * hook stubbed. The rules are tested in lib/accountsView.
 */
const state = {};
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) }, restInsert: vi.fn(), restUpdate: vi.fn() }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1' }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification() {} }) }));
vi.mock('../hooks/useAccounts', async (orig) => ({ ...(await orig()), useAccounts: () => state.hook }));

globalThis.React = React;
const { default: Accounts } = await import('./Accounts.jsx');

const hook = (over = {}) => ({
  accounts: [
    { id: 'C', type: 'CASH', name: 'Cash in hand', is_default: true },
    { id: 'B1', type: 'BANK', name: 'Current account', bank_name: 'Sample Bank', account_no: '000011114521', is_default: true },
    { id: 'B2', type: 'BANK', name: 'Savings account' },
    { id: 'U1', type: 'UPI', name: 'Shop UPI', upi_id: 'shop@upi', linked_bank_account_id: 'B1' },
    { id: 'L', type: 'LOAN', name: 'Shop loan', loan_principal: 250000, loan_rate: 12, loan_tenure_months: 36 },
  ],
  txns: [], balances: { C: 24380, B1: 88600, B2: 13400, U1: 0 }, loading: false, error: null, refetch() {},
  createAccount() {}, updateAccount() {}, removeAccount() {}, setDefaultAccount() {}, addTxn() {}, transfer() {},
  loanPayments: {}, payEMI() {}, ...over,
});
const html = () => renderToStaticMarkup(<Accounts />);

describe('Cash and Bank page', () => {
  beforeEach(() => { state.hook = hook(); });

  it('shows the total and one card per account, UPI folded into its bank', () => {
    const out = html();
    expect(out).toContain('₹1,26,380.00');
    expect(out).toContain('Cash in hand');
    expect(out).toContain('Sample Bank · ••••4521');
    expect(out).toContain('shop@upi');
    expect(out).not.toContain('Shop UPI');
    expect(out).toContain('Set as default');
    expect(out).toContain('Pay EMI ₹8,304.00');
    expect(out).toContain('0/36 paid');
    expect(out).toContain('Transfer');
    expect(out).toContain('Add account');
  });

  it('says there are no accounts yet', () => {
    state.hook = hook({ accounts: [], balances: {} });
    const out = html();
    expect(out).toContain('No accounts yet.');
    expect(out).toContain('₹0.00');
  });

  it('says it could not load, with the reason and a retry', () => {
    state.hook = hook({ accounts: [], balances: {}, error: new Error('Failed to fetch') });
    const out = html();
    expect(out).toContain('Could not load accounts');
    expect(out).toContain('Failed to fetch');
    expect(out).toContain('Try again');
  });
});
