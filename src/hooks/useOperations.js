import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';

const MOVEMENT_NUMERIC = ['quantity'];

export const useOperations = (tenantId) => {
  const [routes,           setRoutes]           = useState([]);
  const [routeStops,       setRouteStops]       = useState([]);
  const [movementLog,      setMovementLog]      = useState([]);
  const [vehicles,         setVehicles]         = useState([]);
  const [deliveryInvoices, setDeliveryInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const tabId = useRef(Math.random().toString(36).slice(2, 8));
  const initialLoadDone = useRef(false);
  const fetchRef = useRef(null);

  const fetchOperationsData = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    if (!initialLoadDone.current) setLoading(true);
    try {
      const [
        { data: rtData,  error: rtErr  },
        { data: mvData,  error: mvErr  },
        { data: vhData,  error: vhErr  },
        { data: invData, error: invErr },
        { data: stData,  error: stErr  },
      ] = await Promise.all([
        supabase.from('routes').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }),
        supabase.from('movement_log').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }).limit(200),
        supabase.from('vehicles').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('invoices')
          .select('id, invoice_number, client_name, client_id, grand_total, paid_amount, payment_status, items, delivery_status, delivery_required, vehicle_route_id, delivery_address, delivery_zone, delivery_date, delivery_notes, delivery_fee, created_at')
          .eq('tenant_id', tenantId)
          .eq('delivery_required', true)
          .in('delivery_status', ['PENDING', 'IN_TRANSIT'])
          .order('created_at', { ascending: false }),
        supabase.from('route_stops').select('*').eq('tenant_id', tenantId).order('sequence'),
      ]);

      if (rtErr)  throw rtErr;
      if (mvErr)  throw mvErr;
      if (vhErr)  throw vhErr;
      if (invErr) console.warn('deliveryInvoices fetch warn:', invErr);
      if (stErr)  console.warn('route_stops fetch warn:', stErr);

      setRoutes(rtData || []);
      setMovementLog(normalizeNumericRows(mvData, MOVEMENT_NUMERIC));
      setVehicles(vhData || []);
      setDeliveryInvoices(invData || []);
      setRouteStops(stData || []);
    } catch (err) {
      console.error('useOperations Fetch Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [tenantId]);

  fetchRef.current = fetchOperationsData;

  useEffect(() => { initialLoadDone.current = false; fetchRef.current?.(); }, [tenantId]);

  // ── Realtime subscriptions ───────────────────────────────────────────
  // Re-fetch whenever routes, route_stops, or inventory_balances change.
  // Critical for live dispatch board: manager sees stop updates from driver
  // instantly without manual refresh.
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`ops-realtime-${tenantId}-${tabId.current}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'routes',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchRef.current?.())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'route_stops',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchRef.current?.())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'inventory_balances',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchRef.current?.())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'invoices',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchRef.current?.())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  // ── Vehicles ────────────────────────────────────────────────────────
  const addVehicle = async (vehicle) => {
    const id = crypto.randomUUID();
    const { error } = await supabase.from('vehicles').insert({ id, ...vehicle, tenant_id: tenantId });
    if (!error) await fetchOperationsData();
    return { success: !error, error };
  };

  const updateVehicle = async (vehicle) => {
    const { id, ...data } = vehicle;
    const { error } = await supabase.from('vehicles').update(data).eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchOperationsData();
    return { success: !error, error };
  };

  const deleteVehicle = async (id) => {
    const { error } = await supabase.from('vehicles').delete().eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchOperationsData();
    return { success: !error, error };
  };

  // ── Dispatch ─────────────────────────────────────────────────────────
  const dispatchRoute = async (routeData) => {
    try {
    // 1. Create route via RPC
    const { data: rpcData, error: rpcErr } = await supabase.rpc('dispatch_vehicle_route', {
      p_vehicle_id:      routeData.vehicleId,
      p_driver_id:       routeData.driverId,
      p_location:        routeData.location,
      p_odometer:        routeData.initialOdometer,
      p_assigned_orders: routeData.assignedOrders,
      p_loaded_stock:    routeData.loadedStock,
      p_tenant_id:       tenantId,
      p_target_amount:   routeData.targetAmount || 0,
    });
    if (rpcErr) return { success: false, error: rpcErr };

    const routeId = rpcData;
    // Stops + IN_TRANSIT invoice updates handled inside dispatch_vehicle_route RPC (SECURITY DEFINER)

    await fetchOperationsData();
    return { success: true, error: null };
    } catch (err) {
      console.error('dispatchRoute threw:', err);
      return { success: false, error: err };
    }
  };

  // ── Stop status update ───────────────────────────────────────────────
  const updateStopStatus = async (stopId, status, { notes, cashCollected, visitedAt } = {}) => {
    const updates = {
      status,
      visited_at:     visitedAt || new Date().toISOString(),
      notes:          notes          ?? undefined,
      cash_collected: cashCollected  ?? undefined,
    };
    // Remove undefined keys
    Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

    const { error } = await supabase
      .from('route_stops')
      .update(updates)
      .eq('id', stopId)
      .eq('tenant_id', tenantId);

    // If delivered/no-sale, also update invoice delivery_status
    if (!error) {
      const stop = routeStops.find(s => s.id === stopId);
      if (stop?.invoice_id) {
        const invStatus = status === 'DELIVERED' ? 'DELIVERED'
                        : status === 'NO_SALE'   ? 'PENDING'   // put back to pending
                        : 'IN_TRANSIT';
        await supabase.from('invoices')
          .update({ delivery_status: invStatus })
          .eq('id', stop.invoice_id)
          .eq('tenant_id', tenantId);
      }
      await fetchOperationsData();
    }
    return { success: !error, error };
  };

  // ── Reconcile ────────────────────────────────────────────────────────
  const reconcileRoute = async (routeId, finalOdometer, returnedStock, actualCash) => {
    const { error: rpcErr } = await supabase.rpc('reconcile_vehicle_route', {
      p_route_id:       routeId,
      p_final_odometer: finalOdometer,
      p_returned_stock: returnedStock,
      p_actual_cash:    actualCash,
      p_tenant_id:      tenantId,
    });
    if (rpcErr) return { success: false, error: rpcErr };

    // Mark any remaining PENDING/IN_TRANSIT stops as CLOSED
    const stopsForRoute = routeStops.filter(s => s.route_id === routeId);
    const openStopIds   = stopsForRoute
      .filter(s => s.status === 'PENDING' || s.status === 'IN_TRANSIT')
      .map(s => s.id);

    if (openStopIds.length > 0) {
      await supabase.from('route_stops')
        .update({ status: 'CLOSED' })
        .in('id', openStopIds)
        .eq('tenant_id', tenantId);
    }

    // Mark DELIVERED stops' invoices as DELIVERED
    const deliveredInvIds = stopsForRoute
      .filter(s => s.status === 'DELIVERED')
      .map(s => s.invoice_id)
      .filter(Boolean);

    if (deliveredInvIds.length > 0) {
      await supabase.from('invoices')
        .update({ delivery_status: 'DELIVERED' })
        .in('id', deliveredInvIds)
        .eq('tenant_id', tenantId);
    }

    await fetchOperationsData();
    return { success: true, error: null };
  };

  // ── Van Sale ─────────────────────────────────────────────────────────
  // Records a direct cash/credit sale made from vehicle inventory.
  // vehicleLocId: inventory_locations.id for the vehicle (caller resolves it)
  const recordVanSale = async (routeId, vehicleLocId, { clientName, items, totalAmount, paymentMethod }) => {
    const today = new Date().toISOString().split('T')[0];
    const saleId = crypto.randomUUID();

    // 1. Insert sale record (same shape as POS sales)
    const { error: saleErr } = await supabase.from('sales').insert({
      id: saleId,
      shopId: null,
      items: items.map(i => ({
        productId:   i.productId,
        name:        i.productName,
        quantity:    i.quantity,
        sellingPrice: i.sellingPrice,
        costPrice:   i.costPrice || 0,
        taxRate:     0,
      })),
      totalAmount,
      paymentMethod: paymentMethod || 'CASH',
      paymentStatus: 'PAID',
      date: today,
      bookedBy: null,
      tenant_id: tenantId,
      notes: `Van Sale — Route ${routeId}`,
    });
    if (saleErr) { console.error('recordVanSale sale insert error:', saleErr); return { success: false, error: saleErr }; }

    // 2. Deduct each item from vehicle location inventory
    if (vehicleLocId) {
      for (const item of items) {
        const { error: adjErr } = await supabase.rpc('adjust_inventory_atomic', {
          p_product_id: item.productId,
          p_location_id: vehicleLocId,
          p_delta: -item.quantity,
          p_reason: `Van Sale — Route ${routeId}`,
          p_tenant_id: tenantId,
        });
        if (adjErr) console.warn('recordVanSale inventory adjust error:', adjErr);
      }
    }

    await fetchOperationsData();
    return { success: true, error: null };
  };

  // ── Failed Delivery ────────────────────────────────────────────────────
  // Marks an invoice as FAILED, stores reason, resets to PENDING for re-queue.
  const markFailedDelivery = async (invoiceId, reason) => {
    const { error } = await supabase
      .from('invoices')
      .update({
        delivery_status:          'PENDING',          // re-queue for next dispatch
        failed_delivery_reason:   reason || 'Customer unavailable',
        vehicle_route_id:         null,               // detach from current route
      })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId);
    if (!error) await fetchOperationsData();
    return { success: !error, error };
  };

  // ── Proof of Delivery ──────────────────────────────────────────────────
  const markDeliveredWithProof = async (invoiceId, proof) => {
    const { error } = await supabase
      .from('invoices')
      .update({
        delivery_status:  'DELIVERED',
        delivery_proof:   proof || 'Confirmed by driver',
      })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId);
    if (!error) await fetchOperationsData();
    return { success: !error, error };
  };

  return {
    routes,
    routeStops,
    movementLog,
    vehicles,
    deliveryInvoices,
    loading,
    error,
    refetch: fetchOperationsData,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    dispatchRoute,
    reconcileRoute,
    updateStopStatus,
    recordVanSale,
    markFailedDelivery,
    markDeliveredWithProof,
  };
};
