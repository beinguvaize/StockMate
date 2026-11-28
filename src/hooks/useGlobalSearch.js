import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cleanTerm, isSearchable, GROUP_LIMIT } from '../lib/globalSearch';

/**
 * The database half of global search: one small read per kind, debounced.
 *
 * Read-only. Each read is scoped to the tenant explicitly (the RLS policies
 * also read `is_global_admin()`, so relying on RLS alone would let a global
 * admin's search span every shop), leaves out soft-deleted rows, and asks for
 * at most GROUP_LIMIT rows. A kind the user may not open is not asked for at
 * all (`kinds`).
 *
 * Returns { term, pending, byType } where byType[kind] = { rows, error }.
 * A failed read is logged and returned as an error for that kind, never as
 * an empty list.
 */
const DEBOUNCE_MS = 250;

const QUERIES = {
  product: (tid, s) => supabase.from('products')
    .select('id, name, sku, barcode')
    .eq('tenant_id', tid).is('deleted_at', null)
    .or(`name.ilike.%${s}%,sku.ilike.%${s}%,barcode.ilike.%${s}%`)
    .order('name').limit(GROUP_LIMIT),
  client: (tid, s) => supabase.from('clients')
    .select('id, name, phone, outstanding_balance')
    .eq('tenant_id', tid).is('deleted_at', null)
    .or(`name.ilike.%${s}%,phone.ilike.%${s}%`)
    .order('name').limit(GROUP_LIMIT),
  supplier: (tid, s) => supabase.from('suppliers')
    .select('id, name, phone')
    .eq('tenant_id', tid).is('deleted_at', null)
    .or(`name.ilike.%${s}%,phone.ilike.%${s}%`)
    .order('name').limit(GROUP_LIMIT),
  sale: (tid, s) => supabase.from('sales')
    .select('id, "customerInfo", "totalAmount", date, created_at, voided_at')
    .eq('tenant_id', tid).is('deleted_at', null)
    .or(`id.ilike.%${s}%,customerInfo->>name.ilike.%${s}%`)
    .order('created_at', { ascending: false }).limit(GROUP_LIMIT),
  invoice: (tid, s) => supabase.from('invoices')
    .select('id, invoice_number, client_name, grand_total, invoice_date, date')
    .eq('tenant_id', tid).is('deleted_at', null)
    .or(`invoice_number.ilike.%${s}%,client_name.ilike.%${s}%`)
    .order('created_at', { ascending: false }).limit(GROUP_LIMIT),
};

export function useGlobalSearch(query, { tenantId, kinds = [], enabled = true } = {}) {
  const [state, setState] = useState({ term: '', pending: false, byType: {} });
  const seq = useRef(0);
  const kindsKey = kinds.join(',');

  useEffect(() => {
    const term = cleanTerm(query);
    const wanted = kindsKey ? kindsKey.split(',').filter(k => QUERIES[k]) : [];
    if (!enabled || !tenantId || !isSearchable(term) || wanted.length === 0) {
      seq.current += 1;
      setState({ term, pending: false, byType: {} });
      return undefined;
    }
    const mine = ++seq.current;
    setState(prev => ({ ...prev, term, pending: true }));
    const timer = setTimeout(async () => {
      const results = await Promise.all(wanted.map(async (kind) => {
        try {
          const { data, error } = await QUERIES[kind](tenantId, term);
          if (error) throw error;
          return [kind, { rows: data || [], error: null }];
        } catch (err) {
          console.error(`[search] ${kind} read failed:`, err?.message || err, err);
          return [kind, { rows: [], error: err?.message || 'Read failed' }];
        }
      }));
      if (mine !== seq.current) return;   // a newer search has started
      setState({ term, pending: false, byType: Object.fromEntries(results) });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, tenantId, kindsKey, enabled]);

  return state;
}

export default useGlobalSearch;
