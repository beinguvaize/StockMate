/**
 * Budget repository — Supabase-backed budget plan storage.
 *
 * Replaces the earlier `utils/budgetStorage.js` localStorage layer.
 *
 * Every query here passes tenant_id EXPLICITLY. RLS alone is not enough: the
 * budgets policies read `tenant_id = current_tenant_id() OR is_global_admin()`,
 * so a global admin is entitled to every tenant's rows. Relying on the policy
 * meant fetchBudget() merged all tenants into one category-keyed map, and the
 * delete branch of upsertBudgetLine() removed a category's line for EVERY
 * tenant at once.
 *
 * The column default on budgets.tenant_id is a placeholder uuid that matches no
 * real tenant, so writes that omitted tenant_id landed on a phantom tenant and
 * were invisible to the shop that entered them.
 *
 * Schema (public.budgets):
 *   id         text        (uuid default)
 *   tenant_id  uuid        (passed explicitly — see note below)
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
export const fetchBudget = async (tenantId, period) => {
  if (!tenantId) return {};
  const { data, error } = await supabase
    .from('budgets')
    .select('id, category, amount, type')
    .eq('tenant_id', tenantId)
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
export const upsertBudgetLine = async (tenantId, period, category, amount, type = 'EXPENSE') => {
  if (!tenantId) return false;
  const num = Number(amount);

  if (!Number.isFinite(num) || num <= 0) {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('period', period)
      .eq('category', category);
    if (error) console.warn('[budgetRepo] delete failed', error);
    return !error;
  }

  // tenant_id is written explicitly. The column default is a placeholder uuid
  // belonging to no tenant, so omitting it silently orphaned the row.
  const { error } = await supabase
    .from('budgets')
    .upsert(
      { tenant_id: tenantId, period, category, amount: num, type, updated_at: new Date().toISOString() },
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
export const copyBudget = async (tenantId, fromPeriod, toPeriod) => {
  if (!tenantId) return false;
  const src = await fetchBudget(tenantId, fromPeriod);
  const rows = Object.entries(src).map(([category, v]) => ({
    tenant_id: tenantId,
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
export const bulkUpsertBudget = async (tenantId, period, entries) => {
  if (!tenantId) return false;
  // entries: Array<{ category, amount, type }>
  const rows = entries
    .filter((e) => Number(e.amount) > 0)
    .map((e) => ({
      tenant_id: tenantId,
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
