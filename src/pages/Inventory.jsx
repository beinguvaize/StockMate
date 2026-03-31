import React, { useState, useRef, useEffect} from 'react';
import { useAppContext} from '../context/AppContext';
import { uploadProductImage} from '../lib/supabase';
import { Plus, PackagePlus, AlertCircle, History, Tag as TagIcon, Barcode as BarcodeIcon, X, CheckCircle2, Pencil, Trash2, ImagePlus, Upload, Percent} from 'lucide-react';
import Barcode from 'react-barcode';

const UNITS = ['pcs', 'kg', 'ltr', 'box', 'set'];

const TAX_SLABS = [
 { label: 'Exempt', rate: 0, description: 'Tax-free'},
 { label: 'VAT 5%', rate: 5, description: 'UAE Standard VAT'},
 { label: 'GST 12%', rate: 12, description: 'India GST Slab'},
 { label: 'GST 18%', rate: 18, description: 'India GST Slab'},
 { label: 'GST 28%', rate: 28, description: 'India GST Slab'},
 { label: 'Custom', rate: null, description: 'Custom rate'},
];

const Inventory = () => {
  const { 
    products, purchases, addProduct, updateProduct, deleteProduct, adjustStock, movementLog, businessProfile, hasPermission,
    productCategories, addProductCategory, updateProductCategory, deleteProductCategory
  } = useAppContext();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
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
    name: '', sku: '', category: productCategories[0]?.name || 'Other', unit: UNITS[0],
    costPrice: '', sellingPrice: '', stock: '', taxRate: 0, taxSlab: 'Exempt', tags: '', image: '',
    lowStockThreshold: 10
  });

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({ 
      name: '', sku: '', category: productCategories[0]?.name || 'Other', unit: UNITS[0], 
      costPrice: '', sellingPrice: '', stock: '', taxRate: 0, taxSlab: 'Exempt', tags: '', image: '', lowStockThreshold: 10
    });
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

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.sellingPrice || !formData.costPrice || !formData.sku) return;

    setUploading(true);

    let imageUrl = formData.image || '';

    if (imageFile) {
      const { url, error} = await uploadProductImage(imageFile);
      if (error) {
        console.error("Image upload failed:", error);
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
      tags: typeof formData.tags === 'string' ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : formData.tags
    };

    if (editingProduct) {
      updateProduct({ ...parsedData, id: editingProduct.id});
    } else {
      addProduct(parsedData);
    }

    setUploading(false);
    setShowAddModal(false);
    setEditingProduct(null);
  };

  const [successStates, setSuccessStates] = useState({});

  const handleAdjust = (productId, amount) => {
    const amt = amount || parseInt(adjustAmounts[productId]) || 0;
    const reason = adjustReasons[productId] || "Inventory Adjustment";
    const source = adjustSources[productId] || (amt > 0 ? "IN-HOUSE" : "SALES");

    if (amt !== 0) {
      adjustStock(productId, amt, reason, source);
      setAdjustAmounts({ ...adjustAmounts, [productId]: ''});
      setAdjustReasons({ ...adjustReasons, [productId]: ''});
      setAdjustSources({ ...adjustSources, [productId]: 'IN-HOUSE'});
      
      setSuccessStates({ ...successStates, [productId]: true});
      setTimeout(() => {
        setSuccessStates(prev => ({ ...prev, [productId]: false}));
      }, 1500);
    }
  };

  const lowStockCount = products.filter(p => p.stock > 0 && p.stock <= (p.lowStockThreshold || businessProfile.lowStockThreshold || 10)).length;

  useEffect(() => {
    if (showAddModal || showHistoryModal || showCategoryManager) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset';};
  }, [showAddModal, showHistoryModal, showCategoryManager]);

  return (
    <>
      <div className="animate-fade-in flex flex-col gap-4">
        
        <div className="flex justify-between items-end pb-6 border-b border-black/5 text-ink-primary mb-2">
          <div>
            <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">INVENTORY<span className="text-accent-signature">.</span></h1>
            <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">Stock Intelligence & Asset Logistics</p>
          </div>
          <div className="flex gap-4 items-center">
            {lowStockCount > 0 && (
              <div className="flex items-center gap-3 px-6 py-3 bg-red-500 rounded-full border border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.25)] animate-pulse">
                <AlertCircle size={16} className="text-white" />
                <span className="text-[10px] font-semibold text-white">{lowStockCount} LOW STOCK ALERTS</span>
              </div>
            )}
            <button className="px-8 h-[56px] rounded-pill border border-black/10 font-[800] text-[0.95rem] text-ink-primary hover:bg-black/5 transition-all flex items-center justify-center cursor-pointer" onClick={() => setShowHistoryModal(true)}>
              <History size={18} className="mr-3 opacity-70" /> History
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

        {/* Premium KPI Ribbons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
            <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-ink-primary">
              <PackagePlus size={40} strokeWidth={2} />
            </div>
            <div className="relative z-10 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Master SKU Index</span>
              <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
                {products.length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">ITEMS</span>
              </div>
            </div>
          </div>

          <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
            <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-red-500">
              <AlertCircle size={40} strokeWidth={2} />
            </div>
            <div className="relative z-10 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Inventory Health Alerts</span>
              <div className="text-3xl font-black text-red-500 tabular-nums tracking-tight leading-none mt-0.5">
                {lowStockCount} <span className="text-sm font-bold opacity-30 text-red-500 tracking-wider ml-1">CRITICAL</span>
              </div>
            </div>
          </div>
          
          <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
            <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-accent-signature">
              <TagIcon size={40} strokeWidth={2} />
            </div>
            <div className="relative z-10 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Aggregate Market Valuation</span>
              <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
                <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile?.currencySymbol || '₹'}</span>
                {Math.round(products.reduce((acc, p) => acc + (p.stock > 0 ? p.stock * p.sellingPrice : 0), 0)).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel !p-0 overflow-hidden !rounded-bento border-none shadow-premium">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas border-b border-black/5">
                  <th className="px-4 py-2 text-sm font-semibold text-gray-700 opacity-80">Product</th>
                  <th className="px-4 py-2 text-sm font-semibold text-gray-700 opacity-80 hidden md:table-cell">Category</th>
                  <th className="px-4 py-2 text-sm font-semibold text-gray-700 opacity-80 text-right whitespace-nowrap">Cost / Sell Price</th>
                  <th className="px-4 py-2 text-sm font-semibold text-gray-700 opacity-80 text-center hidden lg:table-cell whitespace-nowrap">Last Purchased</th>
                  <th className="px-4 py-2 text-sm font-semibold text-gray-700 opacity-80 text-center hidden sm:table-cell whitespace-nowrap">Stock</th>
                  <th className="px-4 py-2 text-sm font-semibold text-gray-700 opacity-80 text-right">Actions</th>
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
                          <div className="w-14 h-14 rounded-lg bg-white border border-black/5 shadow-premium flex items-center justify-center text-ink-primary shrink-0 overflow-hidden group-hover:bg-accent-signature group-hover:border-transparent group-hover:scale-110 transition-all duration-500">
                            {product.image ? (
                              <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform group-hover:scale-125" />
                            ) : (
                              <PackagePlus size={28} className="opacity-20 group-hover:opacity-100" />
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-ink-primary leading-tight mb-1">{product.name}</div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold text-gray-700 opacity-70">{product.sku}</span>
                              {(product.taxSlab && product.taxSlab !== 'Exempt' || product.taxRate > 0) && (
                                <span className="px-2 py-0.5 bg-amber-50 rounded-pill text-[7px] font-semibold text-amber-700 border border-amber-200 flex items-center gap-1">
                                  <Percent size={8} />
                                  {product.taxSlab || `${product.taxRate}%`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-1.5 hidden md:table-cell">
                        <div className="text-sm font-semibold text-ink-primary mb-1 opacity-70">{product.category}</div>
                        <div className="flex flex-wrap gap-1">
                          {product.tags && product.tags.map(t => (
                            <span key={t} className="px-2 py-0.5 rounded-pill bg-canvas text-[9px] font-semibold text-ink-primary border border-black/5 flex items-center gap-1">
                              <TagIcon size={8} className="opacity-70" />
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">
                        <div className="text-sm font-semibold flex items-center justify-end gap-2">
                          <span className="text-gray-700 opacity-70">{businessProfile.currencySymbol}{product.costPrice.toFixed(2)}</span>
                          <span className="opacity-10 text-ink-primary">/</span>
                          <span className="text-emerald-500">{businessProfile.currencySymbol}{product.sellingPrice.toFixed(2)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-1.5 text-center hidden lg:table-cell whitespace-nowrap">
                        {(() => {
                          const lastPurchase = purchases
                            ?.filter(p => p.linked_product_id === product.id)
                            ?.sort((a,b) => new Date(b.date) - new Date(a.date))[0];
                          
                          if (!lastPurchase) return <span className="text-[10px] font-bold text-gray-700 opacity-70 italic mt-1 block">Never</span>;
                          return (
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-semibold text-ink-primary">{lastPurchase.quantity} {product.unit}</span>
                              <span className="text-[9px] font-bold text-gray-700 opacity-70 mt-0.5">{new Date(lastPurchase.date).toLocaleDateString()}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-1.5 text-center hidden sm:table-cell whitespace-nowrap">
                        <div className={`text-xl font-semibold ${isOut ? 'text-red-500' : isLow ? 'text-orange-400' : 'text-ink-primary'}`}>
                          {product.stock}
                          <span className="text-sm font-bold text-gray-700 lowercase opacity-70 ml-1">{product.unit}</span>
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
                      <div className="text-sm font-semibold text-ink-primary">No Products Found</div>
                      <div className="text-xs font-bold text-gray-700 opacity-60 mt-2">Your inventory is empty</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Product Modal */}
      {(showAddModal || editingProduct) && (
        <div className="modal-overlay">
          <div className="glass-modal !max-w-2xl">
            <div className="flex justify-between items-start mb-3 border-b border-black/5 pb-3">
              <div>
                <h1 className="text-xl font-semibold text-ink-primary leading-none mb-1">
                  {editingProduct ? 'EDIT ASSET' : 'NEW ASSET'}.
                </h1>
                <p className="text-[9px] font-semibold text-gray-700 opacity-60">
                  {editingProduct ? 'Modify existing catalog entry' : 'Register new inventory asset'}
                </p>
              </div>
              <button 
                onClick={() => { setShowAddModal(false); setEditingProduct(null);}}
                className="w-7 h-7 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 mt-2">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                {/* Line 1: Name (4) + Category (2) */}
                <div className="md:col-span-4">
                  <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Asset Name</label>
                  <input required type="text" className="w-full bg-canvas border-none rounded-lg p-2.5 font-medium text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" placeholder="PRODUCT NAME..." value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                  <div className="flex justify-between items-center mb-0.5 ml-1">
                    <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85]">Category</label>
                    <button 
                      type="button"
                      onClick={() => setShowCategoryManager(true)}
                      className="text-[9px] font-bold text-accent-signature hover:underline flex items-center gap-1"
                    >
                      <Pencil size={8} /> EDIT
                    </button>
                  </div>
                  <select 
                    className="w-full bg-canvas border-none rounded-lg p-2.5 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all appearance-none" 
                    value={formData.category} 
                    onChange={e => setFormData({ ...formData, category: e.target.value})}
                  >
                    {productCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    {productCategories.length === 0 && <option value="Other">Other</option>}
                  </select>
                </div>

                {/* Line 2: SKU (2) + Cost (1) + Retail (1) + Unit (2) */}
                <div className="md:col-span-2">
                  <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">SKU Barcode</label>
                  <input required type="text" className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" placeholder="SKU-XXXX" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value})} />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Cost</label>
                  <input required type="number" step="0.01" className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: e.target.value})} />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Retail</label>
                  <input required type="number" step="0.01" className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" value={formData.sellingPrice} onChange={e => setFormData({ ...formData, sellingPrice: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Unit</label>
                  <select className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all appearance-none" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value})}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>

                {/* Line 3: Stock (3) + Alert (3) */}
                <div className="md:col-span-3">
                  <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Initial Stock</label>
                  <input required type="number" className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" value={formData.stock} onChange={e => setFormData({ ...formData, stock: e.target.value})} disabled={!!editingProduct} />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Low Stock Alert</label>
                  <input type="number" className="w-full bg-canvas border-none rounded-lg p-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" value={formData.lowStockThreshold} onChange={e => setFormData({ ...formData, lowStockThreshold: e.target.value})} />
                </div>

                {/* Line 4: Image Preview (3) + Tax Slabs (3) */}
                <div className="md:col-span-3">
                  <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Visual Asset</label>
                  <div 
                    className="relative h-16 bg-canvas border-2 border-dashed border-black/5 rounded-lg flex items-center justify-center cursor-pointer hover:bg-black/5 transition-all overflow-hidden"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {imagePreview ? (
                      <img src={imagePreview} className="w-full h-full object-cover" alt="Preview" />
                    ) : (
                      <div className="flex items-center gap-2 opacity-60">
                        <ImagePlus size={14} />
                        <span className="text-[8px] font-semibold">Select Image</span>
                      </div>
                    )}
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageChange} />
                  </div>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[9px] font-semibold text-gray-700 opacity-[0.85] mb-0.5 ml-1">Taxation Compliance</label>
                  <div className="grid grid-cols-3 gap-1.5 h-auto content-start">
                    {TAX_SLABS.map(slab => (
                      <button
                        key={slab.label}
                        type="button"
                        className={`p-1 rounded-lg text-[8px] font-semibold transition-all border flex flex-col items-center justify-center gap-0 ${
                          formData.taxSlab === slab.label
                            ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/10'
                            : 'bg-canvas text-ink-primary border-black/5 hover:border-amber-300'
                        }`}
                        onClick={() => {
                          const rate = slab.rate !== null ? slab.rate : formData.taxRate;
                          setFormData({ ...formData, taxSlab: slab.label, taxRate: rate});
                        }}
                      >
                        <span className="text-[9px] leading-none mb-0.5 font-bold">
                          {slab.rate !== null ? `${slab.rate}%` : (formData.taxSlab === 'Custom' ? `${formData.taxRate}%` : '?%')}
                        </span>
                        <span className="opacity-60 leading-none text-[7px]">{slab.label}</span>
                      </button>
                    ))}

                    {formData.taxSlab === 'Custom' && (
                      <div className="col-span-3 mt-1.5 animate-in fade-in slide-in-from-top-1 duration-300">
                        <div className="relative">
                          <input 
                            autoFocus
                            type="number" 
                            step="0.01"
                            className="w-full bg-white border border-amber-500/30 rounded-lg px-3 py-1.5 text-[10px] font-bold text-ink-primary outline-none focus:ring-2 focus:ring-amber-500/20 transition-all pr-8"
                            placeholder="ENTER RATE..."
                            value={formData.taxRate}
                            onChange={e => setFormData({ ...formData, taxRate: e.target.value })}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black opacity-30">%</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button type="submit" disabled={uploading} className="w-full btn-signature !h-10 !text-xs flex items-center justify-center !rounded-pill mt-1">
                {uploading ? 'UPLOADING...' : editingProduct ? 'UPDATE REQUISITION' : 'INITIALIZE ASSET'}
                <CheckCircle2 size={16} className="ml-2" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Movement History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay">
          <div className="bg-white border border-black/5 !rounded-[2rem] w-full max-w-[1000px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden m-auto">
            <div className="px-8 py-6 border-b border-black/5 flex justify-between items-center bg-gray-50/30">
              <div>
                <h2 className="text-2xl font-black text-ink-primary tracking-tight">Movement History</h2>
                <p className="text-[11px] font-bold text-gray-400 mt-1 uppercase tracking-widest">Inventory Logistics Log</p>
              </div>
              <button className="w-10 h-10 rounded-full bg-white border border-black/5 hover:border-black/10 flex items-center justify-center text-gray-500 hover:text-ink-primary hover:shadow-sm transition-all" onClick={() => setShowHistoryModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto w-full no-scrollbar px-8 bg-white">
              <div className="overflow-x-auto no-scrollbar pb-8 pt-4">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr>
                      <th className="pb-4 pt-2 border-b border-black/5 text-xs font-bold text-gray-400 uppercase tracking-wider w-[180px]">Date</th>
                      <th className="pb-4 pt-2 border-b border-black/5 text-xs font-bold text-gray-400 uppercase tracking-wider">Product / Source</th>
                      <th className="pb-4 pt-2 border-b border-black/5 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Type</th>
                      <th className="pb-4 pt-2 border-b border-black/5 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Qty</th>
                      <th className="pb-4 pt-2 border-b border-black/5 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {(movementLog || []).map(log => (
                      <tr key={log.id} className="group hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 text-sm font-semibold text-gray-500 tabular-nums">
                          {log.date ? new Date(log.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                        </td>
                        <td className="py-4">
                          <div className="text-base font-bold text-ink-primary">{log.productName}</div>
                          <div className="text-xs font-semibold text-gray-400 mt-0.5">{log.source || 'INTERNAL'}</div>
                        </td>
                        <td className="py-4 text-center">
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${log.type === 'IN' ? 'bg-green-100/50 text-green-700' : 'bg-red-100/50 text-red-700'}`}>
                            {log.type === 'IN' ? 'Restock' : 'Dispatch'}
                          </span>
                        </td>
                        <td className={`py-4 text-center font-black text-xl tabular-nums ${log.type === 'IN' ? 'text-green-600' : 'text-red-500'}`}>
                          {log.type === 'IN' ? '+' : '-'}{log.quantity}
                        </td>
                        <td className="py-4 text-right text-sm font-medium text-gray-500 italic max-w-[200px] truncate">
                          {log.reason}
                        </td>
                      </tr>
                    ))}
                    {(movementLog || []).length === 0 && (
                      <tr><td colSpan="5" className="py-24 text-center text-gray-400 font-bold text-sm">No transaction history found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {showCategoryManager && (
        <div className="modal-overlay">
          <div className="glass-modal !max-w-md">
            <div className="flex justify-between items-start mb-4 border-b border-black/5 pb-3">
              <div>
                <h1 className="text-xl font-semibold text-ink-primary leading-none mb-1 uppercase tracking-tight">CATEGORY ASSET MANAGEMENT.</h1>
                <p className="text-[9px] font-semibold text-gray-700 opacity-60 uppercase tracking-widest">Configure inventory classification levels</p>
              </div>
              <button 
                onClick={() => { setShowCategoryManager(false); setEditingCategory(null); setNewCategoryName(''); }}
                className="w-7 h-7 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-canvas rounded-xl border border-black/5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Initialize New Category</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="flex-1 bg-white border border-black/5 rounded-lg px-3 py-2 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all"
                    placeholder="Category Label..."
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                  />
                  <button 
                    onClick={async () => {
                      if (!newCategoryName.trim()) return;
                      await addProductCategory(newCategoryName.trim());
                      setNewCategoryName('');
                    }}
                    className="btn-signature !h-10 !px-4 !rounded-lg"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto no-scrollbar space-y-2 pr-1">
                {productCategories.map(cat => (
                  <div key={cat.id} className="group flex items-center justify-between p-3 bg-white border border-black/5 rounded-xl hover:border-accent-signature/30 transition-all">
                    {editingCategory?.id === cat.id ? (
                      <input 
                        autoFocus
                        type="text"
                        className="flex-1 bg-canvas border-none rounded-lg px-2 py-1 text-sm font-bold text-ink-primary outline-none"
                        value={editingCategory.name}
                        onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })}
                        onBlur={() => {
                          if (editingCategory.name !== cat.name) updateProductCategory(editingCategory);
                          setEditingCategory(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            updateProductCategory(editingCategory);
                            setEditingCategory(null);
                          }
                        }}
                      />
                    ) : (
                      <span className="text-sm font-bold text-ink-primary">{cat.name}</span>
                    )}

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setEditingCategory(cat)}
                        className="w-8 h-8 rounded-lg bg-canvas flex items-center justify-center text-gray-500 hover:text-ink-primary hover:bg-black/5 transition-all"
                      >
                        <Pencil size={12} />
                      </button>
                      <button 
                        onClick={() => {
                          if (window.confirm(`Delete "${cat.name}"? products in this category will display as 'Other'.`)) {
                            deleteProductCategory(cat.id);
                          }
                        }}
                        className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {productCategories.length === 0 && (
                  <div className="py-10 text-center opacity-30 text-[10px] font-bold uppercase tracking-widest italic">No Custom Categories Defined</div>
                )}
              </div>
            </div>

            <button 
              onClick={() => setShowCategoryManager(false)}
              className="w-full h-12 bg-black text-white font-black text-xs uppercase tracking-widest rounded-pill mt-6 hover:bg-gray-900 transition-all"
            >
              Finalize & Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Inventory;
