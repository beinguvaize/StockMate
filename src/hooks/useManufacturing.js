import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * useManufacturing — BOM recipes + production orders + cost roll-up.
 */
export function useManufacturing(tenantId) {
  const [boms, setBoms]                   = useState([]);
  const [bomComponents, setBomComponents] = useState([]);
  const [orders, setOrders]               = useState([]);
  const [orderMaterials, setOrderMaterials] = useState([]);
  const [orderCosts, setOrderCosts]       = useState([]);
  const [loading, setLoading]             = useState(true);

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [b, bc, o, om, oc] = await Promise.all([
        supabase.from('bom').select('*').eq('tenant_id', tenantId).is('deleted_at', null),
        supabase.from('bom_components').select('*').eq('tenant_id', tenantId).is('deleted_at', null),
        supabase.from('production_orders').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('production_order_materials').select('*').eq('tenant_id', tenantId).is('deleted_at', null),
        supabase.from('production_costs').select('*').eq('tenant_id', tenantId).is('deleted_at', null),
      ]);
      setBoms(b.data || []);
      setBomComponents(bc.data || []);
      setOrders(o.data || []);
      setOrderMaterials(om.data || []);
      setOrderCosts(oc.data || []);
    } catch (e) {
      console.error('useManufacturing fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── BOM ─────────────────────────────────────────────────────────────
  const createBom = async ({ finishedProductId, name, outputQty, components }) => {
    try {
      const { data: bom, error } = await supabase.from('bom')
        .insert({ tenant_id: tenantId, finished_product_id: finishedProductId, name, output_qty: outputQty })
        .select().single();
      if (error) return { success: false, error };
      const rows = (components || [])
        .filter(c => c.productId && Number(c.quantity) > 0)
        .map(c => ({
          tenant_id: tenantId, bom_id: bom.id,
          raw_product_id: c.productId, quantity: Number(c.quantity),
          unit: c.unit === 'SECONDARY' ? 'SECONDARY' : 'BASE',
        }));
      if (rows.length) {
        const { error: ce } = await supabase.from('bom_components').insert(rows);
        if (ce) return { success: false, error: ce };
      }
      await fetchAll();
      return { success: true };
    } catch (e) {
      return { success: false, error: e };
    }
  };

  const deleteBom = async (id) => {
    await supabase.from('bom').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    await fetchAll();
  };

  // ── Production orders ───────────────────────────────────────────────
  const createProductionOrder = async ({ bomId, finishedProductId, qtyProduced, materials, costs, notes, productionDate }) => {
    try {
      const { data: order, error } = await supabase.from('production_orders')
        .insert({
          tenant_id: tenantId, bom_id: bomId || null,
          finished_product_id: finishedProductId,
          qty_produced: Number(qtyProduced), notes: notes || null,
          ...(productionDate ? { production_date: productionDate } : {}),
        })
        .select().single();
      if (error) return { success: false, error };

      const matRows = (materials || [])
        .filter(m => m.productId && Number(m.quantity) > 0)
        .map(m => ({ tenant_id: tenantId, production_order_id: order.id, raw_product_id: m.productId, qty_consumed: Number(m.quantity) }));
      if (matRows.length) {
        const { error: me } = await supabase.from('production_order_materials').insert(matRows);
        if (me) return { success: false, error: me };
      }

      const costRows = (costs || [])
        .filter(c => Number(c.amount) > 0)
        .map(c => ({ tenant_id: tenantId, production_order_id: order.id, cost_type: c.type || 'OTHER', label: c.label || null, amount: Number(c.amount) }));
      if (costRows.length) {
        const { error: ce } = await supabase.from('production_costs').insert(costRows);
        if (ce) return { success: false, error: ce };
      }

      await fetchAll();
      return { success: true };
    } catch (e) {
      return { success: false, error: e };
    }
  };

  const completeOrder = async (orderId) => {
    try {
      const { data, error } = await supabase.rpc('complete_production_order', {
        p_order_id: orderId, p_tenant_id: tenantId,
      });
      if (error) return { success: false, error };
      if (data?.success === false) return { success: false, error: { message: data.error } };
      await fetchAll();
      return { success: true, ...data };
    } catch (e) {
      return { success: false, error: e };
    }
  };

  const deleteOrder = async (id) => {
    await supabase.from('production_orders').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    await fetchAll();
  };

  return {
    boms, bomComponents, orders, orderMaterials, orderCosts, loading,
    refetch: fetchAll,
    createBom, deleteBom,
    createProductionOrder, completeOrder, deleteOrder,
  };
}
