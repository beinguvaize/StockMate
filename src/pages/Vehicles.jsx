import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    Truck, Map, Settings as SettingsIcon, Plus, Play, Flag, 
    FileText, AlertTriangle, X, ShoppingCart, ChevronRight,
    MapPin, Navigation, Gauge, Calendar, ShieldCheck, 
    Save, Hash, History, CheckCircle2, Crosshair, Radio
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom vehicle marker icon
const vehicleIcon = new L.DivIcon({
    className: 'custom-vehicle-marker',
    html: `<div style="background:#c8ff00;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #1a1a1a;box-shadow:0 4px 16px rgba(0,0,0,0.3);"><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='#1a1a1a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2'/><path d='M15 18H9'/><path d='M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14'/><circle cx='17' cy='18' r='2'/><circle cx='7' cy='18' r='2'/></svg></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
});

// Default map center (Dubai)
const DEFAULT_CENTER = [25.2048, 55.2708];
const DEFAULT_ZOOM = 11;

const Vehicles = () => {
    const { 
        vehicles, addVehicle, routes, dispatchRoute, reconcileRoute, 
        products, orders, businessProfile, employees, getEmployeeName, hasPermission 
    } = useAppContext();

    const [activeTab, setActiveTab] = useState('ROUTES'); 
    const [showVehicleModal, setShowVehicleModal] = useState(false);
    const [showDispatchModal, setShowDispatchModal] = useState(false);
    const [showReconcileModal, setShowReconcileModal] = useState(null); 

    const [vehicleForm, setVehicleForm] = useState({ name: '', plate: '' });

    const [dispatchForm, setDispatchForm] = useState({
        vehicleId: vehicles[0]?.id || '',
        driverId: '',
        initialOdometer: '',
        assignedOrders: [], 
        loadedStock: {}, 
        dispatchDate: new Date().toISOString().split('T')[0]
    });

    const [reconcileForm, setReconcileForm] = useState({
        finalOdometer: '',
        actualCash: '',
        returnedStock: {} 
    });

    const activeRoutes = routes.filter(r => r.status === 'ACTIVE');
    const pastRoutes = routes.filter(r => r.status === 'COMPLETED').sort((a,b) => new Date(b.reconciledAt) - new Date(a.reconciledAt)).slice(0, 10);

    const getExpectedLeftovers = (route) => {
        const routeSales = orders.filter(o => o.routeId === route.id);
        const soldMap = {};
        routeSales.forEach(order => {
            order.items.forEach(item => {
                soldMap[item.productId] = (soldMap[item.productId] || 0) + item.quantity;
            });
        });

        const expected = {};
        route.loadedStock.forEach(item => {
            const sold = soldMap[item.productId] || 0;
            expected[item.productId] = {
                name: products.find(p => p.id === item.productId)?.name || 'Unknown',
                loaded: item.quantity,
                sold: sold,
                leftover: Math.max(0, item.quantity - sold)
            };
        });
        return expected;
    };

    const getLastOdometer = (vId) => {
        if (!vId) return '';
        const vehicleRoutes = routes.filter(r => r.vehicleId === vId && r.status === 'COMPLETED');
        if (vehicleRoutes.length === 0) return '';
        const lastRoute = vehicleRoutes.sort((a,b) => new Date(b.reconciledAt) - new Date(a.reconciledAt))[0];
        return lastRoute.finalOdometer.toString();
    };

    const handleAddVehicle = (e) => {
        e.preventDefault();
        addVehicle(vehicleForm);
        setVehicleForm({ name: '', plate: '' });
        setShowVehicleModal(false);
    };

    const handleDispatch = (e) => {
        e.preventDefault();
        const stockArray = Object.keys(dispatchForm.loadedStock)
            .map(id => ({ productId: id, quantity: parseInt(dispatchForm.loadedStock[id]) || 0 }))
            .filter(item => item.quantity > 0);

        if (stockArray.length === 0) {
            alert("Mandatory: Load minimum 1 Asset Unit for Dispatch.");
            return;
        }

        dispatchRoute({
            vehicleId: dispatchForm.vehicleId,
            driverId: dispatchForm.driverId,
            location: dispatchForm.location,
            initialOdometer: parseInt(dispatchForm.initialOdometer),
            assignedOrders: dispatchForm.assignedOrders,
            loadedStock: stockArray
        });

        setShowDispatchModal(false);
        const defaultVid = vehicles[0]?.id || '';
        setDispatchForm({ 
            vehicleId: defaultVid, 
            driverId: '', 
            location: '',
            initialOdometer: getLastOdometer(defaultVid), 
            assignedOrders: [], 
            loadedStock: {}, 
            dispatchDate: new Date().toISOString().split('T')[0] 
        });
    };

    const openDispatch = () => {
        const defaultVid = vehicles[0]?.id || '';
        setDispatchForm({
            vehicleId: defaultVid,
            driverId: '',
            location: '',
            initialOdometer: getLastOdometer(defaultVid),
            assignedOrders: [],
            loadedStock: {},
            dispatchDate: new Date().toISOString().split('T')[0]
        });
        setShowDispatchModal(true);
    };

    const handleAssignOrder = (orderId, isChecked) => {
        setDispatchForm(prev => {
            const newAssigned = isChecked
                ? [...prev.assignedOrders, orderId]
                : prev.assignedOrders.filter(id => id !== orderId);

            const newLoadedStock = { ...prev.loadedStock };
            const order = orders.find(o => o.id === orderId);

            if (order) {
                order.items.forEach(item => {
                    const currentVal = parseInt(newLoadedStock[item.productId]) || 0;
                    if (isChecked) newLoadedStock[item.productId] = currentVal + item.quantity;
                    else newLoadedStock[item.productId] = Math.max(0, currentVal - item.quantity);
                });
            }

            return { ...prev, assignedOrders: newAssigned, loadedStock: newLoadedStock };
        });
    };

    const openReconcile = (route) => {
        const expected = getExpectedLeftovers(route);
        const initialReturned = {};
        Object.keys(expected).forEach(id => {
            initialReturned[id] = expected[id].leftover;
        });

        setReconcileForm({
            finalOdometer: '',
            actualCash: '',
            returnedStock: initialReturned
        });
        setShowReconcileModal(route);
    };

    const handleReconcile = (e) => {
        e.preventDefault();
        const returnedArray = Object.keys(reconcileForm.returnedStock)
            .map(id => ({ productId: id, quantity: parseInt(reconcileForm.returnedStock[id]) || 0 }));

        reconcileRoute(
            showReconcileModal.id,
            parseInt(reconcileForm.finalOdometer),
            returnedArray,
            parseFloat(reconcileForm.actualCash) || 0
        );

        setShowReconcileModal(null);
    };

    return (
        <>
            <div className="animate-fade-in flex flex-col gap-6 pb-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-black/5">
                <div>
                    <h1 className="text-6xl font-black tracking-tighter text-ink-primary uppercase leading-none mb-2">FLEET.</h1>
                    <p className="text-[10px] font-black text-ink-secondary tracking-widest uppercase opacity-40">VEHICLE OPTIMIZATION & DELIVERY MANAGEMENT</p>
                </div>
            </div>

            {/* Quick Stats & Controls - h-12 Sync */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-panel !p-1 bg-white border border-black/5 flex items-center justify-between rounded-pill shadow-sm !h-12 overflow-hidden">
                    <div className="flex items-center gap-3 pl-4">
                        <div className="w-8 h-8 rounded-xl bg-accent-signature text-ink-primary flex items-center justify-center shrink-0 shadow-lg">
                            <Navigation size={18} />
                        </div>
                        <div className="flex flex-col -space-y-1">
                            <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40">Active Pipeline</div>
                            <div className="text-2xl font-black text-ink-primary tracking-tighter leading-none">{activeRoutes.length} Vectors</div>
                        </div>
                    </div>
                </div>

                <div className="md:col-span-1 flex h-12 gap-1 bg-surface p-1 rounded-pill border border-black/5 shadow-premium">
                    {[
                        { id: 'ROUTES', label: 'Dispatches', icon: Navigation },
                        { id: 'TRACKER', label: 'Tracker', icon: Crosshair },
                        { id: 'FLEET', label: 'Fleet', icon: Truck }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 h-full rounded-pill text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                activeTab === tab.id 
                                ? 'bg-ink-primary text-surface shadow-lg' 
                                : 'bg-transparent text-ink-secondary hover:bg-canvas'
                            }`}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="md:col-span-1 flex !h-12">
                    {activeTab === 'ROUTES' ? (
                        <button className="btn-signature w-full !h-full !py-0 !rounded-pill !text-sm" onClick={openDispatch}>
                            INITIATE DISPATCH
                            <div className="icon-nest ml-4">
                                <Play size={20} />
                            </div>
                        </button>
                    ) : (
                        hasPermission('MANAGE_FLEET') && (
                            <button className="btn-signature w-full !h-full !py-0 !rounded-pill !text-sm" onClick={() => setShowVehicleModal(true)}>
                                REGISTER UNIT
                                <div className="icon-nest ml-4">
                                    <Plus size={20} />
                                </div>
                            </button>
                        )
                    )}
                </div>
            </div>

            {activeTab === 'ROUTES' && (
                <div className="space-y-8">
                    {/* Active Trips - Extreme Density */}
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-6 bg-accent-signature rounded-pill"></div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-60">Active Trips</h2>
                    </div>

                    <div className="glass-panel !p-0 overflow-hidden border border-black/5 bg-surface shadow-premium !rounded-bento">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-canvas border-b border-black/5">
                                    <tr>
                                        <th className="p-1.5 pl-8 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40">Vehicle</th>
                                        <th className="p-1.5 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40">Driver</th>
                                        <th className="p-1.5 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40 text-center">Route / Area</th>
                                        <th className="p-1.5 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40 text-center">Stock</th>
                                        <th className="p-1.5 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40 text-right">Odometer</th>
                                        <th className="p-1.5 text-right text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5">
                                    {activeRoutes.map(route => {
                                        const vehicle = vehicles.find(v => v.id === route.vehicleId);
                                        const itemsLoaded = route.loadedStock.reduce((s, i) => s + i.quantity, 0);
                                        return (
                                            <tr key={route.id} className="group hover:bg-canvas/50 transition-colors">
                                                <td className="p-1.5 pl-8">
                                                    <div className="flex items-center gap-3">
                                                         <div className="w-8 h-8 rounded-xl bg-ink-primary text-accent-signature flex items-center justify-center shrink-0">
                                                            <Truck size={14} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-black text-ink-primary uppercase tracking-tight leading-none mb-0.5">{vehicle?.name || 'GENERIC UNIT'}</span>
                                                            <span className="text-[10px] font-bold text-ink-secondary opacity-30 uppercase tracking-widest">{vehicle?.plate}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-1.5">
                                                    <span className="text-xs font-black text-ink-primary uppercase tracking-tighter">{getEmployeeName(route.driverId)}</span>
                                                </td>
                                                <td className="p-1.5 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest bg-canvas px-2 py-0.5 rounded-pill border border-black/5">
                                                            {route.location || 'GLOBAL'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-1.5 text-center">
                                                    <span className="px-2 py-0.5 rounded-pill bg-accent-signature/10 text-[10px] font-black text-ink-primary border border-accent-signature/20">
                                                        {itemsLoaded} UNITS
                                                    </span>
                                                </td>
                                                <td className="p-1.5 text-right">
                                                    <div className="text-sm font-black text-ink-primary font-mono tabular-nums">
                                                        {route.initialOdometer.toLocaleString()} <span className="text-[10px] opacity-20 ml-1 uppercase">KM</span>
                                                    </div>
                                                </td>
                                                <td className="p-1.5 text-right">
                                                    <button 
                                                        className="px-6 py-2 rounded-pill bg-ink-primary text-surface text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
                                                        onClick={() => openReconcile(route)}
                                                    >
                                                        END TRIP
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {activeRoutes.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="py-20 text-center text-[10px] font-black text-ink-secondary uppercase tracking-[0.4em] opacity-20">
                                                Zero active vehicles in field
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Trip History */}
                    <div className="pt-20">
                        <div className="flex items-center gap-5 mb-8">
                            <History size={20} className="text-ink-primary opacity-20" />
                            <h2 className="text-sm font-black uppercase tracking-[0.5em] text-ink-secondary opacity-60">Trip History</h2>
                        </div>
                        <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-canvas border-b border-black/5 text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em]">
                                        <th className="p-1.5 pl-8">Temporal Log</th>
                                        <th className="p-1.5">Vehicle & Driver</th>
                                        <th className="p-1.5 text-center">Location</th>
                                        <th className="p-1.5 text-right">Distance</th>
                                        <th className="p-1.5 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5 bg-surface">
                                    {pastRoutes.map(route => {
                                        const vehicle = vehicles.find(v => v.id === route.vehicleId);
                                        return (
                                            <tr key={route.id} className="hover:bg-canvas transition-colors">
                                                <td className="p-1.5 pl-8 text-[10px] font-black text-ink-secondary uppercase tracking-tight opacity-60">
                                                    {new Date(route.reconciledAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="p-1.5">
                                                    <div className="text-xs font-black text-ink-primary uppercase tracking-tight leading-none mb-1">{vehicle?.name}</div>
                                                    <div className="text-[9px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-40">{getEmployeeName(route.driverId)}</div>
                                                </td>
                                                <td className="p-1.5 text-center">
                                                    <span className="text-[10px] font-black text-ink-secondary uppercase tracking-widest">{route.location || 'GLOBAL'}</span>
                                                </td>
                                                <td className="p-1.5 text-right text-sm font-black text-ink-primary uppercase whitespace-nowrap tracking-tighter font-mono tabular-nums">
                                                    {route.finalOdometer - route.initialOdometer} <span className="text-[10px] opacity-30 ml-1">NET KM</span>
                                                </td>
                                                <td className="p-1.5 text-right">
                                                    <span className="px-3 py-1 rounded-pill bg-canvas text-ink-primary text-[9px] font-black uppercase tracking-widest border border-black/5 shadow-sm">
                                                        ARCHIVED
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'TRACKER' && (
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-6 bg-accent-signature rounded-pill"></div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-60">Live Vehicle Tracker</h2>
                        <div className="flex items-center gap-2 ml-auto">
                            <Radio size={14} className="text-accent-signature animate-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-accent-signature">{activeRoutes.length} Active</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" style={{height: '500px'}}>
                        {/* Map */}
                        <div className="lg:col-span-3 rounded-bento overflow-hidden border border-black/5 shadow-premium relative" style={{height: '500px'}}>
                            <MapContainer
                                center={DEFAULT_CENTER}
                                zoom={DEFAULT_ZOOM}
                                style={{ height: '100%', width: '100%', borderRadius: 'inherit' }}
                                scrollWheelZoom={true}
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                {activeRoutes.map(route => {
                                    const lat = route.lat || (DEFAULT_CENTER[0] + (Math.random() - 0.5) * 0.1);
                                    const lng = route.lng || (DEFAULT_CENTER[1] + (Math.random() - 0.5) * 0.1);
                                    const vehicle = vehicles.find(v => v.id === route.vehicleId);
                                    const itemsLoaded = route.loadedStock.reduce((s, i) => s + i.quantity, 0);

                                    return (
                                        <Marker key={route.id} position={[lat, lng]} icon={vehicleIcon}>
                                            <Popup>
                                                <div style={{fontFamily: 'Inter, sans-serif', minWidth: '180px'}}>
                                                    <div style={{fontWeight: 900, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '-0.02em', marginBottom: '4px'}}>
                                                        {vehicle?.name || 'UNIT'}
                                                    </div>
                                                    <div style={{fontSize: '10px', fontWeight: 700, color: '#747576', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px'}}>
                                                        {vehicle?.plate}
                                                    </div>
                                                    <div style={{display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px'}}>
                                                        <span>🚗 Driver: <strong>{getEmployeeName(route.driverId)}</strong></span>
                                                        <span>📍 Area: <strong>{route.location || 'Global'}</strong></span>
                                                        <span>📦 Stock: <strong>{itemsLoaded} units</strong></span>
                                                        <span>🔢 Odometer: <strong>{route.initialOdometer?.toLocaleString()} km</strong></span>
                                                    </div>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    );
                                })}
                            </MapContainer>

                            {activeRoutes.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center bg-surface/80 backdrop-blur-sm z-[1000]">
                                    <div className="text-center">
                                        <Crosshair size={48} className="text-ink-primary/10 mx-auto mb-4" />
                                        <div className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-40">No Active Vehicles</div>
                                        <div className="text-[9px] font-bold text-ink-secondary mt-1 opacity-30">Dispatch a vehicle to see it on the map</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sidebar */}
                        <div className="lg:col-span-1 flex flex-col gap-2 overflow-y-auto" style={{maxHeight: '500px'}}>
                            {activeRoutes.length > 0 ? (
                                activeRoutes.map(route => {
                                    const vehicle = vehicles.find(v => v.id === route.vehicleId);
                                    const itemsLoaded = route.loadedStock.reduce((s, i) => s + i.quantity, 0);
                                    return (
                                        <div key={route.id} className="glass-panel !p-4 !rounded-2xl border border-black/5 bg-surface hover:shadow-premium transition-all">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-10 h-10 rounded-xl bg-ink-primary text-accent-signature flex items-center justify-center shrink-0">
                                                    <Truck size={16} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-black text-ink-primary uppercase tracking-tight leading-none truncate">{vehicle?.name}</div>
                                                    <div className="text-[8px] font-bold text-ink-secondary uppercase tracking-widest opacity-40 mt-0.5">{vehicle?.plate}</div>
                                                </div>
                                                <div className="ml-auto">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/30"></div>
                                                </div>
                                            </div>
                                            <div className="space-y-2 text-[9px] font-black text-ink-secondary uppercase tracking-widest">
                                                <div className="flex justify-between">
                                                    <span className="opacity-40">Driver</span>
                                                    <span className="text-ink-primary">{getEmployeeName(route.driverId)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="opacity-40">Area</span>
                                                    <span className="text-ink-primary">{route.location || 'Global'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="opacity-40">Stock</span>
                                                    <span className="text-accent-signature">{itemsLoaded} units</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="glass-panel !p-8 !rounded-2xl border border-black/5 bg-surface text-center">
                                    <MapPin size={24} className="text-ink-primary/10 mx-auto mb-3" />
                                    <div className="text-[9px] font-black text-ink-secondary uppercase tracking-widest opacity-30">No vehicles dispatched</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'FLEET' && (
                <div className="space-y-12">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-5">
                            <div className="w-2 h-8 bg-accent-signature rounded-pill shadow-lg shadow-accent-signature/20"></div>
                            <h2 className="text-xs font-black uppercase tracking-[0.5em] text-ink-primary">Infrastructure Inventory</h2>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {vehicles.map(v => (
                            <div key={v.id} className="glass-panel !p-0 !rounded-2xl overflow-hidden border border-black/5 hover:shadow-premium transition-all flex flex-col group bg-surface">
                                <div className="aspect-[2/1] bg-ink-primary relative overflow-hidden">
                                    {v.image ? (
                                        <img src={v.image} className="w-full h-full object-cover opacity-80 transition-transform group-hover:scale-110 duration-700" alt={v.name} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-accent-signature opacity-20">
                                            <Truck size={32} strokeWidth={1} />
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 px-2 py-0.5 bg-surface/10 backdrop-blur-md rounded-pill border border-surface/20 text-surface text-[7px] font-black uppercase tracking-widest">
                                        ACTIVE UNIT
                                    </div>
                                </div>
                                <div className="p-4">
                                    <h3 className="text-sm font-black text-ink-primary uppercase tracking-tighter mb-3 leading-none">{v.name}</h3>
                                    <div className="flex justify-between items-end mt-auto border-t border-black/5 pt-3">
                                        <div>
                                            <div className="text-[8px] font-black uppercase tracking-[0.1em] text-ink-secondary opacity-50 mb-1">Clearance Plate</div>
                                            <div className="text-xs font-black text-ink-primary uppercase tracking-widest leading-none">{v.plate}</div>
                                        </div>
                                        <div className="w-8 h-8 rounded-lg bg-canvas flex items-center justify-center text-ink-primary border border-black/5 shadow-sm">
                                            <ShieldCheck size={14} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            </div>

            {/* REGISTER VEHICLE MODAL */}
            {showVehicleModal && (
                <div className="modal-overlay">
                    <div className="glass-modal">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h1 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">FLEET.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-40">REGISTER NEW LOGISTICS UNIT</p>
                            </div>
                            <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary" onClick={() => setShowVehicleModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleAddVehicle} className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Vehicle Name</label>
                                <input 
                                    required 
                                    type="text" 
                                    className="w-full bg-canvas border border-black/5 rounded-2xl p-4 font-black text-lg text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                    placeholder="TRANSIT-V4-NORTH..."
                                    value={vehicleForm.name} 
                                    onChange={e => setVehicleForm({ ...vehicleForm, name: e.target.value })} 
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Identifier (License Plate)</label>
                                <input 
                                    required 
                                    type="text" 
                                    className="w-full bg-canvas border border-black/5 rounded-2xl p-4 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase tracking-widest" 
                                    placeholder="XYZ-0000"
                                    value={vehicleForm.plate} 
                                    onChange={e => setVehicleForm({ ...vehicleForm, plate: e.target.value })} 
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <button type="button" className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => setShowVehicleModal(false)}>Cancel</button>
                                <button type="submit" className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill">
                                    SAVE VEHICLE
                                    <div className="icon-nest !w-10 !h-10 ml-4">
                                        <Plus size={22} />
                                    </div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DISPATCH MODAL */}
            {showDispatchModal && (
                <div className="modal-overlay">
                    <div className="glass-modal">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h1 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">DISPATCH.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-40">ASSIGN VEHICLE AND DRIVER UNIT</p>
                            </div>
                            <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary" onClick={() => setShowDispatchModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleDispatch} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black text-ink-secondary uppercase opacity-50 block mb-2 px-1 tracking-widest">Selected Unit</label>
                                        <select 
                                            className="w-full bg-canvas border border-black/5 rounded-2xl p-4 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase appearance-none cursor-pointer" 
                                            value={dispatchForm.vehicleId} 
                                            onChange={e => {
                                                const vId = e.target.value;
                                                setDispatchForm({ 
                                                    ...dispatchForm, 
                                                    vehicleId: vId,
                                                    initialOdometer: getLastOdometer(vId)
                                                });
                                            }}
                                        >
                                            {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-ink-secondary uppercase opacity-50 block mb-2 px-1 tracking-widest">Driver Unit</label>
                                        <select required className="w-full bg-canvas border border-black/5 rounded-2xl p-4 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase appearance-none cursor-pointer" value={dispatchForm.driverId} onChange={e => setDispatchForm({ ...dispatchForm, driverId: e.target.value })}>
                                            <option value="">SELECT DRIVER...</option>
                                            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-ink-secondary uppercase opacity-50 block mb-2 px-1 tracking-widest">Route / Area Vector</label>
                                        <input 
                                            required 
                                            type="text" 
                                            className="w-full bg-canvas border border-black/5 rounded-2xl p-4 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                            placeholder="TARGET AREA..."
                                            value={dispatchForm.location} 
                                            onChange={e => setDispatchForm({ ...dispatchForm, location: e.target.value })} 
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-2 px-1">Starting Odometer Index</label>
                                    <input required type="number" className="w-full bg-canvas border border-black/5 rounded-2xl p-4 font-black text-xl text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all font-mono" placeholder="000000" value={dispatchForm.initialOdometer} onChange={e => setDispatchForm({ ...dispatchForm, initialOdometer: e.target.value })} />
                                </div>
                            </div>

                            <div className="flex flex-col">
                                <div className="flex-1 p-8 bg-ink-primary rounded-[2.5rem] flex flex-col mb-8 shadow-premium">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-surface/40 mb-4 flex items-center gap-2">
                                        <ShoppingCart size={12} className="text-accent-signature" /> ASSET LOADING MATRIX
                                    </label>
                                    <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2 custom-scrollbar pr-2">
                                        {products.filter(p => p.stock >= 0).map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all">
                                                <div className="min-w-0 pr-4">
                                                    <div className="text-[11px] font-black text-surface uppercase truncate tracking-tight">{p.name}</div>
                                                    <div className="text-[9px] font-black text-surface/20 uppercase tracking-[0.2em] mt-0.5">{p.stock} AVAILABLE</div>
                                                </div>
                                                <input 
                                                    type="number" 
                                                    className="w-20 bg-white/10 border-none rounded-xl p-3 text-center text-sm font-black text-accent-signature outline-none focus:bg-white/20 transition-all"
                                                    placeholder="0"
                                                    value={dispatchForm.loadedStock[p.id] || ''}
                                                    onChange={(e) => setDispatchForm({
                                                        ...dispatchForm,
                                                        loadedStock: { ...dispatchForm.loadedStock, [p.id]: e.target.value }
                                                    })}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button type="button" className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => setShowDispatchModal(false)}>Cancel</button>
                                    <button type="submit" className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill">
                                        START DISPATCH
                                        <div className="icon-nest !w-10 !h-10 ml-4">
                                            <CheckCircle2 size={24} />
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* RECONCILE MODAL */}
            {showReconcileModal && (
                <div className="modal-overlay">
                    <div className="glass-modal">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h1 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">RECONCILE.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-40">TRIP SETTLEMENT & RECOVERY REVIEW</p>
                            </div>
                            <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary" onClick={() => setShowReconcileModal(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleReconcile} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-6 bg-canvas border border-black/5 rounded-3xl">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 mb-3">Ending Odometer Index</label>
                                    <input required type="number" className="bg-transparent border-none w-full p-0 text-3xl font-black text-ink-primary outline-none font-mono" placeholder="000000" value={reconcileForm.finalOdometer} onChange={e => setReconcileForm({ ...reconcileForm, finalOdometer: e.target.value })} />
                                </div>
                                <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-emerald-600/50 mb-3">Cash Liquidity Recovered</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-black text-emerald-500 opacity-30">{businessProfile.currencySymbol}</span>
                                        <input required type="number" step="0.01" className="bg-transparent border-none w-full p-0 text-3xl font-black text-emerald-600 outline-none" placeholder="0.00" value={reconcileForm.actualCash} onChange={e => setReconcileForm({ ...reconcileForm, actualCash: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-50 px-1">ASSET RECOVERY VERIFICATION</label>
                                <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                                    {Object.keys(getExpectedLeftovers(showReconcileModal)).map(productId => {
                                        const data = getExpectedLeftovers(showReconcileModal)[productId];
                                        const actual = parseInt(reconcileForm.returnedStock[productId]) || 0;
                                        const hasDiscrepancy = actual !== data.leftover;
                                        return (
                                            <div key={productId} className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${hasDiscrepancy ? 'bg-red-50 border-red-200' : 'bg-canvas border-transparent'}`}>
                                                <div className="min-w-0 pr-4">
                                                    <div className="text-[11px] font-black text-ink-primary uppercase truncate tracking-tight">{data.name}</div>
                                                    <div className="text-[9px] font-black text-ink-secondary/40 uppercase tracking-widest mt-1">Expected Recovery: {data.leftover} Units</div>
                                                </div>
                                                <div className="flex items-center gap-6">
                                                    {hasDiscrepancy && <AlertTriangle size={18} className="text-red-500 animate-pulse" />}
                                                    <input 
                                                        type="number" 
                                                        className="w-20 bg-white border border-black/5 rounded-xl p-3 text-center text-sm font-black text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all"
                                                        value={reconcileForm.returnedStock[productId] || ''}
                                                        onChange={(e) => setReconcileForm({ ...reconcileForm, returnedStock: { ...reconcileForm.returnedStock, [productId]: e.target.value } })}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <button type="button" className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => setShowReconcileModal(null)}>Cancel</button>
                                <button type="submit" className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill">
                                    EXECUTE RECONCILIATION
                                    <div className="icon-nest !w-10 !h-10 ml-4">
                                        <ShieldCheck size={24} />
                                    </div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.1); }
            ` }} />
        </>
    );
};

export default Vehicles;
