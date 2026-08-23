import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import useRefetchOnFocus from './useRefetchOnFocus';
import { isElectron, fetchWithCache } from '../lib/offline/hookAdapter';
import { realtimeEnabled } from '../lib/realtime';

const ORDER_NUMERIC = ['subtotal', 'discount', 'grand_total'];

const normalize = (rows) =>
  (rows || []).map(row => {
    const out = { ...row };
    ORDER_NUMERIC.forEach(col => { if (out[col] != null) out[col] = Number(out[col]); });
    return out;
  });

export const useOrders = (tenantId) => {
  const [orders,     setOrders]     = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const tabId = useRef(Math.random().toString(36).slice(2, 8));
  const initialLoadDone = useRef(false);
  const fetchRef = useRef(null);

  const fetchOrders = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    if (!initialLoadDone.current) setLoading(true);
    try {
      // Reads go through the offline cache on desktop; the cache holds whole
      // tables, so re-apply the filters and ordering the queries carried.
      const mine = (rows) => (rows || []).filter(r => r && r.tenant_id === tenantId);

      const [ordRes, plRes] = await Promise.all([
        fetchWithCache('orders', () => supabase
          .from('orders')
          .select('*').is('deleted_at', null)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(500)),
        fetchWithCache('price_lists', () => supabase
          .from('price_lists')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('tier, product_id, min_qty')),
      ]);

      const ordData = mine(ordRes.data).filter(o => !o.deleted_at)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .slice(0, 500);
      const plData = mine(plRes.data).sort((a, b) =>
        String(a.tier || '').localeCompare(String(b.tier || '')) ||
        String(a.product_id || '').localeCompare(String(b.product_id || '')) ||
        (Number(a.min_qty) || 0) - (Number(b.min_qty) || 0));

      setOrders(normalize(ordData));
      setPriceLists(plData);
    } catch (err) {
      console.error('useOrders fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [tenantId]);

  fetchRef.current = fetchOrders;

  useEffect(() => { initialLoadDone.current = false; fetchRef.current?.(); }, [tenantId]);

  useRefetchOnFocus(fetchOrders);

  // ── Realtime ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId || !realtimeEnabled('orders')) return;
    const channel = supabase
      .channel(`orders-realtime-${tenantId}-${tabId.current}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchRef.current?.())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  // ── CRUD ─────────────────────────────────────────────────────────────

  const createOrder = async (payload) => {
    const { data: id, error } = await supabase.rpc('create_order', {
      p_tenant_id:     tenantId,
      p_client_id:     payload.clientId     || null,
      p_client_name:   payload.clientName   || '',
      p_order_type:    payload.orderType    || 'B2B',
      p_price_tier:    payload.priceTier    || 'RETAIL',
      p_items:         payload.items        || [],
      p_subtotal:      payload.subtotal     || 0,
      p_discount:      payload.discount     || 0,
      p_grand_total:   payload.grandTotal   || 0,
      p_notes:         payload.notes        || null,
      p_requested_date: payload.requestedDate || null,
      p_created_by:    payload.createdBy    || null,
    });
    if (!error) await fetchOrders();
    return { success: !error, error, id };
  };

  const updateOrder = async (id, updates) => {
    const { error } = await supabase
      .from('orders')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) await fetchOrders();
    return { success: !error, error };
  };

  const advanceStatus = async (orderId, status, opts = {}) => {
    const { error } = await supabase.rpc('advance_order_status', {
      p_order_id:   orderId,
      p_status:     status,
      p_tenant_id:  tenantId,
      p_route_id:   opts.routeId   || null,
      p_sale_id:    opts.saleId    || null,
      p_invoice_id: opts.invoiceId || null,
    });
    if (!error) await fetchOrders();
    return { success: !error, error };
  };

  const deleteOrder = async (id) => {
    const { error } = await supabase
      .from('orders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) setOrders(prev => prev.filter(o => o.id !== id));
    return { success: !error, error };
  };

  // ── Price lists CRUD ─────────────────────────────────────────────────

  const upsertPrice = async ({ productId, tier, minQty = 1, price }) => {
    const { error } = await supabase
      .from('price_lists')
      .upsert({
        tenant_id:  tenantId,
        product_id: productId,
        tier:       tier.toUpperCase(),
        min_qty:    minQty,
        price,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,tier,product_id,min_qty' });
    if (!error) await fetchOrders();
    return { success: !error, error };
  };

  const deletePrice = async ({ productId, tier, minQty = 1 }) => {
    const { error } = await supabase
      .from('price_lists')
      .delete()
      .eq('tenant_id',  tenantId)
      .eq('product_id', productId)
      .eq('tier',       tier.toUpperCase())
      .eq('min_qty',    minQty);
    if (!error) await fetchOrders();
    return { success: !error, error };
  };

  return {
    orders,
    priceLists,
    loading,
    error,
    refetch: fetchOrders,
    createOrder,
    updateOrder,
    advanceStatus,
    deleteOrder,
    upsertPrice,
    deletePrice,
  };
};
