import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';

const CLIENT_NUMERIC = ['outstanding_balance', 'credit_limit'];
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
    const { error } = await supabase.from('suppliers').insert({ ...supplier, tenant_id: tenantId });
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
  const toClientRow = ({ status, ...rest }) => rest; // 'status' not in DB schema

  const addClient = async (client) => {
    const id = crypto.randomUUID();
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

  return { 
    clients, 
    suppliers, 
    employees, 
    users, 
    loading, 
    error, 
    refetch: fetchPeopleData,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    addClient,
    deleteClient,

    recordClientPayment: async (clientId, amount, date, notes, invoiceIds) => {
      try {
        setLoading(true);
        
        // 1. Update Invoices
        if (invoiceIds && invoiceIds.length > 0) {
          const { error: invErr } = await supabase
            .from('sales') // The table is actually 'sales' but used as invoices in some contexts
            .update({ payment_status: 'PAID', paid_amount: amount }) // Simplified logic
            .in('id', invoiceIds)
            .eq('tenant_id', tenantId);
          
          if (invErr) {
             // Fallback to 'invoices' table if 'sales' doesn't exist/work here
             const { error: invTableErr } = await supabase
               .from('invoices')
               .update({ payment_status: 'PAID' })
               .in('id', invoiceIds)
               .eq('tenant_id', tenantId);
             if (invTableErr) console.warn("Invoice update failed:", invTableErr);
          }
        }

        // 2. Update Client Balance
        const client = clients.find(c => c.id === clientId);
        if (client) {
          const newBalance = Math.max(0, (client.outstanding_balance || 0) - amount);
          const { error: cliErr } = await supabase
            .from('clients')
            .update({ outstanding_balance: newBalance })
            .eq('id', clientId)
            .eq('tenant_id', tenantId);
          
          if (cliErr) throw cliErr;
        }

        await fetchPeopleData();
        return { success: true };
      } catch (err) {
        console.error("recordClientPayment Error:", err);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    }
  };
};
