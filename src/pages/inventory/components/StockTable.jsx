import React, { useMemo, useState } from 'react';
import { PackagePlus, Eye, Trash2, SlidersHorizontal, Pencil } from 'lucide-react';
import { useTenant } from '../../../context/TenantContext';

// Veg/non-veg/egg square (restaurant menu). null = nothing.
const FoodMark = ({ type }) => {
  if (!type) return null;
  const c = type === 'VEG' ? 'border-green-600 text-green-600'
    : type === 'NONVEG' ? 'border-red-600 text-red-600'
    : 'border-amber-500 text-amber-500';
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
const dotCls = (s) => s === 'crit' ? 'bg-red-500' : s === 'low' ? 'bg-amber-500' : 'bg-emerald-500';
const qtyCls = (s) => s === 'crit' ? 'text-red-600' : s === 'low' ? 'text-amber-600' : 'text-ink-primary';

const StockTable = ({ products, inventoryBalances, onView, onEdit, onDelete, onAdjust, onBatches, onBulkEdit, onBulkDelete, currencySymbol = '₹' }) => {
  const { businessType } = useTenant();
  const isResto = businessType === 'RESTAURANT';
  const isService = businessType === 'SERVICES';
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
        case 'sell':    return toNum(p.sellingPrice);
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
    return (
      <div className="rounded-2xl bg-white border border-black/[0.08] p-16 text-center shadow-sm">
        <PackagePlus size={48} strokeWidth={1} className="mx-auto opacity-10 mb-4" />
        <p className="text-sm font-semibold text-gray-400">No products registered in the catalog</p>
      </div>
    );
  }

  const TH = ({ children, align = 'left', extra = '', sortKey = null }) => (
    <th className={`px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''} ${extra}`}>
      {sortKey ? (
        <button onClick={() => toggleSort(sortKey)} className="inline-flex items-center gap-1 hover:text-ink-primary transition-colors cursor-pointer uppercase tracking-widest">
          {children}
          <span className={`text-[8px] ${sort.key === sortKey ? 'text-amber-500' : 'text-gray-300'}`}>
            {sort.key === sortKey ? (sort.dir === 'asc' ? '▲' : '▼') : '▲▼'}
          </span>
        </button>
      ) : children}
    </th>
  );

  return (
    <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-black/[0.06] flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold text-amber-600">$ inventory --group=category</span>
        <span className="font-mono text-[10px] text-gray-400">{products.length} rows · {groups.length} groups</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-black/10">
              {(onBulkEdit || onBulkDelete) && (
                <th className="pl-5 pr-1 py-2.5 w-px">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 accent-amber-500 cursor-pointer" />
                </th>
              )}
              <TH extra="pl-5 w-full" sortKey="name">{isService ? 'Service' : 'Product'}</TH>
              <TH sortKey="sku">SKU</TH>
              <TH align="right" sortKey={isService ? null : 'stock'}>{isService ? 'Duration' : 'Stock'}</TH>
              <TH align="right" sortKey={isService ? null : 'reorder'}>{isService ? '' : 'Reorder'}</TH>
              <TH align="right" sortKey={isService ? null : 'cost'}>{isService ? '' : 'Cost'}</TH>
              <TH align="right" sortKey="sell">{isService ? 'Price' : 'Sell'}</TH>
              <TH align="right" sortKey={isService ? null : 'value'}>{isService ? '' : 'Value'}</TH>
              <TH align="center"> </TH>
              <TH align="right"> </TH>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ cat, items, subValue }) => (
              <React.Fragment key={cat}>
                <tr className="bg-black/[0.025]">
                  <td colSpan={(onBulkEdit || onBulkDelete) ? 3 : 2} className="px-5 py-2 text-[11px] font-black uppercase tracking-widest text-gray-500">
                    {cat} <span className="text-gray-400 ml-1">{items.length}</span>
                  </td>
                  <td colSpan={4} />
                  <td className="px-3 py-2 text-right font-mono text-[11px] font-bold text-gray-500 whitespace-nowrap">
                    {currencySymbol}{Math.round(subValue).toLocaleString('en-IN')}
                  </td>
                  <td colSpan={2} />
                </tr>
                {items.map(product => {
                  const qty = stockOf(product);
                  const reorder = reorderOf(product);
                  const st = statusOf(qty, reorder);
                  const sell = toNum(product.sellingPrice);
                  return (
                    <tr key={product.id}
                      onClick={onView ? () => onView(product) : undefined}
                      className={`group border-t border-black/[0.04] hover:bg-amber-500/[0.04] transition-colors ${onView ? 'cursor-pointer' : ''} ${selected.has(product.id) ? 'bg-amber-500/[0.06]' : ''}`}>
                      {(onBulkEdit || onBulkDelete) && (
                        <td className="pl-5 pr-1 py-2.5 w-px" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleOne(product.id)}
                            className="w-3.5 h-3.5 rounded border-gray-300 accent-amber-500 cursor-pointer" />
                        </td>
                      )}
                      <td className="px-5 py-2.5 pl-9 max-w-0 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          {isResto && <FoodMark type={product.food_type} />}
                          {onView ? (
                            <button onClick={() => onView(product)}
                              className="text-[13px] font-bold text-ink-primary truncate hover:text-accent-signature hover:underline text-left">
                              {product.name}
                            </button>
                          ) : (
                            <span className="text-[13px] font-bold text-ink-primary truncate">{product.name}</span>
                          )}
                          {isResto && product.is_available === false && (
                            <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">86</span>
                          )}
                          {isResto && product.station && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-gray-400">{product.station}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-gray-400 uppercase whitespace-nowrap">{product.sku || '—'}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {(isService || product.product_type === 'SERVICE') ? (
                          <span className="font-mono text-[12px] font-bold text-violet-500">{product.duration_min ? `${product.duration_min}m` : 'Service'}</span>
                        ) : (<>
                          <span className={`font-mono text-[13px] font-bold ${qtyCls(st)}`}>{qty}</span>
                          <span className="text-[9px] text-gray-400 uppercase ml-0.5">{product.unit || 'pcs'}</span>
                        </>)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[12px] text-gray-400 whitespace-nowrap">{isService ? '' : (reorder > 0 ? reorder : '—')}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[12px] text-gray-500 whitespace-nowrap">{isService ? '' : `${currencySymbol}${toNum(product.costPrice).toFixed(2)}`}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[12px] font-semibold whitespace-nowrap"><span className="text-amber-400">{currencySymbol}</span>{sell.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[13px] font-bold whitespace-nowrap">{isService ? '' : <><span className="text-amber-400">{currencySymbol}</span>{Math.round(qty * sell).toLocaleString('en-IN')}</>}</td>
                      <td className="px-3 py-2.5 text-center">{isService ? null : <span className={`inline-block w-2 h-2 rounded-full ${dotCls(st)}`} />}</td>
                      <td className="px-4 py-2.5 w-px" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {onAdjust && (
                            <button onClick={() => onAdjust(product)} title="Adjust stock" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-amber-100 hover:text-amber-700 transition-colors"><SlidersHorizontal size={14} /></button>
                          )}
                          <button onClick={() => onEdit(product)} title="View / edit" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-black/[0.05] hover:text-ink-primary transition-colors"><Eye size={14} /></button>
                          <button onClick={() => onDelete(product.id)} title="Delete" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {selected.size > 0 && (onBulkEdit || onBulkDelete) && (
        <div className="sticky bottom-0 px-5 py-3 bg-ink-primary flex items-center gap-3 shadow-2xl">
          <span className="text-[12px] font-bold text-white">{selected.size} selected</span>
          <button onClick={clearSelection} className="text-[11px] font-semibold text-white/60 hover:text-white transition-colors">Clear</button>
          <div className="ml-auto flex items-center gap-2">
            {onBulkEdit && (
              <button
                onClick={() => onBulkEdit(products.filter(p => selected.has(p.id)), clearSelection)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-bold bg-accent-signature text-white hover:opacity-90 transition-opacity">
                <Pencil size={13} /> Bulk edit
              </button>
            )}
            {onBulkDelete && (
              <button
                onClick={() => onBulkDelete(products.filter(p => selected.has(p.id)), clearSelection)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-bold bg-red-500/90 text-white hover:bg-red-500 transition-colors">
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
