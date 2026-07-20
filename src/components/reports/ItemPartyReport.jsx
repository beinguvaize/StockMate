/**
 * ItemPartyReport — Item × Party cross report.
 * Two views:
 * "By Customer" — pick a customer → table of items they bought
 * "By Item"     — pick a product  → table of customers who bought it
 */
import React, { useState, useMemo } from 'react';
import {
  Users, Package, Search, TrendingUp, Hash, BarChart3,
} from 'lucide-react';
import useReportData from './useReportData';
import ReportHeader from './ReportHeader';
import { KPI, SectionHead } from './ReportBits';
import { isCountableSale, presetRange } from './reportUtils';
import { formatCurrency } from '../../lib/utils';

// Searchable picker shared by both views
const EntityPicker = ({ label, items, selectedId, onSelect, loading, displayKey = 'name', subKey }) => {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() =>
    items.filter(c => (c[displayKey] || '').toLowerCase().includes(search.toLowerCase())),
    [items, search, displayKey]
  );
  const selected = items.find(c => c.id === selectedId);

  return (
    <div className="bg-card rounded-[10px] border border-border/60 shadow-sm p-6">
      <SectionHead title={label} sub="search to select" />
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder={`Search ${label.toLowerCase()}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-card border border-border shadow-sm rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-accent-signature/20"
        />
      </div>
      {search && (
        <div className="mt-2 bg-card border border-black/8 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {loading
            ? <div className="p-4 text-xs text-muted-foreground">Loading...</div>
            : filtered.length === 0
            ? <div className="p-4 text-xs text-muted-foreground">No results found</div>
            : filtered.map(item => (
              <button key={item.id}
                onClick={() => { onSelect(item.id); setSearch(''); }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-canvas/60 transition-colors text-left border-b border-border/60 last:border-0 ${selectedId === item.id ? 'bg-accent-signature/5' : ''}`}>
                <div className="w-8 h-8 rounded-full bg-accent-signature/10 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-semibold text-accent-signature">{((item[displayKey]||'?')[0]).toUpperCase()}</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{item[displayKey]}</div>
                  {subKey && item[subKey] && <div className="text-[10px] text-muted-foreground">{item[subKey]}</div>}
                </div>
              </button>
            ))
          }
        </div>
      )}
      {selected && !search && (
        <div className="mt-3 flex items-center gap-3 p-3 bg-accent-signature/5 rounded-xl border border-accent-signature/10">
          <div className="w-9 h-9 rounded-full bg-accent-signature/15 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-semibold text-accent-signature">{((selected[displayKey]||'?')[0]).toUpperCase()}</span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground">{selected[displayKey]}</div>
            {subKey && selected[subKey] && <div className="text-[10px] text-muted-foreground">{selected[subKey]}</div>}
          </div>
          <button onClick={() => onSelect('')}
            className="text-[10px] font-semibold text-muted-foreground hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
            Change
          </button>
        </div>
      )}
    </div>
  );
};

const ItemPartyReport = () => {
  const [view,        setView]       = useState('customer'); // 'customer' | 'item'
  const [preset,      setPreset]     = useState('TODAY');
  const [range,       setRange]      = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);
  const [clientId,    setClientId]   = useState('');
  const [productId,   setProductId]  = useState('');

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: salesRaw,    loading: sLoading } = useReportData({ table: 'sales',    select: '*',            dateColumn: 'date', filters });
  const sales = useMemo(() => salesRaw.filter(isCountableSale), [salesRaw]);
  const { data: clients,  loading: cLoading } = useReportData({ table: 'clients',  select: 'id, name, phone' });
  const { data: products, loading: pLoading } = useReportData({ table: 'products', select: 'id, name, sku' });

  const loading = sLoading || cLoading || pLoading;

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };
  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  const clientMap  = useMemo(() => { const m = {}; clients.forEach(c => { m[c.id] = c.name; }); return m; }, [clients]);
  const productMap = useMemo(() => { const m = {}; products.forEach(p => { m[p.id] = p.name; }); return m; }, [products]);

  // By Customer view: items bought by selected customer
  const customerRows = useMemo(() => {
    if (!clientId) return { rows: [], kpis: { totalQty: 0, totalRevenue: 0, uniqueItems: 0 } };
    const itemAgg = {};
    sales.forEach(s => {
      const cid = s.customerInfo?.id || s.shopId || null;
      if (cid !== clientId) return;
      const items = Array.isArray(s.items) ? s.items : [];
      items.forEach(item => {
        const pid  = item.id || item.productId || null;
        const name = (pid && productMap[pid]) || item.name || 'Unknown';
        const key  = pid || name;
        if (!itemAgg[key]) itemAgg[key] = { name, qty: 0, revenue: 0 };
        itemAgg[key].qty     += Number(item.quantity || 0);
        itemAgg[key].revenue += Number(item.quantity || 0) * Number(item.rate || item.sellingPrice || 0);
      });
    });
    const rows = Object.values(itemAgg).sort((a, b) => b.revenue - a.revenue);
    const totalQty     = rows.reduce((s, r) => s + r.qty, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    return { rows, kpis: { totalQty, totalRevenue, uniqueItems: rows.length } };
  }, [clientId, sales, productMap]);

  // By Item view: customers who bought selected product
  const itemRows = useMemo(() => {
    if (!productId) return { rows: [], kpis: { totalQty: 0, totalRevenue: 0, uniqueCustomers: 0 } };
    const custAgg = {};
    sales.forEach(s => {
      const items = Array.isArray(s.items) ? s.items : [];
      items.forEach(item => {
        const pid = item.id || item.productId || null;
        if (pid !== productId) return;
        const cid  = s.customerInfo?.id || s.shopId || null;
        const name = (cid && clientMap[cid]) || s.customerInfo?.name || 'Walk-in';
        const key  = cid || `walkin_${name}`;
        if (!custAgg[key]) custAgg[key] = { name, qty: 0, revenue: 0 };
        custAgg[key].qty     += Number(item.quantity || 0);
        custAgg[key].revenue += Number(item.quantity || 0) * Number(item.rate || item.sellingPrice || 0);
      });
    });
    const rows = Object.values(custAgg).sort((a, b) => b.revenue - a.revenue);
    const totalQty     = rows.reduce((s, r) => s + r.qty, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    return { rows, kpis: { totalQty, totalRevenue, uniqueCustomers: rows.length } };
  }, [productId, sales, clientMap]);

  const isCustomerView = view === 'customer';
  const selectedEntity = isCustomerView
    ? clients.find(c => c.id === clientId)
    : products.find(p => p.id === productId);

  const tableRows  = isCustomerView ? customerRows.rows  : itemRows.rows;
  const tableKpis  = isCustomerView ? customerRows.kpis  : itemRows.kpis;
  const entitySelected = isCustomerView ? !!clientId : !!productId;

  return (
    <div className="space-y-4 pb-16">
      <ReportHeader
        title="Item × Party"
        subtitle={range.start === range.end ? range.start : `${range.start} → ${range.end}`}
        preset={preset}
        onPreset={applyPreset}
        showCustom={showCustom}
        customStart={customStart}
        customEnd={customEnd}
        setCustomStart={setCustomStart}
        setCustomEnd={setCustomEnd}
        onApplyCustom={applyCustom}
      />

      {/* View toggle */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">View:</span>
        <div className="flex items-center gap-1 bg-card border border-border shadow-sm rounded-xl p-1">
          <button onClick={() => { setView('customer'); setProductId(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-semibold transition-all ${
              view === 'customer' ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'
            }`}>
            <Users size={12} /> By Customer
          </button>
          <button onClick={() => { setView('item'); setClientId(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-semibold transition-all ${
              view === 'item' ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'
            }`}>
            <Package size={12} /> By Item
          </button>
        </div>
      </div>

      {/* Picker */}
      {isCustomerView ? (
        <EntityPicker
          label="Customer"
          items={clients}
          selectedId={clientId}
          onSelect={setClientId}
          loading={cLoading}
          displayKey="name"
          subKey="phone"
        />
      ) : (
        <EntityPicker
          label="Product"
          items={products}
          selectedId={productId}
          onSelect={setProductId}
          loading={pLoading}
          displayKey="name"
          subKey="sku"
        />
      )}

      {/* KPIs (only when entity is selected) */}
      {entitySelected && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isCustomerView ? (
            <>
              <KPI label="Unique Items"   loading={sLoading} value={tableKpis.uniqueItems}             icon={Package}    color="#8b5cf6" />
              <KPI label="Total Qty"      loading={sLoading} value={tableKpis.totalQty}                icon={Hash}       color="var(--color-accent-signature)" />
              <KPI label="Total Revenue"  loading={sLoading} value={formatCurrency(tableKpis.totalRevenue)} icon={TrendingUp} color="#10b981" />
            </>
          ) : (
            <>
              <KPI label="Customers"      loading={sLoading} value={tableKpis.uniqueCustomers}          icon={Users}      color="#8b5cf6" />
              <KPI label="Total Qty Sold" loading={sLoading} value={tableKpis.totalQty}                icon={Hash}       color="var(--color-accent-signature)" />
              <KPI label="Total Revenue"  loading={sLoading} value={formatCurrency(tableKpis.totalRevenue)} icon={TrendingUp} color="#10b981" />
            </>
          )}
        </div>
      )}

      {/* Table */}
      {entitySelected && (
        <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-border/60 flex items-center justify-between">
            <SectionHead
              title={isCustomerView
                ? `Items — ${selectedEntity?.name || ''}`
                : `Customers — ${selectedEntity?.name || ''}`}
              sub="ranked by revenue"
            />
            <span className="text-[10px] font-semibold text-muted-foreground bg-canvas px-2 py-1 rounded-full">
              {tableRows.length} {isCustomerView ? 'items' : 'customers'}
            </span>
          </div>

          {sLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
            </div>
          ) : tableRows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No data for selected {isCustomerView ? 'customer' : 'product'} in this period
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-[36px_1fr_100px_140px] gap-4 px-6 py-2 bg-canvas/50 border-b border-border/60">
                {['#', isCustomerView ? 'Item' : 'Customer', 'Qty', 'Revenue'].map(h => (
                  <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">{h}</span>
                ))}
              </div>
              {tableRows.map((row, i) => (
                <div key={row.name}
                  className="grid grid-cols-[36px_1fr_100px_140px] gap-4 px-6 py-3.5 items-center border-b border-border/60 last:border-0 hover:bg-canvas/40 transition-colors">
                  <span className={`text-sm font-semibold tabular-nums ${i===0?'text-accent-signature':i===1?'text-muted-foreground':i===2?'text-accent-signature-hover':'text-ink-tertiary'}`}>
                    {i + 1}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-accent-signature/10 flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-semibold text-accent-signature">{((row.name||'?')[0]).toUpperCase()}</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground truncate">{row.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums">{row.qty}</span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(row.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prompt when nothing selected */}
      {!entitySelected && !loading && (
        <div className="py-20 text-center text-sm text-muted-foreground bg-card rounded-[10px] border border-border/60 shadow-sm">
          {isCustomerView
            ? <><Users size={32} className="mx-auto mb-3 text-gray-300" />Select a customer above to see their items</>
            : <><Package size={32} className="mx-auto mb-3 text-gray-300" />Select a product above to see its customers</>
          }
        </div>
      )}
    </div>
  );
};

export default ItemPartyReport;
