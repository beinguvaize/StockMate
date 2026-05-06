import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { usePurchases } from '../../hooks/usePurchases';
import { useInventory } from '../../hooks/useInventory';
import { Plus, RotateCcw } from 'lucide-react';
import Button from '../../shared/Button';
import Modal from '../../shared/Modal';
import Table from '../../shared/Table';
import { formatCurrency, formatDate, generateRef } from '../../lib/utils';
import PurchaseForm from './components/PurchaseForm';
import PurchaseReturnForm from './components/PurchaseReturnForm';

const PurchasesPage = () => {
  const { currentTenantId } = useTenant();
  const { currentUser } = useAuth();
  const { purchases, suppliers, add: addPurchase, addReturn, loading: purLoading } = usePurchases(currentTenantId);
  const { products, loading: prodLoading, updateProduct } = useInventory(currentTenantId);

  const [showAddModal, setShowAddModal] = useState(false);
  const [returnTarget, setReturnTarget] = useState(null); // purchase being returned
  const [returnLoading, setReturnLoading] = useState(false);

  const handleSavePurchase = async (data) => {
    const payload = {
      ...data,
      id: generateRef('PUR'),
      userId: currentUser?.id
    };
    const { success, error } = await addPurchase(payload);
    if (error) {
      alert('Failed to record purchase: ' + error.message);
      return;
    }

    // Weighted average cost update on linked product
    const product = products.find(p => p.id === data.linked_product_id);
    const unitCost = data.unit_cost ?? (data.quantity > 0 ? data.total_amount / data.quantity : 0);
    if (product && unitCost > 0) {
      const oldStock = Number(product.stock) || 0;
      const oldCost = Number(product.costPrice) || 0;
      const qty = Number(data.quantity) || 0;
      const denom = oldStock + qty;
      const newCost = denom > 0
        ? (oldStock * oldCost + qty * unitCost) / denom
        : unitCost;
      const rounded = Math.round(newCost * 100) / 100;
      if (rounded !== oldCost) {
        await updateProduct(product.id, { costPrice: rounded });
      }
    }

    setShowAddModal(false);
  };

  const handleSaveReturn = async (data) => {
    setReturnLoading(true);
    const { error } = await addReturn({
      ...data,
      id: generateRef('PRN'), // Purchase Return Note
    });
    setReturnLoading(false);
    if (error) {
      alert('Failed to process return: ' + error.message);
      return;
    }
    setReturnTarget(null);
  };

  const headers = [
    { label: 'Date' },
    { label: 'Reference' },
    { label: 'Product / Supplier' },
    { label: 'Quantity', className: 'text-center' },
    { label: 'Total', className: 'text-right' },
    { label: '', className: 'text-right' },
  ];

  const renderRow = (pur) => {
    const product = products.find(p => p.id === pur.linked_product_id);
    const supplier = suppliers.find(s => s.id === pur.supplier_id);

    return (
      <tr key={pur.id} className="hover:bg-canvas transition-colors">
        <td className="px-4 py-3">
          <div className="text-xs font-bold text-gray-500 uppercase">{formatDate(pur.date)}</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm font-black text-ink-primary">#{pur.id.split('-').pop()}</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm font-bold text-ink-primary">{product?.name || 'Unknown Product'}</div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{supplier?.name || pur.supplier_name || 'N/A'}</div>
        </td>
        <td className="px-4 py-3 text-center">
          <div className="text-sm font-black text-emerald-500">+{pur.quantity}</div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="text-sm font-black text-ink-primary">{formatCurrency(pur.total_amount)}</div>
        </td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={() => setReturnTarget({ purchase: pur, product, supplier })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors ml-auto"
          >
            <RotateCcw size={11} />
            Return
          </button>
        </td>
      </tr>
    );
  };

  if (purLoading || prodLoading) return (
    <div className="flex items-center justify-center p-20">
      <div className="text-sm font-bold opacity-50 animate-pulse">Loading purchases...</div>
    </div>
  );

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex justify-between items-end pb-6 border-b border-black/5 text-ink-primary">
        <div>
          <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2">
            Purchases<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-xs font-semibold text-gray-600 opacity-80 mb-6">Record stock purchases from suppliers</p>
        </div>
        <div className="flex gap-4 items-center mb-4">
          <Button icon={Plus} onClick={() => setShowAddModal(true)}>Add Purchase</Button>
        </div>
      </div>

      <Table
        headers={headers}
        rows={purchases}
        renderRow={renderRow}
        emptyMessage="No purchases recorded yet"
      />

      {/* Add Purchase Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Purchase" subtitle="Record stock received from a supplier">
        <PurchaseForm
          products={products}
          suppliers={suppliers}
          onSave={handleSavePurchase}
        />
      </Modal>

      {/* Purchase Return Modal */}
      <Modal
        isOpen={!!returnTarget}
        onClose={() => setReturnTarget(null)}
        title="Return to Supplier"
        subtitle="Debit note — stock will be deducted"
      >
        {returnTarget && (
          <PurchaseReturnForm
            purchase={returnTarget.purchase}
            product={returnTarget.product}
            supplier={returnTarget.supplier}
            onSave={handleSaveReturn}
            loading={returnLoading}
          />
        )}
      </Modal>
    </div>
  );
};

export default PurchasesPage;
