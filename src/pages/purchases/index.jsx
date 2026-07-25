import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePurchases } from '../../hooks/usePurchases';
import { useAccounts, accountForMethod } from '../../hooks/useAccounts';
import { useInventory } from '../../hooks/useInventory';
import { Plus, RotateCcw, Pencil, Trash2, ShoppingCart, ArrowLeftRight, Search, Banknote, Copy, Printer, X, MoreVertical, Calendar } from 'lucide-react';
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
  const { purchases, purchaseReturns, suppliers, add: addPurchase, editPurchase, updateStatus: updatePurchaseStatus, remove: removePurchase, addReturn, payPurchase, loading: purLoading } = usePurchases(currentTenantId);
  const { accounts: payAccounts = [], addTxn: addAccountTxn } = useAccounts(currentTenantId);
  const { products, inventoryLocations, loading: prodLoading, updateProduct, addProduct } = useInventory(currentTenantId);
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
  const [onlyUnpaid, setOnlyUnpaid] = useState(false); // quick chip: credit purchases still owing
  const [groupBy, setGroupBy] = useState('DATE'); // NONE | SUPPLIER | DATE

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
  // Cash/bank purchases are paid at the counter (paid_amount often left 0 in the
  // data) — only credit purchases carry a real balance due.
  const dueOf = (p) => _credit(p.payment_type)
    ? Math.max(0, Number(p.total_amount || 0) - Number(p.paid_amount || 0))
    : 0;

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


  const productNameById = useMemo(() => {
    const m = {};
    (products || []).forEach(x => { m[x.id] = x.name || ''; });
    return m;
  }, [products]);

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = (purchases || []).filter(p => {
      const prodName = productNameById[p.linked_product_id] || '';
      if (q && !(`${p.id} ${p.supplier_name || ''} ${p.notes || ''} ${prodName}`.toLowerCase().includes(q))) return false;
      if (fSupplier !== 'ALL' && p.supplier_id !== fSupplier) return false;
      if (fPay === 'CASH' && _credit(p.payment_type)) return false;
      if (fPay === 'CREDIT' && !_credit(p.payment_type)) return false;
      if (fStatus !== 'ALL' && (p.status || 'RECEIVED').toUpperCase() !== fStatus) return false;
      if (onlyUnpaid && dueOf(p) <= 0.5) return false;
      return true;
    });
    const amt = (p) => Number(p.total_amount || 0);
    const qty = (p) => Number(p.quantity || 0);
    rows = [...rows].sort((a, b) => {
      if (sortBy === 'AMT_DESC') return amt(b) - amt(a);
      if (sortBy === 'AMT_ASC')  return amt(a) - amt(b);
      if (sortBy === 'QTY_DESC') return qty(b) - qty(a);
      if (sortBy === 'QTY_ASC')  return qty(a) - qty(b);
      if (sortBy === 'DATE_ASC') return String(a.date).localeCompare(String(b.date));
      return String(b.date).localeCompare(String(a.date)); // DATE_DESC
    });
    return rows;
  }, [purchases, search, fSupplier, fPay, fStatus, sortBy, onlyUnpaid, productNameById]);

  // Count for the Unpaid chip badge — credit purchases still carrying a balance.
  const unpaidCount = useMemo(
    () => (purchases || []).filter(p => dueOf(p) > 0.5).length,
    [purchases]);

  // Age of a bill in days, and whether an unpaid credit purchase is overdue
  // (>30 days). Turns the list into a light ageing view.
  const ageDays = (p) => {
    const d = new Date(p.date);
    if (isNaN(d)) return 0;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  };
  const isOverdue = (p) => dueOf(p) > 0.5 && ageDays(p) > 30;

  // Group the filtered rows by supplier OR by date, each group carrying its
  // spend + outstanding subtotal. Flattened into one array with {__group}
  // marker rows so the shared Table can render headers and rows in one pass.
  // Date groups keep filteredPurchases' order, so the active sort (newest /
  // oldest) decides which day leads.
  const displayRows = useMemo(() => {
    if (groupBy === 'NONE') return filteredPurchases;
    const byDate = groupBy === 'DATE';
    const map = new Map();
    filteredPurchases.forEach(p => {
      const key = byDate ? (p.date || '—') : (p.supplier_id || p.supplier_name || '—');
      if (!map.has(key)) {
        map.set(key, {
          name: byDate ? (p.date || 'No date') : (p.supplier_name || 'Unknown supplier'),
          isDate: byDate, rows: [], total: 0, due: 0,
        });
      }
      const g = map.get(key);
      g.rows.push(p);
      g.total += Number(p.total_amount) || 0;
      g.due += dueOf(p);
    });
    const out = [];
    for (const [key, g] of map) {
      out.push({ __group: true, key, name: g.name, isDate: g.isDate, count: g.rows.length, total: g.total, due: g.due });
      g.rows.forEach(r => out.push(r));
    }
    return out;
  }, [filteredPurchases, groupBy]);

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
    // Hex on purpose: this feeds a standalone print window (document.write),
    // where the app's CSS variables don't exist.
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
    // Confirm before paying a supplier — blocks the thread so a double-tap can't
    // fire two payments.
    if (!window.confirm(`Pay ${formatCurrency(amt)} to ${payTarget.supplier_name || 'supplier'} (${payMethod})?`)) return;
    setPaySubmitting(true);
    const { error } = await payPurchase({ supplierId: payTarget.supplier_id, purchaseId: payTarget.id, amount: amt, method: payMethod, date: payDate });
    setPaySubmitting(false);
    if (error) { addNotification(`Payment failed: ${error.message}`, 'error'); return; }
    // Money out → post to the method's Cash/Bank account (non-blocking).
    const acc = accountForMethod(payAccounts, payMethod);
    if (acc) { try { await addAccountTxn({ account_id: acc, direction: 'OUT', amount: amt, mode: payMethod, ref_type: 'PURCHASE', ref_id: payTarget.id, note: `Supplier payment · ${payTarget.supplier_name || ''}`, date: payDate }); } catch { /* ledger non-blocking */ } }
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
    let firstError = '';
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
      if (error) {
        // Surface the real reason — swallowing it turned a hard DB error
        // ("function is not unique") into a bare "N item(s) failed to save".
        console.error('[purchase] save failed for', item.linked_product_id, error);
        if (!firstError) firstError = error.message || String(error);
        failed++;
        continue;
      }
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
    const payAcc = accountForMethod(payAccounts, header.payment_type);
    if (failed === 0 && payAcc && !_credit(header.payment_type)) {
      const total = items.reduce((s, it) => s + (Number(it.total_amount) || 0), 0);
      if (total > 0) {
        try {
          await addAccountTxn({ account_id: payAcc, direction: 'OUT', amount: total, mode: header.payment_type, ref_type: 'PURCHASE', note: `Purchase · ${supplierName}` });
        } catch { /* ledger non-blocking */ }
      }
    }
    setAddLoading(false);
    if (failed > 0) alert(`${failed} item(s) failed to save.${firstError ? `\n\nReason: ${firstError}` : ''}`);
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
      // One RPC, one transaction. This used to be five sequential calls, and a
      // failure at any of them left the edit half-applied — the row already
      // changed while the batch, stock or ledger still held the old values.
      // Now it either lands completely or not at all, so a failure needs no
      // partial-state message: nothing moved.
      //
      // It refuses to move a batch to a different product once units have been
      // sold from it, because that would rewrite COGS on closed periods. The
      // exception explains which sales are in the way.
      const { error } = await withTimeout(editPurchase({
        id:          orig.id,
        productId:   data.linked_product_id,
        supplierId:  data.supplier_id,
        quantity:    data.quantity,
        totalAmount: data.total_amount,
        unitCost:    data.unit_cost,
        paymentType: data.payment_type,
        date:        data.date,
        notes:       data.notes,
        userId:      currentUser?.id,
        accountId:   accountForMethod(payAccounts, data.payment_type),
      }), 15000, 'Save');
      if (error) throw error;

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
    { label: 'Ref · bill' },
    { label: 'Product / supplier' },
    { label: 'Qty', className: 'text-center' },
    { label: 'Payment' },
    { label: 'Total', className: 'text-right' },
    { label: 'Status', className: 'text-center' },
    { label: '', className: 'text-right' },
  ];
  const PUR_COLS = 7;

  // Two-letter supplier initials for the neutral avatar.
  const initialsOf = (name) => (name || '?')
    .trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const shortDate = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); };

  const _STATUS_STYLES = {
    PENDING:   { bg: 'bg-accent-signature/10',   text: 'text-accent-signature-hover',   border: 'border-accent-signature/25',   label: 'Pending'   },
    ORDERED:   { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    label: 'Ordered'   },
    RECEIVED:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Received'  },
    CANCELLED: { bg: 'bg-gray-100',   text: 'text-muted-foreground',    border: 'border-gray-200',    label: 'Cancelled' },
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
          <div className="text-xs font-semibold text-muted-foreground uppercase">{formatDate(ret.date)}</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm font-semibold text-rose-600">#{ret.id.split('-').pop()}</div>
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Debit Note</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm font-semibold text-foreground">{product?.name || ret.product_name || 'Unknown'}</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-[11px] text-muted-foreground truncate mt-0.5"
               title={supplier?.name || ret.supplier_name || ''}>
            {supplier?.name || ret.supplier_name || '—'}
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          <div className="text-sm font-semibold text-rose-500">−{ret.quantity}</div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="tabular-nums text-sm font-semibold text-rose-600 tabular-nums">{formatCurrency(ret.total_amount)}</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-xs text-muted-foreground">{ret.reason || '—'}</div>
        </td>
      </tr>
    );
  };

  // Subtotal band between groups. Date groups lead with a calendar glyph and
  // the full date; supplier groups with the supplier's initials.
  const renderGroupHeader = (g) => (
    <tr key={`g-${g.key}`} className="bg-canvas/70 border-y border-black/[0.04]">
      <td colSpan={PUR_COLS} className="px-4 py-2">
        <div className="flex items-center gap-2.5">
          {g.isDate ? (
            <div className="w-6 h-6 rounded-md bg-card border border-border/60 flex items-center justify-center text-muted-foreground shrink-0"><Calendar size={12} /></div>
          ) : (
            <div className="w-6 h-6 rounded-md bg-card border border-border/60 flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">{initialsOf(g.name)}</div>
          )}
          <span className="text-xs font-semibold text-foreground truncate" title={g.name}>{g.isDate ? formatDate(g.name) : g.name}</span>
          <span className="text-[11px] text-muted-foreground">{g.count} bill{g.count === 1 ? '' : 's'}</span>
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {formatCurrency(g.total)}
            {g.due > 0.5
              ? <> · <span className="text-[color:var(--color-neg)]">{formatCurrency(g.due)} due</span></>
              : <> · settled</>}
          </span>
        </div>
      </td>
    </tr>
  );

  const renderRow = (row) => {
    if (row.__group) return renderGroupHeader(row);
    const pur = row;
    const product = products.find(p => p.id === pur.linked_product_id);
    const supplier = suppliers.find(s => s.id === pur.supplier_id);
    const credit = _credit(pur.payment_type);
    const due = dueOf(pur);
    const overdue = isOverdue(pur);

    return (
      <tr key={pur.id}
        className="hover:bg-canvas transition-colors"
        style={overdue ? { boxShadow: 'inset 2px 0 0 0 var(--color-neg)' } : undefined}>
        {/* Ref · bill no · date */}
        <td className="px-4 py-3 align-top">
          <div className="font-mono text-[12px] text-foreground">{pur.id.split('-').pop()}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {pur.bill_no ? `bill ${pur.bill_no}` : 'no bill'} · {shortDate(pur.date)}
          </div>
        </td>
        {/* Avatar + product + supplier */}
        <td className="px-4 py-3 max-w-[280px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-canvas border border-border/60 flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
              {initialsOf(supplier?.name || pur.supplier_name)}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-foreground truncate" title={product?.name || ''}>
                {product?.name || 'Unknown Product'}
              </div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5"
                   title={supplier?.name || pur.supplier_name || ''}>
                {supplier?.name || pur.supplier_name || '—'}
              </div>
            </div>
          </div>
        </td>
        {/* Qty + unit */}
        <td className="px-4 py-3 text-center whitespace-nowrap">
          <span className="tabular-nums text-[13px] text-foreground">{pur.quantity}</span>
          <span className="text-[9px] text-muted-foreground uppercase ml-0.5">{product?.unit || 'pcs'}</span>
        </td>
        {/* Payment — dot + label, due underneath, overdue age tag */}
        <td className="px-4 py-3">
          {(() => {
            const dot = !credit ? 'var(--color-ink-tertiary)'
              : due <= 0.5 ? 'var(--color-pos)'
              : overdue ? 'var(--color-neg)' : '#B45309';
            const label = !credit ? (pur.payment_type || 'Cash')
              : due <= 0.5 ? 'Paid'
              : (Number(pur.paid_amount || 0) > 0 ? 'Partial' : 'Credit');
            return (
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: dot }} />
                <div className="min-w-0">
                  <div className="text-[12px] text-muted-foreground">
                    {label}
                    {credit && due > 0.5 && overdue && (
                      <span className="text-[color:var(--color-neg)] text-[10px]"> · {ageDays(pur)}d</span>
                    )}
                  </div>
                  {credit && due > 0.5 && (
                    <div className="tabular-nums text-[11px] text-[color:var(--color-neg)] mt-0.5">due {formatCurrency(due)}</div>
                  )}
                </div>
              </div>
            );
          })()}
        </td>
        {/* Total */}
        <td className="px-4 py-3 text-right tabular-nums text-[14px] font-semibold text-foreground">{formatCurrency(pur.total_amount)}</td>
        {/* Status select */}
        <td className="px-4 py-3 text-center">
          {(() => {
            const st = (pur.status || 'RECEIVED').toUpperCase();
            const s = _STATUS_STYLES[st] || _STATUS_STYLES.RECEIVED;
            return (
              <select
                value={st}
                onChange={(e) => updatePurchaseStatus(pur.id, e.target.value)}
                className={`text-[10px] font-medium px-2.5 py-1 rounded-pill border outline-none cursor-pointer ${s.bg} ${s.text} ${s.border}`}
              >
                <option value="PENDING">Pending</option>
                <option value="ORDERED">Ordered</option>
                <option value="RECEIVED">Received</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            );
          })()}
        </td>
        {/* Actions */}
        <td className="px-4 py-3 text-right">
          <div className="flex items-center gap-1.5 justify-end">
            {credit && due > 0.5 && (
              <button
                onClick={() => { setPayTarget(pur); setPayAmount(String(due)); setPayMethod('CASH'); }}
                title={`Due ${formatCurrency(due)}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-accent-signature-hover border border-accent-signature/40 hover:bg-accent-signature/10 transition-colors"
              >
                <Banknote size={12} /> Pay
              </button>
            )}
            <button
              onClick={(e) => openMenu(e, pur)}
              title="More"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground transition-colors"
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
      <div className="flex justify-between items-center pb-3 border-b border-border/60">
        <div>
          <h1 className="text-base font-semibold text-foreground tracking-tight">Purchases</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Inward stock from suppliers</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
          <Plus size={14} /> New purchase
        </button>
      </div>

      {/* ── Summary strip ── */}
      {activeTab === 'purchases' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/60 rounded-lg overflow-hidden border border-border/60">
          {[
            { label: 'This month', value: formatCurrency(summary.month) },
            { label: 'Purchases', value: summary.count },
            { label: 'Payable', value: formatCurrency(summary.payable), cls: summary.payable > 0 ? 'text-[color:var(--color-neg)]' : 'text-foreground' },
            { label: 'ITC this month', value: formatCurrency(summary.itc), cls: 'text-[color:var(--color-pos)]' },
          ].map((m, i) => (
            <div key={i} className="bg-card px-4 py-3">
              <div className="text-[11px] font-medium text-muted-foreground">{m.label}</div>
              <div className={`text-[19px] font-semibold tabular-nums tracking-tight mt-0.5 ${m.cls || 'text-foreground'}`}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab switcher ── */}
      <div className="flex items-center bg-muted rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setActiveTab('purchases')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] transition-colors ${
            activeTab === 'purchases'
              ? 'bg-card text-foreground font-semibold shadow-sm'
              : 'text-muted-foreground font-medium hover:text-foreground'
          }`}
        >
          <ShoppingCart size={11} /> Purchases
          <span className="ml-1 text-[9px] font-semibold bg-black/5 rounded px-1.5 py-0.5">{purchases.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] transition-colors ${
            activeTab === 'returns'
              ? 'bg-card text-rose-600 font-semibold shadow-sm'
              : 'text-muted-foreground font-medium hover:text-foreground'
          }`}
        >
          <ArrowLeftRight size={11} /> Returns
          <span className={`ml-1 text-[9px] font-semibold rounded px-1.5 py-0.5 ${purchaseReturns.length > 0 ? 'bg-rose-100 text-rose-600' : 'bg-black/5'}`}>
            {purchaseReturns.length}
          </span>
        </button>
      </div>

      {/* ── Filter / sort bar (purchases tab) ── */}
      {activeTab === 'purchases' && (
        <div className="flex flex-wrap items-center gap-2 bg-card border border-border/60 rounded-xl p-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product / ref / supplier / notes…"
              className="w-full h-9 pl-9 pr-3 bg-card border border-border rounded-lg text-[12px] font-semibold outline-none focus:border-accent-signature/70" />
          </div>
          <select value={fSupplier} onChange={e => setFSup(e.target.value)} className="h-9 px-2 border border-border rounded-lg text-[12px] font-semibold">
            <option value="ALL">All suppliers</option>
            {(suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={fPay} onChange={e => setFPay(e.target.value)} className="h-9 px-2 border border-border rounded-lg text-[12px] font-semibold">
            <option value="ALL">All payment</option><option value="CASH">Cash</option><option value="CREDIT">Credit</option>
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="h-9 px-2 border border-border rounded-lg text-[12px] font-semibold">
            <option value="ALL">All status</option><option value="PENDING">Pending</option><option value="ORDERED">Ordered</option><option value="RECEIVED">Received</option><option value="CANCELLED">Cancelled</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="h-9 px-2 border border-border rounded-lg text-[12px] font-semibold">
            <option value="DATE_DESC">Newest</option><option value="DATE_ASC">Oldest</option>
            <option value="AMT_DESC">Amount ↓</option><option value="AMT_ASC">Amount ↑</option>
            <option value="QTY_DESC">Qty ↓</option><option value="QTY_ASC">Qty ↑</option>
          </select>
          {/* Quick chip — jump straight to bills still owing. */}
          <button
            onClick={() => setOnlyUnpaid(v => !v)}
            className={`h-9 px-3 rounded-lg text-[12px] font-semibold border inline-flex items-center gap-1.5 transition-colors ${
              onlyUnpaid ? 'bg-[color:var(--color-neg)]/10 border-[color:var(--color-neg)]/30 text-[color:var(--color-neg)]'
                         : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            Unpaid
            {unpaidCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${onlyUnpaid ? 'bg-[color:var(--color-neg)]/15' : 'bg-black/5'}`}>{unpaidCount}</span>
            )}
          </button>
          {/* Group control — by date (default) or supplier, or a flat list. */}
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
            title="Group the list"
            className={`h-9 px-2 border rounded-lg text-[12px] font-semibold ${
              groupBy !== 'NONE' ? 'bg-accent-signature/10 border-accent-signature/30 text-accent-signature-hover'
                                 : 'border-border text-muted-foreground'}`}>
            <option value="DATE">Group by date</option>
            <option value="SUPPLIER">Group by supplier</option>
            <option value="NONE">No grouping</option>
          </select>
          <span className="text-[11px] font-semibold text-muted-foreground ml-auto">{filteredPurchases.length} of {purchases.length}</span>
        </div>
      )}

      {activeTab === 'purchases' && (
        <Table
          headers={headers}
          rows={displayRows}
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
          <div className="fixed z-[9999] w-44 bg-card border border-border rounded-lg shadow-xl py-1 text-[12px] font-semibold" style={{ top: menuPos.top, left: menuPos.left }}>
            <button onClick={() => { const p = menuRow; setMenuRow(null); setPrintTarget(p); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-foreground"><Printer size={13} /> Print</button>
            <button onClick={() => { const p = menuRow; setMenuRow(null); setDupTarget(p); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-foreground"><Copy size={13} /> Duplicate</button>
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
            <div className="flex justify-between text-[13px]"><span className="font-semibold text-muted-foreground">Order total</span><span className="tabular-nums font-semibold">{formatCurrency(payTarget.total_amount)}</span></div>
            <div className="flex justify-between text-[13px]"><span className="font-semibold text-muted-foreground">Already paid</span><span className="tabular-nums font-semibold">{formatCurrency(payTarget.paid_amount || 0)}</span></div>
            <div className="flex justify-between text-[13px] pt-2 border-t border-border/60"><span className="font-semibold">Due</span><span className="tabular-nums font-semibold text-red-600">{formatCurrency(dueOf(payTarget))}</span></div>
            <label className="block"><span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-widest">Amount</span>
              <input type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="mt-1 w-full h-11 px-3 border border-border rounded-xl text-[14px] tabular-nums font-semibold outline-none focus:border-accent-signature/70" autoFocus />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-widest">Method</span>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="mt-1 w-full h-11 px-3 border border-border rounded-xl text-[13px] font-semibold">
                  <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option>
                </select>
              </label>
              <label className="block"><span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-widest">Date</span>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="mt-1 w-full h-11 px-3 border border-border rounded-xl text-[13px] font-semibold" />
              </label>
            </div>
            <button onClick={submitPay} disabled={paySubmitting || !(Number(payAmount) > 0)} className="h-11 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold disabled:opacity-40 hover:bg-primary/90 flex items-center justify-center gap-2">
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
              <div id="purchase-voucher" className="bg-card p-4 text-[13px]">
                <div className="text-lg font-extrabold text-foreground">{businessProfile?.name || 'Purchase Voucher'}</div>
                <div className="text-[11px] text-muted-foreground mb-3">Purchase Voucher · #{printTarget.id.split('-').pop()}</div>
                <div className="grid grid-cols-2 gap-1 mb-3">
                  <div><span className="text-muted-foreground">Supplier:</span> <b>{printTarget.supplier_name || '—'}</b></div>
                  <div><span className="text-muted-foreground">Date:</span> <b>{formatDate(printTarget.date)}</b></div>
                  <div><span className="text-muted-foreground">Payment:</span> <b>{printTarget.payment_type || 'CASH'}</b></div>
                  <div><span className="text-muted-foreground">Status:</span> <b>{printTarget.status || 'RECEIVED'}</b></div>
                </div>
                <table className="w-full border-t border-b border-border my-2">
                  <thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="text-left py-1">Item</th><th className="text-center">Qty</th><th className="text-right">Amount</th></tr></thead>
                  <tbody><tr><td className="py-1">{prod?.name || 'Item'}</td><td className="text-center tabular-nums">{printTarget.quantity}</td><td className="text-right tabular-nums">{formatCurrency(printTarget.total_amount)}</td></tr></tbody>
                </table>
                <div className="flex justify-between font-semibold mt-2"><span>Total</span><span className="tabular-nums">{formatCurrency(printTarget.total_amount)}</span></div>
                {Number(printTarget.paid_amount || 0) > 0 && <div className="flex justify-between text-[12px] text-emerald-600"><span>Paid</span><span className="tabular-nums">{formatCurrency(printTarget.paid_amount)}</span></div>}
              </div>
              <button onClick={() => printVoucher(printTarget)}
                className="mt-3 w-full h-11 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold flex items-center justify-center gap-2"><Printer size={15} /> Print</button>
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
