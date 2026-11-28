import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Calendar, Clock, CheckCircle2, Printer, Share2, BellRing, Truck, Repeat, Download, Plus, Search,
  ChevronLeft, ChevronRight, CreditCard,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import RecurringInvoicesModal from '../components/sales/RecurringInvoicesModal';
import EwayBillModal from '../components/sales/EwayBillModal';
import { useSales } from '../hooks/useSales';
import { usePeople } from '../hooks/usePeople';
import { useNotifications } from '../context/NotificationContext';
import { shareToWhatsApp } from '../lib/gstEngine';
import { sendPaymentReminder } from '../lib/reminders';
import { formatCurrency, todayISOInAppTZ, formatDate, formatShortDateTime } from '../lib/utils';
import {
  resolveInvoiceStatus, invoiceOutstanding, inInvoiceDateRange, summarizeInvoices, filterInvoices,
  pageOf, invoiceCsvRows, STATUS_LABEL, STATUS_TONE, deliveryPill,
} from '../lib/invoiceList';
import InvoiceTemplate from '../components/invoice/InvoiceTemplate';
import POSReceipt from '../components/invoice/POSReceipt';
import Modal from '../shared/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { FilterPills } from '../components/ui/Tabs';
import { FigureStrip, Figure } from '../components/ui/FigureStrip';
import SegmentedTabs from '../components/motion/SegmentedTabs';
import { RowMenu, MenuItem, MenuRule } from '../components/ui/RowMenu';
import RecordPaymentDialog from '../components/invoices/RecordPaymentDialog';
import { classifyWriteFailure } from '../lib/writeOutcome';

const PAGE_SIZE = 50;

const downloadCSV = (rows, filename) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v) => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// "26 Nov": the list's date, from the invoice's own (date-only) date.
const shortDay = (ymd) => formatShortDateTime(String(ymd || '').slice(0, 10)) || '—';

// ── legacy detail pieces (replaced by the detail page in the next phase) ──
const MetaRow = ({ icon: Icon, label, value, tone }) => {
  const cls = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-accent-signature' : 'text-ink-primary';
  return (
    <div className="flex items-start gap-2.5 p-3 bg-canvas rounded-xl">
      <Icon size={14} className="text-muted-foreground mt-0.5" />
      <div><div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div></div>
    </div>
  );
};

const TotalRow = ({ label, value, bold, tone }) => {
  const cls = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-accent-signature' : 'text-ink-primary';
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs font-semibold ${bold ? 'text-ink-primary' : 'text-ink-secondary'}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${cls}`}>{value}</span>
    </div>
  );
};

/** The status cell: payment pill, then delivery, then e-Way bill. */
export const InvoiceStatusPills = ({ inv, status }) => {
  const dp = deliveryPill(inv);
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      {dp && <Badge tone={dp.tone}>{dp.label}</Badge>}
      {inv.eway_no && <Badge tone="good" title={`e-Way bill ${inv.eway_no}`}>e-Way bill</Badge>}
    </div>
  );
};

// ── main ──────────────────────────────────────────────────────────────
const Invoices = () => {
  const navigate = useNavigate();
  const { currentTenantId, businessProfile, currentTenant } = useTenant();
  const { invoices, markInvoicePaid, enqueueIrn, refetch: refetchInvoices } = useSales(currentTenantId, { plan: currentTenant?.plan || 'STARTER' });
  const { clients }  = usePeople(currentTenantId);
  const [showRecurring, setShowRecurring] = useState(false);
  const [ewayInv, setEwayInv] = useState(null);
  const { addNotification } = useNotifications();

  const handleRemind = async (inv, cli) => {
    addNotification?.('Sending reminder…', 'info');
    const { ok, error, channel } = await sendPaymentReminder(inv, cli, businessProfile);
    addNotification?.(ok ? `Reminder sent via ${channel || 'message'}` : `Reminder failed: ${error}`, ok ? 'success' : 'error');
  };

  // view state
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [invoiceMode,    setInvoiceMode]    = useState('gst');
  const [detailInv,      setDetailInv]      = useState(null);
  const [settleInput,    setSettleInput]    = useState('');
  const [payInv,         setPayInv]         = useState(null);

  // filters
  const [searchTerm,   setSearchTerm]   = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFilter,   setDateFilter]   = useState('ALL');
  const [customRange,  setCustomRange]  = useState({ from: '', to: '' });
  const [page,         setPage]         = useState(0);

  // ── lookups ───────────────────────────────────────────────────────
  const clientOf = useCallback((inv) =>
    clients.find(c => c.id === inv.client_id) || { name: inv.client_name || 'Walk-in' },
  [clients]);
  const clientName = useCallback((inv) => clientOf(inv)?.name || '', [clientOf]);

  const today = todayISOInAppTZ();
  const inDateRange = useCallback((inv) => inInvoiceDateRange(inv, dateFilter, customRange, today), [dateFilter, customRange, today]);

  const summary = useMemo(() => summarizeInvoices(invoices, inDateRange), [invoices, inDateRange]);
  const filtered = useMemo(
    () => filterInvoices(invoices, { inRange: inDateRange, status: statusFilter, query: searchTerm, clientName }),
    [invoices, inDateRange, statusFilter, searchTerm, clientName],
  );
  useEffect(() => { setPage(0); }, [dateFilter, customRange, statusFilter, searchTerm]);
  const pg = pageOf(filtered, page, PAGE_SIZE);

  const handleExport = () => downloadCSV(invoiceCsvRows(filtered, clientName), `invoices_${todayISOInAppTZ()}.csv`);

  // ── settle ────────────────────────────────────────────────────────
  // The same write as before the redesign: the full balance marks the invoice
  // paid; less than that sets its paid amount and PARTIAL. Only now the
  // server's answer is read and returned instead of being dropped.
  const recordPayment = async (inv, amt) => {
    const out = invoiceOutstanding(inv);
    if (amt >= out) {
      const res = await markInvoicePaid(inv.id);
      if (res?.error) return { error: res.error };
    } else {
      const { supabase } = await import('../lib/supabase');
      const { error } = await supabase.from('invoices')
        .update({ paid_amount: (inv.paid_amount || 0) + amt, payment_status: 'PARTIAL' })
        .eq('id', inv.id);
      if (error) return { error };
      refetchInvoices?.();
    }
    addNotification?.(`Payment of ${formatCurrency(amt)} recorded on ${inv.invoice_number || 'the invoice'}`, 'success');
    return { ok: true };
  };

  // Legacy detail modal's settle box, on the same path.
  const handleSettle = async () => {
    if (!detailInv) return;
    const amt = parseFloat(settleInput);
    const out = invoiceOutstanding(detailInv);
    if (!amt || amt <= 0) return alert('Enter positive amount');
    if (amt > out) return alert(`Max payable: ${formatCurrency(out)}`);
    const res = await recordPayment(detailInv, amt);
    if (res?.error) {
      const f = classifyWriteFailure(res.error, { noun: 'payment' });
      return addNotification?.(`${f.title}: ${f.detail}`, 'error');
    }
    setSettleInput('');
    setDetailInv(null);
  };

  // Delivery flag on or off. Same update as before; a refusal is now shown.
  const toggleDelivery = async (inv) => {
    const { supabase } = await import('../lib/supabase');
    const newRequired = !inv.delivery_required;
    const { error } = await supabase.from('invoices')
      .update({ delivery_required: newRequired, delivery_status: newRequired ? 'PENDING' : null })
      .eq('id', inv.id);
    if (error) {
      const f = classifyWriteFailure(error, { noun: 'delivery change' });
      addNotification?.(`${f.title}: ${f.detail}`, 'error');
    }
    refetchInvoices?.();
  };

  const openPrint = (inv) => { setViewingInvoice(inv); setInvoiceMode('gst'); };

  // ── row ───────────────────────────────────────────────────────────
  const renderRow = (inv) => {
    const client = clientOf(inv);
    const status = resolveInvoiceStatus(inv);
    const out    = invoiceOutstanding(inv);
    const unpaid = status !== 'PAID';
    return (
      <TableRow key={inv.id} onClick={() => setDetailInv(inv)} className="cursor-pointer"
        data-state={detailInv?.id === inv.id ? 'selected' : undefined}>
        <TableCell className="whitespace-nowrap text-ink-2">
          {shortDay(inv.invoice_date)}
          {inv.due_date && unpaid && <span className="block mt-px text-[12px] text-mute">Due {shortDay(inv.due_date)}</span>}
        </TableCell>
        <TableCell>
          <span className="font-tight text-[13.5px] font-semibold text-ink whitespace-nowrap">{inv.invoice_number}</span>
        </TableCell>
        <TableCell>
          <span className="block font-tight text-[14px] font-semibold text-ink">{client?.name}</span>
          <span className="font-tight text-[12px] font-medium tracking-[0.01em] text-mute">{client?.gstin || client?.gst_no || 'URD'}</span>
        </TableCell>
        <TableCell numeric className="whitespace-nowrap">
          <span className="text-ink">{formatCurrency(inv.grand_total)}</span>
          {out > 0 && unpaid && (
            <span className="block mt-px font-tight text-[12px] font-semibold text-amber-text tabular-nums">Due {formatCurrency(out)}</span>
          )}
        </TableCell>
        <TableCell><InvoiceStatusPills inv={inv} status={status} /></TableCell>
        <TableCell numeric className="w-12" onClick={e => e.stopPropagation()}>
          <RowMenu label={`Invoice ${inv.invoice_number || ''}`}>
            {(close) => (
              <>
                {unpaid && (
                  <MenuItem primary icon={CheckCircle2} hint={`${formatCurrency(out)} due`} onClick={() => { close(); setPayInv(inv); }}>
                    Record payment
                  </MenuItem>
                )}
                <MenuItem icon={Printer} onClick={() => { close(); openPrint(inv); }}>View and print</MenuItem>
                <MenuItem icon={Share2} onClick={() => { close(); shareToWhatsApp(inv, client, businessProfile); }}>Share on WhatsApp</MenuItem>
                {unpaid && (
                  <MenuItem icon={BellRing} title="Send payment reminder (SMS/WhatsApp)" onClick={() => { close(); handleRemind(inv, client); }}>
                    Send payment reminder
                  </MenuItem>
                )}
                <MenuRule />
                <MenuItem icon={FileText} hint={inv.eway_no ? 'Saved' : null}
                  title={inv.eway_no ? `e-Way ${inv.eway_no}` : 'Generate e-Way bill'}
                  onClick={() => { close(); setEwayInv(inv); }}>
                  e-Way bill
                </MenuItem>
                <MenuItem icon={Truck} onClick={() => { close(); toggleDelivery(inv); }}>
                  {inv.delivery_required ? 'Remove delivery flag' : 'Mark as requires delivery'}
                </MenuItem>
              </>
            )}
          </RowMenu>
        </TableCell>
      </TableRow>
    );
  };

  // ── render ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col pb-16">
      {/* Summary */}
      <FigureStrip cols={4} className="m-rise mb-5" style={{ '--i': 1 }}>
        <Figure label="Total billed" value={formatCurrency(summary.revenue)}
          sub={`${summary.count.toLocaleString('en-IN')} ${summary.count === 1 ? 'invoice' : 'invoices'}`} />
        <Figure label="Collected" value={<span className="text-good-text">{formatCurrency(summary.paidAmt)}</span>}
          sub={`${summary.paidCt.toLocaleString('en-IN')} paid ${summary.paidCt === 1 ? 'invoice' : 'invoices'}`} />
        <Figure label="Outstanding" value={<span className="text-amber-text">{formatCurrency(summary.unpaidAmt)}</span>}
          sub={summary.unpaidCt > 0 ? `${summary.unpaidCt.toLocaleString('en-IN')} ${summary.unpaidCt === 1 ? 'invoice' : 'invoices'}` : 'nothing due'} />
        <Figure label="Overdue" value={<span className="text-bad-text">{formatCurrency(summary.overdue)}</span>} sub="past the due date" />
      </FigureStrip>

      {/* Date range + recurring / export / new */}
      <div className="m-rise flex flex-wrap items-center gap-2.5 mb-3" style={{ '--i': 2 }}>
        <div className="max-w-full overflow-x-auto no-scrollbar">
          <SegmentedTabs
            items={[
              { key: 'ALL', label: 'All time' }, { key: 'TODAY', label: 'Today' },
              { key: '7D', label: '7 days' }, { key: '30D', label: '30 days' }, { key: 'CUSTOM', label: 'Custom' },
            ]}
            value={dateFilter}
            onChange={setDateFilter}
            trackClass="bg-well"
            indicatorClass="bg-ink"
            activeClass="text-white"
            className="[&_button]:font-tight [&_button]:text-[12.5px] [&_button]:font-semibold [&_button]:px-[13px] [&_button]:h-[30px] [&_button:not([aria-selected=true])]:text-body"
          />
        </div>
        {dateFilter === 'CUSTOM' && (
          <div className="flex items-center gap-2 text-[12.5px] text-body">
            <Input type="date" aria-label="From" value={customRange.from}
              onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))} className="h-8 w-auto text-[12.5px]" />
            to
            <Input type="date" aria-label="To" value={customRange.to}
              onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))} className="h-8 w-auto text-[12.5px]" />
          </div>
        )}
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => setShowRecurring(true)}><Repeat /> Recurring</Button>
        <Button variant="secondary" size="sm" onClick={handleExport} disabled={!filtered.length} title="Export CSV"><Download /> Export</Button>
        <Button size="sm" onClick={() => navigate('/documents/new?type=SALES_INVOICE', { state: { from: 'Invoices' } })}><Plus /> New invoice</Button>
      </div>

      {/* Status + search */}
      <div className="m-rise flex flex-wrap items-center gap-2.5 mb-3" style={{ '--i': 3 }}>
        <FilterPills
          ariaLabel="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          items={[
            { key: 'ALL', label: 'All', count: summary.count },
            { key: 'PAID', label: 'Paid', count: summary.paidCt },
            { key: 'UNPAID', label: 'Pending', count: summary.unpaidCt },
            { key: 'OVERDUE', label: 'Overdue', count: summary.overdueCt },
          ]}
        />
        <div className="flex-1" />
        <div className="relative w-full sm:w-[280px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mute pointer-events-none" size={16} />
          <input
            type="text"
            aria-label="Search invoice number or client"
            placeholder="Search invoice number or client"
            className="w-full h-9 rounded-pill bg-well pl-10 pr-4 text-[13px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {showRecurring && (
        <RecurringInvoicesModal tenantId={currentTenantId} clients={clients} onClose={() => setShowRecurring(false)} />
      )}
      {ewayInv && (
        <EwayBillModal
          invoice={ewayInv}
          business={businessProfile || {}}
          client={clients.find(c => c.id === ewayInv.client_id) || { name: ewayInv.client_name }}
          onClose={() => setEwayInv(null)}
          onSaved={() => refetchInvoices?.()}
        />
      )}
      {payInv && (
        <RecordPaymentDialog
          invoice={payInv}
          clientName={clientOf(payInv)?.name}
          onClose={() => setPayInv(null)}
          onRecord={(amt) => recordPayment(payInv, amt)}
          onReread={() => { refetchInvoices?.(); setPayInv(null); }}
        />
      )}

      {/* Table */}
      <div className="m-rise min-w-0" style={{ '--i': 4 }}>
        <Table>
          <TableHeader>
            <tr>
              <TableHead aria-sort="descending">Date<span className="ml-1 text-amber" aria-hidden="true">↓</span></TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Client</TableHead>
              <TableHead numeric>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {pg.rows.length > 0 ? pg.rows.map(renderRow) : (
              <tr>
                <td colSpan={6} className="px-4 pt-14 pb-16 text-center text-[13px] text-body">
                  <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-mute"><FileText size={22} strokeWidth={1.8} /></span>
                  <b className="mb-1 block font-tight text-[15px] font-semibold text-ink">No invoices match</b>
                  Change the dates or filters, or create a new invoice.
                </td>
              </tr>
            )}
          </TableBody>
        </Table>
      </div>
      {pg.total > 0 && (
        <div className="m-rise flex items-center justify-between gap-3 px-1 pt-3.5 text-[13px] text-body" style={{ '--i': 5 }}>
          <span>{pg.from.toLocaleString('en-IN')} to {pg.to.toLocaleString('en-IN')} of {pg.total.toLocaleString('en-IN')} {pg.total === 1 ? 'invoice' : 'invoices'} · newest first</span>
          {pg.pages > 1 && (
            <div className="flex gap-1.5">
              <Button variant="secondary" size="icon-sm" aria-label="Previous page" disabled={!pg.hasPrev} onClick={() => setPage(p => p - 1)}><ChevronLeft /></Button>
              <Button variant="secondary" size="icon-sm" aria-label="Next page" disabled={!pg.hasNext} onClick={() => setPage(p => p + 1)}><ChevronRight /></Button>
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      {detailInv && (
        <Modal
          isOpen={!!detailInv}
          onClose={() => { setDetailInv(null); setSettleInput(''); }}
          title={`Invoice #${detailInv.invoice_number}`}
          subtitle={`${clientOf(detailInv)?.name} · ${formatDate(detailInv.invoice_date)}`}
          maxWidth="max-w-2xl"
        >
          {(() => {
            const inv    = detailInv;
            const client = clientOf(inv);
            const status = resolveInvoiceStatus(inv);
            const out    = invoiceOutstanding(inv);
            const items  = Array.isArray(inv.items) ? inv.items : [];

            return (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <MetaRow icon={Calendar}      label="Invoice Date" value={formatDate(inv.invoice_date)} />
                  <MetaRow icon={Calendar}      label="Due Date"     value={formatDate(inv.due_date)} />
                  <MetaRow icon={FileText}      label="Client"       value={client?.name} />
                  <MetaRow
                    icon={status === 'PAID' ? CheckCircle2 : Clock}
                    label="Status"
                    value={status === 'UNPAID' ? 'Pending' : status.charAt(0) + status.slice(1).toLowerCase()}
                    tone={status === 'PAID' ? 'emerald' : 'amber'}
                  />
                </div>

                <div className="border border-black/5 rounded-xl overflow-hidden">
                  <div className="bg-canvas px-4 py-2 text-[11px] font-bold text-ink-secondary uppercase tracking-wider grid grid-cols-12 gap-2">
                    <div className="col-span-6">Item</div>
                    <div className="col-span-2 text-center">Qty</div>
                    <div className="col-span-2 text-right">Rate</div>
                    <div className="col-span-2 text-right">Total</div>
                  </div>
                  {items.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">No line items</div>
                  ) : items.map((it, idx) => {
                    const qty   = Number(it.qty || it.quantity || 0);
                    const rate  = Number(it.rate || it.price || 0);
                    const taxAmt = Number(it.taxAmount || 0);
                    return (
                      <div key={idx} className="px-4 py-2.5 text-sm grid grid-cols-12 gap-2 items-center border-t border-black/5">
                        <div className="col-span-6 font-semibold text-ink-primary truncate">{it.name}</div>
                        <div className="col-span-2 text-center font-semibold text-ink-secondary">{qty}</div>
                        <div className="col-span-2 text-right text-ink-secondary tabular-nums">{formatCurrency(rate)}</div>
                        <div className="col-span-2 text-right font-bold text-ink-primary tabular-nums">{formatCurrency(qty * rate + taxAmt)}</div>
                      </div>
                    );
                  })}
                </div>

                <div className={`rounded-xl p-4 border ${
                  inv.irn_status === 'SUCCESS' ? 'bg-emerald-50 border-emerald-200' :
                  inv.irn_status === 'FAILED'  ? 'bg-red-50 border-red-200' :
                  inv.irn_status === 'PENDING' || inv.irn_status === 'PROCESSING' ? 'bg-accent-signature/10 border-accent-signature/25' :
                  'bg-muted border-border'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">E-Invoice IRN</p>
                      <p className="text-sm font-bold mt-0.5 text-ink-secondary">
                        {inv.irn_status === 'SUCCESS' ? `Generated · ${inv.irn?.slice(0, 16)}…` :
                         inv.irn_status === 'FAILED'  ? 'Failed — see error' :
                         inv.irn_status === 'PENDING' ? 'Queued for NIC' :
                         inv.irn_status === 'PROCESSING' ? 'Worker processing…' :
                         'Not generated'}
                      </p>
                    </div>
                    {(!inv.irn_status || inv.irn_status === 'FAILED' || inv.irn_status === 'NOT_APPLICABLE') && (
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await enqueueIrn(inv.id);
                          if (r.error) return alert('Enqueue failed: ' + r.error.message);
                          alert(r.already_existed ? 'Already queued' : 'IRN request queued');
                          setDetailInv(null);
                        }}
                        className="px-3 py-1.5 rounded-pill bg-ink-primary text-white text-[10px] font-black uppercase tracking-widest"
                      >
                        Generate IRN
                      </button>
                    )}
                  </div>
                  {inv.ack_no && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 tabular-nums">Ack: {inv.ack_no} · {inv.ack_date}</p>
                  )}
                </div>

                <div className="bg-canvas rounded-xl p-4 space-y-1.5">
                  <TotalRow label="Taxable Amount" value={formatCurrency(inv.taxable_amount)} />
                  {(inv.cgst_amount > 0) && <TotalRow label="CGST" value={formatCurrency(inv.cgst_amount)} />}
                  {(inv.sgst_amount > 0) && <TotalRow label="SGST" value={formatCurrency(inv.sgst_amount)} />}
                  {(inv.igst_amount > 0) && <TotalRow label="IGST" value={formatCurrency(inv.igst_amount)} />}
                  <div className="h-px bg-black/10 my-2" />
                  <TotalRow label="Grand Total" value={formatCurrency(inv.grand_total)} bold />
                  {Number(inv.paid_amount) > 0 && <TotalRow label="Paid" value={formatCurrency(inv.paid_amount)} tone="emerald" />}
                  {out > 0 && status !== 'PAID' && <TotalRow label="Balance due (this bill)" value={formatCurrency(out)} tone="amber" bold />}
                  {(() => {
                    // The client's TOTAL across all their bills — shown only when
                    // it differs from this bill, so nobody mistakes one for both.
                    const clientTotal = Number(client?.outstanding_balance) || 0;
                    const unpaidCount = (invoices || []).filter(i =>
                      i.client_id === inv.client_id && !i.deleted_at && (i.payment_status || '').toUpperCase() !== 'PAID').length;
                    if (!(clientTotal > 0) || Math.abs(clientTotal - out) < 0.5) return null;
                    return (
                      <div className="flex items-center justify-between text-[11px] pt-2 mt-2 border-t border-black/10">
                        <span className="text-muted-foreground">{client?.name || 'This client'} — total outstanding</span>
                        <span className="font-semibold text-amber-600 tabular-nums">
                          {formatCurrency(clientTotal)}{unpaidCount > 1 ? ` · ${unpaidCount} bills` : ''}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-2">
                  {status !== 'PAID' && (
                    <div className="flex items-center gap-2 flex-1">
                      <input type="number" min="0" step="0.01" value={settleInput} onChange={e => setSettleInput(e.target.value)}
                        placeholder="Amount to collect" className="flex-1 px-3 py-2.5 rounded-lg border border-black/10 text-sm font-semibold" />
                      <Button onClick={handleSettle}><CreditCard /> Record Payment</Button>
                    </div>
                  )}
                  <Button variant="dark" onClick={() => { setDetailInv(null); openPrint(inv); }}><Printer /> Print</Button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Invoice viewer */}
      {viewingInvoice && (() => {
        const invClient  = clientOf(viewingInvoice);
        const closeInv   = () => { setViewingInvoice(null); setInvoiceMode('gst'); };
        if (invoiceMode === 'simple') {
          return <POSReceipt invoice={viewingInvoice} businessProfile={businessProfile} client={invClient} onClose={closeInv} />;
        }
        return (
          <InvoiceTemplate
            invoice={viewingInvoice}
            businessProfile={businessProfile}
            client={invClient}
            onPrint={() => window.print()}
            onShare={(type) => { if (type === 'whatsapp') shareToWhatsApp(viewingInvoice, invClient, businessProfile); }}
            onToggleMode={() => setInvoiceMode('simple')}
            onClose={closeInv}
          />
        );
      })()}
    </div>
  );
};

export default Invoices;
