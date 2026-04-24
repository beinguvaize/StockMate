import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';

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

  return { 
    data, 
    purchases: data, 
    suppliers, 
    loading, 
    error, 
    refetch: fetchPurchases, 
    add, 
    update, 
    remove 
  };
};
