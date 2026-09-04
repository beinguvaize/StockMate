import React, { useState, useMemo, useEffect } from 'react';
import { useDialogClose } from '../../hooks/useDialogClose';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useInventory } from '../../hooks/useInventory';
import { useOrders } from '../../hooks/useOrders';
import { Plus, History, PackagePlus, AlertCircle, Tag as TagIcon, TrendingUp, DollarSign, BarChart3, ShoppingBag, Search, X, Filter } from 'lucide-react';
import Button from '../../shared/Button';
import StockTable from './components/StockTable';
import AddItemModal from './components/AddItemModal';
import BatchesModal from './components/BatchesModal';
import PriceListsModal from './components/PriceListsModal';
import StockAdjustModal from './components/StockAdjustModal';
import StockHistoryModal from './components/StockHistoryModal';
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
    adjustStock
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

  // Filter + search state
  const [searchTerm,   setSearchTerm]   = useState('');
  const [typeFilter,   setTypeFilter]   = useState('ALL');   // ALL | STANDARD | RAW | FINISHED
  const [stockFilter,  setStockFilter]  = useState('ALL');   // ALL | IN | LOW | OUT
  const [categoryFilter, setCategoryFilter] = useState('');

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
    // Normalised the same way the type filter above does — a lowercase 'raw'
    // from an import would otherwise slip through and be counted as sellable.
    const isRaw    = p => (p.product_type || 'STANDARD').toUpperCase() === 'RAW';
    const sellable = products.filter(p => !isRaw(p));
    const raw      = products.filter(isRaw);

    const val = (list, field) => list.reduce((s, p) => s + (p[field] || 0) * (p.stock || 0), 0);

    const stockValue    = val(products, 'costPrice');      // everything on hand, at cost
    const sellableCost  = val(sellable, 'costPrice');
    const retailValue   = val(sellable, 'sellingPrice');   // only what can actually be sold
    const rawValue      = val(raw, 'costPrice');
    const marginValue   = retailValue - sellableCost;

    const lowStock     = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= 5).length;
    const outOfStock   = products.filter(p => (p.stock || 0) === 0).length;
    const totalUnits   = products.reduce((s, p) => s + (p.stock || 0), 0);
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

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex justify-between items-center py-2 border-b border-border/60">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground tracking-tight">Inventory</h1>
          <span className="text-xs text-muted-foreground hidden sm:block">Manage products and stock</span>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => setShowPriceLists(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-card border border-border/60 text-foreground text-xs font-semibold hover:bg-black/[0.03] hover:border-black/15 transition-colors">
            <TagIcon size={15} className="text-muted-foreground" /> Price Lists
          </button>
          <button onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-card border border-border/60 text-foreground text-xs font-semibold hover:bg-black/[0.03] hover:border-black/15 transition-colors">
            <History size={15} className="text-muted-foreground" /> History
          </button>
          <button onClick={() => { window.location.href = '/bulk-add?type=products'; }}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-card border border-border/60 text-foreground text-xs font-semibold hover:bg-black/[0.03] hover:border-black/15 transition-colors">
            Bulk Import
          </button>
          <button onClick={openAddModal}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-accent-signature text-white text-xs font-semibold hover:bg-accent-signature-hover shadow-md shadow-accent-signature/25 transition-colors">
            <Plus size={16} strokeWidth={2.5} /> Add Product
          </button>
        </div>
      </div>

      {/* KPI Ribbon — compact stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-px bg-border/60 rounded-2xl overflow-hidden border border-border/60 shadow-sm">
        {[
          { label: 'Total Products', value: products.length, suffix: 'items', icon: <PackagePlus size={14} />, money: false },
          { label: 'Total Units',    value: kpis.totalUnits.toLocaleString('en-IN'), suffix: 'pcs', icon: <ShoppingBag size={14} />, money: false },
          { label: 'Stock Value',    value: Math.round(kpis.stockValue).toLocaleString('en-IN'),  icon: <DollarSign size={14} />, money: true,
            // Say what is inside the number. Raw material is real money on the
            // shelf, it just has no retail price, and burying it made the
            // margin below look impossible.
            hint: kpis.rawValue > 0
              ? `incl. ₹${Math.round(kpis.rawValue).toLocaleString('en-IN')} raw material`
              : null },
          { label: 'Retail Value',   value: Math.round(kpis.retailValue).toLocaleString('en-IN'), icon: <TrendingUp size={14} />, money: true,
            hint: kpis.marginValue !== 0
              ? `sellable stock · ${kpis.marginValue >= 0 ? '+' : '−'}₹${Math.abs(Math.round(kpis.marginValue)).toLocaleString('en-IN')} margin`
              : 'sellable stock' },
          { label: 'Low Stock',      value: kpis.lowStock,   suffix: 'SKUs', icon: <AlertCircle size={14} />, warn: kpis.lowStock > 0 ? 'low' : null },
          { label: 'Out of Stock',   value: kpis.outOfStock, suffix: 'SKUs', icon: <BarChart3 size={14} />,   warn: kpis.outOfStock > 0 ? 'out' : null },
        ].map((m, i) => (
          <div key={i} className="bg-card px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className={m.warn === 'out' ? 'text-[color:var(--color-neg)]' : m.warn === 'low' ? 'text-accent-signature-hover' : 'text-muted-foreground'}>{m.icon}</span>
              {m.label}
            </div>
            <div className={`text-[19px] font-semibold tabular-nums tracking-tight mt-0.5 ${m.warn === 'low' ? 'text-accent-signature-hover' : m.warn === 'out' ? 'text-[color:var(--color-neg)]' : 'text-foreground'}`}>
              {m.money && <span className="text-muted-foreground text-sm mr-0.5">₹</span>}{m.value}
              {m.suffix && <span className="text-[11px] font-normal text-muted-foreground ml-1">{m.suffix}</span>}
            </div>
            {m.hint && <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{m.hint}</div>}
          </div>
        ))}
      </div>

      {/* ── Search + Filter toolbar ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl shadow-sm p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input type="text" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by name, SKU, category, barcode…"
            className="w-full pl-10 pr-9 py-2.5 bg-card border border-border rounded-xl text-sm font-medium text-foreground placeholder:text-muted-foreground placeholder:font-normal outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all" />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Type chips */}
        <div className="flex items-center gap-1 bg-canvas border border-border rounded-xl p-1">
          {[
            { id: 'ALL',      label: 'All' },
            { id: 'STANDARD', label: 'Standard' },
            { id: 'SERVICE',  label: 'Services' },
            { id: 'RAW',      label: 'Raw' },
            { id: 'FINISHED', label: 'Finished' },
          ].map(t => (
            <button key={t.id} onClick={() => setTypeFilter(t.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                typeFilter === t.id ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'
              }`}>{t.label}</button>
          ))}
        </div>

        {/* Stock chips */}
        <div className="flex items-center gap-1 bg-canvas border border-border rounded-xl p-1">
          {[
            { id: 'ALL', label: 'All Stock' },
            { id: 'IN',  label: 'In Stock' },
            { id: 'LOW', label: 'Low' },
            { id: 'OUT', label: 'Out' },
          ].map(s => (
            <button key={s.id} onClick={() => setStockFilter(s.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                stockFilter === s.id ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'
              }`}>{s.label}</button>
          ))}
        </div>

        {/* Category select */}
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-xs font-semibold text-foreground outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all min-w-[140px]">
          <option value="">All Categories</option>
          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {activeFilterCount > 0 && (
          <button onClick={clearAllFilters}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-semibold text-red-500 hover:bg-red-50 transition-all whitespace-nowrap">
            <X size={12} /> Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Result count */}
      <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest -mt-2">
        <Filter size={12} />
        Showing {filteredProducts.length} of {products.length} products
      </div>

      <StockTable
        products={filteredProducts}
        inventoryBalances={balances}
        lastBuy={lastBuy}
        currencySymbol={businessProfile?.currencySymbol || '₹'}
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
          onCreate={() => { setViewingProduct(null); openAddModal(); }}
          locations={inventoryLocations || []}
          balances={balances || []}
          tenantId={currentTenantId}
          currencySymbol={businessProfile?.currencySymbol || '₹'}
          onClose={() => setViewingProduct(null)}
          onEdit={(p) => { setViewingProduct(null); openEditModal(p); }}
          onAdjust={isOwner ? (p) => { setViewingProduct(null); setAdjustingProduct(p); } : null}
          onPrintBarcode={() => navigate('/labels')}
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
  const lbl = 'text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
          className="w-full mt-5 py-2.5 rounded-xl text-[13px] font-semibold bg-accent-signature text-white hover:opacity-90 disabled:opacity-40 transition-opacity">
          {saving ? 'Applying…' : `Apply to ${count} products`}
        </button>
      </div>
    </div>
  );
};

export default Inventory;
