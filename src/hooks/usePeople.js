import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, restInsert, restUpdate } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { normalizeNumericRows } from '../lib/numeric';
import { fetchWithCache, queueMutation, upsertCachedRow, isOfflineError, readCacheThenRevalidate, isElectron } from '../lib/offline/hookAdapter';
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
  const { currentUser } = useAuth();
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const initialLoadDone = useRef(false);
  const fetchRef = useRef(null);

  const fetchPeopleData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      // Cache-first reads — render immediately from IDB, refresh in background.
      const [cliCached, supCached, empCached, userCached] = await Promise.all([
        readCacheThenRevalidate(
          'clients',
          () => supabase.from('clients').select('*').is('deleted_at', null).eq('tenant_id', tenantId).is('deleted_at', null).order('name'),
          (rows) => setClients(normalizeNumericRows(rows, CLIENT_NUMERIC)),
        ),
        readCacheThenRevalidate(
          'suppliers',
          () => supabase.from('suppliers').select('*').is('deleted_at', null).eq('tenant_id', tenantId).is('deleted_at', null).order('name'),
          (rows) => setSuppliers(normalizeNumericRows(rows, SUPPLIER_NUMERIC)),
        ),
        readCacheThenRevalidate(
          'employees',
          () => supabase.from('employees').select('*').is('deleted_at', null).eq('tenant_id', tenantId).is('deleted_at', null).order('name'),
          (rows) => setEmployees(normalizeNumericRows(rows, EMPLOYEE_NUMERIC)),
        ),
        readCacheThenRevalidate(
          'users',
          () => supabase.from('users').select('*').eq('tenant_id', tenantId).order('name'),
          (rows) => setUsers(rows),
        ),
      ]);

      setClients(normalizeNumericRows(cliCached, CLIENT_NUMERIC));
      setSuppliers(normalizeNumericRows(supCached, SUPPLIER_NUMERIC));
      setEmployees(normalizeNumericRows(empCached, EMPLOYEE_NUMERIC));
      setUsers(userCached);
    } catch (err) {
      console.error("usePeople Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [tenantId]);

  fetchRef.current = fetchPeopleData;

  useEffect(() => {
    initialLoadDone.current = false;
    fetchRef.current?.();
  }, [tenantId]);

  const addSupplier = async (supplier) => {
    const id = supplier.id || generateUUID();
    const row = { id, ...supplier, tenant_id: tenantId };
    if (isElectron()) {
      await queueMutation({ table: 'suppliers', type: 'insert', payload: row });
      await upsertCachedRow('suppliers', row);
      setSuppliers(prev => normalizeNumericRows([row, ...prev], SUPPLIER_NUMERIC));
      return { success: true, error: null, queued: true };
    }
    const { error } = await restInsert('suppliers', row);
    if (!error) { await fetchPeopleData(); return { success: true, error: null }; }
    if (isOfflineError(error)) {
      try {
        await queueMutation({ table: 'suppliers', type: 'insert', payload: row });
        await upsertCachedRow('suppliers', row);
        setSuppliers(prev => normalizeNumericRows([row, ...prev], SUPPLIER_NUMERIC));
        return { success: true, error: null, queued: true };
      } catch (qErr) { console.error('addSupplier queue error:', qErr); }
    }
    return { success: false, error };
  };

  const updateSupplier = async (supplier) => {
    const { id, ...data } = supplier;
    if (isElectron()) {
      await queueMutation({ table: 'suppliers', type: 'update', payload: { ...data, id } });
      setSuppliers(prev => prev.map(x => x.id === id ? { ...x, ...data } : x));
      return { success: true, error: null, queued: true };
    }
    const { error } = await restUpdate('suppliers', data, { id, tenant_id: tenantId });
    if (!error) await fetchPeopleData();
    return { success: !error, error };
  };

  const deleteSupplier = async (id) => {
    const { error } = await restUpdate('suppliers', { deleted_at: new Date().toISOString() }, { id, tenant_id: tenantId });
    if (!error) await fetchPeopleData();
    return { success: !error, error };
  };

  // Strip unknown columns before insert/update
  // Passes through: client_type, price_tier, credit_days (new B2B fields)
  const toClientRow = ({ status, ...rest }) => rest; // 'status' not in DB schema

  const addClient = async (client) => {
    const id = generateUUID();
    const row = { id, ...toClientRow(client), tenant_id: tenantId };
    if (isElectron()) {
      await queueMutation({ table: 'clients', type: 'insert', payload: row });
      await upsertCachedRow('clients', row);
      setClients(prev => normalizeNumericRows([row, ...prev], CLIENT_NUMERIC));
      return { success: true, error: null, queued: true };
    }
    const { error } = await restInsert('clients', row);
    if (!error) {
      fetchPeopleData().catch(e => console.error('addClient refetch error:', e));
      return { success: true, error: null };
    }
    console.error('addClient error:', error);
    if (isOfflineError(error)) {
      try {
        await queueMutation({ table: 'clients', type: 'insert', payload: row });
        await upsertCachedRow('clients', row);
        setClients(prev => normalizeNumericRows([row, ...prev], CLIENT_NUMERIC));
        return { success: true, error: null, queued: true };
      } catch (qErr) { console.error('addClient queue error:', qErr); }
    }
    return { success: false, error };
  };

  const updateClient = async (client) => {
    const { id, ...data } = client;
    if (isElectron()) {
      const payload = { ...toClientRow(data), id };
      await queueMutation({ table: 'clients', type: 'update', payload });
      setClients(prev => prev.map(x => x.id === id ? { ...x, ...payload } : x));
      return { success: true, error: null, queued: true };
    }
    const { error } = await restUpdate('clients', toClientRow(data), { id, tenant_id: tenantId });
    if (error) console.error('updateClient error:', error);
    else fetchPeopleData().catch(e => console.error('updateClient refetch error:', e));
    return { success: !error, error };
  };

  const deleteClient = async (id) => {
    const { error } = await restUpdate('clients', { deleted_at: new Date().toISOString() }, { id, tenant_id: tenantId });
    if (!error) fetchPeopleData().catch(e => console.error('deleteClient refetch error:', e));
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
        // Use direct fetch instead of supabase.functions.invoke to avoid
        // potential token-refresh hang in Supabase JS client
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dynamic-service`;

        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: userData.email,
            password: userData.password,
            name: userData.name,
            roles: userData.roles || ['STAFF'],
            permissions: userData.permissions || { ...DEFAULT_PERMISSIONS },
            tenant_id: tenantId,
          }),
        });

        const result = await res.json();
        if (!res.ok || result?.error) throw new Error(result?.error || `HTTP ${res.status}`);
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
    // Never allow stripping GLOBAL_ADMIN role via tenant UI
    if (updatedUser.roles?.includes('GLOBAL_ADMIN')) return;
    const { error } = await supabase
      .from('users')
      .upsert(updatedUser);
    if (error) console.error('updateUser error:', error);
    else await fetchPeopleData();
  };

  const deleteUser = async (userId) => {
    // Prevent deletion of GLOBAL_ADMIN accounts
    const target = users.find(u => u.id === userId);
    if (target?.roles?.includes('GLOBAL_ADMIN')) return;
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
    updateClient,
    deleteClient,

    recordClientPayment: async (clientId, amount, date, notes, invoiceIds, paymentMethod = 'CASH') => {
      // Desktop offline-first: queue the server-side settle RPC. It runs at
      // sync time AFTER any queued sale RPCs (outbox is FIFO), so allocation
      // sees the sale that may have just been made offline. The old JS
      // orchestration below would race the unsynced sale and allocate nothing.
      if (isElectron()) {
        const payId = generateUUID();
        await queueMutation({
          table: 'settle_client_payment', type: 'rpc',
          payload: {
            p_id: payId, p_tenant_id: tenantId, p_client_id: clientId,
            p_amount: Number(amount), p_date: date, p_method: paymentMethod,
            p_notes: notes || null, p_recorded_by: currentUser?.id || null,
          },
        });
        // Optimistic: reflect the collection on the client's balance locally.
        setClients(prev => prev.map(c => c.id === clientId
          ? { ...c, outstanding_balance: Math.max(0, Number(c.outstanding_balance || 0) - Number(amount)) }
          : c));
        return { success: true, queued: true };
      }
      try {
        setLoading(true);

        // 1. Allocate payment across selected invoices (or FIFO across all
        //    unpaid/partial credit sales when no invoices are selected).
        //    Always update the linked sale so outstanding stays accurate.
        if (invoiceIds && invoiceIds.length > 0) {
          const { data: invRows } = await supabase
            .from('invoices')
            .select('id, grand_total, paid_amount, sale_id')
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
              await restUpdate('invoices', { payment_status: newStatus, paid_amount: newPaid }, { id: inv.id, tenant_id: tenantId });

              // Mirror onto the linked SALE — that's what the outstanding
              // trigger (_trg_sales_recalc_outstanding) reads. Matching by the
              // invoice id never worked (sale ids differ), so the balance never
              // recomputed and drifted. Use sale_id + the cumulative paid.
              if (inv.sale_id) {
                await restUpdate('sales',
                  { paymentStatus: newStatus, paidAmount: newPaid },
                  { id: inv.sale_id, tenant_id: tenantId });
              }
              remaining -= allocating;
              if (remaining <= 0) break;
            }
          }
        } else {
          // No invoices selected — FIFO-allocate across unpaid/partial CREDIT
          // sales so outstanding is always updated even for general payments.
          const { data: unpaidSales } = await supabase
            .from('sales')
            .select('id, "totalAmount", "paidAmount", "paymentStatus"')
            .eq('tenant_id', tenantId)
            .eq('"customerInfo"->>\'id\'', clientId)
            .in('"paymentStatus"', ['UNPAID', 'PARTIAL'])
            .eq('"paymentMethod"', 'CREDIT')
            .is('deleted_at', null)
            .order('date', { ascending: true });

          if (unpaidSales && unpaidSales.length > 0) {
            let remaining = amount;
            for (const sale of unpaidSales) {
              if (remaining <= 0) break;
              const alreadyPaid = Number(sale.paidAmount) || 0;
              const owed = Number(sale.totalAmount) - alreadyPaid;
              if (owed <= 0) continue;
              const allocating = Math.min(remaining, owed);
              const newPaid = alreadyPaid + allocating;
              const newStatus = newPaid >= Number(sale.totalAmount) ? 'PAID' : 'PARTIAL';
              await restUpdate('sales',
                { paymentStatus: newStatus, paidAmount: newPaid, lastPaymentDate: date },
                { id: sale.id, tenant_id: tenantId });
              // Mirror onto linked invoice so UI outstanding (from invoices table) stays accurate.
              const invId = `INV-${sale.id}`;
              await restUpdate('invoices',
                { payment_status: newStatus, paid_amount: newPaid },
                { id: invId, tenant_id: tenantId });
              remaining -= allocating;
            }
          }
        }

        // clients.outstanding_balance is recomputed by the DB trigger off the
        // sales updates above — never write it directly here (that races the
        // trigger and drifts the balance).

        // 2. Insert audit record into client_payments
        const { error: payErr } = await restInsert('client_payments', {
          id:             generateUUID(),
          tenant_id:      tenantId,
          client_id:      clientId,
          amount,
          date,
          payment_method: paymentMethod,
          notes:          notes || null,
          recorded_by:    currentUser?.id || null,
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
    },

    // Soft-delete a client payment and recompute all credit sales FIFO so
    // outstanding stays accurate after the reversal.
    deleteClientPayment: async (paymentId, clientId) => {
      try {
        // 1. Soft-delete the payment row.
        const { error } = await restUpdate('client_payments',
          { deleted_at: new Date().toISOString() },
          { id: paymentId, tenant_id: tenantId });
        if (error) return { error };

        // 2. Reload remaining active payments for this client (oldest first).
        const { data: remaining = [] } = await supabase
          .from('client_payments')
          .select('amount, date, created_at')
          .eq('client_id', clientId)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .order('date', { ascending: true })
          .order('created_at', { ascending: true });

        // 3. Get all unpaid/partial CREDIT sales for this client (oldest first).
        const { data: creditSales = [] } = await supabase
          .from('sales')
          .select('id, "totalAmount", "paidAmount"')
          .eq('tenant_id', tenantId)
          .filter('"customerInfo"->>\'id\'', 'eq', clientId)
          .eq('"paymentMethod"', 'CREDIT')
          .is('deleted_at', null)
          .order('date', { ascending: true });

        // 4. Reset all credit sales to 0, then replay remaining payments FIFO.
        const newPaidBySale = Object.fromEntries(creditSales.map(s => [s.id, 0]));
        let pool = remaining.reduce((t, p) => t + (Number(p.amount) || 0), 0);
        for (const sale of creditSales) {
          if (pool <= 0) break;
          const owed = Number(sale.totalAmount) || 0;
          const allocating = Math.min(pool, owed);
          newPaidBySale[sale.id] = allocating;
          pool -= allocating;
        }

        // 5. Write updated paidAmount + status back to sales + invoices.
        for (const sale of creditSales) {
          const newPaid = newPaidBySale[sale.id];
          const total = Number(sale.totalAmount) || 0;
          const newStatus = newPaid >= total ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
          await restUpdate('sales',
            { paidAmount: newPaid, paymentStatus: newStatus },
            { id: sale.id, tenant_id: tenantId });
          await restUpdate('invoices',
            { paid_amount: newPaid, payment_status: newStatus },
            { id: `INV-${sale.id}`, tenant_id: tenantId });
        }

        await fetchPeopleData();
        return { success: true };
      } catch (err) {
        console.error('deleteClientPayment Error:', err);
        return { success: false, error: err.message };
      }
    },
  };
};
