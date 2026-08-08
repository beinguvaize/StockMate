import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, restRpc, restUpdate, restInsert } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';
import { fetchWithCache, queueMutation, upsertCachedRow, isOfflineError, readCacheThenRevalidate, isElectron } from '../lib/offline/hookAdapter';
import useRefetchOnFocus from './useRefetchOnFocus';

const PURCHASE_NUMERIC = ['quantity', 'total_amount', 'paid_amount', 'unit_price', 'tax'];
const RETURN_NUMERIC   = ['quantity', 'total_amount', 'unit_price'];
const SUPPLIER_NUMERIC = ['balance', 'outstanding_balance'];

// Options let a consumer skip the heavy secondary fetches it doesn't use:
//   withReturns  — purchase_returns (Dashboard/Suppliers don't need it)
//   withPayments — supplier_payments, .limit(500) (Dashboard/Purchases don't)
// Both default true → existing callers unchanged.
export const usePurchases = (tenantId, { withReturns = true, withPayments = true } = {}) => {
  const [data, setData] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const tabId = useRef(Math.random().toString(36).slice(2, 8));
  const initialLoadDone = useRef(false);
  const fetchRef = useRef(null);

  const fetchPurchases = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [purCached, supCached, retCached] = await Promise.all([
        readCacheThenRevalidate(
          'purchases',
          () => supabase.from('purchases').select('*').is('deleted_at', null).eq('tenant_id', tenantId).is('deleted_at', null).order('created_at', { ascending: false, nullsFirst: false }).limit(200),
          (rows) => setData(normalizeNumericRows(rows, PURCHASE_NUMERIC)),
        ),
        readCacheThenRevalidate(
          'suppliers',
          () => supabase.from('suppliers').select('*').is('deleted_at', null).eq('tenant_id', tenantId).is('deleted_at', null).order('name'),
          (rows) => setSuppliers(normalizeNumericRows(rows, SUPPLIER_NUMERIC)),
        ),
        withReturns
          ? readCacheThenRevalidate(
              'purchase_returns',
              () => supabase.from('purchase_returns').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('created_at', { ascending: false }).limit(200),
              (rows) => setPurchaseReturns(normalizeNumericRows(rows, RETURN_NUMERIC)),
            )
          : Promise.resolve([]),
      ]);

      setData(normalizeNumericRows(purCached, PURCHASE_NUMERIC));
      setSuppliers(normalizeNumericRows(supCached, SUPPLIER_NUMERIC));
      if (withReturns) setPurchaseReturns(normalizeNumericRows(retCached, RETURN_NUMERIC));

      // Render immediately from cache; supplier_payments revalidates in background.
      setLoading(false);
      initialLoadDone.current = true;

      if (withPayments) {
        readCacheThenRevalidate(
          'supplier_payments',
          // deleted_at matters here now: apply_supplier_advances soft-deletes an
          // advance once it has been spent across bills, replacing it with
          // allocation rows. Without this filter the spent advance kept
          // rendering as an on-account credit alongside the allocations that
          // replaced it — HASSAN's consumed Rs 2,390 was counted twice, showing
          // a closing balance of Rs 3,420 against a real Rs 5,810.
          // Every sibling fetch above already filters it; this one did not.
          () => supabase.from('supplier_payments').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('date', { ascending: false }).limit(500),
          (rows) => setSupplierPayments(rows),
        ).then(cached => setSupplierPayments(cached));
      }
    } catch (err) {
      console.error("usePurchases Fetch Error:", err);
      setError(err.message);
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [tenantId, withReturns, withPayments]);

  fetchRef.current = fetchPurchases;

  useEffect(() => {
    initialLoadDone.current = false;
    fetchRef.current?.();
  }, [tenantId]);

  useRefetchOnFocus(fetchPurchases);

  // Auto-retry once after 4 s if initial fetch fails (handles DB cold-start)
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => { fetchRef.current?.(); }, 4000);
    return () => clearTimeout(t);
  }, [error]);

  // ── Realtime — purchases + purchase_returns ───────────────────────────
  useEffect(() => {
    if (!tenantId || isElectron()) return;
    const channel = supabase
      .channel(`purchases-realtime-${tenantId}-${tabId.current}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'purchases',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchRef.current?.())
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'purchase_returns',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchRef.current?.())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  const add = async (purchase) => {
    const rpcParams = {
      p_id: purchase.id,
      p_product_id: purchase.linked_product_id,
      p_quantity: purchase.quantity,
      p_total_amount: purchase.total_amount,
      p_supplier_id: purchase.supplier_id || purchase.supplier_name,
      p_payment_type: purchase.payment_type,
      p_date: purchase.date,
      p_notes: purchase.notes,
      p_user_id: purchase.userId,
      p_location_id: purchase.locationId || null,
      p_tenant_id: tenantId,
      // Supplier's bill/invoice number — needed for invoice-level GSTR-2B match.
      p_bill_no: purchase.bill_no || null,
      // Part payment: money down with the rest on credit. Undefined when the
      // caller says nothing, and process_purchase then falls back to deciding
      // from payment_type exactly as it always did.
      p_paid_amount: purchase.paid_amount ?? null,
    };
    // Desktop offline-first: queue the RPC immediately, never wait on network.
    if (isElectron()) {
      try {
        await queueMutation({ table: 'process_purchase', type: 'rpc', payload: rpcParams });
        const cachedRow = {
          id: purchase.id,
          tenant_id: tenantId,
          linked_product_id: purchase.linked_product_id,
          quantity: purchase.quantity,
          total_amount: purchase.total_amount,
          supplier_id: purchase.supplier_id || null,
          supplier_name: purchase.supplier_name || null,
          payment_type: purchase.payment_type,
          paid_amount: purchase.paid_amount ?? null,
          date: purchase.date,
          notes: purchase.notes || null,
          status: 'PENDING',
          created_at: new Date().toISOString(),
        };
        await upsertCachedRow('purchases', cachedRow);
        setData(prev => normalizeNumericRows([cachedRow, ...prev], PURCHASE_NUMERIC));
        return { success: true, queued: true };
      } catch (qErr) { console.error('purchases add local-first queue error:', qErr); }
    }

    const { error: rpcError } = await restRpc('process_purchase', rpcParams);

    if (!rpcError) { await fetchPurchases(); return { success: true }; }

    if (isOfflineError(rpcError)) {
      try {
        await queueMutation({ table: 'process_purchase', type: 'rpc', payload: rpcParams });
        const cachedRow = {
          id: purchase.id,
          tenant_id: tenantId,
          linked_product_id: purchase.linked_product_id,
          quantity: purchase.quantity,
          total_amount: purchase.total_amount,
          supplier_id: purchase.supplier_id || null,
          supplier_name: purchase.supplier_name || null,
          payment_type: purchase.payment_type,
          paid_amount: purchase.paid_amount ?? null,
          date: purchase.date,
          notes: purchase.notes || null,
          status: 'PENDING',
          created_at: new Date().toISOString(),
        };
        await upsertCachedRow('purchases', cachedRow);
        setData(prev => normalizeNumericRows([cachedRow, ...prev], PURCHASE_NUMERIC));
        return { success: true, queued: true };
      } catch (qErr) { console.error('purchases add queue error:', qErr); }
    }
    return { error: rpcError };
  };

  const update = async (id, updates) => {
    const { error } = await restUpdate('purchases', updates, { id, tenant_id: tenantId });
    if (!error) await fetchPurchases();
    return { error };
  };

  // Edit a purchase in one transaction.
  //
  // This was five sequential calls — update the row, recost the batches,
  // resync the batch, adjust stock, reconcile the money — each able to fail on
  // its own. A failure partway left the row already changed while the batch,
  // stock or ledger still held the old values: a half-applied edit that only a
  // second save would clear. The RPC does all five inside one transaction, so
  // an edit either lands completely or not at all.
  //
  // It reads the pre-edit values itself, so the caller no longer has to
  // snapshot them.
  const editPurchase = async ({ id, productId, supplierId, quantity, totalAmount,
                                unitCost, paymentType, date, notes, userId, accountId }) => {
    const { error } = await restRpc('edit_purchase', {
      p_purchase_id:  id,
      p_tenant_id:    tenantId,
      p_product_id:   productId,
      p_supplier_id:  supplierId,
      p_quantity:     Number(quantity),
      p_total_amount: Number(totalAmount),
      p_unit_cost:    Number(unitCost) || 0,
      p_payment_type: paymentType,
      p_date:         date,
      p_notes:        notes || null,
      p_user_id:      userId,
      p_account_id:   accountId || null,
    });
    if (!error) await fetchPurchases();
    return { error };
  };

  const remove = async (id) => {
    const { error } = await restUpdate('purchases', { deleted_at: new Date().toISOString() }, { id, tenant_id: tenantId });
    if (!error) await fetchPurchases();
    return { error };
  };

  // PENDING → ORDERED → RECEIVED → (CANCELLED)
  const updateStatus = async (id, status) => {
    const allowed = ['PENDING', 'ORDERED', 'RECEIVED', 'CANCELLED'];
    if (!allowed.includes(status)) return { error: new Error('Invalid status') };
    const { error } = await restUpdate('purchases', { status }, { id, tenant_id: tenantId });
    if (!error) await fetchPurchases();
    return { error };
  };

  const addReturn = async (ret) => {
    const { data: rpcData, error: rpcErr } = await restRpc('process_purchase_return', {
      p_id:            ret.id,
      p_tenant_id:     tenantId,
      p_purchase_id:   ret.purchase_id,
      p_supplier_id:   ret.supplier_id || null,
      p_supplier_name: ret.supplier_name || null,
      p_product_id:    ret.product_id,
      p_product_name:  ret.product_name || null,
      p_quantity:      ret.quantity,
      p_unit_price:    ret.unit_price || null,
      p_total_amount:  ret.total_amount,
      p_reason:        ret.reason || null,
      p_date:          ret.date,
      p_location_id:   ret.location_id || null,
    });
    if (rpcErr) console.error('[addReturn] rpc error:', rpcErr);
    if (rpcErr) return { error: rpcErr };
    await fetchPurchases();
    return { success: true };
  };

  const paySupplier = async ({ supplierId, amount, method = 'CASH', date, referenceNo, note }) => {
    if (!supplierId)                  return { error: new Error('supplierId required') };
    if (!(Number(amount) > 0))        return { error: new Error('amount must be positive') };
    const id = `SUPP-${Date.now().toString(36).toUpperCase()}`;
    const params = {
      p_id:           id,
      p_tenant_id:    tenantId,
      p_supplier_id:  supplierId,
      p_amount:       Number(amount),
      p_method:       method,
      p_date:         date || new Date().toISOString().slice(0, 10),
      p_reference_no: referenceNo || null,
      p_note:         note || null,
    };
    // Desktop offline-first: queue the RPC.
    if (isElectron()) {
      await queueMutation({ table: 'settle_supplier_payment', type: 'rpc', payload: params });
      fetchPurchases();
      return { success: true, id, queued: true };
    }
    const { error } = await restRpc('settle_supplier_payment', params);
    if (error) return { error };
    await fetchPurchases();
    return { success: true, id };
  };

  // Pay a specific purchase (order). Links the payment + bumps paid_amount.
  const payPurchase = async ({ supplierId, purchaseId, amount, method = 'CASH', date, referenceNo, note }) => {
    if (!supplierId || !purchaseId)   return { error: new Error('supplierId + purchaseId required') };
    if (!(Number(amount) > 0))        return { error: new Error('amount must be positive') };
    const id = `SUPP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const params = {
      p_id: id, p_tenant_id: tenantId, p_supplier_id: supplierId, p_purchase_id: purchaseId,
      p_amount: Number(amount), p_method: method,
      p_date: date || new Date().toISOString().slice(0, 10),
      p_reference_no: referenceNo || null, p_note: note || null,
    };
    // Desktop offline-first: queue the RPC.
    if (isElectron()) {
      await queueMutation({ table: 'settle_purchase_payment', type: 'rpc', payload: params });
      fetchPurchases();
      return { success: true, id, queued: true };
    }
    const { error } = await restRpc('settle_purchase_payment', params);
    if (error) return { error };
    await fetchPurchases();
    return { success: true, id };
  };

  /**
   * Apply a purchase return against the supplier's open bills.
   *
   * Deliberately manual. A credit note is a claim on the supplier, not a
   * reduction of a payable: MADEENA's Rs 2,100 note is against a cash bill they
   * had already paid in full, so whether it offsets the next bill or comes back
   * as cash is a conversation with them. Nothing nets automatically.
   *
   * No money moves — the RPC books it as a CREDIT_NOTE payment row, which
   * raises the bill's paid_amount without touching any cash or bank account.
   */
  // Reversing a payment is money logic, so it runs in one statement on the
  // server: the receipt goes, the bill gets its debt back, and the supplier
  // balance rises by the same amount. Doing it here would be three writes with
  // no transaction, and a failure halfway leaves a bill part-settled against a
  // balance that matches nothing.
  const deleteSupplierPayment = async (paymentId) => {
    const { data, error } = await supabase.rpc('delete_supplier_payment', {
      p_tenant_id: tenantId,
      p_payment_id: paymentId,
    });
    if (error) {
      console.error('deleteSupplierPayment error:', error);
      return { success: false, error };
    }
    await fetchPurchases();
    return { success: true, reversed: Number(data) || 0 };
  };

  // Edit is reverse-then-reapply on the server, so the new amount is allocated
  // across open bills by the same FIFO rule that placed the original.
  const editSupplierPayment = async (paymentId, { amount, method, date, reference_no, note } = {}) => {
    const { data, error } = await supabase.rpc('edit_supplier_payment', {
      p_tenant_id: tenantId,
      p_payment_id: paymentId,
      p_amount: Number(amount),
      p_method: method ?? null,
      p_date: date ?? null,
      p_reference_no: reference_no ?? null,
      p_note: note ?? null,
    });
    if (error) {
      console.error('editSupplierPayment error:', error);
      return { success: false, error };
    }
    await fetchPurchases();
    return { success: true, newId: data };
  };

  const offsetCreditNote = async (returnId) => {
    if (!returnId) return { error: new Error('returnId required') };
    const { data: applied, error } = await restRpc('offset_supplier_credit_note', {
      p_tenant_id: tenantId, p_return_id: returnId,
    });
    if (error) return { error };
    await fetchPurchases();
    return { success: true, applied: Number(applied) || 0 };
  };

  return {
    data,
    purchases: data,
    purchaseReturns,
    supplierPayments,
    suppliers,
    loading,
    error,
    refetch: fetchPurchases,
    add,
    update,
    editPurchase,
    updateStatus,
    remove,
    addReturn,
    paySupplier,
    payPurchase,
    offsetCreditNote, deleteSupplierPayment, editSupplierPayment };
};
