import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';
import VanLoadBuilder from '../components/VanLoadBuilder';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { useOperations } from '../hooks/useOperations';
import { useInventory } from '../hooks/useInventory';
import { usePeople } from '../hooks/usePeople';
import { todayISOInAppTZ } from '../lib/utils';
import { money } from '../lib/clientView';
import { Tabs } from '../components/ui/Tabs';
import { PageSkeleton } from '../components/ui/States';
import { failWords } from '../components/estimates/parts';
import {
  activeRoutesOf, pastRoutesOf, pendingOf, sumGrand, serviceBanner, serviceSummary, statusSummary, onRoadSummary,
  stockOnBoard, vanCurrentStock, vanStockData, warehouseItems, vanUnloadItems, vanQtyMap, warehouseQtyMap,
  stopsOf, vehicleIdOf, driverIdOf, deleteBlock, recentTripsFor, serviceStatus,
} from '../lib/vehiclesView';
import { Strip } from '../components/vehicles/parts';
import DeliveriesTab from '../components/vehicles/DeliveriesTab';
import FleetTab from '../components/vehicles/FleetTab';
import StockTab from '../components/vehicles/StockTab';
import VehiclePanel from '../components/vehicles/VehiclePanel';
import DispatchScreen from '../components/vehicles/DispatchScreen';
import { VehicleFormDialog, DeleteVehicleDialog, FailedDeliveryDialog, EndTripDialog } from '../components/vehicles/VehicleDialogs';

const VehicleLiveMap = lazy(() => import('../components/VehicleLiveMap'));

/**
 * Vehicles (approved boards vehicles-01 to 22): deliveries waiting, trips on
 * the road, the fleet, stock on each van and the live map. View rules are in
 * lib/vehiclesView.
 *
 * Every write goes through the same useOperations call as before: vehicle
 * add / edit / delete, dispatchRoute, updateStopStatus, markFailedDelivery,
 * reconcileRoute, loadVan / unloadVan, and recordVanSale (VanSalePage). A
 * failure now shows the server's reason, or "may have saved" when the
 * connection dropped, instead of closing silently.
 */
const Vehicles = () => {
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { addNotification } = useNotifications();
  const sym = businessProfile?.currencySymbol || '₹';
  const today = todayISOInAppTZ();

  const {
    vehicles, addVehicle, updateVehicle, deleteVehicle, loading, refetch,
    routes, dispatchRoute, reconcileRoute,
    deliveryInvoices, routeStops, updateStopStatus,
    markFailedDelivery, loadVan, unloadVan,
  } = useOperations(currentTenantId);
  const { products, inventoryLocations, inventoryBalances, refetch: refetchInventory } = useInventory(currentTenantId);
  const { employees, clients } = usePeople(currentTenantId);

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('DELIVERIES');
  const [deliverySub, setDeliverySub] = useState('PENDING'); // PENDING | ACTIVE | HISTORY
  const [screen, setScreen] = useState(null);                // { kind: 'dispatch' } | { kind: 'load'|'unload', vehicle }
  const [form, setForm] = useState(null);                    // { vehicle: obj|null }
  const [panelId, setPanelId] = useState(null);
  const [delVehicle, setDelVehicle] = useState(null);
  const [failedInv, setFailedInv] = useState(null);
  const [endRoute, setEndRoute] = useState(null);
  const [busyStop, setBusyStop] = useState(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeRoutes = useMemo(() => activeRoutesOf(routes), [routes]);
  const pastRoutes = useMemo(() => pastRoutesOf(routes), [routes]);
  const pending = useMemo(() => pendingOf(deliveryInvoices), [deliveryInvoices]);
  const stockData = useMemo(() => vanStockData(vehicles, inventoryLocations, inventoryBalances, products, activeRoutes),
    [vehicles, inventoryLocations, inventoryBalances, products, activeRoutes]);
  const banner = serviceBanner(vehicles, today);
  const serviceDue = vehicles.filter((v) => serviceStatus(v.nextServiceDate, today)).length;

  const driverName = (id) => employees.find((e) => e.id === id)?.name || 'Unknown Driver';
  const stockOf = (vehicleId) => stockOnBoard(vehicleId, inventoryLocations, inventoryBalances);
  const inTripOf = (vehicleId) => activeRoutes.some((r) => vehicleIdOf(r) === vehicleId);
  const reread = () => { refetch?.(); refetchInventory?.(); };

  // ── Writes (same calls as before) ──────────────────────────────────────────
  const saveVehicle = (payload, editing) => (editing ? updateVehicle(payload) : addVehicle(payload));

  const markStop = async (stop, status) => {
    setBusyStop(stop.id);
    let res;
    try { res = await updateStopStatus(stop.id, status); } catch (e) { res = { error: e }; }
    setBusyStop(null);
    if (res?.error) { console.error('[vehicles] stop update failed', res.error); addNotification(failWords(res.error, 'stop update'), 'error', 9000); }
  };

  const endTrip = (route, returnedStock, cash) => reconcileRoute(route.id, 0, returnedStock, cash);

  // Van sale: same lookup and hand-off as before (VanSalePage records it).
  const openVanSale = async (route) => {
    const vehicleId = vehicleIdOf(route);
    let vehicleLoc = inventoryLocations.find((l) => l.reference_id === vehicleId && l.type === 'VEHICLE');
    let balances = vehicleLoc ? inventoryBalances.filter((b) => b.location_id === vehicleLoc.id && b.quantity > 0) : [];
    if (!vehicleLoc || balances.length === 0) {
      const { data: locData } = await supabase
        .from('inventory_locations')
        .select('*').is('deleted_at', null)
        .eq('type', 'VEHICLE')
        .eq('reference_id', vehicleId)
        .maybeSingle();
      if (locData) {
        vehicleLoc = locData;
        const { data: balData } = await supabase
          .from('inventory_balances')
          .select('*')
          .eq('location_id', locData.id)
          .gt('quantity', 0);
        balances = balData || [];
      }
    }
    const items = balances
      .map((b) => {
        const prod = products.find((p) => p.id === b.product_id);
        return {
          productId: b.product_id,
          productName: prod?.name || b.product_id,
          qty: 0,
          sellingPrice: prod?.sellingPrice ?? prod?.selling_price ?? 0,
          costPrice: prod?.costPrice ?? prod?.cost_price ?? 0,
          maxQty: Number(b.quantity),
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName));
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    navigate('/vehicles/van-sale', {
      state: {
        route: { ...route, _vehicleLocId: vehicleLoc?.id },
        vehicle,
        vanItems: items,
        clients,
        vehicleLocId: vehicleLoc?.id,
        driverName: driverName(driverIdOf(route)),
      },
    });
  };

  if (loading) return <PageSkeleton cards={4} rows={6} />;

  // ── Full-page flows (dispatch, load, unload) ───────────────────────────────
  if (screen?.kind === 'dispatch') {
    return (
      <DispatchScreen vehicles={vehicles} employees={employees} pending={pending} deliveryInvoices={deliveryInvoices}
        vanStockFor={(id) => vanCurrentStock(id, inventoryLocations, inventoryBalances, products)} today={today} sym={sym}
        onDispatch={dispatchRoute} onReread={reread} onClose={() => setScreen(null)}
        onDone={() => { setScreen(null); setActiveTab('DELIVERIES'); setDeliverySub('ACTIVE'); }} />
    );
  }
  if (screen?.kind === 'load' || screen?.kind === 'unload') {
    const v = screen.vehicle;
    const unload = screen.kind === 'unload';
    const wh = warehouseQtyMap(inventoryLocations, inventoryBalances);
    const van = vanQtyMap(v.id, inventoryLocations, inventoryBalances);
    const submit = async ({ items }) => {
      const res = await (unload ? unloadVan(v.id, items) : loadVan(v.id, items));
      refetchInventory?.();
      return res;
    };
    return (
      <VanLoadBuilder key={`${screen.kind}-${v.id}`} mode={screen.kind} vehicle={v}
        warehouseItems={unload ? vanUnloadItems(v.id, inventoryLocations, inventoryBalances, products) : warehouseItems(products, inventoryLocations, inventoryBalances)}
        fromNow={unload ? van : wh} toNow={unload ? wh : van}
        onSubmit={submit} onRecheck={reread} onClose={() => setScreen(null)} />
    );
  }

  const openLoad = (v) => { setPanelId(null); setScreen({ kind: 'load', vehicle: v }); };
  const openUnload = (v) => { setPanelId(null); setScreen({ kind: 'unload', vehicle: v }); };
  const canManageFleet = hasPermission('MANAGE_FLEET');

  const svcBanner = banner && (
    <div className="m-rise mb-4 flex flex-wrap items-center gap-2.5 rounded-xl bg-amber-soft px-3.5 py-2.5 text-[13px] text-amber-text" style={{ '--i': 2 }}>
      <Wrench size={16} className="shrink-0" aria-hidden="true" />
      <span>Service due: {banner.map((b, i) => <React.Fragment key={b.name + i}>{i > 0 && ' · '}<b className="font-semibold">{b.name}</b> {b.words}</React.Fragment>)}</span>
      {activeTab !== 'FLEET' && (
        <button type="button" onClick={() => setActiveTab('FLEET')} className="ml-auto font-tight text-[12.5px] font-semibold text-amber-text underline-offset-4 hover:underline">See fleet</button>
      )}
    </div>
  );

  const panelVehicle = panelId ? vehicles.find((v) => v.id === panelId) : null;
  const panelStock = panelVehicle ? stockData.find((d) => d.vehicle.id === panelVehicle.id) : null;
  const endVehicle = endRoute ? vehicles.find((v) => v.id === vehicleIdOf(endRoute)) : null;

  return (
    <div className="flex flex-col pb-16">
      <Tabs className="m-rise mb-5" ariaLabel="Vehicles" value={activeTab} onChange={setActiveTab} items={[
        { key: 'DELIVERIES', label: 'Deliveries', count: pending.length },
        { key: 'FLEET', label: 'Fleet', count: vehicles.length },
        { key: 'VAN_STOCK', label: 'Stock' },
        { key: 'LIVE', label: 'Live map' },
      ]} />

      {activeTab === 'DELIVERIES' && (
        <>
          <Strip className="m-rise" style={{ '--i': 1 }} items={[
            { label: 'Waiting to go out', value: pending.length, sub: `${pending.length === 1 ? 'delivery' : 'deliveries'} · ${money(sumGrand(pending), sym)}` },
            { label: 'On the road', value: activeRoutes.length, sub: onRoadSummary(activeRoutes, vehicles, driverName) },
            { label: 'Service due', value: serviceDue, sub: serviceSummary(vehicles, today), tone: serviceDue ? 'warn' : undefined },
            { label: 'Vehicles', value: vehicles.length, sub: statusSummary(vehicles) || 'none yet' },
          ]} />
          {svcBanner}
          <DeliveriesTab sub={deliverySub} onSub={setDeliverySub} pending={pending} activeRoutes={activeRoutes} pastRoutes={pastRoutes}
            routeStops={routeStops} deliveryInvoices={deliveryInvoices} vehicles={vehicles} driverName={driverName}
            locations={inventoryLocations} balances={inventoryBalances} sym={sym}
            canFail={hasPermission('OWNER')} canManageFleet={canManageFleet}
            canVanSale={hasRole('DRIVER') || hasRole('OWNER') || hasRole('GLOBAL_ADMIN')} busyStop={busyStop}
            onFail={setFailedInv} onDispatch={() => setScreen({ kind: 'dispatch' })} onAddVehicle={() => setForm({ vehicle: null })}
            onVanSale={openVanSale} onEndTrip={setEndRoute} onMarkStop={markStop} />
        </>
      )}

      {activeTab === 'FLEET' && (
        <FleetTab vehicles={vehicles} today={today} stockOf={stockOf} inTripOf={inTripOf} canManageFleet={canManageFleet}
          banner={svcBanner} onAdd={() => setForm({ vehicle: null })} onOpen={(v) => setPanelId(v.id)}
          onLoad={openLoad} onEdit={(v) => setForm({ vehicle: v })} onDelete={setDelVehicle} />
      )}

      {activeTab === 'VAN_STOCK' && <StockTab data={stockData} sym={sym} onLoad={openLoad} onUnload={openUnload} />}

      {activeTab === 'LIVE' && (
        <Suspense fallback={<div className="grid h-64 place-items-center rounded-[14px] border border-line bg-surface text-[13px] text-mute">Loading map…</div>}>
          <VehicleLiveMap vehicles={vehicles} tenantId={currentTenantId} />
        </Suspense>
      )}

      {panelVehicle && panelStock && (
        <VehiclePanel vehicle={panelVehicle} stock={panelStock} onTrip={inTripOf(panelVehicle.id)} today={today}
          recentTrips={recentTripsFor(panelVehicle.id, pastRoutes)} driverName={driverName} sym={sym} canManageFleet={canManageFleet}
          onClose={() => setPanelId(null)} onEdit={(v) => { setPanelId(null); setForm({ vehicle: v }); }}
          onUnload={openUnload} onDelete={(v) => { setPanelId(null); setDelVehicle(v); }} onLoad={openLoad} />
      )}

      {form && <VehicleFormDialog key={form.vehicle?.id || 'new'} vehicle={form.vehicle} onSave={saveVehicle} onClose={() => setForm(null)} onReread={reread} />}

      {delVehicle && (
        <DeleteVehicleDialog vehicle={delVehicle} units={stockOf(delVehicle.id)}
          blocked={deleteBlock(delVehicle, activeRoutes, stockOf(delVehicle.id))}
          onDelete={(v) => deleteVehicle(v.id)} onClose={() => setDelVehicle(null)} onReread={reread} />
      )}

      {failedInv && (
        <FailedDeliveryDialog invoice={failedInv} sym={sym} onConfirm={(inv, reason) => markFailedDelivery(inv.id, reason)}
          onClose={() => setFailedInv(null)} onReread={reread} />
      )}

      {endRoute && (
        <EndTripDialog key={endRoute.id} route={endRoute} vehicle={endVehicle} driver={driverName(driverIdOf(endRoute))}
          stops={stopsOf(routeStops, endRoute.id)} products={products}
          vanNow={vanQtyMap(vehicleIdOf(endRoute), inventoryLocations, inventoryBalances)} sym={sym}
          onEnd={endTrip} onClose={() => setEndRoute(null)} onReread={reread} />
      )}
    </div>
  );
};

export default Vehicles;
