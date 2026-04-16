import React, { useState, useMemo, useEffect} from 'react';
import { useAppContext} from '../context/AppContext';
import { 
 Truck, Map, Settings as SettingsIcon, Plus, Play, Flag, 
 FileText, AlertTriangle, X, ShoppingCart, ChevronRight,
 MapPin, Navigation, Gauge, Calendar, ShieldCheck, 
 Save, Hash, History, CheckCircle2, Crosshair, Radio, Edit3, Trash2
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom vehicle marker icon
const vehicleIcon = new L.DivIcon({
 className: 'custom-vehicle-marker',
 html: `<div style="background:#c8ff00;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:3px solid #1a1a1a;box-shadow:0 8px 32px rgba(0,0,0,0.4);overflow:hidden;">
 <img src="/assets/van.png" style="width:100%;height:100%;object-fit:cover;" />
 </div>`,
 iconSize: [40, 40],
 iconAnchor: [20, 20],
 popupAnchor: [0, -20],
});

// Default map center (Dubai)
const DEFAULT_CENTER = [25.2048, 55.2708];
const DEFAULT_ZOOM = 11;

const Vehicles = () => {
 const { 
 vehicles, addVehicle, updateVehicle, deleteVehicle, routes, dispatchRoute, reconcileRoute, 
 products, sales, orders, businessProfile, employees, getEmployeeName, hasPermission,
 inventoryLocations, inventoryBalances, MAIN_WAREHOUSE_ID
} = useAppContext();

 const [activeTab, setActiveTab] = useState('ROUTES'); 
 const [showVehicleModal, setShowVehicleModal] = useState(false);
 const [showDispatchModal, setShowDispatchModal] = useState(false);
 const [showReconcileModal, setShowReconcileModal] = useState(null); 

 const [vehicleForm, setVehicleForm] = useState({ name: '', plate: ''});
 const [editingVehicle, setEditingVehicle] = useState(null);

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
 const [simulatedPositions, setSimulatedPositions] = useState({});

 const activeRoutes = routes.filter(r => r.status === 'ACTIVE');
 const pastRoutes = routes.filter(r => r.status === 'COMPLETED').sort((a,b) => new Date(b.reconciledAt) - new Date(a.reconciledAt)).slice(0, 10);

 // Live Movement Simulation
 useEffect(() => {
 if (activeTab !== 'TRACKER' || activeRoutes.length === 0) return;

 // Initialize positions if missing
 const initial = { ...simulatedPositions};
 let changed = false;
 activeRoutes.forEach(route => {
 if (!initial[route.id]) {
 initial[route.id] = {
 lat: route.lat || (DEFAULT_CENTER[0] + (Math.random() - 0.5) * 0.05),
 lng: route.lng || (DEFAULT_CENTER[1] + (Math.random() - 0.5) * 0.05),
 status: 'Moving',
 lastPing: new Date().toISOString()
};
 changed = true;
}
});
 if (changed) setSimulatedPositions(initial);

 const interval = setInterval(() => {
 setSimulatedPositions(prev => {
 const next = { ...prev};
 activeRoutes.forEach(route => {
 if (next[route.id]) {
 // Small jitter ±0.0002
 next[route.id] = {
 ...next[route.id],
 lat: next[route.id].lat + (Math.random() - 0.5) * 0.0004,
 lng: next[route.id].lng + (Math.random() - 0.5) * 0.0004,
 status: Math.random() > 0.8 ? 'Delivering' : 'Moving',
 lastPing: new Date().toISOString()
};
}
});
 return next;
});
}, 5000);

 return () => clearInterval(interval);
}, [activeTab, activeRoutes.length]);

 const getExpectedLeftovers = (route) => {
 const routeSales = (sales || []).filter(o => o.routeId === route.id);
 const soldMap = {};
 routeSales.forEach(order => {
 (order.items || []).forEach(item => {
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
 return (lastRoute.finalOdometer || 0).toString();
};

 const handleVehicleSubmit = (e) => {
 e.preventDefault();
 if (editingVehicle) {
 updateVehicle({ ...editingVehicle, ...vehicleForm});
} else {
 addVehicle(vehicleForm);
}
 setVehicleForm({ name: '', plate: ''});
 setEditingVehicle(null);
 setShowVehicleModal(false);
};

 const openEditVehicle = (v) => {
 setEditingVehicle(v);
 setVehicleForm({ name: v.name, plate: v.plate});
 setShowVehicleModal(true);
};

 const handleDeleteVehicle = (id) => {
 if (window.confirm("Permanent Clearance Revocation: Delete this track unit?")) {
 deleteVehicle(id);
}
};

 const handleDispatch = (e) => {
 e.preventDefault();
 const stockArray = Object.keys(dispatchForm.loadedStock)
 .map(id => ({ productId: id, quantity: parseInt(dispatchForm.loadedStock[id]) || 0}))
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

 const newLoadedStock = { ...prev.loadedStock};
 const order = orders.find(o => o.id === orderId);

 if (order) {
 order.items.forEach(item => {
 const currentVal = parseInt(newLoadedStock[item.productId]) || 0;
 if (isChecked) newLoadedStock[item.productId] = currentVal + item.quantity;
 else newLoadedStock[item.productId] = Math.max(0, currentVal - item.quantity);
});
}

 return { ...prev, assignedOrders: newAssigned, loadedStock: newLoadedStock};
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
 .map(id => ({ productId: id, quantity: parseInt(reconcileForm.returnedStock[id]) || 0}));

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
 <div className="animate-fade-in flex flex-col gap-4 pb-12">
 {/* Header Section */}
 <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b border-black/5">
 <div>
 <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">FLEET<span className="text-accent-signature">.</span></h1>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">VEHICLE OPTIMIZATION & DELIVERY MANAGEMENT</p>
 </div>
 </div>
  {/* Premium KPI Ribbons */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
  <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
  <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-accent-signature">
  <Navigation size={40} strokeWidth={2} />
  </div>
  <div className="relative z-10 flex flex-col">
  <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Active Pipeline</span>
  <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
  {activeRoutes.length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">VECTORS</span>
  </div>
  </div>
  </div>

  <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
  <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-ink-primary">
  <Truck size={40} strokeWidth={2} />
  </div>
  <div className="relative z-10 flex flex-col">
  <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Master Fleet Roster</span>
  <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
  {vehicles.length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">UNITS</span>
  </div>
  </div>
  </div>
  
  <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
  <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-gray-500">
  <History size={40} strokeWidth={2} />
  </div>
  <div className="relative z-10 flex flex-col">
  <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Archived Missions</span>
  <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
  {pastRoutes.length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">TRIPS</span>
  </div>
  </div>
  </div>
  </div>

  {/* Interactive Utility Row */}
  <div className="flex flex-wrap lg:flex-nowrap items-center justify-between bg-white backdrop-blur-xl border border-black/5 rounded-[2rem] shadow-sm p-2 min-h-[72px] w-full gap-2 mb-8">
  <div className="flex-1 flex gap-1 bg-canvas p-1.5 rounded-pill border border-black/5 shadow-inner h-[56px] min-w-[300px]">
  {[ { id: 'ROUTES', label: 'Dispatches', icon: Navigation}, { id: 'TRACKER', label: 'Tracker', icon: Crosshair}, { id: 'FLEET', label: 'Fleet', icon: Truck} ].map(tab => (
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
  {activeTab === 'ROUTES' ? (
  <button className="btn-signature w-full lg:w-auto px-8 !h-full !py-0 !rounded-pill !text-xs !font-bold flex items-center justify-center justify-between" onClick={openDispatch}>
  INITIATE DISPATCH
  <div className="icon-nest ml-4 !w-8 !h-8 shrink-0">
  <Play size={16} />
  </div>
  </button>
  ) : (
  hasPermission('MANAGE_FLEET') && (
  <button className="btn-signature w-full lg:w-auto px-8 !h-full !py-0 !rounded-pill !text-xs !font-bold flex items-center justify-center justify-between" onClick={() => setShowVehicleModal(true)}>
  REGISTER UNIT
  <div className="icon-nest ml-4 !w-8 !h-8 shrink-0">
  <Plus size={16} />
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
 <h2 className="text-[10px] font-semibold text-gray-700 opacity-60">Active Trips</h2>
 </div>

 <div className="glass-panel !p-0 overflow-hidden border border-black/5 bg-surface shadow-premium !rounded-bento">
 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse">
 <thead className="bg-canvas border-b border-black/5">
 <tr>
 <th className="p-1.5 pl-8 text-[10px] font-semibold text-gray-700 opacity-70">Vehicle</th>
 <th className="p-1.5 text-[10px] font-semibold text-gray-700 opacity-70">Driver</th>
 <th className="p-1.5 text-[10px] font-semibold text-gray-700 opacity-70 text-center">Route / Area</th>
 <th className="p-1.5 text-[10px] font-semibold text-gray-700 opacity-70 text-center">Stock</th>
 <th className="p-1.5 text-[10px] font-semibold text-gray-700 opacity-70 text-right">Odometer</th>
 <th className="p-1.5 text-right text-[10px] font-semibold text-gray-700 opacity-70">Status</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/5">
 {activeRoutes.map(route => {
  const vehicle = vehicles.find(v => v.id === route.vehicleId);
  const itemsInTransit = inventoryBalances
    .filter(b => {
      const loc = inventoryLocations.find(l => l.reference_id === route.vehicleId);
      return loc && b.location_id === loc.id;
    })
    .reduce((s, i) => s + (i.quantity || 0), 0);
  return (
 <tr key={route.id} className="group hover:bg-canvas/50 transition-colors">
 <td className="p-1.5 pl-8">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-xl bg-ink-primary text-accent-signature flex items-center justify-center shrink-0">
 <Truck size={14} />
 </div>
 <div className="flex flex-col">
 <span className="text-sm font-semibold text-ink-primary leading-none mb-0.5">{vehicle?.name || 'GENERIC UNIT'}</span>
 <span className="text-[10px] font-bold text-gray-700 opacity-60">{vehicle?.plate}</span>
 </div>
 </div>
 </td>
 <td className="p-1.5">
 <span className="text-xs font-semibold text-ink-primary">{getEmployeeName(route.driverId)}</span>
 </td>
 <td className="p-1.5 text-center">
 <div className="flex flex-col items-center">
 <span className="text-[10px] font-semibold text-ink-primary bg-canvas px-2 py-0.5 rounded-pill border border-black/5">
 {route.location || 'GLOBAL'}
 </span>
 </div>
 </td>
  <td className="p-1.5 text-center">
  <span className="px-2 py-0.5 rounded-pill bg-accent-signature/10 text-[10px] font-semibold text-ink-primary border border-accent-signature/20">
  {itemsInTransit} UNITS
  </span>
  </td>
 <td className="p-1.5 text-right">
 <div className="text-sm font-semibold text-ink-primary font-mono tabular-nums">
 {(route.initialOdometer || 0).toLocaleString()} <span className="text-[10px] opacity-20 ml-1">KM</span>
 </div>
 </td>
 <td className="p-1.5 text-right">
 <button 
 className="px-6 py-2 rounded-pill bg-ink-primary text-surface text-[10px] font-semibold hover:scale-105 transition-transform"
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
 <td colSpan="6" className="py-20 text-center text-[10px] font-semibold text-gray-700 opacity-20">
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
 <h2 className="text-sm font-semibold text-gray-700 opacity-60">Trip History</h2>
 </div>
 <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
 <table className="w-full text-left">
 <thead>
 <tr className="bg-canvas border-b border-black/5 text-[10px] font-semibold text-gray-700">
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
 <td className="p-1.5 pl-8 text-[10px] font-semibold text-gray-700 opacity-60">
 {new Date(route.reconciledAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}
 </td>
 <td className="p-1.5">
 <div className="text-xs font-semibold text-ink-primary leading-none mb-1">{vehicle?.name}</div>
 <div className="text-[9px] font-semibold text-gray-700 opacity-70">{getEmployeeName(route.driverId)}</div>
 </td>
 <td className="p-1.5 text-center">
 <span className="text-[10px] font-semibold text-gray-700">{route.location || 'GLOBAL'}</span>
 </td>
 <td className="p-1.5 text-right text-sm font-semibold text-ink-primary whitespace-nowrap font-mono tabular-nums">
 {((route.finalOdometer || 0) - (route.initialOdometer || 0)).toLocaleString()} <span className="text-[10px] opacity-60 ml-1">NET KM</span>
 </td>
 <td className="p-1.5 text-right">
 <span className="px-3 py-1 rounded-pill bg-canvas text-ink-primary text-[9px] font-semibold border border-black/5 shadow-sm">
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
 <h2 className="text-[10px] font-semibold text-gray-700 opacity-60">Live Vehicle Tracker</h2>
 <div className="flex items-center gap-2 ml-auto">
 <Radio size={14} className="text-accent-signature animate-pulse" />
 <span className="text-[9px] font-semibold text-accent-signature">{activeRoutes.length} Active</span>
 </div>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" style={{minHeight: '300px'}}>
 {/* Map */}
 <div className="lg:col-span-3 rounded-bento overflow-hidden border border-black/5 shadow-premium relative" style={{height: '350px', minHeight: '250px'}}>
 <MapContainer
 center={DEFAULT_CENTER}
 zoom={DEFAULT_ZOOM}
 style={{ height: '100%', width: '100%', borderRadius: 'inherit'}}
 scrollWheelZoom={true}
 >
 <TileLayer
 attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
 url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
 />
 {activeRoutes.map(route => {
 const sim = simulatedPositions[route.id] || {
 lat: route.lat || (DEFAULT_CENTER[0] + (Math.random() - 0.5) * 0.1),
 lng: route.lng || (DEFAULT_CENTER[1] + (Math.random() - 0.5) * 0.1),
 status: 'Moving',
 lastPing: new Date().toISOString()
};
 const vehicle = vehicles.find(v => v.id === route.vehicleId);
 const itemsInTransit = inventoryBalances
    .filter(b => {
      const loc = inventoryLocations.find(l => l.reference_id === route.vehicleId);
      return loc && b.location_id === loc.id;
    })
    .reduce((s, i) => s + (i.quantity || 0), 0);

 return (
 <Marker key={route.id} position={[sim.lat, sim.lng]} icon={vehicleIcon}>
 <Popup>
 <div style={{fontFamily: 'Inter, sans-serif', minWidth: '180px'}}>
 <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
 <div style={{fontWeight: 900, fontSize: '14px', textTransform: '', letterSpacing: '-0.02em'}}>
 {vehicle?.name || 'UNIT'}
 </div>
 <div style={{fontSize: '8px', fontWeight: 900, padding: '2px 6px', background: sim.status === 'Moving' ? '#c8ff00' : '#3b82f6', color: '#1a1a1a', borderRadius: '10px'}}>
 {sim.status}
 </div>
 </div>
 <div style={{fontSize: '10px', fontWeight: 700, color: '#747576', textTransform: '', letterSpacing: '0.1em', marginBottom: '8px'}}>
 {vehicle?.plate}
 </div>
 <div style={{display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '8px'}}>
 <span>🚗 Driver: <strong>{getEmployeeName(route.driverId)}</strong></span>
 <span>📍 Area: <strong>{route.location || 'Global'}</strong></span>
 <span>📦 Live Stock: <strong>{itemsInTransit} units</strong></span>
 <span style={{fontSize: '9px', marginTop: '4px', opacity: 0.5}}>Last Ping: {new Date(sim.lastPing).toLocaleTimeString()}</span>
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
 <div className="text-sm font-semibold text-gray-700 opacity-70">No Active Vehicles</div>
 <div className="text-[9px] font-bold text-gray-700 mt-1 opacity-60">Dispatch a vehicle to see it on the map</div>
 </div>
 </div>
 )}
 </div>

 {/* Sidebar */}
 <div className="lg:col-span-1 flex flex-col gap-2 overflow-y-auto" style={{maxHeight: '500px'}}>
 {activeRoutes.length > 0 ? (
 activeRoutes.map(route => {
 const vehicle = vehicles.find(v => v.id === route.vehicleId);
 const itemsInTransit = inventoryBalances
    .filter(b => {
      const loc = inventoryLocations.find(l => l.reference_id === route.vehicleId);
      return loc && b.location_id === loc.id;
    })
    .reduce((s, i) => s + (i.quantity || 0), 0);
 const sim = simulatedPositions[route.id] || { status: 'Moving'};
 return (
 <div key={route.id} className="glass-panel !p-4 !rounded-lg border border-black/5 bg-surface hover:shadow-premium transition-all">
 <div className="flex items-center gap-3 mb-3">
 <div className="w-10 h-10 rounded-xl bg-ink-primary text-accent-signature flex items-center justify-center shrink-0">
 <Truck size={16} />
 </div>
 <div className="min-w-0">
 <div className="text-xs font-semibold text-ink-primary leading-none truncate">{vehicle?.name}</div>
 <div className="text-[8px] font-bold text-gray-700 opacity-70 mt-0.5">{vehicle?.plate}</div>
 </div>
 <div className="ml-auto flex items-center gap-2">
 <span className="text-[8px] font-semibold text-gray-700 opacity-[0.85]">{sim.status}</span>
 <div className={`w-2.5 h-2.5 rounded-full ${sim.status === 'Moving' ? 'bg-green-400 shadow-green-400/30' : 'bg-blue-400 shadow-blue-400/30'} animate-pulse shadow-lg`}></div>
 </div>
 </div>
 <div className="space-y-2 text-[9px] font-semibold text-gray-700">
 <div className="flex justify-between">
 <span className="opacity-70">Driver</span>
 <span className="text-ink-primary">{getEmployeeName(route.driverId)}</span>
 </div>
 <div className="flex justify-between">
 <span className="opacity-70">Area</span>
 <span className="text-ink-primary">{route.location || 'Global'}</span>
 </div>
 <div className="flex justify-between">
 <span className="opacity-70">Live Stock</span>
 <span className="text-accent-signature">{itemsInTransit} units</span>
 </div>
 </div>
 </div>
 );
})
 ) : (
 <div className="glass-panel !p-5 !rounded-lg border border-black/5 bg-surface text-center">
 <MapPin size={24} className="text-ink-primary/10 mx-auto mb-3" />
 <div className="text-[9px] font-semibold text-gray-700 opacity-60">No vehicles dispatched</div>
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
 <h2 className="text-base font-bold font-semibold text-ink-primary">Infrastructure Inventory</h2>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
 {vehicles.map(v => (
 <div key={v.id} className="glass-panel !p-0 !rounded-lg overflow-hidden border border-black/5 hover:shadow-premium transition-all flex flex-col group bg-surface">
 <div className="aspect-[2/1] bg-ink-primary relative overflow-hidden">
 {v.image || '/assets/van.png' ? (
 <img src={v.image || '/assets/van.png'} className="w-full h-full object-cover opacity-90 transition-transform group-hover:scale-110 duration-700" alt={v.name} />
 ) : (
 <div className="w-full h-full flex items-center justify-center text-accent-signature opacity-20">
 <Truck size={32} strokeWidth={1} />
 </div>
 )}
 <div className="absolute top-2 right-2 flex gap-1">
 <div className="px-2 py-0.5 bg-surface/10 backdrop-blur-md rounded-pill border border-surface/20 text-surface text-[7px] font-semibold">
 ACTIVE UNIT
 </div>
 <button 
 onClick={(e) => { e.stopPropagation(); openEditVehicle(v);}}
 className="w-5 h-5 rounded-pill bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all opacity-0 group-hover:opacity-100"
 >
 <Edit3 size={10} />
 </button>
 <button 
 onClick={(e) => { e.stopPropagation(); handleDeleteVehicle(v.id);}}
 className="w-5 h-5 rounded-pill bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100"
 >
 <Trash2 size={10} />
 </button>
 </div>
 </div>
  <div className="p-4">
  <div className="flex justify-between items-start mb-2">
  <h3 className="text-sm font-semibold text-ink-primary leading-none uppercase tracking-tight">{v.name}</h3>
  <div className="text-[9px] font-black text-gray-400 opacity-50 tabular-nums">{v.plate}</div>
  </div>
  
  <div className="mt-4 p-3 bg-canvas/50 rounded-xl border border-black/5">
    <div className="flex justify-between items-center mb-1">
      <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">ON-BOARD ASSETS</span>
      <span className="text-[10px] font-black text-ink-primary">
        {(() => {
          const loc = inventoryLocations.find(l => l.reference_id === v.id);
          return loc ? inventoryBalances.filter(b => b.location_id === loc.id).reduce((s, i) => s + (i.quantity || 0), 0) : 0;
        })()}
      </span>
    </div>
    <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
    <div 
    className="h-full bg-accent-signature shadow-[0_0_8px_rgba(200,255,0,0.4)]" 
    style={{ 
      width: `${Math.min(100, (
        (() => {
          const loc = inventoryLocations.find(l => l.reference_id === v.id);
          const totalAssets = loc ? inventoryBalances.filter(b => b.location_id === loc.id).reduce((s, i) => s + (i.quantity || 0), 0) : 0;
          return totalAssets / 100 * 100; // Simplified
        })() || 0))}%` 
    }} 
  />
    </div>
  </div>

  <div className="flex justify-between items-center mt-4 pt-3 border-t border-black/5">
  <div className="text-[9px] font-bold text-gray-700 opacity-70">UNIT CLEARANCE</div>
  <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-ink-primary border border-black/5">
  <ShieldCheck size={12} />
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
 <div className="flex justify-between items-start mb-5">
 <div>
 <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">{editingVehicle ? 'EDIT UNIT' : 'NEW UNIT'}<span className="text-accent-signature">.</span></h1>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">
 {editingVehicle ? 'MODIFY TRACKING PARAMETERS' : 'REGISTER NEW LOGISTICS UNIT'}
 </p>
 </div>
 <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary" onClick={() => setShowVehicleModal(false)}>
 <X size={18} />
 </button>
 </div>

 <form onSubmit={handleVehicleSubmit} className="space-y-4">
 <div>
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Vehicle Name</label>
 <input 
 required 
 type="text" 
 className="w-full bg-canvas border border-black/5 rounded-lg p-4 font-medium text-sm text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all" 
 placeholder="TRANSIT-V4-NORTH..."
 value={vehicleForm.name} 
 onChange={e => setVehicleForm({ ...vehicleForm, name: e.target.value})} 
 />
 </div>
 <div>
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Identifier (License Plate)</label>
 <input 
 required 
 type="text" 
 className="w-full bg-canvas border border-black/5 rounded-lg p-4 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all" 
 placeholder="XYZ-0000"
 value={vehicleForm.plate} 
 onChange={e => setVehicleForm({ ...vehicleForm, plate: e.target.value})} 
 />
 </div>
 <div className="grid grid-cols-2 gap-4 pt-4">
 <button type="button" className="px-8 py-2 rounded-pill border border-black/10 font-semibold text-ink-primary text-xs hover:bg-black/5 transition-all cursor-pointer" onClick={() => setShowVehicleModal(false)}>Cancel</button>
 <button type="submit" className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill">
 {editingVehicle ? 'SAVE CHANGES' : 'SAVE VEHICLE'}
 <div className="icon-nest !w-10 !h-10 ml-4">
 {editingVehicle ? <Save size={22} /> : <Plus size={22} />}
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
 <div className="glass-modal !max-w-4xl !p-5">
 <div className="flex justify-between items-start mb-5">
 <div>
 <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">DISPATCH<span className="text-accent-signature">.</span></h1>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">ASSIGN VEHICLE AND DRIVER UNIT</p>
 </div>
 <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary" onClick={() => setShowDispatchModal(false)}>
 <X size={18} />
 </button>
 </div>

 <form onSubmit={handleDispatch} className="grid grid-cols-1 lg:grid-cols-2 gap-10">
 <div className="space-y-6">
 <div className="space-y-4">
 <div>
 <label className="text-[10px] font-semibold text-gray-700 opacity-70 block mb-2 px-1">Selected Unit</label>
 <select 
 className="w-full bg-canvas border border-black/5 rounded-lg p-4 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all appearance-none cursor-pointer" 
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
 <label className="text-[10px] font-semibold text-gray-700 opacity-70 block mb-2 px-1">Driver Unit</label>
 <select required className="w-full bg-canvas border border-black/5 rounded-lg p-4 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all appearance-none cursor-pointer" value={dispatchForm.driverId} onChange={e => setDispatchForm({ ...dispatchForm, driverId: e.target.value})}>
 <option value="">SELECT DRIVER...</option>
 {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
 </select>
 </div>
 <div>
 <label className="text-[10px] font-semibold text-gray-700 opacity-70 block mb-2 px-1">Route / Area Vector</label>
 <input 
 required 
 type="text" 
 className="w-full bg-canvas border border-black/5 rounded-lg p-4 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all" 
 placeholder="TARGET AREA..."
 value={dispatchForm.location} 
 onChange={e => setDispatchForm({ ...dispatchForm, location: e.target.value})} 
 />
 </div>
 </div>

 <div className="space-y-2">
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5 px-1">Starting Odometer Index</label>
 <input required type="number" className="w-full bg-canvas border border-black/5 rounded-lg p-4 font-semibold text-xl text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all font-mono" placeholder="000000" value={dispatchForm.initialOdometer} onChange={e => setDispatchForm({ ...dispatchForm, initialOdometer: e.target.value})} />
 </div>
 </div>

 <div className="flex flex-col">
 <div className="flex-1 p-5 bg-ink-primary rounded-[2.5rem] flex flex-col mb-4 shadow-premium">
 <label className="block text-[10px] font-semibold text-surface/40 mb-1.5 flex items-center gap-2">
 <ShoppingCart size={12} className="text-accent-signature" /> ASSET LOADING MATRIX
 </label>
 <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2 custom-scrollbar pr-2">
 {products.filter(p => p.stock >= 0).map(p => (
 <div key={p.id} className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5 group hover:bg-white/10 transition-all">
 <div className="min-w-0 pr-4">
 <div className="text-[11px] font-semibold text-surface truncate">{p.name}</div>
 <div className="text-[9px] font-semibold text-surface/20 mt-0.5">{p.stock} AVAILABLE</div>
 </div>
 <input 
 type="number" 
 className="w-20 bg-white/10 border-none rounded-xl p-3 text-center text-sm font-semibold text-accent-signature outline-none focus:bg-white/20 transition-all"
 placeholder="0"
 value={dispatchForm.loadedStock[p.id] || ''}
 onChange={(e) => setDispatchForm({
 ...dispatchForm,
 loadedStock: { ...dispatchForm.loadedStock, [p.id]: e.target.value}
})}
 />
 </div>
 ))}
 </div>
 </div>

 <div className="flex items-center gap-4 pt-4 border-t border-black/5 mt-4">
 <button 
 type="button" 
 className="flex-1 h-14 rounded-pill border border-black/10 font-semibold text-ink-primary text-xs hover:bg-black/5 transition-all cursor-pointer" 
 onClick={() => setShowDispatchModal(false)}
 >
 Cancel
 </button>
 <button 
 type="submit" 
 className="btn-signature h-14 !text-xs flex items-center justify-between pl-8 pr-2 group flex-[1.5]"
 >
 <span className="font-semibold">START DISPATCH</span>
 <div className="icon-nest !w-10 !h-10">
 <CheckCircle2 size={20} />
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
 <div className="flex justify-between items-start mb-5">
 <div>
 <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">RECONCILE<span className="text-accent-signature">.</span></h1>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">TRIP SETTLEMENT & RECOVERY REVIEW</p>
 </div>
 <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary" onClick={() => setShowReconcileModal(null)}>
 <X size={18} />
 </button>
 </div>
 
 <form onSubmit={handleReconcile} className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="p-4 bg-canvas border border-black/5 rounded-xl">
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Ending Odometer Index</label>
 <input required type="number" className="bg-transparent border-none w-full p-0 text-3xl font-semibold text-ink-primary outline-none font-mono" placeholder="000000" value={reconcileForm.finalOdometer} onChange={e => setReconcileForm({ ...reconcileForm, finalOdometer: e.target.value})} />
 </div>
 <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
 <label className="block text-[10px] font-semibold text-emerald-600/50 mb-1.5">Cash Liquidity Recovered</label>
 <div className="flex items-center gap-2">
 <span className="text-2xl font-semibold text-emerald-500 opacity-60">{businessProfile.currencySymbol}</span>
 <input required type="number" step="0.01" className="bg-transparent border-none w-full p-0 text-3xl font-semibold text-emerald-600 outline-none" placeholder="0.00" value={reconcileForm.actualCash} onChange={e => setReconcileForm({ ...reconcileForm, actualCash: e.target.value})} />
 </div>
 </div>
 </div>
 <div className="space-y-4">
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 px-1">ASSET RECOVERY VERIFICATION</label>
 <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
 {Object.keys(getExpectedLeftovers(showReconcileModal)).map(productId => {
 const data = getExpectedLeftovers(showReconcileModal)[productId];
 const actual = parseInt(reconcileForm.returnedStock[productId]) || 0;
 const hasDiscrepancy = actual !== data.leftover;
 return (
 <div key={productId} className={`p-4 rounded-lg border-2 transition-all flex items-center justify-between ${hasDiscrepancy ? 'bg-red-50 border-red-200' : 'bg-canvas border-transparent'}`}>
 <div className="min-w-0 pr-4">
 <div className="text-[11px] font-semibold text-ink-primary truncate">{data.name}</div>
 <div className="text-[9px] font-semibold text-gray-700/40 mt-1">Expected Recovery: {data.leftover} Units</div>
 </div>
 <div className="flex items-center gap-4">
 {hasDiscrepancy && <AlertTriangle size={18} className="text-red-500 animate-pulse" />}
 <input 
 type="number" 
 className="w-20 bg-white border border-black/5 rounded-xl p-3 text-center text-sm font-semibold text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all"
 value={reconcileForm.returnedStock[productId] || ''}
 onChange={(e) => setReconcileForm({ ...reconcileForm, returnedStock: { ...reconcileForm.returnedStock, [productId]: e.target.value}})}
 />
 </div>
 </div>
 );
})}
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4 pt-4">
 <button type="button" className="px-8 py-2 rounded-pill border border-black/10 font-semibold text-ink-primary text-xs hover:bg-black/5 transition-all cursor-pointer" onClick={() => setShowReconcileModal(null)}>Cancel</button>
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
 .custom-scrollbar::-webkit-scrollbar { width: 4px;}
 .custom-scrollbar::-webkit-scrollbar-track { background: transparent;}
 .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px;}
 .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.1);}
 `}} />
 </>
 );
};

export default Vehicles;
