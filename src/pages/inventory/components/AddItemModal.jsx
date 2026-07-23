import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ImagePlus, CheckCircle2, Percent, Camera, Images, Upload, X, Loader2, Wand2 } from 'lucide-react';
import { ean13CheckDigit } from '../../../lib/labelPrint';
import Modal from '../../../shared/Modal';
import Button from '../../../shared/Button';
import { TAX_SLABS, TAX_SLABS_WITH_CESS, UNITS } from '../../../lib/constants';
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
    costPrice: '', sellingPrice: '', wholesale_price: '', distributor_price: '', price_inclusive: false, tax_status: 'TAXABLE', stock: '', taxRate: 0, cess_rate: 0, hsn_code: '', taxSlab: 'Exempt', tags: '', image: '',
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
        cess_rate: editingProduct.cess_rate || 0,
        hsn_code: editingProduct.hsn_code || editingProduct.hsn || '',
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
        costPrice: '', sellingPrice: '', wholesale_price: '', distributor_price: '', price_inclusive: false, tax_status: 'TAXABLE', stock: '', taxRate: 0, cess_rate: 0, hsn_code: '', taxSlab: 'Exempt', tags: '', image: '',
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
      // Mandatory price validation
      if (!(parseFloat(formData.costPrice) > 0)) {
        setSaveError('Cost price is required and must be greater than 0.');
        setUploading(false);
        return;
      }
      if (formData.product_type !== 'RAW' && !(parseFloat(formData.sellingPrice) > 0)) {
        setSaveError('Selling price is required and must be greater than 0.');
        setUploading(false);
        return;
      }

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
        wholesale_price:  parseFloat(formData.wholesale_price)  || null,
        distributor_price: parseFloat(formData.distributor_price) || null,
        price_inclusive:  !!formData.price_inclusive,
        tax_status:       formData.tax_status || 'TAXABLE',
        stock:            parseInt(formData.stock)              || 0,
        lowStockThreshold: parseInt(formData.lowStockThreshold) || 10,
        taxRate:          parseFloat(formData.taxRate)          || 0,
        cess_rate:        parseFloat(formData.cess_rate)        || 0,
        hsn_code:         (formData.hsn_code || '').trim()      || null,
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
        const inputCls = "w-full bg-card border border-border rounded-xl px-3.5 py-3 text-xs font-semibold text-foreground placeholder:text-muted-foreground placeholder:font-medium outline-none transition-all hover:border-border focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 shadow-sm";
        const labelCls = "block text-[10px] font-semibold text-ink-secondary uppercase tracking-wider mb-2";
        const Section = ({ children }) => (
          <div className="flex items-center gap-2 pt-1.5">
            <span className="w-1 h-3.5 rounded-full bg-accent-signature" />
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-widest">{children}</span>
          </div>
        );
        const c = parseFloat(formData.costPrice);
        const s = parseFloat(formData.sellingPrice);
        const showMargin = c > 0 && !isNaN(s);
        const margin = showMargin ? ((s - c) / c) * 100 : 0;
        const marginColor = margin < 0 ? 'text-red-600' : margin < 10 ? 'text-accent-signature' : 'text-emerald-600';

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
                    className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg border border-accent-signature/40 text-accent-signature text-[11px] font-semibold hover:bg-accent-signature/10">
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
                  <input type="text" className={`${inputCls} tabular-nums flex-1`} placeholder="Scan or type barcode…"
                    value={formData.barcode || ''}
                    onChange={e => setFormData({ ...formData, barcode: e.target.value })} />
                  <button type="button"
                    onClick={() => {
                      // Internal EAN-13: GS1 in-store prefix 21 + random body + check digit
                      const body = '21' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
                      setFormData({ ...formData, barcode: body + ean13CheckDigit(body) });
                    }}
                    title="Auto-generate an EAN-13 barcode"
                    className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg border border-accent-signature/40 text-accent-signature text-[11px] font-semibold hover:bg-accent-signature/10">
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
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${formData.track_serial ? 'translate-x-4' : ''}`} />
              </button>
              <span className="flex flex-col">
                <span className="text-[13px] font-semibold text-foreground">Track IMEI / serial per unit</span>
                <span className="text-[11px] text-muted-foreground">Phones, electronics — capture the serial on purchase &amp; sale</span>
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
                        { v: 'EGG', label: 'Egg', dot: 'bg-accent-signature' },
                      ].map(o => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setFormData({ ...formData, food_type: formData.food_type === o.v ? '' : o.v })}
                          className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border text-xs font-semibold transition-all ${
                            formData.food_type === o.v
                              ? 'border-accent-signature bg-accent-signature/10 text-foreground'
                              : 'border-border text-muted-foreground hover:border-black/20'
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-sm ${o.dot}`} />{o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Kitchen Station <span className="text-muted-foreground font-normal">— optional</span></label>
                    <input type="text" className={inputCls} placeholder="Tandoor, Bar, Grill…"
                      value={formData.station || ''} onChange={e => setFormData({ ...formData, station: e.target.value })} />
                  </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4 rounded accent-accent-signature"
                    checked={formData.is_available !== false}
                    onChange={e => setFormData({ ...formData, is_available: e.target.checked })} />
                  <span className="text-sm font-semibold text-foreground">Available on menu</span>
                  <span className="text-[11px] text-muted-foreground">— uncheck to 86 (mark out of stock)</span>
                </label>

                {/* Modifier groups */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={labelCls}>Modifiers <span className="text-muted-foreground font-normal normal-case">— add-ons / variations</span></label>
                    <button type="button" onClick={addGroup}
                      className="text-[11px] font-semibold text-accent-signature hover:underline">+ Add group</button>
                  </div>
                  <div className="space-y-3">
                    {mgroups.map((g, i) => (
                      <div key={g.id || i} className="rounded-xl border border-border p-3 bg-canvas/40">
                        <div className="flex items-center gap-2 mb-2">
                          <input value={g.name} onChange={e => updateGroup(i, { name: e.target.value })}
                            placeholder="Group name (Size, Add-ons…)"
                            className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:border-accent-signature" />
                          <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                            <input type="checkbox" checked={!!g.multi} onChange={e => updateGroup(i, { multi: e.target.checked })} className="accent-accent-signature" />
                            multi
                          </label>
                          <button type="button" onClick={() => removeGroup(i)} className="text-muted-foreground hover:text-red-500"><X size={14} /></button>
                        </div>
                        <div className="space-y-1.5">
                          {(g.options || []).map((o, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <input value={o.name} onChange={e => updateOption(i, oi, { name: e.target.value })}
                                placeholder="Option (Large, Extra cheese…)"
                                className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent-signature" />
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-muted-foreground">₹</span>
                                <input type="number" step="1" value={o.price}
                                  onChange={e => updateOption(i, oi, { price: parseFloat(e.target.value) || 0 })}
                                  className="w-16 bg-card border border-border rounded-lg px-2 py-1.5 text-xs tabular-nums outline-none focus:border-accent-signature" />
                              </div>
                              <button type="button" onClick={() => removeOption(i, oi)} className="text-muted-foreground hover:text-red-500"><X size={13} /></button>
                            </div>
                          ))}
                          <button type="button" onClick={() => addOption(i)}
                            className="text-[11px] font-semibold text-muted-foreground hover:text-accent-signature">+ Option</button>
                        </div>
                      </div>
                    ))}
                    {mgroups.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">No modifiers. Add a group for sizes or add-ons.</p>
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
                  {isService ? 'Service Price (₹)' : 'Selling Price (₹)'}{formData.product_type === 'RAW' && <span className="text-muted-foreground font-normal"> — optional</span>}
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

            {!isService && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Price tiers</span>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                    <input type="checkbox" checked={!!formData.price_inclusive}
                      onChange={e => setFormData({ ...formData, price_inclusive: e.target.checked })} />
                    Prices include tax
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Wholesale (₹) <span className="text-muted-foreground font-normal">— bulk</span></label>
                    <input type="number" step="0.01" className={inputCls} placeholder="0.00"
                      value={formData.wholesale_price} onChange={e => setFormData({ ...formData, wholesale_price: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Distributor (₹) <span className="text-muted-foreground font-normal">— reseller</span></label>
                    <input type="number" step="0.01" className={inputCls} placeholder="0.00"
                      value={formData.distributor_price} onChange={e => setFormData({ ...formData, distributor_price: e.target.value })} />
                  </div>
                  <div className="flex items-end pb-2 text-[11px] text-muted-foreground">
                    Retail = Selling Price above. Distributor is your lowest (reseller) rate.
                  </div>
                </div>
              </div>
            )}

            {!isService && (<>
            {/* Alternate unit + conversion (optional) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Alternate Unit <span className="text-muted-foreground font-normal">— optional</span>
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
                  className={`${inputCls} ${!formData.secondary_unit ? 'opacity-60 cursor-not-allowed !bg-gray-50 hover:!border-border' : ''}`}
                  placeholder={`e.g. 24`}
                  disabled={!formData.secondary_unit}
                  value={formData.conversion_factor}
                  onChange={e => setFormData({ ...formData, conversion_factor: e.target.value })} />
                {/* Live two-way readout — confirms the factor the moment it's
                    typed, and shows the reciprocal so a fraction like 0.25 reads
                    plainly ("4 PACK = 1 KG"). */}
                {(() => {
                  const f = parseFloat(formData.conversion_factor);
                  if (!formData.secondary_unit || !(f > 0)) return null;
                  const tidy = (n) => Number(n.toFixed(4)).toLocaleString('en-IN');
                  return (
                    <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
                      1 {formData.secondary_unit} = <span className="font-semibold text-foreground">{tidy(f)} {formData.unit}</span>
                      <span className="mx-1.5 opacity-40">·</span>
                      {tidy(1 / f)} {formData.secondary_unit} = 1 {formData.unit}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Margin indicator + floor guard */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {showMargin && (
                <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 shadow-sm self-end">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Current Margin</span>
                  <span className={`text-sm font-semibold tabular-nums ${marginColor}`}>
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
                  <Percent size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">POS warns / blocks if margin drops below this</p>
              </div>
            </div>
            </>)}

            <Section>Taxation</Section>
            <div className="mb-3">
              <label className={labelCls}>Tax status</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: 'TAXABLE', label: 'Taxable' },
                  { id: 'EXEMPT', label: 'Exempt / Nil' },
                  { id: 'NONGST', label: 'Non-GST' },
                ].map(s => (
                  <button key={s.id} type="button"
                    onClick={() => setFormData({ ...formData, tax_status: s.id, ...(s.id !== 'TAXABLE' ? { taxRate: 0, cess_rate: 0 } : {}) })}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                      (formData.tax_status || 'TAXABLE') === s.id
                        ? 'bg-accent-signature text-button-text border-accent-signature shadow-md'
                        : 'bg-card border-border text-muted-foreground hover:border-accent-signature/40'
                    }`}>{s.label}</button>
                ))}
              </div>
            </div>
            {(formData.tax_status || 'TAXABLE') === 'TAXABLE' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* GST + Cess slab dropdown */}
              <div>
                <label className={labelCls}>GST Tax Slab</label>
                <select
                  value={TAX_SLABS_WITH_CESS.findIndex(
                    s => s.value === Number(formData.taxRate) && s.cess === Number(formData.cess_rate || 0)
                  )}
                  onChange={(e) => {
                    const s = TAX_SLABS_WITH_CESS[Number(e.target.value)];
                    if (s) setFormData({ ...formData, taxRate: s.value, cess_rate: s.cess });
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border shadow-sm text-xs font-semibold text-foreground focus:outline-none focus:border-accent-signature/40"
                >
                  {/* When the saved combo isn't a standard slab, findIndex returns -1 */}
                  {TAX_SLABS_WITH_CESS.findIndex(s => s.value === Number(formData.taxRate) && s.cess === Number(formData.cess_rate || 0)) === -1 && (
                    <option value={-1}>{`${Number(formData.taxRate) || 0}%${Number(formData.cess_rate) ? ` + ${Number(formData.cess_rate)}% Cess` : ''} (custom)`}</option>
                  )}
                  {TAX_SLABS_WITH_CESS.map((s, i) => (
                    <option key={i} value={i}>{s.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">GST + Compensation Cess. Applied on invoice & POS checkout.</p>
              </div>

              {/* HSN / SAC code */}
              <div>
                <label className={labelCls}>HSN / SAC Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formData.hsn_code || ''}
                  onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="e.g. 39231090"
                  maxLength={8}
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border shadow-sm text-xs font-semibold text-foreground focus:outline-none focus:border-accent-signature/40"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Required for GSTR-1 HSN summary (Table 12).</p>
              </div>
            </div>
            )}

            <Section>Product Photo</Section>
            {/* ── Product Photo ──────────────────────────────────────── */}
            <div>
              <div className="flex gap-3 items-start">
                {/* Preview */}
                <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-card border border-border shadow-sm flex-shrink-0 flex items-center justify-center">
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
                    <Camera size={20} className="text-muted-foreground" />
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 flex-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border shadow-sm text-xs font-semibold text-foreground hover:border-accent-signature/40 hover:bg-accent-signature/5 transition-all"
                  >
                    <Upload size={13} /> Upload New Photo
                  </button>
                  <button
                    type="button"
                    onClick={openPhotoLib}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border shadow-sm text-xs font-semibold text-foreground hover:border-accent-signature/40 hover:bg-accent-signature/5 transition-all"
                  >
                    <Images size={13} /> Choose from Library
                  </button>
                  <p className="text-[10px] text-muted-foreground">Max 5 MB · JPG, PNG, WEBP</p>
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
                <div className="mt-3 bg-card border border-border shadow-sm rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recent Photos</span>
                    <button type="button" onClick={() => setShowPhotoLib(false)}>
                      <X size={14} className="text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                  {libLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 size={18} className="animate-spin text-muted-foreground" />
                    </div>
                  ) : libPhotos.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground">
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
                    className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border text-[10px] font-semibold text-muted-foreground hover:border-accent-signature hover:text-accent-signature transition-colors"
                  >
                    <Upload size={11} /> Upload new photo
                  </button>
                </div>
              )}
            </div>

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs font-semibold text-red-600">
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
