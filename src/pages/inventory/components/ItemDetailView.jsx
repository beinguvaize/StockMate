import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, ChevronDown, X } from 'lucide-react';
import { isService } from '../../../lib/productTypes';
import { useDialogClose } from '../../../hooks/useDialogClose';
import SegmentedTabs from '../../../components/motion/SegmentedTabs';
import HoldButton from '../../../components/motion/HoldButton';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import WriteFailure from '../../../components/invoices/WriteFailure';
import { supabase } from '../../../lib/supabase';
import { formatCurrency, cn } from '../../../lib/utils';
import { productPill, dayMonth } from '../../../lib/inventoryView';
import { ProductAvatar } from './parts';

/**
 * The product panel (approved inventory-07, -08): figures, stock by
 * location, recent movements and details; batches and manual adjustments;
 * sales by client; and its prices. Batches / sales / clients / party prices
 * are fetched on open. Read only, apart from the actions in its footer,
 * which are the page's own.
 */
const TABS = [
  { key: 'OVERVIEW', label: 'Overview' },
  { key: 'BATCHES',  label: 'Batches' },
  { key: 'CLIENTS',  label: 'Clients' },
  { key: 'PRICES',   label: 'Prices' },
];

// Where a batch came from when no supplier is linked (hand-added stock, or a
// cost-layer reconciliation). Keeps the note readable instead of showing "—".
const batchSource = (b) => {
  const note = (b.note || '').trim();
  if (!note) return b.purchase_id ? 'Purchase' : 'Added by hand';
  if (/^reconcile/i.test(note)) return 'Stock reconciliation';
  return note;
};

// Manual adjustments only: anything NOT written by an automated flow.
const SYSTEM_REASON = /^(sale|purchase|van |loaded on vehicle|dispatch to vehicle|void sale|unvoid sale)/i;

const ItemDetailView = ({
  product, locations = [], balances = [], tenantId,
  onClose, onEdit, onAdjust, onPrintBarcode, onDelete, onReorder, onBatches, onReread, currencySymbol = '₹',
  items = [], onSelect,
}) => {
  const [tab, setTab] = useState('OVERVIEW');
  const detailRef = React.useRef(null);
  const [batches, setBatches] = useState([]);
  const [movements, setMovements] = useState([]);
  const [sales, setSales] = useState([]);
  const [clients, setClients] = useState({});
  const [suppliers, setSuppliers] = useState({});
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const pid = product?.id;

  // Picking a different item should show its details from the top — reset the
  // detail panel scroll (and tab) on selection change.
  useEffect(() => {
    setTab('OVERVIEW');
    setDeleteError(null);
    if (detailRef.current) detailRef.current.scrollTop = 0;
  }, [pid]);

  useEffect(() => {
    if (!pid || !tenantId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [b, s, c, pl, sup, mv] = await Promise.all([
        supabase.from('product_batches').select('id, unit_cost, qty_remaining, qty_received, received_date, expiry_date, supplier_id, purchase_id, note')
          .eq('product_id', pid).eq('tenant_id', tenantId).is('deleted_at', null)
          .order('received_date', { ascending: false }),
        supabase.from('sales').select('"shopId", items, date, "totalAmount"')
          .eq('tenant_id', tenantId).is('deleted_at', null).limit(1000),
        supabase.from('clients').select('id, name').eq('tenant_id', tenantId).is('deleted_at', null),
        supabase.from('price_lists').select('*').eq('product_id', pid).eq('tenant_id', tenantId),
        supabase.from('suppliers').select('id, name').eq('tenant_id', tenantId).is('deleted_at', null),
        // Every stock in/out for this item — purchases, sales, and manual
        // adjustments — so the user can track exactly what moved and why.
        supabase.from('movement_log').select('id, date, type, quantity, reason')
          .is('deleted_at', null)
          .eq('product_id', pid).eq('tenant_id', tenantId)
          .order('date', { ascending: false }).limit(200),
      ]);
      if (cancelled) return;
      setBatches(b.data || []);
      setMovements(mv.data || []);
      // Keep only sales that contain this product.
      setSales((s.data || []).filter(row =>
        Array.isArray(row.items) && row.items.some(it => (it.id || it.productId) === pid)));
      setClients(Object.fromEntries((c.data || []).map(x => [x.id, x.name])));
      setSuppliers(Object.fromEntries((sup.data || []).map(x => [x.id, x.name])));
      setPrices(pl.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [pid, tenantId]);

  const totalStock = useMemo(() => {
    const bal = balances.filter(x => x.product_id === pid);
    if (bal.length) return bal.reduce((s, b) => s + Number(b.quantity || 0), 0);
    return Number(product?.stock ?? 0);
  }, [balances, pid, product]);

  const byGodown = useMemo(() => locations.map(loc => ({
    name: loc.name || 'Location',
    type: loc.type || 'WAREHOUSE',
    qty: balances.filter(b => b.product_id === pid && b.location_id === loc.id)
      .reduce((s, b) => s + Number(b.quantity || 0), 0),
  })), [locations, balances, pid]);

  // Sales of this item rolled up by party.
  const partyReport = useMemo(() => {
    const map = {};
    sales.forEach(row => {
      const party = row.shopId ? (clients[row.shopId] || 'Customer') : 'Walk-in';
      const line = (row.items || []).filter(it => (it.id || it.productId) === pid);
      const qty = line.reduce((s, it) => s + Number(it.quantity || 0), 0);
      const val = line.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.rate || it.price || 0), 0);
      if (!map[party]) map[party] = { party, qty: 0, value: 0, count: 0, last: '' };
      map[party].qty += qty;
      map[party].value += val;
      map[party].count += 1;
      if (String(row.date) > map[party].last) map[party].last = row.date;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [sales, clients, pid]);

  const cost = Number(product?.costPrice ?? 0);

  // Stock value from the batches themselves, not products.costPrice.
  //
  // costPrice is a weighted average; FIFO consumes real batch costs, so valuing
  // stock at the average made this card disagree with the COGS the same stock
  // will produce.
  //
  // Batches can also under-cover the balance. Rather than hide the gap, value
  // what the batches cover at their own cost and the remainder at costPrice,
  // and say so.
  const stockValue = useMemo(() => {
    const qty = batches.reduce((s, b) => s + Number(b.qty_remaining || 0), 0);
    const val = batches.reduce((s, b) => s + Number(b.qty_remaining || 0) * Number(b.unit_cost || 0), 0);
    if (!batches.length) return { value: totalStock * cost, uncosted: 0 };
    const uncosted = totalStock - qty;                 // stock no batch accounts for
    return { value: val + Math.max(uncosted, 0) * cost, uncosted };
  }, [batches, totalStock, cost]);

  const sell = Number(product?.sellingPrice ?? 0);
  const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
  const itemCode = product?.sku || product?.barcode || '';
  const lowThreshold = product?.low_stock_threshold ?? product?.lowStockThreshold ?? 10;
  // A service is neither in stock nor out of it. Showing a red "Out of Stock"
  // badge on a tuition hour reads as a problem the shop cannot fix.
  const svc = isService(product);
  const inStock = totalStock > 0;
  const pill = productPill(product, totalStock, { service: svc });

  useDialogClose(onClose);
  const panelRef = React.useRef(null);
  useEffect(() => { panelRef.current?.focus(); }, []);
  // Keep Tab inside the panel while it is open.
  const trapTab = (e) => {
    if (e.key !== 'Tab') return;
    const f = panelRef.current?.querySelectorAll('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!f || !f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const idx = (items || []).findIndex(it => it.id === pid);
  const prevItem = idx > 0 ? items[idx - 1] : null;
  const nextItem = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null;
  const lastBuyCost = batches.length ? Number(batches[0].unit_cost) : null;
  const unit = (product?.unit || '').toUpperCase();
  const money = (n) => formatCurrency(n, currencySymbol);
  const manual = movements.filter(m => { const r = (m.reason || '').trim(); return r !== '' && !SYSTEM_REASON.test(r); });

  const marginTone = margin < 5 ? 'text-bad-text' : margin < 15 ? 'text-amber-text' : 'text-ink';
  const lastTone = lastBuyCost == null || Math.abs(lastBuyCost - cost) <= 0.5 ? 'text-ink' : lastBuyCost > cost ? 'text-bad-text' : 'text-good-text';
  const stockTone = !inStock ? 'text-bad-text' : pill.tone === 'warn' ? 'text-amber-text' : 'text-ink';

  const del = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await onDelete?.(product);
    setDeleting(false);
    if (res?.error) setDeleteError(res.error);
  };

  // Portal to <body>: the shell's <main> animates with a transform, which
  // would otherwise trap this fixed overlay inside it.
  return createPortal((
    <div className="fixed inset-0 z-[150]" onKeyDown={trapTab}>
      <div className="m-scrim absolute inset-0 bg-[rgba(17,20,24,0.28)]" onClick={onClose} aria-hidden="true" />
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={product?.name || 'Product'}
        style={{ width: 'min(480px, 100vw)' }}
        className="m-panel absolute inset-y-0 right-0 flex flex-col bg-surface text-ink outline-none shadow-[-24px_0_48px_-24px_rgba(17,20,24,0.35)]">
        {/* Header */}
        <div className="px-[22px] pt-[18px] pb-3.5 border-b border-sep">
          <div className="flex items-center gap-1.5">
            <Badge tone={pill.tone}>{pill.label}</Badge>
            <div className="ml-auto flex items-center gap-1">
              {(prevItem || nextItem) && (<>
                <NavBtn label="Previous product" onClick={() => prevItem && onSelect?.(prevItem)} disabled={!prevItem}><ChevronUp size={15} /></NavBtn>
                <NavBtn label="Next product" onClick={() => nextItem && onSelect?.(nextItem)} disabled={!nextItem}><ChevronDown size={15} /></NavBtn>
              </>)}
              <Button variant="secondary" size="icon-sm" onClick={onClose} aria-label="Close" title="Close"><X size={14} /></Button>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <ProductAvatar product={product} size="md" />
            <div className="min-w-0">
              <h3 className="font-tight text-[19px] font-semibold tracking-[-0.01em] leading-snug break-words">{product?.name}</h3>
              <p className="mt-0.5 truncate text-[13px] text-body">{[itemCode || null, product?.category].filter(Boolean).join(' · ') || '—'}</p>
            </div>
          </div>
          <SegmentedTabs className="mt-3.5 !flex w-full [&>button]:flex-1 [&>button]:justify-center" items={TABS} value={tab} onChange={setTab}
            trackClass="bg-well" indicatorClass="bg-surface shadow-[0_1px_2px_rgba(17,20,24,0.12)]" activeClass="text-ink" />
        </div>

        <div ref={detailRef} className="flex-1 overflow-y-auto px-[22px] py-4">
          {tab === 'OVERVIEW' && (
            <>
              <div className="mb-[18px] grid grid-cols-3 gap-2">
                {!svc && <Stat label="In stock" value={`${totalStock} ${unit}`} cls={stockTone} />}
                {!svc && <Stat label="Reorder at" value={`${lowThreshold} ${unit}`} />}
                <Stat label="Margin" value={`${margin.toFixed(1)}%`} cls={marginTone} />
                <Stat label="Avg cost" value={money(cost)} />
                <Stat label="Last buy" value={lastBuyCost == null ? '—' : money(lastBuyCost)} cls={lastTone} />
                <Stat label="Sell" value={money(sell)} />
                {!svc && (
                  <div className="col-span-3 flex items-baseline justify-between gap-3 rounded-[10px] bg-tile px-3 py-[9px]">
                    <span className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Stock value at cost</span>
                    <span className="text-right">
                      <b className="block font-tight text-[17px] font-semibold tabular-nums">{money(stockValue.value)}</b>
                      {stockValue.uncosted > 0 && (
                        <small className="block text-[11.5px] text-amber-text">{stockValue.uncosted} {unit} not in any batch, valued at average cost</small>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {!svc && byGodown.length > 0 && (
                <Block title="Stock by location">
                  {byGodown.map((g, i) => <KV key={i} label={g.name} value={`${g.qty} ${unit}`} />)}
                </Block>
              )}

              {!svc && (
                <Block title="Recent movements">
                  {loading ? <Muted>Loading…</Muted>
                    : movements.length === 0 ? <Muted>No movements yet</Muted>
                    : movements.slice(0, 8).map(m => {
                      const isIn = String(m.type).toUpperCase() === 'IN';
                      return (
                        <div key={m.id} className="grid grid-cols-[52px_1fr_auto] items-baseline gap-2.5 border-t border-sep py-2 text-[13px] first:border-t-0">
                          <span className="text-[12.5px] text-mute tabular-nums">{dayMonth(m.date)}</span>
                          <span className="min-w-0 truncate text-ink-2">{m.reason || (isIn ? 'Stock in' : 'Stock out')}</span>
                          <b className={cn('font-tight text-[13px] font-semibold tabular-nums', isIn ? 'text-good-text' : 'text-bad-text')}>{isIn ? '+' : '−'}{Math.abs(Number(m.quantity) || 0)}</b>
                        </div>
                      );
                    })}
                </Block>
              )}

              <Block title="Details">
                <KV label="GST" value={`${product?.taxRate ?? 0}%`} />
                <KV label="HSN code" value={product?.hsn_code || product?.hsn || '—'} />
                <KV label="Barcode" value={product?.barcode || '—'} />
                <KV label="Unit" value={product?.unit || '—'} />
                <KV label="Serial numbers" value={product?.track_serial ? 'Yes (IMEI or serial)' : 'No'} />
              </Block>
            </>
          )}

          {tab === 'BATCHES' && (
            <div>
              <h4 className="mb-0.5 font-tight text-[13px] font-semibold">Batches</h4>
              {loading ? <Muted>Loading…</Muted> : batches.length === 0 ? <Muted>No batch records</Muted> : (
                <MiniTable head={['Received', 'Source', 'Left', 'Unit cost']}
                  rows={batches.map(b => ({
                    key: b.id,
                    dim: Number(b.qty_remaining || 0) === 0,
                    cells: [
                      dayMonth(b.received_date),
                      // Stock added by hand or by a cost reconciliation has no
                      // supplier_id; fall back to the batch note.
                      suppliers[b.supplier_id] || batchSource(b),
                      `${b.qty_remaining ?? 0}/${b.qty_received ?? '—'}`,
                      money(b.unit_cost),
                    ],
                  }))} />
              )}
              <h4 className="mt-[18px] mb-0.5 font-tight text-[13px] font-semibold">Manual adjustments</h4>
              {loading ? <Muted>Loading…</Muted> : manual.length === 0 ? <Muted>No manual adjustments</Muted> : (
                <MiniTable head={['Date', 'Reason', 'Qty']}
                  rows={manual.map(m => {
                    const isIn = String(m.type).toUpperCase() === 'IN';
                    return {
                      key: m.id,
                      cells: [
                        dayMonth(m.date), m.reason || '—',
                        <span key="q" className={isIn ? 'text-good-text' : 'text-bad-text'}>{isIn ? '+' : '−'}{Math.abs(Number(m.quantity) || 0)}</span>,
                      ],
                    };
                  })} />
              )}
              {onBatches && !svc && (
                <Button variant="secondary" size="xs" className="mt-3.5 h-8 px-3.5" onClick={() => onBatches(product)}>See all batches with margin</Button>
              )}
            </div>
          )}

          {tab === 'CLIENTS' && (
            loading ? <Muted>Loading…</Muted> : partyReport.length === 0 ? <Muted>No sales for this item yet</Muted> : (
              <MiniTable head={['Client', 'Bills', 'Qty', 'Value']}
                rows={partyReport.map(p => ({ key: p.party, cells: [p.party, p.count, p.qty, money(p.value)] }))} />
            )
          )}

          {tab === 'PRICES' && (
            <MiniTable head={['Client or tier', 'Price']}
              rows={[
                { key: 'all', cells: ['All clients', money(sell)] },
                ...prices.map((p, i) => ({
                  key: p.id || i,
                  cells: [
                    (p.client_id ? (clients[p.client_id] || 'Client') : (p.price_tier || p.tier || 'Tier')) +
                      (p.min_qty > 1 ? ` (min ${p.min_qty})` : ''),
                    money(p.price),
                  ],
                })),
              ]} />
          )}
        </div>

        {/* Actions: one primary */}
        <div className="border-t border-sep px-[22px] pt-3.5 pb-[18px]">
          <WriteFailure error={deleteError} noun="delete" onReread={onReread} className="mb-2.5" />
          <div className="flex flex-wrap items-center gap-[5px]">
            <HoldButton onConfirm={del} disabled={deleting} title="Hold to delete this product"
              className="h-8 rounded-pill bg-surface px-3 font-tight text-[12.5px] font-semibold text-bad-text shadow-[inset_0_0_0_1px_#F5C2C2] disabled:opacity-50">
              {deleting ? 'Deleting…' : 'Hold to delete'}
            </HoldButton>
            <Button variant="secondary" size="xs" className="h-8 px-[11px]" onClick={() => onPrintBarcode?.(product)}>Print barcode</Button>
            <Button variant="secondary" size="xs" className="h-8 px-[11px]" onClick={() => onEdit?.(product)}>Edit</Button>
            {onAdjust && !svc && (
              <Button variant="secondary" size="xs" className="h-8 px-[11px]" onClick={() => onAdjust(product)}>Adjust stock</Button>
            )}
            <span className="flex-1" />
            {onReorder && !svc && (
              <Button size="xs" className="h-8 px-3.5" onClick={() => onReorder(product)}>Reorder</Button>
            )}
          </div>
        </div>
      </aside>
    </div>
  ), document.body);
};

const NavBtn = ({ label, onClick, disabled, children }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
    className="m-press grid h-8 w-8 place-items-center rounded-xl text-ink-2 hover:bg-well disabled:opacity-30 disabled:hover:bg-transparent">{children}</button>
);
const Stat = ({ label, value, cls = 'text-ink' }) => (
  <div className="min-w-0 rounded-[10px] bg-tile px-3 py-[9px]">
    <span className="block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">{label}</span>
    <b className={cn('mt-px block truncate font-tight text-[15px] font-semibold tabular-nums', cls)}>{value}</b>
  </div>
);
const Block = ({ title, children }) => (
  <section className="mb-[18px]">
    <h4 className="mt-1 mb-0.5 font-tight text-[13px] font-semibold">{title}</h4>
    {children}
  </section>
);
const KV = ({ label, value }) => (
  <div className="flex justify-between gap-3 border-t border-sep py-2 text-[13px] first:border-t-0">
    <span className="text-body">{label}</span>
    <span className="break-all text-right font-tight font-medium text-ink-2 tabular-nums">{value}</span>
  </div>
);
const Muted = ({ children }) => <p className="py-6 text-center text-[13px] text-mute">{children}</p>;
const MiniTable = ({ head, rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full border-collapse text-left">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i} className={cn('py-2 font-tight text-[11.5px] font-semibold text-mute border-b border-line', i > 0 && 'pl-2.5', i >= head.length - 2 && head.length > 2 && i > 1 && 'text-right', i === head.length - 1 && 'text-right')}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={r.dim ? '[&>td]:text-faint' : ''}>
            {r.cells.map((c, j) => (
              <td key={j} className={cn('py-[9px] text-[13px] tabular-nums border-b border-sep', j > 0 && 'pl-2.5',
                j >= r.cells.length - 2 && r.cells.length > 2 && j > 1 && 'text-right font-tight', j === r.cells.length - 1 && 'text-right font-tight font-semibold')}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default ItemDetailView;
