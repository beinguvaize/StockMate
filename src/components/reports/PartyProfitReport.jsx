/**
 * PartyProfitReport — Party-wise Profit & Loss.
 * One row per customer: revenue, cost, profit, margin %.
 * Walk-in bucket for null/anonymous customers.
 */
import React, { useState, useMemo } from 'react';
import {
  TrendingUp, DollarSign, Users, BarChart3,
} from 'lucide-react';
import useReportData from './useReportData';
import ReportHeader from './ReportHeader';
import { KPI, SectionHead } from './ReportBits';
import PLTieOut from './PLTieOut';
import { isCountableSale, presetRange } from './reportUtils';
import { formatCurrency } from '../../lib/utils';

function calcItemRevenue(item) {
  return Number(item.quantity || 0) * Number(item.rate || item.sellingPrice || 0);
}
// Sale items don't carry costPrice — resolve from products lookup.
function calcItemCost(item, costById) {
  const qty  = Number(item.quantity || 0);
  const unit = Number(item.costPrice) ||
    (costById && (costById[item.id] || costById[item.productId])) || 0;
  return qty * unit;
}

const PartyProfitReport = () => {
  const [preset, setPreset]         = useState('TODAY');
  const [range,  setRange]          = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: salesRaw,       loading: sLoading } = useReportData({ table: 'sales',    select: '*', dateColumn: 'date', filters });
  const sales = useMemo(() => salesRaw.filter(isCountableSale), [salesRaw]);
  const { data: clients,     loading: cLoading } = useReportData({ table: 'clients',  select: 'id, name' });
  const { data: products }                        = useReportData({ table: 'products', select: 'id, costPrice' });
  const { data: consumption }                     = useReportData({ table: 'sale_batch_consumption', select: 'sale_id, qty_taken, unit_cost' });

  const loading = sLoading || cLoading;

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };
  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  const clientMap = useMemo(() => {
    const m = {};
    clients.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [clients]);

  const costById = useMemo(() => {
    const m = {};
    products.forEach(p => { if (p.id) m[p.id] = Number(p.costPrice || 0); });
    return m;
  }, [products]);

  const fifoBySale = useMemo(() => {
    const m = {};
    (consumption || []).forEach(c => {
      const v = Number(c.qty_taken || 0) * Number(c.unit_cost || 0);
      m[c.sale_id] = (m[c.sale_id] || 0) + v;
    });
    return m;
  }, [consumption]);

  const { rows, kpis } = useMemo(() => {
    const partyMap = {};

    sales.forEach(s => {
      const cid  = s.customerInfo?.id || s.shopId || null;
      const name = (cid && clientMap[cid]) || s.customerInfo?.name || 'Walk-in';
      const key  = cid || `walkin_${name}`;

      if (!partyMap[key]) partyMap[key] = { name, revenue: 0, cost: 0, orders: 0 };

      const items = Array.isArray(s.items) ? s.items : [];
      // totalAmount is the post-discount amount actually billed — summing
      // qty×rate overstated revenue (and profit) by every bill discount.
      const revenue = Number(s.totalAmount)
        || items.reduce((acc, it) => acc + calcItemRevenue(it), 0);
      // sales.totalCogs is the source of truth — see BillWiseProfitReport.
      const storedCogs = Number(s.totalCogs);
      const cost = Number.isFinite(storedCogs) && storedCogs > 0
        ? storedCogs
        : fifoBySale[s.id] != null
          ? fifoBySale[s.id]
          : items.reduce((acc, it) => acc + calcItemCost(it, costById), 0);

      partyMap[key].revenue += revenue;
      partyMap[key].cost    += cost;
      partyMap[key].orders  += 1;
    });

    const rows = Object.values(partyMap)
      .map(p => ({
        ...p,
        profit: p.revenue - p.cost,
        margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit);

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalProfit  = rows.reduce((s, r) => s + r.profit, 0);
    const blendedMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      rows,
      kpis: {
        totalRevenue,
        totalProfit,
        blendedMargin,
        customerCount: rows.length,
      },
    };
  }, [sales, clientMap, costById, fifoBySale]);

  const exportCSV = () => {
    const csvRows = [
      ['Customer', 'Revenue', 'Cost', 'Profit', 'Margin %', 'Orders'],
      ...rows.map(r => [r.name, r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(2), r.orders]),
    ];
    const csv  = csvRows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `party_profit_${range.start}_${range.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pb-16">
      <ReportHeader
        title="Party Profit & Loss"
        subtitle={range.start === range.end ? range.start : `${range.start} → ${range.end}`}
        preset={preset}
        onPreset={applyPreset}
        showCustom={showCustom}
        customStart={customStart}
        customEnd={customEnd}
        setCustomStart={setCustomStart}
        setCustomEnd={setCustomEnd}
        onApplyCustom={applyCustom}
        onExport={exportCSV}
        exportLabel="Export CSV"
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Total Revenue"   loading={loading} value={formatCurrency(kpis.totalRevenue)}   icon={TrendingUp}  color="var(--color-accent-signature)" />
        <KPI label="Total Profit"    loading={loading} value={formatCurrency(kpis.totalProfit)}    icon={DollarSign}  color="#10b981" />
        <KPI label="Blended Margin"  loading={loading} value={`${kpis.blendedMargin.toFixed(1)}%`} icon={BarChart3}   color="#f59e0b" />
        <KPI label="Customers"       loading={loading} value={kpis.customerCount}                   icon={Users}       color="#8b5cf6" />
      </div>

      {/* Table */}
      <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border/60 flex items-center justify-between">
          <SectionHead title="Customer P&L" sub="ranked by profit" />
          {!loading && (
            <span className="text-[10px] font-semibold text-muted-foreground bg-canvas px-2 py-1 rounded-full">
              {rows.length} parties
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No sales data for selected period</div>
        ) : (
          <div>
            <div className="grid grid-cols-[36px_1fr_120px_120px_120px_90px_100px] gap-4 px-6 py-2 bg-canvas/50 border-b border-border/60">
              {['#', 'Customer', 'Revenue', 'Cost', 'Profit', 'Margin', 'Orders'].map(h => (
                <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">{h}</span>
              ))}
            </div>
            {rows.map((row, i) => (
              <div key={row.name}
                className={`grid grid-cols-[36px_1fr_120px_120px_120px_90px_100px] gap-4 px-6 py-3.5 items-center border-b border-border/60 last:border-0 hover:bg-canvas/40 transition-colors`}>
                <span className={`text-sm font-semibold tabular-nums ${i===0?'text-accent-signature':i===1?'text-muted-foreground':i===2?'text-accent-signature-hover':'text-ink-tertiary'}`}>
                  {i + 1}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-accent-signature/10 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-semibold text-accent-signature">{(row.name[0]||'?').toUpperCase()}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground truncate">{row.name}</span>
                </div>
                <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(row.revenue)}</span>
                <span className="text-sm font-semibold text-ink-secondary tabular-nums">{formatCurrency(row.cost)}</span>
                <span className={`text-sm font-semibold tabular-nums ${row.profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {formatCurrency(row.profit)}
                </span>
                <span className={`text-sm font-semibold tabular-nums ${row.margin < 0 ? 'text-red-500' : row.margin < 10 ? 'text-accent-signature' : 'text-emerald-600'}`}>
                  {row.margin.toFixed(1)}%
                </span>
                <span className="text-sm font-semibold text-ink-secondary tabular-nums">{row.orders}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <PLTieOut from={range.start} to={range.end} revenue={kpis.totalRevenue} cogs={kpis.totalRevenue - kpis.totalProfit}
        note="Differences are usually sales returns in the period." />
    </div>
  );
};

export default PartyProfitReport;
