import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ImagePlus, CheckCircle2, Percent, Camera, Images, Upload, X, Loader2, Wand2 } from 'lucide-react';
import { ean13CheckDigit } from '../../../lib/labelPrint';
import Modal from '../../../shared/Modal';
import Button from '../../../shared/Button';
import { TAX_SLABS, UNITS } from '../../../lib/constants';
import { uploadProductImage, listTenantProductImages } from '../../../lib/supabase';
import { useTenant } from '../../../context/TenantContext';

const DEFAULT_CATEGORIES = [
  'Electronics', 'Clothing & Apparel', 'Food & Beverages', 'Pharmaceuticals',
  'Hardware & Tools', 'Furniture', 'Stationery & Office', 'Raw Materials',
  'Finished Goods', 'FMCG', 'Spare Parts', 'Packaging', 'Cosmetics & Beauty',
  'Sports & Fitness', 'Automotive', 'Other'
];

const AddItemModal = ({ isOpen, onClose, onSave, editingProduct, productCategories, tenantId }) => {
  const { businessType } = useTenant();
  const isResto = businessType === 'RESTAURANT';

  const [formData, setFormData] = useState({
    name: '', sku: '', category: '', unit: UNITS[0],
    costPrice: '', sellingPrice: '', stock: '', taxRate: 0, taxSlab: 'Exempt', tags: '', image: '',
    lowStockThreshold: 10, min_margin: 0, barcode: '', product_type: 'STANDARD',
    secondary_unit: '', conversion_factor: '',
    food_type: '', is_available: true, station: '', modifier_groups: [],   // menu (restaurant)
    duration_min: '',   // service catalog
    track_serial: false,   // serialized stock (IMEI / serial per unit)
  });

  // A SERVICE product (labor / repair, no stock) gets the service UX in ANY
  // business mode — lets a retail shop keep products and add services together.
  const isService = businessType === 'SERVICES' || formData.product_type === 'SERVICE';

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
        lowStockThreshold: editingProduct.lowStockThreshold || 10,
        barcode: editingProduct.barcode || '',
        modifier_groups: Array.isArray(editingProduct.modifier_groups) ? editingProduct.modifier_groups : [],
      });
      setImagePreview(editingProduct.image || null);
    } else {
      setFormData({
        name: '', sku: '', category: '', unit: UNITS[0],
        costPrice: '', sellingPrice: '', stock: '', taxRate: 0, taxSlab: 'Exempt', tags: '', image: '',
        lowStockThreshold: 10, min_margin: 0, barcode: '',
        food_type: '', is_available: true, station: '',
        track_serial: false,
      });
      setImagePreview(null);
    }
    setImageFile(null);
    setShowPhotoLib(false);
  // NOTE: productCategories intentionally excluded — it changes reference on every
  // refetch and would reset imageFile while the modal is open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingProduct, isOpen]);

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

    try {
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
        costPrice:        parseFloat(formData.costPrice)        || 0,
        sellingPrice:     parseFloat(formData.sellingPrice)     || 0,
        stock:            parseInt(formData.stock)              || 0,
        lowStockThreshold: parseInt(formData.lowStockThreshold) || 10,
        taxRate:          parseFloat(formData.taxRate)          || 0,
        min_margin:       parseFloat(formData.min_margin)       || 0,
        secondary_unit:   formData.secondary_unit?.trim() || null,
        conversion_factor: parseFloat(formData.conversion_factor) || null,
        tags: typeof formData.tags === 'string'
          ? formData.tags.split(',').map(t => t.trim()).filter(Boolean)
          : (Array.isArray(formData.tags) ? formData.tags : []),
        // Menu (restaurant) — null food_type for retail / unset.
        food_type: formData.food_type || null,
        is_available: formData.is_available !== false,
        station: formData.station?.trim() || null,
        modifier_groups: Array.isArray(formData.modifier_groups) ? formData.modifier_groups : [],
        duration_min: Number(formData.duration_min) || null,
        track_serial: !!formData.track_serial,
      };

      // Bound the save so a stalled request can't leave the button stuck on
      // "Saving…" forever — fail fast with a retry message instead.
      const withTimeout = (pr, ms) => Promise.race([
        pr,
        new Promise((_, rej) => setTimeout(() => rej(new Error('Save timed out — check your connection and try again')), ms)),
      ]);
      const result = await withTimeout(onSave(parsedData), 15000);
      if (result?.error) {
        setSaveError(result.error.message || 'Failed to save product');
        return;
      }
      onClose();
    } catch (err) {
      setSaveError(err?.message || 'Unexpected error — please try again');
    } finally {
      setUploading(false);
    }
  };

  // ── Modifier-group editor helpers (restaurant) ───────────────
  const mgroups = formData.modifier_groups || [];
  const setGroups = (next) => setFormData(f => ({ ...f, modifier_groups: next }));
  const addGroup = () => setGroups([...mgroups, { id: crypto.randomUUID(), name: '', multi: false, options: [{ name: '', price: 0 }] }]);
  const updateGroup = (i, patch) => setGroups(mgroups.map((g, gi) => gi === i ? { ...g, ...patch } : g));
  const removeGroup = (i) => setGroups(mgroups.filter((_, gi) => gi !== i));
  const addOption = (i) => updateGroup(i, { options: [...(mgroups[i].options || []), { name: '', price: 0 }] });
  const updateOption = (i, oi, patch) => updateGroup(i, { options: mgroups[i].options.map((o, idx) => idx === oi ? { ...o, ...patch } : o) });
  const removeOption = (i, oi) => updateGroup(i, { options: mgroups[i].options.filter((_, idx) => idx !== oi) });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingProduct ? 'Edit Product' : 'Add Product'}
      subtitle={editingProduct ? 'Update product details' : 'Add new product to inventory'}
    >
      {(() => {
        const inputCls = "w-full bg-white border border-gray-300 rounded-xl px-3.5 py-3 text-xs font-bold text-ink-primary placeholder:text-gray-400 placeholder:font-medium outline-none transition-all hover:border-gray-300 focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 shadow-sm";
        const labelCls = "block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2";
        const Section = ({ children }) => (
          <div className="flex items-center gap-2 pt-1.5">
            <span className="w-1 h-3.5 rounded-full bg-accent-signature" />
            <span className="text-[11px] font-black text-ink-primary uppercase tracking-widest">{children}</span>
          </div>
        );
        const c = parseFloat(formData.costPrice);
        const s = parseFloat(formData.sellingPrice);
        const showMargin = c > 0 && !isNaN(s);
        const margin = showMargin ? ((s - c) / c) * 100 : 0;
        const marginColor = margin < 0 ? 'text-red-600' : margin < 10 ? 'text-amber-600' : 'text-emerald-600';

        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Section>Identity &amp; Classification</Section>
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
                <div className="flex gap-2">
                  <input required type="text" className={`${inputCls} flex-1`} placeholder="SKU-0001"
                    value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value})} />
                  <button type="button"
                    onClick={() => {
                      // Derive a code from the product name (alphanumerics, up to 4 chars) + random suffix.
                      const base = (formData.name || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'SKU';
                      const sku = `${base}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
                      setFormData({ ...formData, sku });
                    }}
                    title="Auto-generate a SKU"
                    className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg border border-accent-signature/40 text-accent-signature text-[11px] font-bold hover:bg-accent-signature/10">
                    <Wand2 size={13} /> Assign
                  </button>
                </div>
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

            {/* Barcode | Product Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Barcode (EAN-13 / UPC / custom)</label>
                <div className="flex gap-2">
                  <input type="text" className={`${inputCls} font-mono flex-1`} placeholder="Scan or type barcode…"
                    value={formData.barcode || ''}
                    onChange={e => setFormData({ ...formData, barcode: e.target.value })} />
                  <button type="button"
                    onClick={() => {
                      // Internal EAN-13: GS1 in-store prefix 21 + random body + check digit
                      const body = '21' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
                      setFormData({ ...formData, barcode: body + ean13CheckDigit(body) });
                    }}
                    title="Auto-generate an EAN-13 barcode"
                    className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg border border-accent-signature/40 text-accent-signature text-[11px] font-bold hover:bg-accent-signature/10">
                    <Wand2 size={13} /> Assign
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Product Type</label>
                <select className={inputCls} value={formData.product_type || 'STANDARD'}
                  onChange={e => setFormData({ ...formData, product_type: e.target.value })}>
                  <option value="STANDARD">Standard — bought &amp; sold</option>
                  <option value="SERVICE">Service — labor / repair (no stock)</option>
                  <option value="RAW">Raw material — consume-only (not sold)</option>
                  <option value="FINISHED">Finished — manufactured</option>
                </select>
              </div>
            </div>

            {/* Serialized stock — track each unit by IMEI / serial number */}
            <label className="flex items-center gap-3 mt-1 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={!!formData.track_serial}
                onClick={() => setFormData({ ...formData, track_serial: !formData.track_serial })}
                className={`relative w-10 h-6 rounded-full transition-colors ${formData.track_serial ? 'bg-accent-signature' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${formData.track_serial ? 'translate-x-4' : ''}`} />
              </button>
              <span className="flex flex-col">
                <span className="text-[13px] font-bold text-ink-primary">Track IMEI / serial per unit</span>
                <span className="text-[11px] text-gray-400">Phones, electronics — capture the serial on purchase &amp; sale</span>
              </span>
            </label>

            {/* Menu details — restaurant only */}
            {isResto && (
              <>
                <Section>Menu Details</Section>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Food Type</label>
                    <div className="flex gap-2">
                      {[
                        { v: 'VEG', label: 'Veg', dot: 'bg-green-600' },
                        { v: 'NONVEG', label: 'Non-veg', dot: 'bg-red-600' },
                        { v: 'EGG', label: 'Egg', dot: 'bg-amber-500' },
                      ].map(o => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setFormData({ ...formData, food_type: formData.food_type === o.v ? '' : o.v })}
                          className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border text-xs font-bold transition-all ${
                            formData.food_type === o.v
                              ? 'border-amber-500 bg-amber-50 text-ink-primary'
                              : 'border-black/10 text-gray-500 hover:border-black/20'
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-sm ${o.dot}`} />{o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Kitchen Station <span className="text-gray-400 font-normal">— optional</span></label>
                    <input type="text" className={inputCls} placeholder="Tandoor, Bar, Grill…"
                      value={formData.station || ''} onChange={e => setFormData({ ...formData, station: e.target.value })} />
                  </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4 rounded accent-amber-600"
                    checked={formData.is_available !== false}
                    onChange={e => setFormData({ ...formData, is_available: e.target.checked })} />
                  <span className="text-sm font-semibold text-ink-primary">Available on menu</span>
                  <span className="text-[11px] text-gray-400">— uncheck to 86 (mark out of stock)</span>
                </label>

                {/* Modifier groups */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={labelCls}>Modifiers <span className="text-gray-400 font-normal normal-case">— add-ons / variations</span></label>
                    <button type="button" onClick={addGroup}
                      className="text-[11px] font-bold text-amber-600 hover:underline">+ Add group</button>
                  </div>
                  <div className="space-y-3">
                    {mgroups.map((g, i) => (
                      <div key={g.id || i} className="rounded-xl border border-black/10 p-3 bg-canvas/40">
                        <div className="flex items-center gap-2 mb-2">
                          <input value={g.name} onChange={e => updateGroup(i, { name: e.target.value })}
                            placeholder="Group name (Size, Add-ons…)"
                            className="flex-1 bg-white border border-black/10 rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:border-amber-500" />
                          <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 whitespace-nowrap">
                            <input type="checkbox" checked={!!g.multi} onChange={e => updateGroup(i, { multi: e.target.checked })} className="accent-amber-600" />
                            multi
                          </label>
                          <button type="button" onClick={() => removeGroup(i)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
                        </div>
                        <div className="space-y-1.5">
                          {(g.options || []).map((o, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <input value={o.name} onChange={e => updateOption(i, oi, { name: e.target.value })}
                                placeholder="Option (Large, Extra cheese…)"
                                className="flex-1 bg-white border border-black/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-amber-500" />
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-gray-400">₹</span>
                                <input type="number" step="1" value={o.price}
                                  onChange={e => updateOption(i, oi, { price: parseFloat(e.target.value) || 0 })}
                                  className="w-16 bg-white border border-black/10 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-amber-500" />
                              </div>
                              <button type="button" onClick={() => removeOption(i, oi)} className="text-gray-300 hover:text-red-500"><X size={13} /></button>
                            </div>
                          ))}
                          <button type="button" onClick={() => addOption(i)}
                            className="text-[11px] font-bold text-gray-400 hover:text-amber-600">+ Option</button>
                        </div>
                      </div>
                    ))}
                    {mgroups.length === 0 && (
                      <p className="text-[11px] text-gray-400">No modifiers. Add a group for sizes or add-ons.</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Service details — services vertical */}
            {isService && (
              <>
                <Section>Service Details</Section>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Duration (minutes)</label>
                    <input type="number" min="0" className={inputCls} placeholder="30"
                      value={formData.duration_min} onChange={e => setFormData({ ...formData, duration_min: e.target.value })} />
                  </div>
                </div>
              </>
            )}

            <Section>{isService ? 'Pricing' : 'Pricing & Units'}</Section>
            {/* Row 3: Cost | Selling | Unit (services price only) */}
            <div className={`grid grid-cols-1 ${isService ? 'md:grid-cols-1' : 'md:grid-cols-3'} gap-4`}>
              {!isService && (
                <div>
                  <label className={labelCls}>Cost Price (₹)</label>
                  <input required type="number" step="0.01" className={inputCls} placeholder="0.00"
                    value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: e.target.value})} />
                </div>
              )}
              <div>
                <label className={labelCls}>
                  {isService ? 'Service Price (₹)' : 'Selling Price (₹)'}{formData.product_type === 'RAW' && <span className="text-gray-400 font-normal"> — optional</span>}
                </label>
                <input required={formData.product_type !== 'RAW'} type="number" step="0.01" className={inputCls} placeholder="0.00"
                  value={formData.sellingPrice} onChange={e => setFormData({ ...formData, sellingPrice: e.target.value})} />
              </div>
              {!isService && (
                <div>
                  <label className={labelCls}>Base Unit</label>
                  <select className={inputCls} value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value})}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}
            </div>

            {!isService && (<>
            {/* Alternate unit + conversion (optional) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Alternate Unit <span className="text-gray-400 font-normal">— optional</span>
                </label>
                <select className={inputCls} value={formData.secondary_unit || ''}
                  onChange={e => setFormData({ ...formData, secondary_unit: e.target.value })}>
                  <option value="">None</option>
                  {UNITS.filter(u => u !== formData.unit).map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>
                  Conversion {formData.secondary_unit && `(1 ${formData.secondary_unit} = ? ${formData.unit})`}
                </label>
                <input type="number" step="0.0001" min="0"
                  className={`${inputCls} ${!formData.secondary_unit ? 'opacity-60 cursor-not-allowed !bg-gray-50 hover:!border-gray-200' : ''}`}
                  placeholder={`e.g. 24`}
                  disabled={!formData.secondary_unit}
                  value={formData.conversion_factor}
                  onChange={e => setFormData({ ...formData, conversion_factor: e.target.value })} />
              </div>
            </div>

            {/* Margin indicator + floor guard */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {showMargin && (
                <div className="flex items-center justify-between bg-white border border-gray-300 rounded-xl px-4 py-3 shadow-sm self-end">
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
            </>)}

            <Section>Taxation</Section>
            {/* Tax Slab */}
            <div>
              <label className={labelCls}>GST Tax Slab</label>
              <div className="flex gap-2 flex-wrap">
                {TAX_SLABS.map(slab => (
                  <button
                    key={slab.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, taxRate: slab.value })}
                    className={`px-4 py-2 rounded-lg text-xs font-black border transition-all ${
                      Number(formData.taxRate) === slab.value
                        ? 'bg-accent-signature text-button-text border-accent-signature shadow-md scale-105'
                        : 'bg-white border-gray-200 text-gray-500 shadow-sm hover:border-accent-signature/40 hover:text-ink-primary'
                    }`}
                  >
                    {slab.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Applied on invoice & POS checkout</p>
            </div>

            <Section>Product Photo</Section>
            {/* ── Product Photo ──────────────────────────────────────── */}
            <div>
              <div className="flex gap-3 items-start">
                {/* Preview */}
                <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-white border border-gray-300 shadow-sm flex-shrink-0 flex items-center justify-center">
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
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-gray-300 shadow-sm text-xs font-bold text-ink-primary hover:border-accent-signature/40 hover:bg-accent-signature/5 transition-all"
                  >
                    <Upload size={13} /> Upload New Photo
                  </button>
                  <button
                    type="button"
                    onClick={openPhotoLib}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-gray-300 shadow-sm text-xs font-bold text-ink-primary hover:border-accent-signature/40 hover:bg-accent-signature/5 transition-all"
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
                <div className="mt-3 bg-white border border-gray-300 shadow-sm rounded-xl p-3">
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
