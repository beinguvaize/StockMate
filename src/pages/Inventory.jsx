import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, PackagePlus, AlertCircle, History, Tag as TagIcon, Barcode as BarcodeIcon, X, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import Barcode from 'react-barcode';

const CATEGORIES = ['Electronics', 'Accessories', 'Furniture', 'Clothing', 'Other'];
const UNITS = ['pcs', 'kg', 'ltr', 'box', 'set'];

const Inventory = () => {
    const { products, addProduct, updateProduct, deleteProduct, adjustStock, movementLog, businessProfile, hasPermission } = useAppContext();

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

    const [successStates, setSuccessStates] = useState({});

    const handleAdjust = (productId) => {
        const amt = parseInt(adjustAmounts[productId]) || 0;
        const reason = adjustReasons[productId] || "Inventory Adjustment";
        const source = adjustSources[productId] || (amt > 0 ? "IN-HOUSE" : "SALES");

        if (amt !== 0) {
            adjustStock(productId, amt, reason, source);
            setAdjustAmounts({ ...adjustAmounts, [productId]: '' });
            setAdjustReasons({ ...adjustReasons, [productId]: '' });
            setAdjustSources({ ...adjustSources, [productId]: 'IN-HOUSE' });
            
            // Visual feedback
            setSuccessStates({ ...successStates, [productId]: true });
            setTimeout(() => {
                setSuccessStates(prev => ({ ...prev, [productId]: false }));
            }, 1500);
        }
    };

    return (
        <>
        <div className="animate-fade-in flex flex-col gap-4">
            
            <div className="flex justify-between items-end pb-6 border-b border-black/5 text-ink-primary mb-2">
                <div>
                    <h1 className="text-5xl font-black tracking-tighter text-ink-primary mb-2 uppercase">Inventory.</h1>
                    <p className="text-ink-secondary font-medium uppercase tracking-tight text-[10px] opacity-50">Stock Management & Asset Distribution</p>
                </div>
                <div className="flex gap-6">
                    <button className="px-8 py-4 rounded-pill border border-black/10 font-bold text-ink-primary hover:bg-black/5 transition-all text-xs uppercase cursor-pointer tracking-widest" onClick={() => setShowHistoryModal(true)}>
                        <History size={16} className="inline mr-3 opacity-40" /> History
                    </button>
                    {hasPermission('MANAGE_INVENTORY') && (
                        <button className="btn-signature group" onClick={openAddModal}>
                            ADD PRODUCT
                            <div className="icon-nest">
                                <Plus size={20} className="group-hover:rotate-90 transition-transform duration-500" />
                            </div>
                        </button>
                    )}
                </div>
            </div>

            <div className="glass-panel !p-0 overflow-hidden !rounded-bento border-none shadow-premium">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-canvas border-b border-black/5">
                                <th className="px-4 py-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-80">Product</th>
                                <th className="px-4 py-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-80 hidden md:table-cell">Category</th>
                                <th className="px-4 py-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-80 text-right whitespace-nowrap">Cost / Sell Price</th>
                                <th className="px-4 py-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-80 text-center hidden sm:table-cell whitespace-nowrap">Stock</th>
                                <th className="px-4 py-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-80 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                            {products.map((product, idx) => {
                                const isLow = product.stock > 0 && product.stock <= (businessProfile.lowStockThreshold || 10);
                                const isOut = product.stock <= 0;

                                return (
                                    <tr key={product.id} className="hover:bg-canvas transition-colors group">
                                        <td className="px-4 py-1.5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-surface border border-black/5 shadow-premium flex items-center justify-center text-ink-primary shrink-0 overflow-hidden group-hover:bg-accent-signature group-hover:border-transparent transition-all">
                                                    {product.image ? (
                                                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <PackagePlus size={24} />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-black text-ink-primary uppercase leading-tight mb-1">{product.name}</div>
                                                    <div className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest opacity-40">{product.sku}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-1.5 hidden md:table-cell">
                                            <div className="text-[10px] font-black text-ink-primary uppercase mb-1 tracking-tighter opacity-70">{product.category}</div>
                                            <div className="flex flex-wrap gap-1">
                                                {product.tags && product.tags.map(t => (
                                                    <span key={t} className="px-2 py-0.5 rounded-pill bg-canvas text-[9px] font-black text-ink-primary border border-black/5 uppercase tracking-tighter flex items-center gap-1">
                                                        <TagIcon size={8} className="opacity-40" />
                                                        {t}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-1.5 text-right whitespace-nowrap">
                                            <div className="text-sm font-black tracking-tighter flex items-center justify-end gap-2">
                                                <span className="text-ink-secondary opacity-70">{businessProfile.currencySymbol}{product.costPrice.toFixed(2)}</span>
                                                <span className="opacity-10 text-ink-primary">/</span>
                                                <span className="text-emerald-500">{businessProfile.currencySymbol}{product.sellingPrice.toFixed(2)}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-1.5 text-center hidden sm:table-cell whitespace-nowrap">
                                            <div className={`text-xl font-black tracking-tighter ${isOut ? 'text-red-500' : isLow ? 'text-orange-400' : 'text-ink-primary'}`}>
                                                {product.stock}
                                                <span className="text-sm font-bold text-ink-secondary lowercase opacity-40 ml-1">{product.unit}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-1.5 text-right">
                                            <div className="flex items-center justify-end gap-3 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-500">
                                                {hasPermission('MANAGE_INVENTORY') && (
                                                    <>
                                                        <button 
                                                            onClick={() => openEditModal(product)}
                                                            className="w-10 h-10 rounded-pill bg-surface border border-black/5 flex items-center justify-center shadow-premium hover:bg-ink-primary hover:text-surface transition-all"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                 if (window.confirm(`Delete product ${product.name}?`)) deleteProduct(product.id);
                                                            }}
                                                            className="w-10 h-10 rounded-pill bg-surface border border-red-100 flex items-center justify-center shadow-premium hover:bg-red-500 hover:text-white transition-all text-red-500"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </>
                                                )}
                                                <button 
                                                    onClick={() => handleAdjust(product.id, 1)}
                                                    className="w-12 h-12 rounded-pill bg-accent-signature flex items-center justify-center shadow-premium hover:scale-110 active:scale-95 transition-all"
                                                >
                                                    <Plus size={18} strokeWidth={4} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {products.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="p-20 text-center">
                                        <div className="w-24 h-24 rounded-pill bg-canvas flex items-center justify-center mx-auto mb-6">
                                            <PackagePlus size={40} className="text-ink-primary opacity-10" />
                                        </div>
                                        <div className="text-sm font-black text-ink-primary uppercase tracking-widest">No Products Found</div>
                                        <div className="text-xs font-bold text-ink-secondary uppercase opacity-30 mt-2">Your inventory is empty</div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Add/Edit Product Modal */}
            {/* Add/Edit Product Modal */}
            {showAddModal && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-[700px] !p-5 !py-5">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h1 className="text-5xl font-black text-ink-primary tracking-tighter uppercase leading-none">Add New Product.</h1>
                                <p className="text-[11px] font-black text-ink-secondary uppercase tracking-[0.3em] mt-0.5 opacity-70">Enter product details</p>
                            </div>
                            <button className="w-8 h-8 rounded-pill bg-canvas flex items-center justify-center hover:scale-110 transition-all cursor-pointer text-ink-primary" onClick={() => setShowAddModal(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleAddSubmit} className="grid grid-cols-2 gap-2">
                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1 block opacity-90">Product Name</label>
                                <input required type="text" className="w-full bg-canvas border-none rounded-2xl p-3 font-black text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all text-lg" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. HIGH-FIDELITY UNIT" />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1 block opacity-90">SKU / Barcode</label>
                                <input required type="text" className="w-full bg-canvas border-none rounded-2xl p-3 font-black text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/10" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="Enter SKU" />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1 block opacity-90">Category</label>
                                <select className="w-full bg-canvas border-none rounded-2xl p-3 font-black text-ink-primary outline-none appearance-none cursor-pointer focus:ring-4 focus:ring-accent-signature/10" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            <div className="col-span-2 bg-canvas p-3 rounded-bento border-2 border-dashed border-black/5 flex flex-col items-center justify-center gap-2">
                                {formData.sku ? (
                                    <div className="bg-surface p-2 rounded-2xl shadow-xl">
                                        <Barcode value={formData.sku} height={32} displayValue={true} background="transparent" lineColor="var(--color-ink-primary)" font="Inter" fontSize={11} textMargin={4} width={1.8} />
                                    </div>
                                ) : (
                                    <span className="text-[10px] font-black text-ink-primary/10 uppercase tracking-widest italic">Awaiting SKU...</span>
                                )}
                            </div>

                            <div className="col-span-1 p-3 rounded-bento bg-canvas border border-black/5">
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1 block opacity-90">Cost Price</label>
    <div className="flex items-center gap-2">
        <span className="text-2x font-black text-ink-primary opacity-40">$</span>
        <input required type="number" step="0.01" className="bg-transparent border-none w-full p-0 text-xl font-black text-ink-primary outline-none" value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: e.target.value })} />
    </div>
</div>

                            <div className="col-span-1 p-3 rounded-bento bg-ink-primary shadow-premium">
                                <label className="text-[10px] font-black text-surface uppercase tracking-widest mb-1 block opacity-90">Selling Price</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-2x font-black text-surface opacity-90">$</span>
                                    <input required type="number" step="0.01" className="bg-transparent border-none w-full p-0 text-xl font-black text-accent-signature outline-none" value={formData.sellingPrice} onChange={e => setFormData({ ...formData, sellingPrice: e.target.value })} />
                                </div>
                            </div>

                            <div className="col-span-1">
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1 block opacity-90">Unit</label>
                                <select className="w-full bg-canvas border-none rounded-2xl p-3 font-black text-ink-primary outline-none appearance-none cursor-pointer focus:ring-4 focus:ring-accent-signature/10" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })}>
                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>

                            <div className="col-span-1">
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1 block opacity-90">Initial Stock</label>
                                <input type="number" className="w-full bg-canvas border-none rounded-2xl p-3 font-black text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/10" value={formData.stock} onChange={e => setFormData({ ...formData, stock: e.target.value })} />
                            </div>

                            <div className="col-span-2 grid grid-cols-2 gap-4 mt-4">
                                <button type="button" className="px-6 py-3 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => setShowAddModal(false)}>Cancel</button>
                                <button type="submit" className="btn-signature !h-12 !text-sm flex items-center justify-center px-4 !rounded-pill">
                                    {editingProduct ? 'Save Changes' : 'Add Product'}
                                    <div className="icon-nest !w-8 !h-8 ml-3">
                                        <CheckCircle2 size={20} />
                                    </div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Movement History Modal */}
            {showHistoryModal && (
                <div className="modal-overlay">
                    <div className="glass-modal !p-0 !max-w-[1200px] flex flex-col !rounded-bento overflow-hidden">
                        <div className="p-6 border-b border-black/5 flex justify-between items-center bg-canvas">
                            <div>
                                <h2 className="text-5xl font-black text-ink-primary uppercase tracking-tighter">Stock History.</h2>
                                <p className="text-[10px] font-medium text-ink-secondary tracking-tight uppercase opacity-50">Stock Management & Asset Distribution</p>
                            </div>
                            <button className="w-12 h-12 rounded-pill border border-black/10 flex items-center justify-center hover:bg-ink-primary hover:text-surface transition-all cursor-pointer text-ink-primary" onClick={() => setShowHistoryModal(false)}>
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10 bg-surface">
                                    <tr className="border-b-4 border-black/5">
                                        <th className="pb-3 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-80">Date</th>
                                        <th className="pb-3 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-80">Product</th>
                                        <th className="pb-3 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-80 text-center">Type</th>
                                        <th className="pb-3 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-80 text-center">Quantity</th>
                                        <th className="pb-3 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-80 text-right">Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5">
                                    {(movementLog || []).map(log => (
                                        <tr key={log.id} className="hover:bg-canvas transition-colors">
                                            <td className="py-3 text-[10px] font-black text-ink-primary uppercase opacity-60">{new Date(log.date).toLocaleString()}</td>
                                            <td className="py-3">
                                                <div className="text-base font-black text-ink-primary uppercase tracking-tight">{log.productName}</div>
                                                <div className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-60 mt-1">Source: {log.source || 'INTERNAL'}</div>
                                            </td>
                                            <td className="py-3 text-center">
                                                <span className={`px-4 py-1.5 rounded-pill text-[10px] font-black uppercase tracking-[0.2em] ${log.type === 'IN' ? 'bg-accent-signature/20 text-ink-primary border border-accent-signature/30' : 'bg-red-500 text-white shadow-premium'}`}>
                                                    {log.type === 'IN' ? 'Stock In' : 'Stock Out'}
                                                </span>
                                            </td>
                                            <td className={`py-3 text-center font-black text-2xl tracking-tighter ${log.type === 'IN' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                {log.type === 'IN' ? '+' : '-'}{log.quantity}
                                            </td>
                                            <td className="py-3 text-right text-[11px] font-black text-ink-primary uppercase tracking-tight max-w-[200px] leading-relaxed italic opacity-70">
                                                "{log.reason}"
                                            </td>
                                        </tr>
                                    ))}
                                    {(movementLog || []).length === 0 && (
                                        <tr><td colSpan="5" className="p-40 text-center text-ink-secondary uppercase font-black text-xs tracking-[0.5em] opacity-10">No history found</td></tr>
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
