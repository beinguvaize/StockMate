import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
    const stockValue   = products.reduce((s, p) => s + (p.costPrice || 0) * (p.stock || 0), 0);
    const retailValue  = products.reduce((s, p) => s + (p.sellingPrice || 0) * (p.stock || 0), 0);
    const lowStock     = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= 5).length;
    const outOfStock   = products.filter(p => (p.stock || 0) === 0).length;
    const totalUnits   = products.reduce((s, p) => s + (p.stock || 0), 0);
    const uniqueCats   = new Set(products.map(p => p.category).filter(Boolean)).size;
    return { stockValue, retailValue, lowStock, outOfStock, totalUnits, uniqueCats };
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
      <div className="flex justify-between items-center py-2 border-b border-black/5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black font-sora text-ink-primary leading-none">
            Inventory<span className="text-amber-500">.</span>
          </h1>
          <span className="text-[10px] font-semibold text-gray-400 hidden sm:block">Manage products and stock</span>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => setShowPriceLists(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-black/[0.08] text-ink-primary text-xs font-bold hover:bg-black/[0.03] hover:border-black/15 transition-colors">
            <TagIcon size={15} className="text-gray-400" /> Price Lists
          </button>
          <button onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-black/[0.08] text-ink-primary text-xs font-bold hover:bg-black/[0.03] hover:border-black/15 transition-colors">
            <History size={15} className="text-gray-400" /> History
          </button>
          <button onClick={() => { window.location.href = '/bulk-add?type=products'; }}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-black/[0.08] text-ink-primary text-xs font-bold hover:bg-black/[0.03] hover:border-black/15 transition-colors">
            Bulk Import
          </button>
          <button onClick={openAddModal}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 shadow-md shadow-amber-600/25 transition-colors">
            <Plus size={16} strokeWidth={2.5} /> Add Product
          </button>
        </div>
      </div>

      {/* KPI Ribbon — compact stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-px bg-black/[0.07] rounded-2xl overflow-hidden border border-black/[0.07] shadow-sm">
        {[
          { label: 'Total Products', value: products.length, suffix: 'items', icon: <PackagePlus size={14} />, money: false },
          { label: 'Total Units',    value: kpis.totalUnits.toLocaleString('en-IN'), suffix: 'pcs', icon: <ShoppingBag size={14} />, money: false },
          { label: 'Stock Value',    value: Math.round(kpis.stockValue).toLocaleString('en-IN'),  icon: <DollarSign size={14} />, money: true },
          { label: 'Retail Value',   value: Math.round(kpis.retailValue).toLocaleString('en-IN'), icon: <TrendingUp size={14} />, money: true },
          { label: 'Low Stock',      value: kpis.lowStock,   suffix: 'SKUs', icon: <AlertCircle size={14} />, warn: kpis.lowStock > 0 ? 'low' : null },
          { label: 'Out of Stock',   value: kpis.outOfStock, suffix: 'SKUs', icon: <BarChart3 size={14} />,   warn: kpis.outOfStock > 0 ? 'out' : null },
        ].map((m, i) => (
          <div key={i} className="bg-white px-4 py-3.5 flex flex-col gap-1.5 hover:bg-amber-500/[0.03] transition-colors">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-gray-400 tracking-widest">
              <span className={m.warn === 'out' ? 'text-red-400' : m.warn === 'low' ? 'text-amber-500' : 'text-stone-300'}>{m.icon}</span>
              {m.label}
            </div>
            <div className={`font-mono text-xl font-bold tabular-nums leading-none ${m.warn === 'low' ? 'text-amber-600' : m.warn === 'out' ? 'text-red-600' : 'text-ink-primary'}`}>
              {m.money && <span className="text-amber-400 text-sm mr-0.5">₹</span>}{m.value}
              {m.suffix && <span className="text-[10px] font-bold text-gray-300 ml-1 lowercase">{m.suffix}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Search + Filter toolbar ─────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input type="text" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by name, SKU, category, barcode…"
            className="w-full pl-10 pr-9 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-medium text-ink-primary placeholder:text-gray-400 placeholder:font-normal outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all" />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-ink-primary">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Type chips */}
        <div className="flex items-center gap-1 bg-canvas border border-gray-200 rounded-xl p-1">
          {[
            { id: 'ALL',      label: 'All' },
            { id: 'STANDARD', label: 'Standard' },
            { id: 'SERVICE',  label: 'Services' },
            { id: 'RAW',      label: 'Raw' },
            { id: 'FINISHED', label: 'Finished' },
          ].map(t => (
            <button key={t.id} onClick={() => setTypeFilter(t.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all whitespace-nowrap ${
                typeFilter === t.id ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-500 hover:text-ink-primary'
              }`}>{t.label}</button>
          ))}
        </div>

        {/* Stock chips */}
        <div className="flex items-center gap-1 bg-canvas border border-gray-200 rounded-xl p-1">
          {[
            { id: 'ALL', label: 'All Stock' },
            { id: 'IN',  label: 'In Stock' },
            { id: 'LOW', label: 'Low' },
            { id: 'OUT', label: 'Out' },
          ].map(s => (
            <button key={s.id} onClick={() => setStockFilter(s.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all whitespace-nowrap ${
                stockFilter === s.id ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-500 hover:text-ink-primary'
              }`}>{s.label}</button>
          ))}
        </div>

        {/* Category select */}
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs font-bold text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all min-w-[140px]">
          <option value="">All Categories</option>
          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {activeFilterCount > 0 && (
          <button onClick={clearAllFilters}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-black text-red-500 hover:bg-red-50 transition-all whitespace-nowrap">
            <X size={12} /> Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Result count */}
      <div className="flex items-center gap-2 text-[11px] font-bold text-gray-500 uppercase tracking-widest -mt-2">
        <Filter size={12} />
        Showing {filteredProducts.length} of {products.length} products
      </div>

      <StockTable
        products={filteredProducts}
        inventoryBalances={balances}
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
        currencySymbol={businessProfile?.currencySymbol || ''}
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
  const [f, setF] = useState({ category: '', pricePct: '', sellPrice: '', reorder: '', gstRate: '' });
  const [saving, setSaving] = useState(false);
  const dirty = f.category || f.pricePct !== '' || f.sellPrice !== '' || f.reorder !== '' || f.gstRate !== '';
  const inp = 'w-full text-[13px] border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-amber-500/40 bg-white';
  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1 block';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-1">
          <div className="font-black text-[15px] text-ink-primary">Bulk edit</div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-ink-primary"><X size={18} /></button>
        </div>
        <p className="text-[11px] text-gray-400 mb-4">{count} products selected · blank fields stay unchanged</p>

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
          className="w-full mt-5 py-2.5 rounded-xl text-[13px] font-black bg-accent-signature text-white hover:opacity-90 disabled:opacity-40 transition-opacity">
          {saving ? 'Applying…' : `Apply to ${count} products`}
        </button>
      </div>
    </div>
  );
};

export default Inventory;
