import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePurchases } from '../../hooks/usePurchases';
import { useAccounts, accountForMethod } from '../../hooks/useAccounts';
import { useInventory } from '../../hooks/useInventory';
import { Plus, RotateCcw, Pencil, Trash2, ShoppingCart, ArrowLeftRight, Search, Banknote, Copy, Printer, X, MoreVertical, Calendar, ChevronRight } from 'lucide-react';
import Button from '../../shared/Button';
import Modal from '../../shared/Modal';
import Table from '../../shared/Table';
import { PageSkeleton } from '../../components/ui/States';
import { formatCurrency, formatDate, generateRef } from '../../lib/utils';
import { groupPurchasesIntoBills, filterBills, paidOf, dueOf as billDueOf, isCreditType } from '../../lib/bills';
import { buildVoucherModel } from './lib/voucher';
import { voucherHtml } from './lib/voucherHtml';
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
  const [expandedBill, setExpandedBill] = useState(null); // bill id whose products are open

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

  // Credit terms, paid and due all come from src/lib/bills.js so this screen and
  // the supplier ledger cannot disagree about what is owed.
  const _credit = isCreditType;
  const dueOf = billDueOf;

  // Header summary — this-month spend, count, total payable, claimable ITC.
  //
  // ITC used to be `amt - amt / 1.18` on every purchase, which assumed 18% no
  // matter what the product is actually taxed at. It now uses each product's
  // own rate, so a 0-rated item contributes nothing instead of phantom credit.
  //
  // Registration is reported, not assumed. Credit can only be claimed against a
  // registered supplier's tax invoice, but a blank GSTIN here means "never
  // entered" rather than "unregistered" — 12 of 13 suppliers are blank, and the
  // one that is set is a placeholder. Excluding blanks outright would understate
  // the claim and cost money at filing, so they are counted into a separate
  // "pending" figure that names how many suppliers need a GSTIN on file.
  const summary = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7); // YYYY-MM

    const gstinOf = new Map(
      (suppliers || []).map(s => [s.id, String(s.gstin || '').trim()])
    );
    const rateOf = new Map(
      (products || []).map(p => [p.id, Number(p.taxRate)])
    );

    let month = 0, itc = 0, payable = 0, itcUnverified = 0, missingGstinCount = 0;
    const missingGstinSuppliers = new Set();

    (purchases || []).forEach((p) => {
      const amt = Number(p.total_amount) || 0;
      payable += dueOf(p);
      if (String(p.date || '').slice(0, 7) !== ym) return;

      month += amt;

      // The product's own rate. A product taxed at 0 earns no credit, rather
      // than an assumed 18%.
      const rate = Number(rateOf.get(p.linked_product_id));
      if (!Number.isFinite(rate) || rate <= 0) return;

      // total_amount is GST-inclusive.
      const credit = amt - amt / (1 + rate / 100);

      // A blank GSTIN means "not recorded", NOT "unregistered". Almost no
      // supplier here has one filled in, so treating blank as unregistered
      // would understate the claim — which costs real money at filing time,
      // the opposite error to the one being fixed. Count it separately and
      // say so, instead of folding an unknown into either extreme.
      if (gstinOf.get(p.supplier_id)) {
        itc += credit;
      } else {
        itcUnverified += credit;
        missingGstinCount += 1;
        if (p.supplier_id) missingGstinSuppliers.add(p.supplier_id);
      }
    });

    return {
      month, count: (purchases || []).length, payable, itc,
      itcUnverified, missingGstinCount,
      missingGstinSuppliers: missingGstinSuppliers.size,
    };
  }, [purchases, suppliers, products, dueOf]);


  const productNameById = useMemo(() => {
    const m = {};
    (products || []).forEach(x => { m[x.id] = x.name || ''; });
    return m;
  }, [products]);

  // A voucher covers the bill a line belongs to. Printing from a product row
  // must produce the whole document, not that row's share of it.
  const billOfLine = (line) =>
    (allBills || []).find(b => b.lines.some(l => l.id === line?.id)) || null;

  // The voucher needs the whole product, not just its name — hsn_code, unit and
  // taxRate all appear on the printed document.
  const productById = useMemo(() => {
    const m = {};
    (products || []).forEach(x => { m[x.id] = x; });
    return m;
  }, [products]);

  // Bills first, then filter whole bills.
  //
  // Filtering the product rows first and grouping after left a bill missing any
  // line the filter rejected: ticking "Unpaid" showed SAJJAD's 1 Aug bill as
  // Rs 10,260 with Rs 3,260 paid, because its three settled lines were gone
  // before the total was added up. It is Rs 28,770 with Rs 21,770 paid.
  const allBills = useMemo(
    () => groupPurchasesIntoBills(purchases || []).map(b => ({
      ...b,
      __bill: true,
      notes: b.lines.map(l => l.notes).filter(Boolean).join(' · '),
    })),
    [purchases]);

  const filteredBills = useMemo(() => {
    const rows = filterBills(allBills, {
      q: search,
      supplierId: fSupplier,
      pay: fPay,
      status: fStatus,
      onlyUnpaid,
      productNameOf: (id) => productNameById[id] || '',
    });
    const qtyOf = (b) => b.lines.reduce((s2, l) => s2 + Number(l.quantity || 0), 0);
    return [...rows].sort((a, b) => {
      if (sortBy === 'AMT_DESC') return b.total - a.total;
      if (sortBy === 'AMT_ASC')  return a.total - b.total;
      if (sortBy === 'QTY_DESC') return qtyOf(b) - qtyOf(a);
      if (sortBy === 'QTY_ASC')  return qtyOf(a) - qtyOf(b);
      if (sortBy === 'DATE_ASC') return String(a.date).localeCompare(String(b.date));
      return String(b.date).localeCompare(String(a.date)); // DATE_DESC
    });
  }, [allBills, search, fSupplier, fPay, fStatus, sortBy, onlyUnpaid, productNameById]);

  // Count for the Unpaid chip badge — bills still carrying a balance.
  const unpaidCount = useMemo(() => allBills.filter(b => b.due > 0.5).length, [allBills]);

  // Age of a bill in days, and whether one still owing is overdue (>30 days).
  const ageDays = (p) => {
    const d = new Date(p.date);
    if (isNaN(d)) return 0;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  };

  const displayRows = useMemo(() => {
    if (groupBy === 'NONE') return filteredBills;
    const byDate = groupBy === 'DATE';
    const map = new Map();
    filteredBills.forEach(b => {
      const key = byDate ? (b.date || '—') : (b.supplier_id || b.supplier_name || '—');
      if (!map.has(key)) {
        map.set(key, {
          name: byDate ? (b.date || 'No date') : (b.supplier_name || 'Unknown supplier'),
          isDate: byDate, rows: [], total: 0, due: 0,
        });
      }
      const g = map.get(key);
      g.rows.push(b);
      g.total += b.total;
      g.due += b.due;
    });
    const out = [];
    for (const [key, g] of map) {
      out.push({ __group: true, key, name: g.name, isDate: g.isDate, count: g.rows.length, total: g.total, due: g.due });
      g.rows.forEach(r => out.push(r));
    }
    return out;
  }, [filteredBills, groupBy]);

  // Professional, self-contained printable purchase voucher (own CSS — the
  // print window has none of the app's styles).
  // Print the whole bill, not one row of it.
  //
  // This used to take a single `purchases` row, so a two-product bill printed
  // as two half-vouchers that each showed part of the money and neither of
  // which added up to what the supplier was handed.
  //
  // The model and the document live in ./lib/voucher and ./lib/voucherHtml so
  // the arithmetic -- tax split, totals, amount in words -- is unit tested
  // rather than trusted because it looked right on screen once.
  const printVoucher = (bill) => {
    if (!bill) return;
    const model = buildVoucherModel({
      bill,
      supplier: {
        ...(suppliers || []).find(s => s.id === bill.supplier_id),
        name: (suppliers || []).find(s => s.id === bill.supplier_id)?.name || bill.supplier_name,
        __homeStateCode: String(businessProfile?.gst_no || '').slice(0, 2),
      },
      productById,
    });
    const w = window.open('', '_blank');
    if (!w) { addNotification('Allow pop-ups to print the voucher', 'error'); return; }
    w.document.write(voucherHtml(model, businessProfile || {}));
    w.document.close();
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

    // A part payment has to be spread across the bill's lines, because each
    // product becomes its own purchases row. Fill the lines in order until the
    // money runs out, rather than pro-rating: it keeps every figure a whole
    // rupee and leaves a clear boundary between what is settled and what is not.
    const billTotal = items.reduce((s2, i) => s2 + (Number(i.total_amount) || 0), 0);
    const paidNow   = parseFloat(header.paid_now);
    const partial   = Number.isFinite(paidNow) && paidNow > 0 && paidNow < billTotal - 0.005;
    let paidLeft    = partial ? paidNow : 0;

    for (const item of items) {
      // Blank field: the payment type decides, exactly as before.
      let linePaid;
      if (partial) {
        linePaid = Math.min(paidLeft, Number(item.total_amount) || 0);
        paidLeft = Math.round((paidLeft - linePaid) * 100) / 100;
      }
      const payload = {
        id:                generateRef('PUR'),
        linked_product_id: item.linked_product_id,
        supplier_id:       header.supplier_id,
        supplier_name:     supplierName,
        quantity:          item.quantity,
        unit_cost:         item.unit_price,
        total_amount:      item.total_amount,
        // Part-paid means credit terms with money down. Marking it CASH would
        // keep it out of payables and out of reach of the supplier's Pay flow.
        payment_type:      partial ? 'CREDIT' : header.payment_type,
        paid_amount:       partial ? linePaid : undefined,
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
    CANCELLED: { bg: 'bg-muted',   text: 'text-muted-foreground',    border: 'border-border',    label: 'Cancelled' },
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
    const bill = row;
    const supplier = suppliers.find(s => s.id === bill.supplier_id);
    const credit = _credit(bill.payment_type);
    const due = bill.due;
    const paid = bill.paid;
    const multi = bill.lines.length > 1;
    const expanded = expandedBill === bill.id;
    const overdue = due > 0.5 && ageDays(bill) > 30;
    const names = bill.lines.map(l => productNameById[l.linked_product_id]).filter(Boolean);
    const qtyTotal = bill.lines.reduce((s, l) => s + Number(l.quantity || 0), 0);

    return (
      <React.Fragment key={bill.id}>
      <tr
        className={`transition-colors ${multi ? 'cursor-pointer' : ''} ${expanded ? 'bg-canvas' : 'hover:bg-canvas'}`}
        onClick={() => multi && setExpandedBill(expanded ? null : bill.id)}
        style={overdue ? { boxShadow: 'inset 2px 0 0 0 var(--color-neg)' } : undefined}>
        {/* Ref · bill no · date */}
        <td className="px-4 py-3 align-top">
          <div className="flex items-center gap-1.5">
            {multi && <ChevronRight size={12} className={`text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />}
            <span className="tabular-nums text-[12px] text-foreground">{bill.id.split('-').pop()}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {bill.bill_no ? `bill ${bill.bill_no}` : 'no bill'} · {shortDate(bill.date)}
          </div>
        </td>
        {/* Avatar + what was bought + supplier */}
        <td className="px-4 py-3 max-w-[280px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-canvas border border-border/60 flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
              {initialsOf(supplier?.name || bill.supplier_name)}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-foreground truncate flex items-center gap-1.5" title={names.join(', ')}>
                <span className="truncate">{names[0] || 'Unknown Product'}</span>
                {multi && (
                  <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-black/[0.06] text-ink-secondary">
                    +{bill.lines.length - 1}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5"
                   title={supplier?.name || bill.supplier_name || ''}>
                {supplier?.name || bill.supplier_name || '—'}
              </div>
            </div>
          </div>
        </td>
        {/* Qty across the bill */}
        <td className="px-4 py-3 text-center whitespace-nowrap">
          <span className="tabular-nums text-[13px] text-foreground">{qtyTotal}</span>
          {multi && <span className="text-[9px] text-muted-foreground ml-0.5">in {bill.lines.length}</span>}
        </td>
        {/* Payment — how much has been paid, and what is left */}
        <td className="px-4 py-3">
          {(() => {
            const dot = due <= 0.5 ? 'var(--color-pos)'
              : overdue ? 'var(--color-neg)' : '#B45309';
            const label = due <= 0.5 ? (credit ? 'Paid' : (bill.payment_type || 'Cash'))
              : (paid > 0.5 ? 'Part paid' : (credit ? 'Credit' : 'Unpaid'));
            return (
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: dot }} />
                <div className="min-w-0">
                  <div className="text-[12px] text-muted-foreground">
                    {label}
                    {due > 0.5 && overdue && (
                      <span className="text-[color:var(--color-neg)] text-[10px]"> · {ageDays(bill)}d</span>
                    )}
                  </div>
                  {/* The question this screen could not answer: how much of a
                      part-paid bill has actually been handed over. */}
                  {paid > 0.5 && due > 0.5 && (
                    <div className="tabular-nums text-[11px] text-[color:var(--color-pos)] mt-0.5">
                      paid {formatCurrency(paid)}
                    </div>
                  )}
                  {due > 0.5 && (
                    <div className="tabular-nums text-[11px] text-[color:var(--color-neg)] mt-0.5">due {formatCurrency(due)}</div>
                  )}
                </div>
              </div>
            );
          })()}
        </td>
        {/* Total */}
        <td className="px-4 py-3 text-right tabular-nums text-[14px] font-semibold text-foreground">{formatCurrency(bill.total)}</td>
        {/* Status select — drives every line of the bill together */}
        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          {(() => {
            const st = (bill.status || 'RECEIVED').toUpperCase();
            const s = _STATUS_STYLES[st] || _STATUS_STYLES.RECEIVED;
            return (
              <select
                value={st}
                onChange={(e) => bill.lines.forEach(l => updatePurchaseStatus(l.id, e.target.value))}
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
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5 justify-end">
            {/* Paying is per line, because the money lands on separate purchase
                rows. A single-line bill is the common case and behaves as
                before; a multi-line one opens to pay each line. */}
            {due > 0.5 && !multi && (
              <button
                onClick={() => { setPayTarget(bill.lines[0]); setPayAmount(String(due)); setPayMethod('CASH'); }}
                title={`Due ${formatCurrency(due)}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-accent-signature-hover border border-accent-signature/40 hover:bg-accent-signature/10 transition-colors"
              >
                <Banknote size={12} /> Pay
              </button>
            )}
            {due > 0.5 && multi && (
              <button
                onClick={() => setExpandedBill(expanded ? null : bill.id)}
                title="Open the bill to pay a line"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-accent-signature-hover border border-accent-signature/40 hover:bg-accent-signature/10 transition-colors"
              >
                <Banknote size={12} /> Pay lines
              </button>
            )}
            {/* Edit, Return and Delete act on a single purchase row, but a bill
                can hold several. Firing them at lines[0] silently targeted the
                first product and left the rest unreachable -- a Return would
                open on the wrong item and move real stock. So the menu only
                sits on the header when the bill IS one line; otherwise it opens
                the bill, where each line carries its own menu. */}
            <button
              onClick={(e) => multi ? setExpandedBill(expanded ? null : bill.id) : openMenu(e, bill.lines[0])}
              title={multi ? 'Open the bill to edit or return a product' : 'More'}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground transition-colors"
            >
              <MoreVertical size={16} />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-canvas/60">
          <td colSpan={7} className="px-4 py-3 border-l-2 border-accent-signature">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Products on this bill
            </div>
            <table className="w-full">
              <tbody className="divide-y divide-border/60">
                {bill.lines.map(l => {
                  const prod = products.find(x => x.id === l.linked_product_id);
                  const lineAmt = Number(l.total_amount || 0);
                  const lineQty = Number(l.quantity || 0);
                  const lineDue = Math.max(0, lineAmt - paidOf(l));
                  return (
                    <tr key={l.id}>
                      <td className="py-2 text-[12px] font-medium text-foreground">{prod?.name || l.notes || '—'}</td>
                      <td className="py-2 text-right text-[12px] tabular-nums text-muted-foreground whitespace-nowrap">
                        {lineQty} {prod?.unit || 'pcs'} × {formatCurrency(lineQty > 0 ? lineAmt / lineQty : 0)}
                      </td>
                      <td className="py-2 text-right text-[12px] font-semibold tabular-nums text-foreground whitespace-nowrap">
                        {formatCurrency(lineAmt)}
                      </td>
                      <td className="py-2 pl-4 text-right whitespace-nowrap">
                        {lineDue > 0.5 ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-[10px] font-semibold tabular-nums text-[color:var(--color-neg)]">
                              due {formatCurrency(lineDue)}
                            </span>
                            <button
                              onClick={() => { setPayTarget(l); setPayAmount(String(lineDue)); setPayMethod('CASH'); }}
                              className="px-2 py-0.5 rounded-md text-[10px] font-medium text-accent-signature-hover border border-accent-signature/40 hover:bg-accent-signature/10 transition-colors"
                            >Pay</button>
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-[color:var(--color-pos)]">Settled</span>
                        )}
                      </td>
                      <td className="py-2 pl-4 text-right text-[9px] tabular-nums text-muted-foreground whitespace-nowrap">
                        {l.id.split('-').pop()}
                      </td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => openMenu(e, l)}
                          title={`Edit, return or delete ${prod?.name || 'this product'}`}
                          className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground transition-colors"
                        >
                          <MoreVertical size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
      )}
      </React.Fragment>
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
            {
              label: 'ITC this month',
              value: formatCurrency(summary.itc),
              cls: 'text-[color:var(--color-pos)]',
              // Say why the figure is lower than the month's spend suggests,
              // rather than leaving it looking like data went missing.
              note: summary.itcUnverified > 0
                ? `+${formatCurrency(summary.itcUnverified)} pending — ${summary.missingGstinSuppliers} supplier${summary.missingGstinSuppliers === 1 ? '' : 's'} have no GSTIN on file`
                : null,
            },
          ].map((m, i) => (
            <div key={i} className="bg-card px-4 py-3">
              <div className="text-[11px] font-medium text-muted-foreground">{m.label}</div>
              <div className={`text-[19px] font-semibold tabular-nums tracking-tight mt-0.5 ${m.cls || 'text-foreground'}`}>{m.value}</div>
              {m.note && (
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{m.note}</div>
              )}
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
          {/* Counted in bills, which is what the rows now are. */}
          <span className="text-[11px] font-semibold text-muted-foreground ml-auto">{filteredBills.length} of {allBills.length} bills</span>
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
            <button onClick={() => { const p = menuRow; setMenuRow(null); setPrintTarget(billOfLine(p)); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-foreground"><Printer size={13} /> Voucher</button>
            <button onClick={() => { const p = menuRow; setMenuRow(null); setDupTarget(p); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-foreground"><Copy size={13} /> Duplicate</button>
            <button onClick={() => { const p = menuRow; setMenuRow(null); setEditTarget(p); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-blue-600"><Pencil size={13} /> Edit</button>
            <button onClick={() => { const p = menuRow; setMenuRow(null); setReturnTarget({ purchase: p, product: products.find(x => x.id === p.linked_product_id), supplier: suppliers.find(s => s.id === p.supplier_id) }); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-rose-600"><RotateCcw size={13} /> Return</button>
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
      <Modal isOpen={!!printTarget} onClose={() => setPrintTarget(null)} title="Purchase Voucher"
        subtitle={printTarget ? buildVoucherModel({ bill: printTarget, supplier: (suppliers || []).find(x => x.id === printTarget.supplier_id), productById }).voucherNo : ''}>
        {printTarget && (() => {
          const supplier = {
            ...(suppliers || []).find(x => x.id === printTarget.supplier_id),
            name: (suppliers || []).find(x => x.id === printTarget.supplier_id)?.name || printTarget.supplier_name,
            __homeStateCode: String(businessProfile?.gst_no || '').slice(0, 2),
          };
          const m = buildVoucherModel({ bill: printTarget, supplier, productById });
          return (
            <div className="text-[13px]">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="font-semibold text-foreground">{m.supplierName}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {m.gstin ? `GSTIN ${m.gstin}` : 'No GSTIN on file'} · {formatDate(m.date)} · {m.paymentType}
                  </div>
                </div>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-pill ${m.settled ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {m.settled ? 'Paid' : 'Part paid'}
                </span>
              </div>

              <table className="w-full mt-3 border-t border-border">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left py-1.5 font-medium">Item</th>
                    <th className="text-left font-medium">HSN</th>
                    <th className="text-center font-medium">Qty</th>
                    <th className="text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {m.items.map(it => (
                    <tr key={it.id}>
                      <td className="py-1.5">{it.name}</td>
                      <td className={it.hsn ? 'text-muted-foreground text-[11px]' : 'text-muted-foreground/60 text-[11px]'}>{it.hsn || '—'}</td>
                      <td className="text-center tabular-nums">{it.qty} {it.unit}</td>
                      <td className="text-right tabular-nums">{formatCurrency(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-3 pt-2 border-t border-border space-y-1">
                {m.registered && (
                  <>
                    <div className="flex justify-between text-muted-foreground"><span>Taxable</span><span className="tabular-nums">{formatCurrency(m.taxable)}</span></div>
                    {m.interstate
                      ? <div className="flex justify-between text-muted-foreground"><span>IGST</span><span className="tabular-nums">{formatCurrency(m.igst)}</span></div>
                      : <div className="flex justify-between text-muted-foreground"><span>CGST + SGST</span><span className="tabular-nums">{formatCurrency(m.cgst + m.sgst)}</span></div>}
                  </>
                )}
                <div className="flex justify-between font-semibold text-foreground"><span>Total</span><span className="tabular-nums">{formatCurrency(m.total)}</span></div>
                {m.paid > 0 && <div className="flex justify-between text-emerald-600"><span>Paid</span><span className="tabular-nums">{formatCurrency(m.paid)}</span></div>}
                {m.due > 0.005 && <div className="flex justify-between text-[color:var(--color-neg)]"><span>Balance due</span><span className="tabular-nums">{formatCurrency(m.due)}</span></div>}
              </div>

              <p className="text-[11px] text-muted-foreground mt-2">{m.words}</p>

              {/* Both are worth knowing BEFORE the paper is handed over, not after. */}
              {!m.registered && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2 leading-relaxed">
                  No GSTIN on file for this supplier, so the voucher shows no tax split and no ITC can be claimed against it.
                </p>
              )}
              {m.missingHsn > 0 && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2 leading-relaxed">
                  {m.missingHsn} of {m.items.length} {m.missingHsn === 1 ? 'product has' : 'products have'} no HSN code — it will print blank and is required for GSTR-1.
                </p>
              )}

              <button onClick={() => printVoucher(printTarget)}
                className="mt-3 w-full h-11 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold flex items-center justify-center gap-2">
                <Printer size={15} /> Print voucher
              </button>
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
