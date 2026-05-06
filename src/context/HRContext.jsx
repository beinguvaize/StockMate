import React, { createContext, useContext, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { employeeSchema } from '../lib/validation';
import { logError } from '../lib/errorLogger';
import { logAuditEvent, AUDIT_ACTIONS } from '../lib/auditLog';
import { useTenant } from './TenantContext';
import { useSync } from './SyncContext';
import { useNotifications } from './NotificationContext';
import { useAuth } from './AuthContext';

const HRContext = createContext();

export const useHR = () => useContext(HRContext);

export const HRProvider = ({ children }) => {
  const [employees, setEmployees] = useState([]);
  const [payrollRecords, setPayrollRecords] = useState([]);

  const { currentTenantId } = useTenant();
  const { setSyncStatus } = useSync();
  const { addNotification } = useNotifications();
  const { currentUser } = useAuth();

  // ---------- Employees ----------
  const addEmployee = async (emp) => {
    const val = employeeSchema.safeParse(emp);
    if (!val.success) {
      addNotification('Validation failed:' + val.error.errors[0].message, 'error');
      return false;
    }
    const newEmp = {
      id: emp.id || `EMP-${Date.now()}`,
      name: emp.name,
      email: emp.email || null,
      phone: emp.phone || null,
      position: emp.position || null,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      salary: emp.basePay || 0,
      role: emp.department,
      department: emp.department,
      pay_type: emp.payType || 'MONTHLY',
      bank_account: emp.bankAccount || null,
      notes: emp.notes || null,
      daily_rate: emp.dailyRate || 0,
      days_worked: emp.daysWorked || 0,
      amount_paid: emp.amountPaid || 0,
      tenant_id: currentTenantId,
    };
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('employees').upsert(newEmp);
      if (error) {
        console.error('Error adding employee to Supabase:', error);
        addNotification('Failed to save employee to cloud:' + error.message, 'error');
        return false;
      }
    }
    setEmployees((prev) => [...prev, newEmp]);
    addNotification(`${emp.name} added successfully`, 'success');
    return true;
  };

  const updateEmployee = async (updated) => {
    const dbData = {
      id: updated.id,
      name: updated.name,
      email: updated.email !== undefined ? updated.email : null,
      phone: updated.phone !== undefined ? updated.phone : null,
      position: updated.position !== undefined ? updated.position : null,
      status: updated.status || 'ACTIVE',
      salary: updated.basePay !== undefined ? updated.basePay : (updated.salary || 0),
      department: updated.department || updated.role,
      role: updated.department || updated.role,
      pay_type: updated.payType || updated.pay_type || 'MONTHLY',
      bank_account: updated.bankAccount || updated.bank_account || null,
      notes: updated.notes !== undefined ? updated.notes : null,
      daily_rate: updated.dailyRate !== undefined ? updated.dailyRate : (updated.daily_rate || 0),
      days_worked: updated.daysWorked !== undefined ? updated.daysWorked : (updated.days_worked || 0),
      amount_paid: updated.amountPaid !== undefined ? updated.amountPaid : (updated.amount_paid || 0),
      tenant_id: currentTenantId,
    };

    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { error } = await supabase.from('employees').upsert(dbData);
      if (error) {
        console.error('Error updating employee in Supabase:', error);
        logError({
          module: 'Employees',
          action: 'Update Employee',
          error_code: error.code,
          error_message: error.message,
          severity: 'High',
        });
        setSyncStatus('ERROR');
        addNotification(`Cloud sync failed: ${error.message}`, "error");
        return; // STOP
      }
      setSyncStatus('SYNCED');
    }

    const fullEmployee = {
      ...dbData,
      basePay: dbData.salary,
      payType: dbData.pay_type,
      bankAccount: dbData.bank_account,
      dailyRate: dbData.daily_rate,
      daysWorked: dbData.days_worked,
      amountPaid: dbData.amount_paid,
    };

    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? fullEmployee : e)));
  };

  const deleteEmployee = async (empId) => {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', empId)
        .eq('tenant_id', currentTenantId);

      if (error) {
        console.error('Error deleting employee from Supabase:', error);
        logError({
          module: 'Employees',
          action: 'Delete Employee',
          error_code: error.code,
          error_message: error.message,
          severity: 'Medium',
        });
        addNotification('Failed to delete employee from cloud', 'error');
        return;
      }
    }
    setEmployees((prev) => prev.filter((e) => e.id !== empId));
  };

  const resetEmployeesDailyData = async () => {
    if (!isSupabaseConfigured) {
      setEmployees((prev) => prev.map((emp) => ({ ...emp, daysWorked: 0, days_worked: 0 })));
      addNotification('Days worked reset locally', 'success');
      return true;
    }

    setSyncStatus('SYNCING');
    const { error } = await supabase
      .from('employees')
      .update({ days_worked: 0 })
      .eq('status', 'ACTIVE')
      .eq('tenant_id', currentTenantId);

    if (error) {
      console.error('Error resetting employee data:', error);
      setSyncStatus('ERROR');
      addNotification('Failed to reset daily data in cloud', 'error');
      return false;
    }

    setEmployees((prev) =>
      prev.map((emp) =>
        emp.status === 'ACTIVE' ? { ...emp, daysWorked: 0, days_worked: 0 } : emp,
      ),
    );
    setSyncStatus('SYNCED');
    addNotification('All active staff days worked reset', 'success');
    return true;
  };

  // ---------- Payroll ----------
  const processPayroll = async (payRun) => {
    const timestamp = new Date().toISOString();
    const newRecord = {
      ...payRun,
      id: payRun.id || `PAY-${Date.now()}`,
      processed_at: timestamp,
      processedAt: timestamp,
      processed_by: currentUser?.id,
    };

    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const payrollInserts = payRun.items.map((item) => ({
        id: `PRL-${Date.now()}-${item.employeeId}`,
        employeeId: item.employeeId,
        amount: item.netPay,
        month: payRun.period,
        processed_at: timestamp,
        processed_by: currentUser?.id,
        tenant_id: currentTenantId,
      }));

      const { error } = await supabase.from('payroll').insert(payrollInserts);
      if (error) {
        console.error('Error processing payroll in Supabase:', error);
        logError({
          module: 'Payroll',
          action: 'Process Payroll',
          error_code: error.code,
          error_message: error.message,
          severity: 'High',
        });
        setSyncStatus('ERROR');
        addNotification(`Payroll sync failed: ${error.message}`, "error");
        return false; // STOP
      }
      setSyncStatus('SYNCED');

      const totalNet = payrollInserts.reduce((s, r) => s + Number(r.amount || 0), 0);
      logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_PROCESS,
        entityType: 'payroll',
        entityId: newRecord.id,
        summary: `Processed payroll for ${payRun.period}: ${payrollInserts.length} employee(s), net ${totalNet.toFixed(2)}`,
        metadata: {
          period: payRun.period,
          employee_count: payrollInserts.length,
          total_net: totalNet,
        },
      });
    }

    setPayrollRecords((prev) => [newRecord, ...prev]);
    addNotification(`Payroll for ${payRun.period} authorized`, 'success');
    return true;
  };

  const deletePayrollRecord = async (recordId) => {
    const target = payrollRecords.find((r) => r.id === recordId) || null;

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('payroll')
        .delete()
        .eq('id', recordId)
        .eq('tenant_id', currentTenantId);

      if (error) {
        console.error('Error deleting payroll record from Supabase:', error);
        logError({
          module: 'Payroll',
          action: 'Delete Payroll',
          error_code: error.code,
          error_message: error.message,
          severity: 'Medium',
        });
        addNotification(`Cloud delete failed: ${error.message}`, "error");
        return; // STOP
      }
      logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_DELETE,
        entityType: 'payroll',
        entityId: recordId,
        summary: `Deleted payroll record ${recordId}${target?.period ? ` (${target.period})` : ''}`,
        metadata: {
          period: target?.period || target?.month || null,
          employee_count: Array.isArray(target?.items) ? target.items.length : null,
        },
      });
    }
    setPayrollRecords((prev) => prev.filter((r) => r.id !== recordId));
  };

  const value = {
    employees, setEmployees,
    payrollRecords, setPayrollRecords,
    addEmployee, updateEmployee, deleteEmployee, resetEmployeesDailyData,
    processPayroll, deletePayrollRecord,
  };

  return <HRContext.Provider value={value}>{children}</HRContext.Provider>;
};
