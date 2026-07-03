import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, restInsert, restUpdate } from '../lib/supabase';

// Resolve which account a payment lands in.
// Pass an account ID directly (from dynamic POS buttons) → returns it as-is
// after resolving UPI linked_bank_account_id. Pass a method string (CASH/UPI/
// BANK/CARD) → picks the first matching account, then default, then first.
export const accountForMethod = (accounts = [], methodOrId = 'CASH') => {
  const live = accounts.filter((a) => !a.deleted_at && a.type !== 'LOAN');
  // Direct account ID passed — resolve UPI→linked bank, else return as-is.
  const byId = live.find((a) => a.id === methodOrId);
  if (byId) return byId.linked_bank_account_id || byId.id;
  // Method string path.
  const want = { CASH: 'CASH', UPI: 'UPI', CARD: 'BANK', BANK: 'BANK' }[String(methodOrId || '').toUpperCase()] || 'CASH';
  const acc = live.find((a) => a.type === want) || live.find((a) => a.is_default) || live[0] || null;
  if (!acc) return '';
  return acc.linked_bank_account_id || acc.id;
};

// Build dynamic POS payment method buttons from accounts.
// Returns [{key, label, type, icon?}] ordered CASH → UPI → BANK → CARD,
// plus CREDIT appended by caller. Each key = account.id for precise routing.
export const buildPaymentMethods = (accounts = []) => {
  const live = accounts.filter((a) => !a.deleted_at && !['LOAN'].includes(a.type));
  const order = ['CASH', 'UPI', 'BANK', 'CARD'];
  return order.flatMap((t) =>
    live.filter((a) => a.type === t).map((a) => ({ key: a.id, label: a.name, type: t, upi_id: a.upi_id || null }))
  );
};

// Reducing-balance EMI for a loan. r = monthly rate. Returns rounded EMI.
export const emiOf = (principal, annualRatePct, months) => {
  const P = Number(principal) || 0, n = Number(months) || 0;
  const r = (Number(annualRatePct) || 0) / 12 / 100;
  if (P <= 0 || n <= 0) return 0;
  if (r === 0) return Math.round(P / n);
  const f = Math.pow(1 + r, n);
  return Math.round((P * r * f) / (f - 1));
};

// Replay actual repayments (each with its own amount, supports custom/prepay)
// to get outstanding + interest/principal split. `payments` = [{amount,...}]
// oldest-first. Returns per-payment interest/principal too (for history).
export const loanStats = (acc, payments = []) => {
  const P = Number(acc.loan_principal) || 0;
  const r = (Number(acc.loan_rate) || 0) / 12 / 100;
  const n = Number(acc.loan_tenure_months) || 0;
  const emi = Number(acc.loan_emi) || emiOf(P, acc.loan_rate, n);
  let bal = P, interestPaid = 0, principalPaid = 0;
  const rows = payments.map((p) => {
    const interest = Math.round(bal * r);
    const principal = Math.min(Math.round(Number(p.amount) || 0) - interest, Math.round(bal));
    bal -= principal; interestPaid += interest; principalPaid += principal;
    return { ...p, interest, principal: Math.max(0, principal), balanceAfter: Math.max(0, Math.round(bal)) };
  });
  return { emi, outstanding: Math.max(0, Math.round(bal)), interestPaid, principalPaid, paid: payments.length, total: n, rows };
};

// Bank & Cash accounts + their ledger. Mirrors the lightweight hook style
// used by useEstimates (direct supabase, tenant passed in). Balance is derived
// from the transaction ledger so it can never drift from opening + flows.
const genId = (p) => `${p}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e3)}`;

export function useAccounts(tenantId) {
  const [accounts, setAccounts] = useState([]);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);
    const [{ data: acc }, { data: tx }] = await Promise.all([
      supabase.from('accounts').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('created_at'),
      supabase.from('account_transactions').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }),
    ]);
    setAccounts(acc || []);
    setTxns(tx || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Derived balance per account = opening + Σ IN − Σ OUT.
  const balances = useMemo(() => {
    const map = {};
    accounts.forEach((a) => { map[a.id] = Number(a.opening_balance) || 0; });
    txns.forEach((t) => {
      if (map[t.account_id] === undefined) return;
      map[t.account_id] += (t.direction === 'IN' ? 1 : -1) * (Number(t.amount) || 0);
    });
    return map;
  }, [accounts, txns]);

  const createAccount = async (a) => {
    const isLoan = (a.type || 'BANK') === 'LOAN';
    const row = {
      id: genId('ACC'), tenant_id: tenantId,
      name: a.name, type: a.type || 'BANK',
      bank_name: a.bank_name || null, account_no: a.account_no || null, ifsc: a.ifsc || null,
      upi_id: a.upi_id || null,
      linked_bank_account_id: a.linked_bank_account_id || null,
      opening_balance: Number(a.opening_balance) || 0, is_default: !!a.is_default,
      lender: a.lender || null,
      loan_principal: isLoan ? Number(a.loan_principal) || 0 : null,
      loan_rate: isLoan ? Number(a.loan_rate) || 0 : null,
      loan_tenure_months: isLoan ? Number(a.loan_tenure_months) || 0 : null,
      loan_start: isLoan ? (a.loan_start || new Date().toISOString().slice(0, 10)) : null,
      loan_emi: isLoan ? emiOf(a.loan_principal, a.loan_rate, a.loan_tenure_months) : null,
    };
    const { error } = await restInsert('accounts', row);
    if (!error) fetchAll();
    return { error };
  };

  const updateAccount = async (id, patch) => {
    const row = { ...patch, updated_at: new Date().toISOString() };
    if ('linked_bank_account_id' in row) row.linked_bank_account_id = row.linked_bank_account_id || null;
    const { error } = await restUpdate('accounts', row, { id, tenant_id: tenantId });
    if (!error) fetchAll();
    return { error };
  };

  const removeAccount = async (id) => {
    const { error } = await restUpdate('accounts', { deleted_at: new Date().toISOString() }, { id, tenant_id: tenantId });
    if (!error) fetchAll();
    return { error };
  };

  // Mark one account as default for its type; clears is_default on siblings first.
  const setDefaultAccount = async (id) => {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return { error: new Error('Account not found') };
    // Clear default on all same-type accounts in this tenant
    await supabase.from('accounts')
      .update({ is_default: false })
      .eq('tenant_id', tenantId)
      .eq('type', acc.type)
      .is('deleted_at', null);
    const { error } = await restUpdate('accounts', { is_default: true }, { id, tenant_id: tenantId });
    if (!error) fetchAll();
    return { error };
  };

  // Manual ledger entry (money in / out, not tied to a sale).
  const addTxn = async (t) => {
    const row = {
      id: genId('ATX'), tenant_id: tenantId, account_id: t.account_id,
      date: t.date || new Date().toISOString().slice(0, 10),
      direction: t.direction, amount: Number(t.amount) || 0,
      mode: t.mode || null, ref_type: t.ref_type || 'MANUAL', ref_id: t.ref_id || null,
      counter_account_id: t.counter_account_id || null, note: t.note || null,
    };
    const { error } = await restInsert('account_transactions', row);
    if (!error) fetchAll();
    return { error };
  };

  // Transfer = OUT of source + IN to destination, linked by counter_account_id.
  const transfer = async ({ from, to, amount, date, note }) => {
    if (from === to) return { error: new Error('Pick two different accounts') };
    const amt = Number(amount) || 0;
    if (amt <= 0) return { error: new Error('Enter an amount') };
    const d = date || new Date().toISOString().slice(0, 10);
    const out = { id: genId('ATX'), tenant_id: tenantId, account_id: from, date: d, direction: 'OUT', amount: amt, ref_type: 'TRANSFER', counter_account_id: to, note: note || 'Transfer out' };
    const inn = { id: genId('ATX'), tenant_id: tenantId, account_id: to,   date: d, direction: 'IN',  amount: amt, ref_type: 'TRANSFER', counter_account_id: from, note: note || 'Transfer in' };
    const { error } = await restInsert('account_transactions', [out, inn]);
    if (!error) fetchAll();
    return { error };
  };

  // Repayments per loan account (LOAN_EMI ledger entries), oldest-first.
  const loanPayments = useMemo(() => {
    const m = {};
    txns.filter((x) => x.ref_type === 'LOAN_EMI' && x.ref_id)
      .forEach((x) => { (m[x.ref_id] = m[x.ref_id] || []).push(x); });
    Object.values(m).forEach((arr) => arr.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id))));
    return m;
  }, [txns]);

  // Record a loan repayment — fixed EMI or a custom amount (part/prepay).
  const payEMI = async ({ loan, fromAccountId, date, amount, mode = 'BANK' }) => {
    const st = loanStats(loan, loanPayments[loan.id] || []);
    if (st.outstanding <= 0) return { error: new Error('Loan already cleared') };
    const amt = Math.min(Math.round(Number(amount) || st.emi), st.outstanding + Math.round(st.outstanding * ((Number(loan.loan_rate) || 0) / 12 / 100)));
    if (amt <= 0) return { error: new Error('Enter an amount') };
    const interest = Math.round(st.outstanding * ((Number(loan.loan_rate) || 0) / 12 / 100));
    const principal = Math.max(0, amt - interest);
    const d = date || new Date().toISOString().slice(0, 10);
    const row = {
      id: genId('ATX'), tenant_id: tenantId, account_id: fromAccountId, date: d,
      direction: 'OUT', amount: amt, mode, ref_type: 'LOAN_EMI', ref_id: loan.id,
      note: `Loan payment · ${loan.name} (int ₹${interest} + prin ₹${principal})`,
    };
    const { error } = await restInsert('account_transactions', row);
    if (error) return { error };
    // Book the interest portion as a finance-cost expense so it shows in P&L.
    // (Principal is a balance-sheet loan reduction, not an expense. The cash
    // already left via the ledger entry above, so this expense is NOT routed
    // to an account again.)
    if (interest > 0) {
      await restInsert('expenses', {
        id: genId('EXP'), tenant_id: tenantId, note: `Loan interest · ${loan.name}`,
        amount: interest, category: 'Interest', date: d, payment_method: mode,
        created_at: new Date().toISOString(),
      });
    }
    fetchAll();
    return { error: null };
  };

  return { accounts, txns, balances, loading, refetch: fetchAll, createAccount, updateAccount, removeAccount, setDefaultAccount, addTxn, transfer, loanPayments, payEMI };
}
