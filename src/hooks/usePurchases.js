import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';
import { fetchWithCache, queueMutation, upsertCachedRow, isOfflineError, readCacheThenRevalidate } from '../lib/offline/hookAdapter';
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
          () => supabase.from('purchases').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('created_at', { ascending: false, nullsFirst: false }).limit(200),
          (rows) => setData(normalizeNumericRows(rows, PURCHASE_NUMERIC)),
        ),
        readCacheThenRevalidate(
          'suppliers',
          () => supabase.from('suppliers').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('name'),
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

      // Supplier payments (small table; direct fetch). Skipped when unused.
      if (withPayments) {
        const { data: payRows } = await supabase
          .from('supplier_payments').select('*')
          .eq('tenant_id', tenantId).order('date', { ascending: false }).limit(500);
        setSupplierPayments(payRows || []);
      }
    } catch (err) {
      console.error("usePurchases Fetch Error:", err);
      setError(err.message);
    } finally {
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
    if (!tenantId) return;
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
    };
    const { error: rpcError } = await supabase.rpc('process_purchase', rpcParams);

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
    const { error } = await supabase
      .from('purchases')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) await fetchPurchases();
    return { error };
  };

  const remove = async (id) => {
    const { error } = await supabase
      .from('purchases')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) await fetchPurchases();
    return { error };
  };

  // PENDING → ORDERED → RECEIVED → (CANCELLED)
  const updateStatus = async (id, status) => {
    const allowed = ['PENDING', 'ORDERED', 'RECEIVED', 'CANCELLED'];
    if (!allowed.includes(status)) return { error: new Error('Invalid status') };
    const { error } = await supabase
      .from('purchases')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) await fetchPurchases();
    return { error };
  };

  const addReturn = async (ret) => {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('process_purchase_return', {
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
    const { error } = await supabase.rpc('settle_supplier_payment', {
      p_id:           id,
      p_tenant_id:    tenantId,
      p_supplier_id:  supplierId,
      p_amount:       Number(amount),
      p_method:       method,
      p_date:         date || new Date().toISOString().slice(0, 10),
      p_reference_no: referenceNo || null,
      p_note:         note || null,
    });
    if (error) return { error };
    await fetchPurchases();
    return { success: true, id };
  };

  // Pay a specific purchase (order). Links the payment + bumps paid_amount.
  const payPurchase = async ({ supplierId, purchaseId, amount, method = 'CASH', date, referenceNo, note }) => {
    if (!supplierId || !purchaseId)   return { error: new Error('supplierId + purchaseId required') };
    if (!(Number(amount) > 0))        return { error: new Error('amount must be positive') };
    const id = `SUPP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const { error } = await supabase.rpc('settle_purchase_payment', {
      p_id: id, p_tenant_id: tenantId, p_supplier_id: supplierId, p_purchase_id: purchaseId,
      p_amount: Number(amount), p_method: method,
      p_date: date || new Date().toISOString().slice(0, 10),
      p_reference_no: referenceNo || null, p_note: note || null,
    });
    if (error) return { error };
    await fetchPurchases();
    return { success: true, id };
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
    updateStatus,
    remove,
    addReturn,
    paySupplier,
    payPurchase,
  };
};
