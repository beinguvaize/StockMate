import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { buildClientStatement, runningTotalOfShown, METHOD_LABEL } from '../lib/clientStatement';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { usePeople } from '../hooks/usePeople';
import { useSales } from '../hooks/useSales';
import { supabase } from '../lib/supabase';
import { PageSkeleton } from '../components/ui/States';
import { ChevronLeft, ChevronRight, Search, Pencil, MessageCircle, FileText, AlertCircle } from 'lucide-react';
import { todayISOInAppTZ, formatDate, cn } from '../lib/utils';
import { classifyWriteFailure } from '../lib/writeOutcome';
import {
  money, clientFacts, clientSummary, daysSince, ageWords, creditWords, rangeStartFor, ledgerWindow,
} from '../lib/clientView';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Seg } from '../components/documents/DocParts';
import WriteFailure from '../components/invoices/WriteFailure';
import { Pill, Eyebrow } from '../components/payroll/parts';
import { SummaryStrip } from '../components/clients/parts';
import { METHODS } from '../components/clients/CollectPaymentDialog';
import ClientForm from '../components/clients/ClientForm';
import ReminderDialog from '../components/clients/ReminderDialog';
import EditPaymentDialog from '../components/clients/EditPaymentDialog';
import StatementViewer, { RANGES } from '../components/clients/StatementViewer';

/**
 * Client Account (web redesign, approved mockups clients-10, 11, 12, 18):
 * the statement on the left, what is owed and "Record a payment" on the
 * right, the client summary on top.
 *
 * Every read and write is today's. The statement is lib/clientStatement's;
 * recording a payment is usePeople.recordClientPayment with no invoice ids
 * (settle_client_payment, oldest bill first); editing and deleting a receipt
 * are edit_client_payment and delete_client_payment. Same rule as before: any
 * amount above zero, Cash · Bank · UPI · Cheque, the date as chosen.
 */
const ClientSettlement = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { addNotification } = useNotifications();
  const { clients, recordClientPayment, deleteClientPayment, editClientPayment, updateClient, addClient, refetch, loading: peoLoading } = usePeople(currentTenantId);
  const { invoices, sales, loading: salesLoading, refetch: refetchSales } = useSales(currentTenantId);
  const cur = businessProfile?.currencySymbol || '₹';
  const today = todayISOInAppTZ();

  const loading = peoLoading || salesLoading;

  const client = useMemo(() =>
    (clients || []).find(c => String(c.id) === String(id)),
    [clients, id]
  );

  const [paymentData, setPaymentData] = useState({
    amount: '',
    date: todayISOInAppTZ(),
    notes: '',
    paymentMethod: 'CASH'
  });
  const [paymentError, setPaymentError] = useState('');
  const [paymentFailure, setPaymentFailure] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [success, setSuccess] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  // Sale ledger rows for this client's sales — one per payment event, each with
  // the date the money actually arrived. Without them the statement credits a
  // sale's whole paidAmount on the BILL's date, so a 1,185 collected on 31 Aug
  // against a 10 Aug bill shows up on the 10th.
  const [saleReceipts, setSaleReceipts] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null); // ledger row showing its products
  // Opens on this month. Older entries are not lost — the brought-forward
  // row carries their balance in, so the running figures stay true.
  const [range, setRange] = useState('1M');             // 1M | 3M | FY | ALL
  const [rowKind, setRowKind] = useState('ALL');        // ALL | SALE | PAYMENT
  const [newestFirst, setNewestFirst] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  // Payment history + collector names, resolved separately (no FK on recorded_by).
  const loadHistory = useCallback(async () => {
    if (!id || !currentTenantId) return;
    const { data, error } = await supabase
      .from('client_payments')
      .select('*')
      .eq('client_id', id)
      .eq('tenant_id', currentTenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { console.error('client_payments fetch error:', error); return; }
    if (!data) return;
    const userIds = [...new Set(data.map(p => p.recorded_by).filter(Boolean))];
    let nameMap = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', userIds);
      if (profiles) profiles.forEach(p => { nameMap[p.id] = p.name; });
    }
    setPaymentHistory(data.map(p => ({ ...p, collector: p.recorded_by ? { name: nameMap[p.recorded_by] || null } : null })));
  }, [id, currentTenantId]);
  useEffect(() => { loadHistory(); }, [loadHistory, success]); // refetch after successful payment

  // Ledger rows for this client's sales. Fetched by the sale ids already in
  // scope rather than by client, because account_transactions has no client
  // column — it references the sale. Kept separate from the payment-history
  // effect so a failure here degrades to the old single-credit behaviour
  // (buildClientStatement falls back) instead of emptying the statement.
  useEffect(() => {
    if (!id || !currentTenantId) { setSaleReceipts([]); return; }
    const saleIds = (sales || [])
      .filter(s => String(s.shopId ?? s.clientId ?? '') === String(id))
      .map(s => s.id)
      .filter(Boolean);
    if (!saleIds.length) { setSaleReceipts([]); return; }
    let alive = true;
    supabase
      .from('account_transactions')
      .select('id, tenant_id, date, amount, mode, ref_type, ref_id, note')
      .eq('tenant_id', currentTenantId)
      .eq('ref_type', 'SALE')
      .in('ref_id', saleIds)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error('sale receipts fetch error:', error); setSaleReceipts([]); return; }
        setSaleReceipts(data || []);
      });
    return () => { alive = false; };
  }, [id, currentTenantId, sales, success]);

  // Full statement ledger (src/lib/clientStatement.js). includeSettled: a paid
  // bill enters as a debit AND its payment, so the closing balance is unchanged.
  const statementRows = useMemo(
    () => buildClientStatement({ client, sales, invoices, paymentHistory, saleReceipts, includeSettled: true }),
    [client, sales, invoices, paymentHistory, saleReceipts]);

  // ── Period window, as before: a window plus a brought-forward row ──
  const rangeStart = useMemo(() => rangeStartFor(range, today), [range, today]);
  const win = useMemo(() => ledgerWindow(statementRows, rangeStart), [statementRows, rangeStart]);
  const ledgerInRange = win.inRange;
  const ledgerHiddenBefore = win.hiddenBefore;
  const ledgerOpening = win.opening;

  const ledgerFiltered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return ledgerInRange.filter(r => {
      if (rowKind === 'SALE'    && r.type === 'PAYMENT') return false;
      if (rowKind === 'PAYMENT' && r.type !== 'PAYMENT') return false;
      if (!q) return true;
      return `${r.description} ${r.id}`.toLowerCase().includes(q);
    });
  }, [ledgerInRange, rowKind, searchTerm]);

  const ledgerRowsView = useMemo(
    () => (newestFirst ? [...ledgerFiltered].reverse() : ledgerFiltered),
    [ledgerFiltered, newestFirst]);

  // On a filtered view the last column is a running total of the rows shown,
  // not a balance (see runningTotalOfShown).
  const { byId: runningShown, total: shownTotal } = useMemo(
    () => runningTotalOfShown(ledgerFiltered, rowKind),
    [ledgerFiltered, rowKind]);

  // Closing is always across all history.
  const ledgerClosing = win.closing;
  const ledgerTotals = { debit: win.debit, credit: win.credit };

  // Bills not fully paid, as today's "Unpaid" count.
  const clientInvoices = useMemo(() => {
    if (!client) return [];
    const invRows = (invoices || [])
      .filter(inv => inv.client_id === client.id && inv.payment_status !== 'PAID');
    const invoicedSaleIds = new Set(invRows.map(i => i.sale_id).filter(Boolean));
    const saleRows = (sales || [])
      .filter(s => String(s.shopId) === String(client.id) || String(s.clientId) === String(client.id))
      .filter(s => (s.paymentMethod || '').toUpperCase() !== 'CREDIT')
      .filter(s => ['PARTIAL', 'UNPAID', 'PENDING'].includes((s.paymentStatus || s.status || '').toUpperCase()))
      .filter(s => !invoicedSaleIds.has(s.id))
      .filter(s => !s.deleted_at);
    return [...invRows, ...saleRows];
  }, [client, invoices, sales]);

  const facts = useMemo(() => (client ? clientFacts([client], sales, paymentHistory)[client.id] : null), [client, sales, paymentHistory]);
  const summary = useMemo(() => (client ? clientSummary(sales, client.id, today) : null), [sales, client, today]);

  const canEdit = hasPermission('clients', 'edit') !== false;

  const startSubmit = (e) => {
    e?.preventDefault();
    if (!client) return;
    setPaymentError('');
    setPaymentFailure(null);
    const amt = parseFloat(paymentData.amount);
    if (isNaN(amt) || amt <= 0) { setPaymentError('Enter a valid payment amount.'); return; }
    // Explicit confirmation before money is recorded (was window.confirm).
    setConfirming(true);
  };

  const handleSubmit = async () => {
    if (!client || inFlight.current) return;
    const amt = parseFloat(paymentData.amount);
    if (isNaN(amt) || amt <= 0) { setPaymentError('Enter a valid payment amount.'); setConfirming(false); return; }
    inFlight.current = true;
    setIsSubmitting(true);
    try {
      // No invoice ids: settle_client_payment allocates FIFO across the oldest
      // unpaid bills server-side.
      const res = await recordClientPayment(client.id, amt, paymentData.date, paymentData.notes, [], paymentData.paymentMethod);
      if (res?.success === false) {
        setPaymentFailure(res.error || 'The server gave no reason.');
      } else {
        // Money-received posting to Cash & Bank happens in the DB
        // (trg_client_payments_post_ledger on client_payments).
        setSuccess(true);
        setTimeout(() => navigate(-1), 1200);
      }
    } catch (err) {
      console.error('[clients] record payment failed:', err);
      setPaymentFailure(err);
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
      setConfirming(false);
    }
  };

  if (loading) return <PageSkeleton cards={3} rows={8} />;

  if (!client) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-12 text-center">
        <div className="mx-auto mb-3.5 grid h-12 w-12 place-items-center rounded-[14px] bg-bad-soft text-bad-text"><AlertCircle size={22} /></div>
        <h2 className="font-tight text-[18px] font-semibold">Client not found</h2>
        <p className="mb-5 mt-1 text-[13.5px] text-body">This client record may have been deleted.</p>
        <Button variant="secondary" onClick={() => navigate(-1)}>Back to Clients</Button>
      </div>
    );
  }

  if (editing) {
    return (
      <ClientForm client={client} addClient={addClient} updateClient={updateClient} onCancel={() => setEditing(false)} onReread={refetch}
        onSaved={() => { addNotification('Changes saved.', 'success'); setEditing(false); }} />
    );
  }

  // DB-maintained outstanding_balance (kept accurate by triggers), so this
  // matches the client list.
  const outstanding = Number(client?.outstanding_balance) || 0;
  const oldestAge = outstanding > 0 ? daysSince(facts?.oldestUnpaid) : null;
  const reminderRow = { ...client, _out: outstanding, _facts: facts };
  const amt = parseFloat(paymentData.amount);
  const unconfirmed = paymentFailure && classifyWriteFailure(paymentFailure).maySaved;
  const th = 'px-3 py-2.5 text-left font-tight text-[12px] font-semibold text-mute border-b border-line whitespace-nowrap';
  const td = 'px-3 py-2.5 border-b border-sep align-middle';
  const methodOf = (rid) => {
    const h = paymentHistory.find(x => x.id === rid);
    return h ? (METHOD_LABEL[String(h.payment_method || 'CASH').toUpperCase()] || h.payment_method) : '';
  };

  return (
    <div className="flex flex-col pb-16">
      {/* ── Header ── */}
      <div className="m-rise mb-4 flex flex-wrap items-start gap-3.5" style={{ '--i': 0 }}>
        <div className="min-w-0">
          <button type="button" onClick={() => navigate(-1)} className="m-press inline-flex items-center gap-1 font-tight text-[13px] font-semibold text-body hover:text-ink">
            <ChevronLeft size={15} /> Clients
          </button>
          <h3 className="mt-2 flex flex-wrap items-center gap-2 font-tight text-[22px] font-semibold tracking-[-0.02em]">
            {client.name}
            {(client.gstin || client.gst_no) && <Pill className="font-semibold tabular-nums">{client.gstin || client.gst_no}</Pill>}
          </h3>
          <p className="mt-0.5 text-[13px] text-body">{[client.contact, client.phone, client.address].filter(Boolean).join(' · ') || 'No contact on file'}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {outstanding > 0 && <Button variant="secondary" onClick={() => setReminding(true)}><MessageCircle /> Remind</Button>}
          <Button variant="secondary" onClick={() => setViewing(true)}><FileText /> Statement</Button>
          {canEdit && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
        </div>
      </div>

      <SummaryStrip summary={summary} cur={cur} className="m-rise mb-[18px]" />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        {/* ── The statement ── */}
        <section className="m-rise min-w-0 overflow-hidden rounded-[14px] border border-line bg-surface" style={{ '--i': 2 }}>
          <div className="flex flex-wrap items-center gap-2 border-b border-sep p-3">
            <label className="relative w-[220px] max-w-full">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search bill or note" className="h-8 pl-8 text-[12.5px]" aria-label="Search the statement" />
            </label>
            <Seg value={range} onChange={setRange} options={RANGES} ariaLabel="Period" />
            <Seg value={rowKind} onChange={setRowKind} options={[['ALL', 'All'], ['SALE', 'Bills'], ['PAYMENT', 'Payments']]} ariaLabel="Show" />
            <button type="button" onClick={() => setNewestFirst(v => !v)}
              className="m-press h-7 rounded-pill px-3 font-tight text-[12.5px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
              {newestFirst ? 'Newest first' : 'Oldest first'}
            </button>
            <span className="text-[12px] text-mute">
              {ledgerRowsView.length} {ledgerRowsView.length === 1 ? 'row' : 'rows'}
              {rowKind !== 'ALL' && ` · ${rowKind === 'PAYMENT' ? 'payments only' : 'bills only'} · owed today ${money(ledgerClosing, cur)}`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] text-ink">
              <thead>
                <tr>
                  <th className={th}>Date</th><th className={th}>Type</th><th className={th}>Reference</th>
                  <th className={cn(th, 'text-right')}>Billed</th><th className={cn(th, 'text-right')}>Received</th>
                  <th className={cn(th, 'text-right')}>{rowKind === 'ALL' ? 'Balance' : rowKind === 'PAYMENT' ? 'Paid so far' : 'Billed so far'}</th>
                </tr>
              </thead>
              <tbody>
                {ledgerHiddenBefore > 0 && !newestFirst && rowKind === 'ALL' && (
                  <BroughtForward date={rangeStart} hidden={ledgerHiddenBefore} amount={ledgerOpening} cur={cur} td={td} />
                )}

                {ledgerRowsView.length === 0 ? (
                  <tr><td colSpan="6" className="py-16 text-center">
                    <div className="font-tight text-[14px] font-semibold">Nothing to show</div>
                    <div className="mt-1 text-[12.5px] text-mute">
                      {statementRows.length === 0 ? 'No bills or payments recorded yet.' : 'Try a wider period or another filter.'}
                    </div>
                  </td></tr>
                ) : ledgerRowsView.map(r => {
                  const isPay = r.type === 'PAYMENT';
                  const items = r.items || [];
                  const canOpen = !isPay && items.length > 0;
                  const open = expandedRow === r.id;
                  const ownReceipt = isPay && paymentHistory.some(h => h.id === r.id);
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={cn(canOpen && 'cursor-pointer', '[&>td]:transition-colors hover:[&>td]:bg-tile', open && '[&>td]:bg-tile')}
                        onClick={() => canOpen && setExpandedRow(open ? null : r.id)}>
                        <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{formatDate(r.date)}</td>
                        <td className={td}>{isPay ? <Pill tone="good">Payment</Pill> : <Pill>{r.type === 'INVOICE' ? 'Invoice' : 'Sale'}</Pill>}</td>
                        <td className={td}>
                          <div className="flex min-w-0 items-center gap-2">
                            {canOpen && <ChevronRight size={13} className={cn('shrink-0 text-mute transition-transform', open && 'rotate-90')} />}
                            <span className="max-w-[240px] truncate">{r.description}</span>
                            {items.length > 0 && <Pill small>{items.length} item{items.length === 1 ? '' : 's'}</Pill>}
                            {ownReceipt && canEdit && (
                              <button type="button" title="Edit this payment" aria-label="Edit this payment"
                                onClick={(e) => { e.stopPropagation(); setEditTarget({ id: r.id, amount: r.credit, date: r.date, method: methodOf(r.id) }); }}
                                className="m-press grid h-6 w-6 shrink-0 place-items-center rounded-xl text-mute hover:bg-well hover:text-ink">
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className={cn(td, 'text-right tabular-nums')}>{r.debit > 0 ? money(r.debit, cur) : <span className="text-faint">none</span>}</td>
                        <td className={cn(td, 'text-right tabular-nums text-good-text')}>{r.credit > 0 ? money(r.credit, cur) : <span className="text-faint">none</span>}</td>
                        <td className={cn(td, 'text-right font-tight font-semibold tabular-nums', rowKind !== 'ALL' && 'text-mute')}>
                          {rowKind === 'ALL' ? money(r.balance, cur) : money(runningShown.get(r.id) || 0, cur)}
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan="6" className="border-b border-sep bg-tile px-5 py-3">
                            <Eyebrow className="mb-2">Products on this bill</Eyebrow>
                            {items.map((it, i) => {
                              const qty = Number(it.quantity) || 0;
                              const rate = Number(it.rate) || 0;
                              return (
                                <div key={`${r.id}-${it.id || i}`} className="grid grid-cols-[1fr_auto_auto] gap-4 border-t border-sep py-1.5 text-[12.5px] first:border-0">
                                  <span>{it.name || '—'}</span>
                                  <span className="text-right tabular-nums text-mute">{qty} × {money(rate, cur)}</span>
                                  <span className="w-20 text-right font-medium tabular-nums">{money(qty * rate, cur)}</span>
                                </div>
                              );
                            })}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {ledgerHiddenBefore > 0 && newestFirst && ledgerRowsView.length > 0 && rowKind === 'ALL' && (
                  <BroughtForward date={rangeStart} hidden={ledgerHiddenBefore} amount={ledgerOpening} cur={cur} td={td} />
                )}
              </tbody>

              {statementRows.length > 0 && rowKind !== 'ALL' && !searchTerm.trim() && (
                <tfoot>
                  <tr className="font-tight text-[13px] font-semibold tabular-nums">
                    <td colSpan="3" className="border-t border-line px-3 py-3">
                      {rowKind === 'PAYMENT' ? 'Total received' : 'Total billed'}
                      <small className="ml-2 font-sans text-[12px] font-medium text-mute">
                        {ledgerRowsView.length} {ledgerRowsView.length === 1 ? 'entry' : 'entries'}{rangeStart ? ` from ${formatDate(rangeStart)}` : ', all time'}
                      </small>
                    </td>
                    <td className="border-t border-line px-3 py-3 text-right">{rowKind === 'SALE' ? money(shownTotal, cur) : ''}</td>
                    <td className="border-t border-line px-3 py-3 text-right text-good-text">{rowKind === 'PAYMENT' ? money(shownTotal, cur) : ''}</td>
                    <td className="border-t border-line px-3 py-3 text-right">{money(shownTotal, cur)}</td>
                  </tr>
                </tfoot>
              )}
              {statementRows.length > 0 && rowKind === 'ALL' && !searchTerm.trim() && (
                <tfoot>
                  <tr className="font-tight text-[13px] font-semibold tabular-nums">
                    <td colSpan="3" className="border-t border-line px-3 py-3">
                      Closing balance
                      {ledgerHiddenBefore > 0 && <small className="ml-2 font-sans text-[12px] font-medium text-mute">billed and received cover {formatDate(rangeStart)} onwards</small>}
                    </td>
                    <td className="border-t border-line px-3 py-3 text-right text-body">{money(ledgerTotals.debit, cur)}</td>
                    <td className="border-t border-line px-3 py-3 text-right text-body">{money(ledgerTotals.credit, cur)}</td>
                    <td className={cn('border-t border-line px-3 py-3 text-right', ledgerClosing > 0.01 ? 'text-bad-text' : 'text-good-text')}>{money(ledgerClosing, cur)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        {/* ── Owes you + Record a payment ── */}
        <div className="grid gap-3">
          <div className="m-rise rounded-[14px] border border-line bg-surface px-[18px] py-4" style={{ '--i': 2 }}>
            <Eyebrow>{outstanding < 0 ? 'Advance' : 'Owes you'}</Eyebrow>
            <b className={cn('mt-1.5 block font-tight text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] tabular-nums', outstanding > 0 ? 'text-bad-text' : 'text-good-text')}>
              {money(Math.abs(outstanding), cur, { paise: 'always' })}
            </b>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              <dt className="text-mute">Bills not fully paid</dt><dd className="m-0 text-right font-medium text-ink-2">{clientInvoices.length}</dd>
              <dt className="text-mute">Oldest bill</dt><dd className="m-0 text-right font-medium text-ink-2">{oldestAge != null ? ageWords(oldestAge) : 'none'}</dd>
              <dt className="text-mute">Credit</dt><dd className="m-0 text-right font-medium text-ink-2">{creditWords(client, cur)}</dd>
            </dl>
          </div>

          <form onSubmit={startSubmit} className="m-rise rounded-[14px] border border-line bg-surface px-[18px] py-4" style={{ '--i': 3 }}>
            <h3 className="font-tight text-[14.5px] font-semibold">Record a payment</h3>
            <div className="mt-3 grid gap-3">
              <label className="block">
                <span className="mb-[5px] block text-[12px] font-medium text-ink-2">Date</span>
                <Input required type="date" value={paymentData.date} disabled={confirming}
                  onChange={e => setPaymentData({ ...paymentData, date: e.target.value })} />
              </label>
              <div>
                <div className="mb-[5px] flex items-center justify-between">
                  <label htmlFor="acct-amount" className="text-[12px] font-medium text-ink-2">Amount</label>
                  {outstanding > 0 && !confirming && (
                    <button type="button" onClick={() => setPaymentData({ ...paymentData, amount: outstanding.toString() })}
                      className="font-tight text-[12.5px] font-semibold text-amber-text hover:underline underline-offset-4">
                      Fill {money(outstanding, cur)}
                    </button>
                  )}
                </div>
                <div className="flex h-[52px] items-center gap-2 rounded-xl px-4 shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
                  <span className="font-tight text-[20px] text-mute">{cur}</span>
                  <input id="acct-amount" required type="number" step="0.01" placeholder="0" value={paymentData.amount} disabled={confirming}
                    onChange={e => setPaymentData({ ...paymentData, amount: e.target.value })}
                    className="w-full bg-transparent font-tight text-[26px] font-semibold tracking-[-0.02em] tabular-nums outline-none placeholder:text-faint" />
                </div>
              </div>
              <div>
                <span className="mb-[5px] block text-[12px] font-medium text-ink-2">Paid by</span>
                <Seg value={paymentData.paymentMethod} onChange={(v) => !confirming && setPaymentData({ ...paymentData, paymentMethod: v })} options={METHODS} ariaLabel="Paid by" />
              </div>
              <label className="block">
                <span className="mb-[5px] block text-[12px] font-medium text-ink-2">Notes</span>
                <Input value={paymentData.notes} disabled={confirming} placeholder="Cheque number or reference"
                  onChange={e => setPaymentData({ ...paymentData, notes: e.target.value })} />
              </label>
            </div>
            <p className="mt-2.5 text-[12px] text-mute">Goes to the oldest bills first, as today.</p>
            {paymentError && <p role="alert" className="mt-3 rounded-[10px] bg-bad-soft px-3 py-2 text-[12.5px] text-bad-text">{paymentError}</p>}
            <WriteFailure error={paymentFailure} noun="payment" className="mt-3"
              onReread={async () => { await Promise.all([refetch(), refetchSales?.(), loadHistory()]); setPaymentFailure(null); }} />
            {success && <p role="status" className="mt-3 rounded-[10px] bg-good-soft px-3 py-2 text-[12.5px] font-semibold text-good-text">Payment recorded.</p>}
            {confirming ? (
              <div className="mt-3 rounded-xl bg-amber-soft px-3.5 py-3">
                <Eyebrow className="text-amber-text">Confirm payment</Eyebrow>
                <b className="mt-0.5 block font-tight text-[15px] font-semibold tabular-nums">{money(amt, cur, { paise: 'always' })} by {METHOD_LABEL[paymentData.paymentMethod] || paymentData.paymentMethod}</b>
                <small className="text-[12.5px] text-body">from {client.name}, dated {formatDate(paymentData.date)}</small>
                <div className="mt-2.5 flex gap-2">
                  <Button variant="secondary" onClick={() => setConfirming(false)} disabled={isSubmitting} className="bg-surface">Edit</Button>
                  <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">{isSubmitting ? 'Saving…' : `Confirm ${money(amt, cur)}`}</Button>
                </div>
              </div>
            ) : (
              <Button type="submit" size="lg" className="mt-3 w-full"
                disabled={isSubmitting || !hasPermission('clients', 'edit') || success || unconfirmed}>
                {Number.isFinite(amt) && amt > 0 ? `Record ${money(amt, cur)}` : 'Record payment'}
              </Button>
            )}
          </form>
        </div>
      </div>

      {reminding && (
        <ReminderDialog client={reminderRow} cur={cur}
          shopName={businessProfile?.businessName || businessProfile?.name || ''} upi={businessProfile?.upi_id || ''}
          onClose={() => setReminding(false)} />
      )}

      <StatementViewer open={viewing} client={client} business={businessProfile || {}} rows={statementRows} today={today}
        initialRange={range} cur={cur} onClose={() => setViewing(false)} />

      {/* Editing a receipt updates it in place and replays the client's
          allocations, so the outstanding balance follows without the receipt
          disappearing from the statement. */}
      <EditPaymentDialog target={editTarget} clientName={client.name} cur={cur}
        editClientPayment={editClientPayment} deleteClientPayment={deleteClientPayment}
        onClose={() => setEditTarget(null)}
        onReread={async () => { await Promise.all([refetch(), loadHistory()]); }}
        onDone={(noun) => {
          setEditTarget(null);
          loadHistory();
          addNotification(noun === 'delete' ? 'Payment deleted. The balance was worked out again.' : 'Payment changed. The balance was worked out again.', 'success');
        }} />
    </div>
  );
};

const BroughtForward = ({ date, hidden, amount, cur, td }) => (
  <tr className="bg-tile">
    <td className={cn(td, 'whitespace-nowrap tabular-nums text-body')}>{formatDate(date)}</td>
    <td colSpan="4" className={cn(td, 'text-body')}>
      Balance brought forward
      <small className="ml-2 text-[12px] text-mute">{hidden} earlier {hidden === 1 ? 'entry' : 'entries'} not shown</small>
    </td>
    <td className={cn(td, 'text-right font-tight font-semibold tabular-nums')}>{money(amount, cur)}</td>
  </tr>
);

export default ClientSettlement;
