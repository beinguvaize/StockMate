import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useInventory } from '../../hooks/useInventory';
import { Plus, History, PackagePlus, AlertCircle, Tag as TagIcon } from 'lucide-react';
import Button from '../../shared/Button';
import StockTable from './components/StockTable';
import AddItemModal from './components/AddItemModal';
import BatchesModal from './components/BatchesModal';

const Inventory = () => {
  const { currentUser } = useAuth();
  const { currentTenantId } = useTenant();
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

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [batchesFor, setBatchesFor] = useState(null);

  const openAddModal = () => {
    setEditingProduct(null);
    setShowAddModal(true);
  };

  const openEditModal = (p) => {
    setEditingProduct(p);
    setShowAddModal(true);
  };

  const handleSaveProduct = async (data) => {
    if (editingProduct) {
      await updateProduct(editingProduct.id, data);
    } else {
      await addProduct(data);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-20">
      <div className="text-sm font-bold opacity-50 animate-pulse">Loading products...</div>
    </div>
  );

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex justify-between items-end pb-6 border-b border-black/5 text-ink-primary">
        <div>
          <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2">
            Inventory<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-xs font-semibold text-gray-600 opacity-80 mb-6">Manage products and stock</p>
        </div>
        <div className="flex gap-4 items-center mb-4">
          <Button variant="secondary" icon={History} onClick={() => {}}>History</Button>
          <Button icon={Plus} onClick={openAddModal}>Add Product</Button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
          <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-ink-primary">
            <PackagePlus size={40} strokeWidth={2} />
          </div>
          <div className="relative z-10 flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Total Products</span>
            <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
              {products.length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">ITEMS</span>
            </div>
          </div>
        </div>
        {/* ... (other KPIs) ... */}
      </div>

      <StockTable
        products={products}
        inventoryBalances={balances}
        onEdit={openEditModal}
        onDelete={(id) => { if (window.confirm('Delete this product?')) deleteProduct(id); }}
        onAdjust={adjustStock}
        onBatches={setBatchesFor}
      />

      <AddItemModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveProduct}
        editingProduct={editingProduct}
        productCategories={categories}
      />

      <BatchesModal
        isOpen={!!batchesFor}
        onClose={() => setBatchesFor(null)}
        product={batchesFor}
      />
    </div>
  );
};

export default Inventory;
