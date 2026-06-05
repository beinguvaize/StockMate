import React, { useMemo } from 'react';
import { PackagePlus, Eye, Trash2, SlidersHorizontal } from 'lucide-react';
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

const StockTable = ({ products, inventoryBalances, onEdit, onDelete, onAdjust, onBatches, currencySymbol = '₹' }) => {
  const { businessType } = useTenant();
  const isResto = businessType === 'RESTAURANT';
  const isService = businessType === 'SERVICES';
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
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cat, items]) => ({
        cat,
        items,
        subValue: items.reduce((t, p) => t + stockOf(p) * toNum(p.sellingPrice), 0),
      }));
  }, [products, inventoryBalances]);

  if (!products.length) {
    return (
      <div className="rounded-2xl bg-white border border-black/[0.08] p-16 text-center shadow-sm">
        <PackagePlus size={48} strokeWidth={1} className="mx-auto opacity-10 mb-4" />
        <p className="text-sm font-semibold text-gray-400">No products registered in the catalog</p>
      </div>
    );
  }

  const TH = ({ children, align = 'left', extra = '' }) => (
    <th className={`px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''} ${extra}`}>{children}</th>
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
              <TH extra="pl-5 w-full">{isService ? 'Service' : 'Product'}</TH>
              <TH>SKU</TH>
              <TH align="right">{isService ? 'Duration' : 'Stock'}</TH>
              <TH align="right">{isService ? '' : 'Reorder'}</TH>
              <TH align="right">{isService ? '' : 'Cost'}</TH>
              <TH align="right">{isService ? 'Price' : 'Sell'}</TH>
              <TH align="right">{isService ? '' : 'Value'}</TH>
              <TH align="center"> </TH>
              <TH align="right"> </TH>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ cat, items, subValue }) => (
              <React.Fragment key={cat}>
                <tr className="bg-black/[0.025]">
                  <td colSpan={2} className="px-5 py-2 text-[11px] font-black uppercase tracking-widest text-gray-500">
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
                    <tr key={product.id} className="group border-t border-black/[0.04] hover:bg-amber-500/[0.04] transition-colors">
                      <td className="px-5 py-2.5 pl-9 max-w-0 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          {isResto && <FoodMark type={product.food_type} />}
                          <span className="text-[13px] font-bold text-ink-primary truncate">{product.name}</span>
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
                        {isService ? (
                          <span className="font-mono text-[13px] font-bold text-ink-primary">{product.duration_min ? `${product.duration_min}m` : '—'}</span>
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
                      <td className="px-4 py-2.5 w-px">
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
    </div>
  );
};

export default StockTable;
