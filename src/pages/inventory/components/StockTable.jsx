import React, { useMemo, useState } from 'react';
import { isService } from '../../../lib/productTypes';
import { PackagePlus, ArrowUp, ArrowDown, ChevronsUpDown, Plus, Eye, Pencil, SlidersHorizontal, Layers, ScanLine, Trash2 } from 'lucide-react';
import { useTenant } from '../../../context/TenantContext';
import { Button } from '../../../components/ui/button';
import { RowMenu, MenuItem, MenuRule } from '../../../components/ui/RowMenu';
import { reorderOf, statusOf } from '../../../lib/inventoryView';
import { cn } from '../../../lib/utils';
import { ProductAvatar, CheckBox } from './parts';

// Veg/non-veg/egg square (restaurant menu). null = nothing.
const FoodMark = ({ type }) => {
  if (!type) return null;
  const c = type === 'VEG' ? 'border-green-600 text-green-600'
    : type === 'NONVEG' ? 'border-red-600 text-red-600'
    : 'border-amber text-amber';
  return (
    <span className={`shrink-0 w-3.5 h-3.5 border rounded-sm flex items-center justify-center ${c}`} title={type}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
    </span>
  );
};

// Postgres numeric arrives as string — coerce before math.
const toNum = (v) => Number(v ?? 0);

const barCls = (s) => s === 'crit' ? 'bg-bad' : s === 'low' ? 'bg-amber' : 'bg-good';
const qtyCls = (s) => s === 'crit' ? 'text-bad-text' : s === 'low' ? 'text-amber-text' : 'text-ink';

// Base units in one packet (e.g. 0.25 KG). 0 when the product is not sold by
// an alternate unit. Margin % is identical either way — it is a ratio — so only
// the rupee figures need converting.
const packConv = (p) => {
  const c = Number(p?.conversion_factor);
  return (p?.secondary_unit && c > 0) ? c : 0;
};

// Current margin on the LATEST prices — sell vs weighted-average cost
// (products.costPrice, kept fresh from open batches). Null when no sell price,
// so a serviceless/priceless row shows "—" rather than a bogus 0%.
// Margin here is on the selling price; the item form shows markup on cost.
// The two are left as they are (known, owner to decide).
const marginPct = (p) => {
  const sell = toNum(p.sellingPrice);
  const cost = toNum(p.costPrice);
  if (sell <= 0) return null;
  return ((sell - cost) / sell) * 100;
};
// Loss red, thin amber (<15%), healthy ink. Tiers let the eye catch the
// items bleeding margin without reading every number.
const marginCls = (m) =>
  m == null ? 'text-mute'
  : m < 5    ? 'text-bad-text'
  : m < 15   ? 'text-amber-text'
  :            'text-ink';

// Last-buy tint vs the weighted-average cost: costlier to restock = red,
// cheaper = green, same/unknown = muted. Small threshold so rounding noise
// doesn't paint every row.
const lastBuyCls = (last, cost) => {
  const l = toNum(last), c = toNum(cost);
  if (!last || !c) return 'text-mute';
  if (l > c * 1.005) return 'text-bad-text';
  if (l < c * 0.995) return 'text-good-text';
  return 'text-mute';
};

const money2 = (cur, n) => `${cur}${toNum(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (cur, n) => `${cur}${Math.round(n).toLocaleString('en-IN')}`;

/**
 * The products table (approved inventory-01, -02, -03, -06).
 *
 * Grouped by category with each group's retail value, sortable heads, a tick
 * box per row when the user may bulk edit or delete, and a "···" menu per
 * row. Selection is held by the page so the bulk bar can sit above the table.
 */
const StockTable = ({
  products, totalProducts = 0, onClearFilters, onAddProduct, inventoryBalances, lastBuy = {},
  onView, onEdit, onDelete, onAdjust, onBatches, onPrintBarcode,
  selectable = false, selected = new Set(), onSelectedChange, currencySymbol = '₹',
}) => {
  const { businessType } = useTenant();
  const isResto = businessType === 'RESTAURANT';
  // Tenant-level: decides the COLUMN HEADINGS only. Whether a given ROW is a
  // service is a property of that row — a retail shop billing repair labour
  // has both kinds in one table, which is the case this used to get wrong.
  const isServiceTenant = businessType === 'SERVICES';
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, inventoryBalances, sort, lastBuy]);

  // The order on screen, so the detail panel's up / down steps through the
  // rows as they are drawn (grouped, then sorted).
  const ordered = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const view = onView ? (p) => onView(p, ordered) : null;

  const toggleSort = (key) => setSort(prev =>
    prev.key === key ? (prev.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }) : { key, dir: 'asc' });

  const allIds = useMemo(() => products.map(p => p.id), [products]);
  const someSelected = allIds.some(id => selected.has(id));
  const allSelected = someSelected && allIds.every(id => selected.has(id));
  const setSel = (next) => onSelectedChange?.(next);
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(allIds));
  const toggleOne = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSel(next);
  };

  if (!products.length) {
    const none = totalProducts === 0;
    return (
      <div className="m-rise rounded-[14px] px-5 py-[54px] text-center shadow-[inset_0_0_0_1px_var(--color-line)]" style={{ '--i': 4 }}>
        <span className="mx-auto mb-3.5 grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-tile text-mute">
          <PackagePlus size={22} strokeWidth={1.7} />
        </span>
        <b className="block font-tight text-[15px] font-semibold text-ink">{none ? 'Add your first product' : 'No products match'}</b>
        <p className="mt-1 mb-4 text-[13px] text-body">
          {none ? 'Products you add show up here with live stock, cost and margin.' : 'Nothing fits the current search and filters.'}
        </p>
        {none ? (
          onAddProduct && <Button onClick={onAddProduct}><Plus /> Add product</Button>
        ) : (
          onClearFilters && <Button variant="secondary" onClick={onClearFilters}>Clear filters</Button>
        )}
      </div>
    );
  }

  const TH = ({ children, align = 'left', className = '', sortKey = null }) => {
    const on = sort.key === sortKey && sortKey;
    return (
      <th aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
        className={cn('px-3.5 py-2.5 align-middle font-tight text-[12px] font-semibold text-mute border-b border-line whitespace-nowrap', align === 'right' && 'text-right', className)}>
        {sortKey ? (
          <button type="button" onClick={() => toggleSort(sortKey)} className="inline-flex items-center gap-1 hover:text-ink transition-colors duration-(--dur-press)">
            {children}
            {on
              ? (sort.dir === 'asc' ? <ArrowUp size={12} className="text-amber" /> : <ArrowDown size={12} className="text-amber" />)
              : <ChevronsUpDown size={12} className="opacity-40" />}
          </button>
        ) : children}
      </th>
    );
  };
  const labelCols = (selectable ? 1 : 0) + 5;

  return (
    <div className="m-rise relative w-full overflow-x-auto" style={{ '--i': 4 }}>
      <table className="w-full border-collapse text-[13.5px] text-ink">
        <thead>
          <tr>
            {selectable && (
              <th className="w-[34px] pl-3.5 pr-0 py-2.5 border-b border-line">
                <CheckBox checked={allSelected} partial={someSelected && !allSelected} onChange={toggleAll} label="Select all" />
              </th>
            )}
            <TH className="w-full" sortKey="name">{isServiceTenant ? 'Service' : 'Product'}</TH>
            <TH align="right" sortKey={isServiceTenant ? null : 'stock'}>{isServiceTenant ? 'Duration' : 'Stock'}</TH>
            <TH align="right" sortKey={isServiceTenant ? null : 'cost'}>{isServiceTenant ? '' : 'Cost'}</TH>
            <TH align="right" sortKey="sell">{isServiceTenant ? 'Price' : 'Sell'}</TH>
            <TH align="right" sortKey={isServiceTenant ? null : 'margin'}>{isServiceTenant ? '' : 'Margin'}</TH>
            <TH align="right" sortKey={isServiceTenant ? null : 'value'}>{isServiceTenant ? '' : 'Value'}</TH>
            <th className="w-11 border-b border-line"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ cat, items, subValue }) => (
            <React.Fragment key={cat}>
              <tr>
                <td colSpan={labelCols} className="bg-tile px-3.5 py-[7px] font-tight text-[12px] font-semibold text-ink-2 border-b border-sep">
                  {cat}<em className="ml-1.5 not-italic font-medium text-mute tabular-nums">{items.length}</em>
                </td>
                <td className="bg-tile px-3.5 py-[7px] text-right font-tight text-[12px] font-medium text-body tabular-nums whitespace-nowrap border-b border-sep">
                  {money0(currencySymbol, subValue)}
                </td>
                <td className="bg-tile border-b border-sep" />
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
                const isSel = selected.has(product.id);
                const td = cn('px-3.5 py-2.5 align-middle tabular-nums border-b border-sep transition-colors duration-(--dur-press)', isSel ? 'bg-amber-soft' : 'group-hover/row:bg-tile');
                return (
                  <tr key={product.id}
                    onClick={view ? () => view(product) : undefined}
                    className={cn('group/row', view && 'cursor-pointer')}>
                    {selectable && (
                      <td className={cn(td, 'w-[34px] pr-0')} onClick={(e) => e.stopPropagation()}>
                        <CheckBox checked={isSel} onChange={() => toggleOne(product.id)} label={`Select ${product.name}`} />
                      </td>
                    )}
                    <td className={cn(td, 'max-w-0 w-full')}>
                      <div className="flex min-w-0 items-center gap-[11px]">
                        <ProductAvatar product={product} />
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            {isResto && <FoodMark type={product.food_type} />}
                            {view ? (
                              <button type="button" onClick={(e) => { e.stopPropagation(); view(product); }}
                                className="truncate text-left font-tight text-[13.5px] font-semibold text-ink hover:text-amber-text">
                                {product.name}
                              </button>
                            ) : (
                              <b className="truncate font-tight text-[13.5px] font-semibold">{product.name}</b>
                            )}
                            {isResto && product.is_available === false && (
                              <span className="shrink-0 rounded-pill bg-bad-soft px-1.5 py-px font-tight text-[10.5px] font-semibold text-bad-text">86</span>
                            )}
                            {isResto && product.station && (
                              <span className="shrink-0 text-[11px] font-medium text-mute">{product.station}</span>
                            )}
                          </div>
                          {product.sku && <small className="block truncate font-tight text-[11.5px] font-medium text-mute tabular-nums">{product.sku}</small>}
                        </div>
                      </div>
                    </td>
                    <td className={cn(td, 'text-right whitespace-nowrap')}>
                      {svc ? (
                        <span className="font-tight text-[12.5px] font-semibold text-[#5E4A80] tabular-nums">{product.duration_min ? `${product.duration_min}m` : 'Service'}</span>
                      ) : (<>
                        <span className={cn('font-tight text-[13.5px] font-semibold tabular-nums', qtyCls(st))}>{qty}</span>
                        <span className="ml-1 text-[11.5px] text-mute">{(product.unit || 'pcs').toUpperCase()}</span>
                        {pct != null && (
                          <div className="ml-auto mt-1.5 h-[3px] w-14 overflow-hidden rounded-pill bg-well" aria-hidden="true">
                            <div className={cn('h-full rounded-pill', barCls(st))} style={{ width: `${Math.max(pct, 2)}%` }} />
                          </div>
                        )}
                      </>)}
                    </td>
                    {/* Cost is held per base unit (per KG). A product bought by
                        weight and sold in packets is priced and judged per
                        packet, so show that underneath rather than making the
                        shopkeeper divide in their head. */}
                    <td className={cn(td, 'text-right font-tight whitespace-nowrap')}>
                      {svc ? '' : <>
                        {money2(currencySymbol, cost)}
                        {packConv(product) > 0 && (
                          <span className="mt-px block text-[11.5px] font-medium text-mute">
                            {money2(currencySymbol, cost * packConv(product))}/{product.secondary_unit}
                          </span>
                        )}
                        {/* Last buy vs average: red when restocking costs more,
                            green when less. Shown only past a 50 paise gap. */}
                        {showLast && (
                          <span className={cn('mt-px block text-[11.5px] font-medium', lastBuyCls(last, cost))}>
                            {lastDiff > 0 ? '▲' : '▼'} last {money2(currencySymbol, last)}
                          </span>
                        )}
                      </>}
                    </td>
                    <td className={cn(td, 'text-right font-tight font-semibold whitespace-nowrap')}>
                      {money2(currencySymbol, sell)}
                      {packConv(product) > 0 && (
                        <span className="mt-px block text-[11.5px] font-medium text-mute">
                          {money2(currencySymbol, sell * packConv(product))}/{product.secondary_unit}
                        </span>
                      )}
                    </td>
                    <td className={cn(td, 'text-right font-tight font-semibold whitespace-nowrap', marginCls(margin))}>
                      {svc ? '' : (margin == null ? '—' : `${margin < 0 ? '−' : ''}${Math.abs(margin).toFixed(1)}%`)}
                    </td>
                    <td className={cn(td, 'text-right font-tight font-semibold whitespace-nowrap')}>
                      {svc ? '' : money0(currencySymbol, qty * sell)}
                    </td>
                    <td className={cn(td, 'w-11 text-right')} onClick={(e) => e.stopPropagation()}>
                      <RowMenu label={`Actions for ${product.name}`} width={208}>
                        {(close) => (
                          <>
                            {view && <MenuItem icon={Eye} onClick={() => { close(); view(product); }}>Open details</MenuItem>}
                            {onEdit && <MenuItem icon={Pencil} onClick={() => { close(); onEdit(product); }}>Edit</MenuItem>}
                            {onAdjust && !svc && <MenuItem icon={SlidersHorizontal} onClick={() => { close(); onAdjust(product); }}>Adjust stock</MenuItem>}
                            {onBatches && !svc && <MenuItem icon={Layers} onClick={() => { close(); onBatches(product); }}>Batches</MenuItem>}
                            {onPrintBarcode && <MenuItem icon={ScanLine} onClick={() => { close(); onPrintBarcode(product); }}>Print barcode</MenuItem>}
                            {onDelete && (<>
                              <MenuRule />
                              <MenuItem danger icon={Trash2} onClick={() => { close(); onDelete(product); }}>Delete</MenuItem>
                            </>)}
                          </>
                        )}
                      </RowMenu>
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default StockTable;
