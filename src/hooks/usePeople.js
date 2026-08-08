import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, restInsert, restUpdate, restRpc } from '../lib/supabase';
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
        // Optimistic: reflect the collection on the client's balance locally —
        // BOTH React state and the IDB cache, otherwise an app reload/offline
        // read serves the stale cached balance and the number "jumps back".
        const cur = clients.find(c => c.id === clientId);
        if (cur) {
          const updated = { ...cur, outstanding_balance: Math.max(0, Number(cur.outstanding_balance || 0) - Number(amount)) };
          await upsertCachedRow('clients', updated);
        }
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
          // Selection may mix real invoices and SALE:-prefixed synthetic rows
          // (part-paid cash sales without an invoice, listed alongside).
          const realInvoiceIds = invoiceIds.filter(x => !String(x).startsWith('SALE:'));
          const saleOnlyIds    = invoiceIds.filter(x => String(x).startsWith('SALE:')).map(x => String(x).slice(5));
          let remaining = amount;

          if (realInvoiceIds.length > 0) {
            const { data: invRows } = await supabase
              .from('invoices')
              .select('id, grand_total, paid_amount, sale_id')
              .in('id', realInvoiceIds)
              .eq('tenant_id', tenantId);

            for (const inv of (invRows || [])) {
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

          // Selected cash sales (no invoice) — allocate the rest directly on
          // the sale rows; the outstanding trigger recomputes from these and
          // the sale-ledger trigger reposts Cash & Bank for the new paid
          // amount. This portion must stay OUT of the client_payments audit
          // row below: the FIFO replay trigger re-allocates the whole
          // client_payments pool across CREDIT sales, so including it would
          // hand the same money to credit sales again (double-count), and
          // the payment-ledger trigger would double-post Cash & Bank.
          let saleAllocated = 0;
          if (saleOnlyIds.length > 0 && remaining > 0) {
            const { data: saleRows } = await supabase
              .from('sales')
              .select('id, "totalAmount", "paidAmount"')
              .in('id', saleOnlyIds)
              .eq('tenant_id', tenantId);

            for (const sale of (saleRows || [])) {
              const alreadyPaid = Number(sale.paidAmount) || 0;
              const owed = Number(sale.totalAmount) - alreadyPaid;
              if (owed <= 0) continue;
              const allocating = Math.min(remaining, owed);
              const newPaid = alreadyPaid + allocating;
              const newStatus = newPaid >= Number(sale.totalAmount) ? 'PAID' : 'PARTIAL';
              await restUpdate('sales',
                { paymentStatus: newStatus, paidAmount: newPaid, lastPaymentDate: date },
                { id: sale.id, tenant_id: tenantId });
              saleAllocated += allocating;
              remaining -= allocating;
              if (remaining <= 0) break;
            }
          }

          // 2. Audit record — credit/invoice portion only (see note above).
          const auditAmount = Math.max(0, Number(amount) - saleAllocated);
          if (auditAmount > 0) {
            const { error: payErr } = await restInsert('client_payments', {
              id:             generateUUID(),
              tenant_id:      tenantId,
              client_id:      clientId,
              amount:         auditAmount,
              date,
              payment_method: paymentMethod,
              notes:          notes || null,
              recorded_by:    currentUser?.id || null,
            });
            if (payErr) console.warn('Payment audit insert failed:', payErr);
          }

          await fetchPeopleData();
          return { success: true };
        } else {
          // No invoices selected — allocation now lives server-side in the
          // settle_client_payment RPC (FIFO across ALL unpaid/partial sales,
          // credit AND part-paid cash/UPI, oldest first). One implementation
          // for web, desktop outbox and mobile. The RPC also inserts the
          // client_payments audit row, so return directly from this branch.
          const { error: rpcErr } = await restRpc('settle_client_payment', {
            p_id: generateUUID(),
            p_tenant_id: tenantId,
            p_client_id: clientId,
            p_amount: Number(amount),
            p_date: date,
            p_method: paymentMethod,
            p_notes: notes || null,
            p_recorded_by: currentUser?.id || null,
          });
          if (rpcErr) throw new Error(rpcErr.message || 'Settlement failed');
          await fetchPeopleData();
          return { success: true };
        }

        // (Both branches above return; clients.outstanding_balance is always
        // recomputed by DB triggers — never written directly here.)
      } catch (err) {
        console.error('recordClientPayment Error:', err);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },

    // Soft-delete a client payment and recompute all credit sales FIFO so
    // outstanding stays accurate after the reversal.
    // Edits the receipt in place and replays the client's allocations. NOT
    // reverse-and-re-settle: settle_client_payment only writes a receipt row
    // for the part not absorbed by a cash sale, so re-settling could apply the
    // money and leave no record of the receipt.
    editClientPayment: async (paymentId, { amount, method, date, notes } = {}) => {
      const { data, error } = await supabase.rpc('edit_client_payment', {
        p_tenant_id: tenantId,
        p_payment_id: paymentId,
        p_amount: Number(amount),
        p_method: method ?? null,
        p_date: date ?? null,
        p_notes: notes ?? null,
      });
      if (error) {
        console.error('editClientPayment error:', error);
        return { success: false, error };
      }
      await fetchPeopleData();
      return { success: true, amount: Number(data) || 0 };
    },

    deleteClientPayment: async (paymentId) => {
      // One statement on the server. This used to soft-delete the receipt, then
      // re-read, recompute and write each affected sale in a loop from here --
      // so a failure part-way left the receipt gone and the sales still showing
      // it, with outstanding matching neither.
      try {
        const { data, error } = await supabase.rpc('delete_client_payment', {
          p_tenant_id: tenantId,
          p_payment_id: paymentId,
        });
        if (error) {
          console.error('deleteClientPayment error:', error);
          return { success: false, error };
        }
        await fetchPeopleData();
        return { success: true, reversed: Number(data) || 0 };
      } catch (err) {
        console.error('deleteClientPayment Error:', err);
        return { success: false, error: err.message };
      }
    },
  };
};
