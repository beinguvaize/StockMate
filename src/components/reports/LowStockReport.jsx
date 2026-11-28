/**
 * LowStockReport — products where total stock (sum inventory_balances) is at
 * or below the product's own reorder level (lib/stockLevels, the one rule).
 * Current snapshot — not date-ranged.
 */
import React, { useMemo } from 'react';
import { needsRestock, reorderLevel } from '../../lib/stockLevels';
import {
  Package, AlertTriangle, DollarSign, ShoppingBag,
} from 'lucide-react';
import useReportData from './useReportData';
import { loadError } from '../../lib/reportsView';
import { ReportTitle, ErrorBlock } from './frame';
import { KPI, SectionHead } from './ReportBits';
import { formatCurrency } from '../../lib/utils';


const LowStockReport = () => {
  const { data: products, loading: pLoading, error: rdErr1, refetch: rdRe1 } = useReportData({
    table: 'products',
    select: 'id, name, sku, costPrice, sellingPrice, lowStockThreshold, stock, category, product_type',
  });

  const { data: balances, loading: bLoading, error: rdErr2, refetch: rdRe2 } = useReportData({
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
      const threshold  = reorderLevel(p);
      const shortfall  = Math.max(0, threshold - totalStock);
      const stockValue = totalStock * Number(p.costPrice || 0);
      return { ...p, totalStock, threshold, shortfall, stockValue };
    });

    // Services have no stock, so they sit at 0 and matched every threshold —
    // this report listed them as needing reorder forever. See productTypes.js.
    const lowItems = enriched
      .filter(p => needsRestock(p, p.totalStock))
      .sort((a, b) => a.totalStock - b.totalStock);

    const itemsLow     = lowItems.length;
    const itemsOut     = lowItems.filter(p => p.totalStock === 0).length;
    const reorderValue = lowItems.reduce((s, p) => s + (p.shortfall * Number(p.costPrice || 0)), 0);

    return { lowItems, kpis: { itemsLow, itemsOut, reorderValue } };
  }, [products, stockByProduct]);

  const failed = loadError(rdErr1, rdErr2);
  return (
    <div className="space-y-4 pb-16">
      <ReportTitle title="Low Stock Alert" subtitle="Current inventory snapshot" />
      {failed ? (
        <ErrorBlock title="Low Stock could not load" message={failed} onRetry={() => { rdRe1(); rdRe2(); }} />
      ) : (<>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPI label="Items Low / Below Threshold" loading={loading} value={kpis.itemsLow}                           icon={AlertTriangle} color="#f59e0b" />
        <KPI label="Items Out of Stock"          loading={loading} value={kpis.itemsOut}                           icon={Package}       color="#ef4444" />
        <KPI label="Total Reorder Value"         loading={loading} value={formatCurrency(kpis.reorderValue)}       icon={DollarSign}    color="var(--color-accent-signature)" />
      </div>

      {/* Table */}
      <div className="bg-surface rounded-[14px] border border-line overflow-hidden">
        <div className="px-4 pt-3.5 pb-3 border-b border-line flex items-center justify-between">
          <SectionHead title="Low Stock Products" sub="sorted by lowest stock first" />
          {!loading && (
            <span className="text-[11.5px] font-semibold text-body bg-tile px-2 py-1 rounded-full">
              {lowItems.length} products
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-4 space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-tile animate-pulse rounded-xl" />)}
          </div>
        ) : lowItems.length === 0 ? (
          <div className="py-16 text-center">
            <Package size={32} className="mx-auto mb-3 text-emerald-300" />
            <p className="text-sm font-semibold text-good-text">All products are well-stocked</p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_100px_120px_80px_80px_80px_120px] gap-3 px-4 py-2 bg-tile border-b border-line">
              {['Product','SKU','Category','Stock','Threshold','Shortfall','Stock Value'].map(h => (
                <span key={h} className="font-tight text-[12px] font-semibold text-mute">{h}</span>
              ))}
            </div>
            {lowItems.map((p, i) => {
              const isOut = p.totalStock === 0;
              return (
                <div key={p.id || i}
                  className={`grid grid-cols-[1fr_100px_120px_80px_80px_80px_120px] gap-3 px-4 py-3.5 items-center border-b border-line last:border-0 hover:bg-tile/40 transition-colors ${isOut ? 'bg-bad-soft/40' : ''}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isOut ? 'bg-red-500' : 'bg-accent-signature/70'}`} />
                    <span className="text-sm font-semibold text-ink truncate">{p.name || '—'}</span>
                  </div>
                  <span className="text-xs tabular-nums text-ink-2 truncate">{p.sku || '—'}</span>
                  <span className="text-xs font-semibold text-ink-2 truncate">{p.category || '—'}</span>
                  <span className={`text-sm font-semibold tabular-nums ${isOut ? 'text-bad-text' : 'text-amber-text'}`}>
                    {p.totalStock}
                  </span>
                  <span className="text-sm font-semibold text-ink-2 tabular-nums">{p.threshold}</span>
                  <span className={`text-sm font-semibold tabular-nums ${p.shortfall > 0 ? 'text-bad-text' : 'text-body'}`}>
                    {p.shortfall > 0 ? `-${p.shortfall}` : '0'}
                  </span>
                  <span className="text-sm font-semibold text-ink tabular-nums">{formatCurrency(p.stockValue)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>)}
    </div>
  );
};

export default LowStockReport;
