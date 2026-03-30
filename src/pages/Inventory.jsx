import React, { useState, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { uploadProductImage } from '../lib/supabase';
import { Plus, PackagePlus, AlertCircle, History, Tag as TagIcon, Barcode as BarcodeIcon, X, CheckCircle2, Pencil, Trash2, ImagePlus, Upload, Percent } from 'lucide-react';
import Barcode from 'react-barcode';

const CATEGORIES = ['Electronics', 'Accessories', 'Furniture', 'Clothing', 'Other'];
const UNITS = ['pcs', 'kg', 'ltr', 'box', 'set'];

const TAX_SLABS = [
    { label: 'Exempt', rate: 0, description: 'Tax-free' },
    { label: 'VAT 5%', rate: 5, description: 'UAE Standard VAT' },
    { label: 'GST 12%', rate: 12, description: 'India GST Slab' },
    { label: 'GST 18%', rate: 18, description: 'India GST Slab' },
    { label: 'GST 28%', rate: 28, description: 'India GST Slab' },
    { label: 'Custom', rate: null, description: 'Custom rate' },
];

const Inventory = () => {
    const { products, purchases, addProduct, updateProduct, deleteProduct, adjustStock, movementLog, businessProfile, hasPermission } = useAppContext();

    const [showAddModal, setShowAddModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [adjustAmounts, setAdjustAmounts] = useState({});
    const [adjustReasons, setAdjustReasons] = useState({});
    const [adjustSources, setAdjustSources] = useState({});
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const [formData, setFormData] = useState({
        name: '', sku: '', category: CATEGORIES[0], unit: UNITS[0],
        costPrice: '', sellingPrice: '', stock: '', taxRate: '', taxSlab: 'Exempt', tags: '', image: '',
        lowStockThreshold: 10
    });

    const openAddModal = () => {
        setEditingProduct(null);
        setFormData({ name: '', sku: '', category: CATEGORIES[0], unit: UNITS[0], costPrice: '', sellingPrice: '', stock: '', taxRate: 0, taxSlab: 'Exempt', tags: '', image: '', lowStockThreshold: 10 });
        setImageFile(null);
        setImagePreview(null);
        setShowAddModal(true);
    };

    const openEditModal = (p) => {
        setEditingProduct(p);
        setFormData({
            ...p,
            taxRate: p.taxRate || 0,
            taxSlab: p.taxSlab || (TAX_SLABS.find(s => s.rate === (p.taxRate || 0))?.label) || 'Custom',
            tags: p.tags ? p.tags.join(', ') : '',
            image: p.image || '',
            lowStockThreshold: p.lowStockThreshold || 10
        });
        setImageFile(null);
        setImagePreview(p.image || null);
        setShowAddModal(true);
    };

    const handleImageSelect = (file) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be under 5MB');
            return;
        }
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }
        setImageFile(file);
        const reader = new FileReader();
        reader.onload = (e) => setImagePreview(e.target.result);
        reader.readAsDataURL(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files?.[0];
        if (file) handleImageSelect(file);
    };

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.sellingPrice || !formData.costPrice || !formData.sku) return;

        setUploading(true);

        let imageUrl = formData.image || '';

        // Upload new image if one was selected
        if (imageFile) {
            const { url, error } = await uploadProductImage(imageFile);
            if (error) {
                console.error("Image upload failed:", error);
                // Non-blocking: alert the user but continue saving the product
                alert(`Image upload failed: ${error}. The product will be saved without an image.`);
            } else {
                imageUrl = url;
            }
        }

        const parsedData = {
            ...formData,
            image: imageUrl,
            costPrice: parseFloat(formData.costPrice) || 0,
            sellingPrice: parseFloat(formData.sellingPrice) || 0,
            stock: parseInt(formData.stock) || 0,
            lowStockThreshold: parseInt(formData.lowStockThreshold) || 10,
            taxRate: parseFloat(formData.taxRate) || 0,
            tags: formData.tags.split(',').map(t => t.trim()).filter(t => t)
        };

        if (editingProduct) {
            updateProduct({ ...parsedData, id: editingProduct.id });
        } else {
            addProduct(parsedData);
        }

        setUploading(false);
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
    const lowStockCount = products.filter(p => p.stock > 0 && p.stock <= (p.lowStockThreshold || businessProfile.lowStockThreshold || 10)).length;

    return (
        <>
        <div className="animate-fade-in flex flex-col gap-4">
            
            <div className="flex justify-between items-end pb-6 border-b border-black/5 text-ink-primary mb-2">
                <div>
                    <h1 className="text-4xl md:text-7xl font-black tracking-tighter text-ink-primary mb-2 uppercase leading-[0.8]">INVENTORY<span className="text-accent-signature">.</span></h1>
                    <p className="text-ink-secondary font-black uppercase tracking-[0.4em] text-[10px] opacity-50">Stock Intelligence & Asset Logistics</p>
                </div>
                <div className="flex gap-6 items-center">
                    {lowStockCount > 0 && (
                        <div className="flex items-center gap-3 px-6 py-3 bg-red-500 rounded-full border border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.25)] animate-pulse">
                            <AlertCircle size={16} className="text-white" />
                            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{lowStockCount} LOW STOCK ALERTS</span>
                        </div>
                    )}
                    <button className="px-8 py-4 rounded-pill border border-black/10 font-bold text-ink-primary hover:bg-black/5 transition-all text-xs uppercase cursor-pointer tracking-widest" onClick={() => setShowHistoryModal(true)}>
                        <History size={16} className="inline mr-3 opacity-70" /> History
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
                                <th className="px-4 py-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-80 text-center hidden lg:table-cell whitespace-nowrap">Last Purchased</th>
                                <th className="px-4 py-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-80 text-center hidden sm:table-cell whitespace-nowrap">Stock</th>
                                <th className="px-4 py-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-80 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                            {products.map((product, idx) => {
                                const threshold = product.lowStockThreshold || businessProfile.lowStockThreshold || 10;
                                const isLow = product.stock > 0 && product.stock <= threshold;
                                const isOut = product.stock <= 0;

                                return (
                                    <tr key={product.id} className="hover:bg-canvas transition-colors group">
                                        <td className="px-4 py-1.5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-2xl bg-white border border-black/5 shadow-premium flex items-center justify-center text-ink-primary shrink-0 overflow-hidden group-hover:bg-accent-signature group-hover:border-transparent group-hover:scale-110 transition-all duration-500">
                                                    {product.image ? (
                                                        <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform group-hover:scale-125" />
                                                    ) : (
                                                        <PackagePlus size={28} className="opacity-20 group-hover:opacity-100" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-black text-ink-primary uppercase leading-tight mb-1">{product.name}</div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest opacity-70">{product.sku}</span>
                                                        {(product.taxSlab && product.taxSlab !== 'Exempt' || product.taxRate > 0) && (
                                                            <span className="px-2 py-0.5 bg-amber-50 rounded-pill text-[7px] font-black uppercase tracking-widest text-amber-700 border border-amber-200 flex items-center gap-1">
                                                                <Percent size={8} />
                                                                {product.taxSlab || `${product.taxRate}%`}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-1.5 hidden md:table-cell">
                                            <div className="text-[10px] font-black text-ink-primary uppercase mb-1 tracking-tighter opacity-70">{product.category}</div>
                                            <div className="flex flex-wrap gap-1">
                                                {product.tags && product.tags.map(t => (
                                                    <span key={t} className="px-2 py-0.5 rounded-pill bg-canvas text-[9px] font-black text-ink-primary border border-black/5 uppercase tracking-tighter flex items-center gap-1">
                                                        <TagIcon size={8} className="opacity-70" />
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
                                        <td className="px-4 py-1.5 text-center hidden lg:table-cell whitespace-nowrap">
                                            {(() => {
                                                const lastPurchase = purchases
                                                    ?.filter(p => p.linked_product_id === product.id)
                                                    ?.sort((a,b) => new Date(b.date) - new Date(a.date))[0];
                                                
                                                if (!lastPurchase) return <span className="text-[10px] uppercase font-bold text-ink-secondary opacity-40 italic mt-1 block">Never</span>;
                                                return (
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-sm font-black text-ink-primary tracking-tighter">{lastPurchase.quantity} {product.unit}</span>
                                                        <span className="text-[9px] font-bold text-ink-secondary uppercase tracking-widest opacity-70 mt-0.5">{new Date(lastPurchase.date).toLocaleDateString()}</span>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-1.5 text-center hidden sm:table-cell whitespace-nowrap">
                                            <div className={`text-xl font-black tracking-tighter ${isOut ? 'text-red-500' : isLow ? 'text-orange-400' : 'text-ink-primary'}`}>
                                                {product.stock}
                                                <span className="text-sm font-bold text-ink-secondary lowercase opacity-70 ml-1">{product.unit}</span>
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
                                    <td colSpan="6" className="p-20 text-center">
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
            {showAddModal && (
                <div className="modal-overlay">
                    <div className="glass-modal">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-1">
                                    {editingProduct ? 'EDIT PRODUCT.' : 'NEW PRODUCT.'}
                                </h2>
                                <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.3em] opacity-80">
                                    CONFIGURE INVENTORY ASSET DETAILS
                                </p>
                            </div>
                            <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary" onClick={() => setShowAddModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleAddSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1.5 block opacity-60">Product Name</label>
                                <input required type="text" className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all text-lg" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. HIGH-FIDELITY UNIT" />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1.5 block opacity-60">SKU / Barcode</label>
                                <input required type="text" className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/10 transition-all" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="Enter SKU" />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1.5 block opacity-60">Category</label>
                                <select className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-ink-primary outline-none appearance-none cursor-pointer focus:ring-4 focus:ring-accent-signature/10 transition-all" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {/* Product Image Upload */}
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1.5 block opacity-60">Product Image</label>
                                <div
                                    className="bg-canvas p-4 rounded-bento border-2 border-dashed border-black/10 hover:border-accent-signature/40 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 min-h-[140px] relative group"
                                    onClick={() => fileInputRef.current?.click()}
                                    onDrop={handleDrop}
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handleImageSelect(e.target.files?.[0])}
                                    />
                                    {imagePreview ? (
                                        <div className="flex items-center gap-6">
                                            <div className="w-24 h-24 rounded-2xl overflow-hidden border border-black/10 shadow-premium shrink-0">
                                                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex flex-col items-start gap-2">
                                                <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Image Selected</span>
                                                <span className="text-[9px] font-bold text-ink-secondary uppercase tracking-widest opacity-70">
                                                    {imageFile ? `${(imageFile.size / 1024).toFixed(0)} KB — ${imageFile.name}` : 'Current image'}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="text-[9px] font-black uppercase tracking-widest text-red-500 hover:text-red-700 transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setImageFile(null);
                                                        setImagePreview(null);
                                                        setFormData({...formData, image: ''});
                                                    }}
                                                >
                                                    Remove Image
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="w-14 h-14 rounded-2xl bg-surface border border-black/5 flex items-center justify-center text-ink-primary/20 group-hover:text-accent-signature/60 transition-colors">
                                                <ImagePlus size={28} />
                                            </div>
                                            <span className="text-[10px] font-black text-ink-primary/30 uppercase tracking-widest group-hover:text-ink-primary/60 transition-colors">Click or drag to upload image</span>
                                            <span className="text-[8px] font-bold text-ink-secondary/20 uppercase tracking-widest">PNG, JPG, WebP — Max 5MB</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Barcode Preview */}
                            <div className="md:col-span-2 bg-canvas p-4 rounded-bento border-2 border-dashed border-black/5 flex flex-col items-center justify-center gap-2">
                                {formData.sku ? (
                                    <div className="bg-surface p-3 rounded-2xl shadow-premium">
                                        <Barcode value={formData.sku} height={32} displayValue={true} background="transparent" lineColor="var(--color-ink-primary)" font="Inter" fontSize={11} textMargin={4} width={1.8} />
                                    </div>
                                ) : (
                                    <span className="text-[10px] font-black text-ink-primary/10 uppercase tracking-widest italic">Awaiting SKU...</span>
                                )}
                            </div>

                            <div className="col-span-1 p-4 rounded-bento bg-canvas border border-black/5">
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1.5 block opacity-60">Cost Price</label>
    <div className="flex items-center gap-3">
        <span className="text-xl font-black text-ink-primary opacity-70">$</span>
        <input required type="number" step="0.01" className="bg-transparent border-none w-full p-0 text-2xl font-black text-ink-primary outline-none" value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: e.target.value })} />
    </div>
</div>

                            <div className="col-span-1 p-4 rounded-bento bg-accent-signature/10 border border-accent-signature/20">
                                <label className="text-[10px] font-black text-ink-primary uppercase tracking-widest mb-1.5 block opacity-60">Selling Price</label>
                                <div className="flex items-center gap-3">
                                    <span className="text-xl font-black text-ink-primary opacity-70">$</span>
                                    <input required type="number" step="0.01" className="bg-transparent border-none w-full p-0 text-2xl font-black text-ink-primary outline-none" value={formData.sellingPrice} onChange={e => setFormData({ ...formData, sellingPrice: e.target.value })} />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1.5 block opacity-60">Unit</label>
                                <select className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-ink-primary outline-none appearance-none cursor-pointer focus:ring-4 focus:ring-accent-signature/10 transition-all" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })}>
                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1.5 block opacity-60">Initial Stock</label>
                                <input type="number" className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/10 transition-all" value={formData.stock} onChange={e => setFormData({ ...formData, stock: e.target.value })} />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-1.5 block opacity-60">Low Stock Alert Threshold</label>
                                <input type="number" className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/10 transition-all" value={formData.lowStockThreshold} onChange={e => setFormData({ ...formData, lowStockThreshold: e.target.value })} />
                            </div>

                            {/* Tax Slab Selector */}
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-2 block opacity-60">Tax Slab</label>
                                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                    {TAX_SLABS.map(slab => (
                                        <button
                                            key={slab.label}
                                            type="button"
                                            className={`py-3 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border flex flex-col items-center gap-1 ${
                                                formData.taxSlab === slab.label
                                                    ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20'
                                                    : 'bg-canvas text-ink-primary border-black/5 hover:border-amber-300'
                                            }`}
                                            onClick={() => {
                                                const rate = slab.rate !== null ? slab.rate : formData.taxRate;
                                                setFormData({ ...formData, taxSlab: slab.label, taxRate: rate });
                                            }}
                                        >
                                            <span className="text-sm font-black leading-none">{slab.rate !== null ? `${slab.rate}%` : '?%'}</span>
                                            <span className="opacity-70 leading-none">{slab.label}</span>
                                        </button>
                                    ))}
                                </div>
                                {formData.taxSlab === 'Custom' && (
                                    <div className="mt-3 flex items-center gap-3">
                                        <Percent size={16} className="text-amber-500 shrink-0" />
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="100"
                                            placeholder="Enter custom rate..."
                                            className="flex-1 bg-canvas border border-amber-200 rounded-xl p-3 font-black text-ink-primary text-sm outline-none focus:ring-4 focus:ring-amber-500/20 transition-all"
                                            value={formData.taxRate}
                                            onChange={e => setFormData({ ...formData, taxRate: e.target.value })}
                                        />
                                        <span className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-70">%</span>
                                    </div>
                                )}
                            </div>

                            <div className="md:col-span-2 grid grid-cols-2 gap-4 mt-4">
                                <button type="button" className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => setShowAddModal(false)}>Cancel</button>
                                <button type="submit" disabled={uploading} className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill disabled:opacity-70 disabled:cursor-not-allowed">
                                    {uploading ? 'Uploading...' : (editingProduct ? 'Save Changes' : 'Add Product')}
                                    <div className="icon-nest !w-10 !h-10 ml-4">
                                        {uploading ? <Upload size={22} className="animate-pulse" /> : <CheckCircle2 size={22} />}
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
                        <div className="p-5 border-b border-black/5 flex justify-between items-center bg-canvas">
                            <div>
                                <h1 className="text-5xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">MOVEMENT LOG.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-70">STOCK MANAGEMENT & LOGISTICS HISTORY</p>
                            </div>
                            <button className="w-12 h-12 rounded-pill border border-black/10 flex items-center justify-center hover:bg-ink-primary hover:text-surface transition-all cursor-pointer text-ink-primary" onClick={() => setShowHistoryModal(false)}>
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                            <div className="overflow-x-auto no-scrollbar">
                                <table className="w-full text-left border-collapse min-w-[800px]">
                                    <thead className="sticky top-0 z-10 bg-surface">
                                        <tr className="border-b-4 border-black/5">
                                            <th className="pb-4 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70">Date</th>
                                            <th className="pb-4 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70">Product</th>
                                            <th className="pb-4 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70 text-center">Type</th>
                                            <th className="pb-4 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70 text-center">Quantity</th>
                                            <th className="pb-4 text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70 text-right">Reason</th>
                                        </tr>
                                    </thead>
                                <tbody className="divide-y divide-black/5">
                                    {(movementLog || []).map(log => (
                                        <tr key={log.id} className="hover:bg-canvas transition-colors">
                                            <td className="py-3 text-[10px] font-black text-ink-primary uppercase opacity-60">{log.date ? new Date(log.date).toLocaleString() : 'N/A'}</td>
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
                </div>
            )}

        </>
    );
};

export default Inventory;
