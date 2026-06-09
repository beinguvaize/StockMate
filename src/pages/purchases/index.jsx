import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePurchases } from '../../hooks/usePurchases';
import { useInventory } from '../../hooks/useInventory';
import { Plus, RotateCcw, Pencil, Trash2, ShoppingCart, ArrowLeftRight, Search, Banknote, Copy, Printer, X, MoreVertical } from 'lucide-react';
import Button from '../../shared/Button';
import Modal from '../../shared/Modal';
import Table from '../../shared/Table';
import { formatCurrency, formatDate, generateRef } from '../../lib/utils';
import PurchaseForm from './components/PurchaseForm';
import MultiPurchaseForm from './components/MultiPurchaseForm';
import PurchaseReturnForm from './components/PurchaseReturnForm';

const PurchasesPage = () => {
  const { currentTenantId, businessProfile } = useTenant();
  const { currentUser } = useAuth();
  const { addNotification } = useNotifications();
  const { purchases, purchaseReturns, suppliers, add: addPurchase, update: updatePurchase, updateStatus: updatePurchaseStatus, remove: removePurchase, addReturn, payPurchase, loading: purLoading } = usePurchases(currentTenantId);
  const { products, inventoryLocations, loading: prodLoading, updateProduct, adjustStock, addProduct } = useInventory(currentTenantId);
  const warehouses = (inventoryLocations || []).filter(l => l.type === 'WAREHOUSE');

  const [activeTab, setActiveTab] = useState('purchases'); // 'purchases' | 'returns'
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);   // purchase being edited
  const [editLoading, setEditLoading] = useState(false);
  const [returnTarget, setReturnTarget] = useState(null); // purchase being returned
  const [returnLoading, setReturnLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  // ── Filter / sort ──────────────────────────────────────────────────────────
  const [search, setSearch]   = useState('');
  const [fSupplier, setFSup]  = useState('ALL');
  const [fPay, setFPay]       = useState('ALL');   // ALL | CASH | CREDIT
  const [fStatus, setFStatus] = useState('ALL');   // ALL | PENDING | ORDERED | RECEIVED | CANCELLED
  const [sortBy, setSortBy]   = useState('DATE_DESC'); // DATE_DESC | DATE_ASC | AMT_DESC | AMT_ASC

  // ── Pay / Duplicate / Print targets ─────────────────────────────────────────
  const [payTarget, setPayTarget] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payDate, setPayDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [dupTarget, setDupTarget]   = useState(null); // purchase to duplicate (prefill single form)
  const [printTarget, setPrintTarget] = useState(null);
  const [menuRow, setMenuRow]       = useState(null); // row whose ⋯ menu is open (portaled)
  const [menuPos, setMenuPos]       = useState({ top: 0, left: 0 });
  const openMenu = (e, pur) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 160) });
    setMenuRow(pur);
  };

  const _credit = (pt) => ['CREDIT', 'UDHAAR', 'POST-CAPITAL'].includes(String(pt || '').toUpperCase());
  const dueOf = (p) => Math.max(0, Number(p.total_amount || 0) - Number(p.paid_amount || 0));

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = (purchases || []).filter(p => {
      if (q && !(`${p.id} ${p.supplier_name || ''} ${p.notes || ''}`.toLowerCase().includes(q))) return false;
      if (fSupplier !== 'ALL' && p.supplier_id !== fSupplier) return false;
      if (fPay === 'CASH' && _credit(p.payment_type)) return false;
      if (fPay === 'CREDIT' && !_credit(p.payment_type)) return false;
      if (fStatus !== 'ALL' && (p.status || 'RECEIVED').toUpperCase() !== fStatus) return false;
      return true;
    });
    const amt = (p) => Number(p.total_amount || 0);
    rows = [...rows].sort((a, b) => {
      if (sortBy === 'AMT_DESC') return amt(b) - amt(a);
      if (sortBy === 'AMT_ASC')  return amt(a) - amt(b);
      if (sortBy === 'DATE_ASC') return String(a.date).localeCompare(String(b.date));
      return String(b.date).localeCompare(String(a.date)); // DATE_DESC
    });
    return rows;
  }, [purchases, search, fSupplier, fPay, fStatus, sortBy]);

  const submitPay = async () => {
    if (!payTarget) return;
    const amt = Number(payAmount);
    if (!(amt > 0)) { addNotification('Enter a valid amount', 'error'); return; }
    setPaySubmitting(true);
    const { error } = await payPurchase({ supplierId: payTarget.supplier_id, purchaseId: payTarget.id, amount: amt, method: payMethod, date: payDate });
    setPaySubmitting(false);
    if (error) { addNotification(`Payment failed: ${error.message}`, 'error'); return; }
    addNotification('Payment recorded', 'success');
    setPayTarget(null); setPayAmount('');
  };

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

  // Duplicate → create a brand-new purchase from a prefilled single form.
  const handleDuplicateSave = async (data) => {
    setAddLoading(true);
    const qty = Number(data.quantity);
    const total = Number(data.total_amount);
    const { error } = await addPurchase({
      id:                generateRef('PUR'),
      linked_product_id: data.linked_product_id,
      supplier_id:       data.supplier_id,
      supplier_name:     suppliers.find(s => s.id === data.supplier_id)?.name || '',
      quantity:          qty,
      unit_cost:         Number(data.unit_price) || (qty > 0 ? total / qty : 0),
      total_amount:      total,
      payment_type:      data.payment_type,
      date:              data.date,
      notes:             data.notes,
      userId:            currentUser?.id,
      locationId:        data.location_id || null,
    });
    setAddLoading(false);
    if (error) { addNotification('Duplicate failed: ' + error.message, 'error'); return; }
    if (qty > 0 && data.linked_product_id) await updateWAC(data.linked_product_id, qty, Number(data.unit_price) || total / qty);
    addNotification('Purchase duplicated', 'success');
    setDupTarget(null);
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
    { label: 'Payment', className: 'text-center' },
    { label: 'Total', className: 'text-right' },
    { label: 'Status', className: 'text-center' },
    { label: '', className: 'text-right' },
  ];

  const _STATUS_STYLES = {
    PENDING:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   label: 'Pending'   },
    ORDERED:   { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    label: 'Ordered'   },
    RECEIVED:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Received'  },
    CANCELLED: { bg: 'bg-gray-100',   text: 'text-gray-500',    border: 'border-gray-200',    label: 'Cancelled' },
  };

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
          <div className="font-mono text-sm font-bold text-rose-600 tabular-nums">{formatCurrency(ret.total_amount)}</div>
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
        <td className="px-4 py-3 text-center">
          {(() => {
            const credit = _credit(pur.payment_type);
            const due = dueOf(pur);
            if (!credit) return <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700">{pur.payment_type || 'Cash'}</span>;
            if (due <= 0.5) return <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700">Paid</span>;
            const partial = Number(pur.paid_amount || 0) > 0;
            return (
              <div className="flex flex-col items-center gap-0.5">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${partial ? 'bg-orange-50 text-orange-600' : 'bg-amber-50 text-amber-700'}`}>{partial ? 'Partial' : 'Credit'}</span>
                <span className="font-mono text-[10px] text-red-500">due {formatCurrency(due)}</span>
              </div>
            );
          })()}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="font-mono text-sm font-bold text-ink-primary tabular-nums">{formatCurrency(pur.total_amount)}</div>
        </td>
        <td className="px-4 py-3 text-center">
          {(() => {
            const st = (pur.status || 'RECEIVED').toUpperCase();
            const s = _STATUS_STYLES[st] || _STATUS_STYLES.RECEIVED;
            return (
              <select
                value={st}
                onChange={(e) => updatePurchaseStatus(pur.id, e.target.value)}
                className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-pill border outline-none cursor-pointer ${s.bg} ${s.text} ${s.border}`}
              >
                <option value="PENDING">Pending</option>
                <option value="ORDERED">Ordered</option>
                <option value="RECEIVED">Received</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            );
          })()}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center gap-1.5 justify-end">
            {_credit(pur.payment_type) && dueOf(pur) > 0.5 && (
              <button
                onClick={() => { setPayTarget(pur); setPayAmount(String(dueOf(pur))); setPayMethod('CASH'); }}
                title={`Due ${formatCurrency(dueOf(pur))}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                <Banknote size={11} /> Pay
              </button>
            )}
            <button
              onClick={(e) => openMenu(e, pur)}
              title="More"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-black/5 hover:text-ink-primary transition-colors"
            >
              <MoreVertical size={16} />
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

      {/* ── Filter / sort bar (purchases tab) ── */}
      {activeTab === 'purchases' && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-black/5 rounded-xl p-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ref / supplier / notes…"
              className="w-full h-9 pl-9 pr-3 bg-white border border-black/10 rounded-lg text-[12px] font-semibold outline-none focus:border-amber-400" />
          </div>
          <select value={fSupplier} onChange={e => setFSup(e.target.value)} className="h-9 px-2 border border-black/10 rounded-lg text-[12px] font-semibold">
            <option value="ALL">All suppliers</option>
            {(suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={fPay} onChange={e => setFPay(e.target.value)} className="h-9 px-2 border border-black/10 rounded-lg text-[12px] font-semibold">
            <option value="ALL">All payment</option><option value="CASH">Cash</option><option value="CREDIT">Credit</option>
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="h-9 px-2 border border-black/10 rounded-lg text-[12px] font-semibold">
            <option value="ALL">All status</option><option value="PENDING">Pending</option><option value="ORDERED">Ordered</option><option value="RECEIVED">Received</option><option value="CANCELLED">Cancelled</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="h-9 px-2 border border-black/10 rounded-lg text-[12px] font-semibold">
            <option value="DATE_DESC">Newest</option><option value="DATE_ASC">Oldest</option><option value="AMT_DESC">Amount ↓</option><option value="AMT_ASC">Amount ↑</option>
          </select>
          <span className="text-[11px] font-bold text-gray-400 ml-auto">{filteredPurchases.length} of {purchases.length}</span>
        </div>
      )}

      {activeTab === 'purchases' ? (
        <Table
          headers={headers}
          rows={filteredPurchases}
          renderRow={renderRow}
          emptyMessage="No purchases match the filters"
        />
      ) : (
        <Table
          headers={returnHeaders}
          rows={purchaseReturns}
          renderRow={renderReturnRow}
          emptyMessage="No purchase returns yet"
        />
      )}

      {/* Row ⋯ menu — portaled to body so the table's overflow can't clip it */}
      {menuRow && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setMenuRow(null)} />
          <div className="fixed z-[9999] w-40 bg-white border border-black/10 rounded-xl shadow-xl py-1 text-[12px] font-semibold" style={{ top: menuPos.top, left: menuPos.left }}>
            <button onClick={() => { const p = menuRow; setMenuRow(null); setPrintTarget(p); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-ink-primary"><Printer size={13} /> Print</button>
            <button onClick={() => { const p = menuRow; setMenuRow(null); setDupTarget(p); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-ink-primary"><Copy size={13} /> Duplicate</button>
            <button onClick={() => { const p = menuRow; setMenuRow(null); setEditTarget(p); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-blue-600"><Pencil size={13} /> Edit</button>
            <button onClick={() => { const p = menuRow; setMenuRow(null); setReturnTarget({ purchase: p, product: products.find(x => x.id === p.linked_product_id), supplier: suppliers.find(s => s.id === p.supplier_id) }); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-rose-600"><RotateCcw size={13} /> Return</button>
            <div className="h-px bg-black/5 my-1" />
            <button onClick={() => { const p = menuRow; setMenuRow(null); handleDeletePurchase(p); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600"><Trash2 size={13} /> Delete</button>
          </div>
        </>,
        document.body
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

      {/* Duplicate Purchase Modal — prefilled single form, saves as new */}
      <Modal isOpen={!!dupTarget} onClose={() => setDupTarget(null)} title="Duplicate Purchase" subtitle="Creates a new purchase from this one">
        {dupTarget && (
          <PurchaseForm
            products={products}
            suppliers={suppliers}
            onSave={handleDuplicateSave}
            loading={addLoading}
            initialData={{ ...dupTarget, date: new Date().toISOString().slice(0, 10) }}
          />
        )}
      </Modal>

      {/* Pay Purchase Modal */}
      <Modal isOpen={!!payTarget} onClose={() => setPayTarget(null)} title="Record Payment" subtitle={payTarget ? `#${payTarget.id.split('-').pop()} · ${payTarget.supplier_name || ''}` : ''}>
        {payTarget && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-[13px]"><span className="font-semibold text-gray-500">Order total</span><span className="font-mono font-bold">{formatCurrency(payTarget.total_amount)}</span></div>
            <div className="flex justify-between text-[13px]"><span className="font-semibold text-gray-500">Already paid</span><span className="font-mono font-bold">{formatCurrency(payTarget.paid_amount || 0)}</span></div>
            <div className="flex justify-between text-[13px] pt-2 border-t border-black/5"><span className="font-bold">Due</span><span className="font-mono font-bold text-red-600">{formatCurrency(dueOf(payTarget))}</span></div>
            <label className="block"><span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Amount</span>
              <input type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="mt-1 w-full h-11 px-3 border border-black/10 rounded-xl text-[14px] font-mono font-bold outline-none focus:border-amber-400" autoFocus />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Method</span>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="mt-1 w-full h-11 px-3 border border-black/10 rounded-xl text-[13px] font-semibold">
                  <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option>
                </select>
              </label>
              <label className="block"><span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Date</span>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="mt-1 w-full h-11 px-3 border border-black/10 rounded-xl text-[13px] font-semibold" />
              </label>
            </div>
            <button onClick={submitPay} disabled={paySubmitting || !(Number(payAmount) > 0)} className="h-11 rounded-xl bg-amber-600 text-white text-[13px] font-bold disabled:opacity-40 hover:bg-amber-700 flex items-center justify-center gap-2">
              <Banknote size={15} /> {paySubmitting ? 'Recording…' : 'Record payment'}
            </button>
          </div>
        )}
      </Modal>

      {/* View / Print voucher */}
      <Modal isOpen={!!printTarget} onClose={() => setPrintTarget(null)} title="Purchase Voucher" subtitle={printTarget ? `#${printTarget.id.split('-').pop()}` : ''}>
        {printTarget && (() => {
          const prod = products.find(p => p.id === printTarget.linked_product_id);
          return (
            <div>
              <div id="purchase-voucher" className="bg-white p-4 text-[13px]">
                <div className="text-lg font-extrabold text-ink-primary">{businessProfile?.name || 'Purchase Voucher'}</div>
                <div className="text-[11px] text-gray-400 mb-3">Purchase Voucher · #{printTarget.id.split('-').pop()}</div>
                <div className="grid grid-cols-2 gap-1 mb-3">
                  <div><span className="text-gray-400">Supplier:</span> <b>{printTarget.supplier_name || '—'}</b></div>
                  <div><span className="text-gray-400">Date:</span> <b>{formatDate(printTarget.date)}</b></div>
                  <div><span className="text-gray-400">Payment:</span> <b>{printTarget.payment_type || 'CASH'}</b></div>
                  <div><span className="text-gray-400">Status:</span> <b>{printTarget.status || 'RECEIVED'}</b></div>
                </div>
                <table className="w-full border-t border-b border-black/10 my-2">
                  <thead><tr className="text-[10px] uppercase text-gray-400"><th className="text-left py-1">Item</th><th className="text-center">Qty</th><th className="text-right">Amount</th></tr></thead>
                  <tbody><tr><td className="py-1">{prod?.name || 'Item'}</td><td className="text-center font-mono">{printTarget.quantity}</td><td className="text-right font-mono">{formatCurrency(printTarget.total_amount)}</td></tr></tbody>
                </table>
                <div className="flex justify-between font-bold mt-2"><span>Total</span><span className="font-mono">{formatCurrency(printTarget.total_amount)}</span></div>
                {Number(printTarget.paid_amount || 0) > 0 && <div className="flex justify-between text-[12px] text-emerald-600"><span>Paid</span><span className="font-mono">{formatCurrency(printTarget.paid_amount)}</span></div>}
              </div>
              <button onClick={() => { const w = window.open('', '_blank'); w.document.write(`<html><head><title>Purchase #${printTarget.id.split('-').pop()}</title></head><body>${document.getElementById('purchase-voucher').outerHTML}</body></html>`); w.document.close(); w.focus(); w.print(); }}
                className="mt-3 w-full h-11 rounded-xl bg-ink-primary text-white text-[13px] font-bold flex items-center justify-center gap-2"><Printer size={15} /> Print</button>
            </div>
          );
        })()}
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
