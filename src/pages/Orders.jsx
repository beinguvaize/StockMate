import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, ChevronDown, ChevronUp, ChevronRight, Pencil, X, Trash2, Truck, Package,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { useOrders } from '../hooks/useOrders';
import { useSales } from '../hooks/useSales';
import { usePeople } from '../hooks/usePeople';
import { useInventory } from '../hooks/useInventory';
import { supabase } from '../lib/supabase';
import { todayISOInAppTZ, cn } from '../lib/utils';
import {
  STAGES, CANCELLED, stageOf, TIER_LABELS, mergePipeline, filterOrders, stageCounts, orderFigures,
  lineFigures, orderActions, orderHandoff,
} from '../lib/orderView';
import { longDay, shortDay } from '../lib/estimateView';
import { PageSkeleton } from '../components/ui/States';
import { Button } from '../components/ui/button';
import { FigureStrip, Figure } from '../components/ui/FigureStrip';
import OrderForm from '../components/orders/OrderForm';
import OrderPanel from '../components/orders/OrderPanel';
import { ConvertOrderDialog, CancelOrderDialog, DeleteOrderDialog } from '../components/orders/OrderDialogs';
import { StagePill, Tag, SquareBtn, STAGE_DOT } from '../components/orders/parts';
import { rupees, failWords } from '../components/estimates/parts';

const ROW_GRID = 'md:grid md:grid-cols-[200px_minmax(0,1fr)_120px_128px_116px_minmax(200px,auto)] md:gap-3 md:items-center';

/**
 * Orders (approved mockups orders-01 to 09): orders you deliver and bill
 * later, alongside invoices still on their way, in one pipeline. The rules
 * and figures are in lib/orderView.
 *
 * Convert to sale hands the items and client to the till and does NOT move
 * the order: the Sales page moves it to Invoiced once the sale is saved
 * (lib/convertHandoff).
 */
const Orders = () => {
  const { currentUser } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { addNotification } = useNotifications();
  const { orders, priceLists, loading, refetch, createOrder, updateOrder, advanceStatus, deleteOrder } = useOrders(currentTenantId);
  const { invoices, refetch: refetchInvoices } = useSales(currentTenantId);
  const { clients } = usePeople(currentTenantId);
  const { products } = useInventory(currentTenantId);
  const navigate = useNavigate();
  const sym = businessProfile?.currencySymbol || '₹';
  const today = todayISOInAppTZ();

  const allItems = useMemo(() => mergePipeline(orders, invoices), [orders, invoices]);
  const [activeStage, setActiveStage] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null); // { order } | { order: null } for new
  const [saving, setSaving] = useState(null); // order id being advanced
  const [convertOrder, setConvertOrder] = useState(null);
  const [cancelOrder, setCancelOrder] = useState(null);
  const [delOrder, setDelOrder] = useState(null);

  const filtered = useMemo(() => filterOrders(allItems, { stage: activeStage, query: searchTerm }), [allItems, activeStage, searchTerm]);
  const counts = useMemo(() => stageCounts(allItems), [allItems]);
  const figs = useMemo(() => orderFigures(allItems, today), [allItems, today]);
  const openOrder = openId ? allItems.find((o) => o.id === openId) || null : null;

  const reread = () => { refetch?.(); refetchInvoices?.(); };

  const submitForm = async (f) => {
    const subtotal = f.items.reduce((s, i) => s + (Number(i.total) || 0), 0);
    if (form?.order) {
      return updateOrder(form.order.id, {
        client_id: f.clientId || null,
        client_name: f.clientName,
        order_type: f.orderType,
        price_tier: f.priceTier,
        items: f.items,
        subtotal,
        grand_total: subtotal,
        notes: f.notes || null,
        requested_date: f.requestedDate || null,
      });
    }
    return createOrder({ ...f, subtotal, grandTotal: subtotal, discount: 0, createdBy: currentUser?.id || null });
  };

  const handleAdvance = async (order) => {
    const next = stageOf(order.status).next;
    if (!next) return;
    // Last hop (Delivered → Invoiced) = turn the order into a real sale.
    if (next === 'INVOICED') { setConvertOrder(order); return; }
    setSaving(order.id);
    let res;
    try { res = await advanceStatus(order.id, next); } catch (e) { res = { error: e }; }
    setSaving(null);
    if (res?.error) { console.error('[orders] advance failed', res.error); addNotification(failWords(res.error, 'stage change'), 'error', 9000); return; }
    addNotification(`${order.order_number} marked ${stageOf(next).label.toLowerCase()}`, 'success');
  };

  // Hand the items and client to the till. The order moves to Invoiced
  // there, once the sale is saved.
  const openSale = (order) => {
    const h = orderHandoff(order);
    if (!h) { addNotification('This order has no items to sell.', 'error'); return; }
    try { sessionStorage.setItem('estimate_cart', JSON.stringify(h)); } catch (_) { /* storage unavailable */ }
    setConvertOrder(null);
    navigate('/sales');
  };

  const doCancel = async (order) => {
    const res = await advanceStatus(order.id, 'CANCELLED');
    if (!res?.error) addNotification(`${order.order_number} cancelled`, 'success');
    return res;
  };
  const doDelete = async (order) => {
    const res = await deleteOrder(order.id);
    if (!res?.error) { if (openId === order.id) setOpenId(null); addNotification(`${order.order_number} deleted`, 'success'); }
    return res;
  };

  const toggleDelivery = async (order) => {
    const newVal = !order._delivery_required;
    const { error } = await supabase.rpc('set_invoice_delivery', {
      p_invoice_id: order.id,
      p_required: newVal,
      p_tenant_id: currentTenantId || undefined,
    });
    if (error) { console.error('toggleDelivery error:', error); addNotification(failWords(error, 'delivery flag'), 'error', 9000); }
    else refetchInvoices();
  };
  const viewInvoice = () => navigate('/invoices');

  if (loading) return <PageSkeleton cards={4} rows={8} />;

  const stageChip = (id, label, count, tone) => {
    const on = activeStage === id;
    return (
      <button key={id} type="button" aria-pressed={on} onClick={() => setActiveStage(id)}
        className={cn('m-press inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 py-[7px] font-tight text-[13px] font-semibold',
          on ? 'bg-ink text-white' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
        {tone && <i aria-hidden="true" className={cn('h-[7px] w-[7px] rounded-full', on ? 'bg-white/70' : STAGE_DOT[tone])} />}
        {label}<b className={cn('font-semibold tabular-nums', on ? 'text-white/60' : 'text-mute')}>{count}</b>
      </button>
    );
  };

  const renderRow = (order) => {
    const a = orderActions(order);
    const items = Array.isArray(order.items) ? order.items : [];
    const expanded = expandedId === order.id;
    const isSaving = saving === order.id;
    const stop = (e) => e.stopPropagation();
    return (
      <div key={order.id} role="button" tabIndex={0} onClick={() => setOpenId(order.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(order.id); }}
        className={cn('cursor-pointer border-t border-sep px-4 py-3 first:border-t-0 hover:bg-tile flex flex-wrap items-center gap-x-3 gap-y-1.5', ROW_GRID,
          order.status === 'CANCELLED' && 'opacity-55')}>
        <div className="min-w-0">
          <span className="block font-tight text-[13.5px] font-semibold tabular-nums">{order.order_number}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {a.isInvoice ? <Tag amber>Invoice</Tag> : (<><Tag>{order.order_type}</Tag><Tag>{TIER_LABELS[order.price_tier] || order.price_tier}</Tag></>)}
          </div>
        </div>
        <div className="min-w-0">
          <span className="block truncate font-tight text-[13.5px] font-semibold">{order.client_name || 'Walk-in'}</span>
          {items.length > 0 && <small className="block text-[12px] text-mute">{items.length} item{items.length > 1 ? 's' : ''}</small>}
        </div>
        <div className="text-[13px] tabular-nums text-ink-2">{order.requested_date ? longDay(String(order.requested_date).slice(0, 10)) || order.requested_date : <span className="text-mute">—</span>}</div>
        <div><StagePill status={order.status} /></div>
        <div className="text-right font-tight text-[14px] font-semibold tabular-nums md:block">{rupees(order.grand_total, sym)}</div>
        <div className="ml-auto flex items-center justify-end gap-1.5" onClick={stop} onKeyDown={stop} role="presentation">
          {a.advance && (
            <button type="button" onClick={() => handleAdvance(order)} disabled={isSaving}
              className={cn('m-press inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-3 py-1.5 font-tight text-[12.5px] font-semibold text-white disabled:opacity-50',
                a.convert ? 'bg-amber hover:bg-amber-hover' : 'bg-ink hover:bg-[#2A2F35]')}>
              {isSaving ? 'Saving…' : a.convert ? '₹ Convert to sale' : <>{stageOf(a.advance).label}<ChevronRight size={12} /></>}
            </button>
          )}
          {a.delivery && (
            <button type="button" onClick={() => toggleDelivery(order)}
              title={order._delivery_required ? 'Remove delivery flag' : 'Mark for van delivery'}
              className={cn('m-press inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-3 py-1.5 font-tight text-[12.5px] font-semibold',
                order._delivery_required ? 'bg-info-soft text-info-text' : 'text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
              <Truck size={12} /> {order._delivery_required ? 'Delivery on' : 'Delivery'}
            </button>
          )}
          {a.viewInvoice && (
            <button type="button" onClick={viewInvoice} title="Manage on Invoices page"
              className="font-tight text-[12.5px] font-semibold text-amber-text hover:underline underline-offset-4">View invoice</button>
          )}
          {a.edit && <SquareBtn title="Edit" onClick={() => setForm({ order })}><Pencil /></SquareBtn>}
          {a.cancel && <SquareBtn title="Cancel order" danger onClick={() => setCancelOrder(order)}><X /></SquareBtn>}
          {a.remove && <SquareBtn title="Delete" danger onClick={() => setDelOrder(order)}><Trash2 /></SquareBtn>}
          {a.expand && (
            <SquareBtn title={expanded ? 'Hide items' : 'Show items'} aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : order.id)}>
              {expanded ? <ChevronUp /> : <ChevronDown />}
            </SquareBtn>
          )}
        </div>
        {expanded && items.length > 0 && (
          <div className="col-span-full mt-1 w-full rounded-xl bg-tile px-4 py-3" onClick={stop} role="presentation">
            {order.notes && <p className="mb-2 text-[12.5px] italic text-body">“{order.notes}”</p>}
            {items.map((it, idx) => {
              const l = lineFigures(it);
              return (
                <div key={idx} className="grid grid-cols-[1fr_70px_100px_110px] gap-2.5 border-t border-line py-[7px] text-[13px] first-of-type:border-t-0">
                  <span className="truncate">{l.name}</span>
                  <span className="text-right font-tight tabular-nums">× {l.qty}</span>
                  <span className="text-right font-tight tabular-nums">{l.has ? rupees(Math.round(l.rate), sym) : '—'}</span>
                  <span className="text-right font-tight tabular-nums">{l.has ? rupees(Math.round(l.amount), sym) : '—'}</span>
                </div>
              );
            })}
            <div className="grid grid-cols-[1fr_70px_100px_110px] gap-2.5 border-t border-ink-2 py-[7px] font-tight text-[13.5px] font-semibold">
              <span>Total</span><span /><span /><span className="text-right tabular-nums">{rupees(order.grand_total, sym)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col pb-16">
      {allItems.length === 0 ? (
        <div className="m-rise mt-2 rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <span className="mx-auto mb-3.5 grid h-[52px] w-[52px] place-items-center rounded-2xl bg-tile text-ink-2"><Package size={24} strokeWidth={1.7} /></span>
          <h3 className="font-tight text-[17px] font-semibold">No open orders</h3>
          <p className="mx-auto mt-1.5 max-w-[56ch] text-[13.5px] text-body">Use Orders when a customer orders today but you deliver and bill later: wholesale, B2B, van sales. Each one moves through Confirmed, Dispatched, Delivered and Invoiced, then becomes a sale.</p>
          <p className="mt-2.5 text-[12.5px] text-mute">For a sale over the counter, use Sales instead.</p>
          <Button className="mt-4" onClick={() => setForm({ order: null })}><Plus /> Create first order</Button>
        </div>
      ) : (
        <>
          <FigureStrip cols={4} className="m-rise mb-5" style={{ '--i': 1 }}>
            <Figure label="Open pipeline" value={rupees(figs.open, sym)} sub="not yet invoiced" />
            <Figure label="Active orders" value={figs.active.toLocaleString('en-IN')} sub="everything but cancelled" />
            <Figure label="Today" value={figs.today.toLocaleString('en-IN')} sub={`orders made on ${shortDay(today)}`} />
            <Figure label="To dispatch" value={figs.toDispatch.toLocaleString('en-IN')} sub="confirmed, not sent out" />
          </FigureStrip>

          <div className="m-rise mb-3 flex max-w-full items-center gap-1.5 overflow-x-auto no-scrollbar" style={{ '--i': 2 }} role="group" aria-label="Stage">
            {stageChip('ALL', 'All', counts.ALL)}
            {STAGES.map((s, i) => (
              <React.Fragment key={s.id}>
                {i > 0 && <ChevronRight size={13} className="shrink-0 text-faint" aria-hidden="true" />}
                {stageChip(s.id, s.label, counts[s.id] || 0, s.tone)}
              </React.Fragment>
            ))}
            <span className="w-2.5 shrink-0" />
            {stageChip(CANCELLED.id, CANCELLED.label, counts.CANCELLED || 0, CANCELLED.tone)}
          </div>

          <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 3 }}>
            <div className="relative w-full sm:w-[280px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" size={16} />
              <input type="text" aria-label="Order number or client name" placeholder="Order number or client name" value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-full rounded-pill bg-well pl-10 pr-4 text-[13px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
            </div>
            <div className="flex-1" />
            <Button size="sm" onClick={() => setForm({ order: null })}><Plus /> New order</Button>
          </div>

          <div className="m-rise overflow-hidden rounded-2xl shadow-[inset_0_0_0_1px_var(--color-line)]" style={{ '--i': 4 }}>
            <div className={cn('hidden bg-tile px-4 py-[9px] font-tight text-[12px] font-semibold text-mute', ROW_GRID)}>
              <span>Order</span><span>Client</span><span>Requested</span><span>Stage</span><span className="text-right">Total</span><span className="text-right">Actions</span>
            </div>
            {filtered.map(renderRow)}
            {!filtered.length && (
              <div className="px-4 pt-12 pb-14 text-center text-[13px] text-body">
                <b className="mb-1 block font-tight text-[15px] font-semibold text-ink">No orders match</b>
                Change the stage or search.
              </div>
            )}
          </div>
          <div className="px-1 pt-3.5 text-[13px] text-body">{filtered.length} {filtered.length === 1 ? 'order' : 'orders'} · newest first</div>
        </>
      )}

      <OrderPanel order={openOrder} busy={openOrder ? saving === openOrder.id : false} onClose={() => setOpenId(null)}
        onAdvance={handleAdvance} onConvert={(o) => setConvertOrder(o)} onCancel={(o) => setCancelOrder(o)}
        onDelete={(o) => setDelOrder(o)} onEdit={(o) => { setOpenId(null); setForm({ order: o }); }}
        onToggleDelivery={toggleDelivery} onViewInvoice={viewInvoice} />

      {form && (
        <OrderForm key={form.order?.id || 'new'} order={form.order} clients={clients || []} products={products || []} priceLists={priceLists || []}
          sym={sym} onSubmit={submitForm} onClose={() => setForm(null)} onReread={reread} />
      )}
      {convertOrder && <ConvertOrderDialog order={convertOrder} onOpenSale={openSale} onClose={() => setConvertOrder(null)} />}
      {cancelOrder && <CancelOrderDialog order={cancelOrder} onCancel={doCancel} onClose={() => setCancelOrder(null)} onReread={reread} />}
      {delOrder && <DeleteOrderDialog order={delOrder} onDelete={doDelete} onClose={() => setDelOrder(null)} onReread={reread} />}
    </div>
  );
};

export default Orders;
