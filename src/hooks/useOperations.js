import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';

const MOVEMENT_NUMERIC = ['quantity'];

export const useOperations = (tenantId) => {
  const [routes, setRoutes] = useState([]);
  const [movementLog, setMovementLog] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOperationsData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        { data: rtData, error: rtErr },
        { data: mvData, error: mvErr },
        { data: vhData, error: vhErr }
      ] = await Promise.all([
        supabase.from('routes').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }),
        supabase.from('movement_log').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }).limit(200),
        supabase.from('vehicles').select('*').eq('tenant_id', tenantId).order('name')
      ]);

      if (rtErr) throw rtErr;
      if (mvErr) throw mvErr;
      if (vhErr) throw vhErr;

      setRoutes(rtData || []);
      setMovementLog(normalizeNumericRows(mvData, MOVEMENT_NUMERIC));
      setVehicles(vhData || []);
    } catch (err) {
      console.error("useOperations Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchOperationsData();
  }, [fetchOperationsData]);

  const addVehicle = async (vehicle) => {
    const { error } = await supabase.from('vehicles').insert({ ...vehicle, tenant_id: tenantId });
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

  const dispatchRoute = async (routeData) => {
    const { error } = await supabase.rpc('dispatch_vehicle_route', {
      p_vehicle_id: routeData.vehicleId,
      p_driver_id: routeData.driverId,
      p_location: routeData.location,
      p_odometer: routeData.initialOdometer,
      p_assigned_orders: routeData.assignedOrders,
      p_loaded_stock: routeData.loadedStock,
      p_tenant_id: tenantId
    });
    if (!error) await fetchOperationsData();
    return { success: !error, error };
  };

  const reconcileRoute = async (routeId, finalOdometer, returnedStock, actualCash) => {
    const { error } = await supabase.rpc('reconcile_vehicle_route', {
      p_route_id: routeId,
      p_final_odometer: finalOdometer,
      p_returned_stock: returnedStock,
      p_actual_cash: actualCash,
      p_tenant_id: tenantId
    });
    if (!error) await fetchOperationsData();
    return { success: !error, error };
  };

  return { 
    routes, 
    movementLog, 
    vehicles, 
    loading, 
    error, 
    refetch: fetchOperationsData,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    dispatchRoute,
    reconcileRoute
  };
};
