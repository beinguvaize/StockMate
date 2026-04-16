/**
 * Budget repository — Supabase-backed budget plan storage.
 *
 * Replaces the earlier `utils/budgetStorage.js` localStorage layer.
 * All writes go through Supabase with tenant RLS enforcement; realtime
 * subscriptions give us live updates across devices and users.
 *
 * Schema (public.budgets):
 *   id         text        (uuid default)
 *   tenant_id  uuid        (RLS-enforced)
 *   period     text        'YYYY-MM'
 *   category   text
 *   amount     numeric(14,2)
 *   type       'REVENUE' | 'EXPENSE'
 *   unique (tenant_id, period, category)
 */

import { supabase } from './supabase';

/**
 * Fetch the full budget for a period.
 * @returns {Promise<Record<string, { amount:number, type:'REVENUE'|'EXPENSE', id:string }>>}
 */
export const fetchBudget = async (period) => {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, category, amount, type')
    .eq('period', period);

  if (error) {
    console.warn('[budgetRepo] fetch failed', error);
    return {};
  }
  const map = {};
  (data || []).forEach((row) => {
    map[row.category] = {
      id: row.id,
      amount: Number(row.amount) || 0,
      type: row.type,
    };
  });
  return map;
};

/**
 * Upsert a single budget line. Zero / falsy amount deletes the row.
 * Relies on the (tenant_id, period, category) unique index.
 */
export const upsertBudgetLine = async (period, category, amount, type = 'EXPENSE') => {
  const num = Number(amount);

  if (!Number.isFinite(num) || num <= 0) {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('period', period)
      .eq('category', category);
    if (error) console.warn('[budgetRepo] delete failed', error);
    return !error;
  }

  // Upsert on the unique (tenant_id, period, category) — tenant_id is filled
  // by the column default (or the RLS policy's WITH CHECK will reject it).
  const { error } = await supabase
    .from('budgets')
    .upsert(
      { period, category, amount: num, type, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id,period,category' }
    );

  if (error) {
    console.warn('[budgetRepo] upsert failed', error);
    return false;
  }
  return true;
};

/**
 * Copy every budget line from one period to another. Overwrites the target
 * period's existing lines for the same categories.
 */
export const copyBudget = async (fromPeriod, toPeriod) => {
  const src = await fetchBudget(fromPeriod);
  const rows = Object.entries(src).map(([category, v]) => ({
    period: toPeriod,
    category,
    amount: v.amount,
    type: v.type,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return true;

  const { error } = await supabase
    .from('budgets')
    .upsert(rows, { onConflict: 'tenant_id,period,category' });

  if (error) {
    console.warn('[budgetRepo] copy failed', error);
    return false;
  }
  return true;
};

/**
 * Bulk upsert — used by "Suggest from 3-mo average" and the one-time
 * localStorage → Supabase migration.
 */
export const bulkUpsertBudget = async (period, entries) => {
  // entries: Array<{ category, amount, type }>
  const rows = entries
    .filter((e) => Number(e.amount) > 0)
    .map((e) => ({
      period,
      category: e.category,
      amount: Number(e.amount),
      type: e.type || 'EXPENSE',
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return true;

  const { error } = await supabase
    .from('budgets')
    .upsert(rows, { onConflict: 'tenant_id,period,category' });

  if (error) {
    console.warn('[budgetRepo] bulk upsert failed', error);
    return false;
  }
  return true;
};

/* ------------------------------------------------------------------ *
 * Pure helpers (no I/O) — re-exported from the old module so callers
 * can switch to budgetRepo without pulling in two files.
 * ------------------------------------------------------------------ */

export const recentPeriods = (n = 12, now = new Date()) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    out.push(`${yyyy}-${mm}`);
  }
  return out;
};

export const periodLabel = (period) => {
  if (!period) return '';
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
};
