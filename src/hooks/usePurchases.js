import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';
import useRefetchOnFocus from './useRefetchOnFocus';

const PURCHASE_NUMERIC = ['quantity', 'total_amount', 'paid_amount', 'unit_price', 'tax'];
const SUPPLIER_NUMERIC = ['balance', 'outstanding_balance'];

export const usePurchases = (tenantId) => {
  const [data, setData] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPurchases = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        { data: purData, error: purErr },
        { data: supData, error: supErr }
      ] = await Promise.all([
        supabase.from('purchases').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false, nullsFirst: false }).limit(200),
        supabase.from('suppliers').select('*').eq('tenant_id', tenantId).order('name')
      ]);

      if (purErr) throw purErr;
      if (supErr) throw supErr;

      setData(normalizeNumericRows(purData, PURCHASE_NUMERIC));
      setSuppliers(normalizeNumericRows(supData, SUPPLIER_NUMERIC));
    } catch (err) {
      console.error("usePurchases Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  useRefetchOnFocus(fetchPurchases);

  // Auto-retry once after 4 s if initial fetch fails (handles DB cold-start)
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => { fetchPurchases(); }, 4000);
    return () => clearTimeout(t);
  }, [error, fetchPurchases]);

  // ── Realtime — purchases + purchase_returns ───────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`purchases-realtime-${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'purchases',
        filter: `tenant_id=eq.${tenantId}`,
      }, fetchPurchases)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'purchase_returns',
        filter: `tenant_id=eq.${tenantId}`,
      }, fetchPurchases)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchPurchases]);

  const add = async (purchase) => {
    const { error: rpcError } = await supabase.rpc('process_purchase', {
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
      p_tenant_id: tenantId
    });

    if (rpcError) return { error: rpcError };
    
    await fetchPurchases();
    return { success: true };
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

  const addReturn = async (ret) => {
    console.log('[addReturn] payload:', ret);
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
    });
    console.log('[addReturn] rpc result:', { rpcData, rpcErr });
    if (rpcErr) return { error: rpcErr };
    await fetchPurchases();
    return { success: true };
  };

  return {
    data,
    purchases: data,
    suppliers,
    loading,
    error,
    refetch: fetchPurchases,
    add,
    update,
    remove,
    addReturn,
  };
};
