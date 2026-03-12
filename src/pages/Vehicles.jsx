import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Truck, Map, Settings, Plus, Play, Flag, FileText, AlertTriangle, X } from 'lucide-react';

const Vehicles = () => {
    const { vehicles, addVehicle, routes, dispatchRoute, reconcileRoute, products, orders, businessProfile } = useAppContext();

    const [activeTab, setActiveTab] = useState('ROUTES'); // 'ROUTES' or 'FLEET'

    // Modals
    const [showVehicleModal, setShowVehicleModal] = useState(false);
    const [showDispatchModal, setShowDispatchModal] = useState(false);
    const [showReconcileModal, setShowReconcileModal] = useState(null); // holds route object

    // Forms
    const [vehicleForm, setVehicleForm] = useState({ name: '', plate: '' });

    const [dispatchForm, setDispatchForm] = useState({
        vehicleId: vehicles[0]?.id || '',
        driverId: '',
        initialOdometer: '',
        assignedOrders: [], // Array of assigned 'PENDING' order IDs
        loadedStock: {} // { productId: quantity }
    });

    const [reconcileForm, setReconcileForm] = useState({
        finalOdometer: '',
        actualCash: '',
        returnedStock: {} // { productId: quantity }
    });

    // --- Helpers ---
    const activeRoutes = routes.filter(r => r.status === 'ACTIVE');
    const pastRoutes = routes.filter(r => r.status === 'COMPLETED').slice(0, 10);

    // Calculate expected leftovers for a route
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

    const getRouteTotalCashSales = (route) => {
        const routeSales = orders.filter(o => o.routeId === route.id && o.paymentMethod === 'CASH');
        return routeSales.reduce((sum, o) => sum + o.totalAmount, 0);
    };

    // --- Handlers ---
    const handleAddVehicle = (e) => {
        e.preventDefault();
        if (vehicleForm.name && vehicleForm.plate) {
            addVehicle(vehicleForm);
            setVehicleForm({ name: '', plate: '' });
            setShowVehicleModal(false);
        }
    };

    const handleDispatch = (e) => {
        e.preventDefault();
        if (!dispatchForm.vehicleId || !dispatchForm.driverId || !dispatchForm.initialOdometer) return;

        // Format loadedStock into array
        const stockArray = Object.keys(dispatchForm.loadedStock)
            .map(id => ({ productId: id, quantity: parseInt(dispatchForm.loadedStock[id]) || 0 }))
            .filter(item => item.quantity > 0);

        if (stockArray.length === 0) {
            alert("You must load at least one product to dispatch.");
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
        setDispatchForm({ vehicleId: vehicles[0]?.id || '', driverId: '', initialOdometer: '', assignedOrders: [], loadedStock: {} });
    };

    const handleAssignOrder = (orderId, isChecked) => {
        setDispatchForm(prev => {
            const newAssigned = isChecked
                ? [...prev.assignedOrders, orderId]
                : prev.assignedOrders.filter(id => id !== orderId);

            // Auto-calculate requested stock from assigned orders
            const newLoadedStock = { ...prev.loadedStock };
            const order = orders.find(o => o.id === orderId);

            if (order) {
                order.items.forEach(item => {
                    const currentVal = parseInt(newLoadedStock[item.productId]) || 0;
                    if (isChecked) {
                        newLoadedStock[item.productId] = currentVal + item.quantity;
                    } else {
                        newLoadedStock[item.productId] = Math.max(0, currentVal - item.quantity);
                    }
                });
            }

            return { ...prev, assignedOrders: newAssigned, loadedStock: newLoadedStock };
        });
    };

    const openReconcile = (route) => {
        const expected = getExpectedLeftovers(route);
        const initialReturned = {};
        Object.keys(expected).forEach(id => {
            initialReturned[id] = expected[id].leftover; // default to perfectly matching expected
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
        if (!reconcileForm.finalOdometer) return;

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
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', maxWidth: '1400px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>Fleet & Routes</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Manage vehicles, dispatch inventory, and reconcile end-of-day routes.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className={`btn ${activeTab === 'ROUTES' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('ROUTES')} style={{ borderRadius: '12px' }}>
                        <Map size={18} /> Active Routes
                    </button>
                    <button className={`btn ${activeTab === 'FLEET' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('FLEET')} style={{ borderRadius: '12px' }}>
                        <Truck size={18} /> Vehicle Fleet
                    </button>
                </div>
            </div>

            {activeTab === 'FLEET' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-primary" onClick={() => setShowVehicleModal(true)}>
                            <Plus size={18} /> Add Vehicle
                        </button>
                    </div>

                    <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                        {vehicles.map(v => (
                            <div key={v.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {v.image && (
                                    <div style={{ width: '100%', height: '160px', borderRadius: '8px', overflow: 'hidden', marginBottom: '0.5rem', border: '1px solid var(--border-color)' }}>
                                        <img src={v.image} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{v.name}</h3>
                                    <Truck className="text-primary" />
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    License Plate: <span style={{ fontWeight: 600, color: 'var(--text-main)', background: 'rgba(0,0,0,0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{v.plate}</span>
                                </div>
                            </div>
                        ))}
                        {vehicles.length === 0 && <p>No vehicles in fleet. Add one to get started.</p>}
                    </div>
                </div>
            )}

            {activeTab === 'ROUTES' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Active Routes */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Active Dispatches</h2>
                            <button className="btn btn-primary" onClick={() => setShowDispatchModal(true)}>
                                <Play size={18} /> Dispatch New Route
                            </button>
                        </div>

                        <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' }}>
                            {activeRoutes.map(route => {
                                const vehicle = vehicles.find(v => v.id === route.vehicleId);
                                const itemsLoaded = route.loadedStock.reduce((s, i) => s + i.quantity, 0);

                                return (
                                    <div key={route.id} className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--warning)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--warning)', background: 'var(--warning-light)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>ON ROUTE</span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(route.date).toLocaleTimeString()}</span>
                                        </div>

                                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{vehicle?.name || 'Unknown Vehicle'}</h3>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>Driver: {route.driverId}</p>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Start Odometer</div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{route.initialOdometer} km</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Stock Loaded</div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{itemsLoaded} Units</div>
                                            </div>
                                        </div>

                                        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => openReconcile(route)}>
                                            <Flag size={18} /> End Route & Reconcile
                                        </button>
                                    </div>
                                );
                            })}
                            {activeRoutes.length === 0 && (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '16px' }}>
                                    No vehicles currently on route. Click "Dispatch New Route" to load inventory.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Past Routes (Simple view) */}
                    <div style={{ marginTop: '2rem' }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-main)' }}>Recently Completed</h2>
                        <div className="glass-panel" style={{ overflowX: 'auto', padding: 0 }}>
                            <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Vehicle & Driver</th>
                                        <th>Distance</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pastRoutes.map(route => {
                                        const vehicle = vehicles.find(v => v.id === route.vehicleId);
                                        return (
                                            <tr key={route.id}>
                                                <td>{new Date(route.reconciledAt).toLocaleString()}</td>
                                                <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{vehicle?.name} ({route.driverId})</td>
                                                <td>{route.finalOdometer - route.initialOdometer} km</td>
                                                <td>
                                                    <span className="badge badge-success">RECONCILED</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {pastRoutes.length === 0 && <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No completed routes yet.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

        </div>

            {/* --- ADD VEHICLE MODAL --- */}
            {showVehicleModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(12px)' }}>
                    <div className="glass-panel animate-scale-up" style={{ padding: '2rem', width: '100%', maxWidth: '400px', background: '#ffffff', borderRadius: '24px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Add New Vehicle</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '12px', minWidth: '40px' }} onClick={() => setShowVehicleModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleAddVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label>Vehicle Name / Model</label>
                                <input required type="text" className="input-field" value={vehicleForm.name} onChange={e => setVehicleForm({ ...vehicleForm, name: e.target.value })} placeholder="e.g. Ford Transit" />
                            </div>
                            <div>
                                <label>License Plate</label>
                                <input required type="text" className="input-field" value={vehicleForm.plate} onChange={e => setVehicleForm({ ...vehicleForm, plate: e.target.value })} placeholder="XYZ-1234" />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowVehicleModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- DISPATCH MODAL --- */}
            {showDispatchModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(12px)' }}>
                    <div className="glass-panel animate-scale-up" style={{ padding: '2.5rem', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '24px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Dispatch New Route</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '12px', minWidth: '40px' }} onClick={() => setShowDispatchModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        {vehicles.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)', background: 'var(--danger-light)', borderRadius: '12px' }}>
                                You must add a vehicle to the fleet before dispatching!
                                <button className="btn btn-secondary mt-4" onClick={() => setShowDispatchModal(false)}>Close</button>
                            </div>
                        ) : (
                            <form onSubmit={handleDispatch} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label>Select Vehicle</label>
                                        <select className="input-field" value={dispatchForm.vehicleId} onChange={e => setDispatchForm({ ...dispatchForm, vehicleId: e.target.value })}>
                                            {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.plate})</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label>Driver Name</label>
                                        <input required type="text" className="input-field" value={dispatchForm.driverId} onChange={e => setDispatchForm({ ...dispatchForm, driverId: e.target.value })} placeholder="John Doe" />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label>Starting Odometer (km/miles)</label>
                                        <input required type="number" className="input-field" value={dispatchForm.initialOdometer} onChange={e => setDispatchForm({ ...dispatchForm, initialOdometer: e.target.value })} placeholder="125000" />
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                                    <label style={{ fontSize: '1rem', marginBottom: '1rem' }}>Select Inventory to Load</label>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Specify how many units of each product are physically loaded onto the truck. This immediately deducts from the Main Store stock.</p>

                                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                                            <Map size={16} /> Load Inventory to Vehicle
                                        </label>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Select products and quantities to load onto this truck for the day.</p>

                                        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '0.5rem', background: 'white' }}>
                                            {products.filter(p => p.stock > 0).map(p => (
                                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>{p.name}</div>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>Main Stock: <span style={{ fontWeight: 600 }}>{p.stock} {p.unit}</span></div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max={p.stock}
                                                            className="input-field"
                                                            style={{ width: '90px', padding: '0.5rem', textAlign: 'center' }}
                                                            placeholder="0"
                                                            value={dispatchForm.loadedStock[p.id] || ''}
                                                            onChange={(e) => setDispatchForm({
                                                                ...dispatchForm,
                                                                loadedStock: { ...dispatchForm.loadedStock, [p.id]: e.target.value }
                                                            })}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                            {products.filter(p => p.stock > 0).length === 0 && <p style={{ padding: '1rem' }}>No products available in main inventory.</p>}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowDispatchModal(false)}>Cancel</button>
                                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Confirm Dispatch</button>
                                    </div>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* --- RECONCILE MODAL --- */}
            {showReconcileModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(12px)' }}>
                    <div className="glass-panel animate-scale-up" style={{ padding: '2.5rem', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '24px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Reconcile Route</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '12px', minWidth: '40px' }} onClick={() => setShowReconcileModal(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleReconcile} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                    <FileText size={18} className="text-primary" />
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Stock Verification</h3>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                    We've calculated the expected leftover based on today's POS sales for this route. Adjust the "Actual Returned" if there are discrepancies (lost/damaged).
                                </p>

                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                                    <thead style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <tr>
                                            <th style={{ padding: '0.5rem' }}>Product</th>
                                            <th style={{ padding: '0.5rem', textAlign: 'center' }}>Loaded</th>
                                            <th style={{ padding: '0.5rem', textAlign: 'center' }}>Sold</th>
                                            <th style={{ padding: '0.5rem', textAlign: 'center' }}>Expected Left</th>
                                            <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actual Returned</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.keys(getExpectedLeftovers(showReconcileModal)).map(productId => {
                                            const data = getExpectedLeftovers(showReconcileModal)[productId];
                                            const actual = parseInt(reconcileForm.returnedStock[productId]) || 0;
                                            const hasDiscrepancy = actual !== data.leftover;

                                            return (
                                                <tr key={productId} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: hasDiscrepancy ? 'var(--warning-light)' : 'transparent' }}>
                                                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{data.name}</td>
                                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>{data.loaded}</td>
                                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--primary)', fontWeight: 600 }}>{data.sold}</td>
                                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontWeight: 700 }}>{data.leftover}</td>
                                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                                            {hasDiscrepancy && <AlertTriangle size={14} className="text-warning" />}
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                className="input-field"
                                                                style={{ width: '70px', padding: '0.3rem', textAlign: 'center', borderColor: hasDiscrepancy ? 'var(--warning)' : 'var(--border-color)' }}
                                                                value={reconcileForm.returnedStock[productId] || ''}
                                                                onChange={(e) => setReconcileForm({
                                                                    ...reconcileForm,
                                                                    returnedStock: { ...reconcileForm.returnedStock, [productId]: e.target.value }
                                                                })}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowReconcileModal(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Complete & Return Stock</button>
                            </div>
                        </form>
                    </div >
                </div >
            )}
        </>
    );
};

export default Vehicles;
