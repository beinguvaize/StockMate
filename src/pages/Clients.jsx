import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { UserCircle, Plus, DollarSign, Building, Phone, MapPin, Edit3, Trash2, X, Check, Save } from 'lucide-react';

const Clients = () => {
    const { shops, addShop, updateShop, deleteShop, orders, businessProfile, isViewOnly } = useAppContext();
    const [isAdding, setIsAdding] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [formData, setFormData] = useState({ name: '', contact: '', phone: '', address: '' });
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const clientStats = useMemo(() => {
        const stats = {};
        shops.forEach(s => stats[s.id] = { totalSales: 0, outstandingDebt: 0, orderCount: 0 });

        orders.forEach(order => {
            if (stats[order.shopId]) {
                stats[order.shopId].totalSales += order.totalAmount;
                stats[order.shopId].orderCount += 1;
                if (order.paymentMethod === 'CREDIT') {
                    stats[order.shopId].outstandingDebt += order.totalAmount;
                }
            }
        });
        return stats;
    }, [orders, shops]);

    const openAdd = () => {
        setEditingClient(null);
        setFormData({ name: '', contact: '', phone: '', address: '' });
        setIsAdding(true);
    };

    const openEdit = (client) => {
        setEditingClient(client);
        setFormData({ name: client.name, contact: client.contact, phone: client.phone, address: client.address });
        setIsAdding(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (editingClient) {
            updateShop({ ...editingClient, ...formData });
        } else {
            addShop(formData);
        }
        setIsAdding(false);
        setEditingClient(null);
        setFormData({ name: '', contact: '', phone: '', address: '' });
    };

    const handleDelete = (shopId) => {
        deleteShop(shopId);
        setDeleteConfirm(null);
    };

    const viewOnly = isViewOnly();

    return (
        <div className="page-container animate-fade-in" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="page-title">Client Management</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Manage your customer accounts and track outstanding credit.</p>
                </div>
                {!viewOnly && (
                    <button className="btn btn-primary" onClick={openAdd}>
                        <Plus size={18} /> Add Client
                    </button>
                )}
            </div>

            {isAdding && (
                <div className="glass-panel" style={{ marginBottom: '2rem', padding: '1.5rem', borderLeft: `4px solid ${editingClient ? 'var(--warning)' : 'var(--primary)'}` }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>
                        {editingClient ? 'Edit Client Account' : 'Create New Client Account'}
                    </h3>
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ fontSize: '0.8rem', marginBottom: '0.3rem', display: 'block' }}>Business / Client Name</label>
                            <input required type="text" className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="ABC Store" />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8rem', marginBottom: '0.3rem', display: 'block' }}>Contact Person</label>
                            <input required type="text" className="input-field" value={formData.contact} onChange={e => setFormData({ ...formData, contact: e.target.value })} placeholder="John Doe" />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8rem', marginBottom: '0.3rem', display: 'block' }}>Phone Number</label>
                            <input required type="text" className="input-field" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="555-0199" />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8rem', marginBottom: '0.3rem', display: 'block' }}>Address</label>
                            <input required type="text" className="input-field" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="123 Main St" />
                        </div>
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                            <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Save size={16} /> {editingClient ? 'Update Client' : 'Save Client'}
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => { setIsAdding(false); setEditingClient(null); }}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {shops.map(client => {
                    const stats = clientStats[client.id];
                    return (
                        <div key={client.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', transition: 'transform 0.2s, box-shadow 0.2s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Building size={16} className="text-primary" /> {client.name}
                                    </h3>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{client.id}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    {!viewOnly && (
                                        <>
                                            <button
                                                className="btn"
                                                style={{ padding: '0.3rem', backgroundColor: 'var(--primary-transparent)', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                                                onClick={() => openEdit(client)}
                                                title="Edit client"
                                            >
                                                <Edit3 size={14} className="text-primary" />
                                            </button>
                                            {deleteConfirm === client.id ? (
                                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                    <button className="btn" style={{ padding: '0.3rem', backgroundColor: 'var(--danger-transparent)', borderRadius: '6px' }} onClick={() => handleDelete(client.id)} title="Confirm delete">
                                                        <Check size={14} style={{ color: 'var(--danger)' }} />
                                                    </button>
                                                    <button className="btn" style={{ padding: '0.3rem', backgroundColor: 'var(--surface-hover)', borderRadius: '6px' }} onClick={() => setDeleteConfirm(null)} title="Cancel">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="btn"
                                                    style={{ padding: '0.3rem', backgroundColor: 'var(--danger-transparent)', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                                                    onClick={() => setDeleteConfirm(client.id)}
                                                    title="Delete client"
                                                >
                                                    <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><UserCircle size={14} className="text-muted" /> {client.contact}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Phone size={14} className="text-muted" /> {client.phone}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MapPin size={14} className="text-muted" /> {client.address}</div>
                            </div>

                            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Orders</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                                        {stats?.orderCount || 0}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Lifetime</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>
                                        {businessProfile.currencySymbol}{stats?.totalSales.toFixed(2)}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Credit Due</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: stats?.outstandingDebt > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                                        {businessProfile.currencySymbol}{stats?.outstandingDebt.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {shops.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
                        No clients yet. Add your first client to start tracking.
                    </div>
                )}
            </div>
        </div>
    );
};

export default Clients;
