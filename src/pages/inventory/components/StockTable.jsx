import React from 'react';
import { PackagePlus, Tag as TagIcon, Pencil, Trash2, Plus, Percent, Layers } from 'lucide-react';
import Table from '../../../shared/Table';

// Numeric columns from supabase-js arrive as strings (Postgres `numeric` has no
// safe JS representation so the client keeps full precision as text). Calling
// `.toFixed` on a string throws and blows up the page via the ErrorBoundary.
// Coerce once here so downstream rendering stays simple.
const toNum = (v) => Number(v ?? 0);

const StockTable = ({ products, inventoryBalances, onEdit, onDelete, onAdjust, onBatches, currencySymbol = '₹' }) => {
  const headers = [
    { label: 'Product' },
    { label: 'Category', className: 'hidden md:table-cell' },
    { label: 'Cost / Sell Price', className: 'text-right' },
    { label: 'Stock', className: 'text-center hidden sm:table-cell' },
    { label: 'Actions', className: 'text-right' }
  ];

  const renderRow = (product) => {
    const totalStock = inventoryBalances
      .filter(b => b.product_id === product.id)
      .reduce((acc, b) => acc + toNum(b.quantity), 0) || toNum(product.stock);

    return (
      <tr key={product.id} className="hover:bg-canvas transition-colors group">
        <td className="px-4 py-2">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-white border border-black/5 shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
              {product.image ? (
                <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <PackagePlus size={24} className="opacity-20" />
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-primary leading-tight">{product.name}</div>
              <div className="text-[10px] font-bold text-gray-500 opacity-70">{product.sku}</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-2 hidden md:table-cell">
          <div className="text-sm font-semibold text-ink-primary opacity-70">{product.category}</div>
        </td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <div className="text-sm font-semibold">
            <span className="text-gray-500 opacity-70">{currencySymbol}{toNum(product.costPrice).toFixed(2)}</span>
            <span className="mx-2 opacity-10 text-ink-primary">/</span>
            <span className="text-emerald-500">{currencySymbol}{toNum(product.sellingPrice).toFixed(2)}</span>
          </div>
        </td>
        <td className="px-4 py-2 text-center hidden sm:table-cell">
          <div className="text-lg font-bold text-ink-primary">
            {totalStock}
            <span className="text-[10px] font-black opacity-40 ml-1 uppercase">{product.unit || 'pcs'}</span>
          </div>
        </td>
        <td className="px-4 py-2 text-right">
          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
            {onBatches && (
              <button onClick={() => onBatches(product)} title="View batches" className="w-8 h-8 rounded-pill bg-white border border-black/5 flex items-center justify-center hover:bg-ink-primary hover:text-white transition-all"><Layers size={12} /></button>
            )}
            <button onClick={() => onEdit(product)} className="w-8 h-8 rounded-pill bg-white border border-black/5 flex items-center justify-center hover:bg-ink-primary hover:text-white transition-all"><Pencil size={12} /></button>
            <button onClick={() => onDelete(product.id)} className="w-8 h-8 rounded-pill bg-white border border-red-100 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-red-500"><Trash2 size={12} /></button>
            <button onClick={() => onAdjust(product.id, 1)} className="w-8 h-8 rounded-pill bg-accent-signature flex items-center justify-center hover:scale-110 active:scale-95 transition-all"><Plus size={14} strokeWidth={4} /></button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <Table 
      headers={headers} 
      rows={products} 
      renderRow={renderRow} 
      emptyMessage="No products registered in the catalog" 
    />
  );
};

export default StockTable;
