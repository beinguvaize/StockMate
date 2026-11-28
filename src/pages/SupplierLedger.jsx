import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { usePeople } from '../hooks/usePeople';
import { usePurchases } from '../hooks/usePurchases';
import { useInventory } from '../hooks/useInventory';
import { PageSkeleton } from '../components/ui/States';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { FilterPills } from '../components/ui/Tabs';
import { FigureStrip, Figure } from '../components/ui/FigureStrip';
import {
  ArrowLeft, Phone, Mail, MapPin, Box, Search, ChevronRight, ChevronDown, Info, User, FileText,
  Trash2, Pencil, Printer,
} from 'lucide-react';
import { formatDate, todayISOInAppTZ, cn } from '../lib/utils';
import { groupPurchasesIntoBills, buildSupplierLedger } from '../lib/bills';
import { decorateBills } from './purchases/lib/register';
import { supplierDue, shortDay } from '../lib/supplierView';
import PaySupplierDialog from '../components/suppliers/PaySupplierDialog';
import { EditPaymentDialog, DeletePaymentDialog } from '../components/suppliers/PaymentDialogs';
import { Pill, BillPill, Eyebrow, EmptyCard, money, rupees, num2 } from '../components/suppliers/parts';

/**
 * A supplier's ledger (web redesign, approved mockups suppliers-05 … 10).
 *
 * Every figure keeps the source it had before the redesign; only the layout
 * changed. "Amount due" is this page's own figure (credit bills only, no
 * advances), "Closing balance" is the running ledger's, and they can differ:
 * the foot says why, as before. Money writes are the existing server
 * functions, unchanged: settle_supplier_payment, settle_purchase_payment,
 * edit_supplier_payment, delete_supplier_payment, offset_supplier_credit_note.
 *
 * "Print statement" is the same window.print() of this page; the print styles
 * in index.css (.supplier-ledger-print, .no-print) hide the controls.
 */
const SupplierLedger = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { addNotification } = useNotifications();
  const { suppliers, loading: peoLoading } = usePeople(currentTenantId);
  const { purchases, purchaseReturns, supplierPayments, paySupplier, payPurchase, offsetCreditNote, deleteSupplierPayment, editSupplierPayment, refetch, loading: purLoading } = usePurchases(currentTenantId);
  const [offsetting, setOffsetting] = useState(null);   // return id in flight
  const [offsetMsg, setOffsetMsg]   = useState(null);
  const { products, loading: invLoading } = useInventory(currentTenantId);
  // The Cash/Bank posting for a supplier payment is done by the database
  // (trg_supplier_payments_post_ledger), from the payment row itself. Nothing
  // on this page posts it.

  const loading = peoLoading || purLoading || invLoading;
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL'); // ALL | BILL | PAY | RETURN
  const [expandedRow, setExpandedRow] = useState(null);
  // A busy supplier runs ~6 bills a month, so three years is ~400 ledger rows.
  // Opens on this month. Older entries are not lost — the brought-forward
  // row carries their balance in, so the running figures stay true.
  const [range, setRange] = useState('1M');       // 1M | 3M | FY | ALL
  const [newestFirst, setNewestFirst] = useState(false);

  // Deleting or changing a payment changes what a supplier is owed, so each
  // asks first and names the amount.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);

  // Pay: payTarget is one purchases row (a bill line) or null = pay the
  // supplier (the server spreads it over the oldest unpaid credit bills).
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payPrefill, setPayPrefill] = useState('');
  const openPay = (purchase = null, prefill = '') => {
    setPayTarget(purchase);
    setPayPrefill(prefill);
    setPayOpen(true);
  };

  const isCredit = (pt) => ['CREDIT','UDHAAR','POST-CAPITAL'].includes(String(pt || '').toUpperCase());
  const isCash = (pt) => ['CASH','PAID'].includes(String(pt || '').toUpperCase());
  const cur = businessProfile?.currencySymbol || '₹';

  // 1. Resolve Supplier
  const supplier = useMemo(() => 
    (suppliers || []).find(s => s.id === id), 
    [suppliers, id]
  );

  // 2. Aggregate Data
  const supplierPurchases = useMemo(() => {
    if (!supplier) return [];
    return (purchases || [])
      .filter(p => p.supplier_id === supplier.id || p.supplier_name === supplier.name)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [supplier, purchases]);

  const supplierReturns = useMemo(() => {
    if (!supplier) return [];
    return (purchaseReturns || [])
      .filter(r => r.supplier_id === supplier.id || r.supplier_name === supplier.name)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [supplier, purchaseReturns]);

  const payments = useMemo(() => {
    if (!supplier) return [];
    return (supplierPayments || [])
      // Spent advances are soft-deleted and replaced by allocation rows. The
      // fetch filters them, but it renders from the offline cache first, which
      // can still hold a row from before it was spent — and counting both would
      // credit the same money twice.
      .filter(p => !p.deleted_at)
      .filter(p => p.supplier_id === supplier.id || p.supplier_name === supplier.name)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [supplier, supplierPayments]);
  // Payments not tied to a specific order — shown as ledger rows. Order-linked
  // payments are reflected in each purchase's Paid/Due instead (no double-show).
  const onAccountPayments = useMemo(() => payments.filter(p => !p.purchase_id), [payments]);
  // The sidebar's Payment history panel used to live here — settlements plus
  // cash purchases, listed newest first. The ledger now carries every one of
  // those as a dated credit row with a running balance beside it, so the panel
  // was the same money a second time, a few inches to the left.
  //
  // ── Bills ────────────────────────────────────────────────────────────────
  // One physical bill is stored as one `purchases` row PER PRODUCT — the
  // multi-product form writes them in a burst. RENO JOHN's 17 Jul bill is two
  // rows created 1.7s apart. Showing them as separate lines inflated this
  // tenant's ledger from 52 real bills to 135 rows.
  //
  // Key: supplier + date + payment_type, and rows only chain while consecutive
  // created_at gaps stay inside BURST_MS. Both parts are load-bearing:
  //   · payment_type — SAJJAD 24 Jul has two rows 59s apart, one CREDIT and one
  //     CASH. Different bills; merging them would re-blur the pair behind the
  //     duplicate ₹6,900 payment.
  //   · the burst guard — MADEENA 9 May has 4 rows spanning 2.9 hours. Separate
  //     trips, and a supplier+date key alone would fuse them into one bill.
  //
  // Presentation only. No row is merged in the database and no id changes.
  // Bills come from src/lib/bills.js — the same rule the purchases list uses.
  // It lived in both files until the second copy was written, which is one
  // edit away from the two screens disagreeing about what a supplier billed.
  const bills = useMemo(
    () => groupPurchasesIntoBills(supplierPurchases),
    [supplierPurchases]);

  // ── The ledger ───────────────────────────────────────────────────────────
  // One chronological debit/credit list with a running balance, mirroring
  // ClientStatementReport.jsx. Previously this rendered as three stacked
  // blocks — every bill, then every return, then every payment — so a June
  // debit note sat below a July bill and nothing accumulated.
  // Built by src/lib/bills.js so the rule that decides what appears on a
  // statement — and the one that stops the same money being credited twice —
  // is covered by tests rather than living only here.
  const ledgerRows = useMemo(
    () => buildSupplierLedger({
      bills,
      payments,
      returns: supplierReturns,
      onAccountPayments,
    }),
    [bills, payments, supplierReturns, onAccountPayments]);

  // ── Period ───────────────────────────────────────────────────────────────
  // Start of the visible window, or null for the whole history.
  const rangeStart = useMemo(() => {
    if (range === 'ALL') return null;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (range === '1M') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    if (range === '3M') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return fmt(d); }
    // Indian financial year — 1 April to 31 March. Matters here because this is
    // the window a GST filing or an audit is reconciled against.
    const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${fy}-04-01`;
  }, [range]);

  // Balance carried into the window. A running balance depends on everything
  // before it, so a period view that started from zero would put a wrong
  // number on every visible line — the reason a statement of account always
  // opens with a brought-forward figure.
  const opening = useMemo(() => {
    if (!rangeStart) return 0;
    let bal = 0;
    ledgerRows.forEach(r => { if (String(r.date) < rangeStart) bal = r.balance; });
    return bal;
  }, [ledgerRows, rangeStart]);

  const inRange = useMemo(
    () => (rangeStart ? ledgerRows.filter(r => String(r.date) >= rangeStart) : ledgerRows),
    [ledgerRows, rangeStart]
  );
  const hiddenBefore = ledgerRows.length - inRange.length;

  // The filter now covers every row type. It used to be ALL/CASH/CREDIT and
  // applied to bills only, so picking CASH still showed every return and
  // payment — and the count beside it only ever counted purchases.
  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return inRange.filter(r => {
      if (paymentFilter !== 'ALL' && r.kind !== paymentFilter) return false;
      if (!q) return true;
      const hay = [
        r.bill?.id, r.bill?.bill_no, r.ret?.id, r.pay?.id, r.pay?.reference_no, r.pay?.note,
        ...(r.bill?.lines || []).map(x => x.id),
        ...(r.bill?.lines || []).map(x => x.notes),
        ...(r.bill?.lines || []).map(x => (products || []).find(pr => pr.id === x.linked_product_id)?.name),
      ];
      return hay.some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [inRange, searchTerm, paymentFilter, products]);

  const displayRows = useMemo(
    () => (newestFirst ? [...filteredRows].reverse() : filteredRows),
    [filteredRows, newestFirst]
  );

  // Closing is always the balance across ALL history, never just the window —
  // what the supplier is owed today does not change because you looked at a
  // narrower period.
  // A credit note is money the supplier owes back, not a smaller payable. How
  // much of each has been offset is derived from the CREDIT_NOTE payment rows
  // themselves rather than a flag, so the two can never drift apart.
  const creditNotes = useMemo(() => supplierReturns.map(r => {
    const used = payments
      .filter(p => p.note === `Credit note ${r.id}` && !p.deleted_at)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const total = Number(r.total_amount || 0);
    return { ...r, used, open: Math.max(0, total - used), total };
  }), [supplierReturns, payments]);

  const openCredit = creditNotes.reduce((s, c) => s + c.open, 0);

  const runOffset = async (returnId) => {
    setOffsetting(returnId); setOffsetMsg(null);
    const { success, applied, error } = await offsetCreditNote(returnId);
    setOffsetting(null);
    setOffsetMsg(success
      ? { ok: true,  text: `${cur}${Math.round(applied).toLocaleString('en-IN')} offset against open bills.` }
      : { ok: false, text: error?.message || 'Could not offset this credit note.' });
  };

  const closing = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].balance : 0;
  // Debit/credit columns total the visible period — a statement's totals should
  // add up to the lines printed beneath them. The balance beside them stays
  // all-time, which is why the carried-forward row has to be on screen.
  const ledgerTotals = useMemo(() => ({
    debit:  inRange.reduce((s, r) => s + r.debit, 0),
    credit: inRange.reduce((s, r) => s + r.credit, 0),
  }), [inRange]);

  const metrics = useMemo(() => {
    const amt = (p) => Number(p.total_amount ?? p.total_cost ?? 0);
    const total = supplierPurchases.reduce((s, p) => s + amt(p), 0);
    const cashPaid = supplierPurchases.filter(p => isCash(p.payment_type)).reduce((s, p) => s + amt(p), 0);
    const creditTotal = supplierPurchases.filter(p => isCredit(p.payment_type)).reduce((s, p) => s + amt(p), 0);
    // Count bills, not purchases rows. A five-product bill is one purchase to
    // the shopkeeper, and the ledger beside this now says so — leaving these
    // on row counts made the card read "5 purchases" against 4 ledger lines,
    // and pulled the average down to a per-product figure nobody buys at.
    const count = bills.length;
    const avg = count > 0 ? total / count : 0;
    const lineCount = supplierPurchases.length;
    const last = supplierPurchases[0]?.date;
    const totalReturns = supplierReturns.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const net = total - totalReturns;
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    // Outstanding derived from the orders themselves (Σ credit total − paid), so
    // it always matches the per-row dues. The stored suppliers.balance can drift
    // when a purchase is edited (payment_type/amount) without re-syncing it.
    const payable = supplierPurchases
      .filter(p => isCredit(p.payment_type))
      .reduce((s, p) => s + Math.max(0, amt(p) - Number(p.paid_amount || 0)), 0);

    return { total, count, avg, last, payable, cashPaid, creditTotal, totalReturns, net, totalPaid, lineCount };
  }, [supplierPurchases, supplierReturns, payments, bills]);


  // Read-only, for the header pill and the line Pay dialog: each bill's due
  // date and state by the Purchases register's rule.
  const today = todayISOInAppTZ();
  const decoratedBills = useMemo(
    () => (supplier ? decorateBills(bills, { suppliers: [supplier], payments, today }) : []),
    [bills, supplier, payments, today]);
  const billById = useMemo(() => new Map(decoratedBills.map(b => [b.id, b])), [decoratedBills]);
  const due = useMemo(() => supplierDue(decoratedBills), [decoratedBills]);
  // Unpaid credit bills: the bills "Amount due" above is made of.
  const unpaidCredit = useMemo(() => bills.filter(b => isCredit(b.payment_type) && b.due > 0.01)
    .sort((a, b) => String(a.date).localeCompare(String(b.date))), [bills]);
  const onAccountTotal = onAccountPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  if (loading) return <PageSkeleton cards={3} rows={8} />;

  if (!supplier) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <div className="w-full max-w-md">
          <EmptyCard icon={Info} title="Supplier not found" text="This supplier record was deleted or is no longer available.">
            <Button onClick={() => navigate(-1)}>Back to Suppliers</Button>
          </EmptyCard>
        </div>
      </div>
    );
  }

  const canPay = hasPermission('purchases', 'edit') !== false;
  const ref8 = (id) => `#${(id || '').slice(-8).toUpperCase()}`;
  const billRef = (b) => b?.bill_no || ref8(b?.id);
  const lineName = (x) => (products || []).find(pr => pr.id === x?.linked_product_id)?.name || x?.notes || '';
  const amountWords = (n) => num2(n);
  const contact = [
    [User, supplier.contact_person], [Phone, supplier.phone], [Mail, supplier.email],
    [MapPin, supplier.address], [FileText, supplier.gstin ? `GSTIN ${supplier.gstin}` : null],
  ].filter(([, v]) => v);
  const payTargetBill = payTarget ? decoratedBills.find(b => b.lines.some(l => l.id === payTarget.id)) : null;

  const th = 'px-2.5 py-2.5 text-left font-tight text-[12px] font-semibold text-mute border-b border-line whitespace-nowrap first:pl-4 last:pr-3.5';
  const td = 'px-2.5 py-[11px] border-b border-sep align-top text-[13px] first:pl-4 last:pr-3.5';
  // On screen the columns use shop words; the printed statement keeps Debit,
  // Credit and Balance.
  const colHead = (screen, print, className) => (
    <th className={cn(th, className)}><span className="print:hidden">{screen}</span><span className="hidden print:inline">{print}</span></th>
  );
  const broughtForward = (
    <tr className="[&>td]:bg-tile">
      <td className={cn(td, 'whitespace-nowrap text-[12.5px] text-body')}>{shortDay(rangeStart)}</td>
      <td colSpan="4" className={cn(td, 'text-[12.5px] text-body')}>
        <b className="font-tight font-semibold text-ink-2">Balance brought forward</b> · {hiddenBefore} earlier {hiddenBefore === 1 ? 'entry' : 'entries'} not shown
      </td>
      <td className={cn(td, 'text-right font-tight font-semibold tabular-nums')}>{amountWords(opening)}</td>
      <td className={cn(td, 'no-print')} />
    </tr>
  );

  return (
    <div className="flex flex-col pb-16">
      {/* Header: back, name, pills, As of, Print statement, Record payment */}
      <div className="m-rise mb-[18px] flex flex-wrap items-center gap-3.5" style={{ '--i': 0 }}>
        <button type="button" onClick={() => navigate(-1)}
          className="no-print m-press inline-flex items-center gap-1.5 font-tight text-[13px] font-semibold text-body hover:text-ink">
          <ArrowLeft size={15} /> Suppliers
        </button>
        <h3 className="min-w-0 truncate font-tight text-[20px] font-semibold tracking-[-0.02em]">{supplier.name}</h3>
        <span className="flex items-center gap-1.5">
          {due.pill && <BillPill pill={due.pill} />}
          <Pill>Active supplier</Pill>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="mr-1 text-[12px] text-mute">As of {formatDate(today)}</span>
          <Button variant="secondary" className="no-print" onClick={() => window.print()}><Printer /> Print statement</Button>
          {metrics.payable > 0 && canPay && (
            <Button className="no-print gap-2.5 tabular-nums" onClick={() => openPay()}>
              Record payment <span>{rupees(metrics.payable, cur)}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="m-rise -mt-2 mb-[18px] flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[13px] text-ink-2" style={{ '--i': 0 }}>
        {contact.length ? contact.map(([Icon, v], i) => (
          <span key={i} className="inline-flex items-center gap-1.5 tabular-nums"><Icon size={14} strokeWidth={1.8} className="text-mute" />{v}</span>
        )) : <span className="text-mute">No contact details on file</span>}
      </div>

      <div className="supplier-ledger-print">
        <FigureStrip cols={4} className="m-rise mb-5" style={{ '--i': 1 }}>
          <Figure label="Amount due" value={<span className={metrics.payable > 0 ? 'text-bad-text' : 'text-good-text'}>{money(metrics.payable, cur)}</span>}
            sub={metrics.payable > 0
              ? `${unpaidCredit.length} unpaid credit ${unpaidCredit.length === 1 ? 'bill' : 'bills'}${unpaidCredit[0] ? ` · oldest ${shortDay(unpaidCredit[0].date)}` : ''}`
              : 'Settled'} />
          <Figure label="Closing balance" value={money(closing, cur)}
            sub={Math.abs(closing - metrics.payable) > 0.01
              ? [metrics.totalReturns > 0.01 ? `less ${money(metrics.totalReturns, cur)} in returns` : null,
                 onAccountPayments.length > 0 ? `less ${money(onAccountTotal, cur)} on account` : null].filter(Boolean).join(' · ') || 'the running ledger below'
              : 'the running ledger below'} />
          <Figure label="Total purchased" value={rupees(metrics.total, cur)}
            sub={`${metrics.count} ${metrics.count === 1 ? 'bill' : 'bills'}${metrics.lineCount > metrics.count ? ` · ${metrics.lineCount} products` : ''}`} />
          <Figure label="Payments made" value={<span className="text-good-text">{rupees(metrics.totalPaid, cur)}</span>}
            sub="all time, not counting cash bills" />
        </FigureStrip>

        <div className="ledger-panel m-rise overflow-hidden rounded-[14px] border border-line bg-surface" style={{ '--i': 2 }}>
          <div className="no-print flex flex-wrap items-center gap-2 border-b border-sep px-3.5 py-3">
            <FilterPills ariaLabel="Period" value={range} onChange={(v) => { setRange(v); setExpandedRow(null); }}
              items={[{ key: '1M', label: 'Month' }, { key: '3M', label: '3 months' }, { key: 'FY', label: 'This FY' }, { key: 'ALL', label: 'All' }]} />
            <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
            <FilterPills ariaLabel="Show" value={paymentFilter} onChange={(v) => { setPaymentFilter(v); setExpandedRow(null); }}
              items={[{ key: 'ALL', label: 'All' }, { key: 'BILL', label: 'Bills' }, { key: 'PAY', label: 'Payments' }, { key: 'RETURN', label: 'Returns' }]} />
            {/* A shopkeeper wants today at the top; an accountant reading a
                statement wants it to run forwards. Neither is wrong. */}
            <button type="button" onClick={() => setNewestFirst(v => !v)}
              title={newestFirst ? 'Showing newest first' : 'Showing oldest first'}
              className="m-press inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1.5 font-tight text-[12.5px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
              {newestFirst ? 'Newest first' : 'Oldest first'} <ChevronDown size={14} className={newestFirst ? 'rotate-180' : ''} />
            </button>
            <label className="relative ml-auto w-[220px] max-w-full">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Bill no., product or note"
                aria-label="Search the ledger" className="pl-9" />
            </label>
          </div>

          <div className="overflow-x-auto overflow-y-auto">
            <table className="w-full border-collapse text-ink">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Type</th>
                  <th className={th}>Reference</th>
                  {colHead('Billed', 'Debit', 'text-right')}
                  {colHead('Paid or returned', 'Credit', 'text-right')}
                  {colHead('You owe', 'Balance', 'text-right')}
                  <th className={cn(th, 'no-print w-16')}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {/* Balance carried into the window. Without it every figure in
                    the balance column would be understated by whatever the
                    hidden history left behind. */}
                {hiddenBefore > 0 && !newestFirst && broughtForward}
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-20 text-center">
                      <Box size={40} strokeWidth={1.4} className="mx-auto mb-3 text-faint" />
                      <h4 className="font-tight text-[16px] font-semibold">No transactions</h4>
                      <p className="mt-1 text-[13px] text-body">
                        {ledgerRows.length === 0
                          ? 'This supplier has no recorded purchases yet.'
                          : hiddenBefore === ledgerRows.length
                            ? 'Nothing in this period — try a wider range.'
                            : 'Nothing matches this filter.'}
                      </p>
                    </td>
                  </tr>
                ) : displayRows.map((r, i) => {
                  const key = `${r.kind}-${r.bill?.id || r.ret?.id || r.pay?.id}-${i}`;
                  const bal = <td className={cn(td, 'text-right font-tight font-semibold tabular-nums whitespace-nowrap', r.balance > 0.01 ? 'text-ink' : 'text-mute')}>{amountWords(r.balance)}</td>;

                  // ── Bill ──────────────────────────────────────────────
                  if (r.kind === 'BILL') {
                    const b = r.bill;
                    const multi = b.lines.length > 1;
                    const expanded = expandedRow === b.id;
                    const names = b.lines.map(x => (products || []).find(pr => pr.id === x.linked_product_id)?.name).filter(Boolean);
                    return (
                      <React.Fragment key={key}>
                        <tr onClick={() => multi && setExpandedRow(expanded ? null : b.id)}
                          className={cn('[&>td]:transition-colors [&>td]:duration-(--dur-press)', multi && 'cursor-pointer', expanded ? '[&>td]:bg-amber-soft' : 'hover:[&>td]:bg-tile')}>
                          <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{shortDay(b.date)}</td>
                          <td className={td}><Pill>Bill</Pill></td>
                          <td className={td}>
                            <span className="inline-flex flex-wrap items-center gap-1.5 font-tight text-[13.5px] font-semibold">
                              {multi && (
                                <span className="grid h-5 w-5 place-items-center rounded-md text-mute">
                                  <ChevronRight size={13} className={cn('transition-transform duration-(--dur-press)', expanded && 'rotate-90')} />
                                </span>
                              )}
                              <span className="tabular-nums">{billRef(b)}</span>
                              {multi && <span className="rounded-pill bg-well px-[7px] py-px text-[11px] text-ink-2">{b.lines.length} items</span>}
                              {b.due > 0.01 && <span className="rounded-pill bg-bad-soft px-[7px] py-px text-[11px] tabular-nums text-bad-text">due {Math.round(b.due).toLocaleString('en-IN')}</span>}
                              {/* Single-product bill: pay it right here. Multi
                                  product bills pay per line inside the detail,
                                  since the money lands on different rows. */}
                              {!multi && b.due > 0.01 && canPay && (
                                <Button size="xs" variant="dark" className="no-print ml-1 h-6 px-2.5 text-[12px]"
                                  onClick={(e) => { e.stopPropagation(); openPay(b.lines[0], b.due); }}>Pay</Button>
                              )}
                            </span>
                            {(multi && expanded && b.due > 0.01) ? (
                              <small className={cn('block text-[12px] text-mute', multi && 'pl-[26px]')}>Pay the lines still open, below</small>
                            ) : names.length > 0 && (
                              <small className={cn('block max-w-[320px] truncate text-[12px] text-mute', multi && 'pl-[26px]')}>
                                {names.slice(0, 3).join(', ')}{names.length > 3 ? ` +${names.length - 3}` : ''}
                              </small>
                            )}
                            {r.atBill > 0.01 && (
                              <small className={cn('block text-[12px] font-semibold text-good-text', multi && 'pl-[26px]')}>
                                {money(r.atBill, cur)} paid at bill · {b.payment_type || 'CASH'}
                              </small>
                            )}
                          </td>
                          <td className={cn(td, 'text-right font-tight tabular-nums whitespace-nowrap')}>{amountWords(r.debit)}</td>
                          {/* Money handed over at the counter belongs to the
                              bill, not to a second row that cancels it. */}
                          <td className={cn(td, 'text-right font-tight tabular-nums whitespace-nowrap')}>
                            {r.credit > 0.01 ? <span className="text-good-text">{amountWords(r.credit)}</span> : <span className="text-faint">—</span>}
                          </td>
                          {bal}
                          <td className={cn(td, 'no-print')} />
                        </tr>

                        {expanded && b.lines.map(x => {
                          const lineAmt = Number(x.total_amount ?? x.total_cost ?? 0);
                          const lineQty = Number(x.quantity ?? 0);
                          const lineDue = Math.max(0, lineAmt - Number(x.paid_amount || 0));
                          return (
                            <tr key={`${key}-${x.id}`} className="bill-detail [&>td]:bg-[#FCFBF9] hover:[&>td]:bg-[#F8F6F2]">
                              <td className={cn(td, 'py-[7px]')} />
                              <td colSpan="2" className={cn(td, 'border-l-2 border-l-amber py-[7px]')}>
                                <span className="block font-medium">{lineName(x) || '—'}</span>
                                <small className="block text-[12px] tabular-nums text-mute">
                                  {lineQty} × {cur}{(lineQty > 0 ? lineAmt / lineQty : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · line {(x.id || '').slice(-6).toUpperCase()}
                                  {x.notes && lineName(x) !== x.notes ? ` · ${x.notes}` : ''}
                                </small>
                              </td>
                              <td className={cn(td, 'py-[7px] text-right font-tight tabular-nums whitespace-nowrap')}>{amountWords(lineAmt)}</td>
                              <td colSpan="3" className={cn(td, 'py-[7px] text-right whitespace-nowrap')}>
                                {lineDue > 0.01 ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="rounded-pill bg-bad-soft px-[7px] py-px font-tight text-[11px] font-semibold tabular-nums text-bad-text">due {Math.round(lineDue).toLocaleString('en-IN')}</span>
                                    {canPay && (
                                      <Button size="xs" variant="secondary" className="no-print h-6 px-2.5 text-[12px]"
                                        onClick={(e) => { e.stopPropagation(); openPay(x, lineDue); }}>Pay</Button>
                                    )}
                                  </span>
                                ) : <Pill tone="good">Settled</Pill>}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  }

                  // ── Payment ───────────────────────────────────────────
                  if (r.kind === 'PAY') {
                    // One handover can settle several bills. It is still one
                    // payment: show the total, and what it covered.
                    const many = (r.allocations?.length || 0) > 1;
                    const ref = r.onAccount ? 'On account' : many ? `${r.allocations.length} bills` : billRef(r.bill);
                    const method = r.pay?.payment_method || 'CASH';
                    const sub = [r.onAccount ? method : `${method} · settlement`, r.pay?.reference_no ? `ref ${r.pay.reference_no}` : null].filter(Boolean).join(' · ');
                    return (
                      <tr key={key} className="group/pay hover:[&>td]:bg-tile [&>td]:transition-colors [&>td]:duration-(--dur-press)">
                        <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{shortDay(r.date)}</td>
                        <td className={td}><Pill tone="good">{r.atBill ? 'Paid' : 'Payment'}</Pill></td>
                        <td className={td}>
                          <span className="font-tight text-[13.5px] font-semibold tabular-nums">
                            {ref}
                            {/* Which line took the money, when it is one bill
                                of several lines and not the one it is named after. */}
                            {r.lineRef && <span className="ml-1.5 font-sans text-[12px] font-medium text-mute">· {r.lineRef}</span>}
                          </span>
                          {many && (
                            <small className="block text-[12px] leading-tight text-mute">
                              {r.allocations.map(a => `#${String(a.purchaseId || '').slice(-6).toUpperCase()} ${money(a.amount, cur)}`).join(' · ')}
                            </small>
                          )}
                          <small className="block text-[12px] text-mute">{sub}</small>
                        </td>
                        <td className={cn(td, 'text-right text-faint')} />
                        <td className={cn(td, 'text-right font-tight tabular-nums whitespace-nowrap text-good-text')}>{amountWords(r.credit)}</td>
                        {bal}
                        <td className={cn(td, 'no-print whitespace-nowrap py-2 text-right')}>
                          {/* Only a real receipt can be changed or removed. Money
                              paid at the counter belongs to its bill and is undone
                              by editing that bill, not here. */}
                          {r.pay?.id && (
                            <span className="inline-flex gap-0.5 opacity-60 transition-opacity group-hover/pay:opacity-100 focus-within:opacity-100">
                              <button type="button" title="Edit this payment" aria-label="Edit this payment"
                                onClick={() => setEditTarget({ id: r.pay.id, amount: r.credit, date: r.date, method })}
                                className="m-press grid h-[26px] w-[26px] place-items-center rounded-lg text-body hover:bg-tile"><Pencil size={13} /></button>
                              <button type="button" title="Delete this payment" aria-label="Delete this payment"
                                onClick={() => setDeleteTarget({ id: r.pay.id, amount: r.credit, date: r.date, method, many: r.allocations?.length || 1, ref: r.onAccount ? null : billRef(r.bill) })}
                                className="m-press grid h-[26px] w-[26px] place-items-center rounded-lg text-bad-text hover:bg-tile"><Trash2 size={13} /></button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  // ── Return / debit note ───────────────────────────────
                  const ret = r.ret;
                  const rprod = (products || []).find(pr => pr.id === ret.product_id);
                  return (
                    <tr key={key} className="hover:[&>td]:bg-tile [&>td]:transition-colors [&>td]:duration-(--dur-press)">
                      <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{shortDay(r.date)}</td>
                      <td className={td}><Pill tone="info">Return</Pill></td>
                      <td className={td}>
                        <span className="font-tight text-[13.5px] font-semibold tabular-nums">{ref8(ret.id)}</span>
                        <small className="block max-w-[320px] truncate text-[12px] text-mute">
                          {rprod?.name || ret.product_name || 'Debit note'}
                          {ret.quantity ? ` · ${Number(ret.quantity)} units` : ''}
                          {ret.reason ? ` · ${ret.reason}` : ''}
                        </small>
                      </td>
                      <td className={cn(td, 'text-right text-faint')} />
                      <td className={cn(td, 'text-right font-tight tabular-nums whitespace-nowrap text-info-text')}>{amountWords(r.credit)}</td>
                      {bal}
                      <td className={cn(td, 'no-print')} />
                    </tr>
                  );
                })}
                {/* Newest-first puts the oldest line last, so the carried
                    balance belongs at the foot of the list, not the head. */}
                {hiddenBefore > 0 && newestFirst && displayRows.length > 0 && broughtForward}
              </tbody>
              {ledgerRows.length > 0 && paymentFilter === 'ALL' && !searchTerm.trim() && (
                <tfoot>
                  <tr className="font-tight text-[13.5px] font-semibold tabular-nums">
                    <td colSpan="3" className="border-t border-line px-2.5 py-3 pl-4">
                      Closing balance
                      <span className="ml-2 font-sans text-[12.5px] font-medium text-body">
                        {hiddenBefore > 0 ? `billed and paid cover ${shortDay(rangeStart)} onwards · ` : ''}{filteredRows.length} {filteredRows.length === 1 ? 'row' : 'rows'}
                      </span>
                    </td>
                    <td className="border-t border-line px-2.5 py-3 text-right">{money(ledgerTotals.debit, cur)}</td>
                    <td className="border-t border-line px-2.5 py-3 text-right">{money(ledgerTotals.credit, cur)}</td>
                    <td className={cn('border-t border-line px-2.5 py-3 text-right', closing > 0.01 ? 'text-bad-text' : 'text-good-text')}>{money(closing, cur)}</td>
                    <td className="no-print border-t border-line" />
                  </tr>
                  {/* Amount due sums unpaid credit bills only. The ledger also
                      credits debit notes and on-account money, so the two can
                      legitimately differ: say why. */}
                  {Math.abs(closing - metrics.payable) > 0.01 && (
                    <tr>
                      <td colSpan="7" className="px-3.5 pb-3 text-right text-[12px] text-body">
                        Amount due on unpaid bills is {rupees(metrics.payable, cur)}
                        {metrics.totalReturns > 0.01 && <> · less {rupees(metrics.totalReturns, cur)} in credit notes</>}
                        {onAccountPayments.length > 0 && <> · less {rupees(onAccountTotal, cur)} paid on account</>}
                      </td>
                    </tr>
                  )}
                </tfoot>
              )}
              {!(ledgerRows.length > 0 && paymentFilter === 'ALL' && !searchTerm.trim()) && filteredRows.length > 0 && (
                <tfoot>
                  <tr><td colSpan="7" className="border-t border-line px-4 py-2.5 text-[12.5px] text-body">{filteredRows.length} {filteredRows.length === 1 ? 'row' : 'rows'} · clear the filter and search to see the closing balance</td></tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className={cn('mt-4 grid gap-4', openCredit > 0.01 ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]' : '')}>
          {/* Credit notes: money the supplier owes back. Not netted off Amount
              due on purpose -- whether it offsets the next bill or comes back
              as cash is the shopkeeper's call. Applied only when told to. */}
          {openCredit > 0.01 && (
            <div className="m-rise rounded-[14px] border border-line bg-surface px-4 py-3.5" style={{ '--i': 3 }}>
              <Eyebrow>Credit notes</Eyebrow>
              <div className="mt-1 font-tight text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-info-text">{money(openCredit, cur)}</div>
              <span className="text-[12px] text-mute">Owed to you, not yet used</span>
              {creditNotes.filter(c => c.open > 0.01).map(c => (
                <div key={c.id} className="mt-2 flex items-center gap-2.5 rounded-[10px] bg-info-soft py-[9px] pl-3 pr-2.5">
                  <div className="min-w-0">
                    <b className="block truncate font-tight text-[13px] font-semibold">{c.product_name || 'Return'}</b>
                    <small className="block text-[11.5px] tabular-nums text-body">
                      {shortDay(c.date)} · #{(c.id || '').slice(-6).toUpperCase()}
                      {c.used > 0.01 && <> · {rupees(c.used, cur)} already applied</>}
                    </small>
                  </div>
                  <span className="ml-auto font-tight font-semibold tabular-nums text-info-text">{num2(c.open)}</span>
                  {metrics.payable > 0.01 && canPay && (
                    <Button size="xs" variant="dark" className="no-print" title="Apply this credit against the supplier's open bills"
                      onClick={() => runOffset(c.id)} disabled={offsetting === c.id}>
                      {offsetting === c.id ? '…' : 'Offset'}
                    </Button>
                  )}
                </div>
              ))}
              {metrics.payable <= 0.01
                ? <p className="mt-2 text-[12px] text-mute">Nothing outstanding to offset against — collect this as cash or hold it for the next bill.</p>
                : <p className="mt-2 text-[12px] text-mute">Offset uses it against the open bills. It is not taken off Amount due until you do.</p>}
              {offsetMsg && (
                <p className={cn('mt-2 text-[12px] font-semibold', offsetMsg.ok ? 'text-good-text' : 'text-bad-text')} role={offsetMsg.ok ? 'status' : 'alert'}>{offsetMsg.text}</p>
              )}
            </div>
          )}

          <div className="m-rise rounded-[14px] border border-line bg-surface px-4 py-3.5" style={{ '--i': 3 }}>
            <h4 className="mb-2 flex items-center gap-2 font-tight text-[14px] font-semibold">Purchases<span className="ml-auto text-[12px] font-medium text-mute">All time</span></h4>
            <div className={cn('grid gap-2', openCredit > 0.01 ? 'grid-cols-3' : 'grid-cols-3 lg:grid-cols-6')}>
              {[
                ['Average purchase', rupees(metrics.avg, cur), ''],
                ['Last purchase', metrics.last ? formatDate(metrics.last) : 'N/A', ''],
                ['Cash paid', rupees(metrics.cashPaid, cur), 'text-good-text'],
                ['Credit purchases', rupees(metrics.creditTotal, cur), ''],
                ...(metrics.totalReturns > 0 ? [
                  ['Returns', `−${rupees(metrics.totalReturns, cur)}`, 'text-bad-text'],
                  ['Net purchased', rupees(metrics.net, cur), ''],
                ] : []),
              ].map(([label, val, cls]) => (
                <div key={label} className="rounded-[10px] bg-tile px-3 py-[9px]">
                  <span className="text-[12px] text-body">{label}</span>
                  <b className={cn('mt-0.5 block font-tight text-[15px] font-semibold tabular-nums', cls)}>{val}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <PaySupplierDialog open={payOpen} onClose={() => { setPayOpen(false); setPayTarget(null); }}
        supplierId={supplier?.id || payTarget?.supplier_id || id} supplierName={supplier.name}
        target={payTarget} bill={payTargetBill || (payTarget ? billById.get(payTarget.id) : null)}
        lineName={payTarget ? lineName(payTarget) : ''}
        owed={{ label: 'Amount due', amount: metrics.payable }} prefill={payPrefill}
        cur={cur} paySupplier={paySupplier} payPurchase={payPurchase} onRecheck={refetch}
        onPaid={({ amount, queued }) => addNotification(queued
          ? `Payment of ${rupees(amount, cur)} saved on this computer; it will sync when you are online.`
          : `Paid ${rupees(amount, cur)} to ${supplier.name}.`, 'success')} />

      <EditPaymentDialog open={!!editTarget} target={editTarget} onClose={() => setEditTarget(null)} cur={cur}
        editSupplierPayment={editSupplierPayment}
        onSaved={(n) => addNotification(`Payment changed to ${rupees(n, cur)}.`, 'success')} />

      <DeletePaymentDialog open={!!deleteTarget} target={deleteTarget} onClose={() => setDeleteTarget(null)} cur={cur}
        supplierName={supplier.name} deleteSupplierPayment={deleteSupplierPayment}
        onDeleted={(t) => addNotification(`Payment of ${rupees(t.amount, cur)} deleted.`, 'success')} />
    </div>
  );
};

export default SupplierLedger;
