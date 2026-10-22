import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePurchases } from '../../hooks/usePurchases';
import { useAccounts, accountForMethod } from '../../hooks/useAccounts';
import { useInventory } from '../../hooks/useInventory';
import { Plus, Banknote, Printer } from 'lucide-react';
import Modal from '../../shared/Modal';
import Table from '../../shared/Table';
import { PageSkeleton } from '../../components/ui/States';
import { formatCurrency, formatDate, generateRef, todayISOInAppTZ } from '../../lib/utils';
import { groupPurchasesIntoBills, dueOf as billDueOf, isCreditType } from '../../lib/bills';
import { buildVoucherModel, voucherNo } from './lib/voucher';
import { decorateBills, lineDeltas, allocatePayment } from './lib/register';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { voucherHtml } from './lib/voucherHtml';
import PurchaseForm from './components/PurchaseForm';
import BillEditForm from './components/BillEditForm';
import BillPaymentsModal from './components/BillPaymentsModal';
import MultiPurchaseForm from './components/MultiPurchaseForm';
import PurchaseReturnForm from './components/PurchaseReturnForm';
import PriceHistory from './components/PriceHistory';
import BillRegister from './components/BillRegister';

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
  const [printTarget, setPrintTarget] = useState(null);
  const [historyProduct, setHistoryProduct] = useState(null); // product whose price history is open
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
      setShowAddModal(false);
    }
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

  if (purLoading || prodLoading) return <PageSkeleton cards={3} rows={8} />;

  return (
    // Capped and centred. A row of this table is four columns the eye has to
    // pair up -- item with its amount -- and on a 2000px monitor there was
    // 1,300px of nothing between them. The cap is on the whole page rather
    // than the table alone, so the header does not span a width the rows
    // deliberately refuse.
    <div className="flex flex-col gap-6 max-w-[1180px] mx-auto w-full">
      {/* One quiet title row. The register below carries its own tabs, so
          Purchases / Returns is a small segmented switch beside the title
          rather than a second tab strip with a divider of its own. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-base font-semibold text-foreground tracking-tight">Purchases</h1>
          <div className="inline-flex h-8 p-0.5 rounded-md bg-canvas border border-border/60" role="group" aria-label="Show">
            {[['purchases', 'Bills', purchases.length], ['returns', 'Returns', purchaseReturns.length]].map(([k, label, n]) => (
              <button key={k} type="button" onClick={() => setActiveTab(k)} aria-pressed={activeTab === k}
                className={`px-2.5 rounded text-[12px] inline-flex items-center gap-1.5 transition-[background-color,color] duration-(--dur-hover) ${
                  activeTab === k ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'}`}>
                {label}<span className="text-[11px] tabular-nums text-muted-foreground">{n}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6">
          {activeTab === 'purchases' && (
            // What is owed lives in the register's Due tab, with the overdue part
            // as its own red figure. A big red Payable here said the same number
            // again and painted all of it red, overdue or not.
            <div className="hidden lg:flex items-baseline gap-3 text-[12px] text-muted-foreground">
              <span><span className="tabular-nums font-semibold text-foreground">{formatCurrency(summary.month)}</span> this month</span>
              <span><span className="tabular-nums font-semibold text-[color:var(--color-pos)]">{formatCurrency(summary.itc)}</span> ITC
                {summary.itcUnverified > 0 && (
                  <span title={`${summary.missingGstinSuppliers} supplier${summary.missingGstinSuppliers === 1 ? '' : 's'} have no GSTIN on file`}>
                    {' '}· +{formatCurrency(summary.itcUnverified)} pending
                  </span>
                )}
              </span>
            </div>
          )}
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-pill bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-[background-color,transform] duration-150 active:scale-[0.98] shrink-0">
            <Plus size={14} /> New purchase
          </button>
        </div>
      </div>

      {activeTab === 'purchases' && (
        <BillRegister
          bills={registerBills}
          today={today}
          suppliers={suppliers}
          productById={productById}
          voucherNoOf={voucherNo}
          onNew={() => setShowAddModal(true)}
          onPay={(b) => openPay([b])}
          onBulkPay={(bs) => openPay(bs)}
          onVoucher={(b) => setPrintTarget(b)}
          onPayments={(b) => setPaymentsTarget(b)}
          onEdit={(b) => setEditBillTarget(b)}
          onHistory={(l) => setHistoryProduct(products.find(x => x.id === l.linked_product_id) || { id: l.linked_product_id, name: productNameById[l.linked_product_id] })}
          onDuplicate={(l) => setDupTarget(l)}
          onReturn={(l) => setReturnTarget({ purchase: l, product: products.find(x => x.id === l.linked_product_id), supplier: suppliers.find(s => s.id === l.supplier_id) })}
          onDelete={(l) => handleDeletePurchase(l)}
          onSetStatus={(b, st) => b.lines.forEach(l => updatePurchaseStatus(l.id, st))}
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

      {/* Edit whole bill */}
      <Modal isOpen={!!editBillTarget} onClose={() => setEditBillTarget(null)}
        title="Edit Bill" subtitle="Header applies to every line · saved in one transaction">
        {editBillTarget && (
          <BillEditForm
            bill={editBillTarget}
            suppliers={suppliers}
            products={products}
            productNameById={productNameById}
            payments={supplierPayments}
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
      </Modal>

      {/* Part payments against this bill.
          Correcting one was only possible from the Supplier Ledger, which is
          not where someone looking at a bill marked "still due" is standing. */}
      <Modal isOpen={!!paymentsTarget} onClose={() => setPaymentsTarget(null)}
        title="Payments" subtitle="Part payments recorded against this bill">
        {paymentsTarget && (
          <BillPaymentsModal
            bill={paymentsTarget}
            payments={supplierPayments}
            onClose={() => setPaymentsTarget(null)}
            onEdit={(id, amount) => editSupplierPayment(id, { amount })}
            onDelete={(id) => deleteSupplierPayment(id)}
          />
        )}
      </Modal>

      {/* What this item has cost, purchase by purchase. */}
      <Modal isOpen={!!historyProduct} onClose={() => setHistoryProduct(null)}
        title="Price history" subtitle={historyProduct?.name || ''}>
        {historyProduct && <PriceHistory product={historyProduct} purchases={purchases} />}
      </Modal>

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

      {/* Pay one bill, or several of one supplier's bills. Same rules as the
          register: red only for what is overdue, labels in sentence case. */}
      <Modal isOpen={!!payTarget} onClose={() => setPayTarget(null)} title="Record payment"
        subtitle={payTarget ? `${payTarget.bills?.length > 1 ? `${payTarget.bills.length} bills` : (payTarget.bills?.[0]?.bill_no || voucherNo(payTarget.bills?.[0] || payTarget))} · ${payTarget.supplier_name || ''}` : ''}>
        {payTarget && (() => {
          const due = dueOf(payTarget);
          const overdue = (payTarget.bills || []).reduce((s2, b) => s2 + (b.overdue || 0), 0);
          const lbl = 'text-[12px] font-medium text-muted-foreground';
          return (
            <div className="flex flex-col gap-3" data-testid="pay-dialog">
              {payTarget.bills?.length > 1 && (
                <div className="rounded-lg border border-border/60 divide-y divide-border/60 text-[12.5px]">
                  {payTarget.bills.map(b => (
                    <div key={b.id} className="flex justify-between gap-3 px-3 py-2">
                      <span className="truncate"><span className="font-semibold">{b.bill_no || voucherNo(b)}</span>
                        <span className="text-muted-foreground"> · {formatDate(b.date)}</span></span>
                      <span className={`tabular-nums font-semibold ${b.state === 'over' ? 'text-[color:var(--color-neg)]' : ''}`}>{formatCurrency(b.due)}</span>
                    </div>
                  ))}
                  <p className="px-3 py-2 text-[12px] text-muted-foreground">A part payment settles the oldest bill first.</p>
                </div>
              )}
              <div className="flex justify-between text-[13px]"><span className={lbl}>{payTarget.bills?.length > 1 ? 'Bills total' : 'Bill total'}</span><span className="tabular-nums font-semibold">{formatCurrency(payTarget.total_amount)}</span></div>
              <div className="flex justify-between text-[13px]"><span className={lbl}>Already paid</span><span className="tabular-nums font-semibold">{formatCurrency(payTarget.paid_amount || 0)}</span></div>
              <div className="flex justify-between text-[13px] pt-2 border-t border-border/60">
                <span className="font-semibold">Due</span>
                <span className="text-right">
                  <span className="tabular-nums font-semibold">{formatCurrency(due)}</span>
                  {overdue > 0.005 && <span className="block text-[12px] font-semibold text-[color:var(--color-neg)]">{Math.abs(overdue - due) < 0.005 ? 'all overdue' : `${formatCurrency(overdue)} overdue`}</span>}
                </span>
              </div>
              <label className="block"><span className={lbl}>Amount</span>
                <input type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="mt-1 w-full h-11 px-3 border border-border rounded-lg text-[14px] tabular-nums font-semibold outline-none focus:border-accent-signature/70" autoFocus />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={lbl}>Method</span>
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="mt-1 w-full h-11 px-3 border border-border rounded-lg text-[13px] font-semibold">
                    <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option>
                  </select>
                </label>
                <label className="block"><span className={lbl}>Date</span>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="mt-1 w-full h-11 px-3 border border-border rounded-lg text-[13px] font-semibold" />
                </label>
              </div>
              <button onClick={submitPay} disabled={paySubmitting || !(Number(payAmount) > 0)} className="h-11 rounded-pill bg-primary text-primary-foreground text-[13px] font-semibold disabled:opacity-40 hover:bg-primary/90 transition-[background-color,transform] duration-(--dur-press) ease-(--ease-out) active:scale-[0.98] disabled:active:scale-100 flex items-center justify-center gap-2">
                <Banknote size={15} /> {paySubmitting ? 'Recording…' : 'Record payment'}
              </button>
            </div>
          );
        })()}
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
                className="mt-3 w-full h-11 rounded-pill bg-primary text-primary-foreground text-[13px] font-semibold flex items-center justify-center gap-2">
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
