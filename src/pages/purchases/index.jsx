import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePurchases } from '../../hooks/usePurchases';
import { useAccounts, accountForMethod } from '../../hooks/useAccounts';
import { useInventory } from '../../hooks/useInventory';
import Dialog from '../../components/ui/Dialog';
import { Tabs } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/button';
import { PageSkeleton } from '../../components/ui/States';
import { formatCurrency, generateRef, todayISOInAppTZ } from '../../lib/utils';
import { groupPurchasesIntoBills, dueOf as billDueOf, isCreditType } from '../../lib/bills';
import { buildVoucherModel, voucherNo } from './lib/voucher';
import { decorateBills, lineDeltas, allocatePayment, fmtDate } from './lib/register';
import { monthSummary } from './lib/monthSummary';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { voucherHtml } from './lib/voucherHtml';
import PurchaseForm from './components/PurchaseForm';
import BillEditForm from './components/BillEditForm';
import BillPaymentsModal from './components/BillPaymentsModal';
import MultiPurchaseForm from './components/MultiPurchaseForm';
import PurchaseReturnForm from './components/PurchaseReturnForm';
import PriceHistory from './components/PriceHistory';
import BillRegister from './components/BillRegister';
import BillDetailPanel from './components/BillDetailPanel';
import PayBillsDialog from './components/PayBillsDialog';

const PurchasesPage = () => {
  const { currentTenantId, businessProfile } = useTenant();
  // Kept for editPurchaseBill, which resolves the account for a part payment.
  const { accounts: payAccounts = [] } = useAccounts(currentTenantId);
  const { currentUser } = useAuth();
  const { addNotification } = useNotifications();
  const { purchases, purchaseReturns, suppliers, add: addPurchase, editPurchaseBill, supplierPayments, editSupplierPayment, deleteSupplierPayment, updateStatus: updatePurchaseStatus, remove: removePurchase, addReturn, payPurchase, loading: purLoading } = usePurchases(currentTenantId);
  const { products, inventoryLocations, loading: prodLoading, addProduct, setSellingPrice } = useInventory(currentTenantId);
  const warehouses = (inventoryLocations || []).filter(l => l.type === 'WAREHOUSE');

  const [activeTab, setActiveTab] = useState('purchases'); // 'purchases' | 'returns'
  const [showAddModal, setShowAddModal] = useState(false);
  // Inventory side panel "Reorder" lands here as ?reorder=<productId>: open the
  // new-purchase form with that product on its first line, then drop the param.
  const [searchParams, setSearchParams] = useSearchParams();
  const [reorderId, setReorderId] = useState(null);
  // The Dashboard's "Add purchase" lands here as ?new=1: open the form empty.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setShowAddModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  useEffect(() => {
    const id = searchParams.get('reorder');
    if (!id) return;
    setReorderId(id);
    setShowAddModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete('reorder');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const wasOpen = React.useRef(false);
  useEffect(() => {
    if (wasOpen.current && !showAddModal) setReorderId(null);
    wasOpen.current = showAddModal;
  }, [showAddModal]);
  const [editBillTarget, setEditBillTarget] = useState(null); // whole bill being edited
  const [billSaving, setBillSaving] = useState(false);
  const [paymentsTarget, setPaymentsTarget] = useState(null); // bill whose payments are open
  const [returnTarget, setReturnTarget] = useState(null); // purchase being returned
  const [returnLoading, setReturnLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  // ── Pay / Duplicate / Print targets ─────────────────────────────────────────
  const [payTarget, setPayTarget] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payDate, setPayDate]     = useState(() => todayISOInAppTZ());
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [dupTarget, setDupTarget]   = useState(null); // purchase to duplicate (prefill single form)
  const [detailId, setDetailId] = useState(null); // bill open in the side panel
  const [historyProduct, setHistoryProduct] = useState(null); // product whose price history is open
  // Credit terms, paid and due all come from src/lib/bills.js so this screen and
  // the supplier ledger cannot disagree about what is owed.
  const _credit = isCreditType;
  const dueOf = billDueOf;

  // Header summary — this-month spend and claimable ITC (lib/monthSummary).
  // "This month" is the shop's month (todayISOInAppTZ), not the UTC one.
  const summary = useMemo(() => monthSummary({
    purchases, suppliers, products, dueOf, today: todayISOInAppTZ(),
  }), [purchases, suppliers, products, dueOf]);


  const productNameById = useMemo(() => {
    const m = {};
    (products || []).forEach(x => { m[x.id] = x.name || ''; });
    return m;
  }, [products]);

  // The voucher needs the whole product, not just its name — hsn_code, unit and
  // taxRate all appear on the printed document.
  const productById = useMemo(() => {
    const m = {};
    (products || []).forEach(x => { m[x.id] = x; });
    return m;
  }, [products]);

  // Every bill, from the one definition of a bill (src/lib/bills.js), then
  // given what the register needs: due date, state, price movement per line,
  // and how it was paid. The register filters and totals whole bills, so a
  // part-matching bill never loses lines before it is added up.
  const today = todayISOInAppTZ();
  const allBills = useMemo(() => groupPurchasesIntoBills(purchases || []), [purchases]);
  const deltas = useMemo(() => lineDeltas(purchases || []), [purchases]);
  const registerBills = useMemo(() => decorateBills(allBills, {
    suppliers: suppliers || [],
    payments: supplierPayments || [],
    deltas,
    productById,
    homeStateCode: String(businessProfile?.gst_no || '').slice(0, 2),
    today,
  }), [allBills, suppliers, supplierPayments, deltas, productById, businessProfile, today]);

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

  // Pay one bill, or several of one supplier's bills from the register's bulk
  // bar. The money is spread oldest bill first, and within a bill oldest line
  // first, never past what a line owes; each slice is recorded against its own
  // purchase row by settle_purchase_payment, so balances move on the server.
  const openPay = (bills) => {
    const list = [...bills].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!list.length) return;
    const total = list.reduce((s2, b) => s2 + b.total, 0);
    const paid = list.reduce((s2, b) => s2 + b.paid, 0);
    setPayTarget({
      id: list[0].id,
      bills: list,
      lines: list.flatMap(b => b.lines),
      supplier_id: list[0].supplier_id,
      supplier_name: list[0].supplier_name,
      total_amount: total,
      paid_amount: paid,
    });
    setPayAmount((Math.round((total - paid) * 100) / 100).toFixed(2));
    setPayMethod('CASH');
    setPayDate(todayISOInAppTZ());
  };

  const submitPay = async () => {
    if (!payTarget) return;
    const amt = Number(payAmount);
    if (!(amt > 0)) { addNotification('Enter a valid amount', 'error'); return; }
    const due = dueOf(payTarget);
    if (amt > due + 0.005) { addNotification(`That is more than the ${formatCurrency(due)} due`, 'error'); return; }
    // Confirm before paying a supplier — blocks the thread so a double-tap can't
    // fire two payments.
    if (!window.confirm(`Pay ${formatCurrency(amt)} to ${payTarget.supplier_name || 'supplier'} (${payMethod})?`)) return;
    setPaySubmitting(true);
    const slices = allocatePayment(payTarget.lines || [payTarget], amt);
    const planned = Math.round(slices.reduce((s2, x) => s2 + x.amount, 0) * 100) / 100;
    if (Math.abs(planned - amt) > 0.005) {
      setPaySubmitting(false);
      addNotification(`Only ${formatCurrency(planned)} of ${formatCurrency(amt)} can be placed against these bills. Nothing was recorded.`, 'error');
      return;
    }
    let done = 0;
    let failure = null;
    for (const sl of slices) {
      const { error } = await payPurchase({ supplierId: payTarget.supplier_id, purchaseId: sl.purchaseId, amount: sl.amount, method: payMethod, date: payDate });
      if (error) { failure = error; break; }
      done += sl.amount;
    }
    setPaySubmitting(false);
    // The Cash/Bank posting is NOT done here any more.
    // trg_supplier_payments_post_ledger writes it from the payment row itself,
    // which covers every path that records one -- this button, the supplier
    // ledger, the bulk FIFO settle, offline replay and mobile. Posting here as
    // well would book the same money out twice. (Only 11 of 34 payments ever
    // reached an account, precisely because this was the one path that did it.)
    if (failure) {
      // Never swallowed: say what went through and what did not. A dropped
      // connection may still have recorded the last slice, so it is not
      // reported as unsaved.
      console.error('[purchases] payment failed after', done, failure);
      const outcome = classifyWriteFailure(failure, { noun: 'payment' });
      const head = done > 0 ? `${formatCurrency(done)} of ${formatCurrency(amt)} was recorded. ` : '';
      addNotification(`${head}${outcome.title}: ${outcome.detail}`, 'error');
      // The dialog's lines and due are now stale; close it so a retry starts
      // from the bills as they stand.
      setPayTarget(null); setPayAmount('');
      return;
    }
    addNotification(`Payment of ${formatCurrency(amt)} recorded`, 'success');
    setPayTarget(null); setPayAmount('');
  };

  // The WAC helper that used to live here is gone, and must not come back.
  //
  // It blended the new line's rate into the product's previous cost, weighted
  // by the stock figure in the React copy of that product -- a row already one
  // purchase out of date -- and wrote the result immediately after
  // addPurchase. process_purchase had just set that same column from the
  // actual open batches, so the client's answer landed on top of the
  // database's and won.
  //
  // Two writers, two definitions of "cost", last one wins. That is how the
  // item screen came to show Rs 5.50 for stock that cost Rs 7.82, and a
  // 35.3 % margin on units being sold at a Rs 0.50 loss.
  //
  // recompute_product_cost is now the only writer, and consume_fifo calls it
  // too, so the figure tracks the shelf rather than only tracking purchases.

  // ── Quick-create product from barcode ──────────────────────────────────────
  const handleCreateProduct = async (productData) => {
    const { data, error } = await addProduct(productData);
    if (error) { alert('Failed to create product: ' + error.message); return null; }
    return data;
  };

  // ── Multi-item purchase save ─────────────────────────────────────────────────
  const handleSaveMultiPurchase = async ({ header, items, priceUpdates = [] }) => {
    setAddLoading(true);
    const supplierName = suppliers.find(s => s.id === header.supplier_id)?.name || '';
    let failed = 0;
    let firstError = '';
    const expiryMissed = [];

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
      const { error, queued } = await addPurchase(payload);
      if (queued && item.expiry_date) expiryMissed.push(`${productNameById[item.linked_product_id] || item.linked_product_id} (${fmtDate(item.expiry_date)})`);
      if (error) {
        // Surface the real reason — swallowing it turned a hard DB error
        // ("function is not unique") into a bare "N item(s) failed to save".
        console.error('[purchase] save failed for', item.linked_product_id, error);
        if (!firstError) firstError = error.message || String(error);
        failed++;
        continue;
      }
      // Expiry: process_purchase has already created this line's batch. Stamp
      // the expiry on THAT batch. This used to insert a second batch for the
      // same stock -- 13 purchases at one shop held 134 units in batches for
      // 67 bought, which skews FIFO cost and the average cost.
      if (item.expiry_date && !queued) {
        const { supabase } = await import('../../lib/supabase');
        const { error: expErr, count } = await supabase.from('product_batches')
          .update({ expiry_date: item.expiry_date }, { count: 'exact' })
          .eq('purchase_id', payload.id).eq('tenant_id', currentTenantId);
        if (expErr || !count) {
          console.error('[purchase] expiry not recorded for', payload.id, expErr);
          expiryMissed.push(`${productNameById[item.linked_product_id] || item.linked_product_id} (${fmtDate(item.expiry_date)})`);
        }
      }
    }
    // The money-OUT for a non-credit purchase is posted by the database, in
    // trg_purchases_post_ledger. It used to be posted from here, and that had
    // three holes: the try/catch swallowed a failed post, editing a bill later
    // never moved the cash with it, and only this one screen did it at all.
    // Posting from here as well would now double the money out — the same
    // mistake the supplier-payment trigger already caused once.
    // New selling prices chosen on the price-change step. Only once the whole
    // bill is in: a half-saved bill must not leave prices raised for stock
    // that never arrived.
    let priceFailed = [];
    if (failed === 0) {
      for (const u of priceUpdates) {
        const { error } = await setSellingPrice(u.productId, u.sellingPrice);
        if (error) {
          console.error('[purchase] selling price update failed for', u.productId, error);
          priceFailed.push(`${u.name}: ${error.message || String(error)}`);
        }
      }
    }
    setAddLoading(false);
    if (expiryMissed.length) {
      // Never silent: the purchase is saved, its expiry date is not.
      const many = expiryMissed.length > 1;
      addNotification(`Purchase saved, but the expiry date was not recorded for ${expiryMissed.join(', ')}. ${many ? 'These batches' : 'This batch'} will show no expiry; keep a note of the ${many ? 'dates' : 'date'}.`, 'error', 0); // stays until closed
    }
    if (failed > 0) {
      alert(`${failed} item(s) failed to save.${firstError ? `\n\nReason: ${firstError}` : ''}`
        + (priceUpdates.length ? '\n\nSelling prices were not changed.' : ''));
    } else if (priceFailed.length) {
      alert(`The purchase is saved, but these selling prices were not updated:\n\n${priceFailed.join('\n')}`);
      setShowAddModal(false);
    } else {
      if (priceUpdates.length) {
        addNotification?.(`Selling price updated for ${priceUpdates.length} item${priceUpdates.length > 1 ? 's' : ''}`, 'success');
      }
      // Let the Save button's "Saved" tick be seen before the dialog closes.
      setTimeout(() => setShowAddModal(false), 700);
    }
    return { ok: failed === 0 };
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
    addNotification('Purchase duplicated', 'success');
    setDupTarget(null);
  };

  // Bound each network step so a stalled request can't leave the form stuck
  // on "Saving…" forever (the 4-hop client chain was hanging on weak links).
  const withTimeout = (p, ms, label) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out — check connection and retry`)), ms)),
  ]);

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

  // ── Keyboard: N opens a new purchase from the Returns tab too ────────────────
  // (The register binds N itself while it is on screen.)
  useEffect(() => {
    if (activeTab !== 'returns' || showAddModal) return undefined;
    const k = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setShowAddModal(true); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [activeTab, showAddModal]);

  // The bill in the side panel, looked up afresh each render so a payment or
  // an edit made from the panel shows at once. Gone (deleted): the panel shuts.
  const detailBill = useMemo(() => (detailId ? registerBills.find(b => b.id === detailId) || null : null), [detailId, registerBills]);
  const detailModel = useMemo(() => {
    if (!detailBill) return null;
    const sup = (suppliers || []).find(x => x.id === detailBill.supplier_id);
    return buildVoucherModel({
      bill: detailBill,
      supplier: { ...sup, name: sup?.name || detailBill.supplier_name, __homeStateCode: String(businessProfile?.gst_no || '').slice(0, 2) },
      productById,
    });
  }, [detailBill, suppliers, businessProfile, productById]);
  const detailPayments = useMemo(() => {
    if (!detailBill) return 0;
    const ids = new Set(detailBill.lines.map(l => l.id));
    return (supplierPayments || []).filter(p => !p.deleted_at && p.purchase_id && ids.has(p.purchase_id)).length;
  }, [detailBill, supplierPayments]);

  const lineHandlers = {
    onHistory: (l) => setHistoryProduct(products.find(x => x.id === l.linked_product_id) || { id: l.linked_product_id, name: productNameById[l.linked_product_id] }),
    onDuplicate: (l) => setDupTarget(l),
    onReturn: (l) => setReturnTarget({ purchase: l, product: products.find(x => x.id === l.linked_product_id), supplier: suppliers.find(s => s.id === l.supplier_id) }),
    onDelete: (l) => handleDeletePurchase(l),
  };

  if (purLoading || prodLoading) return <PageSkeleton cards={3} rows={8} />;

  // ── New purchase: a page of its own (mockup purchases-12) ────────────────────
  if (showAddModal) {
    return (
      <div className="mx-auto flex w-full max-w-[1180px] flex-col pb-16">
        <MultiPurchaseForm
          products={products}
          suppliers={suppliers}
          warehouses={warehouses}
          purchases={purchases}
          onSave={handleSaveMultiPurchase}
          loading={addLoading}
          onCreateProduct={handleCreateProduct}
          initialProductId={reorderId}
          onBack={() => { setShowAddModal(false); setReorderId(null); }}
        />
      </div>
    );
  }

  const th = 'px-3.5 py-2.5 text-left font-tight text-[12px] font-semibold text-mute border-b border-line whitespace-nowrap';
  const td = 'px-3.5 py-[11px] border-b border-sep align-middle';

  return (
    // Capped and centred, so a row's item and its amount stay close together
    // on a wide monitor.
    <div className="mx-auto flex w-full max-w-[1180px] flex-col pb-16">
      {/* Bills / Returns, with the page's main action on the same line. */}
      <div className="m-rise mb-[18px] flex items-end gap-3 border-b border-line" style={{ '--i': 0 }}>
        <Tabs className="flex-1 border-b-0" ariaLabel="Purchases" value={activeTab} onChange={setActiveTab}
          items={[
            { key: 'purchases', label: 'Bills', count: allBills.length },
            { key: 'returns', label: 'Returns', count: purchaseReturns.length },
          ]} />
        <Button className="mb-1.5" onClick={() => setShowAddModal(true)} aria-label="New purchase">
          New purchase
          <kbd className="hidden rounded-[5px] bg-white/20 px-1.5 py-px font-tight text-[11px] font-semibold text-white sm:inline">N</kbd>
        </Button>
      </div>

      {activeTab === 'purchases' && (
        <BillRegister
          bills={registerBills}
          today={today}
          month={summary}
          suppliers={suppliers}
          productById={productById}
          voucherNoOf={voucherNo}
          onNew={() => setShowAddModal(true)}
          onPay={(b) => openPay([b])}
          onBulkPay={(bs) => openPay(bs)}
          onOpenBill={(b) => setDetailId(b.id)}
          onPayments={(b) => setPaymentsTarget(b)}
          onEdit={(b) => setEditBillTarget(b)}
          onHistory={lineHandlers.onHistory}
          onDuplicate={lineHandlers.onDuplicate}
          onReturn={lineHandlers.onReturn}
          onDelete={lineHandlers.onDelete}
          onSetStatus={(b, st) => b.lines.forEach(l => updatePurchaseStatus(l.id, st))}
        />
      )}

      {/* Returns (mockup purchases-11): debit notes, newest first as loaded. */}
      {activeTab === 'returns' && (
        <>
          <p className="m-rise -mt-1.5 mb-3.5 text-[12px] text-mute" style={{ '--i': 1 }}>
            Debit notes. A return is started from a bill&apos;s line, with &ldquo;Return to supplier&rdquo;.
          </p>
          <div className="m-rise overflow-x-auto" style={{ '--i': 2 }}>
            <table className="w-full border-collapse text-[13px] text-ink">
              <thead>
                <tr>
                  <th className={th}>Date</th><th className={th}>Debit note</th><th className={th}>Product</th>
                  <th className={th}>Supplier</th><th className={`${th} text-right`}>Qty</th>
                  <th className={`${th} text-right`}>Total</th><th className={th}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {purchaseReturns.length === 0 && (
                  <tr><td colSpan={7} className="px-3.5 py-12 text-center text-body">No purchase returns yet</td></tr>
                )}
                {purchaseReturns.map((ret) => {
                  const product = products.find(p => p.id === ret.product_id);
                  const supplier = suppliers.find(s => s.id === ret.supplier_id);
                  return (
                    <tr key={ret.id} className="[&>td]:transition-colors [&>td]:duration-(--dur-press) hover:[&>td]:bg-tile">
                      <td className={`${td} whitespace-nowrap`}>{fmtDate(ret.date, { year: String(ret.date || '').slice(0, 4) !== today.slice(0, 4) })}</td>
                      <td className={`${td} whitespace-nowrap font-tight font-semibold`}>{ret.id}</td>
                      <td className={td}>{product?.name || ret.product_name || 'Unknown'}</td>
                      <td className={`${td} max-w-[220px] truncate`} title={supplier?.name || ret.supplier_name || ''}>{supplier?.name || ret.supplier_name || '—'}</td>
                      <td className={`${td} text-right font-tight tabular-nums`}>−{ret.quantity}</td>
                      <td className={`${td} text-right font-tight tabular-nums`}>{formatCurrency(ret.total_amount)}</td>
                      <td className={`${td} text-body`}>{ret.reason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {purchaseReturns.length > 0 && (
            <div className="m-rise px-1 pt-3.5 text-[13px] text-body" style={{ '--i': 3 }}>
              {purchaseReturns.length} return{purchaseReturns.length === 1 ? '' : 's'}
            </div>
          )}
        </>
      )}

      {/* One bill, opened (mockup purchases-03). */}
      <BillDetailPanel
        bill={detailBill}
        model={detailModel}
        paymentsCount={detailPayments}
        onClose={() => setDetailId(null)}
        onPay={(b) => openPay([b])}
        onPrint={(b) => printVoucher(b)}
        onPayments={(b) => setPaymentsTarget(b)}
        onEdit={(b) => setEditBillTarget(b)}
        {...lineHandlers}
      />

      {/* Edit whole bill */}
      <Dialog open={!!editBillTarget} onClose={() => { if (!billSaving) setEditBillTarget(null); }} width={600}
        title="Edit Bill"
        subtitle={editBillTarget ? `${editBillTarget.bill_no || voucherNo(editBillTarget)} · the details apply to every line; saved in one go` : ''}>
        {editBillTarget && (
          <BillEditForm
            bill={editBillTarget}
            suppliers={suppliers}
            products={products}
            productNameById={productNameById}
            payments={supplierPayments}
            purchases={purchases}
            saving={billSaving}
            onCancel={() => setEditBillTarget(null)}
            onSave={async (payload) => {
              setBillSaving(true);
              try {
                // Lines split on whether they already exist. edit_purchase_bill
                // refuses an id it does not know -- deliberately, because a
                // partial payload used to orphan lines on the old header -- so
                // added lines cannot go through it and are inserted the way any
                // purchase is, by process_purchase.
                const keptLines = payload.lines.filter(l => l.id);
                const newLines  = payload.lines.filter(l => !l.id);

                const { error } = await withTimeout(editPurchaseBill({
                  ...payload,
                  lines: keptLines,
                  userId: currentUser?.id,
                  accountId: accountForMethod(payAccounts, payload.paymentType),
                }), 20000, 'Save bill');
                if (error) throw error;

                // Added lines, after the edit. Before it, they would be part of
                // the bill the RPC then checks its payload against, and it would
                // refuse the save for lines it had just been given.
                const billId = payload.billId;
                const supplierName = suppliers.find(s2 => s2.id === payload.supplierId)?.name || '';
                for (const l of newLines) {
                  const newId = generateRef('PUR');
                  const { error: addErr } = await addPurchase({
                    id: newId,
                    linked_product_id: l.linked_product_id,
                    supplier_id: payload.supplierId,
                    supplier_name: supplierName,
                    quantity: l.quantity,
                    unit_cost: l.unit_cost,
                    total_amount: l.total_amount,
                    payment_type: payload.paymentType,
                    date: payload.date,
                    notes: l.notes,
                    bill_no: payload.billNo || null,
                    userId: currentUser?.id,
                  });
                  if (addErr) throw addErr;

                  // The one write not inside an RPC. process_purchase does the
                  // money -- stock, batch, ledger -- but knows nothing about
                  // bills, and the row's own trigger only joins a bill created
                  // in the last ten minutes, so an older bill would get a line
                  // of its own instead. bill_id is a grouping column, not a
                  // figure; if this fails the line still exists and is visible,
                  // just under its own heading, which is recoverable in a way
                  // that losing it would not be.
                  const { supabase } = await import('../../lib/supabase');
                  const { error: joinErr } = await supabase.from('purchases')
                    .update({ bill_id: billId })
                    .eq('id', newId).eq('tenant_id', currentTenantId);
                  if (joinErr) {
                    addNotification(
                      `The line saved but did not join this bill (${joinErr.message}). It is on the Purchases list as its own bill.`,
                      'error');
                  }
                }

                // A part payment is recorded AFTER the bill saves, and as a real
                // payment via settle_purchase_payment -- never by writing
                // paid_amount, which would leave the bill and the supplier's
                // balance disagreeing. Allocated oldest line first, the same way
                // the entry form and mobile do it.
                let payNote = '';
                if (payload.paidNow > 0) {
                  let left = payload.paidNow;
                  for (const l of payload.lines) {
                    if (left <= 0.005) break;
                    const line = editBillTarget.lines.find(x => x.id === l.id);
                    const lineDue = Math.max(0, Number(l.total_amount || 0) - Number(line?.paid_amount || 0));
                    if (lineDue <= 0.005) continue;
                    const take = Math.round(Math.min(left, lineDue) * 100) / 100;
                    const { error: payErr } = await payPurchase({
                      supplierId: payload.supplierId, purchaseId: l.id, amount: take,
                      method: 'CASH', date: payload.date,
                    });
                    // The bill itself is already saved. Say which part failed
                    // rather than implying the whole edit was lost.
                    if (payErr) throw new Error(
                      `The bill saved, but the payment could not be recorded: ${payErr.message}`);
                    left = Math.round((left - take) * 100) / 100;
                  }
                  payNote = ` · ${formatCurrency(payload.paidNow)} paid`;
                }

                addNotification(`Bill updated — ${payload.lines.length} lines${payNote}`, 'success');
                setEditBillTarget(null);
              } catch (e) {
                // The RPC is one transaction, so a failure moved nothing. Say so:
                // the old message left people wondering what had half-applied.
                addNotification('Could not save the bill: ' + (e?.message || e) + ' — nothing was changed.', 'error');
              } finally { setBillSaving(false); }
            }}
          />
        )}
      </Dialog>

      {/* Part payments against this bill.
          Correcting one was only possible from the Supplier Ledger, which is
          not where someone looking at a bill marked "still due" is standing. */}
      <Dialog open={!!paymentsTarget} onClose={() => setPaymentsTarget(null)} title="Payments"
        subtitle={paymentsTarget ? `Part payments recorded against ${paymentsTarget.bill_no || voucherNo(paymentsTarget)}` : ''}>
        {paymentsTarget && (
          <BillPaymentsModal
            bill={paymentsTarget}
            payments={supplierPayments}
            onClose={() => setPaymentsTarget(null)}
            onEdit={(id, amount) => editSupplierPayment(id, { amount })}
            onDelete={(id) => deleteSupplierPayment(id)}
          />
        )}
      </Dialog>

      {/* What this item has cost, purchase by purchase. */}
      <Dialog open={!!historyProduct} onClose={() => setHistoryProduct(null)} width={680}
        title="Price history" subtitle={historyProduct?.name || ''}>
        {historyProduct && <PriceHistory product={historyProduct} purchases={purchases} />}
      </Dialog>

      {/* Duplicate Purchase — prefilled single form, saves as new */}
      <Dialog open={!!dupTarget} onClose={() => setDupTarget(null)} width={600} title="Duplicate Purchase"
        subtitle={dupTarget ? `Creates a new purchase from ${dupTarget.bill_no || voucherNo({ ...dupTarget, lines: [dupTarget] })}` : ''}>
        {dupTarget && (
          <PurchaseForm
            products={products}
            suppliers={suppliers}
            purchases={purchases}
            onSave={handleDuplicateSave}
            loading={addLoading}
            onCancel={() => setDupTarget(null)}
            initialData={{ ...dupTarget, date: new Date().toISOString().slice(0, 10) }}
          />
        )}
      </Dialog>

      {/* Pay one bill, or several of one supplier's bills. */}
      <PayBillsDialog
        target={payTarget}
        due={payTarget ? dueOf(payTarget) : 0}
        overdue={(payTarget?.bills || []).reduce((s2, b) => s2 + (b.overdue || 0), 0)}
        voucherNoOf={voucherNo}
        amount={payAmount} setAmount={setPayAmount}
        method={payMethod} setMethod={setPayMethod}
        date={payDate} setDate={setPayDate}
        submitting={paySubmitting}
        onSubmit={submitPay}
        onClose={() => { if (!paySubmitting) setPayTarget(null); }}
      />

      {/* Return to Supplier */}
      <Dialog open={!!returnTarget} onClose={() => { if (!returnLoading) setReturnTarget(null); }}
        title="Return to Supplier" subtitle="Debit note. Stock will be taken out.">
        {returnTarget && (
          <PurchaseReturnForm
            purchase={returnTarget.purchase}
            product={returnTarget.product}
            supplier={returnTarget.supplier}
            warehouses={warehouses}
            onSave={handleSaveReturn}
            loading={returnLoading}
            onCancel={() => setReturnTarget(null)}
          />
        )}
      </Dialog>
    </div>
  );
};

export default PurchasesPage;
