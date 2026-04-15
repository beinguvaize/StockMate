/**
 * One-time migration: drain legacy localStorage budgets into Supabase.
 *
 * Before we had a `budgets` table, `utils/budgetStorage.js` persisted budget
 * plans to localStorage under keys of the shape:
 *
 *   ledgr_budget:{tenantId}:{YYYY-MM}  →  { [category]: { amount, type } }
 *
 * This helper lifts those rows into the Supabase table once, then removes
 * the localStorage entries so the key space stays clean (and BUG-006 —
 * sensitive data in localStorage — no longer applies to budget data).
 *
 * Idempotent: after migration a sentinel key is set so the drain only
 * runs once per browser.
 */

import { supabase } from './supabase';

const KEY_PREFIX = 'ledgr_budget:';
const SENTINEL_KEY = 'ledgr_budget_migrated_v1';

/**
 * Run the drain. Returns the number of rows moved.
 */
export const migrateLocalBudgetsOnce = async () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 0;
    if (localStorage.getItem(SENTINEL_KEY)) return 0;

    // Collect all legacy keys
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) keys.push(k);
    }
    if (keys.length === 0) {
      localStorage.setItem(SENTINEL_KEY, '1');
      return 0;
    }

    const rows = [];
    keys.forEach((k) => {
      try {
        // key shape: ledgr_budget:{tenantId}:{YYYY-MM}
        const parts = k.split(':');
        if (parts.length < 3) return;
        const period = parts[parts.length - 1];
        const raw = localStorage.getItem(k);
        if (!raw) return;
        const payload = JSON.parse(raw);
        if (!payload || typeof payload !== 'object') return;

        Object.entries(payload).forEach(([category, v]) => {
          const amount = Number(v?.amount);
          if (!Number.isFinite(amount) || amount <= 0) return;
          rows.push({
            period,
            category,
            amount,
            type: v?.type === 'REVENUE' ? 'REVENUE' : 'EXPENSE',
          });
        });
      } catch (e) {
        console.warn('[budgetMigration] bad key, skipping', k, e);
      }
    });

    if (rows.length === 0) {
      keys.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(SENTINEL_KEY, '1');
      return 0;
    }

    // tenant_id is filled by the column default / RLS WITH CHECK
    const { error } = await supabase
      .from('budgets')
      .upsert(rows, { onConflict: 'tenant_id,period,category' });

    if (error) {
      console.warn('[budgetMigration] upload failed — leaving localStorage intact', error);
      return 0;
    }

    // Success → clear the legacy keys + set sentinel
    keys.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(SENTINEL_KEY, '1');
    return rows.length;
  } catch (e) {
    console.warn('[budgetMigration] unexpected error', e);
    return 0;
  }
};
