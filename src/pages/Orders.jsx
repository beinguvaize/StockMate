import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { ShoppingCart, CheckCircle, Clock, Truck, User, FileText, XCircle } from 'lucide-react';

const Orders = () => {
    const { orders, updateOrder, users, shops, vehicles, businessProfile } = useAppContext();
    const [activeTab, setActiveTab] = useState('PENDING');

    const pendingOrders = orders.filter(o => o.status === 'PENDING');
    const completedOrders = orders.filter(o => o.status === 'COMPLETED');

    const handleMarkDelivered = (orderId) => {
        // Find order, mark status as COMPLETED, record the delivery date/time
        const order = orders.find(o => o.id === orderId);
        if (order) {
            updateOrder({
                ...order,
                status: 'COMPLETED',
                deliveryDate: new Date().toISOString()
            });
        }
    };

    const handleCancelOrder = (orderId) => {
        const order = orders.find(o => o.id === orderId);
        if (order) {
            if (window.confirm("Are you sure you want to cancel this Pending Order?")) {
                updateOrder({ ...order, status: 'CANCELLED' });
            }
        }
    };

    const getUserName = (userId) => {
        const user = users.find(u => u.id === userId);
        return user ? user.name : 'Unknown';
    };

    const getShopName = (shopId) => {
        if (shopId === 'POS-WALKIN') return 'Walk-in Customer';
        const shop = shops.find(s => s.id === shopId);
        return shop ? shop.name : 'Unknown Shop';
    };

    const getVehicleName = (vehicleId) => {
        if (!vehicleId || vehicleId === 'MAIN-STORE') return 'In-Store Checkout';
        const vehicle = vehicles.find(v => v.id === vehicleId);
        return vehicle ? `${vehicle.licensePlate} (${vehicle.driverName})` : vehicleId;
    };

    const OrderCard = ({ order, isPending }) => (
        <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1rem', borderLeft: isPending ? '4px solid var(--warning)' : '4px solid var(--success)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <h3 style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={18} className="text-primary" /> Order {order.id}
                        </h3>
                        <span className={`badge ${isPending ? 'badge-warning' : 'badge-success'}`}>
                            {order.status}
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Client / Destination</div>
                            <div style={{ fontWeight: 600 }}>{getShopName(order.shopId)}</div>
                            {order.customerInfo?.phone && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{order.customerInfo.phone}</div>}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><User size={12} /> Booked By</div>
                            <div style={{ fontWeight: 600 }}>{getUserName(order.bookedBy)}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(order.date).toLocaleString()}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Truck size={12} /> Fulfillment / Fleet</div>
                            <div style={{ fontWeight: 600 }}>{getVehicleName(order.shopId === 'POS-WALKIN' ? 'MAIN-STORE' : (order.deliveredBy || 'Unassigned'))}</div>
                        </div>
                    </div>

                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Order Items:</div>
                        {order.items.map((item, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                                <span>{item.quantity}x {item.name}</span>
                                <span>{businessProfile.currencySymbol}{(item.sellingPrice * item.quantity).toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', minWidth: '150px' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                        {businessProfile.currencySymbol}{order.totalAmount.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Method: <strong style={{ color: order.paymentMethod === 'CASH' ? 'var(--success)' : 'var(--danger)' }}>{order.paymentMethod}</strong>
                    </div>

                    {isPending && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                            <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleCancelOrder(order.id)}>
                                <XCircle size={16} /> Cancel
                            </button>
                            <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: 'var(--success)' }} onClick={() => handleMarkDelivered(order.id)}>
                                <CheckCircle size={16} /> Mark Delivered
                            </button>
                        </div>
                    )}

                    {!isPending && order.deliveryDate && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <CheckCircle size={14} /> Delivered: {new Date(order.deliveryDate).toLocaleDateString()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in page-container" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
                <div>
                    <h1 className="page-title">Order Management</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Track Pre-Books, active deliveries, and completed sales.</p>
                </div>
                <div className="glass-panel" style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem', borderRadius: '12px' }}>
                    <button
                        className={`btn ${activeTab === 'PENDING' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ border: activeTab === 'PENDING' ? 'none' : '1px solid transparent', background: activeTab === 'PENDING' ? 'var(--primary)' : 'transparent', color: activeTab === 'PENDING' ? 'white' : 'var(--text-muted)' }}
                        onClick={() => setActiveTab('PENDING')}
                    >
                        <Clock size={16} /> Pending Delivery ({pendingOrders.length})
                    </button>
                    <button
                        className={`btn ${activeTab === 'COMPLETED' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ border: activeTab === 'COMPLETED' ? 'none' : '1px solid transparent', background: activeTab === 'COMPLETED' ? 'var(--success)' : 'transparent', color: activeTab === 'COMPLETED' ? 'white' : 'var(--text-muted)' }}
                        onClick={() => setActiveTab('COMPLETED')}
                    >
                        <CheckCircle size={16} /> Completed Orders
                    </button>
                </div>
            </div>

            <div>
                {activeTab === 'PENDING' && (
                    <>
                        {pendingOrders.length === 0 ? (
                            <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <ShoppingCart size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
                                <h3>No Pending Orders</h3>
                                <p>All booked orders have been fulfilled or none exist.</p>
                            </div>
                        ) : (
                            pendingOrders.map(order => <OrderCard key={order.id} order={order} isPending={true} />)
                        )}
                    </>
                )}

                {activeTab === 'COMPLETED' && (
                    <>
                        {completedOrders.length === 0 ? (
                            <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <CheckCircle size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
                                <h3>No Completed Orders</h3>
                            </div>
                        ) : (
                            completedOrders.map(order => <OrderCard key={order.id} order={order} isPending={false} />)
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default Orders;
