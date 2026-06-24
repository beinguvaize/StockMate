import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, restInsert, restUpdate } from '../lib/supabase';

// Reducing-balance EMI for a loan. r = monthly rate. Returns rounded EMI.
export const emiOf = (principal, annualRatePct, months) => {
  const P = Number(principal) || 0, n = Number(months) || 0;
  const r = (Number(annualRatePct) || 0) / 12 / 100;
  if (P <= 0 || n <= 0) return 0;
  if (r === 0) return Math.round(P / n);
  const f = Math.pow(1 + r, n);
  return Math.round((P * r * f) / (f - 1));
};

// Replay paid EMIs on a loan to get outstanding + interest/principal paid.
export const loanStats = (acc, paidCount) => {
  const P = Number(acc.loan_principal) || 0;
  const r = (Number(acc.loan_rate) || 0) / 12 / 100;
  const n = Number(acc.loan_tenure_months) || 0;
  const emi = Number(acc.loan_emi) || emiOf(P, acc.loan_rate, n);
  let bal = P, interestPaid = 0, principalPaid = 0;
  for (let i = 0; i < Math.min(paidCount, n); i++) {
    const interest = bal * r;
    const principal = Math.min(emi - interest, bal);
    bal -= principal; interestPaid += interest; principalPaid += principal;
  }
  return { emi, outstanding: Math.max(0, Math.round(bal)), interestPaid: Math.round(interestPaid), principalPaid: Math.round(principalPaid), paid: Math.min(paidCount, n), total: n };
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
    const { error } = await restUpdate('accounts', { ...patch, updated_at: new Date().toISOString() }, { id, tenant_id: tenantId });
    if (!error) fetchAll();
    return { error };
  };

  const removeAccount = async (id) => {
    const { error } = await restUpdate('accounts', { deleted_at: new Date().toISOString() }, { id, tenant_id: tenantId });
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

  // Count of EMIs already paid per loan account (LOAN_EMI ledger entries).
  const emiPaidCount = useMemo(() => {
    const m = {};
    txns.forEach((x) => { if (x.ref_type === 'LOAN_EMI' && x.ref_id) m[x.ref_id] = (m[x.ref_id] || 0) + 1; });
    return m;
  }, [txns]);

  // Pay one EMI: money OUT of a funding account, logged against the loan.
  const payEMI = async ({ loan, fromAccountId, date }) => {
    const st = loanStats(loan, emiPaidCount[loan.id] || 0);
    if (st.outstanding <= 0) return { error: new Error('Loan already cleared') };
    const interest = Math.round((st.outstanding) * ((Number(loan.loan_rate) || 0) / 12 / 100));
    const principal = Math.min(st.emi - interest, st.outstanding);
    const d = date || new Date().toISOString().slice(0, 10);
    const row = {
      id: genId('ATX'), tenant_id: tenantId, account_id: fromAccountId, date: d,
      direction: 'OUT', amount: st.emi, mode: 'BANK', ref_type: 'LOAN_EMI', ref_id: loan.id,
      note: `EMI · ${loan.name} (int ₹${interest} + prin ₹${Math.round(principal)})`,
    };
    const { error } = await restInsert('account_transactions', row);
    if (!error) fetchAll();
    return { error };
  };

  return { accounts, txns, balances, loading, refetch: fetchAll, createAccount, updateAccount, removeAccount, addTxn, transfer, emiPaidCount, payEMI };
}
