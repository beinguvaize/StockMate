import React, { useState, lazy, Suspense } from 'react';
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
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const sym = businessProfile?.currencySymbol || '';

  const {
    vehicles, addVehicle, updateVehicle, deleteVehicle,
    routes, dispatchRoute, reconcileRoute,
    deliveryInvoices, routeStops, updateStopStatus, recordVanSale,
  } = useOperations(currentTenantId);

  const { products, inventoryLocations, inventoryBalances } = useInventory(currentTenantId);
  const { employees } = usePeople(currentTenantId);

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab,          setActiveTab]          = useState('DELIVERIES');
  const [deliverySubTab,     setDeliverySubTab]     = useState('PENDING');   // PENDING | ACTIVE | HISTORY
  const [showVehicleModal,   setShowVehicleModal]   = useState(false);
  const [showDispatchModal,  setShowDispatchModal]  = useState(false);
  const [reconcileRoute_,    setReconcileRoute]     = useState(null);  // route obj
  const [reconcileCash,      setReconcileCash]      = useState('');
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
  const [vanLoadItems, setVanLoadItems] = useState([]); // [{productId, productName, qty, sellingPrice, costPrice}]

  // Van Sale modal
  const [vanSaleRoute,    setVanSaleRoute]    = useState(null);
  const [vanSaleItems,    setVanSaleItems]    = useState([]);   // [{productId, productName, qty, sellingPrice, costPrice}]
  const [vanSaleClient,   setVanSaleClient]   = useState('Walk-in');
  const [vanSaleMethod,   setVanSaleMethod]   = useState('CASH');
  const [vanSaleError,    setVanSaleError]    = useState('');
  const [vanSaleLoading,  setVanSaleLoading]  = useState(false);

  // Reconcile returned stock (productId → returned qty)
  const [reconcileReturned, setReconcileReturned] = useState({});

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeRoutes  = routes.filter(r => r.status === 'ACTIVE' || r.status === 'IN_TRANSIT');
  const pastRoutes    = routes
    .filter(r => r.status === 'RECONCILED' || r.status === 'COMPLETED')
    .sort((a, b) => new Date(b.reconciled_at || 0) - new Date(a.reconciled_at || 0))
    .slice(0, 30);

  const pendingDeliveries = deliveryInvoices.filter(i => i.delivery_status === 'PENDING');
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
    setVanLoadItems([]);
    setShowDispatchModal(true);
  };

  // Van Load helpers
  const addVanLoadRow = () => {
    if (!products.length) return;
    const p = products[0];
    setVanLoadItems(prev => [...prev, { productId: p.id, productName: p.name, qty: 1, sellingPrice: p.sellingPrice || 0, costPrice: p.costPrice || 0 }]);
  };
  const removeVanLoadRow = (idx) => setVanLoadItems(prev => prev.filter((_, i) => i !== idx));
  const updateVanLoadRow = (idx, field, value) =>
    setVanLoadItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      if (field === 'productId') {
        const p = products.find(pr => pr.id === value);
        return p ? { ...item, productId: p.id, productName: p.name, sellingPrice: p.sellingPrice || 0, costPrice: p.costPrice || 0 } : item;
      }
      return { ...item, [field]: field === 'qty' ? Math.max(1, parseInt(value) || 1) : value };
    }));

  const toggleInvoice = (id) =>
    setSelectedInvoices(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  const handleDispatch = async (e) => {
    e.preventDefault();
    if (!dispatchForm.vehicleId) { setDispatchError('Select a vehicle.'); return; }
    if (!dispatchForm.driverId)  { setDispatchError('Select a driver.');  return; }
    if (selectedInvoices.length === 0 && vanLoadItems.filter(i => i.qty > 0).length === 0) {
      setDispatchError('Select at least 1 delivery or add van stock to load.');
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
        loadedStock:     vanLoadItems.filter(i => i.qty > 0).map(i => ({
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
  const openVanSale = (route) => {
    setVanSaleRoute(route);
    setVanSaleClient('Walk-in');
    setVanSaleMethod('CASH');
    setVanSaleError('');
    if (products.length) {
      const p = products[0];
      setVanSaleItems([{ productId: p.id, productName: p.name, qty: 1, sellingPrice: p.sellingPrice || 0, costPrice: p.costPrice || 0 }]);
    } else {
      setVanSaleItems([]);
    }
  };
  const addVanSaleItem = () => {
    if (!products.length) return;
    const p = products[0];
    setVanSaleItems(prev => [...prev, { productId: p.id, productName: p.name, qty: 1, sellingPrice: p.sellingPrice || 0, costPrice: p.costPrice || 0 }]);
  };
  const removeVanSaleItem = (idx) => setVanSaleItems(prev => prev.filter((_, i) => i !== idx));
  const updateVanSaleItem = (idx, field, value) =>
    setVanSaleItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      if (field === 'productId') {
        const p = products.find(pr => pr.id === value);
        return p ? { ...item, productId: p.id, productName: p.name, sellingPrice: p.sellingPrice || 0, costPrice: p.costPrice || 0 } : item;
      }
      return { ...item, [field]: field === 'qty' ? Math.max(1, parseInt(value) || 1) : field === 'sellingPrice' ? parseFloat(value) || 0 : value };
    }));
  const vanSaleTotal = vanSaleItems.reduce((s, i) => s + (i.sellingPrice * i.qty), 0);

  const handleVanSaleSubmit = async (e) => {
    e.preventDefault();
    if (!vanSaleItems.length) { setVanSaleError('Add at least one product.'); return; }
    setVanSaleLoading(true);
    setVanSaleError('');
    const vehicleLoc = inventoryLocations.find(l => l.reference_id === (vanSaleRoute.vehicleId || vanSaleRoute['vehicleId']));
    const { success, error } = await recordVanSale(vanSaleRoute.id, vehicleLoc?.id, {
      clientName:   vanSaleClient || 'Walk-in',
      items:        vanSaleItems.map(i => ({ ...i, quantity: i.qty })),
      totalAmount:  vanSaleTotal,
      paymentMethod: vanSaleMethod,
    });
    setVanSaleLoading(false);
    if (!success) { setVanSaleError(error?.message || 'Failed to record sale.'); return; }
    setVanSaleRoute(null);
  };

  // Reconcile (End Trip)
  const openReconcile = (route) => {
    setReconcileRoute(route);
    setReconcileCash('');
    // Pre-populate returned stock from loaded_stock if available
    const loaded = route.loaded_stock || [];
    const initReturned = {};
    loaded.forEach(item => { initReturned[item.productId] = item.quantity; });
    setReconcileReturned(initReturned);
  };

  const handleReconcile = async (e) => {
    e.preventDefault();
    const loaded = reconcileRoute_.loaded_stock || [];
    const returnedStock = loaded.map(item => ({
      productId: item.productId,
      quantity:  Math.max(0, Math.min(item.quantity, parseInt(reconcileReturned[item.productId] ?? item.quantity) || 0)),
    }));
    await reconcileRoute(reconcileRoute_.id, 0, returnedStock, parseFloat(reconcileCash) || 0);
    setReconcileRoute(null);
  };

  // Mark stop
  const markStop = (stopId, status) => updateStopStatus(stopId, status);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="animate-fade-in flex flex-col gap-4 pb-12">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b border-black/5">
          <div>
            <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">
              FLEET<span className="text-accent-signature">.</span>
            </h1>
            <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">
              Vehicle Management &amp; Delivery Operations
            </p>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Pending Deliveries', value: pendingDeliveries.length, icon: Package,    accent: pendingDeliveries.length > 0 },
            { label: 'Active Trips',        value: activeRoutes.length,     icon: Navigation, accent: activeRoutes.length > 0      },
            { label: 'Completed Trips',     value: pastRoutes.length,       icon: History,    accent: false                        },
            { label: 'Service Alerts',      value: serviceAlerts.length,    icon: Wrench,     accent: serviceAlerts.length > 0     },
          ].map(({ label, value, icon: Icon, accent }) => (
            <div key={label} className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
              <div className={`absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none ${accent ? 'text-accent-signature' : 'text-ink-primary'}`}>
                <Icon size={38} strokeWidth={2} />
              </div>
              <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">{label}</span>
              <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        {/* Service alert banner */}
        {serviceAlerts.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-3 bg-yellow-50 border border-yellow-200 rounded-2xl mb-2">
            <Wrench size={16} className="text-yellow-600 shrink-0" />
            <span className="text-xs font-semibold text-yellow-800">
              {serviceAlerts.length} vehicle{serviceAlerts.length > 1 ? 's' : ''} due for service:{' '}
              {serviceAlerts.map(v => v.name).join(', ')}
            </span>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between bg-white border border-black/5 rounded-[2rem] shadow-sm p-2 min-h-[72px] gap-2 mb-4">
          <div className="flex-1 flex gap-1 bg-canvas p-1.5 rounded-pill border border-black/5 shadow-inner h-[56px]">
            {[
              { id: 'DELIVERIES', label: 'Deliveries', icon: Package   },
              { id: 'FLEET',      label: 'Fleet',      icon: Truck     },
              { id: 'LIVE',       label: 'Live Map',   icon: Map       },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 h-full rounded-pill text-[11px] font-bold tracking-wider transition-all flex items-center justify-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-ink-primary text-surface shadow-md'
                    : 'bg-transparent text-gray-500 hover:text-ink-primary hover:bg-black/5'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 h-[56px] lg:ml-1 w-full lg:w-auto mt-2 lg:mt-0">
            {activeTab === 'DELIVERIES' ? (
              <button
                className="btn-signature w-full lg:w-auto px-8 !h-full !py-0 !rounded-pill !text-xs !font-bold flex items-center justify-center gap-3"
                onClick={openDispatch}
              >
                DISPATCH
                <div className="icon-nest !w-8 !h-8 shrink-0"><Play size={16} /></div>
              </button>
            ) : (
              hasPermission('MANAGE_FLEET') && (
                <button
                  className="btn-signature w-full lg:w-auto px-8 !h-full !py-0 !rounded-pill !text-xs !font-bold flex items-center justify-center gap-3"
                  onClick={() => { setEditingVehicle(null); setVehicleForm(EMPTY_VEHICLE_FORM); setShowVehicleModal(true); }}
                >
                  ADD VEHICLE
                  <div className="icon-nest !w-8 !h-8 shrink-0"><Plus size={16} /></div>
                </button>
              )
            )}
          </div>
        </div>

        {/* ── DELIVERIES TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'DELIVERIES' && (
          <div className="space-y-4">

            {/* Sub-tab pills */}
            <div className="flex gap-2">
              {[
                { id: 'PENDING', label: `Pending (${pendingDeliveries.length})` },
                { id: 'ACTIVE',  label: `Active Trips (${activeRoutes.length})` },
                { id: 'HISTORY', label: 'History' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setDeliverySubTab(t.id)}
                  className={`px-4 py-2 rounded-pill text-[11px] font-bold transition-all ${
                    deliverySubTab === t.id
                      ? 'bg-ink-primary text-surface'
                      : 'bg-white border border-black/8 text-gray-500 hover:text-ink-primary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* PENDING sub-tab */}
            {deliverySubTab === 'PENDING' && (
              <div className="space-y-2">
                {pendingDeliveries.length === 0 ? (
                  <div className="py-20 text-center bg-white border border-black/5 rounded-2xl">
                    <Package size={36} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">No pending deliveries</p>
                    <p className="text-[10px] text-gray-300 mt-1">
                      Go to Invoices and mark invoices as "Requires Delivery"
                    </p>
                  </div>
                ) : (
                  <>
                    {pendingDeliveries.map(inv => {
                      const isExpanded = expandedInvoice === inv.id;
                      const items = Array.isArray(inv.items) ? inv.items : [];
                      return (
                        <div
                          key={inv.id}
                          className="bg-white border border-black/5 rounded-2xl overflow-hidden hover:border-black/10 transition-all"
                        >
                          {/* Header row — click to expand */}
                          <button
                            type="button"
                            className="w-full flex items-center gap-4 px-5 py-4 text-left"
                            onClick={() => setExpandedInvoice(isExpanded ? null : inv.id)}
                          >
                            <div className="w-10 h-10 rounded-xl bg-canvas border border-black/8 flex items-center justify-center shrink-0">
                              <Package size={16} className="text-ink-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-ink-primary">
                                  {(inv.invoice_number || inv.id).replace(/^#+/, '')}
                                </span>
                                <span className="text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-pill">
                                  INVOICE
                                </span>
                              </div>
                              <div className="text-[10px] text-gray-400 mt-0.5 font-medium">
                                {inv.client_name || '—'}
                                {items.length ? ` · ${items.length} item${items.length > 1 ? 's' : ''}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-sm font-black text-ink-primary tabular-nums">
                                {sym}{Number(inv.grand_total || 0).toFixed(2)}
                              </div>
                              <ChevronDown
                                size={14}
                                className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </div>
                          </button>

                          {/* Expandable items list */}
                          {isExpanded && items.length > 0 && (
                            <div className="border-t border-black/5 px-5 pb-4 pt-3 space-y-2">
                              {items.map((item, idx) => (
                                <div key={item.id || idx} className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-1.5 h-1.5 rounded-full bg-black/20 shrink-0" />
                                    <span className="text-[11px] font-semibold text-ink-primary truncate">
                                      {item.name || item.product_name || item.productName || '—'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4 shrink-0 text-[11px] text-gray-400 font-medium tabular-nums">
                                    <span>×{item.quantity ?? item.qty ?? 1}</span>
                                    <span className="text-ink-primary font-bold">
                                      {sym}{Number(item.total ?? ((item.rate ?? item.price ?? item.unit_price ?? 0) * (item.quantity ?? item.qty ?? 1))).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {isExpanded && items.length === 0 && (
                            <div className="border-t border-black/5 px-5 py-3 text-[11px] text-gray-400">
                              No item details available.
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
                        DISPATCH ALL {pendingDeliveries.length} DELIVERIES
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
                    <Navigation size={36} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">No active trips</p>
                    <p className="text-[10px] text-gray-300 mt-1">Dispatch a vehicle to start a trip</p>
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
                      {/* Trip header */}
                      <div className="flex items-center gap-4 p-5">
                        <div className="w-12 h-12 rounded-2xl bg-ink-primary text-accent-signature flex items-center justify-center shrink-0">
                          <Truck size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-ink-primary">{vehicle?.name || 'Vehicle'}</span>
                            <span className="text-[9px] font-semibold text-gray-400 bg-canvas border border-black/8 px-2 py-0.5 rounded-pill">
                              {vehicle?.plate}
                            </span>
                            {route.location && (
                              <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-pill">
                                {route.location}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-400">
                              Driver: <span className="font-semibold text-ink-primary">{driverName}</span>
                            </span>
                            {total > 0 && (
                              <span className="text-[10px] text-gray-400">
                                <span className="font-semibold text-green-600">{delivered}/{total}</span> delivered
                              </span>
                            )}
                          </div>
                          {/* Progress bar */}
                          {total > 0 && (
                            <div className="mt-2 h-1.5 w-full max-w-xs bg-black/5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          {total > 0 && (
                            <button
                              onClick={() => setExpandedTrip(expanded ? null : route.id)}
                              className="px-3 py-1.5 rounded-pill border border-black/10 text-[10px] font-semibold text-gray-600 hover:bg-canvas transition-colors"
                            >
                              {expanded ? 'Hide' : `Stops (${total})`}
                            </button>
                          )}
                          <button
                            onClick={() => openVanSale(route)}
                            className="px-3 py-1.5 rounded-pill border border-accent-signature/40 text-[10px] font-semibold text-accent-signature bg-accent-signature/5 hover:bg-accent-signature/10 transition-colors flex items-center gap-1"
                          >
                            <ShoppingCart size={10} /> Van Sale
                          </button>
                          <button
                            onClick={() => openReconcile(route)}
                            className="px-4 py-2 rounded-pill bg-ink-primary text-surface text-[10px] font-bold hover:opacity-90 transition-opacity"
                          >
                            END TRIP
                          </button>
                        </div>
                      </div>

                      {/* Stops panel */}
                      {expanded && stops.length > 0 && (
                        <div className="border-t border-black/5 bg-canvas/50 px-5 py-4 space-y-2">
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">Delivery Stops</p>
                          {stops.map(stop => {
                            const done = stop.status !== 'PENDING';
                            return (
                              <div key={stop.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-black/5">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${
                                  stop.status === 'DELIVERED' ? 'bg-green-500' :
                                  stop.status === 'NO_SALE'   ? 'bg-red-500'   :
                                  'bg-gray-300'
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold text-ink-primary truncate">
                                    {stop.client_name || 'Client'}
                                  </div>
                                  {stop.invoice_id && (
                                    <div className="text-[9px] text-gray-400 mt-0.5">
                                      {(stop.invoice_id).replace(/^INV-/, '#')}
                                    </div>
                                  )}
                                </div>
                                {stop.cash_collected > 0 && (
                                  <span className="text-[10px] font-bold text-green-600 shrink-0">
                                    {sym}{Number(stop.cash_collected).toLocaleString()}
                                  </span>
                                )}
                                {!done ? (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => markStop(stop.id, 'DELIVERED')}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 border border-green-200 text-[9px] font-bold text-green-700 hover:bg-green-100 transition-colors"
                                    >
                                      <Check size={10} /> Delivered
                                    </button>
                                    <button
                                      onClick={() => markStop(stop.id, 'NO_SALE')}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-[9px] font-bold text-red-600 hover:bg-red-100 transition-colors"
                                    >
                                      <XCircle size={10} /> No Sale
                                    </button>
                                  </div>
                                ) : (
                                  <span className={`text-[9px] font-bold px-2 py-1 rounded-lg shrink-0 ${
                                    stop.status === 'DELIVERED' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                                  }`}>
                                    {stop.status === 'DELIVERED' ? 'Delivered' : 'No Sale'}
                                  </span>
                                )}
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
                    <History size={36} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">No completed trips yet</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-canvas border-b border-black/5 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
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
                            <td className="p-3 pl-5 text-[11px] text-gray-400">
                              {route.reconciled_at
                                ? new Date(route.reconciled_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                                : route.date || '—'}
                            </td>
                            <td className="p-3 text-xs font-semibold text-ink-primary">
                              {vehicle?.name || '—'}
                              <div className="text-[9px] text-gray-400">{vehicle?.plate}</div>
                            </td>
                            <td className="p-3 text-xs text-gray-600">
                              {getEmployeeName(route.driverId || route['driverId'])}
                            </td>
                            <td className="p-3 text-xs text-gray-500">{route.location || '—'}</td>
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
              <span className="ml-1 text-[10px] font-semibold text-gray-400">{vehicles.length} vehicles</span>
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
                          <div className="text-[10px] font-semibold text-gray-400 mt-0.5">{v.plate}</div>
                        </div>
                        {v.type && (
                          <span className="text-[9px] font-bold text-gray-400 bg-canvas px-2 py-0.5 rounded-pill border border-black/5">{v.type}</span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 text-[9px] font-semibold text-gray-500">
                        {v.fuelType && <span className="flex items-center gap-1"><Fuel size={9} />{v.fuelType}</span>}
                        {v.capacity && <span className="flex items-center gap-1"><Truck size={9} />{v.capacity} cap</span>}
                        {v.year     && <span className="flex items-center gap-1"><Calendar size={9} />{v.year}</span>}
                      </div>

                      <div className="p-2.5 bg-canvas/60 rounded-xl border border-black/5">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Stock on Board</span>
                          <span className="text-[10px] font-bold text-ink-primary">{stock} units</span>
                        </div>
                        <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
                          <div className="h-full bg-accent-signature" style={{ width: `${Math.min(100, stock)}%` }} />
                        </div>
                      </div>

                      {v.nextServiceDate && (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-semibold ${
                          svcSt === 'overdue' ? 'bg-red-50 text-red-700 border border-red-100' :
                          svcSt === 'soon'    ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' :
                                                'bg-canvas text-gray-500 border border-black/5'
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
                <div className="col-span-full py-20 text-center text-[10px] font-semibold text-gray-400">
                  No vehicles registered — click "Add Vehicle" to begin
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
                <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Vehicle Name *</label>
                <input required type="text"
                  className="w-full bg-canvas border border-black/5 rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
                  placeholder="e.g. Delivery Van 1"
                  value={vehicleForm.name} onChange={e => setVehicleForm({ ...vehicleForm, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">License Plate *</label>
                <input required type="text"
                  className="w-full bg-canvas border border-black/5 rounded-lg p-3.5 font-semibold text-xs outline-none focus:ring-4 focus:ring-accent-signature/20"
                  placeholder="e.g. KL01HHSHHS"
                  value={vehicleForm.plate} onChange={e => setVehicleForm({ ...vehicleForm, plate: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Type</label>
                <select className="w-full bg-canvas border border-black/5 rounded-lg p-3.5 font-semibold text-xs outline-none focus:ring-4 focus:ring-accent-signature/20 appearance-none"
                  value={vehicleForm.type} onChange={e => setVehicleForm({ ...vehicleForm, type: e.target.value })}>
                  {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Status</label>
                <select className="w-full bg-canvas border border-black/5 rounded-lg p-3.5 font-semibold text-xs outline-none focus:ring-4 focus:ring-accent-signature/20 appearance-none"
                  value={vehicleForm.status} onChange={e => setVehicleForm({ ...vehicleForm, status: e.target.value })}>
                  {VEHICLE_STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLES[s]?.label || s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Fuel Type</label>
                <select className="w-full bg-canvas border border-black/5 rounded-lg p-3.5 font-semibold text-xs outline-none focus:ring-4 focus:ring-accent-signature/20 appearance-none"
                  value={vehicleForm.fuelType} onChange={e => setVehicleForm({ ...vehicleForm, fuelType: e.target.value })}>
                  {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Capacity</label>
                <input type="number" min="0"
                  className="w-full bg-canvas border border-black/5 rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
                  placeholder="e.g. 100"
                  value={vehicleForm.capacity} onChange={e => setVehicleForm({ ...vehicleForm, capacity: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Color</label>
                <input type="text"
                  className="w-full bg-canvas border border-black/5 rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
                  placeholder="e.g. White"
                  value={vehicleForm.color} onChange={e => setVehicleForm({ ...vehicleForm, color: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Year</label>
                <input type="number" min="1990" max="2099"
                  className="w-full bg-canvas border border-black/5 rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
                  placeholder="e.g. 2022"
                  value={vehicleForm.year} onChange={e => setVehicleForm({ ...vehicleForm, year: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Last Service Date</label>
                <input type="date"
                  className="w-full bg-canvas border border-black/5 rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
                  value={vehicleForm.lastServiceDate} onChange={e => setVehicleForm({ ...vehicleForm, lastServiceDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Next Service Date</label>
                <input type="date"
                  className="w-full bg-canvas border border-black/5 rounded-lg p-3.5 font-medium text-sm outline-none focus:ring-4 focus:ring-accent-signature/20"
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

      {/* ── DISPATCH MODAL ─────────────────────────────────────────────────────── */}
      {showDispatchModal && (
        <div className="modal-overlay">
          <div className="glass-modal !max-w-2xl">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-4xl font-black font-sora text-ink-primary leading-none tracking-tight uppercase">
                  DISPATCH<span className="text-accent-signature">.</span>
                </h1>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">
                  Assign vehicle · driver · deliveries
                </p>
              </div>
              <button className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all"
                onClick={() => setShowDispatchModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleDispatch} className="space-y-5">
              {/* Vehicle */}
              <div>
                <label className="text-[10px] font-semibold text-gray-500 block mb-1.5">Vehicle</label>
                <select
                  className="w-full bg-canvas border border-black/8 rounded-xl px-4 py-3.5 font-semibold text-sm outline-none focus:ring-2 focus:ring-accent-signature/30 appearance-none"
                  value={dispatchForm.vehicleId}
                  onChange={e => setDispatchForm({ ...dispatchForm, vehicleId: e.target.value })}>
                  <option value="">Select vehicle...</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} — {v.plate}</option>)}
                </select>
              </div>

              {/* Driver */}
              <div>
                <label className="text-[10px] font-semibold text-gray-500 block mb-1.5">Driver *</label>
                <select
                  className="w-full bg-canvas border border-black/8 rounded-xl px-4 py-3.5 font-semibold text-sm outline-none focus:ring-2 focus:ring-accent-signature/30 appearance-none"
                  value={dispatchForm.driverId}
                  onChange={e => setDispatchForm({ ...dispatchForm, driverId: e.target.value })}>
                  <option value="">Select driver...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}{emp.position ? ` — ${emp.position}` : ''}</option>)}
                </select>
              </div>

              {/* Route */}
              <div>
                <label className="text-[10px] font-semibold text-gray-500 block mb-1.5">Route / Area</label>
                <input type="text"
                  className="w-full bg-canvas border border-black/8 rounded-xl px-4 py-3 font-semibold text-sm outline-none focus:ring-2 focus:ring-accent-signature/30"
                  placeholder="e.g. North Zone"
                  value={dispatchForm.location}
                  onChange={e => setDispatchForm({ ...dispatchForm, location: e.target.value })} />
              </div>

              {/* Deliveries */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-semibold text-gray-500">
                    Select Deliveries ({selectedInvoices.length} of {pendingDeliveries.length})
                  </label>
                  <button type="button"
                    className="text-[9px] font-bold text-accent-signature hover:underline"
                    onClick={() => setSelectedInvoices(
                      selectedInvoices.length === pendingDeliveries.length ? [] : pendingDeliveries.map(i => i.id)
                    )}>
                    {selectedInvoices.length === pendingDeliveries.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {pendingDeliveries.length === 0 ? (
                    <div className="py-6 text-center text-[10px] text-gray-400">No pending deliveries</div>
                  ) : pendingDeliveries.map(inv => {
                    const checked = selectedInvoices.includes(inv.id);
                    return (
                      <button
                        key={inv.id}
                        type="button"
                        onClick={() => toggleInvoice(inv.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                          checked
                            ? 'bg-ink-primary border-ink-primary'
                            : 'bg-white border-black/8 hover:border-black/15'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          checked ? 'bg-accent-signature border-accent-signature' : 'border-black/20'
                        }`}>
                          {checked && <Check size={10} className="text-ink-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-bold ${checked ? 'text-surface' : 'text-ink-primary'}`}>
                            {(inv.invoice_number || inv.id).replace(/^#+/, '')}
                          </div>
                          <div className={`text-[9px] ${checked ? 'text-white/60' : 'text-gray-400'}`}>
                            {inv.client_name}
                          </div>
                        </div>
                        <span className={`text-xs font-black tabular-nums shrink-0 ${checked ? 'text-accent-signature' : 'text-ink-primary'}`}>
                          {sym}{Number(inv.grand_total || 0).toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Van Load */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-semibold text-gray-500 flex items-center gap-1.5">
                    <PackagePlus size={11} /> Van Stock Load (Optional)
                  </label>
                  <button type="button"
                    className="text-[9px] font-bold text-accent-signature hover:underline flex items-center gap-1"
                    onClick={addVanLoadRow}>
                    + Add Product
                  </button>
                </div>
                {vanLoadItems.length === 0 ? (
                  <div className="py-4 text-center text-[10px] text-gray-400 border border-dashed border-black/10 rounded-xl">
                    No van stock — driver will only deliver invoices
                  </div>
                ) : (
                  <div className="space-y-2">
                    {vanLoadItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-canvas border border-black/8 rounded-xl px-3 py-2">
                        <select
                          className="flex-1 bg-transparent text-xs font-semibold outline-none"
                          value={item.productId}
                          onChange={e => updateVanLoadRow(idx, 'productId', e.target.value)}>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input
                          type="number" min="1"
                          className="w-16 bg-white border border-black/8 rounded-lg px-2 py-1 text-xs font-bold text-center outline-none"
                          value={item.qty}
                          onChange={e => updateVanLoadRow(idx, 'qty', e.target.value)} />
                        <span className="text-[9px] text-gray-400 shrink-0">pcs</span>
                        <button type="button" onClick={() => removeVanLoadRow(idx)}
                          className="text-red-400 hover:text-red-600 transition-colors shrink-0">
                          <MinusCircle size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="text-[9px] text-gray-400 text-right">
                      {vanLoadItems.reduce((s, i) => s + i.qty, 0)} units · {sym}{vanLoadItems.reduce((s, i) => s + i.qty * i.sellingPrice, 0).toFixed(2)} retail value
                    </div>
                  </div>
                )}
              </div>

              {dispatchError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle size={14} className="text-red-500 shrink-0" />
                  <span className="text-xs font-semibold text-red-600">{dispatchError}</span>
                </div>
              )}

              {/* Summary + confirm */}
              <div className="pt-2 border-t border-black/5">
                <div className="flex items-center justify-between mb-4 text-[10px] text-gray-400">
                  <span>{selectedInvoices.length} deliveries · {vanLoadItems.length > 0 ? `${vanLoadItems.reduce((s,i)=>s+i.qty,0)} van units · ` : ''}{todayISOInAppTZ()}</span>
                  <span className="font-black text-ink-primary tabular-nums">
                    Total: {sym}{selectedInvoices.reduce((s, id) => {
                      const inv = deliveryInvoices.find(i => i.id === id);
                      return s + (inv?.grand_total || 0);
                    }, 0).toFixed(2)}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-signature w-full !h-14 !text-sm flex items-center justify-center gap-3 !rounded-2xl"
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
            </form>
          </div>
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
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">
                  {vehicles.find(v => v.id === (reconcileRoute_.vehicleId || reconcileRoute_['vehicleId']))?.name || 'Vehicle'}
                  {reconcileRoute_.location ? ` · ${reconcileRoute_.location}` : ''}
                </p>
              </div>
              <button className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all"
                onClick={() => setReconcileRoute(null)}>
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
                    { label: 'Pending',   value: pending,   color: 'text-gray-400'  },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center bg-canvas rounded-xl py-3 border border-black/5">
                      <div className={`text-xl font-black tabular-nums ${color}`}>{value}</div>
                      <div className="text-[9px] font-semibold text-gray-400 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}

            <form onSubmit={handleReconcile} className="space-y-4">
              {/* Returned Stock */}
              {(() => {
                const loaded = reconcileRoute_.loaded_stock || [];
                if (loaded.length === 0) return null;
                return (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Van Stock — Returned Qty</p>
                    <div className="space-y-2">
                      {loaded.map(item => {
                        const returned = parseInt(reconcileReturned[item.productId] ?? item.quantity) || 0;
                        const sold = Math.max(0, item.quantity - returned);
                        const prod = products.find(p => p.id === item.productId);
                        return (
                          <div key={item.productId} className="flex items-center gap-3 bg-canvas border border-black/8 rounded-xl px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-ink-primary truncate">{prod?.name || item.productId}</div>
                              <div className="text-[9px] text-gray-400">Loaded: {item.quantity} · Sold: <span className="text-green-600 font-bold">{sold}</span></div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[9px] text-gray-400">Return:</span>
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
                    <div className="text-[9px] text-gray-400 mt-1.5 text-right">
                      Van sold: <span className="font-bold text-green-600">
                        {loaded.reduce((s, item) => s + Math.max(0, item.quantity - (parseInt(reconcileReturned[item.productId] ?? item.quantity) || 0)), 0)} units
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="text-[10px] font-semibold text-gray-500 block mb-1.5">
                  Total Cash Collected ({sym})
                </label>
                <input
                  type="number" step="0.01" min="0"
                  className="w-full bg-canvas border border-black/8 rounded-xl px-4 py-4 font-bold text-xl outline-none focus:ring-2 focus:ring-accent-signature/30 tabular-nums"
                  placeholder="0.00"
                  value={reconcileCash}
                  onChange={e => setReconcileCash(e.target.value)}
                  autoFocus
                />
                <p className="text-[9px] text-gray-400 mt-1">Includes invoice collections + van sales cash</p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button"
                  className="px-6 py-3 rounded-pill border border-black/10 font-semibold text-ink-primary text-xs hover:bg-black/5 transition-all"
                  onClick={() => setReconcileRoute(null)}>Cancel</button>
                <button type="submit" className="btn-signature !h-12 !text-sm flex items-center justify-center gap-3 px-6 !rounded-pill">
                  END TRIP
                  <div className="icon-nest !w-8 !h-8"><CheckCircle2 size={18} /></div>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── VAN SALE MODAL ─────────────────────────────────────────────────────── */}
      {vanSaleRoute && (
        <div className="modal-overlay">
          <div className="glass-modal !max-w-lg">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-3xl font-black font-sora text-ink-primary leading-none tracking-tight uppercase">
                  VAN SALE<span className="text-accent-signature">.</span>
                </h1>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">
                  {vehicles.find(v => v.id === (vanSaleRoute.vehicleId || vanSaleRoute['vehicleId']))?.name || 'Vehicle'}
                  {vanSaleRoute.location ? ` · ${vanSaleRoute.location}` : ''}
                </p>
              </div>
              <button className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all"
                onClick={() => setVanSaleRoute(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleVanSaleSubmit} className="space-y-4">
              {/* Client + Payment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-1.5">Customer</label>
                  <input type="text"
                    className="w-full bg-canvas border border-black/8 rounded-xl px-3 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20"
                    placeholder="Walk-in / Client name"
                    value={vanSaleClient}
                    onChange={e => setVanSaleClient(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-1.5">Payment</label>
                  <select
                    className="w-full bg-canvas border border-black/8 rounded-xl px-3 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20 appearance-none"
                    value={vanSaleMethod}
                    onChange={e => setVanSaleMethod(e.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CREDIT">Credit</option>
                  </select>
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-semibold text-gray-500">Items</label>
                  <button type="button"
                    className="text-[9px] font-bold text-accent-signature hover:underline flex items-center gap-1"
                    onClick={addVanSaleItem}>
                    + Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {vanSaleItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-canvas border border-black/8 rounded-xl px-3 py-2">
                      <select
                        className="flex-1 bg-transparent text-xs font-semibold outline-none min-w-0"
                        value={item.productId}
                        onChange={e => updateVanSaleItem(idx, 'productId', e.target.value)}>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <div className="flex items-center gap-1 shrink-0">
                        <input type="number" min="1"
                          className="w-12 bg-white border border-black/8 rounded-lg px-1 py-1 text-xs font-bold text-center outline-none"
                          value={item.qty}
                          onChange={e => updateVanSaleItem(idx, 'qty', e.target.value)} />
                        <span className="text-[9px] text-gray-400">×</span>
                        <input type="number" min="0" step="0.01"
                          className="w-16 bg-white border border-black/8 rounded-lg px-1 py-1 text-xs font-bold text-center outline-none"
                          value={item.sellingPrice}
                          onChange={e => updateVanSaleItem(idx, 'sellingPrice', e.target.value)} />
                      </div>
                      <span className="text-[10px] font-bold text-ink-primary tabular-nums shrink-0 w-16 text-right">
                        {sym}{(item.qty * item.sellingPrice).toFixed(2)}
                      </span>
                      <button type="button" onClick={() => removeVanSaleItem(idx)}
                        className="text-red-400 hover:text-red-600 shrink-0">
                        <MinusCircle size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="flex justify-between items-center px-4 py-3 bg-ink-primary rounded-xl">
                <span className="text-xs font-bold text-white/60">TOTAL</span>
                <span className="text-lg font-black text-accent-signature tabular-nums">{sym}{vanSaleTotal.toFixed(2)}</span>
              </div>

              {vanSaleError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle size={14} className="text-red-500 shrink-0" />
                  <span className="text-xs font-semibold text-red-600">{vanSaleError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button"
                  className="px-6 py-3 rounded-pill border border-black/10 font-semibold text-ink-primary text-xs hover:bg-black/5 transition-all"
                  onClick={() => setVanSaleRoute(null)}>Cancel</button>
                <button type="submit" disabled={vanSaleLoading}
                  className="btn-signature !h-12 !text-sm flex items-center justify-center gap-3 px-6 !rounded-pill">
                  {vanSaleLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-ink-primary/30 border-t-ink-primary rounded-full animate-spin" />
                      Saving…
                    </span>
                  ) : (
                    <><ShoppingCart size={16} /> RECORD SALE</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── LIVE MAP TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'LIVE' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-accent-signature rounded-pill" />
            <h2 className="text-base font-bold text-ink-primary">Live Vehicle Map</h2>
            <span className="text-[11px] text-gray-400">Auto-tracked via LedgrPOS driver app</span>
          </div>

          <Suspense fallback={
            <div className="flex items-center justify-center h-64 rounded-3xl bg-canvas border border-black/5">
              <div className="text-sm text-gray-400">Loading map…</div>
            </div>
          }>
            <VehicleLiveMap vehicles={vehicles} tenantId={currentTenantId} />
          </Suspense>
        </div>
      )}
    </>
  );
};

export default Vehicles;
