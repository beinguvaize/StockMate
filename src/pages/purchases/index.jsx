import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePurchases } from '../../hooks/usePurchases';
import { useAccounts } from '../../hooks/useAccounts';
import { useInventory } from '../../hooks/useInventory';
import { Plus, RotateCcw, Pencil, Trash2, ShoppingCart, ArrowLeftRight, Search, Banknote, Copy, Printer, X, MoreVertical, Truck } from 'lucide-react';
import Button from '../../shared/Button';
import Modal from '../../shared/Modal';
import Table from '../../shared/Table';
import { PageSkeleton } from '../../components/ui/States';
import { formatCurrency, formatDate, generateRef } from '../../lib/utils';
import PurchaseForm from './components/PurchaseForm';
import MultiPurchaseForm from './components/MultiPurchaseForm';
import PurchaseReturnForm from './components/PurchaseReturnForm';

const PurchasesPage = () => {
  const { currentTenantId, businessProfile } = useTenant();
  const { currentUser } = useAuth();
  const { addNotification } = useNotifications();
  const { purchases, purchaseReturns, suppliers, add: addPurchase, update: updatePurchase, recostBatches, updateStatus: updatePurchaseStatus, remove: removePurchase, addReturn, payPurchase, loading: purLoading } = usePurchases(currentTenantId);
  const { accounts: payAccounts = [], addTxn: addAccountTxn } = useAccounts(currentTenantId);
  const payAcc = payAccounts.find(a => a.type === 'CASH')?.id || payAccounts[0]?.id || '';
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

  // Header summary — this-month spend, count, total payable, derived ITC.
  const summary = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
    let month = 0, itc = 0, payable = 0;
    (purchases || []).forEach((p) => {
      const amt = Number(p.total_amount) || 0;
      payable += dueOf(p);
      if (String(p.date || '').slice(0, 7) === ym) {
        month += amt;
        itc += amt - amt / 1.18; // 18% default back-out (matches purchase register)
      }
    });
    return { month, count: (purchases || []).length, payable, itc };
  }, [purchases]);

  // Supplier ledger — per-supplier purchased / paid / payable, sorted by due.
  const supplierStats = useMemo(() => {
    const map = {};
    (purchases || []).forEach((p) => {
      const sid = p.supplier_id || '__none';
      if (!map[sid]) map[sid] = { id: sid, name: (suppliers.find(s => s.id === sid)?.name) || p.supplier_name || 'Unknown', purchased: 0, paid: 0, payable: 0, count: 0 };
      const amt = Number(p.total_amount) || 0;
      map[sid].purchased += amt;
      map[sid].paid += Math.min(amt, Number(p.paid_amount) || 0);
      map[sid].payable += dueOf(p);
      map[sid].count += 1;
    });
    return Object.values(map).sort((a, b) => b.payable - a.payable || b.purchased - a.purchased);
  }, [purchases, suppliers]);

  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const activeSupplier = selectedSupplierId
    ? supplierStats.find(s => s.id === selectedSupplierId)
    : supplierStats[0];
  const supplierPurchases = useMemo(
    () => (purchases || [])
      .filter(p => (p.supplier_id || '__none') === activeSupplier?.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [purchases, activeSupplier],
  );

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

  // Professional, self-contained printable purchase voucher (own CSS — the
  // print window has none of the app's styles).
  const printVoucher = (p) => {
    const prod = products.find(x => x.id === p.linked_product_id);
    const cur = businessProfile?.currencySymbol || '₹';
    const due = dueOf(p);
    const paid = Number(p.paid_amount || 0);
    const fmt = (n) => `${cur}${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const ref = `#${p.id.split('-').pop()}`;
    const credit = _credit(p.payment_type);
    const statusColor = credit ? (due <= 0.5 ? '#059669' : '#D97706') : '#059669';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Purchase ${ref}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
body{background:#f5f5f4;color:#1c1917;padding:32px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.card{max-width:640px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 28px;border-bottom:1px solid #f0efed}
.biz{font-size:20px;font-weight:800;letter-spacing:-.01em}
.sub{font-size:11px;color:#a8a29e;margin-top:2px;text-transform:uppercase;letter-spacing:.12em}
.badge{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;padding:5px 12px;border-radius:9999px;color:#fff;background:${statusColor}}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;padding:20px 28px;font-size:13px}
.meta .k{color:#a8a29e;font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:700}
.meta .v{font-weight:700;margin-top:2px}
table{width:100%;border-collapse:collapse;margin:0}
thead th{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#a8a29e;text-align:left;padding:10px 28px;background:#fafaf9;border-top:1px solid #f0efed;border-bottom:1px solid #f0efed}
thead th.r{text-align:right}thead th.c{text-align:center}
tbody td{padding:14px 28px;font-size:13px;border-bottom:1px solid #f5f4f2}
td.r{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}td.c{text-align:center;font-variant-numeric:tabular-nums}
.tot{padding:16px 28px}
.row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;color:#57534e}
.row .amt{font-variant-numeric:tabular-nums;font-weight:600;color:#1c1917}
.grand{display:flex;justify-content:space-between;align-items:center;padding-top:12px;margin-top:6px;border-top:2px solid #1c1917}
.grand .l{font-size:15px;font-weight:800}.grand .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:#D97706}
.due{color:#dc2626}.paid{color:#059669}
.ft{padding:16px 28px;border-top:1px solid #f0efed;font-size:11px;color:#a8a29e;text-align:center}
@media print{body{background:#fff;padding:0}.card{border:none}}
</style></head><body>
<div class="card">
  <div class="hd">
    <div><div class="biz">${(businessProfile?.name || 'Purchase Voucher')}</div><div class="sub">Purchase Voucher · ${ref}</div></div>
    <div class="badge">${credit ? (due <= 0.5 ? 'Paid' : (paid > 0 ? 'Partial' : 'Credit')) : (p.payment_type || 'Cash')}</div>
  </div>
  <div class="meta">
    <div><div class="k">Supplier</div><div class="v">${p.supplier_name || '—'}</div></div>
    <div><div class="k">Date</div><div class="v">${formatDate(p.date)}</div></div>
    <div><div class="k">Payment</div><div class="v">${p.payment_type || 'CASH'}</div></div>
    <div><div class="k">Status</div><div class="v">${p.status || 'RECEIVED'}</div></div>
  </div>
  <table>
    <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Amount</th></tr></thead>
    <tbody><tr><td>${prod?.name || 'Item'}</td><td class="c">${p.quantity}</td><td class="r">${fmt(p.total_amount)}</td></tr></tbody>
  </table>
  <div class="tot">
    <div class="grand"><span class="l">Total</span><span class="v">${fmt(p.total_amount)}</span></div>
    ${paid > 0 ? `<div class="row" style="margin-top:10px"><span>Paid</span><span class="amt paid">${fmt(paid)}</span></div>` : ''}
    ${due > 0.5 ? `<div class="row"><span>Balance due</span><span class="amt due">${fmt(due)}</span></div>` : ''}
  </div>
  <div class="ft">Thank you · ${(businessProfile?.name || '')}</div>
</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html); w.document.close();
  };

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
        bill_no:           header.bill_no || null,
        userId:            currentUser?.id,
        locationId:        header.location_id || null,
      };
      const { error } = await addPurchase(payload);
      if (error) { failed++; continue; }
      await updateWAC(item.linked_product_id, item.quantity, item.unit_price);
      // Expiry tracking: a dated batch per line when expiry was provided.
      if (item.expiry_date) {
        const { supabase } = await import('../../lib/supabase');
        await supabase.from('product_batches').insert({
          tenant_id: currentTenantId,
          product_id: item.linked_product_id,
          purchase_id: payload.id,
          supplier_id: header.supplier_id,
          received_date: header.date,
          unit_cost: item.unit_price,
          qty_received: item.quantity,
          qty_remaining: item.quantity,
          expiry_date: item.expiry_date,
          warehouse_id: header.location_id || null,
        });
      }
    }
    // Money out → post the paid total to the default Cash/Bank account
    // (skip credit purchases; non-blocking).
    if (failed === 0 && payAcc && !_credit(header.payment_type)) {
      const total = items.reduce((s, it) => s + (Number(it.total_amount) || 0), 0);
      if (total > 0) {
        try {
          await addAccountTxn({ account_id: payAcc, direction: 'OUT', amount: total, mode: header.payment_type, ref_type: 'PURCHASE', note: `Purchase · ${supplierName}` });
        } catch { /* ledger non-blocking */ }
      }
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

  // Bound each network step so a stalled request can't leave the form stuck
  // on "Saving…" forever (the 4-hop client chain was hanging on weak links).
  const withTimeout = (p, ms, label) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out — check connection and retry`)), ms)),
  ]);

  const handleEditPurchase = async (data) => {
    setEditLoading(true);
    const orig = editTarget;
    try {
      const qtyDelta = Number(data.quantity) - Number(orig.quantity);

      // 1. Update the purchase record.
      const { error } = await withTimeout(updatePurchase(orig.id, {
        linked_product_id: data.linked_product_id,
        supplier_id:       data.supplier_id,
        supplier_name:     suppliers.find(s => s.id === data.supplier_id)?.name || orig.supplier_name,
        quantity:          Number(data.quantity),
        total_amount:      Number(data.total_amount),
        payment_type:      data.payment_type,
        date:              data.date,
        notes:             data.notes,
      }), 10000, 'Save');
      if (error) throw error;

      // 2. Recost the batches this purchase created so FIFO/COGS/margin pick up
      //    the corrected unit price (the old flow never touched batches).
      if (Number(data.unit_cost) > 0) {
        const { error: rcErr } = await withTimeout(
          recostBatches(orig.id, Number(data.unit_cost)), 10000, 'Batch recost');
        if (rcErr) addNotification('Saved, but batch cost not updated: ' + rcErr.message, 'error');
      }

      // 3. Adjust inventory for the quantity delta.
      if (qtyDelta !== 0 && data.linked_product_id) {
        const { error: adjErr } = await withTimeout(
          adjustStock(data.linked_product_id, qtyDelta, `Purchase edit: ${orig.id}`, null), 10000, 'Stock adjust');
        if (adjErr) addNotification('Saved, but stock not adjusted: ' + adjErr.message, 'error');
      }

      addNotification('Purchase updated', 'success');
      setEditTarget(null);
    } catch (e) {
      addNotification('Could not save purchase: ' + (e?.message || e), 'error');
    } finally {
      setEditLoading(false);
    }
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

  if (purLoading || prodLoading) return <PageSkeleton cards={3} rows={8} />;

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex justify-between items-center pb-3 border-b border-black/5">
        <div>
          <h1 className="text-[19px] font-bold text-ink-primary leading-none tracking-tight">Purchases</h1>
          <p className="text-[12px] text-gray-400 mt-1">Inward stock from suppliers</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-ink-primary text-white text-[12px] font-bold hover:opacity-90 transition-opacity">
          <Plus size={14} /> New purchase
        </button>
      </div>

      {/* ── Summary strip ── */}
      {activeTab === 'purchases' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-black/[0.06] rounded-lg overflow-hidden border border-black/[0.06]">
          {[
            { label: 'This month', value: formatCurrency(summary.month) },
            { label: 'Purchases', value: summary.count },
            { label: 'Payable', value: formatCurrency(summary.payable), cls: summary.payable > 0 ? 'text-rose-700' : 'text-ink-primary' },
            { label: 'ITC this month', value: formatCurrency(summary.itc), cls: 'text-emerald-700' },
          ].map((m, i) => (
            <div key={i} className="bg-white px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">{m.label}</div>
              <div className={`text-lg font-bold font-mono mt-0.5 ${m.cls || 'text-ink-primary'}`}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

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
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'suppliers' ? 'bg-white shadow text-ink-primary' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Truck size={11} /> Suppliers
          <span className="ml-1 text-[9px] font-bold bg-black/5 rounded px-1.5 py-0.5">{supplierStats.length}</span>
        </button>
      </div>

      {/* ── Supplier ledger ── */}
      {activeTab === 'suppliers' && (
        <div className="grid md:grid-cols-[260px_1fr] gap-4">
          {/* Supplier list */}
          <div className="bg-white border border-black/5 rounded-lg overflow-hidden divide-y divide-black/5 self-start">
            {supplierStats.length === 0 && <div className="p-4 text-[12px] text-gray-400">No suppliers yet.</div>}
            {supplierStats.map((s) => (
              <button key={s.id} onClick={() => setSelectedSupplierId(s.id)}
                className={`w-full text-left px-3 py-2.5 hover:bg-canvas transition-colors ${activeSupplier?.id === s.id ? 'bg-canvas shadow-[inset_3px_0_0_var(--color-ink-primary)]' : ''}`}>
                <div className="text-[13px] font-bold text-ink-primary truncate">{s.name}</div>
                <div className={`text-[11px] font-mono ${s.payable > 0.5 ? 'text-rose-600' : 'text-gray-400'}`}>
                  {s.payable > 0.5 ? `${formatCurrency(s.payable)} due` : 'settled'}
                </div>
              </button>
            ))}
          </div>

          {/* Selected supplier ledger */}
          {activeSupplier && (
            <div className="bg-white border border-black/5 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-black/5">
                <div className="text-[15px] font-bold text-ink-primary">{activeSupplier.name}</div>
                <div className="text-[11px] text-gray-400">{activeSupplier.count} purchase{activeSupplier.count !== 1 ? 's' : ''}</div>
              </div>
              <div className="grid grid-cols-3 gap-px bg-black/[0.06] border-b border-black/[0.06]">
                {[
                  { label: 'Purchased', value: formatCurrency(activeSupplier.purchased) },
                  { label: 'Paid', value: formatCurrency(activeSupplier.paid), cls: 'text-emerald-700' },
                  { label: 'Payable', value: formatCurrency(activeSupplier.payable), cls: activeSupplier.payable > 0.5 ? 'text-rose-700' : 'text-ink-primary' },
                ].map((m, i) => (
                  <div key={i} className="bg-white px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400">{m.label}</div>
                    <div className={`text-[15px] font-bold font-mono mt-0.5 ${m.cls || 'text-ink-primary'}`}>{m.value}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[80px_1fr_70px_100px_90px] gap-3 px-5 py-2 text-[10px] uppercase tracking-wider text-gray-400 border-b border-black/5">
                <div>Date</div><div>Item · bill</div><div className="text-right">Qty</div><div className="text-right">Amount</div><div className="text-right">Due</div>
              </div>
              <div className="max-h-[420px] overflow-auto divide-y divide-black/5">
                {supplierPurchases.map((p) => {
                  const prod = products.find(x => x.id === p.linked_product_id);
                  const due = dueOf(p);
                  return (
                    <div key={p.id} className="grid grid-cols-[80px_1fr_70px_100px_90px] gap-3 px-5 py-2.5 items-center">
                      <div className="text-[12px] font-mono text-gray-500">{formatDate(p.date)}</div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-ink-primary truncate">{prod?.name || 'Item'}</div>
                        <div className="text-[10px] font-mono text-gray-400">{p.bill_no ? `Bill ${p.bill_no}` : `#${p.id.split('-').pop()}`}</div>
                      </div>
                      <div className="text-right text-[13px] font-mono text-emerald-600">+{p.quantity}</div>
                      <div className="text-right text-[13px] font-mono font-bold">{formatCurrency(p.total_amount)}</div>
                      <div className={`text-right text-[12px] font-mono ${due > 0.5 ? 'text-rose-600' : 'text-gray-300'}`}>{due > 0.5 ? formatCurrency(due) : '—'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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

      {activeTab === 'purchases' && (
        <Table
          headers={headers}
          rows={filteredPurchases}
          renderRow={renderRow}
          emptyMessage="No purchases match the filters"
        />
      )}
      {activeTab === 'returns' && (
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
          <div className="fixed z-[9999] w-44 bg-white border border-black/10 rounded-lg shadow-xl py-1 text-[12px] font-semibold" style={{ top: menuPos.top, left: menuPos.left }}>
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
              <button onClick={() => printVoucher(printTarget)}
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
