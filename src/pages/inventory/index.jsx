import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useInventory } from '../../hooks/useInventory';
import { useOrders } from '../../hooks/useOrders';
import { Plus, History, PackagePlus, AlertCircle, Tag as TagIcon, TrendingUp, DollarSign, BarChart3, ShoppingBag } from 'lucide-react';
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
            Inventory<span className="text-accent-signature">.</span>
          </h1>
          <span className="text-[10px] font-semibold text-gray-400 hidden sm:block">Manage products and stock</span>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="secondary" icon={TagIcon} onClick={() => setShowPriceLists(true)}>Price Lists</Button>
          <Button variant="secondary" icon={History} onClick={() => setShowHistory(true)}>History</Button>
          <Button icon={Plus} onClick={openAddModal}>Add Product</Button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Total Products', value: products.length, suffix: 'ITEMS', icon: <PackagePlus size={36} strokeWidth={1.5} />, color: 'text-ink-primary' },
          { label: 'Total Units',    value: kpis.totalUnits, suffix: 'PCS',   icon: <ShoppingBag size={36} strokeWidth={1.5} />,  color: 'text-blue-400' },
          { label: 'Stock Value',    value: `₹${Math.round(kpis.stockValue).toLocaleString()}`,  icon: <DollarSign size={36} strokeWidth={1.5} />,  color: 'text-accent-signature' },
          { label: 'Retail Value',   value: `₹${Math.round(kpis.retailValue).toLocaleString()}`, icon: <TrendingUp size={36} strokeWidth={1.5} />,  color: 'text-emerald-500' },
          { label: 'Low Stock',      value: kpis.lowStock,   suffix: 'SKUs',  icon: <AlertCircle size={36} strokeWidth={1.5} />,  color: 'text-orange-400' },
          { label: 'Out of Stock',   value: kpis.outOfStock, suffix: 'SKUs',  icon: <BarChart3 size={36} strokeWidth={1.5} />,    color: 'text-red-400' },
        ].map((m, i) => (
          <div key={i} className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
            <div className={`absolute top-4 right-4 opacity-[0.07] group-hover:opacity-[0.13] transition-opacity pointer-events-none ${m.color}`}>
              {m.icon}
            </div>
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-1">{m.label}</span>
            <div className="text-2xl font-black text-ink-primary tabular-nums leading-tight">
              {m.value}
              {m.suffix && <span className="text-xs font-bold opacity-30 ml-1">{m.suffix}</span>}
            </div>
          </div>
        ))}
      </div>

      <StockTable
        products={products}
        inventoryBalances={balances}
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
