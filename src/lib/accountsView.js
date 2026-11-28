/**
 * Cash and Bank (web redesign, approved mockups accounts-01 to 13): what the
 * account cards, the ledger and the dialogs show.
 *
 * Display only. Nothing here writes. Balances are useAccounts' own
 * (opening + IN - OUT over account_transactions); loan figures are
 * useAccounts.loanStats. The rules below are today's Accounts page rules,
 * moved here unchanged so they can be tested:
 *   · a UPI account linked to a bank is folded into that bank's card, its
 *     balance and its ledger, and is not shown on its own;
 *   · the total is every account's balance, linked UPI included, once;
 *   · the Pay EMI preview splits interest at one month on the outstanding.
 */

const num = (v) => Number(v) || 0;

export const ACCOUNT_TYPES = [
  { id: 'CASH', label: 'Cash' },
  { id: 'BANK', label: 'Bank' },
  { id: 'UPI', label: 'UPI' },
  { id: 'CARD', label: 'Card' },
  { id: 'LOAN', label: 'Loan' },
];

/** ₹1,26,380.00: rupees and paise, Indian grouping, as the page has always shown. */
export const inr = (n, sym = '₹') =>
  `${sym}${num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const isLinkedUpi = (a) => !!a && a.type === 'UPI' && !!a.linked_bank_account_id;

/** The cards: every account except UPI handles folded into a bank. */
export const visibleAccounts = (accounts = []) => accounts.filter((a) => !isLinkedUpi(a));

/** { bankId: ['shop@upi', …] } for the handle pills on a bank card. */
export const upiHandlesFor = (accounts = []) => {
  const map = {};
  accounts.filter(isLinkedUpi).forEach((u) => {
    (map[u.linked_bank_account_id] = map[u.linked_bank_account_id] || []).push(u.upi_id || u.name);
  });
  return map;
};

/** An account's own balance plus any linked UPI account's, so a pre-link balance never vanishes. */
export const mergedBalance = (id, accounts = [], balances = {}) =>
  num(balances[id]) + accounts.filter((u) => isLinkedUpi(u) && u.linked_bank_account_id === id)
    .reduce((s, u) => s + num(balances[u.id]), 0);

export const totalBalance = (accounts = [], balances = {}) =>
  accounts.reduce((s, a) => s + num(balances[a.id]), 0);

/** Ids of the UPI accounts folded into this bank. */
export const linkedUpiIds = (accounts = [], bankId) =>
  bankId ? accounts.filter((u) => isLinkedUpi(u) && u.linked_bank_account_id === bankId).map((u) => u.id) : [];

export const LEDGER_FILTERS = [['ALL', 'All'], ['UPI', 'UPI only'], ['DIRECT', 'Bank/other']];

/**
 * The ledger of one card: its own entries and those of any UPI account folded
 * into it, newest first as fetched. Each row carries `isUpi` (paid by UPI, or
 * posted to a folded UPI account). `filter` is ALL | UPI | DIRECT.
 */
export const ledgerRows = (txns = [], accountId, linkedIds = [], filter = 'ALL') => {
  if (!accountId) return [];
  const rows = txns
    .filter((t) => t.account_id === accountId || linkedIds.includes(t.account_id))
    .map((t) => ({ ...t, isUpi: t.mode === 'UPI' || linkedIds.includes(t.account_id) }));
  if (filter === 'UPI') return rows.filter((t) => t.isUpi);
  if (filter === 'DIRECT') return rows.filter((t) => !t.isUpi);
  return rows;
};

/** "••••4521" for a card. An account number of 4 characters or fewer shows as is. */
export const maskAccountNo = (no) => {
  const s = String(no || '').trim();
  if (!s) return '';
  return s.length > 4 ? `••••${s.slice(-4)}` : s;
};

/** "City Co-operative Bank · ••••4521", or the UPI handle of a UPI account. */
export const accountSubline = (a) => {
  if (!a) return '';
  if (a.bank_name) return [a.bank_name, maskAccountNo(a.account_no)].filter(Boolean).join(' · ');
  return a.upi_id || '';
};

/**
 * Pay EMI preview, today's rule unchanged: interest = one month on the
 * outstanding, principal = the rest of the amount; foreclose = outstanding +
 * that interest. A preview only: useAccounts.payEMI does its own sums.
 */
export const emiPreview = (loan, stats, amount) => {
  const amt = num(amount);
  const interest = Math.round(num(stats?.outstanding) * (num(loan?.loan_rate) / 12 / 100));
  const principal = Math.max(0, Math.round(amt) - interest);
  return { amount: amt, interest, principal, foreclose: num(stats?.outstanding) + interest };
};

/** The account a loan payment comes from by default: the first bank, else the first account. */
export const defaultPayFrom = (accounts = []) =>
  accounts.find((a) => a.type === 'BANK')?.id || accounts[0]?.id || '';

/** Bank accounts a UPI handle can settle to (not itself, not deleted). */
export const settleBanks = (accounts = [], selfId) =>
  accounts.filter((a) => a.type === 'BANK' && !a.deleted_at && a.id !== selfId);

export const canTransfer = (f) => num(f?.amount) > 0 && !!f?.from && f.from !== f.to;
export const canSaveEntry = (f) => num(f?.amount) > 0;
