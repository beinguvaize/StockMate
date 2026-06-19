import React, { useEffect, useMemo, useState } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { formatCurrency } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { CreditCard, Target } from 'lucide-react';

// Date-range presets. Indian financial year runs Apr 1 → Mar 31.
const iso = (d) => d.toISOString().slice(0, 10);
const buildPresets = () => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const fyStartYear = m >= 3 ? y : y - 1; // before April → previous FY
  return [
    { id: 'THIS_MONTH', label: 'This Month', from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) },
    { id: 'LAST_MONTH', label: 'Last Month', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { id: 'THIS_FY', label: 'This FY', from: `${fyStartYear}-04-01`, to: `${fyStartYear + 1}-03-31` },
    { id: 'THIS_YEAR', label: 'This Year', from: `${y}-01-01`, to: `${y}-12-31` },
    { id: 'ALL', label: 'All Time', from: '2000-01-01', to: '2100-01-01' },
  ];
};

/**
 * Profit & Loss — sourced from get_pl_ranged (mirrors the GL: revenue net of
 * GST, COGS, returns and expenses by business date). A date-range filter lets
 * the owner see profit for a month / FY / year, tying back to the ledger.
 */
const FinancialReport = () => {
  const { currentTenantId } = useTenant();
  const presets = useMemo(buildPresets, []);
  const [preset, setPreset] = useState('THIS_FY');
  const [range, setRange] = useState(() => {
    const p = buildPresets().find(x => x.id === 'THIS_FY');
    return { from: p.from, to: p.to };
  });
  const [pl, setPl] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyPreset = (id) => {
    const p = presets.find(x => x.id === id);
    if (!p) return;
    setPreset(id);
    setRange({ from: p.from, to: p.to });
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!currentTenantId) return;
      setLoading(true);
      const { data, error } = await supabase.rpc('get_pl_ranged', {
        p_tenant_id: currentTenantId, p_from: range.from, p_to: range.to,
      });
      if (cancelled) return;
      if (error) { console.error('[P&L] get_pl_ranged failed:', error); setPl(null); }
      else setPl(Array.isArray(data) ? data[0] : data);
      setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [currentTenantId, range.from, range.to]);

  const m = {
    revenue: Number(pl?.revenue_net || 0),
    cogs: Number(pl?.cogs || 0),
    gross: Number(pl?.gross_profit || 0),
    expenses: Number(pl?.expenses || 0),
    net: Number(pl?.net_profit || 0),
    gst: Number(pl?.output_gst || 0),
    returns: Number(pl?.returns_total || 0),
  };

  const statement = [
    { label: 'Sales Revenue (net of GST)', amount: m.revenue, kind: 'pos' },
    { label: 'Cost of Goods Sold', amount: -m.cogs, kind: 'neg' },
    { label: 'Gross Profit', amount: m.gross, kind: 'subtotal' },
    { label: 'Operating Expenses', amount: -m.expenses, kind: 'neg' },
    { label: 'Net Profit', amount: m.net, kind: 'total' },
  ];

  // Payment mix (collections) — date-filtered too.
  const { data: sales } = useReportData({ table: 'sales', select: 'totalAmount, date, paymentMethod', dateColumn: 'date' });
  const insightMetrics = useMemo(() => {
    const inRange = (sales || []).filter(s => s.date >= range.from && s.date <= range.to);
    const map = inRange.reduce((acc, s) => {
      const mm = s.paymentMethod || 'CASH';
      if (!acc[mm]) acc[mm] = { name: mm, value: 0, count: 0 };
      acc[mm].value += s.totalAmount || 0; acc[mm].count += 1;
      return acc;
    }, {});
    return { paymentMix: Object.values(map).sort((a, b) => b.value - a.value) };
  }, [sales, range]);
  const totalCollected = insightMetrics.paymentMix.reduce((s, x) => s + x.value, 0);

  const plTab = {
    id: 'PL_STATEMENT', label: 'P&L Statement', icon: <Target size={18} />,
    data: statement, loading,
    columns: [
      { key: 'label', label: 'Line Item', width: 320, render: (val, row) => (
        <span className={row.kind === 'total' ? 'font-black text-ink-primary uppercase tracking-tight'
          : row.kind === 'subtotal' ? 'font-black text-ink-primary' : 'font-semibold text-gray-600'}>{val}</span>
      ) },
      { key: 'amount', label: 'Amount', type: 'currency', align: 'right', width: 200, render: (val, row) => {
        const strong = row.kind === 'total' || row.kind === 'subtotal';
        const color = row.kind === 'neg' ? 'text-red-500' : val >= 0 ? (strong ? 'text-emerald-600' : 'text-ink-primary') : 'text-red-600';
        return <span className={`${strong ? 'font-black' : 'font-bold'} ${color}`}>{formatCurrency(val)}</span>;
      } },
    ],
    kpis: [
      { id: 'rev', label: 'Revenue (net)', value: m.revenue, trendDir: 'none', color: 'indigo', chartData: [] },
      { id: 'gp', label: 'Gross Profit', value: m.gross, trendDir: m.gross >= 0 ? 'up' : 'down', color: 'sky', chartData: [] },
      { id: 'np', label: 'Net Profit', value: m.net, trendDir: m.net >= 0 ? 'up' : 'down', color: m.net >= 0 ? 'emerald' : 'rose', chartData: [] },
      { id: 'gst', label: 'GST Payable', value: m.gst, trendDir: 'none', color: 'amber', chartData: [] },
    ],
    chartConfig: {
      title: 'Revenue → Net Profit', type: 'bar',
      data: [
        { name: 'Revenue', value: m.revenue }, { name: 'COGS', value: m.cogs },
        { name: 'Expenses', value: m.expenses }, { name: 'Net Profit', value: m.net },
      ],
      series: [{ key: 'value', name: 'Amount', color: '#D97706' }],
    },
  };

  const mixTab = {
    id: 'PAYMENT_MIX', label: 'Payment Mix', icon: <CreditCard size={18} />,
    data: insightMetrics.paymentMix, loading,
    columns: [
      { key: 'name', label: 'Payment Method', width: 220, render: (v) => <span className="font-black text-ink-primary uppercase tracking-tight">{v}</span> },
      { key: 'count', label: 'Transactions', align: 'right', width: 140, render: (v) => <span className="font-mono text-gray-400">{v}</span> },
      { key: 'value', label: 'Total Collected', type: 'currency', align: 'right', width: 180 },
      { key: 'share', label: 'Share', align: 'right', width: 120, render: (_, row) => {
        const s = totalCollected > 0 ? (row.value / totalCollected) * 100 : 0;
        return <span className="text-[10px] font-black text-accent-signature">{s.toFixed(1)}%</span>;
      } },
    ],
    kpis: [
      { id: 'primary', label: 'Top Method', value: insightMetrics.paymentMix[0]?.value || 0, trendDir: 'none', color: 'indigo', chartData: [] },
      { id: 'avg', label: 'Avg Ticket', value: totalCollected / (insightMetrics.paymentMix.reduce((s, x) => s + x.count, 0) || 1), trendDir: 'none', color: 'emerald', chartData: [] },
    ],
    chartConfig: { title: 'Revenue by payment method', type: 'pie', data: insightMetrics.paymentMix.map(x => ({ name: x.name, value: x.value })) },
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Date range bar */}
      <div className="flex flex-wrap items-center gap-2 no-print">
        <div className="flex gap-1 bg-canvas p-1 rounded-pill">
          {presets.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-pill text-[11px] font-bold transition-colors ${
                preset === p.id ? 'bg-accent-signature text-button-text shadow-sm' : 'text-gray-500 hover:text-ink-primary'
              }`}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <input type="date" value={range.from} onChange={e => { setPreset(''); setRange(r => ({ ...r, from: e.target.value })); }}
            className="bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-accent-signature/40" />
          <span className="text-xs text-gray-400">→</span>
          <input type="date" value={range.to} onChange={e => { setPreset(''); setRange(r => ({ ...r, to: e.target.value })); }}
            className="bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-accent-signature/40" />
        </div>
      </div>

      <PremiumReportView title="Profit & Loss" tabs={[plTab, mixTab]} />
    </div>
  );
};

export default FinancialReport;
