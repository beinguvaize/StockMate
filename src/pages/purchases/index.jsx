import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePurchases } from '../../hooks/usePurchases';
import { useInventory } from '../../hooks/useInventory';
import { Plus, RotateCcw, Pencil, Trash2, ShoppingCart, ArrowLeftRight } from 'lucide-react';
import Button from '../../shared/Button';
import Modal from '../../shared/Modal';
import Table from '../../shared/Table';
import { formatCurrency, formatDate, generateRef } from '../../lib/utils';
import PurchaseForm from './components/PurchaseForm';
import MultiPurchaseForm from './components/MultiPurchaseForm';
import PurchaseReturnForm from './components/PurchaseReturnForm';

const PurchasesPage = () => {
  const { currentTenantId } = useTenant();
  const { currentUser } = useAuth();
  const { addNotification } = useNotifications();
  const { purchases, purchaseReturns, suppliers, add: addPurchase, update: updatePurchase, remove: removePurchase, addReturn, loading: purLoading } = usePurchases(currentTenantId);
  const { products, inventoryLocations, loading: prodLoading, updateProduct, adjustStock, addProduct } = useInventory(currentTenantId);
  const warehouses = (inventoryLocations || []).filter(l => l.type === 'WAREHOUSE');

  const [activeTab, setActiveTab] = useState('purchases'); // 'purchases' | 'returns'
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);   // purchase being edited
  const [editLoading, setEditLoading] = useState(false);
  const [returnTarget, setReturnTarget] = useState(null); // purchase being returned
  const [returnLoading, setReturnLoading] = useState(false);

  const [addLoading, setAddLoading] = useState(false);

  // ── WAC helper ──────────────────────────────────────────────────────────────
  const updateWAC = async (productId, qty, unitCost) => {
    const product = products.find(p => p.id === productId);
    if (!product || unitCost <= 0) return;
    const oldStock = Number(product.stock) || 0;
    const oldCost  = Number(product.costPrice) || 0;
    const denom    = oldStock + qty;
    const newCost  = denom > 0 ? (oldStock * oldCost + qty * unitCost) / denom : unitCost;
    const rounded  = Math.round(newCost * 100) / 100;
    if (rounded !== oldCost) await updateProduct(product.id, { costPrice: rounded });
  };

  // ── Quick-create product from barcode ──────────────────────────────────────
  const handleCreateProduct = async (productData) => {
    const { data, error } = await addProduct(productData);
    if (error) { alert('Failed to create product: ' + error.message); return null; }
    return data;
  };

  // ── Multi-item purchase save ─────────────────────────────────────────────────
  const handleSaveMultiPurchase = async ({ header, items }) => {
    setAddLoading(true);
    const supplierName = suppliers.find(s => s.id === header.supplier_id)?.name || '';
    let failed = 0;
    for (const item of items) {
      const payload = {
        id:                generateRef('PUR'),
        linked_product_id: item.linked_product_id,
        supplier_id:       header.supplier_id,
        supplier_name:     supplierName,
        quantity:          item.quantity,
        unit_cost:         item.unit_price,
        total_amount:      item.total_amount,
        payment_type:      header.payment_type,
        date:              header.date,
        notes:             header.notes,
        userId:            currentUser?.id,
        locationId:        header.location_id || null,
      };
      const { error } = await addPurchase(payload);
      if (error) { failed++; continue; }
      await updateWAC(item.linked_product_id, item.quantity, item.unit_price);
    }
    setAddLoading(false);
    if (failed > 0) alert(`${failed} item(s) failed to save.`);
    else setShowAddModal(false);
  };

  const handleEditPurchase = async (data) => {
    setEditLoading(true);
    const orig = editTarget;
    const qtyDelta = Number(data.quantity) - Number(orig.quantity);

    // Update purchase record fields (metadata only — inventory adjusted separately)
    const { error } = await updatePurchase(orig.id, {
      linked_product_id: data.linked_product_id,
      supplier_id:       data.supplier_id,
      supplier_name:     suppliers.find(s => s.id === data.supplier_id)?.name || orig.supplier_name,
      quantity:          Number(data.quantity),
      total_amount:      Number(data.total_amount),
      payment_type:      data.payment_type,
      date:              data.date,
      notes:             data.notes,
    });

    if (error) {
      alert('Failed to update purchase: ' + error.message);
      setEditLoading(false);
      return;
    }

    // Adjust inventory for quantity delta
    if (qtyDelta !== 0 && data.linked_product_id) {
      await adjustStock(
        data.linked_product_id,
        qtyDelta,
        `Purchase edit: ${orig.id}`,
        null
      );
    }

    setEditLoading(false);
    setEditTarget(null);
  };

  const handleDeletePurchase = async (pur) => {
    if (!window.confirm(`Delete purchase #${pur.id.split('-').pop()}? This will NOT reverse inventory.`)) return;
    const { error } = await removePurchase(pur.id);
    if (error) addNotification('Delete failed: ' + error.message, 'error');
    else addNotification('Purchase deleted ✓', 'success');
  };

  const handleSaveReturn = async (data) => {
    setReturnLoading(true);
    try {
      const { error } = await addReturn({
        ...data,
        id: generateRef('PRN'), // Purchase Return Note
      });
      if (error) {
        console.error('[Return] RPC error:', error);
        addNotification('Return failed: ' + (error.message || error.details || JSON.stringify(error)), 'error');
        return;
      }
      setReturnTarget(null);
      addNotification('Return processed — stock updated ✓', 'success');
    } catch (e) {
      console.error('[Return] Exception:', e);
      addNotification('Return failed: ' + e.message, 'error');
    } finally {
      setReturnLoading(false);
    }
  };

  // ── Purchases table ──────────────────────────────────────────────────────────
  const headers = [
    { label: 'Date' },
    { label: 'Reference' },
    { label: 'Product / Supplier' },
    { label: 'Quantity', className: 'text-center' },
    { label: 'Total', className: 'text-right' },
    { label: '', className: 'text-right' },
  ];

  // ── Returns table ────────────────────────────────────────────────────────────
  const returnHeaders = [
    { label: 'Date' },
    { label: 'Reference' },
    { label: 'Product' },
    { label: 'Supplier' },
    { label: 'Qty', className: 'text-center' },
    { label: 'Total', className: 'text-right' },
    { label: 'Reason' },
  ];

  const renderReturnRow = (ret) => {
    const product  = products.find(p => p.id === ret.product_id);
    const supplier = suppliers.find(s => s.id === ret.supplier_id);
    return (
      <tr key={ret.id} className="hover:bg-canvas transition-colors">
        <td className="px-4 py-3">
          <div className="text-xs font-bold text-gray-500 uppercase">{formatDate(ret.date)}</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm font-black text-rose-600">#{ret.id.split('-').pop()}</div>
          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Debit Note</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm font-bold text-ink-primary">{product?.name || ret.product_name || 'Unknown'}</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-xs font-bold text-gray-500">{supplier?.name || ret.supplier_name || '—'}</div>
        </td>
        <td className="px-4 py-3 text-center">
          <div className="text-sm font-black text-rose-500">−{ret.quantity}</div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="text-sm font-black text-rose-600">{formatCurrency(ret.total_amount)}</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-xs text-gray-500">{ret.reason || '—'}</div>
        </td>
      </tr>
    );
  };

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
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={() => setEditTarget(pur)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <Pencil size={11} />
              Edit
            </button>
            <button
              onClick={() => setReturnTarget({ purchase: pur, product, supplier })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors"
            >
              <RotateCcw size={11} />
              Return
            </button>
            <button
              onClick={() => handleDeletePurchase(pur)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500 bg-gray-100 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 size={11} />
              Delete
            </button>
          </div>
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
      <div className="flex justify-between items-center py-2 border-b border-black/5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black font-sora text-ink-primary leading-none">
            Purchases<span className="text-accent-signature">.</span>
          </h1>
          <span className="text-[10px] font-semibold text-gray-400 hidden sm:block">Record stock purchases from suppliers</span>
        </div>
        <div className="flex gap-2 items-center">
          <Button icon={Plus} onClick={() => setShowAddModal(true)}>Add Purchase</Button>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 p-1 bg-canvas rounded-xl border border-black/5 w-fit">
        <button
          onClick={() => setActiveTab('purchases')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'purchases' ? 'bg-white shadow text-ink-primary' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <ShoppingCart size={11} /> Purchases
          <span className="ml-1 text-[9px] font-bold bg-black/5 rounded px-1.5 py-0.5">{purchases.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'returns' ? 'bg-white shadow text-rose-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <ArrowLeftRight size={11} /> Returns
          <span className={`ml-1 text-[9px] font-bold rounded px-1.5 py-0.5 ${purchaseReturns.length > 0 ? 'bg-rose-100 text-rose-600' : 'bg-black/5'}`}>
            {purchaseReturns.length}
          </span>
        </button>
      </div>

      {activeTab === 'purchases' ? (
        <Table
          headers={headers}
          rows={purchases}
          renderRow={renderRow}
          emptyMessage="No purchases recorded yet"
        />
      ) : (
        <Table
          headers={returnHeaders}
          rows={purchaseReturns}
          renderRow={renderReturnRow}
          emptyMessage="No purchase returns yet"
        />
      )}

      {/* Add Purchase Modal — multi-line */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Purchase" subtitle="One supplier · multiple products · single submit">
        <MultiPurchaseForm
          products={products}
          suppliers={suppliers}
          warehouses={warehouses}
          onSave={handleSaveMultiPurchase}
          loading={addLoading}
          onCreateProduct={handleCreateProduct}
        />
      </Modal>

      {/* Edit Purchase Modal */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Purchase" subtitle="Update purchase details — inventory adjusted for qty change">
        {editTarget && (
          <PurchaseForm
            products={products}
            suppliers={suppliers}
            onSave={handleEditPurchase}
            loading={editLoading}
            initialData={editTarget}
          />
        )}
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
            warehouses={warehouses}
            onSave={handleSaveReturn}
            loading={returnLoading}
          />
        )}
      </Modal>
    </div>
  );
};

export default PurchasesPage;
