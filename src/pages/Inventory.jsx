import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, PackagePlus, AlertCircle, History, Tag as TagIcon, Barcode as BarcodeIcon, X } from 'lucide-react';
import Barcode from 'react-barcode';

const CATEGORIES = ['Electronics', 'Accessories', 'Furniture', 'Clothing', 'Other'];
const UNITS = ['pcs', 'kg', 'ltr', 'box', 'set'];

const Inventory = () => {
    const { products, addProduct, updateProduct, deleteProduct, adjustStock, movementLog, businessProfile } = useAppContext();

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
        <>
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
                                <th>Product & SKU</th>
                                <th>Category & Tags</th>
                                <th style={{ textAlign: 'right' }}>Cost</th>
                                <th style={{ textAlign: 'right' }}>Price</th>
                                <th style={{ textAlign: 'center' }}>Tax %</th>
                                <th style={{ textAlign: 'center' }}>Current Stock</th>
                                <th style={{ textAlign: 'right' }}>Quick Adjust</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map(product => {
                                const isLow = product.stock > 0 && product.stock <= (businessProfile.lowStockThreshold || 10);
                                const isOut = product.stock <= 0;

                                return (
                                    <tr key={product.id}>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                                    {product.image ? (
                                                        <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <PackagePlus size={18} strokeWidth={1.5} />
                                                    )}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: '#2563EB', fontSize: '13px', lineHeight: '1.2' }}>{product.name}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '11px', color: '#94A3B8', fontWeight: 500, marginTop: '0.125rem' }}>
                                                        <BarcodeIcon size={12} style={{ color: '#94A3B8' }} /> {product.sku}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem', fontSize: '13px' }}>{product.category}</div>
                                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                                {product.tags && product.tags.map(t => (
                                                    <span key={t} className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '1px 6px', fontSize: '10px' }}>
                                                        <TagIcon size={10} /> {t}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right', padding: '0.75rem' }}>
                                            <div style={{ fontWeight: 500, fontSize: '14px', color: '#1E293B' }}>{businessProfile.currencySymbol}{product.costPrice.toFixed(2)}</div>
                                            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500, marginTop: '0.125rem' }}>per {product.unit}</div>
                                        </td>
                                        <td style={{ textAlign: 'right', padding: '0.75rem' }}>
                                            <div style={{ fontWeight: 600, fontSize: '14px', color: '#1E293B' }}>{businessProfile.currencySymbol}{product.sellingPrice.toFixed(2)}</div>
                                            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500, marginTop: '0.125rem' }}>per {product.unit}</div>
                                        </td>
                                        <td style={{ textAlign: 'center', padding: '0.75rem' }}>
                                            {product.taxRate > 0 ? (
                                                <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '13px' }}>
                                                    {product.taxRate}%
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'center', padding: '0.75rem' }}>
                                            <div style={{ fontSize: '15px', fontWeight: 700, color: isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : '#1E293B', letterSpacing: '-0.01em' }}>
                                                {product.stock}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right', verticalAlign: 'middle', padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'flex-end' }}>
                                                {/* Action Buttons */}
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button 
                                                        className="btn btn-secondary" 
                                                        style={{ padding: '0.4rem 0.75rem', fontSize: '12px', minWidth: 'auto' }}
                                                        onClick={() => openEditModal(product)}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button 
                                                        className="btn btn-secondary" 
                                                        style={{ padding: '0.4rem 0.75rem', fontSize: '12px', minWidth: 'auto', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                                        onClick={() => {
                                                            if (window.confirm(`Are you sure you want to delete ${product.name}?`)) {
                                                                deleteProduct(product.id);
                                                            }
                                                        }}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>

                                                <div style={{ width: '1px', height: '30px', backgroundColor: 'var(--border-color)' }}></div>

                                                {/* Quick Adjust Container */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '220px' }}>
                                                    <div style={{ display: 'flex', width: '100%', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden', background: 'white' }}>
                                                        <select 
                                                            style={{ flex: '0 0 auto', width: '80px', padding: '0.3rem', border: 'none', background: 'transparent', fontSize: '11px', color: '#64748B', outline: 'none' }}
                                                            value={adjustSources[product.id] || 'IN-HOUSE'}
                                                            onChange={(e) => setAdjustSources({ ...adjustSources, [product.id]: e.target.value })}
                                                        >
                                                            <option value="IN-HOUSE">House</option>
                                                            <option value="SUPPLIER">Supplier</option>
                                                            <option value="DAMAGE">Dmg</option>
                                                            <option value="RETURN">Ret</option>
                                                        </select>
                                                        <div style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Note" 
                                                            style={{ flex: '1', padding: '0.3rem 0.5rem', border: 'none', background: 'transparent', outline: 'none', fontSize: '11px' }}
                                                            value={adjustReasons[product.id] || ''}
                                                            onChange={(e) => setAdjustReasons({ ...adjustReasons, [product.id]: e.target.value })}
                                                        />
                                                    </div>
                                                    
                                                    <div style={{ display: 'flex', width: '100%', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden', background: 'white' }}>
                                                        <input 
                                                            type="number" 
                                                            placeholder="+/- Qty" 
                                                            style={{ flex: '1', padding: '0.3rem 0.5rem', border: 'none', background: 'transparent', textAlign: 'center', outline: 'none', fontSize: '11px' }}
                                                            value={adjustAmounts[product.id] || ''}
                                                            onChange={(e) => setAdjustAmounts({ ...adjustAmounts, [product.id]: e.target.value })}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleAdjust(product.id);
                                                            }}
                                                        />
                                                        <div style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                                                        <button 
                                                            style={{ padding: '0 0.5rem', border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer' }}
                                                            onClick={() => handleAdjust(product.id)}
                                                        >
                                                            <Plus size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {products.length === 0 && (
                                <tr>
                                    <td colSpan="7" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No products found in inventory. Add one to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Add/Edit Product Modal */}
            {showAddModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(12px)' }}>
                    <div className="glass-panel animate-scale-up" style={{ padding: '2.5rem', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '24px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '12px', minWidth: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAddModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleAddSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Product Name</label>
                                <input required type="text" className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Ergonomic Office Chair V2" />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>SKU</label>
                                <input required type="text" className="input-field" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="ACC-00124" />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Category</label>
                                <select className="input-field" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px dashed var(--border-color)', alignItems: 'center', justifyContent: 'center' }}>
                                <label style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Barcode Preview</label>
                                {formData.sku ? (
                                    <div style={{ padding: '0.75rem', backgroundColor: 'white', borderRadius: '8px' }}>
                                        <Barcode value={formData.sku} height={50} displayValue={true} background="transparent" lineColor="#0f172a" font="Inter" fontSize={14} textMargin={8} />
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Enter a SKU to preview barcode</div>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Cost Price ({businessProfile.currencySymbol})</label>
                                <input required type="number" step="0.01" min="0" className="input-field" value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: e.target.value })} placeholder="0.00" />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Selling Price ({businessProfile.currencySymbol})</label>
                                <input required type="number" step="0.01" min="0" className="input-field" value={formData.sellingPrice} onChange={e => setFormData({ ...formData, sellingPrice: e.target.value })} placeholder="0.00" />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Unit</label>
                                <select className="input-field" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })}>
                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Tax Rate (%)</label>
                                <input type="number" step="0.1" min="0" max="100" className="input-field" value={formData.taxRate} onChange={e => setFormData({ ...formData, taxRate: e.target.value })} placeholder="0" />
                            </div>

                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Tags</label>
                                <input type="text" className="input-field" value={formData.tags} onChange={e => setFormData({ ...formData, tags: e.target.value })} placeholder="e.g. wholesale, high-demand, local" />
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

        </>
    );
};

export default Inventory;
