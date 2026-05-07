import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ImagePlus, CheckCircle2, Percent, Camera, Images, Upload, X, Loader2 } from 'lucide-react';
import Modal from '../../../shared/Modal';
import Button from '../../../shared/Button';
import { TAX_SLABS, UNITS } from '../../../lib/constants';
import { uploadProductImage, listTenantProductImages } from '../../../lib/supabase';

const DEFAULT_CATEGORIES = [
  'Electronics', 'Clothing & Apparel', 'Food & Beverages', 'Pharmaceuticals',
  'Hardware & Tools', 'Furniture', 'Stationery & Office', 'Raw Materials',
  'Finished Goods', 'FMCG', 'Spare Parts', 'Packaging', 'Cosmetics & Beauty',
  'Sports & Fitness', 'Automotive', 'Other'
];

const AddItemModal = ({ isOpen, onClose, onSave, editingProduct, productCategories, tenantId }) => {
  const [formData, setFormData] = useState({
    name: '', sku: '', category: '', unit: UNITS[0],
    costPrice: '', sellingPrice: '', stock: '', taxRate: 0, taxSlab: 'Exempt', tags: '', image: '',
    lowStockThreshold: 10, min_margin: 0
  });

  const [imageFile, setImageFile]     = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [saveError, setSaveError]     = useState(null);
  const fileInputRef = useRef(null);

  // Photo library state
  const [showPhotoLib, setShowPhotoLib] = useState(false);
  const [libPhotos, setLibPhotos]       = useState([]);
  const [libLoading, setLibLoading]     = useState(false);

  const fetchLibPhotos = useCallback(async () => {
    if (!tenantId) { setLibLoading(false); return; }
    setLibLoading(true);
    try {
      const photos = await listTenantProductImages(tenantId, 24);
      setLibPhotos(photos);
    } catch (err) {
      console.error('fetchLibPhotos error:', err);
      setLibPhotos([]);
    } finally {
      setLibLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (editingProduct) {
      setFormData({
        ...editingProduct,
        taxRate: editingProduct.taxRate || 0,
        taxSlab: editingProduct.taxSlab || (TAX_SLABS.find(s => s.rate === (editingProduct.taxRate || 0))?.label) || 'Custom',
        tags: editingProduct.tags ? editingProduct.tags.join(', ') : '',
        image: editingProduct.image || '',
        lowStockThreshold: editingProduct.lowStockThreshold || 10
      });
      setImagePreview(editingProduct.image || null);
    } else {
      setFormData({
        name: '', sku: '', category: '', unit: UNITS[0],
        costPrice: '', sellingPrice: '', stock: '', taxRate: 0, taxSlab: 'Exempt', tags: '', image: '',
        lowStockThreshold: 10, min_margin: 0
      });
      setImagePreview(null);
    }
    setImageFile(null);
    setShowPhotoLib(false);
  }, [editingProduct, productCategories, isOpen]);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setSaveError('Image must be under 5 MB');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    setShowPhotoLib(false);
  };

  const openPhotoLib = async () => {
    setShowPhotoLib(true);
    await fetchLibPhotos();
  };

  const selectLibPhoto = (url) => {
    setFormData(f => ({ ...f, image: url }));
    setImagePreview(url);
    setImageFile(null); // already uploaded — no re-upload needed
    setShowPhotoLib(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    setSaveError(null);

    let imageUrl = formData.image || '';
    if (imageFile) {
      const { url, error } = await uploadProductImage(imageFile, tenantId);
      if (error) {
        setSaveError('Image upload failed: ' + error);
        setUploading(false);
        return;
      }
      imageUrl = url;
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

    const result = await onSave(parsedData);
    setUploading(false);
    if (result?.error) {
      setSaveError(result.error.message || 'Failed to save product');
      return;
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingProduct ? 'Edit Product' : 'Add Product'}
      subtitle={editingProduct ? 'Update product details' : 'Add new product to inventory'}
    >
      {(() => {
        const inputCls = "w-full bg-canvas border border-black/5 !rounded-xl p-3 text-xs font-bold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20";
        const labelCls = "block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2";
        const c = parseFloat(formData.costPrice);
        const s = parseFloat(formData.sellingPrice);
        const showMargin = c > 0 && !isNaN(s);
        const margin = showMargin ? ((s - c) / c) * 100 : 0;
        const marginColor = margin < 0 ? 'text-red-600' : margin < 10 ? 'text-amber-600' : 'text-emerald-600';

        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Row 1: Name full width */}
            <div>
              <label className={labelCls}>Name</label>
              <input required type="text" className={inputCls} placeholder="Product name"
                value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value})} />
            </div>

            {/* Row 2: SKU | Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>SKU</label>
                <input required type="text" className={inputCls} placeholder="SKU-0001"
                  value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value})} />
              </div>
              <div>
                <label className={labelCls}>Category</label>
                <input
                  list="category-suggestions"
                  className={inputCls}
                  placeholder="Type or select category…"
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                />
                <datalist id="category-suggestions">
                  {(productCategories.length > 0 ? productCategories.map(c => c.name) : DEFAULT_CATEGORIES)
                    .map(name => <option key={name} value={name} />)}
                </datalist>
              </div>
            </div>

            {/* Row 3: Cost | Selling | Unit */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Cost Price (₹)</label>
                <input required type="number" step="0.01" className={inputCls} placeholder="0.00"
                  value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: e.target.value})} />
              </div>
              <div>
                <label className={labelCls}>Selling Price (₹)</label>
                <input required type="number" step="0.01" className={inputCls} placeholder="0.00"
                  value={formData.sellingPrice} onChange={e => setFormData({ ...formData, sellingPrice: e.target.value})} />
              </div>
              <div>
                <label className={labelCls}>Unit</label>
                <select className={inputCls} value={formData.unit}
                  onChange={e => setFormData({ ...formData, unit: e.target.value})}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            {/* Margin indicator + floor guard */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {showMargin && (
                <div className="flex items-center justify-between bg-canvas border border-black/5 rounded-xl px-4 py-2.5">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Current Margin</span>
                  <span className={`text-sm font-black tabular-nums ${marginColor}`}>
                    {margin.toFixed(1)}%{margin < 0 ? ' · loss' : margin < 10 ? ' · low' : ''}
                  </span>
                </div>
              )}
              <div>
                <label className={labelCls}>Min Margin Floor (%)</label>
                <div className="relative">
                  <input type="number" step="1" min="0" max="100" className={inputCls} placeholder="e.g. 15"
                    value={formData.min_margin}
                    onChange={e => setFormData({ ...formData, min_margin: e.target.value })} />
                  <Percent size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">POS warns / blocks if margin drops below this</p>
              </div>
            </div>

            {/* Tax Slab */}
            <div>
              <label className={labelCls}>GST Tax Slab</label>
              <div className="flex gap-2 flex-wrap">
                {TAX_SLABS.map(slab => (
                  <button
                    key={slab.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, taxRate: slab.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all ${
                      Number(formData.taxRate) === slab.value
                        ? 'bg-accent-signature text-button-text border-accent-signature shadow'
                        : 'bg-canvas border-black/10 text-gray-500 hover:border-accent-signature/40'
                    }`}
                  >
                    {slab.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Applied on invoice & POS checkout</p>
            </div>

            {/* ── Product Photo ──────────────────────────────────────── */}
            <div>
              <label className={labelCls}>Product Photo</label>
              <div className="flex gap-3 items-start">
                {/* Preview */}
                <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-canvas border border-black/5 flex-shrink-0 flex items-center justify-center">
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => { setImagePreview(null); setImageFile(null); setFormData(f => ({ ...f, image: '' })); }}
                        className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-black"
                      >
                        <X size={10} />
                      </button>
                    </>
                  ) : (
                    <Camera size={20} className="text-gray-300" />
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 flex-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-canvas border border-black/5 text-xs font-bold text-ink-primary hover:bg-accent-signature/5 transition-colors"
                  >
                    <Upload size={13} /> Upload New Photo
                  </button>
                  <button
                    type="button"
                    onClick={openPhotoLib}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-canvas border border-black/5 text-xs font-bold text-ink-primary hover:bg-accent-signature/5 transition-colors"
                  >
                    <Images size={13} /> Choose from Library
                  </button>
                  <p className="text-[10px] text-gray-400">Max 5 MB · JPG, PNG, WEBP</p>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </div>

              {/* ── Photo Library Panel ── */}
              {showPhotoLib && (
                <div className="mt-3 bg-canvas border border-black/5 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Recent Photos</span>
                    <button type="button" onClick={() => setShowPhotoLib(false)}>
                      <X size={14} className="text-gray-400 hover:text-ink-primary" />
                    </button>
                  </div>
                  {libLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 size={18} className="animate-spin text-gray-400" />
                    </div>
                  ) : libPhotos.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-400">
                      No photos uploaded yet. Upload your first photo above.
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {libPhotos.map(photo => (
                        <button
                          key={photo.name}
                          type="button"
                          onClick={() => selectLibPhoto(photo.url)}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:opacity-90 ${
                            formData.image === photo.url
                              ? 'border-accent-signature ring-2 ring-accent-signature/30'
                              : 'border-transparent'
                          }`}
                        >
                          <img src={photo.url} alt={photo.name} className="w-full h-full object-cover" />
                          {formData.image === photo.url && (
                            <div className="absolute inset-0 bg-accent-signature/20 flex items-center justify-center">
                              <CheckCircle2 size={16} className="text-accent-signature" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { fileInputRef.current?.click(); setShowPhotoLib(false); }}
                    className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-black/10 text-[10px] font-bold text-gray-500 hover:border-accent-signature hover:text-accent-signature transition-colors"
                  >
                    <Upload size={11} /> Upload new photo
                  </button>
                </div>
              )}
            </div>

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs font-bold text-red-600">
                {saveError}
              </div>
            )}
            <Button type="submit" disabled={uploading} icon={CheckCircle2} className="w-full !rounded-xl !h-12 shadow-xl">
              {uploading ? 'Saving...' : editingProduct ? 'Save Changes' : 'Save Product'}
            </Button>
          </form>
        );
      })()}
    </Modal>
  );
};

export default AddItemModal;
