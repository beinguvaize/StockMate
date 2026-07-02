import { useState, useEffect, useCallback, useRef } from 'react';
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
  esi_no:            emp.esiNo             ?? emp.esi_no            ?? null,
});

export const usePayroll = (tenantId) => {
  const [employees, setEmployees] = useState([]);
  const [payrollRecords, setPayrollRecords] = useState([]);
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
      const [
        { data: empData, error: empErr },
        { data: payData, error: payErr }
      ] = await Promise.all([
        supabase.from('employees').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('name'),
        supabase.from('payroll').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('created_at', { ascending: false })
      ]);

      if (empErr) throw empErr;
      if (payErr) throw payErr;

      setEmployees(normalizeNumericRows(empData, EMPLOYEE_NUMERIC));
      setPayrollRecords((payData || []).map(toPayrollRecord));
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

  const addEmployee = async (employee) => {
    const id = crypto.randomUUID();
    const row = toEmployeeRow(employee);
    const { data, error } = await supabase
      .from('employees')
      .insert([{ id, ...row, tenant_id: tenantId }])
      .select().single();
    if (error) console.error('addEmployee error:', error);
    else await fetchPayrollData();
    return { success: !error, error };
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
    const { error } = await supabase.from('employees').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', tenantId);
    if (!error) setEmployees(prev => prev.filter(e => e.id !== id));
    return { success: !error, error };
  };

  const processPayroll = async (record) => {
    const row = {
      tenant_id:         tenantId,
      period:            record.period,
      items:             record.items,
      total_base:        record.totalBase,
      total_net:         record.totalNet,
      total_overtime:    record.totalOvertime,
      total_commission:  record.totalCommission,
      total_bonus:       record.totalBonus,
      total_deductions:  record.totalDeductions,
      processed_at:      record.processedAt,
    };
    const { data, error } = await supabase.from('payroll').insert([row]).select().single();
    if (error) { console.error('processPayroll insert error:', error); return { success: false, error }; }
    setPayrollRecords(prev => [toPayrollRecord(data), ...prev]);
    // Post one salary expense per employee → DayBook + P&L see it automatically
    // period is either YYYY-MM (monthly) or YYYY-MM-DD/YYYY-MM-DD (weekly)
    const isWeekly = record.period.includes('/');
    const expDate = isWeekly
      ? record.period.split('/')[1] // end of week = pay date
      : (() => { const [yr, mo] = record.period.split('-').map(Number); return new Date(yr, mo, 0).toISOString().slice(0, 10); })();
    for (const item of (record.items || [])) {
      if (!item.netPay || item.netPay <= 0) continue;
      supabase.from('expenses').insert({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        category: 'Salary',
        amount: item.netPay,
        note: `Payroll ${record.period} — ${item.employeeName}`,
        date: expDate,
        payment_method: 'CASH',
      }).catch(e => console.error('salary expense insert error:', e));
    }
    return { success: true };
  };

  const deletePayrollRecord = async (id) => {
    const { error } = await supabase.from('payroll').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', tenantId);
    if (!error) setPayrollRecords(prev => prev.filter(p => p.id !== id));
    return { success: !error, error };
  };

  const resetEmployeesDailyData = async () => {
    const { error } = await supabase.from('employees').update({ days_worked: 0 }).eq('tenant_id', tenantId);
    if (!error) await fetchPayrollData();
    return { success: !error, error };
  };

  // ── Attendance ────────────────────────────────────────────────────────
  const loadAttendance = useCallback(async (year, month) => {
    if (!tenantId) return {};
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const { data, error } = await supabase
      .from('attendance')
      .select('employee_id, date, status, ot_hours, custom_rate')
      .eq('tenant_id', tenantId)
      .gte('date', `${year}-${pad(month)}-01`)
      .lte('date', `${year}-${pad(month)}-${pad(lastDay)}`);
    if (error) { console.error('loadAttendance:', error); return {}; }
    const map = {};
    for (const row of data || []) {
      if (!map[row.employee_id]) map[row.employee_id] = {};
      map[row.employee_id][row.date] = { status: row.status, ot_hours: row.ot_hours || 0, custom_rate: row.custom_rate ?? null };
    }
    return map;
  }, [tenantId]);

  const markAttendance = useCallback(async (employeeId, date, status, otHours = 0, customRate = null) => {
    const { error } = await supabase
      .from('attendance')
      .upsert(
        { tenant_id: tenantId, employee_id: employeeId, date, status, ot_hours: otHours, custom_rate: customRate },
        { onConflict: 'tenant_id,employee_id,date' }
      );
    if (error) console.error('markAttendance:', error);
    return { success: !error };
  }, [tenantId]);

  return {
    employees,
    payrollRecords,
    loading,
    error,
    refetch: fetchPayrollData,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    processPayroll,
    deletePayrollRecord,
    resetEmployeesDailyData,
    loadAttendance,
    markAttendance,
  };
};
