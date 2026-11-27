import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import CopyButton from '../../../components/motion/CopyButton';
import HoldButton from '../../../components/motion/HoldButton';
import SegmentedTabs from '../../../components/motion/SegmentedTabs';
import {
  Search, Trash2, Printer, Receipt, Download, CheckCircle2, RotateCcw, Truck, PackageCheck,
  FileText, Pencil, ChevronDown
} from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FilterPills } from '../../../components/ui/Tabs';
import { FigureStrip, Figure } from '../../../components/ui/FigureStrip';
import SidePanel from '../../../components/ui/SidePanel';
import { supabase } from '../../../lib/supabase';
import { formatCurrency, formatShortDateTime, formatTime as timeOf, todayISOInAppTZ, getAppTimezone, getAppLocale } from '../../../lib/utils';
import { surplusLabel } from '../lib/checkoutMoney';

// Payment method -> how it reads under the client name.
const PAY_LABEL = { CASH: 'Cash', CARD: 'Card', UPI: 'UPI', BANK: 'Bank', CREDIT: 'Credit' };

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
const isPaidStatus = (s) => s === 'PAID' || s === 'COMPLETED';
// Voided / failed / cancelled sales collect no money and represent no
// revenue. They must NOT fall into the "pending" bucket (which would
// inflate the Due total and Pending count) — they get their own red
// "Failed" badge, matching how the mobile app labels them.
const isVoidStatus = (s) => s === 'VOIDED' || s === 'FAILED' || s === 'CANCELLED';

const shortRef = (id) => {
  if (!id) return '';
  // Keep full ref for SAL-XXXXXX format; strip only long UUIDs
  if (/^[A-Z]+-[A-Z0-9]+$/i.test(id)) return id; // e.g. SAL-X2QQ5B → show as-is
  const tail = id.split('-').pop() || id;
  return /^\d{10,}$/.test(tail) ? tail.slice(-5) : tail.toUpperCase();
};

const formatTime = (isoOrDate) => {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(getAppLocale(), {
    hour: '2-digit', minute: '2-digit', timeZone: getAppTimezone()
  });
};

// Convert array of objects into CSV blob + download.
const downloadCSV = (rows, filename) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => esc(r[h])).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------
const DELIVERY_BADGE = {
  PENDING:    { tone: 'warn', label: 'Awaiting dispatch' },
  IN_TRANSIT: { tone: 'info', label: 'In transit'        },
  DELIVERED:  { tone: 'good', label: 'Delivered'         },
  FAILED:     { tone: 'bad',  label: 'Failed delivery'   },
};

// Date from the sale's own date (a back-dated or edited sale keeps it), time
// from when it was rung up: "22 Nov, 4:10 pm".
const whenOf = (sale) => {
  const day = formatShortDateTime(String(sale.date || '').slice(0, 10));
  if (!day) return formatShortDateTime(sale.created_at) || '—';
  const t = timeOf(sale.created_at);
  return t ? `${day}, ${t}` : day;
};

const InvoiceList = ({ sales, clients, staff = [], products = [], invoices = [], returnedSaleIds = null, onDelete, onPrint, onSettle, onReturn, onEdit, onDispatch, onConvertToInvoice }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | PAID | PENDING
  // Resolves cross-tenant cashier names (GLOBAL_ADMIN impersonation, etc.).
  const [extraCashiers, setExtraCashiers] = useState({}); // id -> {name, email}

  useEffect(() => {
    const knownIds = new Set(staff.map(s => s.id));
    const missing = [...new Set(
      sales
        .map(s => s.bookedBy || s.salesRepId)
        .filter(id => id && !knownIds.has(id) && !extraCashiers[id])
    )];
    if (!missing.length) return;
    let cancelled = false;
    supabase.rpc('get_cashier_names', { user_ids: missing }).then(({ data, error }) => {
      if (cancelled || error || !data) return;
      setExtraCashiers(prev => {
        const next = { ...prev };
        for (const row of data) next[row.id] = { name: row.name, email: row.email };
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [sales, staff]);
  const [dateFilter, setDateFilter] = useState('TODAY');   // ALL | TODAY | 7D | 30D | CUSTOM — default Today
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [payFilter, setPayFilter] = useState('ALL');        // ALL | CASH | UPI | CARD | BANK | CREDIT
  const [cashierFilter, setCashierFilter] = useState('ALL');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [detailSale, setDetailSale] = useState(null);
  const [settleInput, setSettleInput] = useState('');

  // ---------- Lookups ----------
  const getClientId = (sale) => sale.shopId ?? sale.shop_id ?? sale.clientId ?? null;
  const getClientName = useCallback((sale) => {
    const cid = getClientId(sale);
    if (!cid) return 'Walk-in';
    return clients.find(c => c.id === cid)?.name || 'Walk-in';
  }, [clients]);
  const getStatus = (sale) => (sale.paymentStatus ?? sale.status ?? 'PENDING').toUpperCase();
  const getCashier = useCallback((sale) => {
    const uid = sale.bookedBy || sale.salesRepId || sale.user_id;
    if (!uid) return null;
    const s = staff.find(u => u.id === uid);
    if (s?.name || s?.email) return s.name || s.email;
    const extra = extraCashiers[uid];
    if (extra?.name || extra?.email) return extra.name || extra.email;
    return uid.slice(0, 6);
  }, [staff, extraCashiers]);
  const getProductName = useCallback((pid) => {
    return products.find(p => p.id === pid)?.name || 'Unknown';
  }, [products]);
  const itemCount = (sale) => {
    const items = sale.items || [];
    if (!Array.isArray(items)) return 0;
    return items.reduce((n, i) => n + (Number(i.quantity) || 1), 0);
  };
  const outstandingOf = (sale) => {
    const total = Number(sale.totalAmount) || 0;
    const paid = Number(sale.paidAmount) || 0;
    return Math.max(0, total - paid);
  };

  // ---------- Date range window (in IST) ----------
  const inDateRange = useCallback((sale) => {
    if (dateFilter === 'ALL') return true;
    const saleDate = (sale.date || '').slice(0, 10);
    if (!saleDate) return false;
    const today = todayISOInAppTZ();
    if (dateFilter === 'TODAY') return saleDate === today;
    const todayMs = new Date(today + 'T00:00:00Z').getTime();
    const saleMs = new Date(saleDate + 'T00:00:00Z').getTime();
    if (dateFilter === '7D') return saleMs >= todayMs - 7 * 86400000;
    if (dateFilter === '30D') return saleMs >= todayMs - 30 * 86400000;
    if (dateFilter === 'CUSTOM') {
      if (customRange.from && saleDate < customRange.from) return false;
      if (customRange.to && saleDate > customRange.to) return false;
      return true;
    }
    return true;
  }, [dateFilter, customRange]);

  // ---------- Summary ----------
  const summary = useMemo(() => {
    let revenue = 0, paid = 0, pending = 0, pendingAmt = 0, failed = 0;
    for (const s of sales) {
      if (!inDateRange(s)) continue;
      const status = getStatus(s);
      // Voided sales: no revenue, no pending, counted separately.
      if (isVoidStatus(status)) { failed++; continue; }
      const amt = Number(s.totalAmount) || 0;
      revenue += amt;
      if (isPaidStatus(status)) paid++;
      else { pending++; pendingAmt += outstandingOf(s); }
    }
    return { revenue, paid, pending, pendingAmt, failed, count: paid + pending + failed };
  }, [sales, inDateRange]);

  // ---------- Filtered rows ----------
  const filteredSales = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return sales.filter(sale => {
      if (!inDateRange(sale)) return false;
      const status = getStatus(sale);
      if (statusFilter === 'PAID' && !isPaidStatus(status)) return false;
      // Pending tab = genuinely owed money; exclude paid AND voided.
      if (statusFilter === 'PENDING' && (isPaidStatus(status) || isVoidStatus(status))) return false;
      if (statusFilter === 'FAILED' && !isVoidStatus(status)) return false;
      if (payFilter !== 'ALL' && (sale.paymentMethod || '').toUpperCase() !== payFilter) return false;
      if (cashierFilter !== 'ALL' && (getCashier(sale) || '—') !== cashierFilter) return false;
      if (!q) return true;
      const name = getClientName(sale).toLowerCase();
      return (sale.id || '').toLowerCase().includes(q) || name.includes(q);
    });
  }, [sales, searchTerm, statusFilter, inDateRange, getClientName, payFilter, cashierFilter, getCashier]);

  // ---------- Sorting ----------
  const sortedSales = useMemo(() => {
    const dirMul = sort.dir === 'asc' ? 1 : -1;
    const val = (s) => {
      switch (sort.key) {
        case 'date':    return new Date(s.created_at || s.date || 0).getTime();
        case 'invoice': return String(s.id || '');
        case 'client':  return getClientName(s).toLowerCase();
        case 'cashier': return (getCashier(s) || '').toLowerCase();
        case 'items':   return itemCount(s);
        case 'amount':  return Number(s.totalAmount) || 0;
        case 'status':  return getStatus(s);
        default:        return 0;
      }
    };
    return [...filteredSales].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * dirMul;
      if (va > vb) return 1 * dirMul;
      return 0;
    });
  }, [filteredSales, sort, getClientName, getCashier]);

  const toggleSort = (key) => setSort(prev =>
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: ['date', 'amount', 'items'].includes(key) ? 'desc' : 'asc' }
  );

  // Distinct cashiers / methods present in the current date window (for dropdowns).
  const cashierOptions = useMemo(() => {
    const set = new Set();
    for (const s of sales) { if (inDateRange(s)) set.add(getCashier(s) || '—'); }
    return [...set].sort();
  }, [sales, inDateRange, getCashier]);
  const payOptions = useMemo(() => {
    const set = new Set();
    for (const s of sales) { if (inDateRange(s) && s.paymentMethod) set.add(String(s.paymentMethod).toUpperCase()); }
    return [...set].sort();
  }, [sales, inDateRange]);

  // ---------- CSV export ----------
  const handleExport = () => {
    const rows = sortedSales.map(s => ({
      date: s.date || '',
      time: formatTime(s.created_at),
      invoice: shortRef(s.id),
      client: getClientName(s),
      cashier: getCashier(s) || '',
      items: itemCount(s),
      subtotal: s.subtotal ?? '',
      tax: s.tax ?? '',
      discount: s.discount ?? '',
      total: s.totalAmount ?? 0,
      paid: s.paidAmount ?? 0,
      amount_received: s.amount_received ?? '',
      outstanding: outstandingOf(s),
      status: getStatus(s),
      payment_method: s.paymentMethod || '',
    }));
    downloadCSV(rows, `sales_${todayISOInAppTZ()}.csv`);
  };

  // ---------- Settle handler ----------
  const handleSettle = async () => {
    if (!detailSale || !onSettle) return;
    const amt = parseFloat(settleInput);
    if (!amt || amt <= 0) return alert('Enter positive amount');
    const out = outstandingOf(detailSale);
    if (amt > out) return alert(`Max payable: ${formatCurrency(out)}`);
    const { error } = await onSettle(detailSale.id, amt);
    if (error) return alert('Settle failed: ' + error.message);
    setSettleInput('');
    setDetailSale(null);
  };

  // The status cell's pills: paid / pending / failed, then delivery, dispatch
  // and return, each when it applies. Shared by the row and the detail panel.
  const statusPills = (sale) => {
    const status = getStatus(sale);
    const paid = isPaidStatus(status);
    const voided = isVoidStatus(status);
    const isReturned = returnedSaleIds ? returnedSaleIds.has(sale.id) : false;
    // Delivery status from linked invoice
    const linkedInvoice = invoices.find(i => i.sale_id === sale.id && i.delivery_required);
    const deliveryStatus = linkedInvoice?.delivery_status?.toUpperCase();
    const deliveryBadge = deliveryStatus ? DELIVERY_BADGE[deliveryStatus] : null;
    return (
      <>
        <Badge tone={voided ? 'bad' : paid ? 'good' : 'neutral'}>{voided ? 'Failed' : paid ? 'Paid' : 'Pending'}</Badge>
        {deliveryBadge && <Badge tone={deliveryBadge.tone}><Truck size={11} />{deliveryBadge.label}</Badge>}
        {sale.fulfillment_status === 'PENDING_DISPATCH' && <Badge tone="warn">Pending dispatch</Badge>}
        {sale.fulfillment_status === 'DISPATCHED' && <Badge tone="good">Dispatched</Badge>}
        {isReturned && <Badge tone="bad">Returned</Badge>}
      </>
    );
  };

  // What can be done to a sale, with the rules for when each one is offered.
  // The row's "···" menu and the detail panel read the same list.
  const actionsFor = (sale) => {
    const status = getStatus(sale);
    const paid = isPaidStatus(status);
    const voided = isVoidStatus(status);
    const isReturned = returnedSaleIds ? returnedSaleIds.has(sale.id) : false;
    // Editing is blocked once a sale has a return or a real GST invoice — the
    // edit_sale RPC refuses these too (would double-count stock / break filing).
    const canEdit = !!onEdit && !voided && !isReturned && !sale.invoice_id;
    return {
      settle:   !paid && !voided && !!onSettle,
      dispatch: !!onDispatch && sale.fulfillment_status === 'PENDING_DISPATCH',
      edit:     canEdit,
      ret:      !!onReturn && Array.isArray(sale.items) && sale.items.length > 0 && !isReturned,
      convert:  !!onConvertToInvoice,
      converted: !!sale.invoice_id,
    };
  };

  const closeDetail = () => { setDetailSale(null); setSettleInput(''); };

  const renderRow = (sale) => {
    const clientName = getClientName(sale);
    const status = getStatus(sale);
    const paid = isPaidStatus(status);
    const voided = isVoidStatus(status);
    const payMethod = (sale.paymentMethod || '').toUpperCase();
    const qty = itemCount(sale);
    const outstanding = outstandingOf(sale);
    const cashier = getCashier(sale);
    const can = actionsFor(sale);

    return (
      <TableRow
        key={sale.id}
        onClick={() => setDetailSale(sale)}
        data-state={detailSale?.id === sale.id ? 'selected' : undefined}
        className="cursor-pointer"
      >
        <TableCell className="whitespace-nowrap text-ink-2">{whenOf(sale)}</TableCell>
        <TableCell>
          <span className="inline-flex items-center gap-1.5 font-tight text-[13.5px] font-semibold text-ink whitespace-nowrap">
            {shortRef(sale.id)}<CopyButton value={shortRef(sale.id)} label="Copy bill number" size={12} />
          </span>
        </TableCell>
        <TableCell>
          <span className="block font-tight text-[14px] font-semibold text-ink">{clientName}</span>
          <small className="text-[12px] text-mute">{PAY_LABEL[payMethod] || payMethod || '—'}</small>
        </TableCell>
        <TableCell className="text-ink-2">{cashier || '—'}</TableCell>
        <TableCell numeric>{qty || 0}</TableCell>
        <TableCell numeric className="whitespace-nowrap">
          <span className={voided ? 'text-mute line-through' : 'text-ink'}>{formatCurrency(sale.totalAmount)}</span>
          {!paid && !voided && outstanding > 0 && (
            <span className="block mt-px font-tight text-[12px] font-semibold text-amber-text tabular-nums">
              Due {formatCurrency(outstanding)}
            </span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">{statusPills(sale)}</div>
        </TableCell>
        <TableCell numeric className="w-12" onClick={e => e.stopPropagation()}>
          <RowMenu label={`Actions for ${shortRef(sale.id)}`}>
            {(close) => (
              <>
                {can.settle && (
                  <MenuItem icon={CheckCircle2} onClick={() => { close(); setDetailSale(sale); setSettleInput(String(outstanding)); }}>
                    Record payment
                  </MenuItem>
                )}
                {can.dispatch && (
                  <MenuItem icon={PackageCheck} title="Mark as dispatched, deducts stock" onClick={() => { close(); onDispatch(sale.id); }}>
                    Mark as dispatched
                  </MenuItem>
                )}
                {can.edit && (
                  <MenuItem icon={Pencil} title="Edit sale, stock and balance re-sync" onClick={() => { close(); onEdit(sale); }}>
                    Edit sale
                  </MenuItem>
                )}
                {can.ret && (
                  <MenuItem icon={RotateCcw} onClick={() => { close(); onReturn(sale); }}>
                    Return items
                  </MenuItem>
                )}
                {can.convert && (
                  <MenuItem icon={FileText} disabled={can.converted}
                    title={can.converted ? 'GST invoice already issued' : 'Convert to GST invoice'}
                    onClick={() => { close(); onConvertToInvoice(sale); }}>
                    {can.converted ? 'GST invoice issued' : 'Issue GST invoice'}
                  </MenuItem>
                )}
                <MenuItem icon={Printer} onClick={() => { close(); onPrint(sale); }}>Print</MenuItem>
                <div className="my-1 h-px bg-sep" />
                <HoldButton onConfirm={() => { close(); onDelete(sale.id); }} title="Hold 1.5s to delete this bill"
                  className="w-full rounded-pill px-3 py-2 text-left font-tight text-[13px] font-semibold text-bad-text hover:bg-bad-soft">
                  <Trash2 size={15} /> Hold to delete
                </HoldButton>
              </>
            )}
          </RowMenu>
        </TableCell>
      </TableRow>
    );
  };

  const dateLabel = { ALL: 'all time', TODAY: 'today', '7D': 'last 7 days', '30D': 'last 30 days', CUSTOM: 'in range' }[dateFilter];

  return (
    <div>
      {/* Summary strip */}
      <FigureStrip cols={4} className="m-rise mb-5" style={{ '--i': 1 }}>
        <Figure label="Sales" value={summary.count} sub={`bills ${dateLabel}`} />
        <Figure label="Revenue" value={formatCurrency(summary.revenue)} sub="failed bills left out" />
        <Figure label="Paid" value={<span className="text-good-text">{summary.paid}</span>} sub="bills" />
        <Figure
          label="Pending"
          value={<span className="text-amber-text">{summary.pending}</span>}
          sub={summary.pending > 0 ? `due ${formatCurrency(summary.pendingAmt)}` : 'bills'}
        />
      </FigureStrip>

      {/* Date range, method, cashier, export */}
      <div className="m-rise flex flex-wrap items-center gap-2.5 mb-3" style={{ '--i': 2 }}>
        <div className="max-w-full overflow-x-auto no-scrollbar">
          <SegmentedTabs
            items={[
              { key: 'ALL', label: 'All time' },
              { key: 'TODAY', label: 'Today' },
              { key: '7D', label: '7 days' },
              { key: '30D', label: '30 days' },
              { key: 'CUSTOM', label: 'Custom' },
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
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="From" value={customRange.from}
              onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))} className="h-8 w-auto text-[12.5px]" />
            <span className="text-[12.5px] text-mute">to</span>
            <Input type="date" aria-label="To" value={customRange.to}
              onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))} className="h-8 w-auto text-[12.5px]" />
          </div>
        )}
        <div className="flex-1" />
        <MenuSelect label="Method" value={payFilter} onChange={setPayFilter}
          options={[{ value: 'ALL', label: 'All' }, ...payOptions.map(m => ({ value: m, label: PAY_LABEL[m] || m }))]} />
        {cashierOptions.length > 1 && (
          <MenuSelect label="Cashier" value={cashierFilter} onChange={setCashierFilter}
            options={[{ value: 'ALL', label: 'All' }, ...cashierOptions.map(c => ({ value: c, label: c }))]} />
        )}
        <Button variant="secondary" size="sm" onClick={handleExport} disabled={!sortedSales.length} title="Export CSV">
          <Download /> Export
        </Button>
      </div>

      {/* Status pills + search */}
      <div className="m-rise flex flex-wrap items-center gap-2.5 mb-3" style={{ '--i': 3 }}>
        <FilterPills
          ariaLabel="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          items={[
            { key: 'ALL', label: 'All', count: summary.count },
            { key: 'PAID', label: 'Paid', count: summary.paid },
            { key: 'PENDING', label: 'Pending', count: summary.pending },
            ...(summary.failed > 0 ? [{ key: 'FAILED', label: 'Failed', count: summary.failed }] : []),
          ]}
        />
        <div className="relative w-full sm:w-[280px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mute pointer-events-none" size={16} />
          <input
            type="text"
            aria-label="Search bill number or client"
            placeholder="Search bill number or client"
            className="w-full h-9 rounded-pill bg-well pl-10 pr-4 text-[13px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="m-rise" style={{ '--i': 4 }}>
      <Table>
        <TableHeader>
          <tr>
            <SortHead sort={sort} onSort={toggleSort} k="date">Date</SortHead>
            <SortHead sort={sort} onSort={toggleSort} k="invoice">Bill</SortHead>
            <SortHead sort={sort} onSort={toggleSort} k="client">Client</SortHead>
            <SortHead sort={sort} onSort={toggleSort} k="cashier">Cashier</SortHead>
            <SortHead sort={sort} onSort={toggleSort} k="items" numeric>Items</SortHead>
            <SortHead sort={sort} onSort={toggleSort} k="amount" numeric>Amount</SortHead>
            <SortHead sort={sort} onSort={toggleSort} k="status">Status</SortHead>
            <TableHead><span className="sr-only">Actions</span></TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {sortedSales.length > 0 ? sortedSales.map(renderRow) : (
            <tr>
              <td colSpan={8} className="px-4 py-14 text-center">
                <Receipt size={24} className="mx-auto mb-2 text-faint" />
                <div className="font-tight text-[14px] font-semibold text-ink">No sales match</div>
                <div className="mt-0.5 text-[12.5px] text-body">Adjust filters or date range.</div>
              </td>
            </tr>
          )}
        </TableBody>
      </Table>
      </div>
      {sortedSales.length > 0 && (
        <div className="m-rise px-1 pt-3.5 text-[13px] text-body" style={{ '--i': 5 }}>
          {sortedSales.length.toLocaleString('en-IN')} {sortedSales.length === 1 ? 'sale' : 'sales'} shown · click a row for its detail
        </div>
      )}

      {/* Sale detail, as a panel from the right so the list stays in view */}
      {detailSale && (() => {
        const status = getStatus(detailSale);
        const paid = isPaidStatus(status);
        const voided = isVoidStatus(status);
        const can = actionsFor(detailSale);
        // The client's TOTAL across all bills, so this one bill's balance
        // isn't mistaken for the whole account.
        const cid = detailSale.customerInfo?.id || detailSale.shopId || null;
        const cli = cid ? (clients || []).find(c => c.id === cid) : null;
        const clientOutstanding = Number(cli?.outstanding_balance) || 0;
        const clientBills = cid
          ? (invoices || []).filter(i => i.client_id === cid && !i.deleted_at && (i.payment_status || '').toUpperCase() !== 'PAID').length
          : 0;
        const settleOpen = !paid && !voided && !!onSettle;
        return (
          <SidePanel
            open
            onClose={closeDetail}
            eyebrow={<span className="flex flex-wrap gap-1.5 normal-case tracking-normal">{statusPills(detailSale)}</span>}
            title={`Bill ${shortRef(detailSale.id)}`}
            subtitle={`${getClientName(detailSale)} · ${whenOf(detailSale)}`}
            footer={
              <>
                {settleOpen && <label htmlFor="settle-amt" className="block mb-1.5 font-tight text-[12.5px] font-semibold text-ink-2">Record a payment on this bill</label>}
                <div className="flex items-center gap-2">
                  {settleOpen && (
                    <>
                      <Input
                        id="settle-amt"
                        type="number"
                        min="0"
                        step="0.01"
                        value={settleInput}
                        onChange={e => setSettleInput(e.target.value)}
                        placeholder="Amount"
                        className="flex-1 h-10"
                      />
                      <Button onClick={handleSettle}>Record payment</Button>
                    </>
                  )}
                  <Button variant="secondary" onClick={() => onPrint(detailSale)} className={settleOpen ? '' : 'w-full'}>
                    <Printer /> Print
                  </Button>
                </div>
              </>
            }
          >
            <SaleDetail
              sale={detailSale}
              clientName={getClientName(detailSale)}
              cashier={getCashier(detailSale)}
              productNameOf={getProductName}
              outstanding={outstandingOf(detailSale)}
              when={whenOf(detailSale)}
              clientName2={cli?.name}
              clientOutstanding={clientOutstanding}
              clientBills={clientBills}
            />
            <div className="flex flex-wrap gap-1.5 mt-3">
              {can.dispatch && (
                <Button variant="secondary" size="sm" title="Mark as dispatched, deducts stock"
                  onClick={() => { onDispatch(detailSale.id); closeDetail(); }}>
                  Mark as dispatched
                </Button>
              )}
              {can.edit && (
                <Button variant="secondary" size="sm" title="Edit sale, stock and balance re-sync"
                  onClick={() => { const s = detailSale; closeDetail(); onEdit(s); }}>
                  Edit sale
                </Button>
              )}
              {can.ret && (
                <Button variant="secondary" size="sm"
                  onClick={() => { const s = detailSale; closeDetail(); onReturn(s); }}>
                  Return items
                </Button>
              )}
              {can.convert && (
                <Button variant="secondary" size="sm" disabled={can.converted}
                  title={can.converted ? 'GST invoice already issued' : 'Convert to GST invoice'}
                  onClick={() => { const s = detailSale; closeDetail(); onConvertToInvoice(s); }}>
                  {can.converted ? 'GST invoice issued' : 'Issue GST invoice'}
                </Button>
              )}
              <HoldButton onConfirm={() => { const id = detailSale.id; closeDetail(); onDelete(id); }} title="Hold 1.5s to delete this bill"
                className="m-press h-8 px-3.5 rounded-pill font-tight text-[13px] font-semibold text-bad-text shadow-[inset_0_0_0_1px_#F5C2C2] hover:bg-bad-soft">
                Hold to delete
              </HoldButton>
            </div>
          </SidePanel>
        );
      })()}
    </div>
  );
};

// ------------------------------------------------------------------
// Subcomponents
// ------------------------------------------------------------------

/** "Label Value ▾" filter menu: a native select dressed as a pill. */
/** A column head that sorts; the sorted one shows its direction in amber. */
const SortHead = ({ k, sort, onSort, children, numeric }) => {
  const on = sort.key === k;
  return (
    <TableHead numeric={numeric} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-ink transition-colors duration-(--dur-press) cursor-pointer select-none">
        {children}
        {on && <span className="text-amber" aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </TableHead>
  );
};

const MenuSelect = ({ label, value, onChange, options }) => (
  <label className="relative inline-flex items-center gap-1.5 rounded-pill pl-3.5 pr-8 py-[7px] font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] cursor-pointer hover:bg-tile transition-colors duration-(--dur-press)">
    <em className="not-italic font-medium text-mute">{label}</em>
    <select value={value} onChange={e => onChange(e.target.value)} title={label}
      className="appearance-none bg-transparent outline-none cursor-pointer max-w-[140px] truncate">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <ChevronDown size={14} className="absolute right-3 text-mute pointer-events-none" />
  </label>
);

/**
 * The row's "···" menu. Drawn in a portal at a fixed position under its
 * button, so the table's own scroll box cannot clip it. Escape, a click
 * elsewhere or a scroll closes it.
 */
const RowMenu = ({ label, children }) => {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const close = useCallback(() => setPos(null), []);
  useEffect(() => {
    if (!pos) return undefined;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos, close]);
  const toggle = () => {
    if (pos) { close(); return; }
    const r = btnRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 320;
    setPos({ right: window.innerWidth - r.right, ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) });
  };
  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} aria-label={label} title="More" aria-haspopup="menu" aria-expanded={!!pos}
        className="m-press inline-grid place-items-center w-8 h-7 rounded-xl text-mute hover:bg-well hover:text-ink font-tight text-[15px] font-bold tracking-[2px]">
        ···
      </button>
      {pos && createPortal(
        <div ref={menuRef} role="menu" aria-label={label} style={{ position: 'fixed', ...pos }}
          className="m-dialog z-[140] w-[220px] rounded-xl bg-surface p-1 text-left shadow-[0_0_0_1px_var(--color-line),0_16px_40px_-16px_rgba(17,20,24,0.35)]">
          {children(close)}
        </div>,
        document.body,
      )}
    </>
  );
};

const MenuItem = ({ icon: Icon, children, onClick, disabled, title }) => (
  <button type="button" role="menuitem" onClick={onClick} disabled={disabled} title={title}
    className="flex w-full items-center gap-2.5 rounded-pill px-3 py-2 text-left font-tight text-[13px] font-semibold text-ink-2 hover:bg-tile disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent">
    {Icon && <Icon size={15} className="text-mute shrink-0" />}
    {children}
  </button>
);

const SaleDetail = ({
  sale, clientName, cashier, productNameOf, outstanding, when,
  clientName2, clientOutstanding = 0, clientBills = 0,
}) => {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const status = (sale.paymentStatus ?? sale.status ?? 'PENDING').toUpperCase();
  const paid = isPaidStatus(status);
  const voided = isVoidStatus(status);

  return (
    <div>
      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <MetaTile label="Date" value={when} />
        <MetaTile label="Client" value={clientName} />
        <MetaTile label="Cashier" value={cashier || '—'} />
        <MetaTile
          label="Status"
          value={voided ? 'Failed or voided' : paid ? 'Paid' : 'Pending'}
          tone={voided ? 'red' : paid ? 'emerald' : 'amber'}
        />
      </div>

      {/* Line items */}
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="font-tight text-[11.5px] font-semibold text-mute">
            <th className="py-2 pr-2.5 text-left border-b border-line">Item</th>
            <th className="py-2 px-2.5 text-right border-b border-line">Qty</th>
            <th className="py-2 px-2.5 text-right border-b border-line">Price</th>
            <th className="py-2 pl-2.5 text-right border-b border-line">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={4} className="py-6 text-center text-[12.5px] text-mute">No line items</td></tr>
          ) : items.map((it, idx) => {
            const name = it.name || productNameOf(it.id || it.productId);
            const qty = Number(it.quantity) || 0;
            const price = Number(it.rate ?? it.price ?? it.unitPrice ?? it.sellingPrice ?? 0);
            const total = qty * price;
            return (
              <tr key={idx} className="[&>td]:border-b [&>td]:border-sep last:[&>td]:border-b-0">
                <td className="py-[9px] pr-2.5 text-ink">{name}</td>
                <td className="py-[9px] px-2.5 text-right font-tight font-medium tabular-nums">{qty}</td>
                <td className="py-[9px] px-2.5 text-right font-tight font-medium tabular-nums text-ink-2">{formatCurrency(price)}</td>
                <td className="py-[9px] pl-2.5 text-right font-tight font-medium tabular-nums">{formatCurrency(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals — reconstruct Subtotal from Total so the column always ties
          out (Subtotal − Discount + Tax = Total). The stored subtotal is often
          null; falling back to totalAmount printed the already-net total as the
          "Subtotal" and then subtracted the discount again, so it didn't add up. */}
      {(() => {
        const disc = Number(sale.discount) || 0;
        const tax  = Number(sale.tax) || 0;
        const shownSubtotal = (Number(sale.totalAmount) || 0) + disc - tax;
        return (
      <div className="mt-3.5 rounded-xl bg-tile px-3.5 py-3">
        <TotalRow label="Subtotal" value={formatCurrency(shownSubtotal)} />
        {sale.discount > 0 && <TotalRow label="Discount" value={`−${formatCurrency(sale.discount)}`} />}
        {sale.tax > 0 && <TotalRow label="Tax" value={formatCurrency(sale.tax)} />}
        <TotalRow label="Total" value={formatCurrency(sale.totalAmount)} bold />
        {Number(sale.paidAmount) > 0 && (
          <TotalRow label="Paid on this bill" value={formatCurrency(sale.paidAmount)} tone="emerald" />
        )}
        {/* Actual tender. paidAmount is capped at the bill, so a customer who
            handed over more (change given, or the excess put against older
            dues) is invisible without this. Only shown when recorded —
            historical sales and phones older than v1.5.73 leave it null, and
            inventing a figure would be worse than omitting it. */}
        {(() => {
          const received = Number(sale.amount_received);
          if (!Number.isFinite(received) || received <= 0) return null;
          const extra = received - (Number(sale.totalAmount) || 0);
          return (
            <>
              <TotalRow label="Amount received" value={formatCurrency(received)} tone="emerald" />
              {extra > 0.5 && (
                /* Say which of the two fates this surplus met. "Excess
                   received" covered both and so told the reader neither: on a
                   cash sale it reads as money the shop is holding, when it was
                   handed back at the counter — and crediting that against the
                   client's dues pays the same rupees out twice. The payment
                   method decides it, exactly as it does at checkout, so one
                   sale reads the same on both screens. */
                <TotalRow
                  label={surplusLabel(sale.paymentMethod).label}
                  value={formatCurrency(extra)}
                />
              )}
            </>
          );
        })()}
        {/* "Outstanding" alone read as the client's whole account — this is
            only this bill. Relabelled, with the account total shown separately
            when it differs. */}
        {!paid && !voided && outstanding > 0 && (
          <TotalRow label="Balance due, this bill" value={formatCurrency(outstanding)} tone="amber" bold />
        )}
        {!paid && !voided && clientOutstanding > 0 && Math.abs(clientOutstanding - outstanding) > 0.5 && (
          <div className="flex items-center justify-between gap-3 pt-1.5 text-[12px] text-mute">
            <span>{clientName2 || clientName}, total owed</span>
            <span className="font-tight tabular-nums">
              {formatCurrency(clientOutstanding)}{clientBills > 1 ? ` · ${clientBills} bills` : ''}
            </span>
          </div>
        )}
        {voided && (
          <TotalRow label="Status" value="Voided, no payment due" tone="red" bold />
        )}
      </div>
        );
      })()}
    </div>
  );
};

const MetaTile = ({ label, value, tone }) => {
  const toneCls =
    tone === 'emerald' ? 'text-good-text'
    : tone === 'amber' ? 'text-amber-text'
    : tone === 'red' ? 'text-bad-text'
    : 'text-ink';
  return (
    <div className="rounded-[10px] bg-tile px-3 py-[9px] min-w-0">
      <span className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">{label}</span>
      <b className={`block mt-px font-tight text-[13.5px] font-semibold truncate ${toneCls}`}>{value}</b>
    </div>
  );
};

const TotalRow = ({ label, value, bold, tone }) => {
  const toneCls =
    tone === 'emerald' ? 'text-good-text'
    : tone === 'amber' ? 'text-amber-text'
    : tone === 'red' ? 'text-bad-text'
    : bold ? 'text-ink' : 'text-ink-2';
  return (
    <div className={`flex items-center justify-between gap-3 py-[3px] text-[13px] ${bold && tone !== 'amber' && tone !== 'red' ? 'mt-1.5 pt-[9px] border-t border-line' : ''}`}>
      <span className={bold ? `font-tight font-semibold ${tone === 'amber' ? 'text-amber-text' : tone === 'red' ? 'text-bad-text' : 'text-ink'}` : 'text-body'}>{label}</span>
      <span className={`font-tight tabular-nums ${bold ? 'font-semibold' : 'font-medium'} ${toneCls}`}>{value}</span>
    </div>
  );
};

export default InvoiceList;
