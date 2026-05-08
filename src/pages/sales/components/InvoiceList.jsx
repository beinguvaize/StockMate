import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search, Trash2, Printer, Receipt, Package, Wallet, CreditCard, Landmark,
  Download, X, User, Clock, Calendar, CheckCircle2, AlertCircle, RotateCcw, Truck, PackageCheck
} from 'lucide-react';
import Table from '../../../shared/Table';
import Modal from '../../../shared/Modal';
import { supabase } from '../../../lib/supabase';
import { formatCurrency, formatDate, formatDateTime, todayISOInAppTZ, getAppTimezone, getAppLocale } from '../../../lib/utils';

// Payment method -> icon.
const PAY_ICON = {
  CASH: Wallet,
  CARD: CreditCard,
  UPI: Landmark,
  CREDIT: CreditCard,
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
const isPaidStatus = (s) => s === 'PAID' || s === 'COMPLETED';

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
  PENDING:    { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200/60',   dot: 'bg-amber-400',   label: 'Awaiting Dispatch' },
  IN_TRANSIT: { bg: 'bg-blue-50',    text: 'text-blue-700',    ring: 'ring-blue-200/60',    dot: 'bg-blue-500',    label: 'In Transit'        },
  DELIVERED:  { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200/60', dot: 'bg-emerald-500', label: 'Delivered'         },
  FAILED:     { bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-200/60',     dot: 'bg-red-400',     label: 'Failed'            },
};

const InvoiceList = ({ sales, clients, staff = [], products = [], invoices = [], onDelete, onPrint, onSettle, onReturn, onDispatch }) => {
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
  const [dateFilter, setDateFilter] = useState('ALL');     // ALL | TODAY | 7D | 30D | CUSTOM
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
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
    let revenue = 0, paid = 0, pending = 0, pendingAmt = 0;
    for (const s of sales) {
      if (!inDateRange(s)) continue;
      const amt = Number(s.totalAmount) || 0;
      revenue += amt;
      if (isPaidStatus(getStatus(s))) paid++;
      else { pending++; pendingAmt += outstandingOf(s); }
    }
    return { revenue, paid, pending, pendingAmt, count: paid + pending };
  }, [sales, inDateRange]);

  // ---------- Filtered rows ----------
  const filteredSales = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return sales.filter(sale => {
      if (!inDateRange(sale)) return false;
      const status = getStatus(sale);
      if (statusFilter === 'PAID' && !isPaidStatus(status)) return false;
      if (statusFilter === 'PENDING' && isPaidStatus(status)) return false;
      if (!q) return true;
      const name = getClientName(sale).toLowerCase();
      return (sale.id || '').toLowerCase().includes(q) || name.includes(q);
    });
  }, [sales, searchTerm, statusFilter, inDateRange, getClientName]);

  // ---------- CSV export ----------
  const handleExport = () => {
    const rows = filteredSales.map(s => ({
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

  const headers = [
    { label: 'Date / Time' },
    { label: 'Invoice' },
    { label: 'Client' },
    { label: 'Cashier' },
    { label: 'Items', className: 'text-center' },
    { label: 'Amount', className: 'text-right' },
    { label: 'Status', className: 'text-center' },
    { label: '', className: 'text-right' },
  ];

  const renderRow = (sale) => {
    const clientName = getClientName(sale);
    const status = getStatus(sale);
    const paid = isPaidStatus(status);
    const payMethod = (sale.paymentMethod || '').toUpperCase();
    const PayIcon = PAY_ICON[payMethod] || Wallet;
    const qty = itemCount(sale);
    const outstanding = outstandingOf(sale);
    const cashier = getCashier(sale);
    // Delivery status from linked invoice
    const linkedInvoice = invoices.find(i => i.sale_id === sale.id && i.delivery_required);
    const deliveryStatus = linkedInvoice?.delivery_status?.toUpperCase();
    const deliveryBadge = deliveryStatus ? DELIVERY_BADGE[deliveryStatus] : null;

    return (
      <tr
        key={sale.id}
        onClick={() => setDetailSale(sale)}
        className="group hover:bg-canvas/70 transition-colors cursor-pointer"
      >
        <td className="px-4 py-4">
          <div className="text-sm font-semibold text-ink-primary">{formatDate(sale.date)}</div>
          {sale.created_at && (
            <div className="text-[11px] font-medium text-gray-500 mt-0.5">{formatTime(sale.created_at)}</div>
          )}
        </td>
        <td className="px-4 py-4">
          <div className="text-sm font-bold text-ink-primary tracking-tight">#{shortRef(sale.id)}</div>
        </td>
        <td className="px-4 py-4">
          <div className="text-sm font-semibold text-ink-primary">{clientName}</div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-medium text-gray-500">
            <PayIcon size={12} />
            <span>{payMethod || '—'}</span>
          </div>
        </td>
        <td className="px-4 py-4">
          <div className="text-xs font-semibold text-gray-600">{cashier || '—'}</div>
        </td>
        <td className="px-4 py-4 text-center">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
            <Package size={12} className="opacity-60" /> {qty || 0}
          </span>
        </td>
        <td className="px-4 py-4 text-right">
          <div className="text-sm font-bold text-ink-primary tabular-nums">{formatCurrency(sale.totalAmount)}</div>
          {!paid && outstanding > 0 && (
            <div className="text-[11px] font-semibold text-amber-600 tabular-nums mt-0.5">
              Due: {formatCurrency(outstanding)}
            </div>
          )}
        </td>
        <td className="px-4 py-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
              paid
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60'
                : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${paid ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {paid ? 'Paid' : 'Pending'}
            </span>
            {deliveryBadge && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ring-1 ${deliveryBadge.bg} ${deliveryBadge.text} ${deliveryBadge.ring}`}>
                <Truck size={9} />
                {deliveryBadge.label}
              </span>
            )}
            {sale.fulfillment_status === 'PENDING_DISPATCH' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ring-1 bg-orange-50 text-orange-700 ring-orange-200/60">
                <PackageCheck size={9} />
                Pending Dispatch
              </span>
            )}
            {sale.fulfillment_status === 'DISPATCHED' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200/60">
                <PackageCheck size={9} />
                Dispatched
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-4 text-right" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            {!paid && onSettle && (
              <button
                onClick={() => { setDetailSale(sale); setSettleInput(String(outstanding)); }}
                title="Settle Payment"
                className="p-2 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors"
              >
                <CheckCircle2 size={15} />
              </button>
            )}
            {onDispatch && sale.fulfillment_status === 'PENDING_DISPATCH' && (
              <button
                onClick={() => onDispatch(sale.id)}
                title="Mark as Dispatched — deducts stock"
                className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-500 hover:text-emerald-700 transition-colors"
              >
                <PackageCheck size={15} />
              </button>
            )}
            {onReturn && Array.isArray(sale.items) && sale.items.length > 0 && (
              <button
                onClick={() => onReturn(sale)}
                title="Process Return"
                className="p-2 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600 transition-colors"
              >
                <RotateCcw size={15} />
              </button>
            )}
            <button onClick={() => onPrint(sale)} title="Print / View" className="p-2 rounded-lg hover:bg-white text-gray-500 hover:text-ink-primary transition-colors">
              <Printer size={15} />
            </button>
            <button onClick={() => onDelete(sale.id)} title="Delete" className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const StatusTab = ({ k, label, count }) => (
    <button
      onClick={() => setStatusFilter(k)}
      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        statusFilter === k
          ? 'bg-ink-primary text-surface'
          : 'bg-white text-gray-600 hover:text-ink-primary border border-black/5'
      }`}
    >
      {label}
      {count != null && (
        <span className={`ml-1.5 ${statusFilter === k ? 'opacity-70' : 'text-gray-400'}`}>{count}</span>
      )}
    </button>
  );

  const DateTab = ({ k, label }) => (
    <button
      onClick={() => setDateFilter(k)}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
        dateFilter === k
          ? 'bg-accent-signature text-button-text'
          : 'bg-white text-gray-600 hover:text-ink-primary border border-black/5'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Sales" value={summary.count} />
        <SummaryCard label="Revenue" value={formatCurrency(summary.revenue)} />
        <SummaryCard label="Paid" value={summary.paid} tone="emerald" />
        <SummaryCard
          label="Pending"
          value={summary.pending}
          sub={summary.pending > 0 ? `Due ${formatCurrency(summary.pendingAmt)}` : null}
          tone="amber"
        />
      </div>

      {/* Date range */}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar size={14} className="text-gray-400" />
        <DateTab k="ALL" label="All time" />
        <DateTab k="TODAY" label="Today" />
        <DateTab k="7D" label="7 days" />
        <DateTab k="30D" label="30 days" />
        <DateTab k="CUSTOM" label="Custom" />
        {dateFilter === 'CUSTOM' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customRange.from}
              onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))}
              className="px-2.5 py-1.5 rounded-lg border border-black/10 text-xs font-semibold bg-white"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={customRange.to}
              onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))}
              className="px-2.5 py-1.5 rounded-lg border border-black/10 text-xs font-semibold bg-white"
            />
          </div>
        )}
      </div>

      {/* Search + status tabs + export */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="relative flex-1 md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search invoice # or client…"
            className="w-full bg-white rounded-xl py-2.5 pl-10 pr-4 border border-black/5 outline-none focus:ring-2 focus:ring-accent-signature/30 text-sm font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <StatusTab k="ALL" label="All" count={summary.count} />
          <StatusTab k="PAID" label="Paid" count={summary.paid} />
          <StatusTab k="PENDING" label="Pending" count={summary.pending} />
          <button
            onClick={handleExport}
            disabled={!filteredSales.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-black/5 text-gray-700 hover:text-ink-primary hover:border-black/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Export CSV"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* Table */}
      <Table
        headers={headers}
        rows={filteredSales}
        renderRow={renderRow}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8 text-gray-500">
            <Receipt size={24} className="opacity-40" />
            <div className="text-sm font-semibold">No sales match</div>
            <div className="text-xs">Adjust filters or date range.</div>
          </div>
        }
      />

      {/* Detail drawer */}
      {detailSale && (
        <Modal
          isOpen={!!detailSale}
          onClose={() => { setDetailSale(null); setSettleInput(''); }}
          title={`Invoice #${shortRef(detailSale.id)}`}
          subtitle={`${getClientName(detailSale)} · ${formatDate(detailSale.date)}`}
          maxWidth="max-w-2xl"
        >
          <SaleDetail
            sale={detailSale}
            clientName={getClientName(detailSale)}
            cashier={getCashier(detailSale)}
            productNameOf={getProductName}
            outstanding={outstandingOf(detailSale)}
            settleInput={settleInput}
            setSettleInput={setSettleInput}
            onSettle={onSettle ? handleSettle : null}
            onPrint={() => onPrint(detailSale)}
          />
        </Modal>
      )}
    </div>
  );
};

// ------------------------------------------------------------------
// Subcomponents
// ------------------------------------------------------------------
const SummaryCard = ({ label, value, sub, tone }) => {
  const toneCls =
    tone === 'emerald' ? 'text-emerald-600'
    : tone === 'amber' ? 'text-amber-600'
    : 'text-ink-primary';
  return (
    <div className="bg-white rounded-2xl border border-black/5 px-4 py-3">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${toneCls}`}>{value}</div>
      {sub && <div className="text-[11px] font-semibold text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
};

const SaleDetail = ({
  sale, clientName, cashier, productNameOf, outstanding,
  settleInput, setSettleInput, onSettle, onPrint
}) => {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const status = (sale.paymentStatus ?? sale.status ?? 'PENDING').toUpperCase();
  const paid = isPaidStatus(status);

  return (
    <div className="space-y-5">
      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetaRow icon={Calendar} label="Date" value={formatDateTime(sale.created_at || sale.date)} />
        <MetaRow icon={User} label="Client" value={clientName} />
        <MetaRow icon={User} label="Cashier" value={cashier || '—'} />
        <MetaRow
          icon={paid ? CheckCircle2 : AlertCircle}
          label="Status"
          value={paid ? 'Paid' : 'Pending'}
          tone={paid ? 'emerald' : 'amber'}
        />
      </div>

      {/* Line items */}
      <div className="border border-black/5 rounded-xl overflow-hidden">
        <div className="bg-canvas px-4 py-2 text-[11px] font-bold text-gray-600 uppercase tracking-wider grid grid-cols-12 gap-2">
          <div className="col-span-6">Item</div>
          <div className="col-span-2 text-center">Qty</div>
          <div className="col-span-2 text-right">Price</div>
          <div className="col-span-2 text-right">Total</div>
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-500">No line items</div>
        ) : items.map((it, idx) => {
          const name = it.name || productNameOf(it.id || it.productId);
          const qty = Number(it.quantity) || 0;
          const price = Number(it.rate ?? it.price ?? it.unitPrice ?? it.sellingPrice ?? 0);
          const total = qty * price;
          return (
            <div key={idx} className="px-4 py-2.5 text-sm grid grid-cols-12 gap-2 items-center border-t border-black/5">
              <div className="col-span-6 font-semibold text-ink-primary truncate">{name}</div>
              <div className="col-span-2 text-center font-semibold text-gray-600">{qty}</div>
              <div className="col-span-2 text-right text-gray-600 tabular-nums">{formatCurrency(price)}</div>
              <div className="col-span-2 text-right font-bold text-ink-primary tabular-nums">{formatCurrency(total)}</div>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="bg-canvas rounded-xl p-4 space-y-1.5">
        <TotalRow label="Subtotal" value={formatCurrency(sale.subtotal ?? sale.totalAmount)} />
        {sale.discount > 0 && <TotalRow label="Discount" value={`− ${formatCurrency(sale.discount)}`} />}
        {sale.tax > 0 && <TotalRow label="Tax" value={formatCurrency(sale.tax)} />}
        <div className="h-px bg-black/10 my-2" />
        <TotalRow label="Total" value={formatCurrency(sale.totalAmount)} bold />
        {Number(sale.paidAmount) > 0 && (
          <TotalRow label="Paid" value={formatCurrency(sale.paidAmount)} tone="emerald" />
        )}
        {!paid && outstanding > 0 && (
          <TotalRow label="Outstanding" value={formatCurrency(outstanding)} tone="amber" bold />
        )}
      </div>

      {/* Settle + print */}
      <div className="flex items-center gap-2">
        {!paid && onSettle && (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="number"
              min="0"
              step="0.01"
              value={settleInput}
              onChange={e => setSettleInput(e.target.value)}
              placeholder="Amount"
              className="flex-1 px-3 py-2.5 rounded-lg border border-black/10 text-sm font-semibold"
            />
            <button
              onClick={onSettle}
              className="px-4 py-2.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 size={14} /> Record Payment
            </button>
          </div>
        )}
        <button
          onClick={onPrint}
          className="px-4 py-2.5 rounded-lg bg-ink-primary text-surface text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Printer size={14} /> Print
        </button>
      </div>
    </div>
  );
};

const MetaRow = ({ icon: Icon, label, value, tone }) => {
  const toneCls =
    tone === 'emerald' ? 'text-emerald-600'
    : tone === 'amber' ? 'text-amber-600'
    : 'text-ink-primary';
  return (
    <div className="flex items-start gap-2.5 p-3 bg-canvas rounded-xl">
      <Icon size={14} className="text-gray-400 mt-0.5" />
      <div>
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</div>
        <div className={`text-sm font-semibold ${toneCls}`}>{value}</div>
      </div>
    </div>
  );
};

const TotalRow = ({ label, value, bold, tone }) => {
  const toneCls =
    tone === 'emerald' ? 'text-emerald-600'
    : tone === 'amber' ? 'text-amber-600'
    : 'text-ink-primary';
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs font-semibold ${bold ? 'text-ink-primary' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${toneCls}`}>{value}</span>
    </div>
  );
};

export default InvoiceList;
