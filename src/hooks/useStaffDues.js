import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { staffDues, totalPending, monthWindow } from '../lib/staffDues';
import { todayISOInAppTZ } from '../lib/utils';
import useRefetchOnFocus from './useRefetchOnFocus';

/**
 * What staff are still owed for the current month, for screens that are not
 * the Payroll page (the Dashboard).
 *
 * Reads this month's attendance and the saved pay runs and hands them to the
 * same calculation the Payroll page uses. `ready` is false until both reads
 * have succeeded: a caller must show nothing rather than a 0 it cannot stand
 * behind.
 */
export const useStaffDues = (tenantId, employees) => {
  const month = todayISOInAppTZ().slice(0, 7);
  const [data, setData] = useState(null);   // { attendance, records } once read
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const win = monthWindow(month);
    if (!tenantId || !win) return;
    const [att, runs] = await Promise.all([
      // One month of marks: bounded by the dates, and by 31 days x the staff.
      supabase.from('attendance')
        .select('employee_id, day, status, custom_rate')
        .eq('tenant_id', tenantId).is('deleted_at', null)
        .gte('day', win.from).lte('day', win.to).limit(5000),
      // Newest runs first. Only runs touching this month matter, and a shop
      // would need more than 500 runs in a month to push one out of this window.
      supabase.from('payroll')
        .select('id, period, items, processed_at')
        .eq('tenant_id', tenantId).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(500),
    ]);
    const failed = att.error || runs.error;
    if (failed) {
      console.error('useStaffDues:', failed);
      setError(failed);
      setData(null);
      return;
    }
    const attendance = {};
    for (const row of att.data || []) {
      (attendance[row.employee_id] ||= {})[String(row.day).slice(0, 10)] =
        { status: row.status, custom_rate: row.custom_rate ?? null };
    }
    setError(null);
    setData({ attendance, records: runs.data || [] });
  }, [tenantId, month]);

  useEffect(() => { setData(null); load(); }, [load]);
  useRefetchOnFocus(load);

  const rows = useMemo(
    () => (data ? staffDues({ employees: employees || [], attendance: data.attendance, records: data.records, month }) : []),
    [data, employees, month]);

  return { rows, total: totalPending(rows), ready: !!data, error, month, refetch: load };
};

export default useStaffDues;
