/**
 * ProductSalesReport — per-product transaction ledger.
 *
 * Pick a product, see every sale line chronologically (date, client, qty,
 * rate, total) for the selected period, with KPIs (units sold, revenue,
 * avg rate, top buyer).
 */
import React, { useState, useMemo } from 'react';
import {
  Package, Calendar, Search, Download, TrendingUp, Hash, DollarSign, UserCircle,
} from 'lucide-react';
import useReportData from './useReportData';
import { SectionHead } from './ReportBits'; // local KPI variant kept (truncate)
import { PRESETS, presetRange } from './reportUtils';
import { formatCurrency } from '../../lib/utils';

const KPI = ({ label, value, icon: Icon, color = 'var(--color-accent-signature)', loading }) => (
  <div className="bg-card rounded-[10px] border border-border/60 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      <Icon size={16} style={{ color }} />
    </div>
    {loading
      ? <div className="h-7 w-24 bg-canvas animate-pulse rounded-lg" />
      : <div className="text-2xl font-semibold text-foreground tabular-nums leading-none truncate">{value}</div>
    }
    <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
  </div>
);

const ProductSalesReport = () => {
  const [preset, setPreset]       = useState('TODAY');
  const [range,  setRange]        = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);
  const [productId, setProductId] = useState('');
  const [search,    setSearch]    = useState('');

  const dateFilters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: products, loading: prodLoading } = useReportData({
    table: 'products', select: 'id, name, sku, unit, sellingPrice, costPrice',
  });
  const { data: sales, loading: salesLoading } = useReportData({
    table: 'sales',
    select: 'id, date, items, status, customerInfo, shopId, totalAmount',
    dateColumn: 'date', filters: dateFilters,
  });
  const { data: clients } = useReportData({
    table: 'clients', select: 'id, name',
  });

  const loading = prodLoading || salesLoading;

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };
  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  const clientById = useMemo(() => {
    const m = new Map();
    clients.forEach(c => m.set(c.id, c.name));
    return m;
  }, [clients]);

  const filteredProducts = useMemo(
    () => products
      .filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) ||
                   p.sku?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [products, search]
  );

  const selectedProduct = useMemo(
    () => products.find(p => p.id === productId) || null,
    [products, productId]
  );

  // Walk every sale line for the selected product
  const { lines, kpis, topBuyers } = useMemo(() => {
    if (!productId) return { lines: [], kpis: { units: 0, revenue: 0, avg: 0, orders: 0 }, topBuyers: [] };

    const out = [];
    sales.forEach(s => {
      const status = String(s.status || '').toUpperCase();
      if (status === 'CANCELLED' || status === 'VOIDED' || status === 'FAILED' || status === 'REFUNDED') return;
      const items = Array.isArray(s.items) ? s.items : [];
      items.forEach(it => {
        const pid = it.productId || it.id;
        if (pid !== productId) return;
        const qty  = Number(it.quantity ?? it.qty ?? 0);
        const rate = Number(it.rate ?? it.price ?? it.unitPrice ?? 0);
        if (qty <= 0) return;
        const cid  = s.customerInfo?.id || s.shopId || '';
        out.push({
          date:    String(s.date || '').slice(0, 10),
          saleId:  s.id,
          client:  clientById.get(cid) || s.customerInfo?.name || 'Walk-in',
          clientId: cid,
          qty,
          rate,
          total:   qty * rate,
        });
      });
    });

    out.sort((a, b) => b.date.localeCompare(a.date));

    const units   = out.reduce((s, r) => s + r.qty, 0);
    const revenue = out.reduce((s, r) => s + r.total, 0);
    const avg     = units > 0 ? revenue / units : 0;
    const orders  = new Set(out.map(r => r.saleId)).size;

    // Top buyers
    const byClient = {};
    out.forEach(r => {
      const k = r.client;
      if (!byClient[k]) byClient[k] = { name: k, qty: 0, revenue: 0 };
      byClient[k].qty     += r.qty;
      byClient[k].revenue += r.total;
    });
    const top = Object.values(byClient).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return { lines: out, kpis: { units, revenue, avg, orders }, topBuyers: top };
  }, [productId, sales, clientById]);

  const exportCSV = () => {
    const name = selectedProduct?.name || 'product';
    const rows = [
      ['Date','Sale Ref','Client','Quantity','Rate','Total'],
      ...lines.map(r => [r.date, r.saleId, r.client, r.qty, r.rate, r.total]),
    ];
    const csv  = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `product_sales_${name.replace(/\s+/g,'_')}_${range.start}_${range.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-base font-semibold text-foreground tracking-tight">
            Product Sales
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center bg-muted rounded-lg p-0.5 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-md text-[11px] transition-colors ${
                preset === p.id ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'
              }`}>{p.label}</button>
          ))}
          <button onClick={() => applyPreset('CUSTOM')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] transition-colors ${
              preset === 'CUSTOM' ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'
            }`}>
            <Calendar size={11} /> Custom
          </button>
        </div>
        {selectedProduct && (
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-[11px] font-medium text-foreground hover:bg-muted/60 transition-colors">
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={14} className="text-muted-foreground shrink-0" />
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
          <span className="text-muted-foreground text-xs font-semibold">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
          <button onClick={applyCustom}
            className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
            Apply
          </button>
        </div>
      )}

      {/* Product Picker */}
      <div className="bg-card rounded-[10px] border border-border/60 shadow-sm p-6">
        <SectionHead title="Select Product" sub="search by name or SKU" />
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border shadow-sm rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-accent-signature/20"
          />
        </div>
        {!selectedProduct && (
          <div className="mt-2 bg-card border border-border shadow-sm rounded-xl max-h-64 overflow-y-auto">
            {prodLoading
              ? <div className="p-4 text-xs text-muted-foreground">Loading...</div>
              : products.length === 0
              ? <div className="p-4 text-xs text-muted-foreground">No products yet</div>
              : filteredProducts.length === 0
              ? <div className="p-4 text-xs text-muted-foreground">No products match "{search}"</div>
              : filteredProducts.map(p => (
                <button key={p.id} onClick={() => { setProductId(p.id); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-canvas/60 transition-colors text-left border-b border-border/60 last:border-0`}>
                  <div className="w-8 h-8 rounded-lg bg-accent-signature/10 flex items-center justify-center shrink-0">
                    <Package size={14} className="text-accent-signature" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">{p.sku || '—'}</div>
                  </div>
                  <div className="text-xs font-semibold text-foreground tabular-nums">
                    {formatCurrency(p.sellingPrice || 0)}
                  </div>
                </button>
              ))
            }
          </div>
        )}
        {selectedProduct && (
          <div className="mt-3 flex items-center gap-3 p-3 bg-accent-signature/5 rounded-xl border border-accent-signature/10">
            <div className="w-9 h-9 rounded-lg bg-accent-signature/15 flex items-center justify-center shrink-0">
              <Package size={16} className="text-accent-signature" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground">{selectedProduct.name}</div>
              <div className="text-[10px] text-muted-foreground tabular-nums">{selectedProduct.sku || '—'} · list {formatCurrency(selectedProduct.sellingPrice || 0)}</div>
            </div>
            <button onClick={() => setProductId('')}
              className="text-[10px] font-semibold text-muted-foreground hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
              Change
            </button>
          </div>
        )}
      </div>

      {selectedProduct && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Units Sold"  loading={loading} value={kpis.units.toLocaleString('en-IN')}    icon={Hash}        color="var(--color-accent-signature)" />
            <KPI label="Revenue"     loading={loading} value={formatCurrency(kpis.revenue)}          icon={DollarSign}  color="#10b981" />
            <KPI label="Avg Rate"    loading={loading} value={formatCurrency(kpis.avg)}              icon={TrendingUp}  color="#f59e0b" />
            <KPI label="Orders"      loading={loading} value={kpis.orders.toLocaleString('en-IN')}   icon={UserCircle}  color="#8b5cf6" />
          </div>

          {/* Top buyers */}
          {topBuyers.length > 0 && (
            <div className="bg-card rounded-[10px] border border-border/60 shadow-sm p-6">
              <SectionHead title="Top Buyers" sub={`${topBuyers.length} clients`} />
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {topBuyers.map((b, i) => (
                  <div key={i} className="bg-canvas/40 rounded-xl border border-border/60 p-3">
                    <div className="text-[11px] font-medium text-muted-foreground mb-1 truncate">{b.name}</div>
                    <div className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(b.revenue)}</div>
                    <div className="text-[10px] font-semibold text-muted-foreground mt-0.5">{b.qty} {selectedProduct.unit || 'units'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lines Table */}
          <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-border/60">
              <SectionHead title={`${selectedProduct.name} — Sale Lines`} sub={`${lines.length} entries`} />
            </div>

            {loading ? (
              <div className="p-6 space-y-3">
                {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
              </div>
            ) : lines.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No sales of this product in the selected period</div>
            ) : (
              <div>
                <div className="grid grid-cols-[100px_180px_1fr_90px_110px_120px] gap-4 px-6 py-2 bg-canvas/50 border-b border-border/60">
                  {['Date','Sale Ref','Client','Qty','Rate','Total'].map(h => (
                    <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">{h}</span>
                  ))}
                </div>
                {lines.map((r, i) => (
                  <div key={i} className="grid grid-cols-[100px_180px_1fr_90px_110px_120px] gap-4 px-6 py-3 items-center border-b border-border/60 last:border-0 hover:bg-canvas/40 transition-colors">
                    <span className="text-xs font-semibold text-ink-secondary tabular-nums">{r.date}</span>
                    <span className="text-xs tabular-nums text-muted-foreground truncate">{String(r.saleId).toUpperCase()}</span>
                    <span className="text-xs font-semibold text-foreground truncate">{r.client}</span>
                    <span className="text-xs font-semibold text-foreground tabular-nums">{r.qty}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatCurrency(r.rate)}</span>
                    <span className="text-xs font-semibold text-emerald-600 tabular-nums">{formatCurrency(r.total)}</span>
                  </div>
                ))}
                <div className="flex justify-end gap-8 px-6 py-3.5 border-t border-border/60 bg-canvas/30">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Total Revenue</span>
                  <span className="text-sm font-semibold text-emerald-600 tabular-nums">{formatCurrency(kpis.revenue)}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!selectedProduct && !prodLoading && (
        <div className="py-20 text-center text-sm text-muted-foreground bg-card rounded-[10px] border border-border/60 shadow-sm">
          <Package size={32} className="mx-auto mb-3 text-gray-300" />
          Select a product above to view its sale ledger
        </div>
      )}
    </div>
  );
};

export default ProductSalesReport;
