import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import VanLoadBuilder from '../components/VanLoadBuilder';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useOperations } from '../hooks/useOperations';
import { useInventory } from '../hooks/useInventory';
import { usePeople } from '../hooks/usePeople';
import {
  Truck, Plus, Play, X, AlertTriangle,
  Navigation, Calendar, ShieldCheck, Save, History,
  CheckCircle2, Edit3, Trash2, Wrench, Activity,
  Fuel, Package, Check, XCircle, Clock, ChevronDown,
  ShoppingCart, MinusCircle, PackagePlus, Map,
  MapPin, AlertOctagon, Filter, RotateCcw,
  BarChart2, TrendingDown, AlertCircle, Layers,
} from 'lucide-react';
import { todayISOInAppTZ } from '../lib/utils';

const VehicleLiveMap = lazy(() => import('../components/VehicleLiveMap'));

// ── Constants ────────────────────────────────────────────────────────────────
const VEHICLE_TYPES    = ['VAN', 'TRUCK', 'BIKE', 'CAR', 'OTHER'];
const FUEL_TYPES       = ['PETROL', 'DIESEL', 'ELECTRIC', 'CNG', 'HYBRID'];
const VEHICLE_STATUSES = ['ACTIVE', 'IN_SERVICE', 'MAINTENANCE', 'BREAKDOWN'];

const STATUS_STYLES = {
  ACTIVE:      { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  label: 'Active'      },
  IN_SERVICE:  { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500',   label: 'In Service'  },
  MAINTENANCE: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500', label: 'Maintenance' },
  BREAKDOWN:   { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    label: 'Breakdown'   },
};

const EMPTY_VEHICLE_FORM = {
  name: '', plate: '', type: 'VAN', status: 'ACTIVE',
  capacity: '', fuelType: 'PETROL', color: '', year: '',
  lastServiceDate: '', nextServiceDate: '',
};

const serviceStatus = (d) => {
  if (!d) return null;
  const diff = (new Date(d) - new Date()) / 86400000;
  if (diff < 0)  return 'overdue';
  if (diff <= 7) return 'soon';
  return null;
};

// ── Component ────────────────────────────────────────────────────────────────
const Vehicles = () => {
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuth();
  const { currentTenantId, businessProfile, currentTenant } = useTenant();
  const sym = businessProfile?.currencySymbol || '₹';

  const {
    vehicles, addVehicle, updateVehicle, deleteVehicle,
    routes, dispatchRoute, reconcileRoute,
    deliveryInvoices, routeStops, updateStopStatus, recordVanSale,
    markFailedDelivery, markDeliveredWithProof, loadVan, unloadVan,
  } = useOperations(currentTenantId);

  const { products, inventoryLocations, inventoryBalances } = useInventory(currentTenantId);
  const { employees, clients } = usePeople(currentTenantId);

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab,          setActiveTab]          = useState('DELIVERIES');
  const [deliverySubTab,     setDeliverySubTab]     = useState('PENDING');   // PENDING | ACTIVE | HISTORY
  const [showVehicleModal,   setShowVehicleModal]   = useState(false);
  const [showDispatchModal,  setShowDispatchModal]  = useState(false);
  useDialogClose(() => setShowDispatchModal(false), { enabled: showDispatchModal });
  const [reconcileRoute_,    setReconcileRoute]     = useState(null);  // route obj
  const [reconcileCash,      setReconcileCash]      = useState('');
  const [reconcileError,     setReconcileError]     = useState(null);
  const [reconcileLoading,   setReconcileLoading]   = useState(false);
  const [vehicleForm,        setVehicleForm]        = useState(EMPTY_VEHICLE_FORM);
  const [editingVehicle,     setEditingVehicle]     = useState(null);
  const [selectedInvoices,   setSelectedInvoices]   = useState([]);   // ids for pending dispatch
  const [dispatchForm,       setDispatchForm]       = useState({
    vehicleId: '', driverId: '', location: '',
  });
  const [expandedTrip,    setExpandedTrip]    = useState(null);
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [dispatchError, setDispatchError] = useState('');

  // Van Load (dispatch)
  // Van's current actual stock — loaded via the dedicated Load Van flow.
  // Dispatch reads this read-only; it does not re-load the van.
  const vanCurrentStock = useMemo(() => {
    if (!dispatchForm.vehicleId) return [];
    const loc = inventoryLocations.find(
      l => l.type === 'VEHICLE' && l.reference_id === dispatchForm.vehicleId
    );
    if (!loc) return [];
    return inventoryBalances
      .filter(b => b.location_id === loc.id && Number(b.quantity) > 0)
      .map(b => {
        const p = products.find(pr => pr.id === b.product_id);
        return {
          productId:    b.product_id,
          productName:  p?.name || b.product_id,
          qty:          Number(b.quantity),
          sellingPrice: p?.sellingPrice ?? p?.selling_price ?? 0,
          costPrice:    p?.costPrice ?? p?.cost_price ?? 0,
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName));
  }, [dispatchForm.vehicleId, inventoryLocations, inventoryBalances, products]);

  // Load Van modal
  const [loadVanVehicle,   setLoadVanVehicle]   = useState(null); // vehicle obj
  const [unloadVanVehicle, setUnloadVanVehicle] = useState(null); // vehicle obj

  // Van Sale modal
  const [vanSaleRoute,    setVanSaleRoute]    = useState(null);
  const [vanSaleItems,    setVanSaleItems]    = useState([]);   // [{productId, productName, qty, sellingPrice, costPrice, maxQty}]

  // Reconcile returned stock (productId → returned qty)
  const [reconcileReturned, setReconcileReturned] = useState({});

  // Failed delivery
  const [failedInvoiceId,   setFailedInvoiceId]   = useState(null);
  const [failedReason,      setFailedReason]       = useState('');
  const [failedSubmitting,  setFailedSubmitting]   = useState(false);

  // Zone filter for pending deliveries
  const [zoneFilter, setZoneFilter] = useState('ALL');

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeRoutes  = routes.filter(r => r.status === 'ACTIVE' || r.status === 'IN_TRANSIT');
  const pastRoutes    = routes
    .filter(r => r.status === 'RECONCILED' || r.status === 'COMPLETED')
    .sort((a, b) => new Date(b.reconciled_at || 0) - new Date(a.reconciled_at || 0))
    .slice(0, 30);

  const pendingDeliveries = deliveryInvoices.filter(i => i.delivery_status === 'PENDING');

  // Zone grouping
  const deliveryZones = useMemo
    ? ['ALL', ...Array.from(new Set(pendingDeliveries.map(i => i.delivery_zone || 'Unzoned'))).sort()]
    : ['ALL'];
  const filteredPending = zoneFilter === 'ALL'
    ? pendingDeliveries
    : pendingDeliveries.filter(i => (i.delivery_zone || 'Unzoned') === zoneFilter);
  const pendingByZone = pendingDeliveries.reduce((acc, inv) => {
    const z = inv.delivery_zone || 'Unzoned';
    if (!acc[z]) acc[z] = [];
    acc[z].push(inv);
    return acc;
  }, {});
  const serviceAlerts     = vehicles.filter(v => serviceStatus(v.nextServiceDate));

  const getEmployeeName = (id) =>
    employees.find(e => e.id === id)?.name || 'Unknown Driver';

  const getVehicleStock = (vehicleId) => {
    const loc = inventoryLocations.find(l => l.reference_id === vehicleId);
    return loc
      ? inventoryBalances.filter(b => b.location_id === loc.id).reduce((s, i) => s + (i.quantity || 0), 0)
      : 0;
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────

  // Vehicle CRUD
  const handleVehicleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...vehicleForm,
      capacity: vehicleForm.capacity ? Number(vehicleForm.capacity) : null,
      year:     vehicleForm.year     ? Number(vehicleForm.year)     : null,
    };
    editingVehicle ? updateVehicle({ ...editingVehicle, ...payload }) : addVehicle(payload);
    setVehicleForm(EMPTY_VEHICLE_FORM);
    setEditingVehicle(null);
    setShowVehicleModal(false);
  };

  const openEditVehicle = (v) => {
    setEditingVehicle(v);
    setVehicleForm({
      name: v.name || '', plate: v.plate || '', type: v.type || 'VAN',
      status: v.status || 'ACTIVE', capacity: v.capacity || '',
      fuelType: v.fuelType || 'PETROL', color: v.color || '',
      year: v.year || '', lastServiceDate: v.lastServiceDate || '',
      nextServiceDate: v.nextServiceDate || '',
    });
    setShowVehicleModal(true);
  };

  // Dispatch
  const openDispatch = () => {
    setDispatchForm({ vehicleId: vehicles[0]?.id || '', driverId: '', location: '' });
    setSelectedInvoices(pendingDeliveries.map(i => i.id)); // pre-select all
    setDispatchError('');
    setShowDispatchModal(true);
  };

  // ── Load Van ──────────────────────────────────────────────────────────────
  // Opens the VanLoadBuilder POS-style flow. Warehouse→vehicle transfer
  // handled by loadVan() and the VanLoadBuilder component.
  const openLoadVan = (vehicle) => setLoadVanVehicle(vehicle);
  // Unload Van — vehicle→warehouse transfer.
  const openUnloadVan = (vehicle) => setUnloadVanVehicle(vehicle);

  const toggleInvoice = (id) =>
    setSelectedInvoices(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  const handleDispatch = async (e) => {
    e.preventDefault();
    if (!dispatchForm.vehicleId) { setDispatchError('Select a vehicle.'); return; }
    if (!dispatchForm.driverId)  { setDispatchError('Select a driver.');  return; }
    if (selectedInvoices.length === 0 && vanCurrentStock.length === 0) {
      setDispatchError('Select at least 1 delivery, or load the van first.');
      return;
    }

    setSubmitting(true);
    setDispatchError('');

    try {
      const result = await dispatchRoute({
        vehicleId:       dispatchForm.vehicleId,
        driverId:        dispatchForm.driverId,
        location:        dispatchForm.location || 'Route',
        initialOdometer: 0,
        targetAmount:    selectedInvoices.reduce((s, id) => {
          const inv = deliveryInvoices.find(i => i.id === id);
          return s + (inv?.grand_total || 0);
        }, 0),
        assignedOrders:  selectedInvoices,
        loadedStock:     vanCurrentStock.map(i => ({
          productId:    i.productId,
          quantity:     i.qty,
          sellingPrice: i.sellingPrice,
          costPrice:    i.costPrice,
        })),
      });

      if (result?.error) {
        setDispatchError(result.error.message || 'Dispatch failed.');
      } else {
        setShowDispatchModal(false);
        setSelectedInvoices([]);
        setDeliverySubTab('ACTIVE');
      }
    } catch (err) {
      console.error('handleDispatch threw:', err);
      setDispatchError(err?.message || 'Unexpected dispatch error.');
    } finally {
      setSubmitting(false);
    }
  };

  // Van Sale modal
  const openVanSale = async (route) => {
    const vehicleId = route.vehicleId || route['vehicleId'];

    // Prefer hook data; fetch from DB if hook hasn't loaded yet
    let vehicleLoc = inventoryLocations.find(l => l.reference_id === vehicleId && l.type === 'VEHICLE');
    let balances   = vehicleLoc
      ? inventoryBalances.filter(b => b.location_id === vehicleLoc.id && b.quantity > 0)
      : [];

    if (!vehicleLoc || balances.length === 0) {
      // Fetch location
      const { data: locData } = await supabase
        .from('inventory_locations')
        .select('*').is('deleted_at', null)
        .eq('type', 'VEHICLE')
        .eq('reference_id', vehicleId)
        .maybeSingle();
      if (locData) {
        vehicleLoc = locData;
        // Fetch balances for this location
        const { data: balData } = await supabase
          .from('inventory_balances')
          .select('*')
          .eq('location_id', locData.id)
          .gt('quantity', 0);
        balances = balData || [];
      }
    }

    // Build items from balances
    const items = balances
      .map(b => {
        const prod = products.find(p => p.id === b.product_id);
        return {
          productId:    b.product_id,
          productName:  prod?.name || b.product_id,
          qty:          0,
          sellingPrice: prod?.sellingPrice ?? prod?.selling_price ?? 0,
          costPrice:    prod?.costPrice    ?? prod?.cost_price    ?? 0,
          maxQty:       Number(b.quantity),
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName));

    const vehicle = vehicles.find(v => v.id === vehicleId);
    navigate('/vehicles/van-sale', {
      state: {
        route:        { ...route, _vehicleLocId: vehicleLoc?.id },
        vehicle,
        vanItems:     items,
        clients,
        vehicleLocId: vehicleLoc?.id,
      },
    });
  };

  // Reconcile (End Trip)
  // Stock stays on van by default — returned stock defaults to 0.
  // Manager can optionally enter returned quantities if physically unloading.
  const openReconcile = (route) => {
    setReconcileRoute(route);
    setReconcileCash('');
    setReconcileError(null);
    // Default all returned quantities to 0 (stock stays on van)
    const loaded = route.loadedStock || route.loaded_stock || [];
    const initReturned = {};
    loaded.forEach(item => { initReturned[item.productId] = 0; });
    setReconcileReturned(initReturned);
  };

  const handleReconcile = async (e) => {
    e.preventDefault();
    setReconcileError(null);
    setReconcileLoading(true);
    const loaded = reconcileRoute_.loadedStock || reconcileRoute_.loaded_stock || [];
    // Only include items where manager explicitly entered qty > 0 to return
    const returnedStock = loaded
      .map(item => ({
        productId: item.productId,
        quantity:  Math.max(0, Math.min(item.quantity, parseInt(reconcileReturned[item.productId] || 0) || 0)),
      }))
      .filter(item => item.quantity > 0); // skip zeros — stock stays on van
    const result = await reconcileRoute(reconcileRoute_.id, 0, returnedStock, parseFloat(reconcileCash) || 0);
    setReconcileLoading(false);
    if (result?.success === false) {
      setReconcileError(result.error?.message || result.error?.toString() || 'Reconciliation failed');
      return;
    }
    setReconcileRoute(null);
    setReconcileError(null);
  };

  // Mark stop
  const markStop = (stopId, status) => updateStopStatus(stopId, status);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="animate-fade-in flex flex-col gap-4 pb-12">

        {/* ── Header bar ── */}
        <div className="flex justify-between items-center py-2 border-b border-black/5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-black font-sora text-ink-primary leading-none">
              Fleet<span className="text-accent-signature">.</span>
            </h1>
            {/* KPI chips */}
            <div className="hidden sm:flex items-center gap-1.5">
              {pendingDeliveries.length > 0 && (
                <div className="flex items-center gap-1 bg-accent-signature/10 border border-accent-signature/15 text-accent-signature-hover px-2 py-1 rounded-lg">
                  <Package size={10} />
                  <span className="text-[10px] font-black">{pendingDeliveries.length}</span>
                  <span className="text-[9px] font-medium opacity-60">pending</span>
                </div>
              )}
              {activeRoutes.length > 0 && (
                <div className="flex items-center gap-1 bg-blue-50 border border-blue-100 text-blue-700 px-2 py-1 rounded-lg">
                  <Navigation size={10} />
                  <span className="text-[10px] font-black">{activeRoutes.length}</span>
                  <span className="text-[9px] font-medium opacity-60">on road</span>
                </div>
              )}
              {serviceAlerts.length > 0 && (
                <div className="flex items-center gap-1 bg-red-50 border border-red-100 text-red-600 px-2 py-1 rounded-lg">
                  <Wrench size={10} />
                  <span className="text-[10px] font-black">{serviceAlerts.length}</span>
                  <span className="text-[9px] font-medium opacity-60">service due</span>
                </div>
              )}
              <div className="flex items-center gap-1 bg-white border border-border shadow-sm text-muted-foreground px-2 py-1 rounded-lg">
                <Truck size={10} className="opacity-40" />
                <span className="text-[10px] font-black">{vehicles.length}</span>
                <span className="text-[9px] font-medium text-muted-foreground">vehicles</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switcher */}
            <div className="flex gap-0.5 bg-canvas p-1 rounded-xl border border-black/5">
              {[
                { id: 'DELIVERIES', label: 'Deliveries', icon: Package   },
                { id: 'FLEET',      label: 'Fleet',      icon: Truck     },
                { id: 'VAN_STOCK',  label: 'Stock',      icon: BarChart2 },
                { id: 'LIVE',       label: 'Live Map',   icon: Map       },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === tab.id
                      ? 'bg-ink-primary text-surface shadow-sm'
                      : 'text-muted-foreground hover:text-ink-primary'
                  }`}
                >
                  <tab.icon size={12} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Primary actions — always visible */}
            {hasPermission('MANAGE_FLEET') && (
              <button
                className="h-9 rounded-xl px-3 text-xs font-bold flex items-center gap-1.5 border border-black/10 bg-white text-ink-primary hover:bg-canvas transition-all shrink-0"
                onClick={() => { setEditingVehicle(null); setVehicleForm(EMPTY_VEHICLE_FORM); setShowVehicleModal(true); }}
              >
                <Plus size={12} /> Vehicle
              </button>
            )}
            {activeTab === 'DELIVERIES' && (
              <button
                className="btn-signature flex items-center gap-2 text-xs font-black"
                onClick={openDispatch}
              >
                <Play size={12} /> Dispatch
              </button>
            )}
          </div>
        </div>

        {/* Service alert banner */}
        {serviceAlerts.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-yellow-50 border border-yellow-200 rounded-xl">
            <Wrench size={13} className="text-yellow-600 shrink-0" />
            <span className="text-xs font-semibold text-yellow-800">
              Service due: <span className="font-bold">{serviceAlerts.map(v => v.name).join(', ')}</span>
            </span>
          </div>
        )}

        {/* ── DELIVERIES TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'DELIVERIES' && (
          <div className="space-y-4">

            {/* Sub-tab bar */}
            <div className="flex border-b border-black/5">
              {[
                { id: 'PENDING', label: 'Pending', count: pendingDeliveries.length },
                { id: 'ACTIVE',  label: 'Active Trips', count: activeRoutes.length },
                { id: 'HISTORY', label: 'History', count: null },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setDeliverySubTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all -mb-px ${
                    deliverySubTab === t.id
                      ? 'border-ink-primary text-ink-primary'
                      : 'border-transparent text-muted-foreground hover:text-ink-secondary'
                  }`}
                >
                  {t.label}
                  {t.count !== null && t.count > 0 && (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                      deliverySubTab === t.id ? 'bg-ink-primary text-surface' : 'bg-black/5 text-muted-foreground'
                    }`}>{t.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* PENDING sub-tab */}
            {deliverySubTab === 'PENDING' && (
              <div className="space-y-2">
                {pendingDeliveries.length === 0 ? (
                  <div className="py-20 text-center bg-white border border-black/5 rounded-2xl">
                    <Package size={36} className="text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-bold text-muted-foreground">No pending deliveries</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Sales marked for delivery appear here automatically
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Zone filter tabs */}
                    {deliveryZones.length > 2 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {deliveryZones.map(z => (
                          <button
                            key={z}
                            onClick={() => setZoneFilter(z)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-pill text-[9px] font-black border transition-all ${
                              zoneFilter === z
                                ? 'bg-ink-primary text-accent-signature border-ink-primary'
                                : 'bg-white border-black/8 text-muted-foreground hover:border-black/20'
                            }`}
                          >
                            {z !== 'ALL' && <MapPin size={9} />}{z === 'ALL' ? `All (${pendingDeliveries.length})` : `${z} (${(pendingByZone[z] || []).length})`}
                          </button>
                        ))}
                      </div>
                    )}

                    {filteredPending.map(inv => {
                      const isExpanded = expandedInvoice === inv.id;
                      const items = Array.isArray(inv.items) ? inv.items : [];
                      const hasFailed = !!inv.failed_delivery_reason;
                      const itemCount = items.length;
                      const grandTotal = Number(inv.grand_total || 0);
                      return (
                        <div
                          key={inv.id}
                          className={`bg-white border rounded-2xl overflow-hidden transition-all ${
                            hasFailed ? 'border-accent-signature/40 shadow-sm shadow-accent-signature/15' : 'border-black/8 hover:border-black/15 hover:shadow-sm'
                          }`}
                        >
                          {/* Re-queue banner */}
                          {hasFailed && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-accent-signature/10 border-b border-accent-signature/25">
                              <RotateCcw size={10} className="text-accent-signature shrink-0" />
                              <span className="text-[9px] font-bold text-accent-signature-hover uppercase tracking-wide">
                                Re-queued — Prior failure: {inv.failed_delivery_reason}
                              </span>
                            </div>
                          )}

                          {/* Header */}
                          <button
                            type="button"
                            className="w-full flex items-center gap-4 px-5 py-4 text-left group"
                            onClick={() => setExpandedInvoice(isExpanded ? null : inv.id)}
                          >
                            {/* Icon */}
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                              hasFailed ? 'bg-accent-signature/10 border border-accent-signature/25' : 'bg-blue-50 border border-blue-100'
                            }`}>
                              <Package size={16} className={hasFailed ? 'text-accent-signature' : 'text-blue-600'} />
                            </div>

                            {/* Main info */}
                            <div className="flex-1 min-w-0">
                              {/* Row 1: invoice ref + badges */}
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-sm font-black text-ink-primary tracking-tight">
                                  {(inv.invoice_number || inv.id).replace(/^#+/, '')}
                                </span>
                                {inv.delivery_date && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-white border border-border shadow-sm text-muted-foreground px-2 py-0.5 rounded-md">
                                    <Calendar size={8} />
                                    {new Date(inv.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  </span>
                                )}
                                {inv.delivery_zone && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md">
                                    <MapPin size={8} />{inv.delivery_zone}
                                  </span>
                                )}
                              </div>
                              {/* Row 2: client + address */}
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium min-w-0">
                                <span className="font-semibold text-ink-secondary shrink-0">{inv.client_name || '—'}</span>
                                {inv.delivery_address && (
                                  <>
                                    <span className="text-muted-foreground mx-1">·</span>
                                    <MapPin size={9} className="text-muted-foreground shrink-0" />
                                    <span className="truncate">{inv.delivery_address}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Right: total + item count + chevron */}
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="text-base font-black text-ink-primary tabular-nums">
                                {sym}{grandTotal.toFixed(2)}
                              </span>
                              <span className="text-[9px] text-muted-foreground font-medium">
                                {itemCount} item{itemCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <ChevronDown
                              size={14}
                              className={`text-muted-foreground transition-transform duration-200 shrink-0 ml-1 ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="border-t border-black/5">

                              {/* Delivery meta strip — full-width single row */}
                              {(inv.delivery_address || inv.delivery_notes || inv.delivery_fee > 0) && (
                                <div className="px-5 py-3 bg-muted border-b border-black/5">
                                  <div className="flex items-start justify-between gap-4">
                                    {/* Left: address + notes */}
                                    <div className="flex items-start gap-2 min-w-0">
                                      <MapPin size={12} className="text-muted-foreground shrink-0 mt-0.5" />
                                      <div className="min-w-0">
                                        {inv.delivery_address && (
                                          <p className="text-[11px] font-semibold text-ink-secondary">{inv.delivery_address}</p>
                                        )}
                                        {inv.delivery_notes && (
                                          <p className="text-[10px] font-medium text-muted-foreground italic mt-0.5">{inv.delivery_notes}</p>
                                        )}
                                      </div>
                                    </div>
                                    {/* Right: delivery fee */}
                                    {inv.delivery_fee > 0 && (
                                      <div className="shrink-0 text-right">
                                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Delivery Fee</p>
                                        <p className="text-[12px] font-black text-ink-secondary tabular-nums">{sym}{Number(inv.delivery_fee).toFixed(2)}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Item table — 4-column grid uses full width */}
                              <div className="px-5 pt-3 pb-2">
                                {items.length > 0 && (
                                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 pb-2 border-b border-black/5 mb-0.5">
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Item</span>
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-right w-20">Unit Price</span>
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-center w-10">Qty</span>
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-right w-20">Amount</span>
                                  </div>
                                )}
                                {items.length > 0 ? items.map((item, idx) => {
                                  const qty   = item.quantity ?? item.qty ?? 1;
                                  const rate  = Number(item.rate ?? item.price ?? item.unit_price ?? 0);
                                  const total = Number(item.total ?? (rate * qty));
                                  return (
                                    <div
                                      key={item.id || idx}
                                      className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-6 items-center py-2.5 ${idx !== items.length - 1 ? 'border-b border-black/4' : ''}`}
                                    >
                                      <span className="text-[12px] font-semibold text-ink-primary truncate">
                                        {item.name || item.product_name || item.productName || '—'}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground tabular-nums text-right w-20">
                                        {rate > 0 ? `${sym}${rate.toFixed(2)}` : '—'}
                                      </span>
                                      <span className="text-[11px] font-medium text-muted-foreground tabular-nums text-center w-10">×{qty}</span>
                                      <span className="text-[12px] font-bold text-ink-primary tabular-nums text-right w-20">
                                        {sym}{total.toFixed(2)}
                                      </span>
                                    </div>
                                  );
                                }) : (
                                  <p className="text-[11px] text-muted-foreground py-3">No item details available.</p>
                                )}

                                {/* Order total row */}
                                {items.length > 0 && (
                                  <div className="grid grid-cols-[1fr_auto] gap-x-6 items-center pt-3 mt-1 border-t border-black/8">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Order Total</span>
                                    <span className="text-sm font-black text-ink-primary tabular-nums">{sym}{grandTotal.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>

                              {/* Actions row — space-between */}
                              <div className="px-5 pb-4 pt-2 flex items-center justify-between gap-4">
                                {hasPermission('OWNER') ? (
                                  <button
                                    onClick={() => { setFailedInvoiceId(inv.id); setFailedReason(''); }}
                                    className="flex items-center gap-2 text-[10px] font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl transition-all"
                                  >
                                    <AlertOctagon size={12} />
                                    Mark Failed / Re-queue
                                  </button>
                                ) : <span />}
                                {/* Payment status pill */}
                                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border ${
                                  inv.payment_status === 'PAID'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-accent-signature/10 text-accent-signature-hover border-accent-signature/25'
                                }`}>
                                  {inv.payment_status === 'PAID' ? '✓ Paid' : 'Unpaid — Collect on Delivery'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="pt-2">
                      <button
                        onClick={openDispatch}
                        className="btn-signature w-full !h-12 !text-xs flex items-center justify-center gap-3 !rounded-2xl"
                      >
                        DISPATCH {filteredPending.length} DELIVERIES{zoneFilter !== 'ALL' ? ` · ${zoneFilter}` : ''}
                        <div className="icon-nest !w-8 !h-8"><Play size={16} /></div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ACTIVE sub-tab */}
            {deliverySubTab === 'ACTIVE' && (
              <div className="space-y-4">
                {activeRoutes.length === 0 ? (
                  <div className="py-20 text-center bg-white border border-black/5 rounded-2xl">
                    <Navigation size={36} className="text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-bold text-muted-foreground">No active trips</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Dispatch a vehicle to start a trip</p>
                  </div>
                ) : activeRoutes.map(route => {
                  const vehicle   = vehicles.find(v => v.id === route.vehicleId || v.id === route['vehicleId']);
                  const stops     = routeStops.filter(s => s.route_id === route.id);
                  const delivered = stops.filter(s => s.status === 'DELIVERED').length;
                  const total     = stops.length;
                  const expanded  = expandedTrip === route.id;
                  const driverName = getEmployeeName(route.driverId || route['driverId']);
                  const progress  = total > 0 ? Math.round((delivered / total) * 100) : 0;

                  return (
                    <div key={route.id} className="bg-white border border-black/5 rounded-2xl overflow-hidden shadow-sm">
                      {/* Trip header — Amazon order style */}
                      <div className="px-5 py-4 border-b border-black/5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                              <Truck size={16} className="text-blue-600" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-ink-primary">{vehicle?.name || 'Vehicle'}</span>
                                {vehicle?.plate && (
                                  <span className="text-[9px] font-black text-muted-foreground bg-white border border-border shadow-sm px-2 py-0.5 rounded tabular-nums tracking-widest">
                                    {vehicle.plate}
                                  </span>
                                )}
                                <span className="flex items-center gap-1 text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
                                  <Activity size={7} /> IN TRANSIT
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1"><Navigation size={9} /> {route.location || 'En route'}</span>
                                <span>·</span>
                                <span>Driver: <span className="font-semibold text-ink-primary">{driverName}</span></span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {(hasRole('DRIVER') || hasRole('OWNER') || hasRole('GLOBAL_ADMIN')) && (
                              <button
                                onClick={() => openVanSale(route)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/8 text-[10px] font-semibold text-ink-secondary hover:bg-canvas transition-colors"
                              >
                                <ShoppingCart size={11} /> Van Sale
                              </button>
                            )}
                            <button
                              onClick={() => openReconcile(route)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-primary text-surface text-[10px] font-bold hover:opacity-90 transition-opacity"
                            >
                              End Trip
                            </button>
                          </div>
                        </div>

                        {/* Progress bar + stats */}
                        {total > 0 && (
                          <div className="mt-4">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                <span className="text-green-600 font-bold">{delivered}</span> of {total} stops delivered
                              </span>
                              <span className="text-[10px] font-black text-ink-primary">{progress}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Stop toggle */}
                      {total > 0 && (
                        <button
                          onClick={() => setExpandedTrip(expanded ? null : route.id)}
                          className="w-full flex items-center justify-between px-5 py-2.5 text-[10px] font-bold text-muted-foreground hover:bg-canvas/50 transition-colors"
                        >
                          <span className="uppercase tracking-widest">{expanded ? 'Hide stops' : `View ${total} stops`}</span>
                          <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}

                      {/* Stops: timeline style */}
                      {expanded && stops.length > 0 && (
                        <div className="border-t border-black/5 px-5 py-3 space-y-0">
                          {stops.map((stop, si) => {
                            const done = stop.status !== 'PENDING';
                            const isDelivered = stop.status === 'DELIVERED';
                            const isNoSale = stop.status === 'NO_SALE';
                            return (
                              <div key={stop.id} className="flex gap-3 py-2.5">
                                {/* Timeline connector */}
                                <div className="flex flex-col items-center shrink-0 pt-0.5">
                                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                    isDelivered ? 'bg-green-500 border-green-500' :
                                    isNoSale    ? 'bg-red-400 border-red-400' :
                                    'bg-white border-border'
                                  }`}>
                                    {isDelivered && <Check size={8} className="text-white" />}
                                    {isNoSale && <XCircle size={8} className="text-white" />}
                                  </div>
                                  {si < stops.length - 1 && (
                                    <div className={`w-px flex-1 mt-1 min-h-[16px] ${isDelivered ? 'bg-green-200' : 'bg-muted'}`} />
                                  )}
                                </div>

                                {/* Stop content */}
                                <div className="flex-1 flex items-start justify-between min-w-0 pb-1">
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-ink-primary truncate">{stop.client_name || 'Client'}</div>
                                    {stop.invoice_id && (
                                      <div className="text-[9px] text-muted-foreground tabular-nums">{stop.invoice_id.replace(/^INV-/, '#')}</div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-3">
                                    {stop.cash_collected > 0 && (
                                      <span className="text-[10px] font-bold text-green-600">{sym}{Number(stop.cash_collected).toLocaleString()}</span>
                                    )}
                                    {!done ? (
                                      <div className="flex items-center gap-1">
                                        <button onClick={() => markStop(stop.id, 'DELIVERED')}
                                          className="px-2 py-0.5 rounded bg-green-50 border border-green-200 text-[9px] font-bold text-green-700 hover:bg-green-100">
                                          ✓ Delivered
                                        </button>
                                        <button onClick={() => markStop(stop.id, 'NO_SALE')}
                                          className="px-2 py-0.5 rounded bg-red-50 border border-red-200 text-[9px] font-bold text-red-600 hover:bg-red-100">
                                          ✕ No Sale
                                        </button>
                                      </div>
                                    ) : (
                                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                                        isDelivered ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'
                                      }`}>
                                        {isDelivered ? 'Delivered' : 'No Sale'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* HISTORY sub-tab */}
            {deliverySubTab === 'HISTORY' && (
              <div className="bg-white border border-black/5 rounded-2xl overflow-hidden shadow-sm">
                {pastRoutes.length === 0 ? (
                  <div className="py-20 text-center">
                    <History size={36} className="text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-bold text-muted-foreground">No completed trips yet</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-canvas border-b border-black/5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                        <th className="p-3 pl-5">Date</th>
                        <th className="p-3">Vehicle</th>
                        <th className="p-3">Driver</th>
                        <th className="p-3">Area</th>
                        <th className="p-3 text-right">Cash Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastRoutes.map(route => {
                        const vehicle = vehicles.find(v => v.id === (route.vehicleId || route['vehicleId']));
                        const stops   = routeStops.filter(s => s.route_id === route.id);
                        const cash    = Number(route.actual_cash) || 0;
                        return (
                          <tr key={route.id} className="border-b border-black/5 hover:bg-canvas/50 transition-colors">
                            <td className="p-3 pl-5 text-[11px] text-muted-foreground">
                              {route.reconciled_at
                                ? new Date(route.reconciled_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                                : route.date || '—'}
                            </td>
                            <td className="p-3 text-xs font-semibold text-ink-primary">
                              {vehicle?.name || '—'}
                              <div className="text-[9px] text-muted-foreground">{vehicle?.plate}</div>
                            </td>
                            <td className="p-3 text-xs text-ink-secondary">
                              {getEmployeeName(route.driverId || route['driverId'])}
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">{route.location || '—'}</td>
                            <td className="p-3 text-right text-xs font-bold text-green-700 tabular-nums">
                              {sym}{cash.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── FLEET TAB ───────────────────────────────────────────────────────── */}
        {activeTab === 'FLEET' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-2 h-8 bg-accent-signature rounded-pill" />
              <h2 className="text-base font-bold text-ink-primary">Fleet Roster</h2>
              <span className="ml-1 text-[10px] font-semibold text-muted-foreground">{vehicles.length} vehicles</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {vehicles.map(v => {
                const ss       = STATUS_STYLES[v.status] || STATUS_STYLES.ACTIVE;
                const svcSt    = serviceStatus(v.nextServiceDate);
                const stock    = getVehicleStock(v.id);
                const inTrip   = activeRoutes.some(r => (r.vehicleId || r['vehicleId']) === v.id);
                return (
                  <div key={v.id} className="bg-white border border-black/5 rounded-2xl overflow-hidden hover:shadow-lg transition-all flex flex-col group">
                    <div className="aspect-[2/1] bg-ink-primary relative overflow-hidden">
                      <img
                        src={v.image || '/assets/van.png'}
                        className="w-full h-full object-cover opacity-90 transition-transform group-hover:scale-105 duration-700"
                        alt={v.name}
                      />
                      <div className={`absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-pill backdrop-blur-md border border-white/20 ${ss.bg} ${ss.text}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${ss.dot}`} />
                        <span className="text-[8px] font-bold">{ss.label}</span>
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={e => { e.stopPropagation(); openEditVehicle(v); }}
                          className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/30">
                          <Edit3 size={10} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); if (window.confirm('Delete this vehicle?')) deleteVehicle(v.id); }}
                          className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-red-300 hover:bg-red-500/30">
                          <Trash2 size={10} />
                        </button>
                      </div>
                      {inTrip && (
                        <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-accent-signature rounded-pill">
                          <Activity size={8} className="text-ink-primary" />
                          <span className="text-[7px] font-black text-ink-primary">ON TRIP</span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-sm font-bold text-ink-primary uppercase tracking-tight">{v.name}</h3>
                          <div className="text-[10px] font-semibold text-muted-foreground mt-0.5">{v.plate}</div>
                        </div>
                        {v.type && (
                          <span className="text-[9px] font-bold text-muted-foreground bg-canvas px-2 py-0.5 rounded-pill border border-black/5">{v.type}</span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 text-[9px] font-semibold text-muted-foreground">
                        {v.fuelType && <span className="flex items-center gap-1"><Fuel size={9} />{v.fuelType}</span>}
                        {v.capacity && <span className="flex items-center gap-1"><Truck size={9} />{v.capacity} cap</span>}
                        {v.year     && <span className="flex items-center gap-1"><Calendar size={9} />{v.year}</span>}
                      </div>

                      <div className="p-2.5 bg-canvas/60 rounded-xl border border-black/5">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Stock on Board</span>
                          <span className="text-[10px] font-bold text-ink-primary">{stock} units</span>
                        </div>
                        <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
                          <div className="h-full bg-accent-signature" style={{ width: `${Math.min(100, stock)}%` }} />
                        </div>
                      </div>

                      {/* Load Van button */}
                      {hasPermission('MANAGE_FLEET') && (
                        <button
                          onClick={e => { e.stopPropagation(); openLoadVan(v); }}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent-signature/10 border border-accent-signature/20 text-[10px] font-bold text-ink-primary hover:bg-accent-signature/20 transition-all"
                        >
                          <PackagePlus size={11} />
                          Load Van Stock
                        </button>
                      )}

                      {v.nextServiceDate && (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-semibold ${
                          svcSt === 'overdue' ? 'bg-red-50 text-red-700 border border-red-100' :
                          svcSt === 'soon'    ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' :
                                                'bg-canvas text-muted-foreground border border-black/5'
                        }`}>
                          <Wrench size={10} className="shrink-0" />
                          <span>
                            {svcSt === 'overdue' ? 'Service overdue — ' :
                             svcSt === 'soon'    ? 'Service due soon — ' :
                                                   'Next service: '}
                            {new Date(v.nextServiceDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {vehicles.length === 0 && (
                <div className="col-span-full py-20 text-center text-[10px] font-semibold text-muted-foreground">
                  No vehicles registered — click "Add Vehicle" to begin
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── LOAD VAN ─────────────────────────────────────────────────────── */}
      {loadVanVehicle && (() => {
        const whLoc = inventoryLocations.find(l => l.type === 'WAREHOUSE');
        const warehouseItems = whLoc
          ? products
              .map(p => {
                const bal = inventoryBalances.find(
                  b => b.product_id === p.id && b.location_id === whLoc.id
                );
                return {
                  productId:   p.id,
                  productName: p.name,
                  available:   Number(bal?.quantity || 0),
                };
              })
              .filter(p => p.available > 0)
              .sort((a, b) => a.productName.localeCompare(b.productName))
          : [];
        const handleLoad = async ({ items }) => {
          const { success, errors } = await loadVan(loadVanVehicle.id, items);
          return { success, error: success ? null : { message: (errors || []).join(' | ') } };
        };
        return (
          <VanLoadBuilder
            vehicle={loadVanVehicle}
            warehouseItems={warehouseItems}
            onSubmit={handleLoad}
            onClose={() => setLoadVanVehicle(null)}
          />
        );
      })()}

      {/* ── UNLOAD VAN ────────────────────────────────────────────────── */}
      {unloadVanVehicle && (() => {
        const vLoc = inventoryLocations.find(
          l => l.type === 'VEHICLE' && l.reference_id === unloadVanVehicle.id
        );
        const vanItems = vLoc
          ? inventoryBalances
              .filter(b => b.location_id === vLoc.id && Number(b.quantity) > 0)
              .map(b => {
                const p = products.find(pr => pr.id === b.product_id);
                return {
                  productId:   b.product_id,
                  productName: p?.name || b.product_id,
                  available:   Number(b.quantity),
                };
              })
              .sort((a, b) => a.productName.localeCompare(b.productName))
          : [];
        const handleUnload = async ({ items }) => {
          const { success, errors } = await unloadVan(unloadVanVehicle.id, items);
          return { success, error: success ? null : { message: (errors || []).join(' | ') } };
        };
        return (
          <VanLoadBuilder
            mode="unload"
            vehicle={unloadVanVehicle}
            warehouseItems={vanItems}
            onSubmit={handleUnload}
            onClose={() => setUnloadVanVehicle(null)}
          />
        );
      })()}

      {/* ── VEHICLE MODAL ──────────────────────────────────────────────────────── */}
      {showVehicleModal && (
        <div className="modal-overlay">
          <div className="glass-modal !max-w-2xl">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-4xl font-black font-sora text-ink-primary leading-none tracking-tight uppercase">
                  {editingVehicle ? 'EDIT' : 'ADD'} VEHICLE<span className="text-accent-signature">.</span>
                </h1>
              </div>
              <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all"
                onClick={() => setShowVehicleModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleVehicleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5">Vehicle Name *</label>
                <input required type="text"
                  className="w-full bg-white border border-border shadow-sm rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
                  placeholder="e.g. Delivery Van 1"
                  value={vehicleForm.name} onChange={e => setVehicleForm({ ...vehicleForm, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5">License Plate *</label>
                <input required type="text"
                  className="w-full bg-white border border-border shadow-sm rounded-lg p-3.5 font-semibold text-xs outline-none focus:ring-4 focus:ring-accent-signature/20"
                  placeholder="e.g. KL01HHSHHS"
                  value={vehicleForm.plate} onChange={e => setVehicleForm({ ...vehicleForm, plate: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5">Type</label>
                <select className="w-full bg-white border border-border shadow-sm rounded-lg p-3.5 font-semibold text-xs outline-none focus:ring-4 focus:ring-accent-signature/20 appearance-none"
                  value={vehicleForm.type} onChange={e => setVehicleForm({ ...vehicleForm, type: e.target.value })}>
                  {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5">Status</label>
                <select className="w-full bg-white border border-border shadow-sm rounded-lg p-3.5 font-semibold text-xs outline-none focus:ring-4 focus:ring-accent-signature/20 appearance-none"
                  value={vehicleForm.status} onChange={e => setVehicleForm({ ...vehicleForm, status: e.target.value })}>
                  {VEHICLE_STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLES[s]?.label || s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5">Fuel Type</label>
                <select className="w-full bg-white border border-border shadow-sm rounded-lg p-3.5 font-semibold text-xs outline-none focus:ring-4 focus:ring-accent-signature/20 appearance-none"
                  value={vehicleForm.fuelType} onChange={e => setVehicleForm({ ...vehicleForm, fuelType: e.target.value })}>
                  {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5">Capacity</label>
                <input type="number" min="0"
                  className="w-full bg-white border border-border shadow-sm rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
                  placeholder="e.g. 100"
                  value={vehicleForm.capacity} onChange={e => setVehicleForm({ ...vehicleForm, capacity: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5">Color</label>
                <input type="text"
                  className="w-full bg-white border border-border shadow-sm rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
                  placeholder="e.g. White"
                  value={vehicleForm.color} onChange={e => setVehicleForm({ ...vehicleForm, color: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5">Year</label>
                <input type="number" min="1990" max="2099"
                  className="w-full bg-white border border-border shadow-sm rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
                  placeholder="e.g. 2022"
                  value={vehicleForm.year} onChange={e => setVehicleForm({ ...vehicleForm, year: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5">Last Service Date</label>
                <input type="date"
                  className="w-full bg-white border border-border shadow-sm rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
                  value={vehicleForm.lastServiceDate} onChange={e => setVehicleForm({ ...vehicleForm, lastServiceDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5">Next Service Date</label>
                <input type="date"
                  className="w-full bg-white border border-border shadow-sm rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
                  value={vehicleForm.nextServiceDate} onChange={e => setVehicleForm({ ...vehicleForm, nextServiceDate: e.target.value })} />
              </div>
              <div className="sm:col-span-2 grid grid-cols-2 gap-4 pt-2">
                <button type="button"
                  className="px-6 py-3 rounded-pill border border-black/10 font-semibold text-ink-primary text-xs hover:bg-black/5 transition-all"
                  onClick={() => setShowVehicleModal(false)}>Cancel</button>
                <button type="submit" className="btn-signature !h-12 !text-sm flex items-center justify-center gap-3 px-6 !rounded-pill">
                  {editingVehicle ? 'SAVE CHANGES' : 'ADD VEHICLE'}
                  <div className="icon-nest !w-8 !h-8">{editingVehicle ? <Save size={18} /> : <Plus size={18} />}</div>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DISPATCH FULL-PAGE OVERLAY ─────────────────────────────────────────── */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 bg-canvas flex flex-col animate-fade-in">
          {/* Header bar */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-black/5 bg-white/80 backdrop-blur-sm">
            <button
              onClick={() => setShowDispatchModal(false)}
              className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-ink-primary transition-colors group"
            >
              <div className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center group-hover:bg-black/5 transition-all">
                <X size={15} />
              </div>
              <span className="hidden sm:block">Cancel</span>
            </button>

            <div className="flex items-center gap-3">
              <h2 className="text-lg font-black font-sora text-ink-primary leading-none uppercase tracking-tight">
                Dispatch<span className="text-accent-signature">.</span>
              </h2>
              <span className="hidden sm:block text-[10px] font-semibold text-muted-foreground">Assign vehicle · driver · deliveries</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-[10px] font-semibold text-muted-foreground">{selectedInvoices.length} of {pendingDeliveries.length} deliveries</div>
                <div className="text-sm font-black text-ink-primary tabular-nums">
                  {sym}{selectedInvoices.reduce((s, id) => {
                    const inv = deliveryInvoices.find(i => i.id === id);
                    return s + (inv?.grand_total || 0);
                  }, 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable body */}
          <form onSubmit={handleDispatch} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* ── LEFT COLUMN: Config ── */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">Route Configuration</h3>

                    {/* Vehicle */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground block mb-1.5">Vehicle</label>
                        <select
                          className="w-full bg-white border border-black/8 rounded-xl px-4 py-3.5 font-semibold text-sm outline-none focus:ring-2 focus:ring-accent-signature/30 appearance-none"
                          value={dispatchForm.vehicleId}
                          onChange={e => setDispatchForm({ ...dispatchForm, vehicleId: e.target.value })}>
                          <option value="">Select vehicle...</option>
                          {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} — {v.plate}</option>)}
                        </select>
                      </div>

                      {/* Driver */}
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground block mb-1.5">Driver *</label>
                        <select
                          className="w-full bg-white border border-black/8 rounded-xl px-4 py-3.5 font-semibold text-sm outline-none focus:ring-2 focus:ring-accent-signature/30 appearance-none"
                          value={dispatchForm.driverId}
                          onChange={e => setDispatchForm({ ...dispatchForm, driverId: e.target.value })}>
                          <option value="">Select driver...</option>
                          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}{emp.position ? ` — ${emp.position}` : ''}</option>)}
                        </select>
                      </div>

                      {/* Route */}
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground block mb-1.5">Route / Area</label>
                        <input type="text"
                          className="w-full bg-white border border-black/8 rounded-xl px-4 py-3 font-semibold text-sm outline-none focus:ring-2 focus:ring-accent-signature/30"
                          placeholder="e.g. North Zone"
                          value={dispatchForm.location}
                          onChange={e => setDispatchForm({ ...dispatchForm, location: e.target.value })} />
                      </div>
                    </div>
                  </div>

                  {/* Van Load */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        <PackagePlus size={11} /> Stock On Van
                      </h3>
                      {vanCurrentStock.length > 0 && (
                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                          Loaded
                        </span>
                      )}
                    </div>
                    {vanCurrentStock.length === 0 ? (
                      <div className="py-8 text-center text-[10px] text-muted-foreground border border-dashed border-black/10 rounded-xl">
                        Van is empty — load it from Fleet → Load Van.<br />
                        Driver will only deliver invoices.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {vanCurrentStock.map(item => (
                          <div key={item.productId} className="flex items-center justify-between bg-white border border-black/8 rounded-xl px-3 py-2">
                            <span className="text-xs font-semibold text-ink-primary truncate">{item.productName}</span>
                            <span className="text-xs font-black text-ink-primary tabular-nums shrink-0 ml-2">{item.qty} <span className="text-[9px] text-muted-foreground font-medium">pcs</span></span>
                          </div>
                        ))}
                        <div className="flex justify-between text-[9px] text-muted-foreground px-1 pt-1">
                          <span>{vanCurrentStock.reduce((s, i) => s + i.qty, 0)} units on van</span>
                          <span className="font-bold text-ink-primary">{sym}{vanCurrentStock.reduce((s, i) => s + i.qty * i.sellingPrice, 0).toFixed(2)} retail value</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── RIGHT COLUMN: Deliveries ── */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      Deliveries ({selectedInvoices.length} of {pendingDeliveries.length})
                    </h3>
                    <button type="button"
                      className="text-[9px] font-bold text-accent-signature hover:underline"
                      onClick={() => setSelectedInvoices(
                        selectedInvoices.length === pendingDeliveries.length ? [] : pendingDeliveries.map(i => i.id)
                      )}>
                      {selectedInvoices.length === pendingDeliveries.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {pendingDeliveries.length === 0 ? (
                      <div className="py-12 text-center text-[10px] text-muted-foreground border border-dashed border-black/10 rounded-xl">No pending deliveries</div>
                    ) : pendingDeliveries.map(inv => {
                      const checked = selectedInvoices.includes(inv.id);
                      return (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => toggleInvoice(inv.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all ${
                            checked
                              ? 'bg-ink-primary border-ink-primary'
                              : 'bg-white border-black/8 hover:border-black/15'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                            checked ? 'bg-accent-signature border-accent-signature' : 'border-black/20'
                          }`}>
                            {checked && <Check size={11} className="text-ink-primary" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-bold ${checked ? 'text-surface' : 'text-ink-primary'}`}>
                              {(inv.invoice_number || inv.id).replace(/^#+/, '')}
                              <span className={`ml-1.5 font-medium ${checked ? 'text-white/60' : 'text-muted-foreground'}`}>· {inv.client_name}</span>
                            </div>
                            <div className={`text-[9px] flex items-center gap-1.5 flex-wrap mt-0.5 ${checked ? 'text-white/50' : 'text-muted-foreground'}`}>
                              {inv.delivery_zone && (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${checked ? 'bg-white/10 text-white/80' : 'bg-blue-50 text-blue-600'}`}>
                                  {inv.delivery_zone}
                                </span>
                              )}
                              {inv.delivery_date && (
                                <span>{new Date(inv.delivery_date).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</span>
                              )}
                              {inv.delivery_address && (
                                <span className="flex items-center gap-0.5 truncate">
                                  <MapPin size={8} className="shrink-0" />{inv.delivery_address}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`text-sm font-black tabular-nums shrink-0 ${checked ? 'text-accent-signature' : 'text-ink-primary'}`}>
                            {sym}{Number(inv.grand_total || 0).toFixed(2)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

            {/* Sticky footer */}
            <div className="shrink-0 border-t border-black/5 bg-white/90 backdrop-blur-sm px-6 py-4">
              <div className="max-w-5xl mx-auto space-y-3">
                {dispatchError && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertTriangle size={14} className="text-red-500 shrink-0" />
                    <span className="text-xs font-semibold text-red-600">{dispatchError}</span>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="flex-1 flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="font-semibold">{selectedInvoices.length} deliveries</span>
                    {vanCurrentStock.length > 0 && <span>{vanCurrentStock.reduce((s,i)=>s+i.qty,0)} van units</span>}
                    <span className="text-muted-foreground">·</span>
                    <span>{todayISOInAppTZ()}</span>
                    <span className="ml-auto font-black text-sm text-ink-primary tabular-nums">
                      Total: {sym}{selectedInvoices.reduce((s, id) => {
                        const inv = deliveryInvoices.find(i => i.id === id);
                        return s + (inv?.grand_total || 0);
                      }, 0).toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-signature !h-12 !px-10 !text-sm flex items-center justify-center gap-3 !rounded-xl shrink-0"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-ink-primary/30 border-t-ink-primary rounded-full animate-spin" />
                        Dispatching…
                      </span>
                    ) : (
                      <>
                        CONFIRM DISPATCH
                        <div className="icon-nest !w-8 !h-8"><CheckCircle2 size={18} /></div>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── END TRIP (RECONCILE) MODAL ─────────────────────────────────────────── */}
      {reconcileRoute_ && (
        <div className="modal-overlay">
          <div className="glass-modal !max-w-md">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-3xl font-black font-sora text-ink-primary leading-none tracking-tight uppercase">
                  END TRIP<span className="text-accent-signature">.</span>
                </h1>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-1">
                  {vehicles.find(v => v.id === (reconcileRoute_.vehicleId || reconcileRoute_['vehicleId']))?.name || 'Vehicle'}
                  {reconcileRoute_.location ? ` · ${reconcileRoute_.location}` : ''}
                </p>
              </div>
              <button className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all"
                onClick={() => { setReconcileRoute(null); setReconcileError(null); }}>
                <X size={18} />
              </button>
            </div>

            {/* Stop summary */}
            {(() => {
              const stops = routeStops.filter(s => s.route_id === reconcileRoute_.id);
              const delivered = stops.filter(s => s.status === 'DELIVERED').length;
              const noSale    = stops.filter(s => s.status === 'NO_SALE').length;
              const pending   = stops.filter(s => s.status === 'PENDING').length;
              return stops.length > 0 ? (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { label: 'Delivered', value: delivered, color: 'text-green-600' },
                    { label: 'No Sale',   value: noSale,    color: 'text-red-500'   },
                    { label: 'Pending',   value: pending,   color: 'text-muted-foreground'  },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center bg-canvas rounded-xl py-3 border border-black/5">
                      <div className={`text-xl font-black tabular-nums ${color}`}>{value}</div>
                      <div className="text-[9px] font-semibold text-muted-foreground mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}

            <form onSubmit={handleReconcile} className="space-y-4">
              {/* Returned Stock */}
              {(() => {
                const loaded = reconcileRoute_.loadedStock || reconcileRoute_.loaded_stock || [];
                if (loaded.length === 0) return null;
                return (
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Unload from Van (Optional)</p>
                    <p className="text-[9px] text-muted-foreground mb-2">Leave at 0 — stock stays on van for next trip</p>
                    <div className="space-y-2">
                      {loaded.map(item => {
                        const returned = parseInt(reconcileReturned[item.productId] ?? item.quantity) || 0;
                        const sold = Math.max(0, item.quantity - returned);
                        const prod = products.find(p => p.id === item.productId);
                        return (
                          <div key={item.productId} className="flex items-center gap-3 bg-white border border-border shadow-sm rounded-xl px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-ink-primary truncate">{prod?.name || item.productId}</div>
                              <div className="text-[9px] text-muted-foreground">Loaded: {item.quantity} · Sold: <span className="text-green-600 font-bold">{sold}</span></div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[9px] text-muted-foreground">Return:</span>
                              <input
                                type="number" min="0" max={item.quantity}
                                className="w-14 bg-white border border-black/10 rounded-lg px-2 py-1 text-xs font-bold text-center outline-none focus:ring-2 focus:ring-accent-signature/20"
                                value={returned}
                                onChange={e => setReconcileReturned(prev => ({ ...prev, [item.productId]: e.target.value }))}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-1.5 text-right">
                      Van sold: <span className="font-bold text-green-600">
                        {loaded.reduce((s, item) => s + Math.max(0, item.quantity - (parseInt(reconcileReturned[item.productId] ?? item.quantity) || 0)), 0)} units
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-1.5">
                  Total Cash Collected ({sym})
                </label>
                <input
                  type="number" step="0.01" min="0"
                  className="w-full bg-white border border-border shadow-sm rounded-xl px-4 py-4 font-bold text-xl outline-none focus:ring-2 focus:ring-accent-signature/30 tabular-nums"
                  placeholder="0.00"
                  value={reconcileCash}
                  onChange={e => setReconcileCash(e.target.value)}
                  autoFocus
                />
                <p className="text-[9px] text-muted-foreground mt-1">Includes invoice collections + van sales cash</p>
              </div>
              {reconcileError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-medium">
                  {reconcileError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button"
                  className="px-6 py-3 rounded-pill border border-black/10 font-semibold text-ink-primary text-xs hover:bg-black/5 transition-all"
                  disabled={reconcileLoading}
                  onClick={() => { setReconcileRoute(null); setReconcileError(null); }}>Cancel</button>
                <button type="submit" disabled={reconcileLoading}
                  className="btn-signature !h-12 !text-sm flex items-center justify-center gap-3 px-6 !rounded-pill disabled:opacity-60">
                  {reconcileLoading ? <span className="inline-block w-4 h-4 border-2 border-ink-primary/30 border-t-ink-primary rounded-full animate-spin" /> : null}
                  END TRIP
                  {!reconcileLoading && <div className="icon-nest !w-8 !h-8"><CheckCircle2 size={18} /></div>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── VAN SALE POS MODAL ───────────────────────────────────────────────── */}
      {/* Van Sale → navigates to /vehicles/van-sale page */}

      {/* ── VAN STOCK DASHBOARD TAB ──────────────────────────────────────────── */}
      {activeTab === 'VAN_STOCK' && (() => {
        // Build per-vehicle stock breakdown from inventory_balances
        const vanStockData = vehicles.map(v => {
          const loc = inventoryLocations.find(l => l.type === 'VEHICLE' && l.reference_id === v.id);
          const balances = loc
            ? inventoryBalances
                .filter(b => b.location_id === loc.id && b.quantity > 0)
                .map(b => {
                  const prod = products.find(p => p.id === b.product_id);
                  return {
                    productId:   b.product_id,
                    productName: prod?.name || b.product_id,
                    category:    prod?.category || '',
                    qty:         b.quantity,
                    sellingPrice: prod?.sellingPrice || 0,
                    value:       b.quantity * (prod?.sellingPrice || 0),
                    isLow:       b.quantity < 5,
                  };
                })
                .sort((a, b) => b.qty - a.qty)
            : [];
          const totalUnits  = balances.reduce((s, b) => s + b.qty, 0);
          const totalValue  = balances.reduce((s, b) => s + b.value, 0);
          const lowItems    = balances.filter(b => b.isLow).length;
          const inTrip      = activeRoutes.some(r => (r.vehicleId || r['vehicleId']) === v.id);
          return { vehicle: v, balances, totalUnits, totalValue, lowItems, inTrip };
        });

        const totalFleetUnits = vanStockData.reduce((s, d) => s + d.totalUnits, 0);
        const totalFleetValue = vanStockData.reduce((s, d) => s + d.totalValue, 0);
        const vansWithStock   = vanStockData.filter(d => d.totalUnits > 0).length;
        const totalLowItems   = vanStockData.reduce((s, d) => s + d.lowItems, 0);

        return (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-8 bg-accent-signature rounded-pill" />
                <div>
                  <h2 className="text-base font-bold text-ink-primary">Van Stock Dashboard</h2>
                  <p className="text-[10px] text-muted-foreground">Live inventory across all vehicles</p>
                </div>
              </div>
            </div>

            {/* Fleet-wide KPI bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Fleet Stock',    value: `${totalFleetUnits.toLocaleString()} units`, sub: 'total on board',   color: 'bg-blue-50 border-blue-100 text-blue-700',   icon: Layers       },
                { label: 'Fleet Value',    value: `${sym}${totalFleetValue.toLocaleString(undefined,{maximumFractionDigits:0})}`, sub: 'at selling price', color: 'bg-green-50 border-green-100 text-green-700', icon: BarChart2 },
                { label: 'Vans w/ Stock',  value: `${vansWithStock} / ${vehicles.length}`,     sub: 'loaded',           color: 'bg-canvas border-black/8 text-ink-secondary',     icon: Truck        },
                { label: 'Low Stock SKUs', value: `${totalLowItems}`,                           sub: '<5 units per van', color: totalLowItems > 0 ? 'bg-accent-signature/10 border-accent-signature/15 text-accent-signature-hover' : 'bg-canvas border-black/8 text-muted-foreground', icon: AlertCircle },
              ].map(kpi => (
                <div key={kpi.label} className={`flex items-center gap-3 p-3 rounded-2xl border ${kpi.color}`}>
                  <kpi.icon size={18} className="shrink-0 opacity-70" />
                  <div>
                    <div className="text-xs font-black">{kpi.value}</div>
                    <div className="text-[9px] font-semibold uppercase tracking-widest opacity-70">{kpi.label}</div>
                    <div className="text-[9px] opacity-50">{kpi.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Per-vehicle cards */}
            <div className="space-y-4">
              {vanStockData.map(({ vehicle: v, balances, totalUnits, totalValue, lowItems, inTrip }) => (
                <div key={v.id} className="bg-white border border-black/5 rounded-2xl overflow-hidden">
                  {/* Vehicle header row */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-black/5 bg-canvas/40">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-8 rounded-pill ${inTrip ? 'bg-accent-signature' : 'bg-border'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-ink-primary uppercase tracking-tight">{v.name}</span>
                          {inTrip && (
                            <span className="text-[8px] font-bold text-ink-primary bg-accent-signature px-2 py-0.5 rounded-pill">ON TRIP</span>
                          )}
                          {lowItems > 0 && (
                            <span className="flex items-center gap-1 text-[8px] font-bold text-accent-signature-hover bg-accent-signature/15 px-2 py-0.5 rounded-pill">
                              <AlertCircle size={8} />{lowItems} low
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-semibold">{v.plate} · {v.type}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <div className="text-sm font-black text-ink-primary">{totalUnits.toLocaleString()}</div>
                        <div className="text-[9px] text-muted-foreground font-semibold">units</div>
                      </div>
                      <div>
                        <div className="text-sm font-black text-green-700">{sym}{totalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                        <div className="text-[9px] text-muted-foreground font-semibold">value</div>
                      </div>
                      <button
                        onClick={() => openLoadVan(v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-signature/10 border border-accent-signature/20 text-[10px] font-bold text-ink-primary hover:bg-accent-signature/20 transition-all shrink-0"
                      >
                        <PackagePlus size={10} /> Load
                      </button>
                      {totalUnits > 0 && !inTrip && (
                        <button
                          onClick={() => openUnloadVan(v)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-signature/10 border border-accent-signature/25 text-[10px] font-bold text-accent-signature-hover hover:bg-accent-signature/15 transition-all shrink-0"
                        >
                          <MinusCircle size={10} /> Unload
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Product rows */}
                  {balances.length === 0 ? (
                    <div className="px-5 py-6 text-center text-[11px] font-semibold text-muted-foreground">
                      No stock on this van — use "Load" to transfer from warehouse
                    </div>
                  ) : (
                    <div className="divide-y divide-black/3">
                      {balances.map(b => {
                        const pct = Math.min(100, (b.qty / Math.max(...balances.map(x => x.qty), 1)) * 100);
                        return (
                          <div key={b.productId} className="flex items-center gap-3 px-5 py-2.5 hover:bg-canvas/50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-ink-primary truncate">{b.productName}</span>
                                {b.isLow && <TrendingDown size={10} className="text-accent-signature shrink-0" />}
                              </div>
                              {b.category && (
                                <span className="text-[9px] text-muted-foreground">{b.category}</span>
                              )}
                            </div>
                            {/* Bar chart strip */}
                            <div className="w-24 hidden sm:block">
                              <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${b.isLow ? 'bg-accent-signature/70' : 'bg-accent-signature'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-right shrink-0 w-16">
                              <div className={`text-sm font-black ${b.isLow ? 'text-accent-signature' : 'text-ink-primary'}`}>{b.qty}</div>
                              <div className="text-[9px] text-muted-foreground">units</div>
                            </div>
                            <div className="text-right shrink-0 w-20 hidden sm:block">
                              <div className="text-xs font-semibold text-muted-foreground">{sym}{b.value.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                              <div className="text-[9px] text-muted-foreground">value</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

              {vehicles.length === 0 && (
                <div className="py-20 text-center bg-white border border-black/5 rounded-2xl">
                  <Truck size={36} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-sm font-bold text-muted-foreground">No vehicles registered</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── LIVE MAP TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'LIVE' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-accent-signature rounded-pill" />
            <h2 className="text-base font-bold text-ink-primary">Live Vehicle Map</h2>
            <span className="text-[11px] text-muted-foreground">Auto-tracked via LedgrPOS driver app</span>
          </div>

          <Suspense fallback={
            <div className="flex items-center justify-center h-64 rounded-3xl bg-white border border-border shadow-sm">
              <div className="text-sm text-muted-foreground">Loading map…</div>
            </div>
          }>
            <VehicleLiveMap vehicles={vehicles} tenantId={currentTenantId} />
          </Suspense>
        </div>
      )}

      {/* ── Failed Delivery Modal ───────────────────────────────────────── */}
      {failedInvoiceId && (
        <div className="modal-overlay" onClick={() => setFailedInvoiceId(null)}>
          <div className="glass-modal !max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-base font-black font-sora text-ink-primary uppercase">
                  Failed Delivery<span className="text-red-500">.</span>
                </h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">Order will be re-queued for next dispatch</p>
              </div>
              <button onClick={() => setFailedInvoiceId(null)} className="w-8 h-8 rounded-pill border border-black/10 flex items-center justify-center hover:bg-canvas">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Reason</label>
                <select
                  value={failedReason}
                  onChange={e => setFailedReason(e.target.value)}
                  className="w-full bg-white border border-border shadow-sm rounded-xl px-3 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-red-200"
                >
                  <option value="">Select reason…</option>
                  <option value="Customer unavailable">Customer unavailable</option>
                  <option value="Wrong address">Wrong address</option>
                  <option value="Customer refused delivery">Customer refused delivery</option>
                  <option value="Payment issue">Payment issue</option>
                  <option value="Damaged goods">Damaged goods</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              {failedReason === 'Other' && (
                <input
                  type="text"
                  placeholder="Describe reason…"
                  className="w-full bg-white border border-border shadow-sm rounded-xl px-3 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-red-200"
                  onChange={e => setFailedReason(e.target.value)}
                />
              )}
              <button
                disabled={!failedReason || failedSubmitting}
                onClick={async () => {
                  setFailedSubmitting(true);
                  await markFailedDelivery(failedInvoiceId, failedReason);
                  setFailedSubmitting(false);
                  setFailedInvoiceId(null);
                  setFailedReason('');
                }}
                className="w-full h-11 rounded-xl bg-red-500 text-white text-xs font-black hover:bg-red-600 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} />
                {failedSubmitting ? 'Re-queuing…' : 'Confirm & Re-queue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Vehicles;
