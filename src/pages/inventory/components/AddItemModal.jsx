import React, { useState, useRef, useEffect } from 'react';
import { ImagePlus, CheckCircle2, Percent } from 'lucide-react';
import Modal from '../../../shared/Modal';
import Button from '../../../shared/Button';
import { TAX_SLABS, UNITS } from '../../../lib/constants';
import { uploadProductImage } from '../../../lib/supabase';

const AddItemModal = ({ isOpen, onClose, onSave, editingProduct, productCategories }) => {
  const [formData, setFormData] = useState({
    name: '', sku: '', category: productCategories[0]?.name || 'Other', unit: UNITS[0],
    costPrice: '', sellingPrice: '', stock: '', taxRate: 0, taxSlab: 'Exempt', tags: '', image: '',
    lowStockThreshold: 10, min_margin: 0
  });
  
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

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
        name: '', sku: '', category: productCategories[0]?.name || 'Other', unit: UNITS[0],
        costPrice: '', sellingPrice: '', stock: '', taxRate: 0, taxSlab: 'Exempt', tags: '', image: '',
        lowStockThreshold: 10, min_margin: 0
      });
      setImagePreview(null);
    }
    setImageFile(null);
  }, [editingProduct, productCategories, isOpen]);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);

    let imageUrl = formData.image || '';
    if (imageFile) {
      const { url, error } = await uploadProductImage(imageFile);
      if (!error) imageUrl = url;
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

    await onSave(parsedData);
    setUploading(false);
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
                <select className={inputCls} value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value})}>
                  {productCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  {productCategories.length === 0 && <option value="Other">Other</option>}
                </select>
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
