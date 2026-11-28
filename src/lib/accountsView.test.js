import { describe, it, expect } from 'vitest';
import {
  inr, visibleAccounts, upiHandlesFor, mergedBalance, totalBalance, linkedUpiIds, ledgerRows,
  maskAccountNo, accountSubline, emiPreview, defaultPayFrom, settleBanks, canTransfer, canSaveEntry,
} from './accountsView';

const accounts = [
  { id: 'C', type: 'CASH', name: 'Cash in hand' },
  { id: 'B1', type: 'BANK', name: 'Current account', bank_name: 'Sample Bank', account_no: '000011114521' },
  { id: 'B2', type: 'BANK', name: 'Savings account' },
  { id: 'U1', type: 'UPI', name: 'Shop UPI', upi_id: 'shop@upi', linked_bank_account_id: 'B1' },
  { id: 'U2', type: 'UPI', name: 'Loose UPI', upi_id: 'loose@upi' },
  { id: 'L', type: 'LOAN', name: 'Shop loan' },
];
const balances = { C: 100, B1: 1000, B2: 50, U1: 25, U2: 5, L: 0 };

describe('accountsView', () => {
  it('formats rupees with paise', () => {
    expect(inr(126380)).toBe('₹1,26,380.00');
    expect(inr(null)).toBe('₹0.00');
  });

  it('folds a linked UPI account into its bank card', () => {
    expect(visibleAccounts(accounts).map((a) => a.id)).toEqual(['C', 'B1', 'B2', 'U2', 'L']);
    expect(upiHandlesFor(accounts)).toEqual({ B1: ['shop@upi'] });
    expect(mergedBalance('B1', accounts, balances)).toBe(1025);
    expect(mergedBalance('B2', accounts, balances)).toBe(50);
  });

  it('totals every account once, linked UPI included', () => {
    expect(totalBalance(accounts, balances)).toBe(1180);
    expect(totalBalance([], {})).toBe(0);
  });

  it("builds a bank card's ledger with its folded UPI entries and filters it", () => {
    const txns = [
      { id: 1, account_id: 'B1', mode: 'UPI' },
      { id: 2, account_id: 'B1', mode: 'BANK' },
      { id: 3, account_id: 'U1' },
      { id: 4, account_id: 'C' },
    ];
    const ids = linkedUpiIds(accounts, 'B1');
    expect(ids).toEqual(['U1']);
    expect(ledgerRows(txns, 'B1', ids).map((t) => t.id)).toEqual([1, 2, 3]);
    expect(ledgerRows(txns, 'B1', ids, 'UPI').map((t) => t.id)).toEqual([1, 3]);
    expect(ledgerRows(txns, 'B1', ids, 'DIRECT').map((t) => t.id)).toEqual([2]);
    expect(ledgerRows(txns, null, ids)).toEqual([]);
    expect(linkedUpiIds(accounts, null)).toEqual([]);
  });

  it('masks an account number to its last four', () => {
    expect(maskAccountNo('000011114521')).toBe('••••4521');
    expect(maskAccountNo('4521')).toBe('4521');
    expect(maskAccountNo('')).toBe('');
    expect(accountSubline(accounts[1])).toBe('Sample Bank · ••••4521');
    expect(accountSubline({ upi_id: 'x@upi' })).toBe('x@upi');
    expect(accountSubline({ bank_name: 'Sample Bank' })).toBe('Sample Bank');
  });

  it('previews an EMI split as today (one month of interest on the outstanding)', () => {
    const p = emiPreview({ loan_rate: 12 }, { outstanding: 208132 }, 8304);
    expect(p.interest).toBe(2081);
    expect(p.principal).toBe(6223);
    expect(p.foreclose).toBe(210213);
    expect(emiPreview({ loan_rate: 12 }, { outstanding: 1000 }, 5).principal).toBe(0);
  });

  it('picks the first bank to pay a loan from, else the first account', () => {
    expect(defaultPayFrom(accounts)).toBe('B1');
    expect(defaultPayFrom([{ id: 'C', type: 'CASH' }])).toBe('C');
    expect(defaultPayFrom([])).toBe('');
  });

  it('lists the banks a UPI handle can settle to', () => {
    expect(settleBanks(accounts, 'B2').map((a) => a.id)).toEqual(['B1']);
    expect(settleBanks([...accounts, { id: 'B3', type: 'BANK', deleted_at: 'x' }]).map((a) => a.id)).toEqual(['B1', 'B2']);
  });

  it('allows a transfer only between two accounts with an amount', () => {
    expect(canTransfer({ from: 'C', to: 'B1', amount: '10' })).toBe(true);
    expect(canTransfer({ from: 'C', to: 'C', amount: '10' })).toBe(false);
    expect(canTransfer({ from: 'C', to: 'B1', amount: '0' })).toBe(false);
    expect(canSaveEntry({ amount: '5' })).toBe(true);
    expect(canSaveEntry({ amount: '' })).toBe(false);
  });
});
