import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, CheckCircle2, Printer, Share2, BellRing, Truck, Repeat, Download, Plus, Search,
  ChevronLeft, ChevronRight, Copy,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import RecurringInvoicesModal from '../components/sales/RecurringInvoicesModal';
import EwayBillModal from '../components/sales/EwayBillModal';
import { useSales } from '../hooks/useSales';
import { usePeople } from '../hooks/usePeople';
import { useNotifications } from '../context/NotificationContext';
import { shareToWhatsApp } from '../lib/gstEngine';
import { formatCurrency, todayISOInAppTZ, formatShortDateTime } from '../lib/utils';
import {
  resolveInvoiceStatus, invoiceOutstanding, inInvoiceDateRange, summarizeInvoices, filterInvoices,
  pageOf, invoiceCsvRows,
} from '../lib/invoiceList';
import InvoiceTemplate from '../components/invoice/InvoiceTemplate';
import POSReceipt from '../components/invoice/POSReceipt';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { FilterPills } from '../components/ui/Tabs';
import { FigureStrip, Figure } from '../components/ui/FigureStrip';
import SegmentedTabs from '../components/motion/SegmentedTabs';
import { RowMenu, MenuItem, MenuRule } from '../components/ui/RowMenu';
import RecordPaymentDialog from '../components/invoices/RecordPaymentDialog';
import InvoiceStatusPills from '../components/invoices/InvoiceStatusPills';
import { useInvoiceActions } from '../components/invoices/useInvoiceActions';

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

// ── main ──────────────────────────────────────────────────────────────
const Invoices = () => {
  const navigate = useNavigate();
  const { currentTenantId, businessProfile, currentTenant } = useTenant();
  const { invoices, markInvoicePaid, enqueueIrn, refetch: refetchInvoices } = useSales(currentTenantId, { plan: currentTenant?.plan || 'STARTER' });
  const { clients }  = usePeople(currentTenantId);
  const [showRecurring, setShowRecurring] = useState(false);
  const [ewayInv, setEwayInv] = useState(null);
  const { addNotification } = useNotifications();

  const actions = useInvoiceActions({ markInvoicePaid, enqueueIrn, refetch: refetchInvoices, businessProfile, notify: addNotification });

  // view state
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [invoiceMode,    setInvoiceMode]    = useState('gst');
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

  // A new, unsaved sales invoice from this one (lib/duplicateInvoice).
  const duplicate = (inv) => navigate(`/documents/new?type=SALES_INVOICE&duplicate=${encodeURIComponent(inv.id)}`, { state: { from: 'Invoices' } });

  const openPrint = (inv) => { setViewingInvoice(inv); setInvoiceMode('gst'); };

  // ── row ───────────────────────────────────────────────────────────
  const renderRow = (inv) => {
    const client = clientOf(inv);
    const status = resolveInvoiceStatus(inv);
    const out    = invoiceOutstanding(inv);
    const unpaid = status !== 'PAID';
    return (
      <TableRow key={inv.id} onClick={() => navigate(`/invoices/${encodeURIComponent(inv.id)}`)} className="cursor-pointer">
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
                  <MenuItem icon={BellRing} title="Send payment reminder (SMS/WhatsApp)" onClick={() => { close(); actions.remind(inv, client); }}>
                    Send payment reminder
                  </MenuItem>
                )}
                <MenuItem icon={Copy} hint="New invoice, same items" onClick={() => { close(); duplicate(inv); }}>Duplicate</MenuItem>
                <MenuRule />
                <MenuItem icon={FileText} hint={inv.eway_no ? 'Saved' : null}
                  title={inv.eway_no ? `e-Way ${inv.eway_no}` : 'Generate e-Way bill'}
                  onClick={() => { close(); setEwayInv(inv); }}>
                  e-Way bill
                </MenuItem>
                <MenuItem icon={Truck} onClick={() => { close(); actions.toggleDelivery(inv); }}>
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
          onRecord={(amt) => actions.recordPayment(payInv, amt)}
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
