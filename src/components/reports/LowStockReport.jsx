/**
 * LowStockReport — products where total stock (sum inventory_balances) <= lowStockThreshold.
 * Current snapshot — not date-ranged.
 */
import React, { useMemo } from 'react';
import {
  Package, AlertTriangle, DollarSign, ShoppingBag,
} from 'lucide-react';
import useReportData from './useReportData';
import { KPI, SectionHead } from './ReportBits';
import { formatCurrency } from '../../lib/utils';

const DEFAULT_THRESHOLD = 10;

const LowStockReport = () => {
  const { data: products, loading: pLoading } = useReportData({
    table: 'products',
    select: 'id, name, sku, costPrice, sellingPrice, lowStockThreshold, stock, category',
  });

  const { data: balances, loading: bLoading } = useReportData({
    table: 'inventory_balances',
    select: 'product_id, quantity',
  });

  const loading = pLoading || bLoading;

  // Sum inventory_balances by product_id
  const stockByProduct = useMemo(() => {
    const map = {};
    balances.forEach(b => {
      const pid = b.product_id;
      if (pid) map[pid] = (map[pid] || 0) + Number(b.quantity || 0);
    });
    return map;
  }, [balances]);

  const { lowItems, kpis } = useMemo(() => {
    const enriched = products.map(p => {
      // Prefer summed inventory_balances; fall back to products.stock
      const totalStock = stockByProduct[p.id] !== undefined
        ? stockByProduct[p.id]
        : Number(p.stock || 0);
      const threshold  = Number(p.lowStockThreshold || DEFAULT_THRESHOLD);
      const shortfall  = Math.max(0, threshold - totalStock);
      const stockValue = totalStock * Number(p.costPrice || 0);
      return { ...p, totalStock, threshold, shortfall, stockValue };
    });

    const lowItems = enriched
      .filter(p => p.totalStock <= p.threshold)
      .sort((a, b) => a.totalStock - b.totalStock);

    const itemsLow     = lowItems.length;
    const itemsOut     = lowItems.filter(p => p.totalStock === 0).length;
    const reorderValue = lowItems.reduce((s, p) => s + (p.shortfall * Number(p.costPrice || 0)), 0);

    return { lowItems, kpis: { itemsLow, itemsOut, reorderValue } };
  }, [products, stockByProduct]);

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-ink-primary leading-none">
          Low Stock Alert<span className="text-accent-signature">.</span>
        </h1>
        <p className="text-xs text-gray-400 font-medium mt-1">Current inventory snapshot</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI label="Items Low / Below Threshold" loading={loading} value={kpis.itemsLow}                           icon={AlertTriangle} color="#f59e0b" />
        <KPI label="Items Out of Stock"          loading={loading} value={kpis.itemsOut}                           icon={Package}       color="#ef4444" />
        <KPI label="Total Reorder Value"         loading={loading} value={formatCurrency(kpis.reorderValue)}       icon={DollarSign}    color="var(--color-accent-signature)" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-center justify-between">
          <SectionHead title="Low Stock Products" sub="sorted by lowest stock first" />
          {!loading && (
            <span className="text-[10px] font-black text-gray-400 bg-canvas px-2 py-1 rounded-full">
              {lowItems.length} products
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
          </div>
        ) : lowItems.length === 0 ? (
          <div className="py-16 text-center">
            <Package size={32} className="mx-auto mb-3 text-emerald-300" />
            <p className="text-sm font-bold text-emerald-600">All products are well-stocked</p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_100px_120px_80px_80px_80px_120px] gap-3 px-6 py-2 bg-canvas/50 border-b border-black/5">
              {['Product','SKU','Category','Stock','Threshold','Shortfall','Stock Value'].map(h => (
                <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
              ))}
            </div>
            {lowItems.map((p, i) => {
              const isOut = p.totalStock === 0;
              return (
                <div key={p.id || i}
                  className={`grid grid-cols-[1fr_100px_120px_80px_80px_80px_120px] gap-3 px-6 py-3.5 items-center border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors ${isOut ? 'bg-red-50/40' : ''}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isOut ? 'bg-red-500' : 'bg-accent-signature/70'}`} />
                    <span className="text-sm font-bold text-ink-primary truncate">{p.name || '—'}</span>
                  </div>
                  <span className="text-xs font-mono text-ink-secondary truncate">{p.sku || '—'}</span>
                  <span className="text-xs font-bold text-ink-secondary truncate">{p.category || '—'}</span>
                  <span className={`text-sm font-black tabular-nums ${isOut ? 'text-red-500' : 'text-accent-signature'}`}>
                    {p.totalStock}
                  </span>
                  <span className="text-sm font-bold text-ink-secondary tabular-nums">{p.threshold}</span>
                  <span className={`text-sm font-black tabular-nums ${p.shortfall > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {p.shortfall > 0 ? `-${p.shortfall}` : '0'}
                  </span>
                  <span className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(p.stockValue)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LowStockReport;
