import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useOrders } from '../hooks/useOrders';
import { useSales } from '../hooks/useSales';
import { supabase } from '../lib/supabase';
import { usePeople } from '../hooks/usePeople';
import { useInventory } from '../hooks/useInventory';
import { computeOrderTotals } from '../lib/priceResolver';
import {
  Plus, X, ChevronDown, ChevronUp, Package,
  User, Calendar, ArrowRight, Check, Trash2,
  Building2, ShoppingBag, Clock, Truck, CheckCircle2,
  FileText, AlertCircle, Search, Edit3,
} from 'lucide-react';
import { todayISOInAppTZ } from '../lib/utils';

// ── Pipeline stages config ────────────────────────────────────────────────
const STAGES = [
  { id: 'DRAFT',      label: 'Draft',      color: 'gray',   icon: Edit3,        next: 'CONFIRMED'  },
  { id: 'CONFIRMED',  label: 'Confirmed',  color: 'blue',   icon: Check,        next: 'DISPATCHED' },
  { id: 'DISPATCHED', label: 'Dispatched', color: 'orange', icon: Truck,        next: 'DELIVERED'  },
  { id: 'DELIVERED',  label: 'Delivered',  color: 'green',  icon: CheckCircle2, next: 'INVOICED'   },
  { id: 'INVOICED',   label: 'Invoiced',   color: 'purple', icon: FileText,     next: null         },
];

const STAGE_STYLES = {
  gray:   { badge: 'bg-gray-100   text-gray-600   border-gray-200',   dot: 'bg-gray-400',   bar: 'bg-gray-200'   },
  blue:   { badge: 'bg-blue-50    text-blue-700   border-blue-200',   dot: 'bg-blue-500',   bar: 'bg-blue-500'   },
  yellow: { badge: 'bg-yellow-50  text-yellow-700 border-yellow-200', dot: 'bg-yellow-500', bar: 'bg-yellow-400' },
  orange: { badge: 'bg-orange-50  text-orange-700 border-orange-200', dot: 'bg-orange-500', bar: 'bg-orange-500' },
  green:  { badge: 'bg-green-50   text-green-700  border-green-200',  dot: 'bg-green-500',  bar: 'bg-green-500'  },
  purple: { badge: 'bg-purple-50  text-purple-700 border-purple-200', dot: 'bg-purple-500', bar: 'bg-purple-500' },
};

const TIER_LABELS = { RETAIL: 'Retail', WHOLESALE: 'Wholesale', DISTRIBUTOR: 'Distributor' };

const EMPTY_FORM = {
  clientId: '', clientName: '', orderType: 'B2B', priceTier: 'RETAIL',
  requestedDate: '', notes: '', items: [],
};

const EMPTY_ITEM = { productId: '', productName: '', qty: 1, unitPrice: 0, total: 0 };

// ── Invoice → order stage mapping ─────────────────────────────────────────
const invoiceToStage = (inv) => {
  if (inv.payment_status === 'PAID' || inv.status === 'PAID') return 'INVOICED';
  const ds = (inv.delivery_status || '').toUpperCase();
  if (ds === 'DELIVERED')  return 'DELIVERED';
  if (ds === 'IN_TRANSIT') return 'DISPATCHED';
  return 'CONFIRMED'; // PENDING / unset
};

const normalizeInvoice = (inv) => ({
  id:                  inv.id,
  _source:             'invoice',
  _delivery_required:  !!inv.delivery_required,
  order_number:        (inv.invoice_number || `INV-${inv.id.slice(-6).toUpperCase()}`).replace(/^#+/, ''),
  client_id:           inv.client_id || null,
  client_name:         inv.client_name || '',
  order_type:          'B2B',
  price_tier:          'RETAIL',
  status:              invoiceToStage(inv),
  items:               Array.isArray(inv.items) ? inv.items : [],
  grand_total:         inv.grand_total || inv.amount || 0,
  notes:               inv.notes || null,
  requested_date:      inv.invoice_date || inv.date || null,
  created_at:          inv.created_at,
});

// ── Helpers ───────────────────────────────────────────────────────────────
const stageOf = (id) => STAGES.find(s => s.id === id) || STAGES[0];

const StageBadge = ({ status }) => {
  const s = stageOf(status);
  const st = STAGE_STYLES[s.color];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black border whitespace-nowrap ${st.badge}`}>
      <Icon size={9} />
      {s.label}
    </span>
  );
};

// ── Component ─────────────────────────────────────────────────────────────
const Orders = () => {
  const { hasPermission, currentUser } = useAuth();
  const { currentTenantId, currentTenant, businessProfile } = useTenant();
  const {
    orders, priceLists, loading,
    createOrder, updateOrder, advanceStatus, deleteOrder,
  } = useOrders(currentTenantId);
  const { invoices, refetch: refetchInvoices } = useSales(currentTenantId);
  const { clients } = usePeople(currentTenantId);
  const { products } = useInventory(currentTenantId);

  const sym = businessProfile?.currencySymbol || '';

  // ── Merge orders + invoices into unified pipeline ─────────────────────
  const allItems = useMemo(() => {
    const orderIds = new Set(orders.map(o => o.id));
    // Exclude invoices that are already linked to an order (via invoice_id on order)
    const linkedInvoiceIds = new Set(orders.map(o => o.invoice_id).filter(Boolean));
    const invoiceRows = invoices
      .filter(inv => !linkedInvoiceIds.has(inv.id))
      .map(normalizeInvoice);
    return [...orders, ...invoiceRows].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
  }, [orders, invoices]);

  // ── UI state ─────────────────────────────────────────────────────────
  const [activeStage,  setActiveStage]  = useState('ALL');
  const [searchTerm,   setSearchTerm]   = useState('');
  const [expandedId,   setExpandedId]   = useState(null);
  const [showModal,    setShowModal]    = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);   // null = new
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [saving,       setSaving]       = useState(null);   // orderId being advanced

  // ── Filtered orders ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = allItems;
    if (activeStage !== 'ALL' && activeStage !== 'CANCELLED') {
      list = list.filter(o => o.status === activeStage);
    } else if (activeStage === 'CANCELLED') {
      list = list.filter(o => o.status === 'CANCELLED');
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(o =>
        (o.order_number || '').toLowerCase().includes(q) ||
        (o.client_name  || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allItems, activeStage, searchTerm]);

  // ── Stage counts ──────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { ALL: allItems.filter(o => o.status !== 'CANCELLED').length };
    STAGES.forEach(s => { c[s.id] = allItems.filter(o => o.status === s.id).length; });
    c.CANCELLED = allItems.filter(o => o.status === 'CANCELLED').length;
    return c;
  }, [allItems]);

  // ── KPIs ──────────────────────────────────────────────────────────────
  const openValue = allItems
    .filter(o => !['INVOICED', 'CANCELLED'].includes(o.status))
    .reduce((s, o) => s + (o.grand_total || 0), 0);

  const todayOrders = allItems.filter(o =>
    (o.created_at || '').startsWith(todayISOInAppTZ())
  ).length;

  // ── Form helpers ──────────────────────────────────────────────────────
  const openNew = () => {
    setEditingOrder(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (order) => {
    setEditingOrder(order);
    setForm({
      clientId:      order.client_id      || '',
      clientName:    order.client_name    || '',
      orderType:     order.order_type     || 'B2B',
      priceTier:     order.price_tier     || 'RETAIL',
      requestedDate: order.requested_date || '',
      notes:         order.notes          || '',
      items:         Array.isArray(order.items) ? order.items : [],
    });
    setShowModal(true);
  };

  const addItem = () => {
    setForm(prev => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM }] }));
  };

  const updateItem = (idx, field, value) => {
    setForm(prev => {
      const items = prev.items.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        if (field === 'productId') {
          const p = products.find(pr => pr.id === value);
          if (p) {
            updated.productName = p.name;
            const { items: priced } = computeOrderTotals(
              [{ ...updated, qty: updated.qty || 1 }], priceLists, prev.priceTier, products
            );
            return { ...updated, unitPrice: priced[0].unitPrice, total: priced[0].total };
          }
        }
        if (field === 'qty' || field === 'unitPrice') {
          const qty = field === 'qty' ? Number(value) : (updated.qty || 1);
          const up  = field === 'unitPrice' ? Number(value) : updated.unitPrice;
          updated.total = qty * up;
        }
        return updated;
      });
      return { ...prev, items };
    });
  };

  const removeItem = (idx) => {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  const formTotals = useMemo(() => {
    const subtotal = form.items.reduce((s, i) => s + (Number(i.total) || 0), 0);
    return { subtotal, grandTotal: subtotal };
  }, [form.items]);

  const onClientChange = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    setForm(prev => ({
      ...prev,
      clientId,
      clientName: client?.name || '',
      orderType:  client ? (client.client_type || 'B2B') : prev.orderType,
      priceTier:  client ? (client.price_tier  || 'RETAIL') : prev.priceTier,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.items.length === 0) { alert('Add at least one item.'); return; }

    const payload = {
      ...form,
      subtotal:   formTotals.subtotal,
      grandTotal: formTotals.grandTotal,
      discount:   0,
      createdBy:  currentUser?.id || null,
    };

    if (editingOrder) {
      await updateOrder(editingOrder.id, {
        client_id:      payload.clientId || null,
        client_name:    payload.clientName,
        order_type:     payload.orderType,
        price_tier:     payload.priceTier,
        items:          payload.items,
        subtotal:       payload.subtotal,
        grand_total:    payload.grandTotal,
        notes:          payload.notes || null,
        requested_date: payload.requestedDate || null,
      });
    } else {
      await createOrder(payload);
    }
    setShowModal(false);
    setEditingOrder(null);
    setForm(EMPTY_FORM);
  };

  const handleAdvance = async (order) => {
    const s = stageOf(order.status);
    if (!s.next) return;
    setSaving(order.id);
    await advanceStatus(order.id, s.next);
    setSaving(null);
  };

  const handleCancel = async (order) => {
    if (!window.confirm(`Cancel order ${order.order_number}?`)) return;
    await advanceStatus(order.id, 'CANCELLED');
  };

  const handleDelete = async (order) => {
    if (!window.confirm(`Delete ${order.order_number} permanently?`)) return;
    await deleteOrder(order.id);
  };

  const toggleDelivery = async (order) => {
    const newVal = !order._delivery_required;
    const { error } = await supabase.rpc('set_invoice_delivery', {
      p_invoice_id: order.id,
      p_required:   newVal,
      p_tenant_id:  currentTenantId || undefined,
    });
    if (error) console.error('toggleDelivery error:', error);
    else refetchInvoices();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-accent-signature/30 border-t-accent-signature rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6 pb-16">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center gap-3 pb-3 border-b border-black/5 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-xl font-extrabold text-ink-primary leading-none">Orders<span className="text-amber-500">.</span></h1>
          <span className="text-[11px] font-semibold text-gray-400 hidden sm:block">Order pipeline · draft → invoiced</span>
        </div>
        <button onClick={openNew}
          className="h-10 px-4 rounded-xl bg-amber-600 text-white text-[13px] font-bold flex items-center gap-2 hover:bg-amber-700 transition-all shrink-0">
          <Plus size={15} strokeWidth={2.6} /> New order
        </button>
      </div>

      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-black/[0.07] rounded-2xl overflow-hidden border border-black/[0.07] shadow-sm">
        {[
          { label: 'Open pipeline', value: `${openValue.toLocaleString('en-IN')}`, money: true },
          { label: 'Active orders', value: counts.ALL },
          { label: 'Today', value: todayOrders },
          { label: 'To dispatch', value: counts.CONFIRMED || 0 },
        ].map((m) => (
          <div key={m.label} className="bg-white px-4 py-3.5">
            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">{m.label}</div>
            <div className="font-mono text-xl font-bold text-ink-primary tabular-nums leading-none mt-1">
              {m.money && <span className="text-sm text-amber-400 mr-0.5">{sym || '₹'}</span>}{m.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Pipeline stage bar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {/* All tab */}
        <button
          onClick={() => setActiveStage('ALL')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-black transition-all whitespace-nowrap ${
            activeStage === 'ALL'
              ? 'bg-ink-primary text-surface border-ink-primary'
              : 'bg-white border-black/5 text-gray-500 hover:border-black/15'
          }`}
        >
          All <span className={`text-[8px] px-1.5 py-0.5 rounded-full tabular-nums ${activeStage === 'ALL' ? 'bg-white/20 text-white' : 'bg-black/5 text-gray-400'}`}>{counts.ALL}</span>
        </button>

        {STAGES.map((stage, idx) => {
          const st = STAGE_STYLES[stage.color];
          const Icon = stage.icon;
          const active = activeStage === stage.id;
          return (
            <React.Fragment key={stage.id}>
              {idx > 0 && <ArrowRight size={10} className="text-gray-300 shrink-0" />}
              <button
                onClick={() => setActiveStage(stage.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-black transition-all whitespace-nowrap ${
                  active ? `${st.badge} shadow-sm` : 'bg-white border-black/5 text-gray-500 hover:border-black/15'
                }`}
              >
                <Icon size={10} />
                {stage.label}
                <span className={`text-[8px] px-1.5 py-0.5 rounded-full tabular-nums ${active ? 'bg-black/10' : 'bg-black/5 text-gray-400'}`}>
                  {counts[stage.id] || 0}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="relative w-full max-w-sm">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Order # or client name..."
          className="w-full h-10 pl-10 pr-4 rounded-full bg-white border border-black/5 text-xs font-bold text-ink-primary placeholder:text-gray-400 outline-none focus:border-black/20 transition-all"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* ── Order cards ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="py-24 text-center bg-white rounded-[2rem] border border-black/5">
            <Package size={48} className="mx-auto mb-4 opacity-10" strokeWidth={1} />
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No orders</p>
            <p className="text-[10px] text-gray-300 mt-1">Change filter or create a new order</p>
          </div>
        )}

        {filtered.map(order => {
          const stage      = stageOf(order.status);
          const st         = STAGE_STYLES[stage.color];
          const Icon       = stage.icon;
          const expanded   = expandedId === order.id;
          const items      = Array.isArray(order.items) ? order.items : [];
          const isSaving   = saving === order.id;
          const cancelled  = order.status === 'CANCELLED';
          const isInvoice  = order._source === 'invoice';

          return (
            <div key={order.id} className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all ${cancelled ? 'opacity-60 border-black/5' : 'border-black/5 hover:border-black/10'}`}>

              {/* Stage indicator bar */}
              <div className={`h-0.5 w-full ${st.bar}`} />

              {/* Main row */}
              <div className="flex items-center gap-4 px-5 py-4">

                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${st.badge} border`}>
                  <Icon size={16} />
                </div>

                {/* Order info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-ink-primary">{order.order_number}</span>
                    <StageBadge status={order.status} />
                    {isInvoice ? (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1">
                        <FileText size={8} /> INVOICE
                      </span>
                    ) : (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                        order.order_type === 'B2B'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-pink-50 text-pink-700 border-pink-200'
                      }`}>{order.order_type}</span>
                    )}
                    {!isInvoice && (
                      <span className="text-[9px] font-bold bg-white border border-gray-300 shadow-sm px-2 py-0.5 rounded-full text-gray-500">
                        {TIER_LABELS[order.price_tier] || order.price_tier}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                      <User size={9} /> {order.client_name || 'Walk-in'}
                    </span>
                    {order.requested_date && (
                      <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                        <Calendar size={9} /> {order.requested_date}
                      </span>
                    )}
                    {items.length > 0 && (
                      <span className="text-[10px] font-semibold text-gray-400">
                        {items.length} item{items.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Total */}
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-sm font-black text-ink-primary tabular-nums">
                    {sym}{(order.grand_total || 0).toLocaleString()}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Advance stage — orders only */}
                  {!isInvoice && !cancelled && stage.next && (
                    <button
                      onClick={() => handleAdvance(order)}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ink-primary text-surface text-[9px] font-black hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      {isSaving ? '...' : `→ ${stageOf(stage.next).label}`}
                    </button>
                  )}

                  {/* Delivery toggle — invoices only */}
                  {isInvoice && !['DISPATCHED', 'DELIVERED', 'INVOICED'].includes(order.status) && (
                    <button
                      onClick={() => toggleDelivery(order)}
                      title={order._delivery_required ? 'Remove delivery flag' : 'Mark for van delivery'}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[9px] font-black transition-all ${
                        order._delivery_required
                          ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                          : 'bg-canvas border-black/10 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'
                      }`}
                    >
                      <Truck size={9} />
                      {order._delivery_required ? 'Delivery On' : 'Delivery'}
                    </button>
                  )}

                  {/* Invoice link — go to Invoices page */}
                  {isInvoice && (
                    <a
                      href={`/${currentTenant?.slug || ''}/invoices`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-black hover:bg-amber-100 transition-all"
                      title="Manage on Invoices page"
                    >
                      <FileText size={9} /> View Invoice
                    </a>
                  )}

                  {/* Edit (only DRAFT orders) */}
                  {!isInvoice && order.status === 'DRAFT' && (
                    <button
                      onClick={() => openEdit(order)}
                      className="w-8 h-8 rounded-xl bg-white border border-gray-300 shadow-sm flex items-center justify-center text-gray-500 hover:text-ink-primary hover:bg-black/5 transition-all"
                    >
                      <Edit3 size={13} />
                    </button>
                  )}

                  {/* Cancel (orders only, not terminal) */}
                  {!isInvoice && !['INVOICED', 'CANCELLED'].includes(order.status) && (
                    <button
                      onClick={() => handleCancel(order)}
                      className="w-8 h-8 rounded-xl bg-white border border-gray-300 shadow-sm flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-all"
                      title="Cancel order"
                    >
                      <X size={13} />
                    </button>
                  )}

                  {/* Delete (orders: DRAFT or CANCELLED only) */}
                  {!isInvoice && ['DRAFT', 'CANCELLED'].includes(order.status) && (
                    <button
                      onClick={() => handleDelete(order)}
                      className="w-8 h-8 rounded-xl bg-white border border-gray-300 shadow-sm flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-all"
                      title="Delete order"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}

                  {/* Expand items */}
                  {items.length > 0 && (
                    <button
                      onClick={() => setExpandedId(expanded ? null : order.id)}
                      className="w-8 h-8 rounded-xl bg-white border border-gray-300 shadow-sm flex items-center justify-center text-gray-400 hover:text-ink-primary transition-all"
                    >
                      {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded line items */}
              {expanded && items.length > 0 && (
                <div className="border-t border-black/5 bg-canvas/40 px-5 py-4">
                  {order.notes && (
                    <p className="text-[9px] font-semibold text-gray-400 mb-3 italic">"{order.notes}"</p>
                  )}
                  <div className="space-y-1.5">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-4 bg-white rounded-xl px-4 py-2.5 border border-black/5">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-6 h-6 rounded-lg bg-white border border-gray-300 shadow-sm flex items-center justify-center shrink-0">
                            <Package size={10} className="text-gray-400" />
                          </div>
                          <span className="text-xs font-semibold text-ink-primary truncate">
                            {item.productName || item.name || 'Item'}
                          </span>
                        </div>
                        <div className="flex items-center gap-6 shrink-0 text-right">
                          <span className="text-[10px] font-semibold text-gray-400 tabular-nums">× {item.qty || item.quantity || 1}</span>
                          <span className="text-[10px] font-semibold text-gray-400 tabular-nums w-20 text-right">
                            {sym}{Number(item.unitPrice || item.price || 0).toLocaleString()}
                          </span>
                          <span className="text-xs font-black text-ink-primary tabular-nums w-24 text-right">
                            {sym}{Number(item.total || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-3 pt-3 border-t border-black/5">
                    <div className="text-right">
                      <div className="text-[9px] font-semibold text-gray-400">Total</div>
                      <div className="text-base font-black text-ink-primary tabular-nums">
                        {sym}{(order.grand_total || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── CREATE / EDIT MODAL ─────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay">
          <div className="glass-modal !max-w-3xl !p-0 !overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>

            {/* Header */}
            <div className="flex justify-between items-center px-8 py-6 border-b border-black/5 shrink-0">
              <div>
                <h1 className="text-4xl font-black font-sora text-ink-primary leading-none tracking-tight uppercase">
                  {editingOrder ? 'EDIT ORDER' : 'NEW ORDER'}<span className="text-accent-signature">.</span>
                </h1>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">
                  B2B / B2C sales order
                </p>
              </div>
              <button
                className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all"
                onClick={() => { setShowModal(false); setEditingOrder(null); setForm(EMPTY_FORM); }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 px-8 py-6 space-y-6">

                {/* Client + type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Client</label>
                    <select
                      className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-4 py-3 font-semibold text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all appearance-none"
                      value={form.clientId}
                      onChange={e => onClientChange(e.target.value)}
                    >
                      <option value="">Walk-in / No client</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.client_type ? ` (${c.client_type})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Order type toggle */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Order Type</label>
                    <div className="flex gap-2">
                      {['B2B', 'B2C'].map(t => (
                        <button
                          key={t} type="button"
                          onClick={() => setForm(prev => ({ ...prev, orderType: t }))}
                          className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-black transition-all ${
                            form.orderType === t
                              ? 'border-ink-primary bg-ink-primary text-surface'
                              : 'border-black/10 bg-canvas text-ink-primary hover:border-black/20'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Price tier */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Price Tier</label>
                    <select
                      className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-4 py-3 font-semibold text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all appearance-none"
                      value={form.priceTier}
                      onChange={e => setForm(prev => ({ ...prev, priceTier: e.target.value }))}
                    >
                      <option value="RETAIL">Retail</option>
                      <option value="WHOLESALE">Wholesale</option>
                      <option value="DISTRIBUTOR">Distributor</option>
                    </select>
                  </div>

                  {/* Requested date */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Requested Date</label>
                    <input
                      type="date"
                      className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-4 py-3 font-semibold text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all"
                      value={form.requestedDate}
                      onChange={e => setForm(prev => ({ ...prev, requestedDate: e.target.value }))}
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Notes</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-4 py-3 font-semibold text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all"
                      placeholder="Special instructions..."
                      value={form.notes}
                      onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Line items */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Line Items</p>
                    <button
                      type="button"
                      onClick={addItem}
                      className="flex items-center gap-1.5 text-[10px] font-black text-ink-primary hover:text-accent-signature transition-colors"
                    >
                      <Plus size={12} /> Add Item
                    </button>
                  </div>

                  {form.items.length === 0 && (
                    <div className="py-8 text-center border-2 border-dashed border-black/10 rounded-xl">
                      <Package size={24} className="mx-auto mb-2 opacity-20" />
                      <p className="text-[10px] font-semibold text-gray-400">No items — click "Add Item"</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {form.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-canvas rounded-xl p-3 border border-black/5">
                        {/* Product select */}
                        <select
                          className="flex-1 min-w-0 bg-white border border-black/8 rounded-lg px-3 py-2 font-semibold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 appearance-none"
                          value={item.productId}
                          onChange={e => updateItem(idx, 'productId', e.target.value)}
                          required
                        >
                          <option value="">Select product...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>

                        {/* Qty */}
                        <div className="flex items-center gap-0 rounded-lg overflow-hidden border border-black/10 shrink-0">
                          <button type="button" className="w-7 h-8 flex items-center justify-center bg-canvas text-gray-500 hover:bg-black/5 text-sm font-bold"
                            onClick={() => updateItem(idx, 'qty', Math.max(1, (item.qty || 1) - 1))}>−</button>
                          <span className="w-10 text-center text-xs font-bold tabular-nums bg-white" style={{ lineHeight: '32px' }}>{item.qty || 1}</span>
                          <button type="button" className="w-7 h-8 flex items-center justify-center bg-canvas text-gray-500 hover:bg-black/5 text-sm font-bold"
                            onClick={() => updateItem(idx, 'qty', (item.qty || 1) + 1)}>+</button>
                        </div>

                        {/* Unit price */}
                        <div className="relative shrink-0 w-28">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">{sym}</span>
                          <input
                            type="number" step="0.01" min="0"
                            className="w-full bg-white border border-black/8 rounded-lg pl-6 pr-2 py-2 font-bold text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/30 tabular-nums"
                            value={item.unitPrice || 0}
                            onChange={e => updateItem(idx, 'unitPrice', e.target.value)}
                          />
                        </div>

                        {/* Line total */}
                        <span className="text-xs font-black text-ink-primary tabular-nums w-20 text-right shrink-0">
                          {sym}{Number(item.total || 0).toLocaleString()}
                        </span>

                        {/* Remove */}
                        <button type="button" onClick={() => removeItem(idx)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Order total */}
                  {form.items.length > 0 && (
                    <div className="flex justify-end mt-3 pt-3 border-t border-black/5">
                      <div className="text-right">
                        <div className="text-[9px] font-semibold text-gray-400">Grand Total</div>
                        <div className="text-lg font-black text-ink-primary tabular-nums">
                          {sym}{formTotals.grandTotal.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-5 border-t border-black/5 bg-canvas/50 shrink-0 flex gap-3">
                <button
                  type="button"
                  className="flex-1 py-3 rounded-xl border border-black/10 font-semibold text-xs text-ink-primary hover:bg-black/5 transition-all"
                  onClick={() => { setShowModal(false); setEditingOrder(null); setForm(EMPTY_FORM); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-signature !h-12 !text-sm font-black flex items-center justify-center gap-3 !rounded-xl"
                >
                  {editingOrder ? 'SAVE CHANGES' : 'CREATE ORDER'}
                  <div className="icon-nest !w-8 !h-8"><Check size={16} /></div>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
