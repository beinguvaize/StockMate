import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const usePayroll = (tenantId) => {
  const [employees, setEmployees] = useState([]);
  const [payrollRecords, setPayrollRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPayrollData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        { data: empData, error: empErr },
        { data: payData, error: payErr }
      ] = await Promise.all([
        supabase.from('employees').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('payroll').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
      ]);

      if (empErr) throw empErr;
      if (payErr) throw payErr;

      setEmployees(empData || []);
      setPayrollRecords(payData || []);
    } catch (err) {
      console.error("usePayroll Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchPayrollData();
  }, [fetchPayrollData]);

  const addEmployee = async (employee) => {
    const { data, error } = await supabase.from('employees').insert([{ ...employee, tenant_id: tenantId }]).select().single();
    if (!error) setEmployees(prev => [...prev, data]);
    return { success: !error, error };
  };

  const updateEmployee = async (employee) => {
    const { id, ...updates } = employee;
    const { error } = await supabase.from('employees').update(updates).eq('id', id).eq('tenant_id', tenantId);
    if (!error) setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    return { success: !error, error };
  };

  const deleteEmployee = async (id) => {
    const { error } = await supabase.from('employees').delete().eq('id', id).eq('tenant_id', tenantId);
    if (!error) setEmployees(prev => prev.filter(e => e.id !== id));
    return { success: !error, error };
  };

  const processPayroll = async (record) => {
    const { data, error } = await supabase.from('payroll').insert([{ ...record, tenant_id: tenantId }]).select().single();
    if (!error) setPayrollRecords(prev => [data, ...prev]);
    return { success: !error, error };
  };

  const deletePayrollRecord = async (id) => {
    const { error } = await supabase.from('payroll').delete().eq('id', id).eq('tenant_id', tenantId);
    if (!error) setPayrollRecords(prev => prev.filter(p => p.id !== id));
    return { success: !error, error };
  };

  const resetEmployeesDailyData = async () => {
    const { error } = await supabase.from('employees').update({ daysWorked: 0 }).eq('tenant_id', tenantId);
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
