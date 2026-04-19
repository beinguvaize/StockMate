import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export const useSales = (tenantId) => {
  const { currentUser } = useAuth();
  const [data, setData] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSales = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        { data: salesData, error: salesErr },
        { data: clientsData, error: clientsErr }
      ] = await Promise.all([
        supabase.from('sales').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }).limit(500),
        supabase.from('clients').select('*').eq('tenant_id', tenantId).order('name')
      ]);

      if (salesErr) throw salesErr;
      if (clientsErr) throw clientsErr;

      setData(salesData || []);
      setClients(clientsData || []);
    } catch (err) {
      console.error("useSales Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Deprecated in favor of placeSale() returned below, which matches the
  // actual process_sale RPC signature. Kept to preserve the update/remove
  // flow below — not exported. If future callers need a low-level add,
  // delegate to placeSale.
  const add = async (sale) => {
    if (!currentUser?.id) return { error: new Error('add: not authenticated') };
    const items = (sale.items || []).map(i => ({
      id: i.productId || i.id,
      quantity: i.quantity,
      name: i.name,
    }));
    const { error: rpcError } = await supabase.rpc('process_sale', {
      p_id: sale.id,
      p_shop_id: sale.clientId === 'WALKIN' ? null : sale.clientId,
      p_items: items,
      p_total_amount: sale.totalAmount,
      p_payment_method: sale.paymentMethod || 'CASH',
      p_payment_status: sale.status === 'COMPLETED' ? 'PAID' : (sale.status || 'PENDING'),
      p_date: sale.date || new Date().toISOString().split('T')[0],
      p_user_id: currentUser.id,
      p_location_id: sale.locationId || null,
    });
    if (rpcError) return { error: rpcError };
    await fetchSales();
    return { success: true };
  };

  const update = async (id, updates) => {
    const { error } = await supabase
      .from('sales')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) await fetchSales();
    return { error };
  };

  const remove = async (id) => {
    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) await fetchSales();
    return { error };
  };

  const settlePayment = async (saleId, amount) => {
     // ... logic to update paidAmount and status
     const { error } = await supabase.rpc('settle_sale_payment', {
        p_sale_id: saleId,
        p_amount: amount,
        p_tenant_id: tenantId
     });
     if (!error) await fetchSales();
     return { error };
  };

  return { 
    data, 
    sales: data, 
    clients, 
    loading, 
    error, 
    refetch: fetchSales, 
    // Accepts a single sale object from the POS. Maps client-side sale shape
    // onto public.process_sale's actual RPC signature:
    //   (p_id, p_shop_id, p_items, p_total_amount, p_payment_method,
    //    p_payment_status, p_date, p_user_id, p_location_id).
    // The RPC resolves tenant_id internally from p_user_id -> users table, so
    // tenantId is not passed. Items must carry {id, quantity, name} — the RPC
    // reads those three keys when deducting stock, so productId is remapped
    // to id here. Errors are returned to the caller instead of swallowed.
    placeSale: async (sale) => {
      if (!sale || typeof sale !== 'object') {
        return { error: new Error('placeSale: sale payload required') };
      }
      if (!currentUser?.id) {
        return { error: new Error('placeSale: not authenticated') };
      }

      const id = sale.id || `SAL-${Date.now()}`;
      const clientId = sale.clientId === 'WALKIN' ? null : (sale.clientId ?? null);
      const items = (sale.items || []).map(i => ({
        id: i.productId || i.id,
        quantity: i.quantity,
        name: i.name,
      }));
      const totalAmount = sale.totalAmount ?? 0;
      const paymentStatus = sale.status === 'COMPLETED' ? 'PAID' : (sale.status || 'PENDING');

      const { error: rpcError } = await supabase.rpc('process_sale', {
        p_id: id,
        p_shop_id: clientId,
        p_items: items,
        p_total_amount: totalAmount,
        p_payment_method: sale.paymentMethod || 'CASH',
        p_payment_status: paymentStatus,
        p_date: sale.date || new Date().toISOString().split('T')[0],
        p_user_id: currentUser.id,
        p_location_id: sale.locationId || null,
      });

      if (rpcError) {
        console.error('placeSale RPC Error:', rpcError);
        return { error: rpcError };
      }

      await fetchSales();
      return { success: true, id };
    },
    updateSale: update, 
    deleteSale: remove,
    settleSale: settlePayment 
  };
};
