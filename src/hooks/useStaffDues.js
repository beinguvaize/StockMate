import { useEffect, useMemo, useState } from 'react';
import { usePayRunPreview } from './usePayRunPreview';
import { monthBounds, staffRows, listTotals } from '../lib/payrollView';
import { todayISOInAppTZ } from '../lib/utils';
import useRefetchOnFocus from './useRefetchOnFocus';

/**
 * What staff are still owed for the current month, for screens that are not
 * the Payroll page (the Dashboard).
 *
 * The figure is the `payroll-run` server calculation for the month -- the
 * same request, rows and totals (lib/payrollView.staffRows / listTotals) the
 * Payroll page's "Still to pay" shows -- so the two always agree. Nothing is
 * worked out in the browser. If the server cannot answer, `error` is set and
 * there are no rows and no total: a caller shows that it failed, never a 0 or
 * a figure of its own.
 */
export function staffDuesFromRun({ employees = [], run = null } = {}) {
  if (!run) return { rows: [], total: null };
  const all = staffRows({ employees, run });
  // The Payroll page's total adds up the active rows only (on-leave staff are
  // out of runs until switched in; inactive staff are never in one). The list
  // under the tile is the same rows, so it adds up to the tile.
  const rows = all.filter((r) => r.kind === 'active' && r.line).map((r) => ({
    ...r,
    rate: r.dayRate ? Number(r.line.dailyRate) || 0 : Number(r.line.salary ?? r.employee.salary) || 0,
    daysWorked: r.dayRate ? Number(r.line.daysWorked) || 0 : null,
  }));
  return { rows, total: listTotals(all).stillToPay };
}

export const useStaffDues = (tenantId, employees) => {
  const month = todayISOInAppTZ().slice(0, 7);
  const win = monthBounds(month);
  const [version, setVersion] = useState(0);
  // An edited, added or removed employee changes the server's answer.
  useEffect(() => { setVersion((v) => v + 1); }, [employees]); // eslint-disable-line react-hooks/set-state-in-effect
  const pay = usePayRunPreview({ tenantId, from: win.from, to: win.to, version, enabled: !!tenantId });
  useRefetchOnFocus(pay.reload);

  const run = pay.data?.run || null;
  const { rows, total } = useMemo(() => staffDuesFromRun({ employees, run }), [employees, run]);
  const error = !run && pay.error ? pay.error : null;

  return { rows, total, ready: !!run, error, month, refetch: pay.reload };
};

export default useStaffDues;
