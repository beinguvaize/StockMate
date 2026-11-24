import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';
import { isElectron, fetchWithCache } from '../lib/offline/hookAdapter';
import { restRpc } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { realtimeEnabled } from '../lib/realtime';
import useRefetchOnFocus from './useRefetchOnFocus';

const MOVEMENT_NUMERIC = ['quantity'];

export const useOperations = (tenantId) => {
  const { currentUser } = useAuth();
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
      // Reads go through the offline cache on desktop. Only this block: the
      // other selects in this hook are lookups inside write paths, which
      // genuinely need the server.
      //
      // The cache holds whole tables, so the filters and ordering the queries
      // applied server-side are re-applied to whatever comes back.
      const mine = (rows) => (rows || []).filter(r => r && r.tenant_id === tenantId);
      const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

      const [rtRes, mvRes, vhRes, invRes, stRes] = await Promise.all([
        fetchWithCache('routes', () =>
          supabase.from('routes').select('*').eq('tenant_id', tenantId).order('date', { ascending: false })),
        fetchWithCache('movement_log', () =>
          supabase.from('movement_log').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('date', { ascending: false }).limit(200)),
        fetchWithCache('vehicles', () =>
          supabase.from('vehicles').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('name')),
        fetchWithCache('invoices', () =>
          supabase.from('invoices')
            // tenant_id is fetched because mine() filters on it. Without it every
            // row compares undefined and the delivery list comes back empty.
            .select('id, tenant_id, invoice_number, client_name, client_id, grand_total, paid_amount, payment_status, items, delivery_status, delivery_required, vehicle_route_id, delivery_address, delivery_zone, delivery_date, delivery_notes, delivery_fee, created_at')
            .is('deleted_at', null)   // a deleted invoice is not a delivery
            .eq('tenant_id', tenantId)
            .eq('delivery_required', true)
            .in('delivery_status', ['PENDING', 'IN_TRANSIT'])
            .order('created_at', { ascending: false })),
        fetchWithCache('route_stops', () =>
          supabase.from('route_stops').select('*').eq('tenant_id', tenantId).order('sequence')),
      ]);

      const rtData  = mine(rtRes.data).sort(byDateDesc);
      const mvData  = mine(mvRes.data).sort(byDateDesc).slice(0, 200);
      const vhData  = mine(vhRes.data).filter(v => !v.deleted_at)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      // Same predicate the query carried: a delivery still to be made.
      const invData = mine(invRes.data)
        .filter(i => i.delivery_required === true &&
                     ['PENDING', 'IN_TRANSIT'].includes(i.delivery_status))
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      const stData  = mine(stRes.data)
        .sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0));

      setRoutes(rtData);
      setMovementLog(normalizeNumericRows(mvData, MOVEMENT_NUMERIC));
      setVehicles(vhData);
      setDeliveryInvoices(invData);
      setRouteStops(stData);
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

  // The dispatch board no longer holds a realtime channel on most surfaces
  // (src/lib/realtime.js), so a return to the tab is what brings it current.
  useRefetchOnFocus(fetchOperationsData);

  // ── Realtime subscriptions ───────────────────────────────────────────
  // Re-fetch whenever routes, route_stops, or inventory_balances change.
  // Critical for live dispatch board: manager sees stop updates from driver
  // instantly without manual refresh.
  useEffect(() => {
    if (!tenantId || !realtimeEnabled('operations')) return;

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
    const { error } = await supabase.from('vehicles').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', tenantId);
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

    // Lock opening stock snapshot for vehicle ledger
    try {
      await supabase.rpc('lock_van_opening_stock', {
        p_vehicle_id: routeData.vehicleId,
        p_route_id:   routeId,
        p_tenant_id:  tenantId,
      });
    } catch (lockErr) {
      console.warn('lock_van_opening_stock warn (non-fatal):', lockErr);
    }

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
  //
  // This used to INSERT the sales row straight from the client and then adjust
  // the vehicle's stock separately. Three things were wrong with that:
  //
  //   * No COGS. process_sale is what walks the FIFO batches and sets
  //     totalCogs; a sale inserted around it recorded cost ZERO, so every van
  //     sale showed the full sale value as profit.
  //   * No batch consumption, so the batches those goods came out of were
  //     never drawn down and later sales costed against stock already sold.
  //   * The line objects were keyed `productId`, while everything server-side
  //     reads `id` — so the derived sale_items rows came out with a null
  //     product, and after the blob stops being written they would not exist
  //     at all.
  //
  // Money logic belongs server-side. Passing the vehicle location makes
  // process_sale mark it VAN_SALE, deduct from that location, walk the
  // batches and write the movement log itself -- which is why the separate
  // adjust_inventory_atomic loop is gone rather than kept alongside: it would
  // have deducted the same units a second time.
  const recordVanSale = async (routeId, vehicleLocId, { clientName, items, totalAmount, paymentMethod, vehicleId }) => {
    if (!currentUser?.id) return { success: false, error: new Error('recordVanSale: not authenticated') };
    const today = new Date().toISOString().split('T')[0];
    const saleId = crypto.randomUUID();

    const { error: rpcError } = await restRpc('process_sale', {
      p_id: saleId,
      p_shop_id: null,
      // `id` is the key every server-side reader uses. `rate` matches the POS
      // so reports aggregate the two kinds of sale together.
      p_items: (items || []).map(i => ({
        id: i.productId,
        name: i.productName,
        quantity: i.quantity,
        rate: i.sellingPrice,
      })),
      p_total_amount: totalAmount,
      p_payment_method: paymentMethod || 'CASH',
      p_payment_status: 'PAID',
      p_date: today,
      p_user_id: currentUser.id,
      p_tenant_id: tenantId || null,
      p_location_id: vehicleLocId || null,
      p_route_id: routeId || null,
      p_source_app: 'WEB',
    });
    if (rpcError) {
      console.error('recordVanSale process_sale error:', rpcError);
      return { success: false, error: rpcError };
    }

    await fetchOperationsData();
    return { success: true, error: null };
  };

  // ── Load Van (Warehouse → Vehicle inventory transfer) ─────────────────
  // items: [{ productId, quantity }]
  // Returns { success, transferred, errors }
  const loadVan = async (vehicleId, items) => {
    // 1. Ensure vehicle has an inventory_locations row (create if missing)
    let { data: locRows } = await supabase
      .from('inventory_locations')
      .select('id').is('deleted_at', null)
      .eq('tenant_id', tenantId)
      .eq('type', 'VEHICLE')
      .eq('reference_id', vehicleId);

    let vehicleLocId = locRows?.[0]?.id;

    if (!vehicleLocId) {
      const { data: newLoc, error: locErr } = await supabase
        .from('inventory_locations')
        .insert({ type: 'VEHICLE', reference_id: vehicleId, name: `Van – ${vehicleId}`, tenant_id: tenantId })
        .select('id')
        .single();
      if (locErr) return { success: false, transferred: 0, errors: [locErr.message] };
      vehicleLocId = newLoc.id;
    }

    // 2. Find warehouse location (MAIN-WH or first WAREHOUSE type)
    let { data: whRows } = await supabase
      .from('inventory_locations')
      .select('id').is('deleted_at', null)
      .eq('tenant_id', tenantId)
      .eq('type', 'WAREHOUSE')
      .order('created_at', { ascending: true })
      .limit(1);

    const warehouseLocId = whRows?.[0]?.id;
    if (!warehouseLocId) return { success: false, transferred: 0, errors: ['No warehouse location found'] };

    // 3. Transfer each product: deduct warehouse + add vehicle
    let transferred = 0;
    const errors = [];

    for (const { productId, quantity } of items) {
      if (!quantity || quantity <= 0) continue;

      // Deduct from warehouse
      const { error: deductErr } = await supabase.rpc('adjust_inventory_atomic', {
        p_product_id:  productId,
        p_location_id: warehouseLocId,
        p_amount:       -quantity,
        p_reason:      `Van load to vehicle ${vehicleId}`,
        p_tenant_id:   tenantId,
      });
      if (deductErr) { errors.push(`Deduct error (${productId}): ${deductErr.message}`); continue; }

      // Add to vehicle
      const { error: addErr } = await supabase.rpc('adjust_inventory_atomic', {
        p_product_id:  productId,
        p_location_id: vehicleLocId,
        p_amount:       +quantity,
        p_reason:      `Van load from warehouse`,
        p_tenant_id:   tenantId,
      });
      if (addErr) {
        // Rollback deduct
        await supabase.rpc('adjust_inventory_atomic', {
          p_product_id:  productId,
          p_location_id: warehouseLocId,
          p_amount:       +quantity,
          p_reason:      'Rollback failed van load',
          p_tenant_id:   tenantId,
        });
        errors.push(`Add error (${productId}): ${addErr.message}`);
        continue;
      }

      transferred++;
    }

    await fetchOperationsData();
    return { success: errors.length === 0, transferred, errors };
  };

  // ── Unload Van (Vehicle → Warehouse inventory transfer) ───────────────
  // Reverse of loadVan. items: [{ productId, quantity }]
  const unloadVan = async (vehicleId, items) => {
    // 1. Vehicle location
    const { data: locRows } = await supabase
      .from('inventory_locations')
      .select('id').is('deleted_at', null)
      .eq('tenant_id', tenantId)
      .eq('type', 'VEHICLE')
      .eq('reference_id', vehicleId);
    const vehicleLocId = locRows?.[0]?.id;
    if (!vehicleLocId) return { success: false, transferred: 0, errors: ['Vehicle has no stock location'] };

    // 2. Warehouse location
    const { data: whRows } = await supabase
      .from('inventory_locations')
      .select('id').is('deleted_at', null)
      .eq('tenant_id', tenantId)
      .eq('type', 'WAREHOUSE')
      .order('created_at', { ascending: true })
      .limit(1);
    const warehouseLocId = whRows?.[0]?.id;
    if (!warehouseLocId) return { success: false, transferred: 0, errors: ['No warehouse location found'] };

    // 3. Transfer each product: deduct vehicle + add warehouse
    let transferred = 0;
    const errors = [];
    for (const { productId, quantity } of items) {
      if (!quantity || quantity <= 0) continue;

      const { error: deductErr } = await supabase.rpc('adjust_inventory_atomic', {
        p_product_id:  productId,
        p_location_id: vehicleLocId,
        p_amount:      -quantity,
        p_reason:      `Van unload to warehouse`,
        p_tenant_id:   tenantId,
      });
      if (deductErr) { errors.push(`Deduct error (${productId}): ${deductErr.message}`); continue; }

      const { error: addErr } = await supabase.rpc('adjust_inventory_atomic', {
        p_product_id:  productId,
        p_location_id: warehouseLocId,
        p_amount:      +quantity,
        p_reason:      `Van unload from vehicle ${vehicleId}`,
        p_tenant_id:   tenantId,
      });
      if (addErr) {
        await supabase.rpc('adjust_inventory_atomic', {
          p_product_id:  productId,
          p_location_id: vehicleLocId,
          p_amount:      +quantity,
          p_reason:      'Rollback failed van unload',
          p_tenant_id:   tenantId,
        });
        errors.push(`Add error (${productId}): ${addErr.message}`);
        continue;
      }
      transferred++;
    }

    await fetchOperationsData();
    return { success: errors.length === 0, transferred, errors };
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
    loadVan,
    unloadVan,
    markFailedDelivery,
    markDeliveredWithProof,
  };
};
