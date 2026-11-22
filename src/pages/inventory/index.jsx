import React, { useState, useMemo, useEffect, useRef } from 'react';
import { isRaw, isStocked } from '../../lib/productTypes';
import { useDialogClose } from '../../hooks/useDialogClose';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useInventory } from '../../hooks/useInventory';
import { useOrders } from '../../hooks/useOrders';
import { Plus, History, PackagePlus, Tag as TagIcon, Search, X, ArrowLeftRight, ChevronDown } from 'lucide-react';
import SegmentedTabs from '../../components/motion/SegmentedTabs';
import StockTable from './components/StockTable';
import AddItemModal from './components/AddItemModal';
import BatchesModal from './components/BatchesModal';
import PriceListsModal from './components/PriceListsModal';
import StockAdjustModal from './components/StockAdjustModal';
import StockHistoryModal from './components/StockHistoryModal';
import TransferStockModal from './components/TransferStockModal';
import ItemDetailView from './components/ItemDetailView';
import { PageSkeleton } from '../../components/ui/States';

const Inventory = () => {
  const { currentUser, isOwner } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { 
    products, 
    productCategories: categories, 
    inventoryBalances: balances,
    inventoryLocations,
    loading,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustStock,
    transferStock
  } = useInventory(currentTenantId);

  const { priceLists, upsertPrice, deletePrice } = useOrders(currentTenantId);
  const navigate = useNavigate();
  const [viewingProduct, setViewingProduct] = useState(null);

  // Last purchase rate per product = the newest batch's unit_cost. Distinct
  // from products.costPrice (the weighted average of open batches): this is
  // today's restock cost, the number that answers "is my price above what it
  // now costs me to buy". Lean select — just the three columns needed.
  const [lastBuy, setLastBuy] = useState({});
  useEffect(() => {
    if (!currentTenantId) return;
    let cancelled = false;
    supabase
      .from('product_batches')
      .select('product_id, unit_cost, received_date')
      .eq('tenant_id', currentTenantId)
      .order('received_date', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const m = {};
        // First row per product = newest received = last buy.
        data.forEach(b => { if (!(b.product_id in m)) m[b.product_id] = Number(b.unit_cost); });
        setLastBuy(m);
      });
    return () => { cancelled = true; };
  }, [currentTenantId, products.length]);

  const [showAddModal,    setShowAddModal]    = useState(false);
  const [editingProduct,  setEditingProduct]  = useState(null);
  const [batchesFor,      setBatchesFor]      = useState(null);
  const [showPriceLists,  setShowPriceLists]  = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [bulkEdit, setBulkEdit] = useState(null); // { products, clear }
  const [adjustSaving,     setAdjustSaving]     = useState(false);
  const [showHistory,      setShowHistory]      = useState(false);
  const [showTransfer,     setShowTransfer]     = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDown = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [moreOpen]);

  // "/" jumps to search unless the user is already typing in a field.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Filter + search state
  const [searchTerm,   setSearchTerm]   = useState('');
  const [typeFilter,   setTypeFilter]   = useState('ALL');   // ALL | STANDARD | RAW | FINISHED
  const [stockFilter,  setStockFilter]  = useState('ALL');   // ALL | IN | LOW | OUT
  const [categoryFilter, setCategoryFilter] = useState('');

  // Every barcode already in use, so "Assign" in the item form cannot mint one
  // a product already carries. A duplicate barcode rings up the wrong item at
  // the counter, which is the single failure a barcode exists to prevent.
  const existingBarcodes = useMemo(
    () => new Set((products || []).map(p => p.barcode).filter(Boolean)),
    [products]);

  const categoryOptions = useMemo(() => {
    const set = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter(p => {
      if (q) {
        const hay = `${p.name || ''} ${p.sku || ''} ${p.category || ''} ${p.barcode || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter !== 'ALL') {
        if ((p.product_type || 'STANDARD').toUpperCase() !== typeFilter) return false;
      }
      if (categoryFilter && (p.category || '') !== categoryFilter) return false;
      // The stock chips ask a question a service cannot answer, so it is not
      // in any of the three answers rather than always being "Out".
      if (stockFilter !== 'ALL' && !isStocked(p)) return false;
      const stk = Number(p.stock || 0);
      if (stockFilter === 'IN'  && stk <= 0) return false;
      if (stockFilter === 'LOW' && !(stk > 0 && stk <= 5)) return false;
      if (stockFilter === 'OUT' && stk !== 0) return false;
      return true;
    });
  }, [products, searchTerm, typeFilter, stockFilter, categoryFilter]);

  const activeFilterCount =
    (searchTerm ? 1 : 0) + (typeFilter !== 'ALL' ? 1 : 0) +
    (stockFilter !== 'ALL' ? 1 : 0) + (categoryFilter ? 1 : 0);
  const clearAllFilters = () => {
    setSearchTerm(''); setTypeFilter('ALL'); setStockFilter('ALL'); setCategoryFilter('');
  };

  const kpis = useMemo(() => {
    // Raw materials are held to be manufactured with, not sold, so they
    // legitimately carry no selling price. Summing retail across everything
    // therefore counted their cost against zero revenue: three RAW items
    // (210ml side wall, AP BOTTOM, 150ML CUP WALL — 740 units, ₹83,994) dragged
    // the headline margin to 0.6% on a business trading at roughly 23%.
    //
    // Retail is now measured over sellable stock only, and the raw material is
    // shown as its own figure rather than hidden — it is real money, just not
    // money that has a retail price.
    // isRaw/isStocked come from lib/productTypes.js; this file used to
    // re-derive isRaw inline and had no notion of a service at all.
    const sellable = products.filter(p => !isRaw(p));
    const raw      = products.filter(isRaw);
    // Only things that can actually run out belong in a stock count.
    const stocked  = products.filter(isStocked);

    const val = (list, field) => list.reduce((s, p) => s + (p[field] || 0) * (p.stock || 0), 0);

    const stockValue    = val(products, 'costPrice');      // everything on hand, at cost
    const sellableCost  = val(sellable, 'costPrice');
    const retailValue   = val(sellable, 'sellingPrice');   // only what can actually be sold
    const rawValue      = val(raw, 'costPrice');
    const marginValue   = retailValue - sellableCost;

    const lowStock     = stocked.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= 5).length;
    // Every service reads 0, so this counted the whole service catalogue as
    // out of stock.
    const outOfStock   = stocked.filter(p => (p.stock || 0) === 0).length;
    const totalUnits   = stocked.reduce((s, p) => s + (p.stock || 0), 0);
    const uniqueCats   = new Set(products.map(p => p.category).filter(Boolean)).size;
    return {
      stockValue, retailValue, rawValue, marginValue, sellableCost,
      rawCount: raw.length, lowStock, outOfStock, totalUnits, uniqueCats,
    };
  }, [products]);

  const openAddModal = () => {
    setEditingProduct(null);
    setShowAddModal(true);
  };

  const openEditModal = (p) => {
    setEditingProduct(p);
    setShowAddModal(true);
  };

  const getStock = (product) => {
    const fromBalances = balances
      .filter(b => b.product_id === product.id)
      .reduce((s, b) => s + Number(b.quantity), 0);
    return fromBalances || Number(product.stock) || 0;
  };

  const handleAdjust = async (productId, delta, reason, locationId, unitCost) => {
    setAdjustSaving(true);
    const result = await adjustStock(productId, delta, reason, locationId ?? null, unitCost);
    setAdjustSaving(false);
    return result;
  };

  const handleSaveProduct = async (data) => {
    if (editingProduct) {
      const { error } = await updateProduct(editingProduct.id, data);
      return { error };
    } else {
      const { error } = await addProduct(data);
      return { error };
    }
  };

  if (loading) return <PageSkeleton cards={4} rows={10} />;

  const cur = businessProfile?.currencySymbol || '₹';
  const inr = (n) => Math.round(n).toLocaleString('en-IN');
  const hasNonStandard = products.some(p => (p.product_type || 'STANDARD').toUpperCase() !== 'STANDARD');
  const toggleStock = (k) => setStockFilter(f => (f === k ? 'ALL' : k));
  const tiles = [
    { key: 'cost', label: 'Stock value at cost', value: `${cur}${inr(kpis.stockValue)}`,
      sub: `${kpis.totalUnits.toLocaleString('en-IN')} units${kpis.rawValue > 0 ? ` · incl. ${cur}${inr(kpis.rawValue)} raw material` : ''}` },
    { key: 'retail', label: 'Retail value', value: `${cur}${inr(kpis.retailValue)}`,
      sub: kpis.marginValue !== 0 ? `${kpis.marginValue >= 0 ? '+' : '−'}${cur}${inr(Math.abs(kpis.marginValue))} margin` : 'sellable stock',
      subCls: kpis.marginValue > 0 ? 'text-emerald-600' : kpis.marginValue < 0 ? 'text-red-600' : '' },
    { key: 'LOW', label: 'Low stock', value: kpis.lowStock, sub: 'products', n: kpis.lowStock, cls: 'text-accent-signature-hover' },
    { key: 'OUT', label: 'Out of stock', value: kpis.outOfStock, sub: 'products', n: kpis.outOfStock, cls: 'text-[color:var(--color-neg)]' },
  ];

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex justify-between items-center gap-3 py-2 border-b border-border/60">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground tracking-tight">Inventory</h1>
          <p className="text-xs text-muted-foreground tabular-nums">{products.length} products · {kpis.uniqueCats} categories</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreOpen(o => !o)} aria-haspopup="menu" aria-expanded={moreOpen}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill bg-card border border-border/60 text-foreground text-xs font-semibold hover:bg-black/[0.03] transition-colors active:scale-[0.97]">
              More <ChevronDown size={14} className="text-muted-foreground" />
            </button>
            {moreOpen && (
              <div role="menu" style={{ transformOrigin: 'top right' }}
                className="menu-pop absolute right-0 top-full mt-1.5 z-30 min-w-[180px] rounded-xl bg-card border border-border shadow-lg p-1">
                {[
                  { label: 'Price lists', icon: TagIcon, run: () => setShowPriceLists(true) },
                  ...(inventoryLocations.length > 1 ? [{ label: 'Transfer stock', icon: ArrowLeftRight, run: () => setShowTransfer(true) }] : []),
                  { label: 'Stock history', icon: History, run: () => setShowHistory(true) },
                  { label: 'Bulk import', icon: PackagePlus, run: () => { window.location.href = '/bulk-add?type=products'; } },
                ].map(({ label, icon: Icon, run }) => (
                  <button key={label} role="menuitem" onClick={() => { setMoreOpen(false); run(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-pill text-xs font-medium text-foreground hover:bg-black/[0.04] text-left">
                    <Icon size={14} className="text-muted-foreground" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={openAddModal}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-pill bg-accent-signature text-white text-xs font-semibold hover:bg-accent-signature-hover transition-colors active:scale-[0.97]">
            <Plus size={16} strokeWidth={2.5} /> Add product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {tiles.map(t => {
          const clickable = t.n > 0;
          const active = clickable && stockFilter === t.key;
          const body = (
            <>
              <div className="text-xs text-muted-foreground">{t.label}</div>
              <div className={`text-[22px] font-semibold tabular-nums tracking-tight mt-1 ${clickable ? t.cls : 'text-foreground'}`}>{t.value}</div>
              <div className={`text-[11px] mt-0.5 tabular-nums text-muted-foreground ${t.subCls || ''}`}>{t.sub}</div>
            </>
          );
          const base = `text-left rounded-2xl border bg-card px-4 py-3 ${active ? 'border-accent-signature' : 'border-border/60'}`;
          return clickable ? (
            <button key={t.key} onClick={() => toggleStock(t.key)} aria-pressed={active}
              className={`${base} hover:border-black/20 transition-[border-color,transform] duration-(--dur-press) active:scale-[0.98]`}>{body}</button>
          ) : (
            <div key={t.key} className={base}>{body}</div>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input ref={searchRef} type="text" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape' && searchTerm) { e.stopPropagation(); setSearchTerm(''); } }}
            placeholder="Search name, SKU or barcode"
            className="w-full pl-10 pr-9 h-10 bg-card border border-border rounded-xl text-sm font-medium text-foreground placeholder:text-muted-foreground placeholder:font-normal outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-[border-color,box-shadow]" />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>

        <SegmentedTabs
          items={[{ key: 'ALL', label: 'All' }, { key: 'LOW', label: 'Low' }, { key: 'OUT', label: 'Out' }]}
          value={['ALL', 'LOW', 'OUT'].includes(stockFilter) ? stockFilter : 'ALL'}
          onChange={setStockFilter} />

        {hasNonStandard && (
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Product type"
            className="bg-card border border-border rounded-xl px-3 h-10 text-xs font-medium text-foreground outline-none focus:border-accent-signature">
            <option value="ALL">All types</option>
            <option value="STANDARD">Standard</option>
            <option value="SERVICE">Services</option>
            <option value="RAW">Raw material</option>
            <option value="FINISHED">Finished</option>
          </select>
        )}

        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} aria-label="Category"
          className="bg-card border border-border rounded-xl px-3 h-10 text-xs font-medium text-foreground outline-none focus:border-accent-signature min-w-[140px]">
          <option value="">All categories</option>
          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {activeFilterCount > 0 && (
          <button onClick={clearAllFilters}
            className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 whitespace-nowrap px-1">
            Clear filters
          </button>
        )}
      </div>

      <StockTable
        products={filteredProducts}
        totalProducts={products.length}
        onClearFilters={clearAllFilters}
        onAddProduct={openAddModal}
        inventoryBalances={balances}
        lastBuy={lastBuy}
        currencySymbol={cur}
        onView={setViewingProduct}
        onEdit={openEditModal}
        onDelete={(id) => { if (window.confirm('Delete this product?')) deleteProduct(id); }}
        onAdjust={isOwner ? (product) => setAdjustingProduct(product) : null}
        onBatches={setBatchesFor}
        onBulkEdit={isOwner ? (prods, clear) => setBulkEdit({ products: prods, clear }) : null}
        onBulkDelete={isOwner ? async (prods, clear) => {
          if (!window.confirm(`Delete ${prods.length} selected product${prods.length === 1 ? '' : 's'}?`)) return;
          for (const p of prods) await deleteProduct(p.id);
          clear();
        } : null}
      />
      {products.length > 0 && filteredProducts.length > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums -mt-3">
          Showing {filteredProducts.length} of {products.length} products
        </p>
      )}

      {bulkEdit && (
        <BulkEditModal
          count={bulkEdit.products.length}
          categories={categoryOptions}
          onClose={() => setBulkEdit(null)}
          onApply={async (patch) => {
            for (const p of bulkEdit.products) {
              const updates = {};
              if (patch.category) updates.category = patch.category;
              if (patch.reorder !== '') updates.lowStockThreshold = Number(patch.reorder);
              if (patch.pricePct !== '') {
                const pct = Number(patch.pricePct) / 100;
                updates.sellingPrice = Math.round(Number(p.sellingPrice || 0) * (1 + pct) * 100) / 100;
              }
              if (patch.sellPrice !== '') updates.sellingPrice = Number(patch.sellPrice);
              if (patch.gstRate !== '') updates.taxRate = Number(patch.gstRate);
              if (Object.keys(updates).length) await updateProduct(p.id, updates);
            }
            bulkEdit.clear();
            setBulkEdit(null);
          }}
        />
      )}

      {viewingProduct && (
        <ItemDetailView
          product={viewingProduct}
          items={filteredProducts}
          onSelect={setViewingProduct}
          locations={inventoryLocations || []}
          balances={balances || []}
          tenantId={currentTenantId}
          currencySymbol={businessProfile?.currencySymbol || '₹'}
          onClose={() => setViewingProduct(null)}
          onEdit={(p) => { setViewingProduct(null); openEditModal(p); }}
          onAdjust={isOwner ? (p) => { setViewingProduct(null); setAdjustingProduct(p); } : null}
          onPrintBarcode={() => navigate('/labels')}
          onReorder={(p) => navigate(`/purchases?reorder=${encodeURIComponent(p.id)}`)}
          onDelete={(p) => { if (window.confirm('Delete this product?')) { deleteProduct(p.id); setViewingProduct(null); } }}
        />
      )}

      <AddItemModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveProduct}
        editingProduct={editingProduct}
        productCategories={categories}
        tenantId={currentTenantId}
        /* So "Assign" cannot mint a code another product already has. */
        existingBarcodes={existingBarcodes}
      />

      <BatchesModal
        isOpen={!!batchesFor}
        onClose={() => setBatchesFor(null)}
        product={batchesFor}
        currencySymbol={businessProfile?.currencySymbol || '₹'}
      />

      <PriceListsModal
        isOpen={showPriceLists}
        onClose={() => setShowPriceLists(false)}
        products={products}
        priceLists={priceLists}
        onUpsert={upsertPrice}
        onDelete={deletePrice}
        currencySymbol={businessProfile?.currencySymbol || '₹'}
      />

      {adjustingProduct && (
        <StockAdjustModal
          product={adjustingProduct}
          currentStock={getStock(adjustingProduct)}
          onConfirm={handleAdjust}
          onClose={() => setAdjustingProduct(null)}
          saving={adjustSaving}
        />
      )}

      {showTransfer && (
        <TransferStockModal
          products={products}
          locations={inventoryLocations}
          balances={balances}
          onTransfer={transferStock}
          onClose={() => setShowTransfer(false)}
          userId={currentUser?.id || currentUser?.email || null}
        />
      )}

      {showHistory && (
        <StockHistoryModal
          tenantId={currentTenantId}
          products={products}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
};

// Bulk edit — blank fields are left unchanged on every selected product.
const BulkEditModal = ({ count, categories, onClose, onApply }) => {
  useDialogClose(onClose);
  const [f, setF] = useState({ category: '', pricePct: '', sellPrice: '', reorder: '', gstRate: '' });
  const [saving, setSaving] = useState(false);
  const dirty = f.category || f.pricePct !== '' || f.sellPrice !== '' || f.reorder !== '' || f.gstRate !== '';
  const inp = 'w-full text-[13px] border border-border rounded-lg px-3 py-2 outline-none focus:border-accent-signature/40 bg-card';
  const lbl = 'text-xs font-medium text-muted-foreground mb-1 block';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Bulk edit" className="dialog-pop bg-card rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-1">
          <div className="font-semibold text-[15px] text-foreground">Bulk edit</div>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <p className="text-[11px] text-muted-foreground mb-4">{count} products selected · blank fields stay unchanged</p>

        <label className={lbl}>Category</label>
        <select className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          <option value="">— keep current —</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label className={lbl}>Price change %</label>
            <input type="number" step="0.1" placeholder="e.g. 5 or -10" className={inp}
              value={f.pricePct} onChange={(e) => setF({ ...f, pricePct: e.target.value, sellPrice: '' })} />
          </div>
          <div>
            <label className={lbl}>Or set sell price</label>
            <input type="number" step="0.01" placeholder="fixed price" className={inp}
              value={f.sellPrice} onChange={(e) => setF({ ...f, sellPrice: e.target.value, pricePct: '' })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label className={lbl}>Reorder level</label>
            <input type="number" placeholder="low-stock threshold" className={inp}
              value={f.reorder} onChange={(e) => setF({ ...f, reorder: e.target.value })} />
          </div>
          <div>
            <label className={lbl}>GST rate</label>
            <select className={inp} value={f.gstRate} onChange={(e) => setF({ ...f, gstRate: e.target.value })}>
              <option value="">— keep current —</option>
              <option value="0">0% (exempt / unregistered)</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
          </div>
        </div>

        <button
          disabled={!dirty || saving}
          onClick={async () => { setSaving(true); try { await onApply(f); } finally { setSaving(false); } }}
          className="w-full mt-5 py-2.5 rounded-pill text-[13px] font-semibold bg-accent-signature text-white hover:opacity-90 disabled:opacity-40 transition-opacity">
          {saving ? 'Applying…' : `Apply to ${count} products`}
        </button>
      </div>
    </div>
  );
};

export default Inventory;
