import React, { useState, useMemo, useCallback } from 'react';
import {
  FileText, Plus, Search, TrendingUp,
  CheckCircle, Clock, AlertTriangle,
  Printer, Share2, Eye, Trash2, X,
  Calendar, Download, Zap, Package,
  CheckCircle2, CreditCard, Wallet, Landmark, Truck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useSales } from '../hooks/useSales';
import { useInventory } from '../hooks/useInventory';
import { usePeople } from '../hooks/usePeople';
import { formatINR, calculateGST, shareToWhatsApp } from '../lib/gstEngine';
import { formatCurrency, todayISOInAppTZ, formatDate, formatDateTime, parseLocalDate } from '../lib/utils';
import InvoiceTemplate from '../components/invoice/InvoiceTemplate';
import POSReceipt from '../components/invoice/POSReceipt';
import Modal from '../shared/Modal';
import Table from '../shared/Table';

// ── helpers ───────────────────────────────────────────────────────────
const isPaid  = (s) => s === 'PAID';
const isUnpaid = (s) => s === 'UNPAID' || s === 'PARTIAL';

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

// ── sub-components ────────────────────────────────────────────────────
const SummaryCard = ({ label, value, sub, tone }) => {
  const cls = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : tone === 'rose' ? 'text-rose-500' : 'text-ink-primary';
  return (
    <div className="bg-white rounded-2xl border border-black/5 px-4 py-3">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] font-semibold text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const map = {
    PAID:    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60',
    UNPAID:  'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60',
    PARTIAL: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60',
    OVERDUE: 'bg-rose-50 text-rose-600 ring-1 ring-rose-200/60',
  };
  const dot = {
    PAID: 'bg-emerald-500', UNPAID: 'bg-amber-500', PARTIAL: 'bg-blue-500', OVERDUE: 'bg-rose-500'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${map[status] || map.UNPAID}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status] || dot.UNPAID}`} />
      {status === 'UNPAID' ? 'Pending' : status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
};

const DateTab  = ({ k, label, active, onClick }) => (
  <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${active ? 'bg-accent-signature text-button-text' : 'bg-white text-gray-600 hover:text-ink-primary border border-black/5'}`}>{label}</button>
);

const StatusTab = ({ k, label, count, active, onClick }) => (
  <button onClick={onClick} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${active ? 'bg-ink-primary text-surface' : 'bg-white text-gray-600 hover:text-ink-primary border border-black/5'}`}>
    {label}{count != null && <span className={`ml-1.5 ${active ? 'opacity-70' : 'text-gray-400'}`}>{count}</span>}
  </button>
);

const MetaRow = ({ icon: Icon, label, value, tone }) => {
  const cls = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-ink-primary';
  return (
    <div className="flex items-start gap-2.5 p-3 bg-canvas rounded-xl">
      <Icon size={14} className="text-gray-400 mt-0.5" />
      <div><div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div></div>
    </div>
  );
};

const TotalRow = ({ label, value, bold, tone }) => {
  const cls = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-ink-primary';
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs font-semibold ${bold ? 'text-ink-primary' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${cls}`}>{value}</span>
    </div>
  );
};

// ── main ──────────────────────────────────────────────────────────────
const Invoices = () => {
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile, currentTenant } = useTenant();
  const { invoices, createInvoice, markInvoicePaid, enqueueIrn, refetch: refetchInvoices } = useSales(currentTenantId, { plan: currentTenant?.plan || 'STARTER' });
  const { products } = useInventory(currentTenantId);
  const { clients }  = usePeople(currentTenantId);

  // view state
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [invoiceMode,    setInvoiceMode]    = useState('gst');
  const [detailInv,      setDetailInv]      = useState(null);
  const [settleInput,    setSettleInput]    = useState('');

  // filters
  const [searchTerm,   setSearchTerm]   = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFilter,   setDateFilter]   = useState('ALL');
  const [customRange,  setCustomRange]  = useState({ from: '', to: '' });

  // creator
  const [showCreator, setShowCreator] = useState(false);
  const [draft, setDraft] = useState({
    clientId: '', items: [],
    date: todayISOInAppTZ(),
    dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
    notes: '', terms: businessProfile?.invoice_terms || '', paymentMethod: 'Cash'
  });

  // ── lookups ───────────────────────────────────────────────────────
  const clientOf = useCallback((inv) =>
    clients.find(c => c.id === inv.client_id) || { name: inv.client_name || 'Walk-in' },
  [clients]);

  const outstandingOf = (inv) => Math.max(0, (inv.grand_total || 0) - (inv.paid_amount || 0));

  const resolveStatus = (inv) => {
    if (isPaid(inv.payment_status)) return 'PAID';
    if (inv.payment_status === 'PARTIAL') return 'PARTIAL';
    if (inv.due_date && parseLocalDate(inv.due_date) < new Date()) return 'OVERDUE';
    return 'UNPAID';
  };

  // ── date filter ───────────────────────────────────────────────────
  const inDateRange = useCallback((inv) => {
    if (dateFilter === 'ALL') return true;
    const d = (inv.invoice_date || '').slice(0, 10);
    if (!d) return false;
    const today = todayISOInAppTZ();
    if (dateFilter === 'TODAY') return d === today;
    const todayMs = new Date(today + 'T00:00:00Z').getTime();
    const dMs     = new Date(d + 'T00:00:00Z').getTime();
    if (dateFilter === '7D')  return dMs >= todayMs - 7  * 86400000;
    if (dateFilter === '30D') return dMs >= todayMs - 30 * 86400000;
    if (dateFilter === 'CUSTOM') {
      if (customRange.from && d < customRange.from) return false;
      if (customRange.to   && d > customRange.to)   return false;
      return true;
    }
    return true;
  }, [dateFilter, customRange]);

  // ── summary ───────────────────────────────────────────────────────
  const summary = useMemo(() => {
    let revenue = 0, paidAmt = 0, paidCt = 0, unpaidCt = 0, unpaidAmt = 0, overdue = 0;
    for (const inv of invoices) {
      if (!inDateRange(inv)) continue;
      const gt = inv.grand_total || 0;
      revenue += gt;
      const st = resolveStatus(inv);
      if (st === 'PAID') { paidAmt += gt; paidCt++; }
      else { unpaidCt++; unpaidAmt += outstandingOf(inv); if (st === 'OVERDUE') overdue += outstandingOf(inv); }
    }
    return { revenue, paidAmt, paidCt, unpaidCt, unpaidAmt, overdue, count: paidCt + unpaidCt };
  }, [invoices, inDateRange]);

  // ── filtered list ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return invoices
      .filter(inv => {
        if (!inDateRange(inv)) return false;
        const st = resolveStatus(inv);
        if (statusFilter !== 'ALL' && st !== statusFilter) return false;
        if (!q) return true;
        const name = clientOf(inv)?.name?.toLowerCase() || '';
        return (inv.invoice_number || '').toLowerCase().includes(q) || name.includes(q);
      })
      .sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date));
  }, [invoices, searchTerm, statusFilter, inDateRange, clientOf]);

  // ── export ────────────────────────────────────────────────────────
  const handleExport = () => {
    downloadCSV(
      filtered.map(inv => ({
        date: inv.invoice_date,
        invoice: inv.invoice_number,
        client: clientOf(inv)?.name || '',
        taxable: inv.taxable_amount ?? '',
        grand_total: inv.grand_total ?? 0,
        paid_amount: inv.paid_amount ?? 0,
        outstanding: outstandingOf(inv),
        status: resolveStatus(inv),
      })),
      `invoices_${todayISOInAppTZ()}.csv`
    );
  };

  // ── settle ────────────────────────────────────────────────────────
  const handleSettle = async () => {
    if (!detailInv) return;
    const amt = parseFloat(settleInput);
    const out = outstandingOf(detailInv);
    if (!amt || amt <= 0) return alert('Enter positive amount');
    if (amt > out) return alert(`Max payable: ${formatCurrency(out)}`);
    if (amt >= out) {
      await markInvoicePaid(detailInv.id);
    } else {
      // partial — update paid_amount
      const { supabase } = await import('../lib/supabase');
      await supabase.from('invoices')
        .update({ paid_amount: (detailInv.paid_amount || 0) + amt, payment_status: 'PARTIAL' })
        .eq('id', detailInv.id);
    }
    setSettleInput('');
    setDetailInv(null);
  };

  // ── create invoice ────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!draft.clientId || draft.items.length === 0) return;
    const client  = clients.find(c => c.id === draft.clientId);
    const gstData = calculateGST(draft.items, businessProfile.state, client.state);
    await createInvoice({
      ...draft,
      client_id: draft.clientId, client_name: client.name,
      items: gstData.items, subtotal: gstData.subtotal,
      tax_total: gstData.totalTax, cgst_amount: gstData.cgst,
      sgst_amount: gstData.sgst, igst_amount: gstData.igst,
      grand_total: gstData.grandTotal, round_off: gstData.roundOff,
      is_interstate: gstData.isInterstate,
      invoice_date: draft.date, due_date: draft.dueDate, payment_status: 'UNPAID'
    });
    setShowCreator(false);
    setDraft({ clientId: '', items: [], date: todayISOInAppTZ(),
      dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      notes: '', terms: businessProfile?.invoice_terms || '', paymentMethod: 'Cash' });
  };

  // ── live GST preview ─────────────────────────────────────────────
  const draftClient = useMemo(() => clients.find(c => c.id === draft.clientId), [clients, draft.clientId]);
  const draftGST = useMemo(() => {
    if (!draft.items.length) return null;
    const sellerState = businessProfile?.state || '';
    const buyerState  = draftClient?.state || sellerState;
    return calculateGST(draft.items, sellerState, buyerState);
  }, [draft.items, draftClient, businessProfile]);

  // ── table definition ──────────────────────────────────────────────
  const headers = [
    { label: 'Date' },
    { label: 'Invoice #' },
    { label: 'Client' },
    { label: 'Amount', className: 'text-right' },
    { label: 'Status' },
    { label: '', className: 'text-right' },
  ];

  const renderRow = (inv) => {
    const client  = clientOf(inv);
    const status  = resolveStatus(inv);
    const out     = outstandingOf(inv);

    return (
      <tr
        key={inv.id}
        onClick={() => setDetailInv(inv)}
        className="group hover:bg-canvas/70 transition-colors cursor-pointer"
      >
        <td className="px-4 py-4">
          <div className="text-sm font-semibold text-ink-primary">{formatDate(inv.invoice_date)}</div>
          {inv.due_date && status !== 'PAID' && (
            <div className="text-[11px] font-medium text-gray-500 mt-0.5">Due {formatDate(inv.due_date)}</div>
          )}
        </td>
        <td className="px-4 py-4">
          <div className="text-sm font-bold text-ink-primary tracking-tight">#{inv.invoice_number}</div>
        </td>
        <td className="px-4 py-4">
          <div className="text-sm font-semibold text-ink-primary">{client?.name}</div>
          <div className="text-[11px] font-medium text-gray-500 mt-0.5">{client?.gstin || client?.gst_no || 'URD'}</div>
        </td>
        <td className="px-4 py-4 text-right">
          <div className="text-sm font-bold text-ink-primary tabular-nums">{formatCurrency(inv.grand_total)}</div>
          {out > 0 && status !== 'PAID' && (
            <div className="text-[11px] font-semibold text-amber-600 tabular-nums mt-0.5">Due: {formatCurrency(out)}</div>
          )}
        </td>
        <td className="px-4 py-4">
          <div className="flex flex-col gap-1">
            <StatusBadge status={status} />
            {inv.delivery_required && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                inv.delivery_status === 'DELIVERED'  ? 'bg-green-50 text-green-700' :
                inv.delivery_status === 'IN_TRANSIT' ? 'bg-blue-50 text-blue-700'  :
                'bg-orange-50 text-orange-700'
              }`}>
                <Truck size={9} />
                {inv.delivery_status === 'DELIVERED' ? 'Delivered' : inv.delivery_status === 'IN_TRANSIT' ? 'In Transit' : 'Awaiting Dispatch'}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-4 text-right" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            {/* Delivery toggle */}
            <button
              onClick={async () => {
                const { supabase } = await import('../lib/supabase');
                const newRequired = !inv.delivery_required;
                await supabase.from('invoices')
                  .update({ delivery_required: newRequired, delivery_status: newRequired ? 'PENDING' : null })
                  .eq('id', inv.id);
                refetchInvoices?.();
              }}
              title={inv.delivery_required ? 'Remove delivery flag' : 'Mark as requires delivery'}
              className={`p-2 rounded-lg transition-colors ${inv.delivery_required ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'hover:bg-blue-50 text-gray-400 hover:text-blue-600'}`}
            >
              <Truck size={15} />
            </button>
            {status !== 'PAID' && (
              <button
                onClick={() => { setDetailInv(inv); setSettleInput(String(out)); }}
                title="Settle Payment"
                className="p-2 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors"
              >
                <CheckCircle2 size={15} />
              </button>
            )}
            <button
              onClick={() => { setViewingInvoice(inv); setInvoiceMode('gst'); }}
              title="View / Print"
              className="p-2 rounded-lg hover:bg-white text-gray-500 hover:text-ink-primary transition-colors"
            >
              <Printer size={15} />
            </button>
            <button
              onClick={() => shareToWhatsApp(inv, client, businessProfile)}
              title="Share WhatsApp"
              className="p-2 rounded-lg hover:bg-[#25D366]/10 text-gray-400 hover:text-[#25D366] transition-colors"
            >
              <Share2 size={15} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // ── render ────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in flex flex-col gap-6 pb-16">

      {/* Header */}
      <div className="flex justify-between items-center py-2 border-b border-black/5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black font-sora text-ink-primary leading-none">
            Invoices<span className="text-accent-signature">.</span>
          </h1>
          <span className="text-[10px] font-semibold text-gray-400 hidden sm:block">GST billing & settlement</span>
        </div>
        <button
          onClick={() => setShowCreator(true)}
          className="btn-signature flex items-center gap-2 text-xs font-black"
        >
          <Plus size={12} /> New Invoice
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Billed"  value={formatCurrency(summary.revenue)} />
        <SummaryCard label="Collected"     value={formatCurrency(summary.paidAmt)}  tone="emerald" />
        <SummaryCard label="Outstanding"   value={formatCurrency(summary.unpaidAmt)}
          sub={summary.unpaidCt > 0 ? `${summary.unpaidCt} invoice${summary.unpaidCt > 1 ? 's' : ''}` : null}
          tone="amber" />
        <SummaryCard label="Overdue"       value={formatCurrency(summary.overdue)}  tone="rose" />
      </div>

      {/* Date range */}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar size={14} className="text-gray-400" />
        {[['ALL','All time'],['TODAY','Today'],['7D','7 days'],['30D','30 days'],['CUSTOM','Custom']].map(([k,l]) => (
          <DateTab key={k} k={k} label={l} active={dateFilter === k} onClick={() => setDateFilter(k)} />
        ))}
        {dateFilter === 'CUSTOM' && (
          <div className="flex items-center gap-2 ml-2">
            <input type="date" value={customRange.from} onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))}
              className="px-2.5 py-1.5 rounded-lg border border-black/10 text-xs font-semibold bg-white" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={customRange.to} onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))}
              className="px-2.5 py-1.5 rounded-lg border border-black/10 text-xs font-semibold bg-white" />
          </div>
        )}
      </div>

      {/* Search + status + export */}
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
          {[['ALL','All',summary.count],['PAID','Paid',summary.paidCt],['UNPAID','Pending',summary.unpaidCt],['OVERDUE','Overdue',null]].map(([k,l,c]) => (
            <StatusTab key={k} k={k} label={l} count={c} active={statusFilter === k} onClick={() => setStatusFilter(k)} />
          ))}
          <button
            onClick={handleExport}
            disabled={!filtered.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-black/5 text-gray-700 hover:text-ink-primary hover:border-black/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* Table */}
      <Table
        headers={headers}
        rows={filtered}
        renderRow={renderRow}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8 text-gray-500">
            <FileText size={24} className="opacity-40" />
            <div className="text-sm font-semibold">No invoices match</div>
            <div className="text-xs">Adjust filters or create a new invoice.</div>
          </div>
        }
      />

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
            const status = resolveStatus(inv);
            const out    = outstandingOf(inv);
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

                {/* Line items */}
                <div className="border border-black/5 rounded-xl overflow-hidden">
                  <div className="bg-canvas px-4 py-2 text-[11px] font-bold text-gray-600 uppercase tracking-wider grid grid-cols-12 gap-2">
                    <div className="col-span-6">Item</div>
                    <div className="col-span-2 text-center">Qty</div>
                    <div className="col-span-2 text-right">Rate</div>
                    <div className="col-span-2 text-right">Total</div>
                  </div>
                  {items.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-500">No line items</div>
                  ) : items.map((it, idx) => {
                    const qty   = Number(it.qty || it.quantity || 0);
                    const rate  = Number(it.rate || it.price || 0);
                    const taxAmt = Number(it.taxAmount || 0);
                    return (
                      <div key={idx} className="px-4 py-2.5 text-sm grid grid-cols-12 gap-2 items-center border-t border-black/5">
                        <div className="col-span-6 font-semibold text-ink-primary truncate">{it.name}</div>
                        <div className="col-span-2 text-center font-semibold text-gray-600">{qty}</div>
                        <div className="col-span-2 text-right text-gray-600 tabular-nums">{formatCurrency(rate)}</div>
                        <div className="col-span-2 text-right font-bold text-ink-primary tabular-nums">{formatCurrency(qty * rate + taxAmt)}</div>
                      </div>
                    );
                  })}
                </div>

                {/* IRN status */}
                <div className={`rounded-xl p-4 border ${
                  inv.irn_status === 'SUCCESS' ? 'bg-emerald-50 border-emerald-200' :
                  inv.irn_status === 'FAILED'  ? 'bg-red-50 border-red-200' :
                  inv.irn_status === 'PENDING' || inv.irn_status === 'PROCESSING' ? 'bg-amber-50 border-amber-200' :
                  'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">E-Invoice IRN</p>
                      <p className={`text-sm font-bold mt-0.5 ${
                        inv.irn_status === 'SUCCESS' ? 'text-emerald-700' :
                        inv.irn_status === 'FAILED'  ? 'text-red-700' :
                        inv.irn_status === 'PENDING' || inv.irn_status === 'PROCESSING' ? 'text-amber-700' :
                        'text-gray-700'
                      }`}>
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
                        className="px-3 py-1.5 rounded-pill bg-ink-primary text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
                      >
                        Generate IRN
                      </button>
                    )}
                  </div>
                  {inv.ack_no && (
                    <p className="text-[10px] text-gray-500 mt-1.5 font-mono">Ack: {inv.ack_no} · {inv.ack_date}</p>
                  )}
                </div>

                {/* Totals */}
                <div className="bg-canvas rounded-xl p-4 space-y-1.5">
                  <TotalRow label="Taxable Amount" value={formatCurrency(inv.taxable_amount)} />
                  {(inv.cgst_amount > 0) && <TotalRow label="CGST" value={formatCurrency(inv.cgst_amount)} />}
                  {(inv.sgst_amount > 0) && <TotalRow label="SGST" value={formatCurrency(inv.sgst_amount)} />}
                  {(inv.igst_amount > 0) && <TotalRow label="IGST" value={formatCurrency(inv.igst_amount)} />}
                  <div className="h-px bg-black/10 my-2" />
                  <TotalRow label="Grand Total" value={formatCurrency(inv.grand_total)} bold />
                  {Number(inv.paid_amount) > 0 && <TotalRow label="Paid" value={formatCurrency(inv.paid_amount)} tone="emerald" />}
                  {out > 0 && status !== 'PAID' && <TotalRow label="Outstanding" value={formatCurrency(out)} tone="amber" bold />}
                </div>

                {/* Settle + print */}
                <div className="flex items-center gap-2">
                  {status !== 'PAID' && (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="number" min="0" step="0.01"
                        value={settleInput}
                        onChange={e => setSettleInput(e.target.value)}
                        placeholder="Amount to collect"
                        className="flex-1 px-3 py-2.5 rounded-lg border border-black/10 text-sm font-semibold"
                      />
                      <button
                        onClick={handleSettle}
                        className="px-4 py-2.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={14} /> Record Payment
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => { setDetailInv(null); setViewingInvoice(inv); setInvoiceMode('gst'); }}
                    className="px-4 py-2.5 rounded-lg bg-ink-primary text-surface text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
                  >
                    <Printer size={14} /> Print
                  </button>
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

      {/* Creator modal */}
      {showCreator && (
        <div className="modal-overlay">
          <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col">

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-black/5">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">GST Compliant Billing</p>
                <h2 className="text-xl font-black text-ink-primary tracking-tight">New Invoice</h2>
              </div>
              <button onClick={() => setShowCreator(false)} className="w-9 h-9 rounded-xl bg-canvas border border-black/5 flex items-center justify-center text-gray-400 hover:bg-rose-50 hover:text-rose-500 transition-all">
                <X size={16} />
              </button>
            </div>

            {/* ── Body: left form + right summary ── */}
            <div className="flex flex-1 overflow-hidden">

              {/* Left: form */}
              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

                {/* Row 1: Client + Dates */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1 space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bill To</label>
                    <select
                      className="w-full bg-canvas border border-black/8 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-ink-primary/10 transition"
                      value={draft.clientId}
                      onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}
                    >
                      <option value="">Select client…</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {draftClient && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-canvas text-[10px] font-bold text-gray-500 border border-black/5">
                          {draftClient.gstin || draftClient.gst_no || 'URD'}
                        </span>
                        {draftClient.state && (
                          <span className="px-2 py-0.5 rounded-md bg-canvas text-[10px] font-bold text-gray-500 border border-black/5">
                            {draftClient.state}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Invoice Date</label>
                    <input type="date"
                      className="w-full bg-canvas border border-black/8 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-ink-primary/10 transition"
                      value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Due Date</label>
                    <input type="date"
                      className="w-full bg-canvas border border-black/8 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-ink-primary/10 transition"
                      value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
                  </div>
                </div>

                {/* Line items table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Line Items</label>
                    <button
                      onClick={() => setDraft({ ...draft, items: [...draft.items, { productId: '', name: '', qty: 1, rate: 0, taxRate: 18, hsn: '' }] })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition"
                    >
                      <Plus size={11} /> Add Item
                    </button>
                  </div>

                  {/* Table */}
                  <div className="border border-black/8 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-canvas border-b border-black/5">
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Item</th>
                          <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider w-24">HSN</th>
                          <th className="px-3 py-2.5 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider w-20">Qty</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider w-28">Rate (₹)</th>
                          <th className="px-3 py-2.5 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider w-20">GST %</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider w-28">Amount</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {draft.items.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-xs font-semibold text-gray-400">
                              No items — click Add Item to begin
                            </td>
                          </tr>
                        )}
                        {draft.items.map((item, index) => {
                          const lineAmt = Number(item.qty || 0) * Number(item.rate || 0);
                          return (
                            <tr key={index} className="hover:bg-canvas/50 transition-colors">
                              <td className="px-4 py-2">
                                <select
                                  className="w-full bg-transparent text-xs font-semibold text-ink-primary outline-none"
                                  value={item.productId}
                                  onChange={(e) => {
                                    const p = products.find(prod => prod.id === e.target.value);
                                    if (!p) return;
                                    const n = [...draft.items];
                                    n[index] = { ...item, productId: p.id, name: p.name, rate: p.sellingPrice, taxRate: p.taxRate || 18, hsn: p.hsn_code || '' };
                                    setDraft({ ...draft, items: n });
                                  }}
                                >
                                  <option value="">Select product…</option>
                                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="w-full bg-transparent text-xs font-mono text-gray-500 outline-none"
                                  placeholder="—"
                                  value={item.hsn}
                                  onChange={(e) => { const n = [...draft.items]; n[index].hsn = e.target.value; setDraft({ ...draft, items: n }); }}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" min="1"
                                  className="w-full bg-transparent text-xs font-bold text-center text-ink-primary outline-none"
                                  value={item.qty}
                                  onChange={(e) => { const n = [...draft.items]; n[index].qty = e.target.value; setDraft({ ...draft, items: n }); }}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" min="0"
                                  className="w-full bg-transparent text-xs font-bold text-right text-ink-primary outline-none"
                                  value={item.rate}
                                  onChange={(e) => { const n = [...draft.items]; n[index].rate = e.target.value; setDraft({ ...draft, items: n }); }}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  className="w-full bg-transparent text-xs font-semibold text-center text-gray-600 outline-none"
                                  value={item.taxRate}
                                  onChange={(e) => { const n = [...draft.items]; n[index].taxRate = Number(e.target.value); setDraft({ ...draft, items: n }); }}
                                >
                                  {[0,5,12,18,28].map(r => <option key={r} value={r}>{r}%</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-ink-primary tabular-nums">
                                ₹{lineAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-2 py-2">
                                <button onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:bg-rose-50 hover:text-rose-500 transition-all">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Notes (optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Payment instructions, bank details, thank you note…"
                    className="w-full bg-canvas border border-black/8 rounded-xl px-3 py-2.5 text-xs font-medium text-ink-primary outline-none focus:ring-2 focus:ring-ink-primary/10 transition resize-none"
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  />
                </div>
              </div>

              {/* Right: live summary */}
              <div className="w-64 border-l border-black/5 bg-canvas flex flex-col">
                <div className="flex-1 px-5 py-6 space-y-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Summary</p>

                  {/* GST breakdown */}
                  {draftGST ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 font-medium">Subtotal</span>
                        <span className="font-bold text-ink-primary tabular-nums">₹{draftGST.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      {draftGST.isInterstate ? (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500 font-medium">IGST</span>
                          <span className="font-semibold text-ink-primary tabular-nums">₹{draftGST.igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500 font-medium">CGST</span>
                            <span className="font-semibold text-ink-primary tabular-nums">₹{draftGST.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500 font-medium">SGST</span>
                            <span className="font-semibold text-ink-primary tabular-nums">₹{draftGST.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </>
                      )}
                      {draftGST.roundOff !== 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500 font-medium">Round off</span>
                          <span className="font-semibold text-gray-500 tabular-nums">{draftGST.roundOff > 0 ? '+' : ''}{draftGST.roundOff.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="h-px bg-black/8 my-1" />
                      <div className="flex justify-between">
                        <span className="text-sm font-bold text-ink-primary">Total</span>
                        <span className="text-base font-black text-ink-primary tabular-nums">₹{draftGST.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      {draftGST.isInterstate && (
                        <p className="text-[10px] text-blue-500 font-semibold">Interstate — IGST applied</p>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 font-medium py-4 text-center">Add items to see totals</div>
                  )}

                  <div className="h-px bg-black/5" />

                  {/* Payment method */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Payment</label>
                    <div className="space-y-1">
                      {['Cash','Card','UPI','Bank Transfer','Credit'].map(m => (
                        <button key={m}
                          onClick={() => setDraft({ ...draft, paymentMethod: m })}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${draft.paymentMethod === m ? 'bg-ink-primary text-white' : 'bg-white text-gray-600 hover:bg-white/80 border border-black/5'}`}
                        >
                          {m}
                          {draft.paymentMethod === m && <CheckCircle2 size={12} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Create button */}
                <div className="px-5 py-5 border-t border-black/5 space-y-2">
                  <button
                    onClick={handleCreate}
                    disabled={!draft.clientId || draft.items.length === 0}
                    className="w-full bg-ink-primary text-white rounded-xl py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <CheckCircle size={14} /> Create Invoice
                  </button>
                  <button onClick={() => setShowCreator(false)} className="w-full py-2 text-xs font-semibold text-gray-400 hover:text-gray-600 transition">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
