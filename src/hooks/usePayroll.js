import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithCache } from '../lib/offline/hookAdapter';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';
import useRefetchOnFocus from './useRefetchOnFocus';

const EMPLOYEE_NUMERIC = ['daily_rate', 'days_worked', 'amount_paid', 'salary'];
const PAYROLL_NUMERIC  = ['total_base', 'total_net', 'total_overtime', 'total_commission', 'total_bonus', 'total_deductions'];

// Map DB snake_case payroll row → camelCase for UI
const toPayrollRecord = (row) => ({
  ...row,
  totalBase:        Number(row.total_base       || 0),
  totalNet:         Number(row.total_net        || 0),
  totalOvertime:    Number(row.total_overtime   || 0),
  totalCommission:  Number(row.total_commission || 0),
  totalBonus:       Number(row.total_bonus      || 0),
  totalDeductions:  Number(row.total_deductions || 0),
});

// Map camelCase form fields → snake_case DB columns
const toEmployeeRow = (emp) => ({
  name:              emp.name              ?? null,
  email:             emp.email             ?? null,
  phone:             emp.phone             ?? null,
  department:        emp.department        ?? null,
  position:          emp.position          ?? null,
  status:            emp.status            ?? 'ACTIVE',
  pay_type:          emp.payType           ?? emp.pay_type         ?? null,
  salary:            emp.basePay      != null ? Number(emp.basePay)    : (emp.salary      != null ? Number(emp.salary)      : null),
  daily_rate:        emp.dailyRate    != null ? Number(emp.dailyRate)  : (emp.daily_rate  != null ? Number(emp.daily_rate)  : null),
  days_worked:       emp.daysWorked   != null ? Number(emp.daysWorked) : (emp.days_worked != null ? Number(emp.days_worked) : null),
  amount_paid:       emp.amountPaid   != null ? Number(emp.amountPaid) : (emp.amount_paid != null ? Number(emp.amount_paid) : null),
  bank_account:      emp.bankAccount       ?? emp.bank_account     ?? null,
  notes:             emp.notes             ?? null,
  user_id:           emp.user_id           || emp.userId            || null,
  dob:               emp.dob               || null,
  gender:            emp.gender            || null,
  blood_group:       emp.bloodGroup        || emp.blood_group       || null,
  emergency_contact: emp.emergencyContact  || emp.emergency_contact || null,
  joining_date:      emp.joiningDate       || emp.joining_date      || null,
  employment_type:   emp.employmentType    ?? emp.employment_type   ?? 'FULL_TIME',
  aadhaar:           emp.aadhaar           || null,
  pan:               emp.pan               || null,
  pf_account:        emp.pfAccount         ?? emp.pf_account        ?? null,
  // Statutory setup. All default off: EPF is compulsory at 20 employees and
  // ESI at 10, so switching them on for a three-person shop would invent
  // deductions from real wages.
  epf_enabled:            emp.epfEnabled        ?? emp.epf_enabled        ?? false,
  epf_on_full_wage:       emp.epfOnFullWage     ?? emp.epf_on_full_wage   ?? false,
  esi_enabled:            emp.esiEnabled        ?? emp.esi_enabled        ?? false,
  professional_tax_state: emp.professionalTaxState ?? emp.professional_tax_state ?? null,
  tds_monthly:            Number(emp.tdsMonthly ?? emp.tds_monthly ?? 0) || 0,
  esi_no:            emp.esiNo             ?? emp.esi_no            ?? null,
  // Paid leave days allowed in a month. A warning figure only: going over it
  // is flagged on the pay run, it does not cut pay by itself.
  paid_leave_per_month: Math.max(0, Math.min(31, Math.round(Number(emp.paidLeavePerMonth ?? emp.paid_leave_per_month ?? 0)) || 0)),
});

export const usePayroll = (tenantId) => {
  const [employees, setEmployees] = useState([]);
  const [payrollRecords, setPayrollRecords] = useState([]);
  const [payrollPaymentMethods, setPayrollPaymentMethods] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const initialLoadDone = useRef(false);

  const fetchPayrollData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    if (!initialLoadDone.current) setLoading(true);
    try {
      // Reads go through the offline cache on desktop; the staff list and pay
      // history were empty with no network because only the writes were queued.
      // The cache holds whole tables, so re-apply what the query filtered and
      // ordered server-side.
      const mine = (rows) => (rows || []).filter(r => r && r.tenant_id === tenantId && !r.deleted_at);

      const [empRes, payRes, payExpRes] = await Promise.all([
        fetchWithCache('employees', () =>
          supabase.from('employees').select('*').is('deleted_at', null)
            .eq('tenant_id', tenantId).order('name')),
        fetchWithCache('payroll', () =>
          supabase.from('payroll').select('*').is('deleted_at', null)
            .eq('tenant_id', tenantId).order('created_at', { ascending: false })),
        // How each run was actually paid. The payroll row records no method or
        // account -- that lives on the salary EXPENSE the run creates, keyed by
        // payroll_id. The slip needs it to say where the money went.
        fetchWithCache('payroll_expenses', () =>
          // tenant_id and deleted_at are selected because fetchWithCache
          // re-applies these filters to the CACHED rows -- omitting them
          // discards every row on the offline path.
          supabase.from('expenses').select('payroll_id, payment_method, tenant_id, deleted_at')
            .is('deleted_at', null).not('payroll_id', 'is', null)
            .eq('tenant_id', tenantId).limit(1000)),
      ]);

      const empData = mine(empRes.data)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      const payData = mine(payRes.data)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

      setEmployees(normalizeNumericRows(empData, EMPLOYEE_NUMERIC));
      setPayrollRecords(payData.map(toPayrollRecord));

      // payroll_id -> payment method. One method per run: every line of a run
      // is paid the same way, so the first expense answers for all of them.
      const methods = {};
      for (const row of mine(payExpRes.data) || []) {
        if (row.payroll_id && row.payment_method && !methods[row.payroll_id]) {
          methods[row.payroll_id] = String(row.payment_method).toUpperCase();
        }
      }
      setPayrollPaymentMethods(methods);
    } catch (err) {
      console.error("usePayroll Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [tenantId]);

  useEffect(() => {
    initialLoadDone.current = false;
    fetchPayrollData();
  }, [fetchPayrollData]);

  useRefetchOnFocus(fetchPayrollData);

  /**
   * Add an employee. The caller may pass the id (`employee.id`) and keep it
   * for the life of the form: a second press after a dropped connection then
   * collides with the row the first press already wrote, instead of adding the
   * same person twice. That collision is checked by reading the id back, and
   * reported as saved only when the row is really there.
   */
  const addEmployee = async (employee) => {
    const id = employee?.id || crypto.randomUUID();
    const row = toEmployeeRow(employee);
    const { error } = await supabase
      .from('employees')
      .insert([{ id, ...row, tenant_id: tenantId }])
      .select().single();
    if (error) {
      console.error('addEmployee error:', error);
      if (error.code === '23505' && employee?.id) {
        const { data: there } = await supabase.from('employees').select('id')
          .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
        if (there) { await fetchPayrollData(); return { success: true, error: null, id, replayed: true }; }
      }
      return { success: false, error, id };
    }
    await fetchPayrollData();
    return { success: true, error: null, id };
  };

  const updateEmployee = async (employee) => {
    const { id } = employee;
    const row = toEmployeeRow(employee);
    const { error } = await supabase
      .from('employees')
      .update(row)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) console.error('updateEmployee error:', error);
    else await fetchPayrollData();
    return { success: !error, error };
  };

  const deleteEmployee = async (id) => {
    // A soft delete: the row stays, marked, so their pay runs and expenses keep
    // the person they were paid to.
    const { error } = await supabase.from('employees').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', tenantId);
    if (error) console.error('deleteEmployee error:', error);
    else setEmployees(prev => prev.filter(e => e.id !== id));
    return { success: !error, error };
  };

  /**
   * Save a pay run and its salary expenses in ONE database call.
   *
   * This used to be two inserts from the browser: the payroll row, then the
   * expenses. When the second failed the run stood with nothing in DayBook or
   * the cash account. process_payroll_run writes both in a single transaction,
   * so it is all saved or none of it is, and the phone calls the same function.
   *
   * The run id is made here and sent with the call. If the reply is lost and
   * the same id is sent again, the function hands back the run it already
   * saved instead of paying everyone a second time.
   */
  const processPayroll = async (record, runId = crypto.randomUUID()) => {
    const { data, error } = await supabase.rpc('process_payroll_run', {
      p_tenant_id:      tenantId,
      p_run_id:         runId,
      p_period:         record.period,
      p_payment_method: record.paymentMethod || 'CASH',
      p_items:          record.items || [],
      p_processed_at:   record.processedAt || null,
    });
    if (error) {
      console.error('process_payroll_run error:', error);
      return { success: false, error, runId };
    }
    const run = data?.run;
    if (run) {
      setPayrollRecords(prev => [toPayrollRecord(run), ...prev.filter(r => r.id !== run.id)]);
    }
    return { success: true, expensesPosted: Number(data?.expenses || 0), replayed: !!data?.replayed, runId };
  };

  /**
   * Reverse a pay run: the record AND the salary expenses it created.
   *
   * This used to soft-delete the payroll row alone. The expenses stayed, so the
   * run vanished from Pay History while its money sat on in DayBook, the P&L
   * and the cash account — the books drifting from the run history with nothing
   * to show why. That made it the wrong tool for the thing it would most often
   * be reached for: undoing a payout entered twice.
   *
   * Expenses go first. If that half fails the run is left standing, which is
   * recoverable — the alternative order can delete a run and strand its money
   * with the link gone.
   */
  const deletePayrollRecord = async (id) => {
    const now = new Date().toISOString();

    const { data: reversed, error: expError } = await supabase
      .from('expenses')
      .update({ deleted_at: now })
      .eq('payroll_id', id).eq('tenant_id', tenantId).is('deleted_at', null)
      .select('id, amount');

    if (expError) {
      console.error('deletePayrollRecord: salary expense reversal failed:', expError);
      // Say what did not happen. A bare "failed" here once hid a days-long
      // outage; the run is still intact, so name that too.
      return {
        success: false,
        error: expError,
        message: `The salary expenses for this run could not be reversed: ${expError.message}. Nothing was deleted — DayBook and the P&L are unchanged.`,
      };
    }

    const { error } = await supabase.from('payroll')
      .update({ deleted_at: now }).eq('id', id).eq('tenant_id', tenantId);

    if (error) {
      console.error('deletePayrollRecord: payroll row delete failed:', error);
      return {
        success: false,
        error,
        message: `${reversed?.length || 0} salary expense${reversed?.length === 1 ? '' : 's'} were reversed, but the payroll record itself could not be deleted: ${error.message}. Pay History and the P&L now disagree — try again.`,
      };
    }

    setPayrollRecords(prev => prev.filter(p => p.id !== id));
    const total = (reversed || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    return { success: true, expensesReversed: reversed?.length || 0, amountReversed: total };
  };

  // ── Attendance ────────────────────────────────────────────────────────
  //
  // These read and wrote `date` and `ot_hours`. The table has neither: the
  // column is `day`, there is no ot_hours at all, and the unique key is
  // (tenant_id, employee_id, day). So the select returned nothing and every
  // write errored — and both only console.error'd, so a total failure stayed
  // invisible. Prod holds 2 attendance rows against weeks of use, and both
  // were written by the mobile app, which had it right all along
  // (hr_screen.dart:1686). This now matches mobile.
  const loadAttendance = useCallback(async (year, month) => {
    if (!tenantId) return {};
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const { data, error } = await supabase
      .from('attendance')
      .select('employee_id, day, status, custom_rate')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('day', `${year}-${pad(month)}-01`)
      .lte('day', `${year}-${pad(month)}-${pad(lastDay)}`);
    if (error) { console.error('loadAttendance:', error); return { error }; }
    const map = {};
    for (const row of data || []) {
      if (!map[row.employee_id]) map[row.employee_id] = {};
      map[row.employee_id][row.day] = { status: row.status, custom_rate: row.custom_rate ?? null };
    }
    return map;
  }, [tenantId]);

  const markAttendance = useCallback(async (employeeId, day, status, customRate = null) => {
    const { error } = await supabase
      .from('attendance')
      .upsert(
        {
          tenant_id: tenantId, employee_id: employeeId, day, status,
          custom_rate: customRate,
          // Re-marking a cleared day must revive its row: the unique key still
          // holds it, so a plain insert would collide.
          deleted_at: null,
        },
        { onConflict: 'tenant_id,employee_id,day' }
      );
    if (error) console.error('markAttendance:', error);
    // Return the error, not just a boolean. A caller that cannot say WHY a save
    // failed ends up showing "failed to save" and hiding the cause — which is
    // how a schema mismatch survived this long.
    return { success: !error, error };
  }, [tenantId]);

  /**
   * Commit a screenful of attendance edits.
   *
   * `marks` are upserted in one round trip and `clears` soft-deleted in
   * another — two calls regardless of how many cells changed. The old path
   * wrote once per cell, and once per keystroke while typing a rate.
   */
  const saveAttendanceBatch = useCallback(async (marks = [], clears = []) => {
    if (!tenantId) return { success: false, error: { message: 'No tenant' } };

    if (marks.length) {
      const rows = marks.map(m => ({
        tenant_id: tenantId,
        employee_id: m.employeeId,
        day: m.day,
        status: m.status,
        custom_rate: m.customRate ?? null,
        deleted_at: null,
      }));
      const { error } = await supabase
        .from('attendance')
        .upsert(rows, { onConflict: 'tenant_id,employee_id,day' });
      if (error) { console.error('saveAttendanceBatch (marks):', error); return { success: false, error }; }
    }

    // Soft delete, so clearing a day and marking it again reuses the row rather
    // than fighting the unique key.
    for (const c of clears) {
      const { error } = await supabase
        .from('attendance')
        .update({ deleted_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('employee_id', c.employeeId)
        .eq('day', c.day);
      if (error) { console.error('saveAttendanceBatch (clear):', error); return { success: false, error }; }
    }

    return { success: true, error: null };
  }, [tenantId]);

  return {
    employees,
    payrollRecords,
    payrollPaymentMethods,
    loading,
    error,
    refetch: fetchPayrollData,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    processPayroll,
    deletePayrollRecord,
    loadAttendance,
    markAttendance,
    saveAttendanceBatch,
  };
};
