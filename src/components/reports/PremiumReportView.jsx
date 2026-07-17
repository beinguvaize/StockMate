/**
 * PremiumReportView — drop-in replacement for ReportShell.
 *
 * Renders the same `tabs` config in the premium BusinessReport visual
 * language: clean header, pill tab switcher, KPI cards with sparklines,
 * a single recharts visual, and the premium ReportTable.
 *
 * Accepts the EXACT same `tabs` prop shape ReportShell consumes:
 *   [{ id, label, icon, permission, data, loading, totals,
 *      columns, kpis, chartConfig, detailFields, onExportCSV }]
 *
 * Data logic stays in the report components — this only changes the chrome.
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Download, BarChart3, FileSpreadsheet, Printer, FileText, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import ReportTable from './ReportTable';
import { exportToCSV, exportExcel, printReport, letterheadFrom, safeFilename } from '../../lib/reportExport';
import { formatCurrency, todayISOInAppTZ } from '../../lib/utils';

/* ─── Colour tokens ───────────────────────────────────────────────────────── */
const COLOR_HEX = {
  indigo: 'var(--color-accent-signature)', emerald: '#10b981', amber: '#f59e0b', rose: '#ef4444',
  orange: '#f97316', sky: '#0ea5e9', violet: '#8b5cf6', blue: '#3b82f6',
};
const PIE_COLORS = ['var(--color-accent-signature)', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

/* ─── Value formatting ────────────────────────────────────────────────────── */
const MONEY_RE = /value|revenue|profit|capital|payroll|disburs|outstanding|magnitude|burn|salary|\brev\b|balance|amount|spend|yield|cost/i;

const formatCompact = (val) => {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`;
  if (val >= 100000)   return `₹${(val / 100000).toFixed(2)}L`;
  return formatCurrency(val);
};

const kpiDisplay = (label, value) => {
  if (typeof value !== 'number') return value;
  return MONEY_RE.test(label || '') ? formatCompact(value) : value.toLocaleString('en-IN');
};

/* ─── Mini sparkline ──────────────────────────────────────────────────────── */
const Spark = ({ data = [], color = 'var(--color-accent-signature)' }) => {
  if (!data || data.length < 2) return <div className="h-9" />;
  const id = `prk_${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5}
          fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

/* ─── KPI card ────────────────────────────────────────────────────────────── */
const KPI = ({ card, loading }) => {
  const color = COLOR_HEX[card.color] || COLOR_HEX.indigo;
  const dir   = card.trendDir;
  const TrendIcon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus;
  const trendCls = dir === 'up' ? 'text-emerald-500' : dir === 'down' ? 'text-red-400' : 'text-gray-400';
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        </div>
        {dir && (
          <span className={`text-[10px] font-black flex items-center gap-0.5 ${trendCls}`}>
            <TrendIcon size={11} />
            {dir !== 'none' ? `${Math.abs(Number(card.trend) || 0)}%` : '—'}
          </span>
        )}
      </div>
      {loading
        ? <div className="h-7 w-24 bg-canvas animate-pulse rounded-lg" />
        : <div className="font-mono text-2xl font-bold text-ink-primary tabular-nums leading-none truncate">
            {kpiDisplay(card.label, card.value)}
          </div>
      }
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{card.label}</div>
      <Spark data={card.chartData} color={color} />
    </div>
  );
};

/* ─── Section header ──────────────────────────────────────────────────────── */
const SectionHead = ({ title, sub }) => (
  <div className="flex items-baseline gap-3">
    <h2 className="text-base font-black text-ink-primary">{title}</h2>
    {sub && <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{sub}</span>}
  </div>
);

/* ─── Chart tooltip ───────────────────────────────────────────────────────── */
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-black/8 rounded-xl px-3 py-2 shadow-lg text-xs">
      <div className="font-bold text-ink-secondary mb-1">{label || payload[0]?.payload?.name}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-black text-ink-primary tabular-nums">
            {typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ─── Chart panel ─────────────────────────────────────────────────────────── */
const ChartPanel = ({ config, loading }) => {
  if (!config) return null;
  const { title, type = 'bar', data = [], series } = config;
  const ser = series && series.length ? series : [{ key: 'value', name: 'Value', color: 'var(--color-accent-signature)' }];

  const axisTick = { fontSize: 10, fill: '#9ca3af', fontWeight: 600 };
  const yFmt = v => (v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : v >= 1000 ? `₹${(v/1000).toFixed(0)}k` : v);

  let chart;
  if (loading) {
    chart = <div className="h-[280px] bg-canvas animate-pulse rounded-xl" />;
  } else if (!data.length) {
    chart = (
      <div className="h-[280px] flex flex-col items-center justify-center gap-3 text-gray-300">
        <BarChart3 size={40} strokeWidth={1.5} />
        <span className="text-[10px] font-black uppercase tracking-widest">No data for this view</span>
      </div>
    );
  } else if (type === 'pie') {
    chart = (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={70} outerRadius={110}
            paddingAngle={4} dataKey="value" stroke="none" isAnimationActive={false}>
            {data.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip content={<ChartTip />} />
          <Legend verticalAlign="bottom" height={32} iconType="circle"
            wrapperStyle={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }} />
        </PieChart>
      </ResponsiveContainer>
    );
  } else if (type === 'line') {
    chart = (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={yFmt} />
          <Tooltip content={<ChartTip />} />
          {ser.map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color}
              strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: s.color }}
              activeDot={{ r: 5 }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  } else {
    chart = (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={yFmt} />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
          {ser.map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color}
              radius={[6, 6, 0, 0]} maxBarSize={40} isAnimationActive={false}>
              {ser.length === 1 && data.map((e, i) => (
                <Cell key={i} fill={s.color || PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
      <div className="mb-4"><SectionHead title={title || 'Analysis'} sub="visual" /></div>
      {chart}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════════════════════════════ */
const PremiumReportView = ({ tabs = [], title = 'Report', subtitle }) => {
  const { hasPermission } = useAuth();
  const { businessProfile, currentTenant } = useTenant();
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef(null);
  useEffect(() => {
    const h = (e) => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setExportOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const allowedTabs = useMemo(
    () => tabs.filter(t => !t.permission || hasPermission(t.permission, 'view')),
    [tabs, hasPermission]
  );

  const [activeId, setActiveId] = useState(allowedTabs[0]?.id);
  const activeTab = useMemo(
    () => allowedTabs.find(t => t.id === activeId) || allowedTabs[0],
    [activeId, allowedTabs]
  );

  if (!activeTab) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-gray-300">
        <BarChart3 size={56} strokeWidth={1} />
        <p className="text-sm font-black uppercase mt-5 tracking-widest">Access Denied</p>
      </div>
    );
  }

  const kpis    = activeTab.kpis || [];
  const loading = !!activeTab.loading;

  // Data columns for export (skip UI-only synthetic columns prefixed '_').
  const exportCols = (activeTab.columns || []).filter(c => c.key && !String(c.key).startsWith('_'));
  const fname = safeFilename(`${activeTab.label}_${todayISOInAppTZ()}`);
  const lh = letterheadFrom(businessProfile || {}, currentTenant || {});
  const fmtCell = (col, v) => (col.type === 'currency' && v != null && v !== '')
    ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (v ?? '');

  const doCSV = () => {
    setExportOpen(false);
    if (activeTab.onExportCSV) { activeTab.onExportCSV(); return; }
    exportToCSV({ filename: fname, columns: exportCols, data: activeTab.data || [], totals: activeTab.totals || null });
  };
  const doExcel = () => {
    setExportOpen(false);
    exportExcel({ filename: fname, sheets: [{
      name: activeTab.label,
      columns: exportCols.map(c => ({ key: c.key, label: c.label || c.key, width: c.width ? c.width / 8 : undefined })),
      rows: (activeTab.data || []).map(r => {
        const o = {}; exportCols.forEach(c => { o[c.key] = fmtCell(c, r[c.key]); }); return o;
      }),
      total: activeTab.totals || null,
    }] });
  };
  const doPDF = () => {
    setExportOpen(false);
    // Build a clean enterprise table (avoids cloning styled app DOM).
    const align = (c) => c.align === 'right' || c.type === 'currency' ? ' align="right"' : '';
    const head = `<tr>${exportCols.map(c => `<th${align(c)}>${c.label || c.key}</th>`).join('')}</tr>`;
    const body = (activeTab.data || []).map(r =>
      `<tr>${exportCols.map(c => `<td${align(c)}>${fmtCell(c, r[c.key])}</td>`).join('')}</tr>`
    ).join('');
    const totalRow = activeTab.totals
      ? `<tr class="total-row">${exportCols.map((c, i) => `<td${align(c)}>${i === 0 ? 'TOTAL' : fmtCell(c, activeTab.totals[c.key])}</td>`).join('')}</tr>`
      : '';
    printReport({
      html: `<table><thead>${head}</thead><tbody>${body}${totalRow}</tbody></table>`,
      title: `${title} — ${activeTab.label}`,
      subtitle: subtitle || '',
      letterhead: lh,
    });
  };

  return (
    <div className="space-y-8 pb-16 animate-fade-in">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-primary leading-none">
            {title}<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-1">
            {subtitle || `${activeTab.label} — ${businessProfile?.name || 'Business intelligence'}`}
          </p>
        </div>
        <div className="flex-1" />

        {/* Tab pills */}
        {allowedTabs.length > 1 && (
          <div className="flex items-center gap-1 bg-white border border-gray-300 shadow-sm rounded-xl p-1 flex-wrap">
            {allowedTabs.map(t => (
              <button key={t.id} onClick={() => setActiveId(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                  activeTab.id === t.id
                    ? 'bg-ink-primary text-white shadow-sm'
                    : 'text-gray-500 hover:text-ink-primary hover:bg-white'
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        )}

        <div className="relative no-print" ref={exportMenuRef}>
          <button onClick={() => setExportOpen(o => !o)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700 shadow-md shadow-amber-600/25 transition-all">
            <Download size={13} /> Export <ChevronDown size={12} className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
          </button>
          {exportOpen && (
            <div className="absolute right-0 mt-2 w-44 rounded-xl bg-white border border-black/10 shadow-xl overflow-hidden z-40 py-1">
              <button onClick={doExcel} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-ink-primary hover:bg-amber-50 transition-colors">
                <FileSpreadsheet size={15} className="text-emerald-600" /> Excel (.xlsx)
              </button>
              <button onClick={doPDF} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-ink-primary hover:bg-amber-50 transition-colors">
                <Printer size={15} className="text-amber-600" /> PDF / Print
              </button>
              <button onClick={doCSV} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-ink-primary hover:bg-amber-50 transition-colors">
                <FileText size={15} className="text-gray-400" /> CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── KPI ROW ────────────────────────────────────────────────────── */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((c, i) => <KPI key={c.id || i} card={c} loading={loading} />)}
        </div>
      )}

      {/* ── CHART ──────────────────────────────────────────────────────── */}
      <ChartPanel config={activeTab.chartConfig} loading={loading} />

      {/* ── DATA TABLE ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-black/5">
          <SectionHead title={activeTab.label} sub={`${(activeTab.data || []).length} records`} />
        </div>
        <div className="p-4">
          <ReportTable
            columns={activeTab.columns || []}
            data={activeTab.data || []}
            loading={loading}
            totalsRow={activeTab.totals || null}
          />
        </div>
      </div>

    </div>
  );
};

export default PremiumReportView;
