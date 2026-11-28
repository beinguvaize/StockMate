/**
 * PremiumReportView: the shared report page most reports render through
 * (web redesign, reports-08 is the full drawing of it): title and subtitle,
 * period presets, view tabs, the Export menu (Excel, PDF / Print, CSV), KPI
 * cards, one chart, then the searchable, paged table with a totals row.
 *
 * Tab shape, unchanged:
 *   [{ id, label, icon, permission, data, loading, error, totals,
 *      columns, kpis, chartConfig, detailFields, onExportCSV }]
 *
 * `error` (on the page or on a tab) replaces the figures with the error
 * state, so a failed load never shows as ₹0. Data logic stays in the report
 * components; this only draws.
 */
import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PRESETS } from './reportUtils';
import { useTenant } from '../../context/TenantContext';
import ReportTable from './ReportTable';
import { exportToCSV, exportExcel, printReport, letterheadFrom, safeFilename } from '../../lib/reportExport';
import { formatCurrency, todayISOInAppTZ } from '../../lib/utils';
import { kpiDisplay } from '../../lib/reportsView';
import { Tabs } from '../ui/Tabs';
import {
  ReportTitle, Seg, ExportMenu, Figures, KpiCard, ReportBox, EmptyBlock, ErrorBlock,
} from './frame';

/* ─── Chart colours: ink, amber, then quiet supporting hues ──────────────── */
const INK2 = 'var(--color-ink-2)';
const PIE_COLORS = ['var(--color-ink-2)', 'var(--color-amber)', '#8A9099', '#12803B', '#B45309', '#1D4ED8', '#B7BCC2', '#B91C1C'];
const SERIES_COLOR = {
  // Reports name their series by the old palette; map each to the new one.
  indigo: INK2, emerald: '#12803B', amber: 'var(--color-amber)', rose: '#B91C1C',
  orange: 'var(--color-amber)', sky: '#1D4ED8', violet: '#8A9099', blue: '#1D4ED8', slate: '#8A9099',
};
const seriesColor = (c, i) => {
  if (!c) return i === 1 ? 'var(--color-amber)' : INK2;
  if (SERIES_COLOR[c]) return SERIES_COLOR[c];
  if (String(c).includes('accent-signature')) return INK2;
  return c;
};

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] bg-surface px-3 py-2 text-[12px] shadow-[0_0_0_1px_rgba(17,20,24,.06),0_12px_28px_-12px_rgba(17,20,24,.35)]">
      <div className="mb-1 font-tight font-semibold text-ink">{label || payload[0]?.payload?.name}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-[3px]" style={{ background: p.color }} />
          <span className="text-body">{p.name}:</span>
          <span className="font-tight font-semibold text-ink tabular-nums">
            {typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

const ChartPanel = ({ config, loading }) => {
  if (!config) return null;
  const { title, type = 'bar', data = [], series } = config;
  const ser = (series && series.length ? series : [{ key: 'value', name: 'Value' }])
    .map((s, i) => ({ ...s, color: seriesColor(s.color, i) }));

  const axisTick = { fontSize: 10.5, fill: 'var(--color-mute)', fontWeight: 600, fontFamily: 'Inter Tight, sans-serif' };
  const yFmt = (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : v);

  let chart;
  if (loading) {
    chart = <div className="h-[260px] animate-pulse rounded-xl bg-tile" />;
  } else if (!data.length) {
    chart = <EmptyBlock text="No data for this view" />;
  } else if (type === 'pie') {
    chart = (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={70} outerRadius={105}
            paddingAngle={3} dataKey="value" stroke="none" isAnimationActive={false}>
            {data.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip content={<ChartTip />} />
          <Legend verticalAlign="bottom" height={32} iconType="square" iconSize={9}
            wrapperStyle={{ fontSize: '12px', color: 'var(--color-body)' }} />
        </PieChart>
      </ResponsiveContainer>
    );
  } else if (type === 'line') {
    chart = (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-sep)" vertical={false} />
          <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={yFmt} />
          <Tooltip content={<ChartTip />} />
          {ser.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color}
              strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          ))}
          {ser.length > 1 && <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: '12px' }} />}
        </LineChart>
      </ResponsiveContainer>
    );
  } else {
    chart = (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-sep)" vertical={false} />
          <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={yFmt} />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(17,20,24,0.03)' }} />
          {ser.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color}
              radius={[6, 6, 2, 2]} maxBarSize={34} isAnimationActive={false} />
          ))}
          {ser.length > 1 && <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: '12px' }} />}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return <ReportBox title={title || 'Analysis'} sub="visual">{chart}</ReportBox>;
};

const PremiumReportView = ({
  tabs = [], title = 'Report', subtitle, dateWindow = null, initialTabId = null,
  error = null, onRetry = null, actions = null,
}) => {
  const { hasPermission } = useAuth();
  const { businessProfile, currentTenant } = useTenant();

  const allowedTabs = useMemo(
    () => tabs.filter((t) => !t.permission || hasPermission(t.permission, 'view')),
    [tabs, hasPermission],
  );

  const [activeId, setActiveId] = useState(
    allowedTabs.some((t) => t.id === initialTabId) ? initialTabId : allowedTabs[0]?.id);
  const activeTab = useMemo(
    () => allowedTabs.find((t) => t.id === activeId) || allowedTabs[0],
    [activeId, allowedTabs],
  );

  if (!activeTab) {
    return <EmptyBlock icon={Lock} title="Access denied" text="You do not have permission to view this report." />;
  }

  const kpis = activeTab.kpis || [];
  const loading = !!activeTab.loading;
  const failed = error || activeTab.error || null;

  const exportCols = (activeTab.columns || []).filter((c) => c.key && !String(c.key).startsWith('_'));
  const fname = safeFilename(`${activeTab.label}_${todayISOInAppTZ()}`);
  const lh = letterheadFrom(businessProfile || {}, currentTenant || {});
  const fmtCell = (col, v) => ((col.type === 'currency' && v != null && v !== '')
    ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (v ?? ''));

  const doCSV = () => {
    if (activeTab.onExportCSV) { activeTab.onExportCSV(); return; }
    exportToCSV({ filename: fname, columns: exportCols, data: activeTab.data || [], totals: activeTab.totals || null });
  };
  const doExcel = () => {
    exportExcel({ filename: fname, sheets: [{
      name: activeTab.label,
      columns: exportCols.map((c) => ({ key: c.key, label: c.label || c.key, width: c.width ? c.width / 8 : undefined })),
      rows: (activeTab.data || []).map((r) => {
        const o = {}; exportCols.forEach((c) => { o[c.key] = fmtCell(c, r[c.key]); }); return o;
      }),
      total: activeTab.totals || null,
    }] });
  };
  const doPDF = () => {
    const align = (c) => (c.align === 'right' || c.type === 'currency' ? ' align="right"' : '');
    const head = `<tr>${exportCols.map((c) => `<th${align(c)}>${c.label || c.key}</th>`).join('')}</tr>`;
    const body = (activeTab.data || []).map((r) =>
      `<tr>${exportCols.map((c) => `<td${align(c)}>${fmtCell(c, r[c.key])}</td>`).join('')}</tr>`,
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
    <div className="pb-16">
      <ReportTitle
        title={title}
        subtitle={subtitle || `${activeTab.label} — ${businessProfile?.name || 'Business intelligence'}`}
        actions={<>
          {dateWindow && (
            <Seg ariaLabel="Period" value={dateWindow.preset}
              items={PRESETS.map((p) => ({ id: p.id, label: p.label }))}
              onChange={(id) => dateWindow.headerProps.onPreset(id)} />
          )}
          {actions}
          {!failed && <ExportMenu onExcel={doExcel} onPDF={doPDF} onCSV={doCSV} />}
        </>}
      />

      {allowedTabs.length > 1 && (
        <Tabs ariaLabel={`${title} views`} className="no-print -mt-1 mb-4 overflow-x-auto"
          items={allowedTabs.map((t) => ({ key: t.id, label: t.label }))}
          value={activeTab.id} onChange={setActiveId} />
      )}

      {failed ? (
        <ErrorBlock title={`${title} could not load`} message={String(failed)} onRetry={onRetry || activeTab.onRetry || null} />
      ) : (
        <>
          {kpis.length > 0 && (
            <Figures cols={4}>
              {kpis.map((c, i) => (
                <KpiCard key={c.id || i} label={c.label} value={kpiDisplay(c.label, c.value, formatCurrency)}
                  trend={c.trend} trendDir={c.trendDir} chartData={c.chartData} loading={loading} />
              ))}
            </Figures>
          )}

          <ChartPanel config={activeTab.chartConfig} loading={loading} />

          <ReportBox flush title={activeTab.label} sub={`${(activeTab.data || []).length} records`}>
            {/* key: columns, sort and paging belong to a tab. */}
            <ReportTable
              key={activeTab.id}
              columns={activeTab.columns || []}
              data={activeTab.data || []}
              loading={loading}
              totalsRow={activeTab.totals || null}
            />
          </ReportBox>
        </>
      )}
    </div>
  );
};

export default PremiumReportView;
