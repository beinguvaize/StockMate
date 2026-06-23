import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

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
    const row = {
      id: genId('ACC'), tenant_id: tenantId,
      name: a.name, type: a.type || 'BANK',
      bank_name: a.bank_name || null, account_no: a.account_no || null, ifsc: a.ifsc || null,
      opening_balance: Number(a.opening_balance) || 0, is_default: !!a.is_default,
    };
    const { error } = await supabase.from('accounts').insert(row);
    if (!error) await fetchAll();
    return { error };
  };

  const updateAccount = async (id, patch) => {
    const { error } = await supabase.from('accounts')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchAll();
    return { error };
  };

  const removeAccount = async (id) => {
    const { error } = await supabase.from('accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchAll();
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
    const { error } = await supabase.from('account_transactions').insert(row);
    if (!error) await fetchAll();
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
    const { error } = await supabase.from('account_transactions').insert([out, inn]);
    if (!error) await fetchAll();
    return { error };
  };

  return { accounts, txns, balances, loading, refetch: fetchAll, createAccount, updateAccount, removeAccount, addTxn, transfer };
}
