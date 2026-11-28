import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BellRing, Share2, Printer, ChevronDown, CheckCircle2, ReceiptText, FileText, Wallet,
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { useSales } from '../../hooks/useSales';
import { usePeople } from '../../hooks/usePeople';
import { supabase } from '../../lib/supabase';
import { shareToWhatsApp } from '../../lib/gstEngine';
import { formatCurrency, formatDate, todayISOInAppTZ } from '../../lib/utils';
import { resolveInvoiceStatus, invoiceOutstanding, dueWords, paymentCheck } from '../../lib/invoiceList';
import { paymentsSummary, buildTimeline, creditTermsDays, collectedShare, whenWords } from '../../lib/invoiceDetail';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/States';
import { RowMenu, MenuItem } from '../../components/ui/RowMenu';
import { Seg, Switch } from '../../components/documents/DocParts';
import InvoiceStatusPills from '../../components/invoices/InvoiceStatusPills';
import RecordPaymentDialog from '../../components/invoices/RecordPaymentDialog';
import WriteFailure from '../../components/invoices/WriteFailure';
import ScaledSheet from '../../components/invoices/ScaledSheet';
import { useInvoiceActions } from '../../components/invoices/useInvoiceActions';
import InvoiceTemplate from '../../components/invoice/InvoiceTemplate';
import POSReceipt from '../../components/invoice/POSReceipt';
import EwayBillModal from '../../components/sales/EwayBillModal';

/**
 * One invoice, as a page (approved mockup invoices-17).
 *
 * Total, paid and balance strip; the actions; the document itself as it will
 * print; payments; more actions; activity; details. Every action is one the
 * Invoices page already had (lib/invoiceList, useInvoiceActions). The
 * activity shows only events that are stored (lib/invoiceDetail).
 */

const Eyebrow = ({ children, className = '' }) => (
  <span className={`block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute ${className}`}>{children}</span>
);

const Kpi = ({ label, value, sub, tone = 'text-ink', hi = false, children }) => (
  <div className={`min-w-0 px-[18px] py-3.5 [&+&]:border-l border-line ${hi ? 'bg-amber-soft' : ''}`}>
    <Eyebrow>{label}</Eyebrow>
    <b className={`mt-1.5 mb-[3px] block font-tight text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] tabular-nums ${tone}`}>{value}</b>
    {sub && <small className="block text-[12.5px] text-body">{sub}</small>}
    {children}
  </div>
);

const InvoiceDetail = () => {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { currentTenantId, businessProfile, currentTenant } = useTenant();
  const { addNotification } = useNotifications();
  const { invoices, salesReturns = [], loading, markInvoicePaid, enqueueIrn, refetch } = useSales(currentTenantId, { plan: currentTenant?.plan || 'STARTER' });
  const { clients = [], users: staff = [] } = usePeople(currentTenantId);
  const actions = useInvoiceActions({ markInvoicePaid, enqueueIrn, refetch, businessProfile, notify: addNotification });

  const inv = useMemo(() => (invoices || []).find((i) => String(i.id) === String(invoiceId)) || null, [invoices, invoiceId]);
  const client = useMemo(() => (inv ? (clients.find((c) => c.id === inv.client_id) || { name: inv.client_name || 'Walk-in' }) : null), [inv, clients]);

  // Receipts against the invoice's sale, as the ledger stores them.
  const [receipts, setReceipts] = useState({ rows: [], loaded: false, error: null });
  useEffect(() => {
    const saleId = inv?.sale_id;
    if (!saleId || !currentTenantId) { setReceipts({ rows: [], loaded: true, error: null }); return undefined; }
    let alive = true;
    supabase.from('account_transactions').select('*')
      .eq('tenant_id', currentTenantId).eq('ref_type', 'SALE').eq('ref_id', saleId)
      .then(({ data, error }) => {
        if (!alive) return;
        setReceipts({ rows: data || [], loaded: true, error: error || null });
      });
    return () => { alive = false; };
  }, [inv?.sale_id, inv?.paid_amount, currentTenantId]);

  const [view, setView] = useState('a4');           // document preview: a4 | pos
  const [printing, setPrinting] = useState(null);   // null | 'a4' | 'pos'
  const [payOpen, setPayOpen] = useState(false);
  const [ewayOpen, setEwayOpen] = useState(false);
  const [quick, setQuick] = useState('full');        // record-a-payment card: full | other
  const [other, setOther] = useState('');
  const [cardBusy, setCardBusy] = useState(false);
  const [cardErr, setCardErr] = useState(null);

  if (!inv) {
    return (
      <div className="pb-16">
        <BackLink onClick={() => navigate('/invoices')} />
        {loading ? (
          <div className="mt-3 space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-24 w-full" /><Skeleton className="h-[420px] w-full" /></div>
        ) : (
          <div className="mt-10 text-center text-[13px] text-body">
            <b className="mb-1 block font-tight text-[15px] font-semibold text-ink">This invoice is not here</b>
            It may have been deleted, or it belongs to another shop.
          </div>
        )}
      </div>
    );
  }

  const today = todayISOInAppTZ();
  const status = resolveInvoiceStatus(inv);
  const unpaid = status !== 'PAID';
  const out = invoiceOutstanding(inv);
  const total = Number(inv.grand_total) || 0;
  const items = Array.isArray(inv.items) ? inv.items : [];
  const pays = paymentsSummary(receipts.rows, inv);
  const share = collectedShare(inv);
  const terms = creditTermsDays(inv);
  const returns = salesReturns.filter((r) => (inv.sale_id && r.sale_id === inv.sale_id) || r.invoice_id === inv.id);
  const timeline = buildTimeline({ invoice: inv, payments: receipts.rows, returns, money: formatCurrency });
  const dueLine = inv.due_date ? `due ${formatDate(inv.due_date)}${unpaid ? `, ${dueWords(inv.due_date, today)}` : ''}` : null;
  const creator = inv.created_by ? (staff.find((u) => u.id === inv.created_by)?.name || null) : null;

  // The client's total across all their bills, when it differs from this one.
  const clientTotal = Number(client?.outstanding_balance) || 0;
  const clientBills = (invoices || []).filter((i) => i.client_id === inv.client_id && !i.deleted_at && (i.payment_status || '').toUpperCase() !== 'PAID').length;
  const showAccount = inv.client_id && clientTotal > 0 && Math.abs(clientTotal - out) >= 0.5;

  const quickAmount = quick === 'full' ? String(out) : other;
  const cardCheck = paymentCheck(inv, quickAmount);
  const submitCard = async () => {
    if (!cardCheck.ok || cardBusy) return;
    setCardBusy(true); setCardErr(null);
    const res = await actions.recordPayment(inv, cardCheck.amount);
    setCardBusy(false);
    if (res?.error) { setCardErr(res.error); return; }
    setOther(''); setQuick('full');
  };

  const openPrint = (mode) => setPrinting(mode);
  const goClient = () => inv.client_id && navigate(`/clients/settle/${inv.client_id}`);

  return (
    <div className="flex flex-col pb-16">
      {/* Header */}
      <div className="m-rise mb-4 flex flex-wrap items-start gap-3.5">
        <div className="min-w-0">
          <BackLink onClick={() => navigate('/invoices')} />
          <h3 className="mt-2 flex flex-wrap items-center gap-2 font-tight text-[24px] font-semibold tracking-[-0.02em] text-ink">
            {inv.invoice_number || 'Invoice'}
            <InvoiceStatusPills inv={inv} status={status} showEway={false} className="flex flex-wrap gap-1 tracking-normal" />
          </h3>
          <p className="mt-1 text-[13px] text-body">
            {inv.client_id
              ? <button type="button" onClick={goClient} className="font-tight font-semibold text-amber-text hover:underline underline-offset-4">{client?.name}</button>
              : <span>{client?.name}</span>}
            {' · '}Invoice · issued {formatDate(inv.invoice_date)}{dueLine ? ` · ${dueLine}` : ''}
          </p>
        </div>
        <div className="ml-auto mt-1 flex flex-wrap items-center gap-2">
          {unpaid && <Button variant="secondary" onClick={() => actions.remind(inv, client)} title="Send payment reminder (SMS/WhatsApp)"><BellRing /> Remind</Button>}
          <Button variant="secondary" onClick={() => shareToWhatsApp(inv, client, businessProfile)}><Share2 /> Share</Button>
          <div className="inline-flex gap-px">
            <Button variant="secondary" className="rounded-r-none pr-3" onClick={() => openPrint(view)}><Printer /> Print</Button>
            <RowMenu label="Print options" width={200} trigger={({ ref, onClick, open }) => (
              <Button ref={ref} variant="secondary" className="rounded-l-none px-2.5" aria-label="Print options" aria-haspopup="menu" aria-expanded={open} onClick={onClick}>
                <ChevronDown />
              </Button>
            )}>
              {(close) => (
                <>
                  <MenuItem icon={FileText} onClick={() => { close(); openPrint('a4'); }}>Invoice A4</MenuItem>
                  <MenuItem icon={ReceiptText} onClick={() => { close(); openPrint('pos'); }}>POS receipt</MenuItem>
                </>
              )}
            </RowMenu>
          </div>
          {unpaid && <Button onClick={() => setPayOpen(true)}>Record payment</Button>}
        </div>
      </div>

      {/* Total / paid / balance */}
      <div className="m-rise mb-[18px] grid grid-cols-2 overflow-hidden rounded-[14px] border border-line lg:grid-cols-4" style={{ '--i': 1 }}>
        <Kpi label="Invoice total" value={formatCurrency(total)}
          sub={[items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : null, Number(inv.tax_total) > 0 ? `tax ${formatCurrency(inv.tax_total)}` : null].filter(Boolean).join(' · ') || null} />
        <Kpi label="Paid" value={formatCurrency(inv.paid_amount)} tone="text-good-text"
          sub={pays.count ? `${pays.count} payment${pays.count === 1 ? '' : 's'}${pays.last?.when ? `, last ${whenWords(String(pays.last.date || pays.last.when).slice(0, 10))}` : ''}`
            : Number(inv.paid_amount) > 0 ? 'recorded on the invoice' : 'nothing paid yet'} />
        <Kpi label="Balance due" value={formatCurrency(out)} tone={unpaid ? 'text-amber-text' : 'text-ink'} hi={unpaid}
          sub={unpaid ? (inv.due_date ? `Due ${formatDate(inv.due_date)} · ${dueWords(inv.due_date, today)}` : 'No due date') : 'Paid in full'} />
        <Kpi label="Collected" value={`${Math.round(share)}%`}>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-pill bg-well" aria-hidden="true">
            <i className="block h-full rounded-pill bg-good" style={{ width: `${share}%` }} />
          </div>
        </Kpi>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* The document, as it will print */}
        <div className="m-rise min-w-0 rounded-[14px] bg-tile px-4 pt-3.5 pb-[18px]" style={{ '--i': 2 }}>
          <div className="mb-3.5 flex flex-wrap items-center gap-3">
            <Seg value={view} onChange={setView} ariaLabel="Document" className="bg-surface"
              options={[['a4', 'Invoice A4'], ['pos', 'POS receipt']]} />
            {view === 'a4' && (
              <span className="text-[12.5px] text-body">
                Print settings · <button type="button" onClick={() => navigate('/settings?tab=print')} className="font-tight font-semibold text-amber-text hover:underline underline-offset-4">Change</button>
              </span>
            )}
          </div>
          {view === 'a4' ? (
            <ScaledSheet>
              <InvoiceTemplate previewMode invoice={inv} businessProfile={businessProfile} client={client} onClose={() => {}} />
            </ScaledSheet>
          ) : (
            <div className="flex justify-center">
              <div className="bg-white shadow-[0_14px_34px_-20px_rgba(17,20,24,0.4)]">
                <POSReceipt bare invoice={inv} businessProfile={businessProfile} client={client} onClose={() => {}} />
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3">
          {unpaid && (
            <Card className="m-rise !px-[18px] !py-4" style={{ '--i': 3 }}>
              <h3 className="mb-1.5 font-tight text-[14.5px] font-semibold">Record a payment</h3>
              <div className="mt-2 flex gap-1.5">
                {[['full', `Full balance ${formatCurrency(out)}`], ['other', 'Other amount']].map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={quick === k} onClick={() => setQuick(k)}
                    className={`m-press rounded-pill px-3 py-1.5 font-tight text-[12.5px] font-semibold ${quick === k ? 'bg-ink text-white' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <label className="flex h-10 flex-1 items-center gap-1.5 rounded-[10px] px-3 shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
                  <span className="text-mute">₹</span>
                  <input type="number" min="0" step="0.01" aria-label="Amount to collect"
                    value={quickAmount} readOnly={quick === 'full'}
                    onChange={(e) => setOther(e.target.value)}
                    onFocus={() => { if (quick === 'full') { setQuick('other'); setOther(String(out)); } }}
                    className="w-full bg-transparent font-tight text-[13.5px] font-semibold tabular-nums text-ink outline-none" />
                </label>
                <Button onClick={submitCard} disabled={!cardCheck.ok || cardBusy}>{cardBusy ? 'Saving…' : 'Record payment'}</Button>
              </div>
              {!cardCheck.ok && quickAmount !== '' && <p className="mt-2 text-[12.5px] text-bad-text">{cardCheck.error}</p>}
              <WriteFailure error={cardErr} noun="payment" onReread={() => { setCardErr(null); refetch?.(); }} className="mt-2.5" />
              {showAccount && (
                <div className="mt-3 flex justify-between gap-2 border-t border-sep pt-2.5 text-[12px] text-mute">
                  <span>{client?.name}, total outstanding</span>
                  <button type="button" onClick={goClient} className="font-tight font-semibold tabular-nums text-amber-text hover:underline underline-offset-4">
                    {formatCurrency(clientTotal)}{clientBills > 1 ? ` · ${clientBills} bills` : ''}
                  </button>
                </div>
              )}
            </Card>
          )}

          <Card className="m-rise !px-[18px] !py-4" style={{ '--i': 4 }}>
            <div className="mb-1.5 flex items-center gap-2">
              <h3 className="font-tight text-[14.5px] font-semibold">Payments</h3>
              {pays.count > 0 && <span className="rounded-pill bg-well px-[7px] font-tight text-[11px] font-semibold tabular-nums">{pays.count}</span>}
            </div>
            {receipts.error && <p className="text-[12.5px] text-bad-text">Could not read the payments: {receipts.error.message}</p>}
            {!receipts.error && pays.list.length === 0 && !pays.recordedOnly && (
              <p className="py-1.5 text-[12.5px] text-mute">{receipts.loaded ? 'No payments yet.' : 'Loading…'}</p>
            )}
            {pays.list.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 border-t border-sep py-[9px] first-of-type:border-t-0">
                <span className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] ${p.in ? 'bg-good-soft text-good-text' : 'bg-well text-body'}`}><Wallet size={16} /></span>
                <div className="min-w-0 flex-1">
                  <b className="block font-tight text-[13.5px] font-semibold">{p.in ? p.mode : `${p.mode}, paid back`}</b>
                  <small className="block truncate text-[12px] text-mute">{[whenWords(p.when), p.note].filter(Boolean).join(' · ')}</small>
                </div>
                <b className={`font-tight text-[13.5px] font-semibold tabular-nums ${p.in ? 'text-good-text' : 'text-ink'}`}>{p.in ? '' : '−'}{formatCurrency(p.amount)}</b>
              </div>
            ))}
            {pays.recordedOnly > 0 && (
              <div className="flex items-center gap-2.5 border-t border-sep py-[9px] first-of-type:border-t-0">
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-well text-body"><CheckCircle2 size={16} /></span>
                <div className="min-w-0 flex-1">
                  <b className="block font-tight text-[13.5px] font-semibold">Recorded on the invoice</b>
                  <small className="block text-[12px] text-mute">No receipt entry in the books for this part</small>
                </div>
                <b className="font-tight text-[13.5px] font-semibold tabular-nums text-good-text">{formatCurrency(pays.recordedOnly)}</b>
              </div>
            )}
          </Card>

          <Card className="m-rise !px-[18px] !py-4" style={{ '--i': 5 }}>
            <Eyebrow className="mb-1">More actions</Eyebrow>
            <ActionLink icon={ReceiptText} hint="Return or price change"
              onClick={() => navigate(`/documents/new?type=CREDIT_NOTE${inv.client_id ? `&client=${encodeURIComponent(inv.client_id)}` : ''}`, { state: { from: inv.invoice_number || 'Invoice' } })}>
              Issue credit note
            </ActionLink>
            <ActionLink icon={FileText} hint={inv.eway_no ? 'Saved' : null} onClick={() => setEwayOpen(true)}>e-Way bill</ActionLink>
          </Card>

          <Card className="m-rise !px-[18px] !py-4" style={{ '--i': 6 }}>
            <h3 className="mb-1.5 font-tight text-[14.5px] font-semibold">Activity</h3>
            <ul className="mt-1">
              {timeline.map((e, idx) => (
                <li key={e.key} className="relative flex gap-3 pb-3 last:pb-0">
                  {idx < timeline.length - 1 && <span aria-hidden="true" className="absolute left-[5px] top-[14px] -bottom-0.5 w-[1.5px] bg-line" />}
                  <i aria-hidden="true" className={`mt-[3px] h-3 w-3 shrink-0 rounded-full border-2 ${e.tone === 'g' ? 'border-good bg-good' : 'border-faint bg-surface'}`} />
                  <div className="min-w-0">
                    <b className="block font-tight text-[13px] font-semibold text-ink">{e.title}</b>
                    {e.detail && <small className="block text-[12px] text-body tabular-nums">{e.detail}</small>}
                    {e.when && <em className="mt-px block text-[11.5px] not-italic text-mute">{whenWords(e.when)}{e.kind === 'created' && creator ? ` · ${creator}` : ''}</em>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="m-rise !px-[18px] !py-4" style={{ '--i': 7 }}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              <dt className="text-mute">Invoice date</dt><dd className="text-right font-medium text-ink-2">{formatDate(inv.invoice_date)}</dd>
              <dt className="text-mute">Due date</dt><dd className="text-right font-medium text-ink-2">{inv.due_date ? formatDate(inv.due_date) : '—'}</dd>
              {terms !== null && <><dt className="text-mute">Credit terms</dt><dd className="text-right font-medium text-ink-2">{terms} {terms === 1 ? 'day' : 'days'}</dd></>}
              <dt className="text-mute">Place of supply</dt><dd className="text-right font-medium text-ink-2">{inv.place_of_supply || client?.state || '—'}</dd>
              {creator && <><dt className="text-mute">Created by</dt><dd className="text-right font-medium text-ink-2">{creator}</dd></>}
            </dl>
          </Card>

          <Card className="m-rise !px-[18px] !py-4" style={{ '--i': 8 }}>
            <StatusRow label="E-invoice IRN"
              value={inv.irn_status === 'SUCCESS' ? `Generated · ${String(inv.irn || '').slice(0, 16)}…`
                : inv.irn_status === 'FAILED' ? 'Failed'
                : inv.irn_status === 'PENDING' ? 'Queued for NIC'
                : inv.irn_status === 'PROCESSING' ? 'Being processed'
                : 'Not generated'}
              sub={inv.ack_no ? `Ack ${inv.ack_no}${inv.ack_date ? ` · ${inv.ack_date}` : ''}` : null}
              action={(!inv.irn_status || inv.irn_status === 'FAILED' || inv.irn_status === 'NOT_APPLICABLE') && (
                <Button variant="secondary" size="xs" onClick={() => actions.generateIrn(inv)}>Generate IRN</Button>
              )} />
            <div className="my-3 border-t border-sep" />
            <StatusRow label="e-Way bill" value={inv.eway_no || 'Not made'} sub={inv.vehicle_no ? `Vehicle ${inv.vehicle_no}` : null}
              action={<Button variant="secondary" size="xs" onClick={() => setEwayOpen(true)}>{inv.eway_no ? 'Open' : 'Make'}</Button>} />
            <div className="my-3 border-t border-sep" />
            <div className="flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <b className="block font-tight text-[13.5px] font-semibold">Needs delivery</b>
                <small className="text-[12px] text-mute">
                  {!inv.delivery_required ? 'Not flagged' : inv.delivery_status === 'DELIVERED' ? 'Delivered' : inv.delivery_status === 'IN_TRANSIT' ? 'In transit' : 'Awaiting dispatch'}
                </small>
              </div>
              <Switch checked={!!inv.delivery_required} onChange={() => actions.toggleDelivery(inv)} label="Needs delivery" />
            </div>
          </Card>
        </div>
      </div>

      {payOpen && (
        <RecordPaymentDialog invoice={inv} clientName={client?.name} onClose={() => setPayOpen(false)}
          onRecord={(amt) => actions.recordPayment(inv, amt)}
          onReread={() => { refetch?.(); setPayOpen(false); }} />
      )}
      {ewayOpen && (
        <EwayBillModal invoice={inv} business={businessProfile || {}} client={client}
          onClose={() => setEwayOpen(false)} onSaved={() => refetch?.()} />
      )}
      {printing === 'pos' && (
        <POSReceipt invoice={inv} businessProfile={businessProfile} client={client} onClose={() => setPrinting(null)} />
      )}
      {printing === 'a4' && (
        <InvoiceTemplate invoice={inv} businessProfile={businessProfile} client={client}
          onPrint={() => window.print()}
          onShare={(type) => { if (type === 'whatsapp') shareToWhatsApp(inv, client, businessProfile); }}
          onToggleMode={() => setPrinting('pos')}
          onClose={() => setPrinting(null)} />
      )}
    </div>
  );
};

const BackLink = ({ onClick }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-tight text-[13px] font-semibold text-body hover:text-ink">
    <ArrowLeft size={14} /> Invoices
  </button>
);

const ActionLink = ({ icon: Icon, children, hint, onClick, danger }) => (
  <button type="button" onClick={onClick}
    className={`-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2.5 rounded-pill px-1.5 py-2 text-left font-tight text-[13.5px] font-medium hover:bg-tile ${danger ? 'text-bad-text' : 'text-ink-2'}`}>
    <Icon size={16} strokeWidth={1.8} className={danger ? 'text-bad-text' : 'text-mute'} />
    <span className="flex-1">{children}</span>
    {hint && <small className="font-sans text-[12px] font-medium text-mute">{hint}</small>}
  </button>
);

const StatusRow = ({ label, value, sub, action }) => (
  <div className="flex items-center gap-2.5">
    <div className="min-w-0 flex-1">
      <Eyebrow>{label}</Eyebrow>
      <b className="mt-[3px] block truncate font-tight text-[13.5px] font-semibold">{value}</b>
      {sub && <small className="block text-[12px] text-mute">{sub}</small>}
    </div>
    {action || null}
  </div>
);

export default InvoiceDetail;
