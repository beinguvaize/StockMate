import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { usePeople } from '../hooks/usePeople';
import { useSales } from '../hooks/useSales';
import { supabase } from '../lib/supabase';
import { PageSkeleton } from '../components/ui/States';
import {
  ArrowLeft, Calendar, FileText,
  CheckCircle2, AlertCircle, Search, Clock, Receipt,
  Wallet, CreditCard, Smartphone, Landmark, History, BookOpen,
  TrendingUp, TrendingDown, Phone, MapPin, Trash2, ChevronDown, Eye
} from 'lucide-react';
import { todayISOInAppTZ, formatDate, formatCurrency } from '../lib/utils';

const METHOD_ICON = {
  CASH: Wallet, CARD: CreditCard, UPI: Smartphone,
  BANK: Landmark, CHEQUE: Landmark,
};
const METHOD_LABEL = {
  CASH: 'Cash', CARD: 'Card', UPI: 'UPI',
  BANK: 'Bank Transfer', CHEQUE: 'Cheque',
};

const ClientSettlement = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { clients, recordClientPayment, deleteClientPayment, loading: peoLoading } = usePeople(currentTenantId);
  const { invoices, sales, loading: salesLoading } = useSales(currentTenantId);

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
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);
  const [paymentError, setPaymentError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  // ── Ledger view, matching the supplier ledger ───────────────────────────
  // The statement was a tab at the bottom of a third column. It is the thing
  // this page is about, so it now leads — same controls, same columns and the
  // same running balance the supplier side uses, so one screen teaches both.
  const [rightView, setRightView] = useState('LEDGER'); // LEDGER | SETTLE
  // Opens on this month. Older entries are not lost — the brought-forward
  // row carries their balance in, so the running figures stay true.
  const [range, setRange] = useState('1M');             // 1M | 3M | FY | ALL
  const [rowKind, setRowKind] = useState('ALL');        // ALL | SALE | PAYMENT
  const [newestFirst, setNewestFirst] = useState(false);

  // Fetch payment history + resolve collector names separately (no FK on recorded_by).
  useEffect(() => {
    if (!id || !currentTenantId) return;
    supabase
      .from('client_payments')
      .select('*')
      .eq('client_id', id)
      .eq('tenant_id', currentTenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(async ({ data, error }) => {
        if (error) { console.error('client_payments fetch error:', error); return; }
        if (!data) return;
        // Resolve collector names from profiles in one query.
        const userIds = [...new Set(data.map(p => p.recorded_by).filter(Boolean))];
        let nameMap = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', userIds);
          if (profiles) profiles.forEach(p => { nameMap[p.id] = p.name; });
        }
        setPaymentHistory(data.map(p => ({ ...p, collector: p.recorded_by ? { name: nameMap[p.recorded_by] || null } : null })));
      });
  }, [id, currentTenantId, success]); // refetch after successful payment

  // Full statement ledger: credit sales + invoices + payments, sorted by date, with running balance
  const statementRows = useMemo(() => {
    if (!client) return [];
    const rows = [];

    // Build sale method map + set of sale_ids already covered by an invoice.
    const saleMethodMap = {};
    (sales || []).forEach(s => { saleMethodMap[s.id] = (s.paymentMethod || '').toUpperCase(); });
    const invoicedSaleIds = new Set(
      (invoices || [])
        .filter(inv => String(inv.client_id) === String(client.id) && inv.deleted_at == null)
        .map(inv => inv.sale_id)
        .filter(Boolean)
    );

    // Credit POS sales NOT covered by an invoice (invoice-based sales show below).
    (sales || [])
      .filter(s => String(s.clientId) === String(client.id) && s.paymentMethod === 'CREDIT')
      .filter(s => !invoicedSaleIds.has(s.id))
      .forEach(s => rows.push({
        id: s.id,
        date: s.date || s.created_at?.slice(0, 10),
        created_at: s.created_at,
        description: `Credit Sale #${String(s.id).split('-').pop()}`,
        debit: Number(s.totalAmount) || 0,
        credit: 0,
        type: 'SALE',
      }));

    // Invoices — debit row only. Skip PAID+paid_amount=0: those are cash-at-POS
    // sales settled at checkout, not part of the credit ledger.
    // For CASH sales with orphan paid_amount (no client_payment row covers them),
    // emit a synthetic credit so the closing balance matches outstanding.
    (invoices || [])
      .filter(inv => String(inv.client_id) === String(client.id))
      .filter(inv => !(inv.payment_status === 'PAID' && (Number(inv.paid_amount) || 0) === 0))
      .forEach(inv => {
        const num = String(inv.invoice_number || '').replace(/^#+/, '');
        const invDate = inv.invoice_date || inv.created_at?.slice(0, 10);
        rows.push({
          id: inv.id,
          date: invDate,
          created_at: inv.created_at,
          description: `Invoice #${num}`,
          debit: Number(inv.grand_total) || 0,
          credit: 0,
          type: 'INVOICE',
        });
        // Orphan cash payment: sale is non-CREDIT with paid_amount > 0 but no
        // client_payment row — add synthetic credit to balance the statement.
        const saleMethod = saleMethodMap[inv.sale_id] || '';
        const orphanPaid = Number(inv.paid_amount) || 0;
        if (orphanPaid > 0 && saleMethod !== 'CREDIT' && saleMethod !== '') {
          rows.push({
            id: `${inv.id}-orphan`,
            date: invDate,
            created_at: inv.created_at,
            description: `Payment (Cash) — Invoice #${num}`,
            debit: 0,
            credit: orphanPaid,
            type: 'PAYMENT',
          });
        }
      });

    // CASH partial sales with no invoice — not captured above but contribute
    // to outstanding_balance. Show debit (full amount) + synthetic credit
    // (amount already paid) so the closing balance reflects the remaining due.
    (sales || [])
      .filter(s => String(s.shopId) === String(client.id) || String(s.clientId) === String(client.id))
      .filter(s => (s.paymentMethod || '').toUpperCase() !== 'CREDIT')
      .filter(s => ['PARTIAL', 'UNPAID', 'PENDING'].includes((s.paymentStatus || s.status || '').toUpperCase()))
      .filter(s => !invoicedSaleIds.has(s.id))
      .filter(s => !s.deleted_at)
      .forEach(s => {
        const saleDate = s.date || s.created_at?.slice(0, 10);
        const total = Number(s.totalAmount) || 0;
        const paid = Number(s.paidAmount) || 0;
        rows.push({
          id: `${s.id}-cash-debit`,
          date: saleDate,
          created_at: s.created_at,
          description: `Cash Sale #${String(s.id).split('-').pop()}`,
          debit: total,
          credit: 0,
          type: 'SALE',
        });
        if (paid > 0) {
          rows.push({
            id: `${s.id}-cash-credit`,
            date: saleDate,
            created_at: s.created_at,
            description: `Payment (Cash) — Sale #${String(s.id).split('-').pop()}`,
            debit: 0,
            credit: paid,
            type: 'PAYMENT',
          });
        }
      });

    // Payments from client_payments table.
    paymentHistory.forEach(p => rows.push({
      id: p.id,
      date: p.date,
      created_at: p.created_at,
      description: `Payment (${METHOD_LABEL[p.payment_method] || p.payment_method})${p.notes ? ' — ' + p.notes : ''}`,
      debit: 0,
      credit: Number(p.amount) || 0,
      type: 'PAYMENT',
    }));

    rows.sort((a, b) => {
      const da = a.date || a.created_at || '';
      const db = b.date || b.created_at || '';
      return da < db ? -1 : da > db ? 1 : 0;
    });

    let balance = 0;
    return rows.map(r => {
      balance += r.debit - r.credit;
      return { ...r, balance };
    });
  }, [client, sales, invoices, paymentHistory]);

  // ── Period window ────────────────────────────────────────────────────────
  // Same shape as the supplier ledger: a window, plus a brought-forward row so
  // the running balance stays true when history is hidden. Without that the
  // first visible row would start from zero and every balance under it would be
  // wrong.
  const rangeStart = useMemo(() => {
    if (range === 'ALL') return null;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (range === '1M') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    if (range === '3M') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return fmt(d); }
    // Indian financial year — the window a GST filing is reconciled against.
    const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${fy}-04-01`;
  }, [range]);

  const ledgerOpening = useMemo(() => {
    if (!rangeStart) return 0;
    let bal = 0;
    statementRows.forEach(r => { if (String(r.date || '') < rangeStart) bal = r.balance; });
    return bal;
  }, [statementRows, rangeStart]);

  const ledgerInRange = useMemo(
    () => (rangeStart ? statementRows.filter(r => String(r.date || '') >= rangeStart) : statementRows),
    [statementRows, rangeStart]);
  const ledgerHiddenBefore = statementRows.length - ledgerInRange.length;

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

  // Closing is always across all history — what the client owes today does not
  // change because a narrower period was chosen.
  const ledgerClosing = statementRows.length ? statementRows[statementRows.length - 1].balance : 0;
  const ledgerTotals = useMemo(() => ({
    debit:  ledgerInRange.reduce((s, r) => s + (r.debit || 0), 0),
    credit: ledgerInRange.reduce((s, r) => s + (r.credit || 0), 0),
  }), [ledgerInRange]);

  const clientInvoices = useMemo(() => {
    if (!client) return [];
    const invRows = (invoices || [])
      .filter(inv => inv.client_id === client.id && inv.payment_status !== 'PAID');
    const invoicedSaleIds = new Set(invRows.map(i => i.sale_id).filter(Boolean));

    // Part-paid / unpaid CASH-type sales with no invoice — they carry a real
    // balance too, so the cashier must be able to see and settle them here,
    // not just credit invoices. Synthetic rows use a SALE: id prefix so the
    // allocation path knows to update the sale row directly.
    const saleRows = (sales || [])
      .filter(s => String(s.shopId) === String(client.id) || String(s.clientId) === String(client.id))
      .filter(s => (s.paymentMethod || '').toUpperCase() !== 'CREDIT')
      .filter(s => ['PARTIAL', 'UNPAID', 'PENDING'].includes((s.paymentStatus || s.status || '').toUpperCase()))
      .filter(s => !invoicedSaleIds.has(s.id))
      .filter(s => !s.deleted_at)
      .map(s => ({
        id: `SALE:${s.id}`,
        invoice_number: `Sale ${String(s.id).split('-').pop()}`,
        invoice_date: s.date,
        created_at: s.created_at,
        grand_total: Number(s.totalAmount) || 0,
        paid_amount: Number(s.paidAmount) || 0,
        payment_status: (s.paymentStatus || 'UNPAID').toUpperCase(),
        items: s.items,
        isSale: true,
      }));

    return [...invRows, ...saleRows]
      .filter(inv =>
        inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(inv.grand_total).includes(searchTerm)
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [client, invoices, sales, searchTerm]);

  const toggleInvoice = (inv) => {
    const isSelected = selectedInvoiceIds.includes(inv.id);
    const newSelection = isSelected
      ? selectedInvoiceIds.filter(x => x !== inv.id)
      : [...selectedInvoiceIds, inv.id];
    const due = Math.max(0, (Number(inv.grand_total) || 0) - (Number(inv.paid_amount) || 0));
    const newAmt = isSelected
      ? Math.max(0, Math.round(((parseFloat(paymentData.amount) || 0) - due) * 100) / 100)
      : Math.round(((parseFloat(paymentData.amount) || 0) + due) * 100) / 100;
    setSelectedInvoiceIds(newSelection);
    setPaymentData({ ...paymentData, amount: newAmt > 0 ? newAmt.toString() : '' });
  };

  const toggleAll = () => {
    if (selectedInvoiceIds.length === clientInvoices.length) {
      setSelectedInvoiceIds([]);
      setPaymentData({ ...paymentData, amount: '0' });
    } else {
      setSelectedInvoiceIds(clientInvoices.map(i => i.id));
      setPaymentData({ ...paymentData, amount: clientInvoices.reduce((s, i) => s + Math.max(0, (Number(i.grand_total) || 0) - (Number(i.paid_amount) || 0)), 0).toString() });
    }
  };

  const [deletingPaymentId, setDeletingPaymentId] = useState(null);
  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Delete this payment? Outstanding balance will be recalculated.')) return;
    setDeletingPaymentId(paymentId);
    const res = await deleteClientPayment(paymentId, client.id);
    setDeletingPaymentId(null);
    if (res?.error) { alert(`Delete failed: ${res.error.message || res.error}`); return; }
    // Refetch payment history after delete.
    supabase.from('client_payments').select('*')
      .eq('client_id', id).eq('tenant_id', currentTenantId).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(50)
      .then(async ({ data }) => {
        if (!data) return;
        const userIds = [...new Set(data.map(p => p.recorded_by).filter(Boolean))];
        let nameMap = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', userIds);
          if (profiles) profiles.forEach(p => { nameMap[p.id] = p.name; });
        }
        setPaymentHistory(data.map(p => ({ ...p, collector: p.recorded_by ? { name: nameMap[p.recorded_by] || null } : null })));
      });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!client) return;
    setPaymentError('');
    const amt = parseFloat(paymentData.amount);
    if (isNaN(amt) || amt <= 0) { setPaymentError('Enter a valid payment amount.'); return; }
    // Explicit confirmation before money is recorded. window.confirm blocks the
    // thread, so it also serialises a rapid double-tap into a single commit —
    // the double-payment complaint was recording the same collection twice.
    const cur = businessProfile?.currencySymbol || '₹';
    if (!window.confirm(`Record ${cur}${amt.toLocaleString('en-IN')} received from ${client.name} (${paymentData.paymentMethod})?`)) return;
    setIsSubmitting(true);
    try {
      const res = await recordClientPayment(client.id, amt, paymentData.date, paymentData.notes, selectedInvoiceIds, paymentData.paymentMethod);
      if (res?.success === false) {
        setPaymentError(res.error || 'Payment failed. Try again.');
      } else {
        // Money-received posting to Cash & Bank now happens in the DB
        // (trg_client_payments_post_ledger on client_payments) — one place,
        // every platform, instead of duplicated per client here.
        setSuccess(true);
        setTimeout(() => navigate(-1), 1200);
      }
    } catch (err) {
      setPaymentError('Payment failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <PageSkeleton cards={3} rows={8} />;

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-12">
        <AlertCircle size={48} className="mx-auto mb-4 text-red-400 opacity-50" />
        <h2 className="text-2xl font-bold text-ink-primary mb-2">Client Not Found</h2>
        <p className="text-sm text-muted-foreground mb-6">This client record may have been deleted.</p>
        <button onClick={() => navigate(-1)} className="btn-signature px-8 h-11 !rounded-xl text-xs font-bold uppercase tracking-widest">
          Back to Clients
        </button>
      </div>
    );
  }

  // Remaining due on an invoice = grand total minus what's already paid.
  // The screen previously used the gross grand_total, so a partial payment
  // never reduced the displayed due / outstanding.
  const invoiceDue = (i) =>
    Math.max(0, (Number(i.grand_total) || 0) - (Number(i.paid_amount) || 0));

  const selectedTotal = clientInvoices
    .filter(i => selectedInvoiceIds.includes(i.id))
    .reduce((s, i) => s + invoiceDue(i), 0);

  // Use DB-maintained outstanding_balance (kept accurate by triggers) so this
  // card matches the client list. Invoice-computed value misses CASH partial
  // sales with no invoice row.
  const outstanding = Number(client?.outstanding_balance) || 0;

  // Column height: fills viewport minus AppLayout nav/header (~120px) and page padding
  const colH = 'h-[calc(100vh-140px)]';

  return (
    <div className="animate-fade-in -mt-2 md:-mt-6 -mx-4 sm:-mx-6 lg:-mx-12">

      {/* ── Compact sticky header ── */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur border-b border-black/5">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 shrink-0 rounded-xl border border-black/10 bg-white flex items-center justify-center text-ink-primary hover:bg-black/5 transition-all group">
          <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="hidden sm:inline text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">Clients /</span>
          <h1 className="text-base font-extrabold text-ink-primary truncate">
            {client.name}<span className="text-accent-signature">.</span>
          </h1>
          {(client.gstin || client.gst_no) && (
            <span className="hidden md:inline shrink-0 text-[10px] font-bold text-muted-foreground bg-canvas border border-black/5 rounded-full px-2 py-0.5">
              {client.gstin || client.gst_no}
            </span>
          )}
          {client.phone && (
            <span className="hidden lg:flex items-center gap-1 text-[11px] font-semibold text-muted-foreground shrink-0">
              <Phone size={11} />{client.phone}
            </span>
          )}
        </div>
        {/* Outstanding — headline metric in header */}
        <div className="shrink-0 text-right">
          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{outstanding < 0 ? 'Advance' : 'Outstanding'}</div>
          <div className={`text-lg font-black tabular-nums leading-none ${outstanding > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
            {formatCurrency(Math.abs(outstanding))}
          </div>
        </div>
      </div>

      {/* ── 3-column body ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3">

        {/* ── LEFT: Client info + Payment form ── */}
        <aside className="lg:col-span-4 order-1 flex flex-col gap-3">

          {/* Client card */}
          <div className="bg-white rounded-2xl border border-black/5 p-4">
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-black/5">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-accent-signature/10 border border-accent-signature/25 flex items-center justify-center text-accent-signature tabular-nums text-sm font-bold">
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-ink-primary leading-tight truncate">{client.name}</div>
                <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">{client.gstin || client.gst_no || 'Unregistered'}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className={`rounded-xl p-2.5 border ${outstanding > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50/60 border-emerald-100'}`}>
                <div className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${outstanding > 0 ? 'text-red-400' : 'text-emerald-500'}`}>{outstanding < 0 ? 'Advance' : 'Outstanding'}</div>
                <div className={`text-base font-black tabular-nums ${outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(Math.abs(outstanding))}</div>
              </div>
              <div className="bg-canvas rounded-xl p-2.5 border border-black/5">
                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Unpaid</div>
                <div className="text-base font-black tabular-nums text-ink-primary">{clientInvoices.length}</div>
              </div>
            </div>
            <div className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              {client.phone && <div className="flex items-center gap-2"><Phone size={11} className="text-muted-foreground shrink-0" />{client.phone}</div>}
              {client.address && <div className="flex items-start gap-2"><MapPin size={11} className="text-muted-foreground shrink-0 mt-0.5" />{client.address}</div>}
            </div>
          </div>

          {/* Payment form */}
          <div className="bg-white rounded-2xl border border-black/5 p-4">
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">Record Payment</h4>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {paymentError && (
                <div className="p-2.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2">
                  <AlertCircle size={13} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-red-600">{paymentError}</p>
                </div>
              )}
              {success && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <p className="text-xs font-semibold text-emerald-700">Payment recorded!</p>
                </div>
              )}
              <div>
                <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Date</label>
                <input required type="date"
                  className="w-full bg-white border border-border shadow-sm rounded-xl px-3 py-2.5 text-sm font-bold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
                  value={paymentData.date}
                  onChange={e => setPaymentData({ ...paymentData, date: e.target.value })} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Amount</label>
                  {outstanding > 0 && (
                    <button type="button"
                      onClick={() => setPaymentData({ ...paymentData, amount: outstanding.toString() })}
                      className="text-[9px] font-bold text-accent-signature hover:underline">
                      Fill {formatCurrency(outstanding)}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">
                    {businessProfile?.currencySymbol || '₹'}
                  </span>
                  <input required type="number" step="0.01" placeholder="0.00"
                    className="w-full bg-white border border-border shadow-sm rounded-xl pl-7 pr-3 py-2.5 text-xl font-black text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 tabular-nums"
                    value={paymentData.amount}
                    onChange={e => setPaymentData({ ...paymentData, amount: e.target.value })} />
                </div>
                {selectedTotal > 0 && (
                  <div className="text-[9px] text-accent-signature font-bold mt-1">
                    {selectedInvoiceIds.length} invoice{selectedInvoiceIds.length !== 1 ? 's' : ''} selected · {formatCurrency(selectedTotal)}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Method</label>
                <select
                  className="w-full bg-white border border-border shadow-sm rounded-xl px-3 py-2.5 text-sm font-bold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
                  value={paymentData.paymentMethod}
                  onChange={e => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}>
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Notes</label>
                <textarea
                  className="w-full bg-white border border-border shadow-sm rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 resize-none h-16 placeholder:text-muted-foreground"
                  placeholder="Cheque no, reference…"
                  value={paymentData.notes}
                  onChange={e => setPaymentData({ ...paymentData, notes: e.target.value })} />
              </div>
              <button type="submit"
                disabled={isSubmitting || !hasPermission('clients', 'edit') || success}
                className="w-full btn-signature h-11 !rounded-xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest disabled:opacity-50">
                <CheckCircle2 size={14} />
                {isSubmitting ? 'Saving…' : 'Record Payment'}
              </button>
            </form>
          </div>
        </aside>

        {/* ── RIGHT: the ledger, in the supplier's shape ──────────────── */}
        <section className={`lg:col-span-8 order-2 min-w-0 flex flex-col bg-white rounded-2xl border border-black/5 overflow-hidden ${colH}`}>

          {/* Controls. Same set as the supplier ledger so the two screens are
              one thing to learn: a period, a row type, a sort, a count. */}
          <div className="no-print p-3 border-b border-black/5 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex gap-1 p-1 bg-black/[0.04] rounded-xl shrink-0">
                {[['LEDGER', 'Ledger'], ['SETTLE', 'Settle bills']].map(([v, label]) => (
                  <button key={v} onClick={() => setRightView(v)}
                    className={`px-3 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                      rightView === v ? 'bg-ink-primary text-white shadow-sm' : 'text-muted-foreground hover:text-ink-primary'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-0 max-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search…"
                  className="w-full h-8 pl-9 pr-3 rounded-lg bg-white border border-border text-[12px] font-semibold outline-none focus:border-accent-signature" />
              </div>
            </div>

            {rightView === 'LEDGER' && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1 p-1 bg-black/[0.04] rounded-xl">
                  {[['1M','Month'],['3M','3 months'],['FY','This FY'],['ALL','All']].map(([v,label]) => (
                    <button key={v} onClick={() => setRange(v)}
                      className={`px-2.5 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        range === v ? 'bg-ink-primary text-white shadow-sm' : 'text-muted-foreground hover:text-ink-primary'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 p-1 bg-black/[0.04] rounded-xl">
                  {[['ALL','All'],['SALE','Bills'],['PAYMENT','Payments']].map(([v,label]) => (
                    <button key={v} onClick={() => setRowKind(v)}
                      className={`px-2.5 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        rowKind === v ? 'bg-accent-signature text-white shadow-sm' : 'text-muted-foreground hover:text-ink-primary'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setNewestFirst(v => !v)}
                  className="h-7 px-2.5 rounded-lg border border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-ink-primary transition-all">
                  {newestFirst ? 'Newest ↑' : 'Oldest ↓'}
                </button>
                <span className="text-[11px] font-bold text-muted-foreground">
                  {ledgerRowsView.length} {ledgerRowsView.length === 1 ? 'row' : 'rows'}
                </span>
              </div>
            )}
          </div>

          {rightView === 'LEDGER' ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="bg-canvas/70 sticky top-0 z-10 border-b border-black/5">
                  <tr>
                    <th className="py-3 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="py-3 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="py-3 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Reference</th>
                    <th className="py-3 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Debit</th>
                    <th className="py-3 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Credit</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {/* Balance carried in, so the figures below are not understated
                      by whatever the hidden history left behind. */}
                  {ledgerHiddenBefore > 0 && !newestFirst && (
                    <tr className="bg-canvas/60">
                      <td className="py-2.5 px-4 text-[11px] font-bold text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(rangeStart)}</td>
                      <td colSpan="4" className="py-2.5 px-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Balance brought forward
                        <span className="ml-2 normal-case font-semibold text-muted-foreground/70">{ledgerHiddenBefore} earlier {ledgerHiddenBefore === 1 ? 'entry' : 'entries'} not shown</span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-xs font-bold tabular-nums text-ink-primary">{formatCurrency(ledgerOpening)}</td>
                    </tr>
                  )}

                  {ledgerRowsView.length === 0 ? (
                    <tr><td colSpan="6" className="py-20 text-center">
                      <div className="text-sm font-bold text-ink-primary mb-1">Nothing to show</div>
                      <div className="text-xs text-muted-foreground">
                        {statementRows.length === 0 ? 'No bills or payments recorded yet.' : 'Try a wider period or another filter.'}
                      </div>
                    </td></tr>
                  ) : ledgerRowsView.map(r => {
                    const isPay = r.type === 'PAYMENT';
                    return (
                      <tr key={r.id} className={isPay ? 'hover:bg-emerald-50/30' : 'hover:bg-canvas/60'}>
                        <td className="py-3 px-4 text-xs font-semibold text-ink-primary tabular-nums whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isPay ? 'bg-emerald-100 text-emerald-700' : 'bg-accent-signature/10 text-accent-signature-hover'}`}>
                            {isPay ? 'Payment' : r.type === 'INVOICE' ? 'Invoice' : 'Sale'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-semibold text-ink-primary truncate max-w-[240px]">{r.description}</span>
                            {/* Deleting a mistaken receipt lived on the old
                                History tab. Only real client_payments rows can
                                go — the synthetic credits derived from a sale's
                                paidAmount have no row of their own. */}
                            {isPay && paymentHistory.some(h => h.id === r.id) && hasPermission('clients', 'edit') !== false && (
                              <button
                                onClick={() => handleDeletePayment(r.id)}
                                disabled={deletingPaymentId === r.id}
                                title="Delete this payment"
                                className="no-print shrink-0 text-muted-foreground hover:text-red-600 disabled:opacity-40 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right text-xs font-bold tabular-nums text-ink-primary">
                          {r.debit > 0 ? formatCurrency(r.debit) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right text-xs font-bold tabular-nums text-emerald-600">
                          {r.credit > 0 ? formatCurrency(r.credit) : '—'}
                        </td>
                        <td className={`py-3 px-4 text-right text-xs font-bold tabular-nums ${r.balance > 0.01 ? 'text-ink-primary' : 'text-muted-foreground'}`}>
                          {formatCurrency(r.balance)}
                        </td>
                      </tr>
                    );
                  })}

                  {ledgerHiddenBefore > 0 && newestFirst && ledgerRowsView.length > 0 && (
                    <tr className="bg-canvas/60">
                      <td className="py-2.5 px-4 text-[11px] font-bold text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(rangeStart)}</td>
                      <td colSpan="4" className="py-2.5 px-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Balance brought forward
                        <span className="ml-2 normal-case font-semibold text-muted-foreground/70">{ledgerHiddenBefore} earlier {ledgerHiddenBefore === 1 ? 'entry' : 'entries'} not shown</span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-xs font-bold tabular-nums text-ink-primary">{formatCurrency(ledgerOpening)}</td>
                    </tr>
                  )}
                </tbody>

                {statementRows.length > 0 && rowKind === 'ALL' && !searchTerm.trim() && (
                  <tfoot>
                    <tr className="bg-canvas border-t-2 border-black/10">
                      <td colSpan="3" className="py-3 px-4 text-[10px] font-black uppercase tracking-wider text-ink-primary">
                        Closing balance
                        {ledgerHiddenBefore > 0 && (
                          <span className="ml-2 normal-case font-semibold text-muted-foreground">
                            · debit/credit cover {formatDate(rangeStart)} onwards
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-[11px] font-bold tabular-nums text-muted-foreground">{formatCurrency(ledgerTotals.debit)}</td>
                      <td className="py-3 px-3 text-right text-[11px] font-bold tabular-nums text-muted-foreground">{formatCurrency(ledgerTotals.credit)}</td>
                      <td className={`py-3 px-4 text-right text-sm font-black tabular-nums ${ledgerClosing > 0.01 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatCurrency(ledgerClosing)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            /* Settling against specific bills — kept intact, because choosing
               which invoices a payment clears is the job this page exists for
               and the supplier side has no equivalent. */
            <>
          {/* Toolbar — fixed */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-black/5 bg-white">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Unpaid Bills</span>
            <span className="text-[10px] font-semibold text-muted-foreground">({clientInvoices.length})</span>
            <div className="flex-1" />
            {/* Search lives once, in the controls bar above. This column used to
                carry its own, and after the two views were merged both rendered
                side by side bound to the same state. */}
            <button onClick={toggleAll}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-ink-primary text-white text-[10px] font-black hover:opacity-90 transition-opacity">
              {selectedInvoiceIds.length === clientInvoices.length && clientInvoices.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {/* Invoice list — scrolls */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {clientInvoices.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle2 size={36} className="mb-3 text-emerald-400 opacity-40" />
                <p className="text-sm font-bold text-muted-foreground">No outstanding bills</p>
                <p className="text-xs text-muted-foreground mt-1">This client has no pending payments.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
                  <tr>
                    <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest w-7">#</th>
                    <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest">Invoice</th>
                    <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest">Date</th>
                    <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest text-right">Due</th>
                    <th className="py-2.5 px-4 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {clientInvoices.map((inv, idx) => {
                    const isSelected = selectedInvoiceIds.includes(inv.id);
                    const isExpanded = expandedInvoiceId === inv.id;
                    const items = Array.isArray(inv.items) ? inv.items : [];
                    return (
                      <React.Fragment key={inv.id}>
                        <tr onClick={() => toggleInvoice(inv)}
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-accent-signature/5' : 'hover:bg-canvas/60'}`}>
                          <td className="py-3 px-4 text-[10px] font-semibold text-muted-foreground">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isSelected ? 'bg-ink-primary text-accent-signature' : 'bg-white border border-border shadow-sm text-muted-foreground'}`}>
                                <Receipt size={13} />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-ink-primary">#{String(inv.invoice_number || '').replace(/^#+/, '')}</div>
                                <div className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                                  {inv.isSale ? 'Cash sale · ' : ''}{inv.payment_status === 'PARTIAL' ? 'Partial' : 'Unpaid'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-xs font-semibold text-ink-primary">{formatDate(inv.invoice_date || inv.created_at)}</div>
                            <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Clock size={9} />{new Date(inv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className={`text-xs font-black tabular-nums ${isSelected ? 'text-ink-primary' : 'text-ink-secondary'}`}>
                              {formatCurrency(invoiceDue(inv))}
                            </div>
                            {inv.paid_amount > 0 && (
                              <div className="text-[9px] text-emerald-600 font-semibold mt-0.5">
                                Paid: {formatCurrency(inv.paid_amount)} of {formatCurrency(inv.grand_total)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 justify-end">
                              {/* Open the actual printable bill — invoice page for
                                  an invoiced sale, receipt for a cash POS sale. */}
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  const url = inv.isSale
                                    ? `/embed/receipt/${inv.id.slice(5)}`
                                    : `/embed/invoice/${inv.id}`;
                                  window.open(url, '_blank', 'noopener');
                                }}
                                className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-black/5 hover:text-ink-primary transition-colors"
                                title="View bill"
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setExpandedInvoiceId(isExpanded ? null : inv.id); }}
                                className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-black/5 hover:text-ink-primary transition-colors"
                                title="View items"
                              >
                                <ChevronDown size={13} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-accent-signature border-accent-signature' : 'border-black/10 bg-white'}`}>
                                {isSelected && <CheckCircle2 size={11} className="text-ink-primary" />}
                              </div>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-canvas/40">
                            <td colSpan={5} className="px-4 pb-3 pt-0">
                              <div className="rounded-xl border border-black/5 bg-white overflow-hidden">
                                {items.length === 0 ? (
                                  <div className="px-4 py-3 text-[10px] font-semibold text-muted-foreground">No item details on this invoice.</div>
                                ) : (
                                  <table className="w-full text-left">
                                    <thead>
                                      <tr className="border-b border-black/5">
                                        <th className="py-2 px-3 text-[8px] font-black text-muted-foreground uppercase tracking-widest">Product</th>
                                        <th className="py-2 px-3 text-[8px] font-black text-muted-foreground uppercase tracking-widest text-right">Qty</th>
                                        <th className="py-2 px-3 text-[8px] font-black text-muted-foreground uppercase tracking-widest text-right">Rate</th>
                                        <th className="py-2 px-3 text-[8px] font-black text-muted-foreground uppercase tracking-widest text-right">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/[0.04]">
                                      {items.map((it, i) => (
                                        <tr key={i}>
                                          <td className="py-2 px-3 text-[11px] font-bold text-ink-primary">{it.name}</td>
                                          <td className="py-2 px-3 text-[11px] font-semibold text-ink-secondary text-right tabular-nums">{it.quantity ?? it.qty}</td>
                                          <td className="py-2 px-3 text-[11px] font-semibold text-ink-secondary text-right tabular-nums">{formatCurrency(it.rate ?? it.price)}</td>
                                          <td className="py-2 px-3 text-[11px] font-black text-ink-primary text-right tabular-nums">{formatCurrency((Number(it.quantity ?? it.qty) || 0) * (Number(it.rate ?? it.price) || 0))}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Selection footer — pinned to bottom of this column */}
          <div className="shrink-0 border-t border-black/5 bg-ink-primary px-5 py-3 rounded-b-2xl flex items-center justify-between">
            <div>
              <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Selected Total</div>
              <div className="text-lg font-black text-white tabular-nums">{formatCurrency(selectedTotal)}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Remaining After</div>
              <div className="text-base font-black text-accent-signature tabular-nums">
                {formatCurrency(Math.max(0, outstanding - selectedTotal))}
              </div>
            </div>
          </div>

            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default ClientSettlement;
