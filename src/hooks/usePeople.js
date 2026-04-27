import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';
import { generateUUID } from '../lib/utils';

const DEFAULT_PERMISSIONS = {
  dashboard: { view: false, edit: false },
  inventory: { view: false, edit: false },
  sales:     { view: false, edit: false },
  purchases: { view: false, edit: false },
  expenses:  { view: false, edit: false },
  clients:   { view: false, edit: false },
  suppliers: { view: false, edit: false },
  vehicles:  { view: false, edit: false },
  reports:   { view: false, edit: false },
  payroll:   { view: false, edit: false },
  users:     { view: false, edit: false },
  settings:  { view: false, edit: false },
  daybook:   { view: false, edit: false },
};

const CLIENT_NUMERIC = ['outstanding_balance', 'credit_limit', 'credit_days'];
const SUPPLIER_NUMERIC = ['balance', 'outstanding_balance'];
const EMPLOYEE_NUMERIC = ['dailyRate', 'monthlySalary', 'balance'];

export const usePeople = (tenantId) => {
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPeopleData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        { data: cliData, error: cliErr },
        { data: supData, error: supErr },
        { data: empData, error: empErr },
        { data: userData, error: userErr }
      ] = await Promise.all([
        supabase.from('clients').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('suppliers').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('employees').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('users').select('*').eq('tenant_id', tenantId).order('name')
      ]);

      if (cliErr) throw cliErr;
      if (supErr) throw supErr;
      if (empErr) throw empErr;
      if (userErr) throw userErr;

      setClients(normalizeNumericRows(cliData, CLIENT_NUMERIC));
      setSuppliers(normalizeNumericRows(supData, SUPPLIER_NUMERIC));
      setEmployees(normalizeNumericRows(empData, EMPLOYEE_NUMERIC));
      setUsers(userData || []);
    } catch (err) {
      console.error("usePeople Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchPeopleData();
  }, [fetchPeopleData]);

  const addSupplier = async (supplier) => {
    const id = supplier.id || generateUUID();
    const { error } = await supabase.from('suppliers').insert({ id, ...supplier, tenant_id: tenantId });
    if (!error) await fetchPeopleData();
    return { success: !error, error };
  };

  const updateSupplier = async (supplier) => {
    const { id, ...data } = supplier;
    const { error } = await supabase.from('suppliers').update(data).eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchPeopleData();
    return { success: !error, error };
  };

  const deleteSupplier = async (id) => {
    const { error } = await supabase.from('suppliers').delete().eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchPeopleData();
    return { success: !error, error };
  };

  // Strip unknown columns before insert/update
  // Passes through: client_type, price_tier, credit_days (new B2B fields)
  const toClientRow = ({ status, ...rest }) => rest; // 'status' not in DB schema

  const addClient = async (client) => {
    const id = generateUUID();
    const { error } = await supabase
      .from('clients')
      .insert({ id, ...toClientRow(client), tenant_id: tenantId });
    if (error) console.error('addClient error:', error);
    else await fetchPeopleData();
    return { success: !error, error };
  };

  const updateClient = async (client) => {
    const { id, ...data } = client;
    const { error } = await supabase
      .from('clients')
      .update(toClientRow(data))
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) console.error('updateClient error:', error);
    else await fetchPeopleData();
    return { success: !error, error };
  };

  const deleteClient = async (id) => {
    const { error } = await supabase.from('clients').delete().eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchPeopleData();
    return { success: !error, error };
  };

  // ── User management ───────────────────────────────────────────────
  const addUser = async (userData) => {
    const newUser = {
      id: generateUUID(),
      name: userData.name,
      email: userData.email,
      roles: userData.roles || ['STAFF'],
      status: 'ACTIVE',
      permissions: userData.permissions || { ...DEFAULT_PERMISSIONS },
      tenant_id: tenantId,
    };

    if (userData.password) {
      try {
        const { data: result, error: invokeError } = await supabase.functions.invoke('dynamic-service', {
          body: {
            email: userData.email,
            password: userData.password,
            name: userData.name,
            roles: userData.roles || ['STAFF'],
            permissions: userData.permissions || { ...DEFAULT_PERMISSIONS },
            tenant_id: tenantId,
          },
        });
        if (invokeError) throw invokeError;
        if (result?.error) throw new Error(result.error);
        await fetchPeopleData();
        return true;
      } catch (err) {
        console.error('addUser edge fn error:', err);
        alert('Staff creation failed: ' + (err.message || 'Unknown error'));
        return false;
      }
    }

    // No password — insert profile only
    const { error } = await supabase.from('users').upsert(newUser);
    if (error) {
      console.error('addUser insert error:', error);
      alert('Failed to save staff profile: ' + error.message);
      return false;
    }
    await fetchPeopleData();
    return true;
  };

  const updateUser = async (updatedUser) => {
    const { error } = await supabase
      .from('users')
      .upsert(updatedUser);
    if (error) console.error('updateUser error:', error);
    else await fetchPeopleData();
  };

  const deleteUser = async (userId) => {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId)
      .eq('tenant_id', tenantId);
    if (error) console.error('deleteUser error:', error);
    else await fetchPeopleData();
  };

  return {
    clients,
    suppliers,
    employees,
    users,
    loading,
    error,
    refetch: fetchPeopleData,
    addUser,
    updateUser,
    deleteUser,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    addClient,
    deleteClient,

    recordClientPayment: async (clientId, amount, date, notes, invoiceIds, paymentMethod = 'CASH') => {
      try {
        setLoading(true);

        // 1. Allocate payment across selected invoices, mark each correctly
        if (invoiceIds && invoiceIds.length > 0) {
          const { data: invRows } = await supabase
            .from('invoices')
            .select('id, grand_total, paid_amount')
            .in('id', invoiceIds)
            .eq('tenant_id', tenantId);

          if (invRows && invRows.length > 0) {
            let remaining = amount;
            for (const inv of invRows) {
              const alreadyPaid = Number(inv.paid_amount) || 0;
              const owed = Number(inv.grand_total) - alreadyPaid;
              const allocating = Math.min(remaining, owed);
              const newPaid = alreadyPaid + allocating;
              const newStatus = newPaid >= Number(inv.grand_total) ? 'PAID' : 'PARTIAL';
              await supabase
                .from('invoices')
                .update({ payment_status: newStatus, paid_amount: newPaid })
                .eq('id', inv.id)
                .eq('tenant_id', tenantId);
              remaining -= allocating;
              if (remaining <= 0) break;
            }
          }

          // Also update any matching sales (POS credit sales)
          const { error: saleErr } = await supabase
            .from('sales')
            .update({ paymentStatus: 'PAID', paidAmount: amount })
            .in('id', invoiceIds)
            .eq('tenant_id', tenantId);
          if (saleErr) console.warn('Sales update failed:', saleErr);
        }

        // Note: clients.outstanding_balance is auto-recomputed by the
        // on_invoice_payment_sync DB trigger after each invoice update above.
        // No manual balance decrement needed here — fetchPeopleData() below
        // will read the trigger-computed correct value.

        // 2. Insert audit record into client_payments
        const { data: { user } } = await supabase.auth.getUser();
        const { error: payErr } = await supabase
          .from('client_payments')
          .insert({
            id:             generateUUID(),
            tenant_id:      tenantId,
            client_id:      clientId,
            amount,
            date,
            payment_method: paymentMethod,
            notes:          notes || null,
            recorded_by:    user?.id || null,
          });
        if (payErr) console.warn('Payment audit insert failed:', payErr);

        await fetchPeopleData();
        return { success: true };
      } catch (err) {
        console.error('recordClientPayment Error:', err);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    }
  };
};
