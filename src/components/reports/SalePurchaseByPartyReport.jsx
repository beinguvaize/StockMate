/**
 * SalePurchaseByPartyReport — Sales by Customer + Purchases by Supplier, date-ranged.
 */
import React, { useState, useMemo } from 'react';
import {
  Users, Truck, TrendingUp, ShoppingBag, Calendar, Download,
} from 'lucide-react';
import useReportData from './useReportData';
import { formatCurrency, todayISOInAppTZ } from '../../lib/utils';

const today = todayISOInAppTZ();

const PRESETS = [
  { id: 'TODAY',   label: 'Today' },
  { id: 'WEEK',    label: 'This Week' },
  { id: 'MONTH',   label: 'This Month' },
  { id: 'QUARTER', label: 'Quarter' },
  { id: 'YEAR',    label: 'This Year' },
];

function presetRange(id) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  switch (id) {
    case 'TODAY': return { start: today, end: today };
    case 'WEEK': {
      const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
      return { start: fmt(mon), end: today };
    }
    case 'MONTH':
      return { start: `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`, end: today };
    case 'QUARTER': {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1);
      return { start: fmt(qStart), end: today };
    }
    case 'YEAR':
      return { start: `${now.getFullYear()}-01-01`, end: today };
    default: return { start: today, end: today };
  }
}

const SectionHead = ({ title, sub }) => (
  <div className="flex items-baseline gap-3 mb-4">
    <h2 className="text-base font-black text-ink-primary">{title}</h2>
    {sub && <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{sub}</span>}
  </div>
);

const KPI = ({ label, value, icon: Icon, color = '#6366f1', loading }) => (
  <div className="bg-white rounded-2xl border border-black/5 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color + '18' }}>
      <Icon size={16} style={{ color }} />
    </div>
    {loading
      ? <div className="h-7 w-24 bg-canvas animate-pulse rounded-lg" />
      : <div className="text-2xl font-black text-ink-primary tabular-nums leading-none">{value}</div>
    }
    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</div>
  </div>
);

const ShareBar = ({ share, color }) => (
  <div className="flex items-center gap-2 mt-1">
    <div className="w-20 h-1 rounded-full bg-canvas overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, share)}%`, background: color }} />
    </div>
    <span className="text-[9px] font-black" style={{ color }}>{share.toFixed(1)}%</span>
  </div>
);

const PartyTable = ({ title, icon: Icon, rows, totalAmount, totalLabel, colorAccent, amountLabel, loading, emptyMsg, rankColors }) => (
  <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden flex-1 min-w-0">
    <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-center justify-between">
      <SectionHead title={title} sub={`${rows.length} ${totalLabel}`} />
      <div className="text-right">
        <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{amountLabel}</div>
        <div className="text-base font-black text-ink-primary tabular-nums">{formatCurrency(totalAmount)}</div>
      </div>
    </div>

    {loading ? (
      <div className="p-6 space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-canvas animate-pulse rounded-xl" />)}
      </div>
    ) : rows.length === 0 ? (
      <div className="py-16 text-center text-sm text-gray-400">{emptyMsg}</div>
    ) : (
      <div>
        <div className="grid grid-cols-[36px_1fr_80px_130px] gap-3 px-6 py-2 bg-canvas/50 border-b border-black/5">
          {['#','Name','Orders','Amount'].map(h => (
            <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
          ))}
        </div>
        {rows.map((row, i) => (
          <div key={row.name} className="grid grid-cols-[36px_1fr_80px_130px] gap-3 px-6 py-3.5 items-center border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors">
            <span className={`text-sm font-black ${rankColors[i] || 'text-ink-tertiary'}`}>{i + 1}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: colorAccent + '18' }}>
                  <span className="text-[10px] font-black" style={{ color: colorAccent }}>
                    {(row.name?.[0] || '?').toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-bold text-ink-primary truncate">{row.name}</span>
              </div>
              <ShareBar share={row.share} color={colorAccent} />
            </div>
            <span className="text-sm font-mono text-ink-secondary tabular-nums">{row.orders}</span>
            <span className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(row.amount)}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

const RANK_COLORS = ['text-amber-500', 'text-gray-400', 'text-amber-700'];

const SalePurchaseByPartyReport = () => {
  const [preset, setPreset]       = useState('MONTH');
  const [range,  setRange]        = useState(() => presetRange('MONTH'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: sales,     loading: sLoading } = useReportData({ table: 'sales',     select: 'id, totalAmount, customerInfo, shopId', dateColumn: 'date', filters });
  const { data: purchases, loading: pLoading } = useReportData({ table: 'purchases', select: 'id, total_amount, supplier_name',       dateColumn: 'date', filters });

  const loading = sLoading || pLoading;

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };

  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  const { salesByCustomer, totalSales } = useMemo(() => {
    const map = {};
    sales.forEach(s => {
      const name = s.customerInfo?.name || 'Walk-in';
      const key  = s.customerInfo?.id || `wk_${name}`;
      if (!map[key]) map[key] = { name, amount: 0, orders: 0 };
      map[key].amount += Number(s.totalAmount || 0);
      map[key].orders += 1;
    });
    const total = Object.values(map).reduce((s, r) => s + r.amount, 0);
    const rows  = Object.values(map)
      .sort((a, b) => b.amount - a.amount)
      .map(r => ({ ...r, share: total > 0 ? r.amount / total * 100 : 0 }));
    return { salesByCustomer: rows, totalSales: total };
  }, [sales]);

  const { purchBySupplier, totalPurchases } = useMemo(() => {
    const map = {};
    purchases.forEach(p => {
      const name = p.supplier_name || 'Direct';
      if (!map[name]) map[name] = { name, amount: 0, orders: 0 };
      map[name].amount += Number(p.total_amount || 0);
      map[name].orders += 1;
    });
    const total = Object.values(map).reduce((s, r) => s + r.amount, 0);
    const rows  = Object.values(map)
      .sort((a, b) => b.amount - a.amount)
      .map(r => ({ ...r, share: total > 0 ? r.amount / total * 100 : 0 }));
    return { purchBySupplier: rows, totalPurchases: total };
  }, [purchases]);

  const exportCSV = () => {
    const salesRows  = [['SALES BY CUSTOMER'],['Customer','Orders','Amount',...salesByCustomer.map(r=>[r.name,r.orders,r.amount.toFixed(2)])]];
    const purchRows  = [['PURCHASES BY SUPPLIER'],['Supplier','Orders','Amount',...purchBySupplier.map(r=>[r.name,r.orders,r.amount.toFixed(2)])]];
    const all        = [...salesRows, [], ...purchRows];
    const csv        = all.map(r => Array.isArray(r[0]) ? r[0].map(v=>`"${v}"`).join(',') : r.map(v=>`"${v}"`).join(',')).join('\n');
    const blob       = new Blob([csv], { type: 'text/csv' });
    const url        = URL.createObjectURL(blob);
    const a          = document.createElement('a'); a.href = url;
    a.download       = `sale_purchase_by_party_${range.start}_${range.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-primary leading-none">
            Sales & Purchases by Party<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-1">
            {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-white border border-gray-200 shadow-sm rounded-xl p-1 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                preset === p.id ? 'bg-ink-primary text-white shadow-sm' : 'text-gray-500 hover:text-ink-primary hover:bg-white'
              }`}>{p.label}</button>
          ))}
          <button onClick={() => applyPreset('CUSTOM')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
              preset === 'CUSTOM' ? 'bg-ink-primary text-white' : 'text-gray-500 hover:text-ink-primary hover:bg-white'
            }`}>
            <Calendar size={11} /> Custom
          </button>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-black/8 bg-white text-xs font-black text-ink-primary hover:border-black/20 hover:shadow-sm transition-all">
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-black/5 shadow-sm">
          <Calendar size={14} className="text-gray-400 shrink-0" />
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="bg-white border border-gray-200 shadow-sm rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20" />
          <span className="text-gray-400 text-xs font-bold">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="bg-white border border-gray-200 shadow-sm rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20" />
          <button onClick={applyCustom}
            className="px-4 py-2 rounded-xl bg-ink-primary text-white text-xs font-black hover:bg-ink-primary/90 transition-all">
            Apply
          </button>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Total Sales"          loading={loading} value={formatCurrency(totalSales)}      icon={TrendingUp}  color="#6366f1" />
        <KPI label="Customers"            loading={loading} value={salesByCustomer.length}          icon={Users}       color="#10b981" />
        <KPI label="Total Purchases"      loading={loading} value={formatCurrency(totalPurchases)}  icon={ShoppingBag} color="#f59e0b" />
        <KPI label="Suppliers"            loading={loading} value={purchBySupplier.length}          icon={Truck}       color="#8b5cf6" />
      </div>

      {/* Two tables */}
      <div className="flex flex-col xl:flex-row gap-6">
        <PartyTable
          title="Sales by Customer"
          icon={Users}
          rows={salesByCustomer}
          totalAmount={totalSales}
          totalLabel="customers"
          amountLabel="Total Sales"
          colorAccent="#6366f1"
          amountLabel2="Sales"
          loading={sLoading}
          emptyMsg="No sales for selected period"
          rankColors={RANK_COLORS}
        />
        <PartyTable
          title="Purchases by Supplier"
          icon={Truck}
          rows={purchBySupplier}
          totalAmount={totalPurchases}
          totalLabel="suppliers"
          amountLabel="Total Purchases"
          colorAccent="#8b5cf6"
          loading={pLoading}
          emptyMsg="No purchases for selected period"
          rankColors={RANK_COLORS}
        />
      </div>
    </div>
  );
};

export default SalePurchaseByPartyReport;
