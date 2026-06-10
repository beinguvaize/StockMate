import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';
import useRefetchOnFocus from './useRefetchOnFocus';

const EMPLOYEE_NUMERIC = ['daily_rate', 'days_worked', 'amount_paid', 'salary'];
const PAYROLL_NUMERIC  = ['gross', 'net', 'deductions', 'bonus', 'days_worked'];

// Map camelCase form fields → snake_case DB columns
const toEmployeeRow = (emp) => ({
  name:         emp.name         ?? null,
  email:        emp.email        ?? null,
  phone:        emp.phone        ?? null,
  department:   emp.department   ?? null,
  position:     emp.position     ?? null,
  status:       emp.status       ?? 'ACTIVE',
  pay_type:     emp.payType      ?? emp.pay_type    ?? null,
  salary:       emp.basePay      != null ? Number(emp.basePay)    : (emp.salary      != null ? Number(emp.salary)      : null),
  daily_rate:   emp.dailyRate    != null ? Number(emp.dailyRate)  : (emp.daily_rate  != null ? Number(emp.daily_rate)  : null),
  days_worked:  emp.daysWorked   != null ? Number(emp.daysWorked) : (emp.days_worked != null ? Number(emp.days_worked) : null),
  amount_paid:  emp.amountPaid   != null ? Number(emp.amountPaid) : (emp.amount_paid != null ? Number(emp.amount_paid) : null),
  bank_account: emp.bankAccount  ?? emp.bank_account ?? null,
  notes:        emp.notes        ?? null,
  // Coerce empty string → null (|| not ??): an unlinked employee sends ''
  // which would otherwise hit employees_user_id_fkey.
  user_id:      emp.user_id      || emp.userId       || null,
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
      setPayrollRecords(normalizeNumericRows(payData, PAYROLL_NUMERIC));
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
    const { data, error } = await supabase.from('payroll').insert([{ ...record, tenant_id: tenantId }]).select().single();
    if (!error) setPayrollRecords(prev => [data, ...prev]);
    return { success: !error, error };
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
    resetEmployeesDailyData
  };
};
