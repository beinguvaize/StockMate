import React, { useState, useMemo } from 'react';
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

const Inventory = () => {
  const { currentUser, isOwner } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { 
    products, 
    productCategories: categories, 
    inventoryBalances: balances, 
    loading, 
    addProduct, 
    updateProduct, 
    deleteProduct,
    adjustStock 
  } = useInventory(currentTenantId);

  const { priceLists, upsertPrice, deletePrice } = useOrders(currentTenantId);

  const [showAddModal,    setShowAddModal]    = useState(false);
  const [editingProduct,  setEditingProduct]  = useState(null);
  const [batchesFor,      setBatchesFor]      = useState(null);
  const [showPriceLists,  setShowPriceLists]  = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState(null);
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

  const handleAdjust = async (productId, delta, reason) => {
    setAdjustSaving(true);
    const result = await adjustStock(productId, delta, reason, null);
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

  if (loading) return (
    <div className="flex items-center justify-center p-20">
      <div className="text-sm font-bold opacity-50 animate-pulse">Loading products...</div>
    </div>
  );

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
          <Button variant="secondary" icon={TagIcon} onClick={() => setShowPriceLists(true)}>Price Lists</Button>
          <Button variant="secondary" icon={History} onClick={() => setShowHistory(true)}>History</Button>
          <Button variant="amber" icon={Plus} onClick={openAddModal}>Add Product</Button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Total Products', value: products.length, suffix: 'ITEMS', icon: <PackagePlus size={36} strokeWidth={1.5} />, color: 'text-stone-400' },
          { label: 'Total Units',    value: kpis.totalUnits, suffix: 'PCS',   icon: <ShoppingBag size={36} strokeWidth={1.5} />,  color: 'text-stone-400' },
          { label: 'Stock Value',    value: `₹${Math.round(kpis.stockValue).toLocaleString('en-IN')}`,  icon: <DollarSign size={36} strokeWidth={1.5} />,  color: 'text-amber-500', money: true },
          { label: 'Retail Value',   value: `₹${Math.round(kpis.retailValue).toLocaleString('en-IN')}`, icon: <TrendingUp size={36} strokeWidth={1.5} />,  color: 'text-amber-500', money: true },
          { label: 'Low Stock',      value: kpis.lowStock,   suffix: 'SKUs',  icon: <AlertCircle size={36} strokeWidth={1.5} />,  color: 'text-amber-500', warn: kpis.lowStock > 0 ? 'low' : null },
          { label: 'Out of Stock',   value: kpis.outOfStock, suffix: 'SKUs',  icon: <BarChart3 size={36} strokeWidth={1.5} />,    color: 'text-red-400', warn: kpis.outOfStock > 0 ? 'out' : null },
        ].map((m, i) => (
          <div key={i} className="p-5 bg-white border border-black/[0.07] rounded-2xl shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
            <div className={`absolute top-4 right-4 opacity-[0.07] group-hover:opacity-[0.13] transition-opacity pointer-events-none ${m.color}`}>
              {m.icon}
            </div>
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-1">{m.label}</span>
            <div className={`font-mono text-2xl font-bold tabular-nums leading-tight ${m.warn === 'low' ? 'text-amber-600' : m.warn === 'out' ? 'text-red-600' : 'text-ink-primary'}`}>
              {m.money ? <><span className="text-amber-400 text-lg mr-0.5">₹</span>{String(m.value).replace('₹','')}</> : m.value}
              {m.suffix && <span className="text-[11px] font-bold opacity-30 ml-1">{m.suffix}</span>}
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
        onEdit={openEditModal}
        onDelete={(id) => { if (window.confirm('Delete this product?')) deleteProduct(id); }}
        onAdjust={isOwner ? (product) => setAdjustingProduct(product) : null}
        onBatches={setBatchesFor}
      />

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

export default Inventory;
