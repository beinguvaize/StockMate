import React, { useMemo, useState } from 'react';
import { isService } from '../../../lib/productTypes';
import { PackagePlus, Trash2, Pencil, ArrowUp, ArrowDown, ChevronsUpDown, Plus } from 'lucide-react';
import { useTenant } from '../../../context/TenantContext';

// Veg/non-veg/egg square (restaurant menu). null = nothing.
const FoodMark = ({ type }) => {
  if (!type) return null;
  const c = type === 'VEG' ? 'border-green-600 text-green-600'
    : type === 'NONVEG' ? 'border-red-600 text-red-600'
    : 'border-accent-signature text-accent-signature';
  return (
    <span className={`shrink-0 w-3.5 h-3.5 border rounded-sm flex items-center justify-center ${c}`} title={type}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
    </span>
  );
};

// Postgres numeric arrives as string — coerce before math.
const toNum = (v) => Number(v ?? 0);

// Reorder level: try the various column names the product may carry.
const reorderOf = (p) => toNum(
  p.reorderLevel ?? p.reorder_level ?? p.lowStockThreshold ??
  p.low_stock_threshold ?? p.minStock ?? p.min_stock ?? 0
);

// Stock status from qty vs reorder point (fallback threshold 5 when unset).
const statusOf = (qty, reorder) => {
  if (qty <= 0) return 'crit';
  const thr = reorder > 0 ? reorder : 5;
  return qty <= thr ? 'low' : 'ok';
};
const dotCls = (s) => s === 'crit' ? 'bg-red-500' : s === 'low' ? 'bg-accent-signature' : 'bg-emerald-500';
const qtyCls = (s) => s === 'crit' ? 'text-red-600' : s === 'low' ? 'text-accent-signature' : 'text-foreground';

// Current margin on the LATEST prices — sell vs weighted-average cost
// (products.costPrice, kept fresh from open batches). Null when no sell price,
// so a serviceless/priceless row shows "—" rather than a bogus 0%.
// Base units in one packet (e.g. 0.25 KG). 0 when the product is not sold by
// an alternate unit. Margin % is identical either way — it is a ratio — so only
// the rupee figures need converting.
const packConv = (p) => {
  const c = Number(p?.conversion_factor);
  return (p?.secondary_unit && c > 0) ? c : 0;
};

const marginPct = (p) => {
  const sell = toNum(p.sellingPrice);
  const cost = toNum(p.costPrice);
  if (sell <= 0) return null;
  return ((sell - cost) / sell) * 100;
};
// Loss red, thin amber (<10%), healthy emerald. Tiers let the eye catch the
// items bleeding margin without reading every number.
const marginCls = (m) =>
  m == null ? 'text-muted-foreground'
  : m < 5    ? 'text-red-600'
  : m < 15   ? 'text-amber-600'
  :            'text-foreground';

// Last-buy tint vs the weighted-average cost: costlier to restock = red,
// cheaper = green, same/unknown = muted. Small threshold so rounding noise
// doesn't paint every row.
const lastBuyCls = (last, cost) => {
  const l = toNum(last), c = toNum(cost);
  if (!last || !c) return 'text-muted-foreground';
  if (l > c * 1.005) return 'text-red-600';
  if (l < c * 0.995) return 'text-emerald-600';
  return 'text-muted-foreground';
};

const StockTable = ({ products, totalProducts = 0, onClearFilters, onAddProduct, inventoryBalances, lastBuy = {}, onView, onEdit, onDelete, onAdjust, onBatches, onBulkEdit, onBulkDelete, currencySymbol = '₹' }) => {
  const { businessType } = useTenant();
  const isResto = businessType === 'RESTAURANT';
  // Tenant-level: decides the COLUMN HEADINGS only. Whether a given ROW is a
  // service is a property of that row — a retail shop billing repair labour
  // has both kinds in one table, which is the case this used to get wrong.
  const isServiceTenant = businessType === 'SERVICES';
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [selected, setSelected] = useState(() => new Set());
  const stockOf = (product) =>
    inventoryBalances.filter(b => b.product_id === product.id)
      .reduce((acc, b) => acc + toNum(b.quantity), 0) || toNum(product.stock);

  // Group products by category, sorted; compute per-group subtotal value.
  const groups = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const cat = p.category || 'Uncategorised';
      (map[cat] = map[cat] || []).push(p);
    });
    const sortVal = (p) => {
      switch (sort.key) {
        case 'name':    return (p.name || '').toLowerCase();
        case 'sku':     return (p.sku || '').toLowerCase();
        case 'stock':   return stockOf(p);
        case 'reorder': return reorderOf(p);
        case 'cost':    return toNum(p.costPrice);
        case 'lastbuy': return toNum(lastBuy[p.id]);
        case 'sell':    return toNum(p.sellingPrice);
        case 'margin':  return marginPct(p);
        case 'value':   return stockOf(p) * toNum(p.sellingPrice);
        default:        return 0;
      }
    };
    const cmp = (a, b) => {
      if (!sort.key) return 0;
      const va = sortVal(a), vb = sortVal(b);
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? r : -r;
    };
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cat, items]) => ({
        cat,
        items: sort.key ? [...items].sort(cmp) : items,
        subValue: items.reduce((t, p) => t + stockOf(p) * toNum(p.sellingPrice), 0),
      }));
  }, [products, inventoryBalances, sort]);

  const toggleSort = (key) => setSort(prev =>
    prev.key === key ? (prev.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }) : { key, dir: 'asc' });

  const allIds = useMemo(() => products.map(p => p.id), [products]);
  const allSelected = selected.size > 0 && allIds.every(id => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds));
  const toggleOne = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const clearSelection = () => setSelected(new Set());

  if (!products.length) {
    const none = totalProducts === 0;
    return (
      <div className="rounded-2xl bg-card border border-border/60 p-14 text-center">
        <PackagePlus size={40} strokeWidth={1.25} className="mx-auto text-muted-foreground/40 mb-4" />
        <p className="text-sm font-semibold text-foreground">{none ? 'Add your first product' : 'No products match'}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {none ? 'Products you add show up here with live stock, cost and margin.' : 'Nothing fits the current search and filters.'}
        </p>
        {none ? (
          onAddProduct && (
            <button onClick={onAddProduct}
              className="mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-pill bg-accent-signature text-white text-xs font-semibold hover:bg-accent-signature-hover transition-colors active:scale-[0.97]">
              <Plus size={16} strokeWidth={2.5} /> Add product
            </button>
          )
        ) : (
          onClearFilters && (
            <button onClick={onClearFilters}
              className="mt-5 inline-flex items-center h-10 px-5 rounded-pill bg-card border border-border text-xs font-semibold text-foreground hover:bg-black/[0.03] transition-colors active:scale-[0.97]">
              Clear filters
            </button>
          )
        )}
      </div>
    );
  }

  const TH = ({ children, align = 'left', extra = '', sortKey = null }) => (
    <th className={`px-3 py-2.5 text-xs font-medium text-muted-foreground ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''} ${extra}`}>
      {sortKey ? (
        <button onClick={() => toggleSort(sortKey)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
          {children}
          {sort.key === sortKey
            ? (sort.dir === 'asc' ? <ArrowUp size={12} className="text-accent-signature" /> : <ArrowDown size={12} className="text-accent-signature" />)
            : <ChevronsUpDown size={12} className="opacity-50" />}
        </button>
      ) : children}
    </th>
  );

  return (
    <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              {(onBulkEdit || onBulkDelete) && (
                <th className="pl-5 pr-1 py-2.5 w-px">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all"
                    className="w-3.5 h-3.5 rounded border-border accent-accent-signature cursor-pointer" />
                </th>
              )}
              <TH extra="pl-5 w-full" sortKey="name">{isServiceTenant ? 'Service' : 'Product'}</TH>
              <TH align="right" sortKey={isServiceTenant ? null : 'stock'}>{isServiceTenant ? 'Duration' : 'Stock'}</TH>
              <TH align="right" sortKey={isServiceTenant ? null : 'cost'}>{isServiceTenant ? '' : 'Cost'}</TH>
              <TH align="right" sortKey="sell">{isServiceTenant ? 'Price' : 'Sell'}</TH>
              <TH align="right" sortKey={isServiceTenant ? null : 'margin'}>{isServiceTenant ? '' : 'Margin'}</TH>
              <TH align="right" extra="pr-5" sortKey={isServiceTenant ? null : 'value'}>{isServiceTenant ? '' : 'Value'}</TH>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ cat, items, subValue }) => (
              <React.Fragment key={cat}>
                <tr className="bg-black/[0.025]">
                  <td colSpan={(onBulkEdit || onBulkDelete) ? 6 : 5} className="px-5 py-2 text-xs font-semibold text-foreground">
                    {cat} <span className="text-muted-foreground font-normal ml-1 tabular-nums">{items.length}</span>
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {currencySymbol}{Math.round(subValue).toLocaleString('en-IN')}
                  </td>
                </tr>
                {items.map(product => {
                  const qty = stockOf(product);
                  const reorder = reorderOf(product);
                  const st = statusOf(qty, reorder);
                  const sell = toNum(product.sellingPrice);
                  const cost = toNum(product.costPrice);
                  const margin = marginPct(product);
                  const svc = isServiceTenant || isService(product);
                  const last = lastBuy[product.id];
                  const lastDiff = last == null ? 0 : toNum(last) - cost;
                  const showLast = !svc && last != null && Math.abs(lastDiff) > 0.5;
                  const pct = reorder > 0 ? Math.min(100, Math.max(0, (qty / (reorder * 2)) * 100)) : null;
                  return (
                    <tr key={product.id}
                      onClick={onView ? () => onView(product) : undefined}
                      className={`group border-t border-black/[0.04] hover:bg-black/[0.025] ${onView ? 'cursor-pointer' : ''} ${selected.has(product.id) ? 'bg-accent-signature/[0.06]' : ''}`}>
                      {(onBulkEdit || onBulkDelete) && (
                        <td className="pl-5 pr-1 py-2.5 w-px" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleOne(product.id)}
                            aria-label={`Select ${product.name}`}
                            className="w-3.5 h-3.5 rounded border-border accent-accent-signature cursor-pointer" />
                        </td>
                      )}
                      <td className="px-5 py-2.5 pl-9 max-w-0 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          {isResto && <FoodMark type={product.food_type} />}
                          {onView ? (
                            <button onClick={(e) => { e.stopPropagation(); onView(product); }}
                              className="text-[13px] font-semibold text-foreground truncate hover:text-accent-signature text-left">
                              {product.name}
                            </button>
                          ) : (
                            <span className="text-[13px] font-semibold text-foreground truncate">{product.name}</span>
                          )}
                          {isResto && product.is_available === false && (
                            <span className="shrink-0 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">86</span>
                          )}
                          {isResto && product.station && (
                            <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{product.station}</span>
                          )}
                        </div>
                        {product.sku && <div className="text-[11px] tabular-nums text-muted-foreground truncate mt-0.5">{product.sku}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {svc ? (
                          <span className="tabular-nums text-xs font-semibold text-violet-500">{product.duration_min ? `${product.duration_min}m` : 'Service'}</span>
                        ) : (<>
                          <span className={`tabular-nums text-[13px] font-semibold ${qtyCls(st)}`}>{qty}</span>
                          <span className="text-[11px] text-muted-foreground ml-1">{product.unit || 'pcs'}</span>
                          {pct != null && (
                            <div className="h-[3px] w-14 ml-auto mt-1.5 rounded-full bg-black/[0.07] overflow-hidden" aria-hidden="true">
                              <div className={`h-full rounded-full ${dotCls(st)}`} style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </>)}
                      </td>
                      {/* Cost is held per base unit (per KG). A product bought by
                          weight and sold in packets is priced and judged per
                          packet, so show that underneath rather than making the
                          shopkeeper divide in their head. */}
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-foreground whitespace-nowrap">
                        {svc ? '' : <>
                          {currencySymbol}{cost.toFixed(2)}
                          {packConv(product) > 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              {currencySymbol}{(cost * packConv(product)).toFixed(2)}/{product.secondary_unit}
                            </div>
                          )}
                          {/* Last buy vs average: red when restocking costs more,
                              green when less. Shown only past a 50 paise gap. */}
                          {showLast && (
                            <div className={`text-[11px] ${lastBuyCls(last, cost)}`}>
                              {lastDiff > 0 ? '▲' : '▼'} last {currencySymbol}{toNum(last).toFixed(2)}
                            </div>
                          )}
                        </>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold text-foreground whitespace-nowrap">
                        {currencySymbol}{sell.toFixed(2)}
                        {packConv(product) > 0 && (
                          <div className="text-[11px] font-normal text-muted-foreground">
                            {currencySymbol}{(sell * packConv(product)).toFixed(2)}/{product.secondary_unit}
                          </div>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-semibold whitespace-nowrap ${marginCls(margin)}`}>{svc ? '' : (margin == null ? '—' : `${margin.toFixed(1)}%`)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-[13px] font-semibold whitespace-nowrap">{svc ? '' : <>{currencySymbol}{Math.round(qty * sell).toLocaleString('en-IN')}</>}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {selected.size > 0 && (onBulkEdit || onBulkDelete) && (
        <div className="sticky bottom-0 px-5 py-3 bg-foreground flex items-center gap-3 ">
          <span className="text-[12px] font-semibold text-background">{selected.size} selected</span>
          <button onClick={clearSelection} className="text-[11px] font-semibold text-background/70 hover:text-background transition-colors">Clear</button>
          <div className="ml-auto flex items-center gap-2">
            {onBulkEdit && (
              <button
                onClick={() => onBulkEdit(products.filter(p => selected.has(p.id)), clearSelection)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-pill text-[12px] font-semibold bg-accent-signature text-white hover:opacity-90 transition-opacity">
                <Pencil size={13} /> Bulk edit
              </button>
            )}
            {onBulkDelete && (
              <button
                onClick={() => onBulkDelete(products.filter(p => selected.has(p.id)), clearSelection)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-pill text-[12px] font-semibold bg-red-500/90 text-white hover:bg-red-500 transition-colors">
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StockTable;
