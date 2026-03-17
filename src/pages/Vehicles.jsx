import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    Truck, Map, Settings as SettingsIcon, Plus, Play, Flag, 
    FileText, AlertTriangle, X, ShoppingCart, ChevronRight,
    MapPin, Navigation, Gauge, Calendar, ShieldCheck, 
    Save, Hash, History, CheckCircle2
} from 'lucide-react';

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
            initialOdometer: parseInt(dispatchForm.initialOdometer),
            assignedOrders: dispatchForm.assignedOrders,
            loadedStock: stockArray
        });

        setShowDispatchModal(false);
        const defaultVid = vehicles[0]?.id || '';
        setDispatchForm({ 
            vehicleId: defaultVid, 
            driverId: '', 
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
                    <h1 className="text-7xl font-black tracking-tighter text-ink-primary uppercase leading-none mb-4">Traffic.</h1>
                    <p className="text-sm font-medium text-ink-secondary tracking-tight uppercase opacity-50">Fleet Optimization & Multi-Vector Fulfillment</p>
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
                    {/* Active Mission Control - Extreme Density */}
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-6 bg-accent-signature rounded-pill"></div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-60">Active Mission Control</h2>
                    </div>

                    <div className="glass-panel !p-0 overflow-hidden border border-black/5 bg-surface shadow-premium !rounded-bento">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-canvas border-b border-black/5">
                                    <tr>
                                        <th className="p-1.5 pl-8 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40">Vector / Unit</th>
                                        <th className="p-1.5 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40">Command Agent</th>
                                        <th className="p-1.5 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40 text-center">Loadout</th>
                                        <th className="p-1.5 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40 text-right">Telemetry</th>
                                        <th className="p-1.5 text-right text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-40">Mission Status</th>
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
                                                        className="px-4 py-1.5 rounded-pill bg-ink-primary text-accent-signature font-black text-[10px] tracking-widest uppercase hover:shadow-lg transition-all"
                                                        onClick={() => openReconcile(route)}
                                                    >
                                                        TERMINATE
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {activeRoutes.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="py-20 text-center text-[10px] font-black text-ink-secondary uppercase tracking-[0.4em] opacity-20">
                                                Zero active vectors in mission zone
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Historical Archive */}
                    <div className="pt-20">
                        <div className="flex items-center gap-5 mb-8">
                            <History size={20} className="text-ink-primary opacity-20" />
                            <h2 className="text-sm font-black uppercase tracking-[0.5em] text-ink-secondary opacity-60">Fulfillment Archive</h2>
                        </div>
                        <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-canvas border-b border-black/5 text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em]">
                                        <th className="p-1.5 pl-8">Temporal Log</th>
                                        <th className="p-1.5">Unit & Vector Agent</th>
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
                    <div className="glass-modal !max-w-[600px] !p-8 md:!p-12 relative !rounded-[2.5rem]">
                        <button 
                            onClick={() => setShowVehicleModal(false)}
                            className="absolute top-6 right-6 w-10 h-10 rounded-pill bg-canvas flex items-center justify-center text-ink-primary hover:scale-110 transition-transform z-20 shadow-premium"
                        >
                            <X size={18} />
                        </button>

                        <div className="absolute top-0 left-0 w-2 h-full bg-accent-signature"></div>

                        <div className="mb-6">
                            <h3 className="text-3xl font-black tracking-tighter text-ink-primary uppercase mb-1">Unit Registry</h3>
                            <p className="text-[10px] font-black text-ink-secondary/70 uppercase tracking-widest">Inbound Asset Integration Protocol</p>
                        </div>

                        <form onSubmit={handleAddVehicle} className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-ink-secondary opacity-50 mb-2">Unit Nomenclature</label>
                                <input 
                                    required 
                                    type="text" 
                                    className="input-field !rounded-xl !py-2.5 font-black text-lg bg-canvas/30" 
                                    placeholder="TRANSIT-V4-NORTH..."
                                    value={vehicleForm.name} 
                                    onChange={e => setVehicleForm({ ...vehicleForm, name: e.target.value })} 
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-ink-secondary opacity-50 mb-2">Identifier (License Plate)</label>
                                <input 
                                    required 
                                    type="text" 
                                    className="input-field !rounded-xl !py-2.5 font-bold bg-canvas/30 text-xs" 
                                    placeholder="XYZ-0000"
                                    value={vehicleForm.plate} 
                                    onChange={e => setVehicleForm({ ...vehicleForm, plate: e.target.value })} 
                                />
                            </div>
                            <div className="flex gap-4 pt-6">
                                <button type="button" className="flex-1 py-3 rounded-pill border border-black/10 font-bold text-ink-primary hover:bg-black/5 transition-all text-[10px] tracking-widest uppercase" onClick={() => setShowVehicleModal(false)}>Abort</button>
                                <button type="submit" className="btn-signature flex-[2] !py-3 !rounded-pill">
                                    AUTHORIZE REGISTRY
                                    <div className="icon-nest">
                                        <Plus size={20} />
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
                    <div className="glass-modal !max-w-[800px] !p-8 md:!p-12 relative !rounded-[2.5rem]">
                        <button 
                            onClick={() => setShowDispatchModal(false)}
                            className="absolute top-6 right-6 w-10 h-10 rounded-pill bg-canvas flex items-center justify-center text-ink-primary hover:scale-110 transition-transform z-20 shadow-premium"
                        >
                            <X size={18} />
                        </button>

                        <div className="absolute top-0 left-0 w-2 h-full bg-accent-signature"></div>

                        <div className="mb-6">
                            <h3 className="text-3xl font-black tracking-tighter text-ink-primary uppercase mb-1">Command Dispatch</h3>
                            <p className="text-[10px] font-black text-ink-secondary/70 uppercase tracking-widest">Asset Deployment Matrix</p>
                        </div>

                        <form onSubmit={handleDispatch} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="p-6 bg-canvas/30 rounded-2xl border border-black/5">
                                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-ink-secondary opacity-50 mb-4">Vector Assignment</label>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[8px] font-black text-ink-secondary uppercase opacity-50 block mb-1 px-1">Selected Unit</label>
                                            <select 
                                                className="input-field !rounded-xl !py-2 !h-10 font-black text-xs uppercase appearance-none cursor-pointer" 
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
                                            <label className="text-[8px] font-black text-ink-secondary uppercase opacity-50 block mb-1 px-1">Clearance Agent</label>
                                            <select required className="input-field !rounded-xl !py-2 !h-10 font-black text-xs uppercase appearance-none cursor-pointer" value={dispatchForm.driverId} onChange={e => setDispatchForm({ ...dispatchForm, driverId: e.target.value })}>
                                                <option value="">SELECT AGENT...</option>
                                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-canvas/30 rounded-2xl border border-black/5">
                                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-ink-secondary opacity-50 mb-4">Telemetry Baseline</label>
                                    <input required type="number" className="input-field !rounded-xl !py-2.5 font-black text-lg" placeholder="Odometer Index..." value={dispatchForm.initialOdometer} onChange={e => setDispatchForm({ ...dispatchForm, initialOdometer: e.target.value })} />
                                </div>
                            </div>

                            <div className="flex flex-col">
                                <div className="flex-1 p-6 bg-ink-primary rounded-2xl flex flex-col mb-6">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-surface/30 mb-4 flex items-center gap-2">
                                        <ShoppingCart size={12} className="text-accent-signature" /> Fulfillment Pipeline
                                    </label>
                                    <div className="flex-1 overflow-y-auto max-h-[200px] space-y-2 custom-scrollbar pr-2">
                                        {products.filter(p => p.stock > 0).map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                                <div className="min-w-0">
                                                    <div className="text-[10px] font-black text-surface uppercase truncate">{p.name}</div>
                                                    <div className="text-[8px] font-bold text-surface/20 uppercase tracking-widest">{p.stock} units</div>
                                                </div>
                                                <input 
                                                    type="number" 
                                                    className="w-16 bg-white/10 border-none rounded-lg p-2 text-center text-xs font-black text-accent-signature outline-none"
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

                                <button type="submit" className="btn-signature !h-14 w-full">
                                    AUTHORIZE DISPATCH
                                    <div className="icon-nest">
                                        <CheckCircle2 size={24} />
                                    </div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* RECONCILE MODAL */}
            {showReconcileModal && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-[600px] !p-8 md:!p-12 relative !rounded-[2.5rem]">
                        <button 
                            onClick={() => setShowReconcileModal(null)}
                            className="absolute top-6 right-6 w-10 h-10 rounded-pill bg-canvas flex items-center justify-center text-ink-primary hover:scale-110 transition-transform z-20 shadow-premium"
                        >
                            <X size={18} />
                        </button>

                        <div className="absolute top-0 left-0 w-2 h-full bg-accent-signature"></div>

                        <div className="mb-6">
                            <h3 className="text-3xl font-black tracking-tighter text-ink-primary uppercase mb-1">Mission Debrief</h3>
                            <p className="text-[10px] font-black text-ink-secondary/70 uppercase tracking-widest">Operational Reconciliation protocol</p>
                        </div>

                        <form onSubmit={handleReconcile} className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="p-4 bg-canvas/30 rounded-2xl border border-black/5">
                                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-ink-secondary opacity-50 mb-2">Final Telemetry</label>
                                    <input required type="number" className="bg-transparent border-none w-full p-0 text-xl font-black text-ink-primary outline-none" placeholder="Index..." value={reconcileForm.finalOdometer} onChange={e => setReconcileForm({ ...reconcileForm, finalOdometer: e.target.value })} />
                                </div>
                                <div className="p-4 bg-canvas/30 rounded-2xl border border-black/5">
                                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-ink-secondary opacity-50 mb-2">Capital Recovery</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg font-black text-ink-primary opacity-20">{businessProfile.currencySymbol}</span>
                                        <input required type="number" step="0.01" className="bg-transparent border-none w-full p-0 text-xl font-black text-emerald-500 outline-none" placeholder="0.00" value={reconcileForm.actualCash} onChange={e => setReconcileForm({ ...reconcileForm, actualCash: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-ink-secondary opacity-50">Asset Audit</label>
                                <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                    {Object.keys(getExpectedLeftovers(showReconcileModal)).map(productId => {
                                        const data = getExpectedLeftovers(showReconcileModal)[productId];
                                        const actual = parseInt(reconcileForm.returnedStock[productId]) || 0;
                                        const hasDiscrepancy = actual !== data.leftover;
                                        return (
                                            <div key={productId} className={`p-4 rounded-xl border transition-all flex items-center justify-between ${hasDiscrepancy ? 'bg-red-50 border-red-100' : 'bg-canvas/30 border-black/5'}`}>
                                                <div className="min-w-0">
                                                    <div className="text-[10px] font-black text-ink-primary uppercase truncate">{data.name}</div>
                                                    <div className="text-[8px] font-bold text-ink-secondary/50 uppercase">Expected: {data.leftover}</div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    {hasDiscrepancy && <AlertTriangle size={14} className="text-red-500" />}
                                                    <input 
                                                        type="number" 
                                                        className="w-16 bg-white border border-black/5 rounded-lg p-2 text-center text-xs font-black outline-none"
                                                        value={reconcileForm.returnedStock[productId] || ''}
                                                        onChange={(e) => setReconcileForm({ ...reconcileForm, returnedStock: { ...reconcileForm.returnedStock, [productId]: e.target.value } })}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <button type="submit" className="btn-signature !h-14 w-full">
                                EXECUTE RECONCILIATION
                                <div className="icon-nest">
                                    <ShieldCheck size={24} />
                                </div>
                            </button>
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
