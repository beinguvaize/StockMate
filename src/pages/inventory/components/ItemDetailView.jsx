import React, { useEffect, useMemo, useState } from 'react';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ScanLine, SlidersHorizontal, Pencil, Trash2,
  FileText, Boxes, Users, Warehouse, Tags, Search, Plus,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatCurrency } from '../../../lib/utils';

/**
 * ItemDetailView — full product profile, myBillBook-style.
 * Tabs: Item Details · Stock Details · Party Wise Report · Godown · Party Wise Prices.
 * Header actions: Print Barcode · Adjust Stock · Edit · Delete.
 * Batches / sales / clients / party-prices are fetched on open.
 */
const TABS = [
  { id: 'DETAILS', label: 'Item Details', icon: FileText },
  { id: 'STOCK',   label: 'Stock Details', icon: Boxes },
  { id: 'PARTY',   label: 'Client Wise Report', icon: Users },
  { id: 'GODOWN',  label: 'Godown', icon: Warehouse },
  { id: 'PRICES',  label: 'Client Wise Prices', icon: Tags },
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
  onClose, onEdit, onAdjust, onPrintBarcode, onDelete, currencySymbol = '₹',
  items = [], onSelect, onCreate,
}) => {
  useDialogClose(onClose); // only mounted while a product is being viewed
  const [tab, setTab] = useState('DETAILS');
  const [listSearch, setListSearch] = useState('');
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
    setTab('DETAILS');
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
  const sell = Number(product?.sellingPrice ?? 0);
  const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
  const itemCode = product?.sku || product?.barcode || '—';
  const lowThreshold = product?.low_stock_threshold ?? product?.lowStockThreshold ?? 10;
  const inStock = totalStock > 0;

  const Field = ({ label, value, accent }) => (
    <div className="rounded-xl border border-border/60 bg-card p-3.5">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-semibold mt-1 ${accent || 'text-foreground'}`}>{value}</div>
    </div>
  );

  const filteredItems = (items || []).filter(it => {
    const q = listSearch.toLowerCase().trim();
    if (!q) return true;
    return (it.name || '').toLowerCase().includes(q) ||
      (it.sku || '').toLowerCase().includes(q) ||
      (it.barcode || '').toLowerCase().includes(q);
  });

  // Portal to <body>: AppLayout's <main> animates with a transform, which would
  // otherwise trap this `fixed inset-0` overlay inside <main> (below the sticky
  // navbar) and clip it to blank. z-[200] keeps it above the navbar (z-50).
  return createPortal((
    <div className="fixed inset-0 z-[200] bg-canvas flex">
      {/* Master list */}
      <aside className="w-72 shrink-0 border-r border-border/60 bg-card flex flex-col">
        <div className="p-3 border-b border-black/[0.05] space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={listSearch} onChange={e => setListSearch(e.target.value)}
              placeholder="Search item"
              className="w-full bg-canvas border border-border/60 rounded-lg pl-9 pr-3 py-2 text-xs font-semibold outline-none focus:border-black/20" />
          </div>
          {onCreate && (
            <button onClick={onCreate}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-accent-signature/50 text-accent-signature text-xs font-semibold hover:bg-accent-signature/5 transition-colors">
              <Plus size={14} /> Create Item
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredItems.map(it => (
            <button key={it.id} onClick={() => onSelect?.(it)}
              className={`w-full text-left rounded-xl border p-3 transition-colors ${
                it.id === pid ? 'border-accent-signature bg-accent-signature/5' : 'border-border/60 hover:border-black/15 bg-card'
              }`}>
              <div className="text-[13px] font-semibold text-foreground truncate">{it.name}</div>
              <div className="text-[10px] tabular-nums text-muted-foreground mt-0.5 uppercase">{it.sku || it.barcode || ''}</div>
            </button>
          ))}
          {filteredItems.length === 0 && (
            <div className="px-3 py-8 text-center text-[11px] text-muted-foreground font-semibold">No items</div>
          )}
        </div>
      </aside>

      {/* Detail panel */}
      <div ref={detailRef} className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <button onClick={onClose} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-card transition-colors">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-[20px] font-semibold text-foreground">{product?.name}</h1>
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${inStock ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {inStock ? 'In Stock' : 'Out of Stock'}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => onPrintBarcode?.(product)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold text-gray-700 hover:bg-card transition-colors">
              <ScanLine size={14} /> Print Barcode
            </button>
            {onAdjust && (
              <button onClick={() => onAdjust(product)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold text-gray-700 hover:bg-card transition-colors">
                <SlidersHorizontal size={14} /> Adjust Stock
              </button>
            )}
            <button onClick={() => onEdit?.(product)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold text-gray-700 hover:bg-card transition-colors">
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => onDelete?.(product)} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border/60 mb-5 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  tab === t.id ? 'border-accent-signature text-accent-signature' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Item Details */}
        {tab === 'DETAILS' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Item Name" value={product?.name || '—'} />
            <Field label="Item Code" value={itemCode} />
            <Field label="Category" value={product?.category || '—'} />
            <Field label="Stock Quantity" value={`${totalStock} ${product?.unit || ''}`} accent={inStock ? 'text-emerald-600' : 'text-red-600'} />
            <Field label="Purchase Price" value={formatCurrency(cost, currencySymbol)} />
            <Field label="Selling Price" value={formatCurrency(sell, currencySymbol)} />
            <Field label="Margin" value={`${margin.toFixed(1)}%`} accent={margin >= 0 ? 'text-emerald-600' : 'text-red-600'} />
            <Field label="GST %" value={`${product?.taxRate ?? 0}%`} />
            <Field label="HSN Code" value={product?.hsn_code || product?.hsn || '—'} />
            <Field label="Barcode" value={product?.barcode || '—'} />
            <Field label="Unit" value={product?.unit || '—'} />
            <Field label="Low-Stock Alert" value={`${lowThreshold} ${product?.unit || ''}`} />
            <Field label="Serialized" value={product?.track_serial ? 'Yes (IMEI/Serial)' : 'No'} />
          </div>
        )}

        {/* Stock Details */}
        {tab === 'STOCK' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Total Stock" value={`${totalStock} ${product?.unit || ''}`} accent={inStock ? 'text-emerald-600' : 'text-red-600'} />
              <Field label="Stock Value (cost)" value={formatCurrency(totalStock * cost, currencySymbol)} />
              <Field label="Batches" value={batches.length} />
              <Field label="Low-Stock Alert" value={lowThreshold} />
            </div>
            <Card title="Batches">
              {loading ? <Empty text="Loading…" /> : batches.length === 0 ? <Empty text="No batch records" /> : (
                <Tbl head={['Received', 'Source', 'Expiry', 'Received Qty', 'Remaining', 'Unit Cost']}
                  rows={batches.map(b => [
                    b.received_date || '—',
                    // Not every batch comes from a supplier — stock added by
                    // hand, or by a cost reconciliation, has no supplier_id and
                    // rendered a bare "—" with no way to tell where it came
                    // from. Fall back to the batch note.
                    suppliers[b.supplier_id] || batchSource(b), b.expiry_date || '—',
                    b.qty_received ?? '—', b.qty_remaining ?? 0, formatCurrency(b.unit_cost, currencySymbol),
                  ])} />
              )}
            </Card>

            {/* Manual adjustments only — hand corrections to stock. */}
            {(() => {
              // Anything NOT written by an automated flow is a hand correction.
              // Matching /manual|adjust/ on the reason hid almost everything:
              // none of the Adjust Stock presets ("Data correction", "Physical
              // stock count", "Internal use", …) contain those words, so real
              // adjustments looked like "No manual adjustments". Exclude the
              // system-generated reasons instead — that also covers free text
              // and any preset added later.
              const SYSTEM_REASON = /^(sale|purchase|van |loaded on vehicle|dispatch to vehicle|void sale|unvoid sale)/i;
              const manual = movements.filter(m => {
                const reason = (m.reason || '').trim();
                return reason !== '' && !SYSTEM_REASON.test(reason);
              });
              return (
                <Card title="Manual Adjustments">
                  {loading ? <Empty text="Loading…" /> : manual.length === 0 ? <Empty text="No manual adjustments" /> : (
                    <Tbl head={['Date', 'Reason', 'Qty']}
                      rows={manual.map(m => {
                        const isIn = String(m.type).toUpperCase() === 'IN';
                        return [
                          m.date ? String(m.date).slice(0, 10) : '—',
                          m.reason || '—',
                          <span key="q" className={`font-semibold ${isIn ? 'text-emerald-600' : 'text-red-500'}`}>{isIn ? '+' : '−'}{Math.abs(Number(m.quantity) || 0)}</span>,
                        ];
                      })} />
                  )}
                </Card>
              );
            })()}
          </div>
        )}

        {/* Party Wise Report */}
        {tab === 'PARTY' && (
          <Card title="Sales by Client">
            {loading ? <Empty text="Loading…" /> : partyReport.length === 0 ? <Empty text="No sales for this item yet" /> : (
              <Tbl head={['Client', 'Bills', 'Qty Sold', 'Total Value', 'Last Sale']}
                rows={partyReport.map(p => [p.party, p.count, p.qty, formatCurrency(p.value, currencySymbol), p.last || '—'])} />
            )}
          </Card>
        )}

        {/* Godown */}
        {tab === 'GODOWN' && (
          <Card title="Stock by Godown / Location">
            {byGodown.length === 0 ? <Empty text="No locations" /> : (
              <Tbl head={['Godown', 'Type', 'Quantity']}
                rows={byGodown.map(g => [g.name, g.type, `${g.qty} ${product?.unit || ''}`])} />
            )}
          </Card>
        )}

        {/* Party Wise Prices */}
        {tab === 'PRICES' && (
          <Card title="Client Wise Prices">
            <Tbl head={['Client / Tier', 'Sales Price']}
              rows={[
                ['All Parties Price', formatCurrency(sell, currencySymbol)],
                ...prices.map(p => [
                  (p.client_id ? (clients[p.client_id] || 'Client') : (p.price_tier || p.tier || 'Tier')) +
                    (p.min_qty > 1 ? ` (min ${p.min_qty})` : ''),
                  formatCurrency(p.price, currencySymbol),
                ]),
              ]} />
          </Card>
        )}
      </div>
      </div>
    </div>
  ), document.body);
};

const Card = ({ title, children }) => (
  <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
    <div className="px-4 py-3 border-b border-black/[0.05] text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</div>
    {children}
  </div>
);
const Empty = ({ text }) => <div className="px-4 py-10 text-center text-xs font-semibold text-muted-foreground">{text}</div>;
const Tbl = ({ head, rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left">
      <thead>
        <tr className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-black/[0.05]">
          {head.map((h, i) => <th key={i} className={`px-4 py-2.5 ${i >= head.length - 1 ? 'text-right' : ''}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-black/[0.04] last:border-0">
            {r.map((c, j) => <td key={j} className={`px-4 py-2.5 text-xs font-semibold text-gray-700 ${j >= r.length - 1 ? 'text-right font-semibold text-foreground' : ''}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default ItemDetailView;
