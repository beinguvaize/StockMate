import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, PackagePlus, AlertCircle, History, Tag as TagIcon, Barcode as BarcodeIcon } from 'lucide-react';
import Barcode from 'react-barcode';

const CATEGORIES = ['Electronics', 'Accessories', 'Furniture', 'Clothing', 'Other'];
const UNITS = ['pcs', 'kg', 'ltr', 'box', 'set'];

const Inventory = () => {
    const { products, addProduct, updateProduct, adjustStock, movementLog, businessProfile } = useAppContext();

    const [showAddModal, setShowAddModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [adjustAmounts, setAdjustAmounts] = useState({});
    const [adjustReasons, setAdjustReasons] = useState({});
    const [adjustSources, setAdjustSources] = useState({});

    const [formData, setFormData] = useState({
        name: '', sku: '', category: CATEGORIES[0], unit: UNITS[0],
        costPrice: '', sellingPrice: '', stock: '', taxRate: '', tags: ''
    });

    const openAddModal = () => {
        setEditingProduct(null);
        setFormData({ name: '', sku: '', category: CATEGORIES[0], unit: UNITS[0], costPrice: '', sellingPrice: '', stock: '', taxRate: '', tags: '' });
        setShowAddModal(true);
    };

    const openEditModal = (p) => {
        setEditingProduct(p);
        setFormData({
            ...p,
            taxRate: p.taxRate || 0,
            tags: p.tags ? p.tags.join(', ') : ''
        });
        setShowAddModal(true);
    };

    const handleAddSubmit = (e) => {
        e.preventDefault();
        if (!formData.name || !formData.sellingPrice || !formData.costPrice || !formData.sku) return;

        const parsedData = {
            ...formData,
            costPrice: parseFloat(formData.costPrice) || 0,
            sellingPrice: parseFloat(formData.sellingPrice) || 0,
            stock: parseInt(formData.stock) || 0,
            taxRate: parseFloat(formData.taxRate) || 0,
            tags: formData.tags.split(',').map(t => t.trim()).filter(t => t)
        };

        if (editingProduct) {
            updateProduct({ ...parsedData, id: editingProduct.id });
        } else {
            addProduct(parsedData);
        }

        setShowAddModal(false);
    };

    const handleAdjust = (productId) => {
        const amt = parseInt(adjustAmounts[productId]) || 0;
        const reason = adjustReasons[productId] || "Inventory Adjustment";
        const source = adjustSources[productId] || (amt > 0 ? "IN-HOUSE" : "SALES");

        if (amt !== 0) {
            adjustStock(productId, amt, reason, source);
            setAdjustAmounts({ ...adjustAmounts, [productId]: '' });
            setAdjustReasons({ ...adjustReasons, [productId]: '' });
            setAdjustSources({ ...adjustSources, [productId]: 'IN-HOUSE' });
        }
    };

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', maxWidth: '1400px', margin: '0 auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>Inventory</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Manage products and track stock levels.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-secondary" onClick={() => setShowHistoryModal(true)}>
                        <History size={18} /> Movement Logs
                    </button>
                    <button className="btn btn-primary" onClick={openAddModal}>
                        <Plus size={18} /> Add Product
                    </button>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', border: 'none', borderRadius: '16px' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', minWidth: '1000px' }}>
                        <thead>
                            <tr>
                                <th>Product Info</th>
                                <th>Category</th>
                                <th style={{ textAlign: 'right' }}>Price & Cost</th>
                                <th style={{ textAlign: 'center' }}>Tax</th>
                                <th style={{ textAlign: 'center' }}>Stock Level</th>
                                <th style={{ textAlign: 'right' }}>Quick Adjust</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map(product => {
                                const isLow = product.stock > 0 && product.stock <= (businessProfile.lowStockThreshold || 10);
                                const isOut = product.stock <= 0;

                                return (
                                    <tr key={product.id}>
                                        <td style={{ cursor: 'pointer' }} onClick={() => openEditModal(product)}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                                    {product.image ? (
                                                        <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <PackagePlus size={22} strokeWidth={1.5} />
                                                    )}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '1rem' }}>{product.name}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 700, marginTop: '0.125rem' }}>
                                                        <BarcodeIcon size={14} className="text-primary" /> {product.sku}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>{product.category}</div>
                                            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                                                {product.tags && product.tags.map(t => (
                                                    <span key={t} className="badge badge-gray">
                                                        {t}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>{businessProfile.currencySymbol}{product.sellingPrice.toFixed(2)}</div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: '0.125rem' }}>Cost: {businessProfile.currencySymbol}{product.costPrice.toFixed(2)}</div>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {product.taxRate > 0 ? (
                                                <span className="badge badge-warning">
                                                    {product.taxRate}% VAT
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>EXEMPT</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--text-main)', marginBottom: '0.375rem', letterSpacing: '-0.025em' }}>
                                                {product.stock}
                                            </div>
                                            {isOut && <span className="badge badge-danger">Depleted</span>}
                                            {isLow && <span className="badge badge-warning">Critical</span>}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                                <button 
                                                    onClick={() => {
                                                        const current = parseInt(adjustAmounts[product.id]) || 0;
                                                        setAdjustAmounts({ ...adjustAmounts, [product.id]: current - 1 });
                                                    }}
                                                    style={{ padding: '0.4rem 0.6rem', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'var(--transition)' }}
                                                    onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                                                    onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                                >
                                                    <span style={{ fontSize: '1.25rem', lineHeight: '1', paddingBottom: '2px' }}>−</span>
                                                </button>
                                                
                                                <input
                                                    type="number"
                                                    style={{ width: '45px', padding: '0.4rem 0', textAlign: 'center', border: 'none', borderLeft: '1px solid var(--border-light)', borderRight: '1px solid var(--border-light)', background: 'transparent', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', appearance: 'textfield' }}
                                                    value={adjustAmounts[product.id] === undefined ? '' : adjustAmounts[product.id]}
                                                    onChange={(e) => setAdjustAmounts({ ...adjustAmounts, [product.id]: e.target.value })}
                                                    onBlur={() => {
                                                       if (adjustAmounts[product.id] && parseInt(adjustAmounts[product.id]) !== 0) {
                                                           handleAdjust(product.id);
                                                       } else {
                                                           setAdjustAmounts({ ...adjustAmounts, [product.id]: '' });
                                                       }
                                                    }}
                                                    onKeyDown={(e) => {
                                                       if (e.key === 'Enter' && adjustAmounts[product.id] && parseInt(adjustAmounts[product.id]) !== 0) {
                                                            handleAdjust(product.id);
                                                            e.target.blur();
                                                       }
                                                    }}
                                                    placeholder="0"
                                                />

                                                <button 
                                                    onClick={() => {
                                                        const current = parseInt(adjustAmounts[product.id]) || 0;
                                                        setAdjustAmounts({ ...adjustAmounts, [product.id]: current + 1 });
                                                    }}
                                                    style={{ padding: '0.4rem 0.6rem', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'var(--transition)' }}
                                                    onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                                                    onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                                >
                                                    <span style={{ fontSize: '1.25rem', lineHeight: '1', paddingBottom: '2px' }}>+</span>
                                                </button>
                                            </div>
                                            
                                            {adjustAmounts[product.id] && parseInt(adjustAmounts[product.id]) !== 0 && (
                                                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                                    <button 
                                                        className="btn btn-primary" 
                                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', borderRadius: '8px' }}
                                                        onClick={() => handleAdjust(product.id)}
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {products.length === 0 && (
                                <tr>
                                    <td colSpan="6" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No products found in inventory. Add one to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Product Modal */}
            {showAddModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(12px)' }}>
                    <div className="glass-panel animate-scale-up" style={{ padding: '2.5rem', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--text-main)' }}>{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
                        </div>

                        <form onSubmit={handleAddSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Official Product Name</label>
                                <input required type="text" className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Ergonomic Office Chair V2" />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SKU Identification</label>
                                <input required type="text" className="input-field" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="ACC-00124" style={{ padding: '0.75rem 1rem', fontWeight: 700, borderRadius: '14px' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Master Category</label>
                                <select className="input-field" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} style={{ padding: '0.75rem 1rem', fontWeight: 700, borderRadius: '14px' }}>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#f8fafc', padding: '1.5rem', borderRadius: '24px', border: '2px dashed var(--border-main)', alignItems: 'center', justifyContent: 'center' }}>
                                <label style={{ alignSelf: 'center', color: 'var(--text-dim)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Barcode Engine Visualization</label>
                                {formData.sku ? (
                                    <div style={{ padding: '1rem', backgroundColor: 'white', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
                                        <Barcode value={formData.sku} height={50} displayValue={true} background="transparent" lineColor="#0f172a" font="Inter" fontSize={14} textMargin={8} />
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-dim)', fontSize: '0.875rem', fontWeight: 600, fontStyle: 'italic' }}>Pending SKU input for logic generation...</div>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Purchase Cost ({businessProfile.currencySymbol})</label>
                                <input required type="number" step="0.01" min="0" className="input-field" value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: e.target.value })} placeholder="0.00" style={{ padding: '0.75rem 1rem', fontWeight: 700, borderRadius: '14px' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unit Retail Price ({businessProfile.currencySymbol})</label>
                                <input required type="number" step="0.01" min="0" className="input-field" value={formData.sellingPrice} onChange={e => setFormData({ ...formData, sellingPrice: e.target.value })} placeholder="0.00" style={{ padding: '0.75rem 1rem', fontWeight: 800, borderRadius: '14px', color: 'var(--primary)' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Standard Volume Unit</label>
                                <select className="input-field" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })} style={{ padding: '0.75rem 1rem', fontWeight: 700, borderRadius: '14px' }}>
                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tax Liability (%)</label>
                                <input type="number" step="0.1" min="0" max="100" className="input-field" value={formData.taxRate} onChange={e => setFormData({ ...formData, taxRate: e.target.value })} placeholder="0" style={{ padding: '0.75rem 1rem', fontWeight: 700, borderRadius: '14px' }} />
                            </div>

                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Search Metadata (Tags)</label>
                                <input type="text" className="input-field" value={formData.tags} onChange={e => setFormData({ ...formData, tags: e.target.value })} placeholder="e.g. wholesale, high-demand, local" style={{ padding: '0.75rem 1rem', fontWeight: 600, borderRadius: '14px' }} />
                            </div>

                            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{editingProduct ? 'Update Product' : 'Add Product'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Movement History Modal */}
            {showHistoryModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(12px)' }}>
                    <div className="glass-panel animate-scale-up" style={{ padding: '2.5rem', width: '100%', maxWidth: '900px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}><History className="text-primary" size={24} /> Movement Logs</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '12px', minWidth: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowHistoryModal(false)}>✕</button>
                        </div>

                        <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--border-color)', borderRadius: '16px', background: 'rgba(0,0,0,0.2)' }}>
                            <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                                    <tr>
                                        <th>Date</th>
                                        <th>Product</th>
                                        <th style={{ textAlign: 'center' }}>Type</th>
                                        <th style={{ textAlign: 'center' }}>Quantity</th>
                                        <th>Source</th>
                                        <th>Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(movementLog || []).map(log => (
                                        <tr key={log.id}>
                                            <td>{new Date(log.date).toLocaleString()}</td>
                                            <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{log.productName}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span className={log.type === 'IN' ? 'badge badge-success' : 'badge badge-danger'}>
                                                    {log.type === 'IN' ? 'ADMISSION' : 'DISPATCH'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 600, color: log.type === 'IN' ? 'var(--success)' : 'var(--danger)', fontSize: '1rem' }}>
                                                {log.type === 'IN' ? '+' : '-'}{log.quantity}
                                            </td>
                                            <td>{log.source || 'SYSTEM'}</td>
                                            <td>{log.reason}</td>
                                        </tr>
                                    ))}
                                    {(movementLog || []).length === 0 && (
                                        <tr><td colSpan="6" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>No movements logged yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Inventory;
