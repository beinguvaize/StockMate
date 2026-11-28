import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { detectAdvances } from '../lib/staffAdvances';

/**
 * Does this database have staff advances? null while asking, then true/false.
 * One cheap read per session (lib/staffAdvances.detectAdvances).
 */
export function useAdvancesAvailable() {
  const [on, setOn] = useState(null);
  useEffect(() => {
    let alive = true;
    detectAdvances(supabase).then((v) => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, []);
  return on;
}

/**
 * One employee's advances: the balance, each advance's status and every
 * movement. Reads only the server's views (staff_advance_balances,
 * staff_advance_status, staff_advance_entries); writes only through the
 * server functions. Nothing is added up here.
 *
 * `enabled` false (no advances on this database) reads nothing.
 */
export function useStaffAdvances({ tenantId, employeeId, enabled }) {
  const [state, setState] = useState({ balance: null, advances: [], entries: [], loaded: false, error: null });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!enabled || !tenantId || !employeeId) return undefined;
    let alive = true;
    (async () => {
      const [bal, st, en] = await Promise.all([
        supabase.from('staff_advance_balances').select('*').eq('tenant_id', tenantId).eq('employee_id', employeeId).maybeSingle(),
        supabase.from('staff_advance_status').select('*').eq('tenant_id', tenantId).eq('employee_id', employeeId)
          .order('given_on', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('staff_advance_entries').select('*').eq('tenant_id', tenantId).eq('employee_id', employeeId)
          .is('deleted_at', null).order('on_date', { ascending: true }).order('created_at', { ascending: true }).limit(1000),
      ]);
      if (!alive) return;
      const error = bal.error || st.error || en.error;
      if (error) {
        console.error('[advances] read failed:', error);
        setState((s) => ({ ...s, loaded: true, error }));
        return;
      }
      setState({ balance: bal.data || null, advances: st.data || [], entries: en.data || [], loaded: true, error: null });
    })();
    return () => { alive = false; };
  }, [enabled, tenantId, employeeId, version]);

  const call = useCallback(async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) { console.error(`[advances] ${fn} failed:`, error); return { success: false, error }; }
    reload();
    return { success: true, data, replayed: !!data?.replayed };
  }, [reload]);

  /** give_staff_advance. `id` is made once per dialog and reused on retry. */
  const give = useCallback((a) => call('give_staff_advance', {
    p_tenant_id: tenantId, p_id: a.id, p_employee_id: employeeId, p_amount: a.amount, p_account_id: a.accountId,
    p_given_on: a.givenOn, p_recovery_per_run: a.recoveryPerRun, p_note: a.note || null,
  }), [call, tenantId, employeeId]);

  const update = useCallback((a) => call('update_staff_advance', {
    p_tenant_id: tenantId, p_id: a.id, p_amount: a.amount, p_account_id: a.accountId,
    p_given_on: a.givenOn, p_recovery_per_run: a.recoveryPerRun, p_note: a.note || null,
  }), [call, tenantId]);

  const cancel = useCallback((id) => call('cancel_staff_advance', { p_tenant_id: tenantId, p_id: id }), [call, tenantId]);

  /** settle_staff_advance: mode COLLECT (money back into an account) or WRITE_OFF (an expense). `opId` reused on retry. */
  const settle = useCallback((s) => call('settle_staff_advance', {
    p_tenant_id: tenantId, p_op_id: s.opId, p_employee_id: employeeId, p_mode: s.mode,
    p_amount: s.amount, p_account_id: s.mode === 'COLLECT' ? s.accountId : null, p_on: s.on,
  }), [call, tenantId, employeeId]);

  return { ...state, reload, give, update, cancel, settle };
}

export default useStaffAdvances;
