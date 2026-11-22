import React, { useEffect, useMemo, useState } from 'react';
import { isService } from '../../../lib/productTypes';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { createPortal } from 'react-dom';
import {
  ScanLine, SlidersHorizontal, Pencil, Trash2, X, ChevronUp, ChevronDown,
} from 'lucide-react';
import SegmentedTabs from '../../../components/motion/SegmentedTabs';
import { supabase } from '../../../lib/supabase';
import { formatCurrency } from '../../../lib/utils';

/**
 * ItemDetailView — full product profile, myBillBook-style.
 * Tabs: Item Details · Stock Details · Party Wise Report · Godown · Party Wise Prices.
 * Header actions: Print Barcode · Adjust Stock · Edit · Delete.
 * Batches / sales / clients / party-prices are fetched on open.
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

const ItemDetailView = ({
  product, locations = [], balances = [], tenantId,
  onClose, onEdit, onAdjust, onPrintBarcode, onDelete, onReorder, currencySymbol = '₹',
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

  const pid = product?.id;

  // Picking a different item should show its details from the top — reset the
  // detail panel scroll (and tab) on selection change.
  useEffect(() => {
    setTab('OVERVIEW');
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
  // will produce (LD Cover 0: card ₹8,859.17 vs batches ₹8,595.70).
  //
  // Batches can also under-cover the balance — that item shows 66 in stock with
  // 65 across its batches. Rather than hide the gap, value what the batches
  // cover at their own cost and the remainder at costPrice, and say so.
  const stockValue = useMemo(() => {
    const qty = batches.reduce((s, b) => s + Number(b.qty_remaining || 0), 0);
    const val = batches.reduce((s, b) => s + Number(b.qty_remaining || 0) * Number(b.unit_cost || 0), 0);
    if (!batches.length) return { value: totalStock * cost, uncosted: 0 };
    const uncosted = totalStock - qty;                 // stock no batch accounts for
    return { value: val + Math.max(uncosted, 0) * cost, uncosted };
  }, [batches, totalStock, cost]);

  const sell = Number(product?.sellingPrice ?? 0);
  const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
  const itemCode = product?.sku || product?.barcode || '—';
  const lowThreshold = product?.low_stock_threshold ?? product?.lowStockThreshold ?? 10;
  // A service is neither in stock nor out of it. Showing a red "Out of Stock"
  // badge on a tuition hour reads as a problem the shop cannot fix.
  const svc = isService(product);
  const inStock = totalStock > 0;

  const [closing, setClosing] = useState(false);
  const closeTimer = React.useRef(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  // Slide out first, then unmount; reduced motion closes at once.
  const requestClose = () => {
    if (closing) return;
    if (reduced) { onClose?.(); return; }
    setClosing(true);
    closeTimer.current = setTimeout(() => onClose?.(), 300);
  };
  useDialogClose(requestClose);
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
  const unit = product?.unit || '';
  const money = (n) => formatCurrency(n, currencySymbol);

  const Stat = ({ label, value, cls = 'text-foreground', hint }) => (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums mt-0.5 ${cls}`}>{value}</div>
      {hint && <div className="text-[11px] text-amber-600 mt-0.5">{hint}</div>}
    </div>
  );
  const Row = ({ label, value }) => (
    <div className="flex justify-between gap-3 py-2 border-b border-border/50 last:border-0 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums text-right break-all">{value}</span>
    </div>
  );
  const outline = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-pill border border-border text-xs font-semibold text-foreground hover:bg-black/[0.03] transition-colors active:scale-[0.97]';

  // Portal to <body>: AppLayout's <main> animates with a transform, which would
  // otherwise trap this `fixed inset-0` overlay inside <main>. z-[200] keeps it
  // above the navbar (z-50).
  return createPortal((
    <div className="fixed inset-0 z-[200]" onKeyDown={trapTab}>
      <div className="drawer-backdrop absolute inset-0 bg-black/30" data-closing={closing} onClick={requestClose} aria-hidden="true" />
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={product?.name || 'Product'} data-closing={closing}
        className="drawer-panel absolute right-0 top-0 bottom-0 w-full sm:w-[420px] bg-card border-l border-border/60 flex flex-col outline-none">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-foreground leading-snug break-words">{product?.name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{[itemCode !== '—' ? itemCode : null, product?.category].filter(Boolean).join(' · ') || '—'}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(prevItem || nextItem) && (<>
              <button onClick={() => prevItem && onSelect?.(prevItem)} disabled={!prevItem} aria-label="Previous product"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-black/[0.04] disabled:opacity-30"><ChevronUp size={16} /></button>
              <button onClick={() => nextItem && onSelect?.(nextItem)} disabled={!nextItem} aria-label="Next product"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-black/[0.04] disabled:opacity-30"><ChevronDown size={16} /></button>
            </>)}
            <button onClick={requestClose} aria-label="Close"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-black/[0.04]"><X size={16} /></button>
          </div>
        </div>

        <div className="px-5">
          <SegmentedTabs className="w-full" items={TABS} value={tab} onChange={setTab}
            indicatorClass="bg-card shadow-sm" />
        </div>

        <div ref={detailRef} className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'OVERVIEW' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                {!svc && <Stat label="In stock" value={`${totalStock} ${unit}`} cls={inStock ? 'text-foreground' : 'text-red-600'} />}
                {!svc && <Stat label="Reorder at" value={`${lowThreshold} ${unit}`} />}
                <Stat label="Avg cost" value={money(cost)} />
                <Stat label="Last buy" value={lastBuyCost == null ? '—' : money(lastBuyCost)}
                  cls={lastBuyCost == null || Math.abs(lastBuyCost - cost) <= 0.5 ? 'text-foreground' : lastBuyCost > cost ? 'text-red-600' : 'text-emerald-600'} />
                <Stat label="Sell" value={money(sell)} />
                <Stat label="Margin" value={`${margin.toFixed(1)}%`} cls={margin < 5 ? 'text-red-600' : margin < 15 ? 'text-amber-600' : 'text-foreground'} />
                {!svc && <Stat label="Stock value at cost" value={money(stockValue.value)}
                  hint={stockValue.uncosted > 0 ? `${stockValue.uncosted} ${unit} not in any batch, valued at average cost` : null} />}
              </div>

              {!svc && byGodown.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-foreground mb-1">Stock by location</h3>
                  {byGodown.map((g, i) => <Row key={i} label={g.name} value={`${g.qty} ${unit}`} />)}
                </section>
              )}

              {!svc && (
                <section>
                  <h3 className="text-xs font-semibold text-foreground mb-1">Recent movements</h3>
                  {loading ? <p className="text-xs text-muted-foreground py-3">Loading…</p>
                    : movements.length === 0 ? <p className="text-xs text-muted-foreground py-3">No movements yet</p>
                    : movements.slice(0, 8).map(m => {
                      const isIn = String(m.type).toUpperCase() === 'IN';
                      return (
                        <div key={m.id} className="flex items-baseline gap-3 py-2 border-b border-border/50 last:border-0 text-xs">
                          <span className="text-muted-foreground tabular-nums shrink-0">{m.date ? String(m.date).slice(0, 10) : '—'}</span>
                          <span className="flex-1 min-w-0 truncate text-foreground">{m.reason || (isIn ? 'Stock in' : 'Stock out')}</span>
                          <span className={`font-semibold tabular-nums ${isIn ? 'text-emerald-600' : 'text-red-500'}`}>{isIn ? '+' : '−'}{Math.abs(Number(m.quantity) || 0)}</span>
                        </div>
                      );
                    })}
                </section>
              )}

              <section>
                <h3 className="text-xs font-semibold text-foreground mb-1">Details</h3>
                <Row label="GST" value={`${product?.taxRate ?? 0}%`} />
                <Row label="HSN code" value={product?.hsn_code || product?.hsn || '—'} />
                <Row label="Barcode" value={product?.barcode || '—'} />
                <Row label="Unit" value={product?.unit || '—'} />
                <Row label="Serialized" value={product?.track_serial ? 'Yes (IMEI/serial)' : 'No'} />
              </section>
            </div>
          )}

          {tab === 'BATCHES' && (
            <div>
              {loading ? <Empty text="Loading…" /> : batches.length === 0 ? <Empty text="No batch records" /> : (
                <Tbl head={['Received', 'Source', 'Remaining', 'Unit cost']}
                  rows={batches.map(b => [
                    b.received_date || '—',
                    // Stock added by hand or by a cost reconciliation has no
                    // supplier_id; fall back to the batch note.
                    suppliers[b.supplier_id] || batchSource(b),
                    `${b.qty_remaining ?? 0}/${b.qty_received ?? '—'}`, money(b.unit_cost),
                  ])} />
              )}
              {/* Manual adjustments only: anything NOT written by an automated flow. */}
              {(() => {
                const SYSTEM_REASON = /^(sale|purchase|van |loaded on vehicle|dispatch to vehicle|void sale|unvoid sale)/i;
                const manual = movements.filter(m => { const r = (m.reason || '').trim(); return r !== '' && !SYSTEM_REASON.test(r); });
                return (
                  <>
                    <h3 className="text-xs font-semibold text-foreground mt-6 mb-1">Manual adjustments</h3>
                    {loading ? <Empty text="Loading…" /> : manual.length === 0 ? <Empty text="No manual adjustments" /> : (
                      <Tbl head={['Date', 'Reason', 'Qty']}
                        rows={manual.map(m => {
                          const isIn = String(m.type).toUpperCase() === 'IN';
                          return [
                            m.date ? String(m.date).slice(0, 10) : '—', m.reason || '—',
                            <span key="q" className={isIn ? 'text-emerald-600' : 'text-red-500'}>{isIn ? '+' : '−'}{Math.abs(Number(m.quantity) || 0)}</span>,
                          ];
                        })} />
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {tab === 'CLIENTS' && (
            loading ? <Empty text="Loading…" /> : partyReport.length === 0 ? <Empty text="No sales for this item yet" /> : (
              <Tbl head={['Client', 'Bills', 'Qty', 'Value']}
                rows={partyReport.map(p => [p.party, p.count, p.qty, money(p.value)])} />
            )
          )}

          {tab === 'PRICES' && (
            <Tbl head={['Client / tier', 'Price']}
              rows={[
                ['All clients', money(sell)],
                ...prices.map(p => [
                  (p.client_id ? (clients[p.client_id] || 'Client') : (p.price_tier || p.tier || 'Tier')) +
                    (p.min_qty > 1 ? ` (min ${p.min_qty})` : ''),
                  money(p.price),
                ]),
              ]} />
          )}
        </div>

        {/* Actions: one primary */}
        <div className="border-t border-border/60 px-5 py-3 flex flex-wrap items-center gap-2">
          <button onClick={() => onDelete?.(product)} aria-label="Delete product" title="Delete"
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors active:scale-[0.97]">
            <Trash2 size={14} />
          </button>
          <button onClick={() => onPrintBarcode?.(product)} className={outline}><ScanLine size={14} /> Print barcode</button>
          <button onClick={() => onEdit?.(product)} className={outline}><Pencil size={14} /> Edit</button>
          {onAdjust && !svc && (
            <button onClick={() => onAdjust(product)} className={outline}><SlidersHorizontal size={14} /> Adjust stock</button>
          )}
          {onReorder && !svc && (
            <button onClick={() => onReorder(product)}
              className="ml-auto inline-flex items-center h-9 px-5 rounded-pill bg-accent-signature text-white text-xs font-semibold hover:bg-accent-signature-hover transition-colors active:scale-[0.97]">
              Reorder
            </button>
          )}
        </div>
      </aside>
    </div>
  ), document.body);
};

const Empty = ({ text }) => <div className="py-8 text-center text-xs text-muted-foreground">{text}</div>;
const Tbl = ({ head, rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left">
      <thead>
        <tr className="text-[11px] font-medium text-muted-foreground border-b border-border/60">
          {head.map((h, i) => <th key={i} className={`py-2 pr-2 ${i === head.length - 1 ? 'text-right pr-0' : ''}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/40 last:border-0">
            {r.map((c, j) => <td key={j} className={`py-2 pr-2 text-xs text-foreground tabular-nums ${j === r.length - 1 ? 'text-right font-semibold pr-0' : ''}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default ItemDetailView;
