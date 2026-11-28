import React, { useState, useRef, useEffect, useCallback } from 'react';
import { validateItemPricing, stockFieldsFor, isServiceForm, defaultProductType } from '../../../lib/itemForm';
import { CheckCircle2, Images, Upload, X, Loader2, Wand2, ChevronLeft } from 'lucide-react';
import { genInternalBarcode } from '../../../lib/labelPrint';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import WriteFailure from '../../../components/invoices/WriteFailure';
import { formSteps } from '../../../lib/inventoryView';
import { cn } from '../../../lib/utils';
import { ProductAvatar, Label, Hint, Select, CheckBox } from './parts';
import { TAX_SLABS, TAX_SLABS_WITH_CESS, UNITS } from '../../../lib/constants';
import { uploadProductImage, listTenantProductImages } from '../../../lib/supabase';
import { shrinkImageFile } from '../../../lib/imageShrink';
import { useTenant } from '../../../context/TenantContext';
import { PACK_KEYS, fieldsFor, cleanAttributes, validateAttributes } from '../../../lib/sectorFields';
import { marginOnPrice, packSizeForMargin } from '../../../lib/margin';

const DEFAULT_CATEGORIES = [
  'Electronics', 'Clothing & Apparel', 'Food & Beverages', 'Pharmaceuticals',
  'Hardware & Tools', 'Furniture', 'Stationery & Office', 'Raw Materials',
  'Finished Goods', 'FMCG', 'Spare Parts', 'Packaging', 'Cosmetics & Beauty',
  'Sports & Fitness', 'Automotive', 'Other'
];

/**
 * Add / Edit product (approved inventory-10, -11). Takes the Inventory page
 * over: four numbered sections, a sticky summary with Save, Ctrl Enter saves
 * and Esc cancels.
 *
 * Only the look is new. The fields, their rules (lib/itemForm.js) and the
 * row that is saved are exactly as before; the restaurant, service and
 * catalog fields the approved drawing does not show still appear when they
 * apply. A refused save shows the server's words; a save that timed out or
 * lost its connection says it could not be confirmed, never "Not saved".
 */
const AddItemModal = ({ isOpen, onClose, onSave, editingProduct, productCategories, tenantId, existingBarcodes, onReread }) => {
  const { businessType, isModuleOn } = useTenant();
  const isResto = businessType === 'RESTAURANT';

  // Capability packs are module toggles, so the same switch that shows a
  // feature in the nav decides whether its fields appear on this form.
  const activePacks = PACK_KEYS.filter(k => isModuleOn(k));
  const packFields = fieldsFor(activePacks);

  const [formData, setFormData] = useState({
    name: '', sku: '', category: '', unit: UNITS[0],
    costPrice: '', sellingPrice: '', wholesale_price: '', distributor_price: '', price_inclusive: false, tax_status: 'TAXABLE', stock: '', taxRate: 0, cess_rate: 0, hsn_code: '', taxSlab: 'Exempt', tags: '', image: '',
    lowStockThreshold: 10, min_margin: 0, barcode: '', product_type: defaultProductType(businessType),
    secondary_unit: '', conversion_factor: '',
    food_type: '', is_available: true, station: '', modifier_groups: [],   // menu (restaurant)
    duration_min: '',   // service catalog
    track_serial: false,   // serialized stock (IMEI / serial per unit)
    // Sector pack fields live flat on the form for editing and are folded
    // into `attributes` on save. See src/lib/sectorFields.js.
    attributes: {},
  });
  // Base units in one packet (0.25 KG for a 250 g pack). 0 when the product
  // is not sold by an alternate unit.
  const packConv = (() => {
    const c = parseFloat(formData.conversion_factor);
    return (formData.secondary_unit && c > 0) ? c : 0;
  })();
  // Text of the per-packet price box, kept separate so typing "3" on the
  // way to "30" is not rewritten under the cursor.
  const [packSell, setPackSell] = useState('');
  const packSellRef = React.useRef(false);
  // Pack-size solver: the shop starts from a shelf price and a margin, not from
  // a weight. Given both, the pack size is fixed — this works it out instead of
  // leaving them to guess a weight and check the margin afterwards.
  const [wantPrice, setWantPrice] = useState('');
  const [wantMargin, setWantMargin] = useState('25');
  // Pack size typed in grams / millilitres. The stored conversion is in the base
  // unit (0.25 KG), but nobody says "nought point two five of a kilo" — they say
  // 250 grams. This is the same number in the unit people actually speak.
  const [packSize, setPackSize] = useState('');
  const packSizeRef = React.useRef(false);
  const baseUnitUC = String(formData.unit || '').toUpperCase();
  const subUnit = baseUnitUC === 'KG' ? 'g' : baseUnitUC === 'LITRE' ? 'ml' : null;
  React.useEffect(() => {
    if (packSizeRef.current) { packSizeRef.current = false; return; }
    const c = parseFloat(formData.conversion_factor);
    setPackSize(subUnit && c > 0 ? String(Number((c * 1000).toFixed(3))) : '');
  }, [formData.conversion_factor, subUnit]);
  React.useEffect(() => {
    if (packSellRef.current) { packSellRef.current = false; return; }  // user typed here
    const base = parseFloat(formData.sellingPrice);
    setPackSell(packConv > 0 && base > 0 ? String(Number((base * packConv).toFixed(2))) : '');
  }, [formData.sellingPrice, packConv]);

  // A SERVICE product (labor / repair, no stock) gets the service UX in ANY
  // business mode — lets a retail shop keep products and add services together.
  // Same rule the save path and the tests use — a services tenant, or a
  // service item inside a retail one. Kept in one place so the fields the
  // form hides and the fields the save demands can never disagree again.
  const isService = isServiceForm({ businessType, product_type: formData.product_type });

  const [imageFile, setImageFile]     = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [saveError, setSaveError]     = useState(null);   // a check on the form, in words
  const [writeError, setWriteError]   = useState(null);   // what the save itself hit
  const formRef = useRef(null);
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
        // jsonb, and NOT NULL only from this migration forward — a row written
        // before it arrives as null, so an editor must not spread undefined
        // into the inputs.
        attributes: (editingProduct.attributes && typeof editingProduct.attributes === 'object')
          ? editingProduct.attributes : {},
      });
      setImagePreview(editingProduct.image || null);
    } else {
      setFormData({
        name: '', sku: '', category: '', unit: UNITS[0],
        costPrice: '', sellingPrice: '', wholesale_price: '', distributor_price: '', price_inclusive: false, tax_status: 'TAXABLE', stock: '', taxRate: 0, cess_rate: 0, hsn_code: '', taxSlab: 'Exempt', tags: '', image: '',
        lowStockThreshold: 10, min_margin: 0, barcode: '',
        // Omitted entirely before, so a new item started undefined and a
        // services tenant saved STANDARD rows through a service-looking form.
        product_type: defaultProductType(businessType),
        secondary_unit: '', conversion_factor: '',
        food_type: '', is_available: true, station: '', modifier_groups: [],
        duration_min: '',
        track_serial: false,
        attributes: {},
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
    setWriteError(null);

    try {
      // Pricing rules live in src/lib/itemForm.js so they can be tested
      // rather than only observed by opening this modal. A service has no cost
      // of goods and its Cost Price input is not rendered; demanding one anyway
      // made every save fail with an error naming a field that was not on
      // screen, and since service mode covers EVERY item in a SERVICES tenant,
      // that tenant could not add a single thing to its catalogue.
      const attrError = validateAttributes(formData.attributes, activePacks);
      if (attrError) { setSaveError(attrError); setUploading(false); return; }

      const priceError = validateItemPricing({ ...formData, businessType });
      if (priceError) {
        setSaveError(priceError);
        setUploading(false);
        return;
      }

      let imageUrl = formData.image || '';
      if (imageFile) {
        // Stored as a small thumbnail, never the camera original.
        const small = await shrinkImageFile(imageFile);
        if (small.error) {
          setSaveError(small.error);
          setUploading(false);
          return;
        }
        const { url, error } = await uploadProductImage(small.file, tenantId);
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
        // Services hold no stock and get a null threshold — see itemForm.js.
        ...stockFieldsFor({ ...formData, businessType }),
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
        track_serial: isService ? false : !!formData.track_serial,
        // Only keys the enabled packs declare, coerced, with blanks omitted
        // rather than stored as ''. A pack that is switched off contributes
        // nothing -- but note this also means turning a pack off stops SAVING
        // its fields while leaving whatever is already on the row untouched.
        attributes: cleanAttributes(formData.attributes, activePacks),
      };

      // Bound the save so a stalled request can't leave the button stuck on
      // "Saving…" forever — fail fast with a retry message instead.
      const withTimeout = (pr, ms) => Promise.race([
        pr,
        new Promise((_, rej) => setTimeout(() => rej(new Error('Save timed out — check your connection and try again')), ms)),
      ]);
      const result = await withTimeout(onSave(parsedData), 15000);
      if (result?.error) {
        setWriteError(result.error);
        return;
      }
      onClose();
    } catch (err) {
      // A timeout lands here: the request may still have reached the server,
      // so WriteFailure says it could not be confirmed and offers a re-read.
      setWriteError(err || new Error('Unexpected error — please try again'));
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

  // Esc cancels (this is a page, so the scroll is left alone); Ctrl or Cmd
  // Enter saves through the form's own submit, so every check still runs.
  useDialogClose(onClose, { enabled: !!isOpen, lockScroll: false });
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        formRef.current?.requestSubmit?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const c = parseFloat(formData.costPrice);
  const s = parseFloat(formData.sellingPrice);
  const showMargin = c > 0 && s > 0;
  // Margin on the selling price (lib/margin): the products table's figure
  // and the one the till's minimum-margin check uses.
  const margin = showMargin ? marginOnPrice(s, c) : 0;
  const marginColor = margin < 0 ? 'text-bad-text' : margin < 10 ? 'text-amber-text' : 'text-good-text';
  const pricingError = validateItemPricing({ ...formData, businessType });
  const steps = formSteps(formData, { pricingError, hasPhoto: !!imagePreview });
  const cur = '₹';
  const fx = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const taxStatus = formData.tax_status || 'TAXABLE';
  const slabIdx = TAX_SLABS_WITH_CESS.findIndex(
    sl => sl.value === Number(formData.taxRate) && sl.cess === Number(formData.cess_rate || 0));
  const set = (patch) => setFormData(f => ({ ...f, ...patch }));
  const jump = (id) => document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="flex flex-col pb-16">
      <div className="m-rise mb-[18px] flex flex-wrap items-center gap-3.5">
        <button type="button" onClick={onClose}
          className="m-press inline-flex items-center gap-1.5 font-tight text-[13px] font-semibold text-body hover:text-ink">
          <ChevronLeft size={15} /> Inventory
        </button>
        <h2 className="font-tight text-[20px] font-semibold tracking-[-0.02em]">{editingProduct ? 'Edit Product' : 'Add Product'}</h2>
        <span className="text-[13px] text-mute">{editingProduct ? 'Update product details' : 'Add a new product to inventory'}</span>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {/* 1 · Details */}
          <Sec id="f1" n={1} title="Details" hint="Name, codes and type">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="it-name">Name</Label>
                <Input id="it-name" required type="text" placeholder="Product name"
                  value={formData.name} onChange={e => set({ name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="it-sku">SKU</Label>
                <div className="flex gap-1.5">
                  <Input id="it-sku" required type="text" placeholder="SKU-0001" className="flex-1"
                    value={formData.sku} onChange={e => set({ sku: e.target.value })} />
                  <AssignBtn title="Auto-generate a SKU" onClick={() => {
                    // Derive a code from the product name (alphanumerics, up to 4 chars) + random suffix.
                    const base = (formData.name || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'SKU';
                    const sku = `${base}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
                    set({ sku });
                  }} />
                </div>
              </div>
              <div>
                <Label htmlFor="it-cat">Category</Label>
                <Input id="it-cat" list="category-suggestions" placeholder="Type or select category…"
                  value={formData.category} onChange={e => set({ category: e.target.value })} />
                <datalist id="category-suggestions">
                  {(productCategories.length > 0 ? productCategories.map(pc => pc.name) : DEFAULT_CATEGORIES)
                    .map(name => <option key={name} value={name} />)}
                </datalist>
                <Hint>Type a new one or pick from your categories</Hint>
              </div>
              <div>
                <Label htmlFor="it-barcode">Barcode, EAN-13, UPC or your own</Label>
                <div className="flex gap-1.5">
                  <Input id="it-barcode" type="text" placeholder="Scan or type barcode…" className="flex-1"
                    value={formData.barcode || ''} onChange={e => set({ barcode: e.target.value })} />
                  {/* genInternalBarcode retries against the codes already in
                      use: a duplicate barcode at the counter rings up the
                      wrong item, which is the one failure a barcode exists to
                      prevent. */}
                  <AssignBtn title="Auto-generate an EAN-13 barcode"
                    onClick={() => set({ barcode: genInternalBarcode(existingBarcodes || new Set()) })} />
                </div>
                <Hint>Scan or type. Assign never repeats a code already in use</Hint>
              </div>
              <div>
                <Label htmlFor="it-type">Product type</Label>
                <Select id="it-type" value={formData.product_type || 'STANDARD'} onChange={e => set({ product_type: e.target.value })}>
                  <option value="STANDARD">Standard, bought and sold</option>
                  <option value="SERVICE">Service, labour or repair (no stock)</option>
                  <option value="RAW">Raw material, used up and not sold</option>
                  <option value="FINISHED">Finished, manufactured</option>
                </Select>
                <Hint>Also Service, Raw material, Finished</Hint>
              </div>
            </div>

            {/* Serialized stock. Never offered for a service: the till demands
                a serial per unit at checkout, and a repair hour has none. */}
            {!isService && (
              <Toggle on={formData.track_serial} onClick={() => set({ track_serial: !formData.track_serial })}
                title="Track IMEI or serial per unit" hint="Phones and electronics: the serial is taken on purchase and sale" />
            )}

            {/* Service details */}
            {isService && (<>
              <Sub>Service details</Sub>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="it-dur">Duration, minutes</Label>
                  <Input id="it-dur" type="number" min="0" placeholder="30"
                    value={formData.duration_min} onChange={e => set({ duration_min: e.target.value })} />
                </div>
              </div>
            </>)}

            {/* Menu details, restaurant only */}
            {isResto && (<>
              <Sub>Menu details</Sub>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label>Food type</Label>
                  <div className="flex gap-1.5">
                    {[
                      { v: 'VEG', label: 'Veg', dot: 'bg-green-600' },
                      { v: 'NONVEG', label: 'Non-veg', dot: 'bg-red-600' },
                      { v: 'EGG', label: 'Egg', dot: 'bg-amber' },
                    ].map(o => (
                      <button key={o.v} type="button" aria-pressed={formData.food_type === o.v}
                        onClick={() => set({ food_type: formData.food_type === o.v ? '' : o.v })}
                        className={cn('m-press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-pill font-tight text-[13px] font-semibold',
                          formData.food_type === o.v ? 'bg-ink text-white' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
                        <span className={`h-2.5 w-2.5 rounded-sm ${o.dot}`} />{o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="it-station">Kitchen station, optional</Label>
                  <Input id="it-station" type="text" placeholder="Tandoor, Bar, Grill…"
                    value={formData.station || ''} onChange={e => set({ station: e.target.value })} />
                </div>
              </div>
              <label className="mt-3 flex cursor-pointer select-none items-center gap-2 text-[13px] text-ink-2">
                <CheckBox checked={formData.is_available !== false} label="Available on menu"
                  onChange={() => set({ is_available: formData.is_available === false })} />
                <b className="font-tight font-semibold">Available on menu</b>
                <span className="text-[12px] text-mute">untick to 86 it (mark out of stock)</span>
              </label>

              {/* Modifier groups */}
              <div className="mt-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-tight text-[12.5px] font-semibold text-ink-2">Modifiers <span className="font-normal text-mute">add-ons and variations</span></span>
                  <button type="button" onClick={addGroup} className="font-tight text-[12.5px] font-semibold text-amber-text hover:underline">+ Add group</button>
                </div>
                <div className="space-y-2.5">
                  {mgroups.map((g, i) => (
                    <div key={g.id || i} className="rounded-xl bg-tile p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Input value={g.name} onChange={e => updateGroup(i, { name: e.target.value })}
                          placeholder="Group name (Size, Add-ons…)" className="h-8 flex-1" aria-label="Group name" />
                        <label className="flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-mute">
                          <input type="checkbox" checked={!!g.multi} onChange={e => updateGroup(i, { multi: e.target.checked })} className="accent-amber" />
                          multi
                        </label>
                        <button type="button" onClick={() => removeGroup(i)} aria-label="Remove group" className="text-mute hover:text-bad-text"><X size={14} /></button>
                      </div>
                      <div className="space-y-1.5">
                        {(g.options || []).map((o, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <Input value={o.name} onChange={e => updateOption(i, oi, { name: e.target.value })}
                              placeholder="Option (Large, Extra cheese…)" className="h-8 flex-1" aria-label="Option" />
                            <span className="text-[12px] text-mute">₹</span>
                            <Input type="number" step="1" value={o.price} aria-label="Option price"
                              onChange={e => updateOption(i, oi, { price: parseFloat(e.target.value) || 0 })} className="h-8 w-20" />
                            <button type="button" onClick={() => removeOption(i, oi)} aria-label="Remove option" className="text-mute hover:text-bad-text"><X size={13} /></button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addOption(i)} className="text-[12px] font-semibold text-mute hover:text-amber-text">+ Option</button>
                      </div>
                    </div>
                  ))}
                  {mgroups.length === 0 && <p className="text-[12px] text-mute">No modifiers. Add a group for sizes or add-ons.</p>}
                </div>
              </div>
            </>)}

            {/* Sector pack fields — rendered from src/lib/sectorFields.js, so a
                new pack is an entry in that registry rather than more JSX
                here. A service holds no parts catalog. */}
            {packFields.length > 0 && !isService && (<>
              <Sub>Catalog details</Sub>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {packFields.map(f => (
                  <div key={f.key}>
                    <Label htmlFor={`it-pk-${f.key}`}>{f.label}</Label>
                    <Input id={`it-pk-${f.key}`}
                      type={f.type === 'number' ? 'number' : 'text'}
                      {...(f.min != null ? { min: f.min } : {})}
                      placeholder={f.placeholder || ''}
                      value={formData.attributes?.[f.key] ?? ''}
                      onChange={e => setFormData(d => ({ ...d, attributes: { ...(d.attributes || {}), [f.key]: e.target.value } }))} />
                    {f.hint && <Hint>{f.hint}</Hint>}
                  </div>
                ))}
              </div>
            </>)}
          </Sec>

          {/* 2 · Pricing and units */}
          <Sec id="f2" n={2} title={isService ? 'Pricing' : 'Pricing and Units'} hint={isService ? null : 'Stored per base unit'}>
            <div className={cn('grid grid-cols-1 gap-3', isService ? 'md:grid-cols-3' : 'md:grid-cols-3')}>
              {!isService && (
                <div>
                  <Label htmlFor="it-cost">Cost price, ₹</Label>
                  <Input id="it-cost" required type="number" step="0.01" placeholder="0.00"
                    value={formData.costPrice} onChange={e => set({ costPrice: e.target.value })} />
                </div>
              )}
              <div>
                <Label htmlFor="it-sell">
                  {isService ? 'Service price, ₹' : 'Selling price, ₹'}{formData.product_type === 'RAW' && <span className="font-normal text-mute">, optional</span>}
                </Label>
                <Input id="it-sell" required={formData.product_type !== 'RAW'} type="number" step="0.01" placeholder="0.00"
                  value={formData.sellingPrice} onChange={e => set({ sellingPrice: e.target.value })} />
              </div>
              {!isService && (<>
                <div>
                  <Label htmlFor="it-unit">Base unit</Label>
                  <Select id="it-unit" value={formData.unit} onChange={e => set({ unit: e.target.value })}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="it-unit2">Second unit, optional</Label>
                  <Select id="it-unit2" value={formData.secondary_unit || ''} onChange={e => set({ secondary_unit: e.target.value })}>
                    <option value="">None</option>
                    {UNITS.filter(u => u !== formData.unit).map(u => <option key={u} value={u}>{u}</option>)}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="it-conv">Conversion{formData.secondary_unit ? `, 1 ${formData.secondary_unit} = ? ${formData.unit}` : ''}</Label>
                  <Input id="it-conv" type="number" step="0.0001" min="0" placeholder="e.g. 24"
                    disabled={!formData.secondary_unit}
                    value={formData.conversion_factor} onChange={e => set({ conversion_factor: e.target.value })} />
                  {/* Live two-way readout — confirms the factor the moment it's
                      typed, and shows the reciprocal so a fraction like 0.25
                      reads plainly ("4 PACK = 1 KG"). */}
                  {(() => {
                    const f = parseFloat(formData.conversion_factor);
                    if (!formData.secondary_unit || !(f > 0)) return null;
                    const tidy = (n) => Number(n.toFixed(4)).toLocaleString('en-IN');
                    return (
                      <Hint className="tabular-nums">
                        1 {formData.secondary_unit} = <b className="font-semibold text-ink">{tidy(f)} {formData.unit}{subUnit ? ` (${tidy(f * 1000)} ${subUnit})` : ''}</b>
                        {' · '}{tidy(1 / f)} {formData.secondary_unit} = 1 {formData.unit}
                      </Hint>
                    );
                  })()}
                </div>
              </>)}
            </div>

            {/* Per-packet pricing. Cost and price are stored PER BASE UNIT,
                because stock, COGS and the below-cost guard all work in the
                base unit. This is the same numbers seen from the packet end,
                and the packet price is editable: type 30 and the per-KG price
                becomes 120. Nothing extra is stored. */}
            {!isService && packConv > 0 && (
              <div className="mt-3.5 rounded-xl bg-[#FFFAF2] px-4 py-3.5 shadow-[inset_0_0_0_1px_#F6E3C6]">
                <span className="block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-amber-text">
                  Per {formData.secondary_unit} · 1 {formData.secondary_unit} = {Number(packConv.toFixed(4))} {formData.unit}
                </span>
                <div className={cn('mt-2.5 grid grid-cols-2 items-end gap-3', subUnit ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
                  {subUnit && (
                    <div>
                      <Label htmlFor="it-pack">Pack size, {subUnit}</Label>
                      <Input id="it-pack" type="number" step="1" min="0" placeholder="250"
                        value={packSize}
                        onChange={e => {
                          const v = e.target.value;
                          packSizeRef.current = true;
                          setPackSize(v);
                          const n = parseFloat(v);
                          // Blank clears the conversion rather than writing 0,
                          // which would make one packet equal nothing.
                          setFormData(f => ({
                            ...f,
                            conversion_factor: v === '' ? '' : (n > 0 ? String(Number((n / 1000).toFixed(6))) : f.conversion_factor),
                          }));
                        }} />
                    </div>
                  )}
                  <div>
                    <span className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">Costs you</span>
                    <Ro>₹{((parseFloat(formData.costPrice) || 0) * packConv).toFixed(2)}</Ro>
                  </div>
                  <div>
                    <Label htmlFor="it-packsell">Sell at, ₹ per {formData.secondary_unit}</Label>
                    <Input id="it-packsell" type="number" step="0.01" placeholder="0.00"
                      value={packSell}
                      onChange={e => {
                        const v = e.target.value;
                        packSellRef.current = true;
                        setPackSell(v);
                        const n = parseFloat(v);
                        // Blank clears rather than writing 0 — an empty box must
                        // not silently make the product free.
                        setFormData(f => ({
                          ...f,
                          sellingPrice: v === '' ? '' : (n > 0 ? String(Number((n / packConv).toFixed(4))) : f.sellingPrice),
                        }));
                      }} />
                  </div>
                  <div>
                    <span className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">Margin</span>
                    <Ro cls={marginColor}>{showMargin ? `${margin.toFixed(1)}%` : '—'}</Ro>
                  </div>
                </div>
                <Hint className="mt-1.5">Margin is the same per {formData.unit} or per {formData.secondary_unit}, it is a ratio.</Hint>

                {/* Work the pack size out from the shelf price. Given a cost
                    per base unit, a shelf price and a margin FIX the weight.
                    Same margin as the rest of this screen: on the selling price.
                      sell = cost × size ÷ (1 − m/100)  ⇒  size = sell × (1 − m/100) ÷ cost
                    (lib/margin packSizeForMargin) */}
                {(parseFloat(formData.costPrice) > 0) && (() => {
                  const price = parseFloat(wantPrice);
                  const marginPc = parseFloat(wantMargin);
                  const cost = parseFloat(formData.costPrice);
                  const size = packSizeForMargin(price, marginPc, cost);
                  const isWeight = ['KG', 'LITRE'].includes(String(formData.unit || '').toUpperCase());
                  return (
                    <div className="mt-3 flex flex-wrap items-end gap-2.5 border-t border-[#F3E3C8] pt-3">
                      <Hint className="mt-0 w-full">Not sure of the pack size? Enter what you want to charge</Hint>
                      <div className="w-24">
                        <Label htmlFor="it-want">Sell at ₹</Label>
                        <Input id="it-want" type="number" step="0.01" placeholder="30" value={wantPrice} onChange={e => setWantPrice(e.target.value)} />
                      </div>
                      <div className="w-24">
                        <Label htmlFor="it-wantm">Margin % on price</Label>
                        <Input id="it-wantm" type="number" step="1" placeholder="25" value={wantMargin} onChange={e => setWantMargin(e.target.value)} />
                      </div>
                      {!(size > 0) && (wantPrice !== '' || wantMargin !== '') && (
                        <span className="pb-2 text-[12.5px] font-medium text-mute">
                          {!(price > 0) ? 'Enter the price you want to charge.' : marginPc >= 100 ? 'Margin must be under 100%.' : 'Margin cannot be negative.'}
                        </span>
                      )}
                      {size > 0 && (<>
                        <span className="pb-2 font-tight text-[14px] font-semibold tabular-nums">
                          = {isWeight ? `${Math.round(size * 1000)} g` : `${Number(size.toFixed(4))} ${formData.unit}`}
                          <small className="ml-1.5 font-sans text-[12px] font-medium text-mute">({Number(size.toFixed(4))} {formData.unit}) per {formData.secondary_unit}</small>
                        </span>
                        <Button size="xs" className="mb-1"
                          onClick={() => {
                            setFormData(f => ({
                              ...f,
                              conversion_factor: String(Number(size.toFixed(4))),
                              sellingPrice: String(Number((price / size).toFixed(4))),
                            }));
                            packSellRef.current = true;
                            setPackSell(String(Number(price.toFixed(2))));
                            packSizeRef.current = true;
                            setPackSize(subUnit ? String(Math.round(size * 1000)) : '');
                          }}>
                          Use this
                        </Button>
                        <Hint className="mt-0 w-full tabular-nums">
                          That pack costs ₹{(size * cost).toFixed(2)} and sells at ₹{price.toFixed(2)}, ₹{(price / size).toFixed(2)} per {formData.unit}.
                        </Hint>
                      </>)}
                    </div>
                  );
                })()}
              </div>
            )}

            {!isService && (<>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="font-tight text-[12.5px] font-semibold text-ink-2">Price tiers</span>
                <label className="inline-flex cursor-pointer items-center gap-[7px] text-[12.5px] text-ink-2">
                  <CheckBox checked={!!formData.price_inclusive} label="Prices include tax"
                    onChange={() => set({ price_inclusive: !formData.price_inclusive })} />
                  Prices include tax
                </label>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <Label htmlFor="it-wh">Wholesale, ₹ (bulk)</Label>
                  <Input id="it-wh" type="number" step="0.01" placeholder="0.00"
                    value={formData.wholesale_price} onChange={e => set({ wholesale_price: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="it-dist">Distributor, ₹ (reseller)</Label>
                  <Input id="it-dist" type="number" step="0.01" placeholder="0.00"
                    value={formData.distributor_price} onChange={e => set({ distributor_price: e.target.value })} />
                </div>
                <Hint className="self-center">Retail is the selling price above. Distributor is your lowest rate.</Hint>
              </div>

              {/* Margin indicator + floor guard */}
              <div className="mt-3 grid grid-cols-1 items-end gap-3 md:grid-cols-3">
                <div>
                  <span className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">Current margin</span>
                  <div className="flex h-9 items-center justify-between rounded-[10px] bg-tile px-3 text-[13.5px]">
                    <span className="text-body">On price</span>
                    <b className={cn('font-tight font-semibold tabular-nums', showMargin ? marginColor : 'text-mute')}>
                      {showMargin ? `${margin.toFixed(1)}%${margin < 0 ? ' · loss' : margin < 10 ? ' · low' : ''}` : '—'}
                    </b>
                  </div>
                </div>
                <div>
                  <Label htmlFor="it-minm">Minimum margin, %</Label>
                  <Input id="it-minm" type="number" step="1" min="0" max="100" placeholder="e.g. 15"
                    value={formData.min_margin} onChange={e => set({ min_margin: e.target.value })} />
                </div>
                <Hint className="self-center">The till warns or blocks a sale below this margin</Hint>
              </div>
            </>)}
          </Sec>

          {/* 3 · Tax */}
          <Sec id="f3" n={3} title="Tax" hint="Used on invoices and at the till">
            <span className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">Tax status</span>
            <div role="radiogroup" aria-label="Tax status" className="flex flex-wrap gap-1.5">
              {[
                { id: 'TAXABLE', label: 'Taxable' },
                { id: 'EXEMPT', label: 'Exempt or nil' },
                { id: 'NONGST', label: 'Non-GST' },
              ].map(st => (
                <button key={st.id} type="button" role="radio" aria-checked={taxStatus === st.id}
                  onClick={() => set({ tax_status: st.id, ...(st.id !== 'TAXABLE' ? { taxRate: 0, cess_rate: 0 } : {}) })}
                  className={cn('m-press rounded-pill px-3.5 py-2 font-tight text-[13px] font-semibold',
                    taxStatus === st.id ? 'bg-ink text-white' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
                  {st.label}
                </button>
              ))}
            </div>
            {taxStatus === 'TAXABLE' && (
              <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="it-slab">GST slab</Label>
                  <Select id="it-slab" value={slabIdx}
                    onChange={(e) => {
                      const sl = TAX_SLABS_WITH_CESS[Number(e.target.value)];
                      if (sl) set({ taxRate: sl.value, cess_rate: sl.cess });
                    }}>
                    {/* When the saved combo isn't a standard slab, findIndex returns -1 */}
                    {slabIdx === -1 && (
                      <option value={-1}>{`${Number(formData.taxRate) || 0}%${Number(formData.cess_rate) ? ` + ${Number(formData.cess_rate)}% Cess` : ''} (custom)`}</option>
                    )}
                    {TAX_SLABS_WITH_CESS.map((sl, i) => <option key={i} value={i}>{sl.label}</option>)}
                  </Select>
                  <Hint>GST and cess. Applied on invoices and at the till</Hint>
                </div>
                {/* HSN for goods, SAC for services — one column, see lib/hsn.js. */}
                <div>
                  <Label htmlFor="it-hsn">{isService ? 'SAC code' : 'HSN code'}</Label>
                  <Input id="it-hsn" type="text" inputMode="numeric" maxLength={8}
                    placeholder={isService ? 'e.g. 998313' : 'e.g. 39231090'}
                    value={formData.hsn_code || ''} onChange={(e) => set({ hsn_code: e.target.value.replace(/[^0-9]/g, '') })} />
                  <Hint>
                    {isService
                      ? 'Services use a 6-digit SAC. Needed for the GSTR-1 summary (Table 12)'
                      : 'Needed for the GSTR-1 HSN summary (Table 12)'}
                  </Hint>
                </div>
              </div>
            )}
          </Sec>

          {/* 4 · Photo */}
          <Sec id="f4" n={4} title="Photo" hint="Kept as a small thumbnail">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="relative">
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="Product" className="h-[72px] w-[72px] rounded-[14px] object-cover" />
                    <button type="button" aria-label="Remove photo"
                      onClick={() => { setImagePreview(null); setImageFile(null); setFormData(f => ({ ...f, image: '' })); }}
                      className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-xl bg-ink text-white"><X size={11} /></button>
                  </>
                ) : (
                  <ProductAvatar product={{ name: formData.name || 'New product', category: formData.category }} size="lg" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()}><Upload /> Upload new photo</Button>
                <Button variant="secondary" onClick={openPhotoLib}><Images /> Choose from library</Button>
                <Hint className="mt-0 w-full">Up to 5 MB · JPG, PNG, WEBP</Hint>
              </div>
              <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>

            {showPhotoLib && (
              <div className="mt-3 rounded-xl bg-tile p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-tight text-[12.5px] font-semibold text-ink-2">Recent photos</span>
                  <button type="button" onClick={() => setShowPhotoLib(false)} aria-label="Close photo library"><X size={14} className="text-mute hover:text-ink" /></button>
                </div>
                {libLoading ? (
                  <div className="flex items-center justify-center py-6"><Loader2 size={18} className="animate-spin text-mute" /></div>
                ) : libPhotos.length === 0 ? (
                  <div className="py-6 text-center text-[12.5px] text-mute">No photos uploaded yet. Upload your first photo above.</div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {libPhotos.map(photo => (
                      <button key={photo.name} type="button" data-card onClick={() => selectLibPhoto(photo.url)}
                        className={cn('relative aspect-square overflow-hidden rounded-lg border-2 transition-opacity hover:opacity-90',
                          formData.image === photo.url ? 'border-amber' : 'border-transparent')}>
                        <img src={photo.url} alt={photo.name} className="h-full w-full object-cover" />
                        {formData.image === photo.url && (
                          <div className="absolute inset-0 flex items-center justify-center bg-amber/20"><CheckCircle2 size={16} className="text-amber" /></div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => { fileInputRef.current?.click(); setShowPhotoLib(false); }}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-pill py-2 text-[12px] font-semibold text-mute shadow-[inset_0_0_0_1px_var(--color-line)] hover:text-amber-text">
                  <Upload size={11} /> Upload new photo
                </button>
              </div>
            )}
          </Sec>
        </div>

        {/* Summary */}
        <aside className="m-rise lg:sticky lg:top-4">
          <div className="overflow-hidden rounded-[14px] bg-surface shadow-[inset_0_0_0_1px_var(--color-line)]">
            <div className="flex items-center gap-3 border-b border-sep px-[18px] py-4">
              {imagePreview
                ? <img src={imagePreview} alt="" aria-hidden="true" className="h-[34px] w-[34px] shrink-0 rounded-[9px] object-cover" />
                : <ProductAvatar product={{ name: formData.name || 'New product', category: formData.category }} />}
              <div className="min-w-0">
                <b className="block truncate font-tight text-[14.5px] font-semibold">{formData.name || 'New product'}</b>
                <small className="block truncate text-[12px] text-mute">{[formData.category, formData.sku].filter(Boolean).join(' · ') || 'No category yet'}</small>
              </div>
            </div>
            <div className="px-[18px] pt-1.5 pb-3">
              <SumRow label="Sells at" value={s > 0 ? `${cur}${fx(s)}${isService ? '' : ` / ${formData.unit}`}` : '—'} />
              {!isService && packConv > 0 && s > 0 && <SumRow label={`Per ${formData.secondary_unit}`} value={`${cur}${fx(s * packConv)}`} />}
              {!isService && <SumRow label="Margin on price" value={showMargin ? `${margin.toFixed(1)}%` : '—'} cls={showMargin ? marginColor : ''} />}
              <SumRow label="GST" value={taxStatus === 'TAXABLE'
                ? `${Number(formData.taxRate) || 0}%${Number(formData.cess_rate) ? ` + ${Number(formData.cess_rate)}% cess` : ''}${formData.hsn_code ? ` · ${isService ? 'SAC' : 'HSN'} ${formData.hsn_code}` : ''}`
                : taxStatus === 'EXEMPT' ? 'Exempt or nil' : 'Non-GST'} />
            </div>
            <nav aria-label="Form sections" className="border-t border-sep px-2.5 py-3">
              {steps.map((st, i) => (
                <button key={st.key} type="button" data-card onClick={() => jump(st.key)}
                  className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left text-[13px] text-ink-2 hover:bg-tile', i === 0 && 'bg-tile font-semibold text-ink')}>
                  <i className={cn('grid h-[18px] w-[18px] place-items-center rounded-full font-tight text-[10.5px] font-semibold not-italic',
                    st.state === 'done' ? 'bg-good-soft text-good-text' : 'bg-well text-mute')}>{st.n}</i>
                  {st.label}
                  <small className="ml-auto text-[11.5px] text-mute">{st.state === 'done' ? 'Done' : st.state === 'optional' ? 'Optional' : 'To do'}</small>
                </button>
              ))}
            </nav>
            <div className="grid gap-2 border-t border-sep px-[18px] pt-3.5 pb-4">
              {saveError && (
                <div role="alert" className="rounded-[10px] bg-bad-soft px-3 py-2.5 text-[12.5px] font-medium text-bad-text">{saveError}</div>
              )}
              <WriteFailure error={writeError} noun="product" onReread={onReread} />
              <Button type="submit" disabled={uploading} className="h-11">
                {uploading ? 'Saving…' : editingProduct ? 'Save changes' : 'Save product'}
              </Button>
              <Button variant="secondary" className="h-11" onClick={onClose}>Cancel</Button>
              <Hint className="mt-0 text-center">Ctrl Enter saves · Esc cancels</Hint>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
};

const SumRow = ({ label, value, cls = '' }) => (
  <div className="flex justify-between gap-3 border-t border-sep py-2 text-[13px] first:border-t-0">
    <span className="text-body">{label}</span>
    <span className={cn('text-right font-tight font-medium tabular-nums text-ink-2', cls)}>{value}</span>
  </div>
);

// Form pieces live at module scope: defined inside the component they would
// be new types on every keystroke, and React would remount the inputs in
// them and drop the focus.
const Sec = ({ id, n, title, hint, children }) => (
  <section id={`item-${id}`} className="m-rise mb-3.5 scroll-mt-4 rounded-[14px] bg-surface px-5 py-[18px] shadow-[inset_0_0_0_1px_var(--color-line)]">
    <div className="mb-3.5 flex items-baseline gap-2.5">
      <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-well font-tight text-[11px] font-semibold text-mute">{n}</span>
      <h3 className="font-tight text-[15px] font-semibold">{title}</h3>
      {hint && <span className="text-[12px] text-mute">{hint}</span>}
    </div>
    {children}
  </section>
);
const Sub = ({ children }) => <h4 className="mt-4 mb-2.5 border-t border-sep pt-3.5 font-tight text-[13px] font-semibold text-ink-2">{children}</h4>;
const AssignBtn = ({ onClick, title }) => (
  <button type="button" onClick={onClick} title={title}
    className="m-press inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-pill px-3 font-tight text-[12.5px] font-semibold text-amber-text shadow-[inset_0_0_0_1px_#F3D3A6] hover:bg-amber-soft">
    <Wand2 size={13} /> Assign
  </button>
);
const Toggle = ({ on, onClick, title, hint }) => (
  <div className="mt-3.5 flex items-center gap-3 border-t border-sep pt-3.5">
    <button type="button" role="switch" aria-checked={!!on} aria-label={title} onClick={onClick}
      className={cn('relative h-[21px] w-9 shrink-0 rounded-pill transition-colors duration-(--dur-press)', on ? 'bg-amber' : 'bg-[#D7DADE]')}>
      <span className={cn('absolute top-0.5 h-[17px] w-[17px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[left] duration-(--dur-press)', on ? 'left-[17px]' : 'left-0.5')} />
    </button>
    <div>
      <b className="block font-tight text-[13.5px] font-semibold">{title}</b>
      <small className="text-[12px] text-mute">{hint}</small>
    </div>
  </div>
);
const Ro = ({ children, cls = '' }) => <div className={cn('flex h-9 items-center font-tight text-[15px] font-semibold tabular-nums', cls)}>{children}</div>;


export default AddItemModal;
