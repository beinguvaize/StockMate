import React, { useMemo } from 'react';
import useReportData from './useReportData';
import useDateWindow from './useDateWindow';
import ReportShell from './ReportShell';
import { PRESETS } from './reportUtils';
import {
  TrendingUp, Award, Package, BarChart2, ShoppingBag,
} from 'lucide-react';

/* ─── Currency symbol ────────────────────────────────────────────────────── */
const sym = '₹';
const fmt = (n) =>
  `${sym}${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const payBadge = (method) => {
  const m = (method || 'CASH').toUpperCase();
  const colors = {
    CASH:   'bg-emerald-50 text-emerald-700 border-emerald-100',
    CREDIT: 'bg-accent-signature/10   text-accent-signature-hover   border-accent-signature/15',
    BANK:   'bg-blue-50    text-blue-700    border-blue-100',
    UPI:    'bg-accent-signature/10  text-accent-signature-hover  border-accent-signature/15',
  };
  const cls = colors[m] || 'bg-muted text-ink-secondary border-border';
  return (
    <span className={`inline-block text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border ${cls}`}>
      {m}
    </span>
  );
};

const statusBadge = (status) => {
  const s = (status || 'PAID').toUpperCase();
  const cls = s === 'PAID'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : 'bg-accent-signature/10 text-accent-signature-hover border-accent-signature/15';
  return (
    <span className={`inline-block text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border ${cls}`}>
      {s}
    </span>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   SalesReport
   ════════════════════════════════════════════════════════════════════════════ */
const SalesReport = () => {
  // Financial year to date by default; the query was previously unfiltered.
  const win = useDateWindow('YEAR');
  const { data: sales, loading } = useReportData({
    table: 'sales',
    select: '*',
    dateColumn: 'date',
    filters: win.filters,
  });

  const { data: clients } = useReportData({
    table: 'clients',
    select: 'id, name',
    nullFilters: { deleted_at: null },
  });

  /* ── 1. Overview metrics ─────────────────────────────────────────────── */
  const overviewMetrics = useMemo(() => {
    if (!sales.length) return { kpis: [], chartData: [], totalRevenue: 0, totalOrders: 0 };

    const totalRevenue   = sales.reduce((s, x) => s + Number(x.totalAmount || 0), 0);
    const totalCogs      = sales.reduce((s, x) => s + Number(x.totalCogs   || 0), 0);
    const totalOrders    = sales.length;
    const aov            = totalOrders ? totalRevenue / totalOrders : 0;
    const margin         = totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0;

    /* daily trend */
    const byDate = {};
    sales.forEach(s => {
      const d = s.date || 'Unknown';
      if (!byDate[d]) byDate[d] = { name: d, revenue: 0, orders: 0, cogs: 0 };
      byDate[d].revenue += Number(s.totalAmount || 0);
      byDate[d].cogs    += Number(s.totalCogs   || 0);
      byDate[d].orders  += 1;
    });
    const chartData = Object.values(byDate).sort((a, b) => a.name.localeCompare(b.name));

    /* payment method split */
    const byMethod = {};
    sales.forEach(s => {
      const m = (s.paymentMethod || 'CASH').toUpperCase();
      byMethod[m] = (byMethod[m] || 0) + Number(s.totalAmount || 0);
    });
    const topMethod = Object.entries(byMethod).sort((a, b) => b[1] - a[1])[0];

    const kpis = [
      {
        id: 'rev', label: 'Total Revenue', value: totalRevenue, trend: 0, trendDir: 'none',
        chartData: chartData.map(d => ({ value: d.revenue })), color: 'indigo',
      },
      {
        id: 'ord', label: 'Total Orders', value: totalOrders, trend: 0, trendDir: 'none',
        chartData: chartData.map(d => ({ value: d.orders })), color: 'emerald',
      },
      {
        id: 'aov', label: 'Avg. Order Value', value: aov, trend: 0, trendDir: 'none',
        chartData: chartData.map(d => ({ value: d.revenue / (d.orders || 1) })), color: 'amber',
      },
      {
        id: 'mar', label: 'Gross Margin', value: `${margin.toFixed(1)}%`, trend: 0, trendDir: 'none',
        chartData: chartData.map(d => ({ value: d.revenue - d.cogs })), color: 'rose',
      },
    ];

    return { kpis, chartData, totalRevenue, totalOrders, topMethod: topMethod?.[0] || 'CASH' };
  }, [sales]);

  /* ── 2. Daily product breakdown ─────────────────────────────────────── */
  const dailyBreakdownRows = useMemo(() => {
    const rows = [];
    sales.forEach(sale => {
      const items = Array.isArray(sale.items) ? sale.items : [];
      if (items.length === 0) {
        rows.push({
          _id:           sale.id + '_empty',
          date:          sale.date,
          saleRef:       sale.id,
          productName:   '—',
          quantity:      0,
          rate:          0,
          lineTotal:     0,
          paymentMethod: sale.paymentMethod,
          paymentStatus: sale.paymentStatus,
        });
      } else {
        items.forEach((item, idx) => {
          rows.push({
            _id:           `${sale.id}_${idx}`,
            date:          sale.date,
            saleRef:       sale.id,
            productName:   item.name || item.productName || 'Unknown Product',
            quantity:      Number(item.quantity || 0),
            rate:          Number(item.rate || item.sellingPrice || 0),
            lineTotal:     Number(item.quantity || 0) * Number(item.rate || 0),
            paymentMethod: sale.paymentMethod,
            paymentStatus: sale.paymentStatus,
          });
        });
      }
    });
    return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [sales]);

  /* ── 3. Product performance ──────────────────────────────────────────── */
  const productPerformance = useMemo(() => {
    const map = {};
    sales.forEach(sale => {
      const items = Array.isArray(sale.items) ? sale.items : [];
      items.forEach(item => {
        const key = item.id || item.name || 'unknown';
        if (!map[key]) {
          map[key] = {
            _id:         key,
            productName: item.name || 'Unknown',
            totalQty:    0,
            totalRev:    0,
            txCount:     0,
            avgRate:     0,
          };
        }
        map[key].totalQty += Number(item.quantity || 0);
        map[key].totalRev += Number(item.quantity || 0) * Number(item.rate || 0);
        map[key].txCount  += 1;
      });
    });
    return Object.values(map)
      .map(p => ({ ...p, avgRate: p.txCount ? p.totalRev / p.totalQty : 0 }))
      .sort((a, b) => b.totalRev - a.totalRev)
      .map((p, i) => ({ ...p, _rank: i + 1 }));
  }, [sales]);

  const totalRevForShare = overviewMetrics.totalRevenue;

  /* ── 4. Client leaderboard ───────────────────────────────────────────── */
  const clientLeaderboard = useMemo(() => {
    const map = {};
    sales.forEach(s => {
      const clientId = s.customerInfo?.id || s.customerInfo?.clientId || s.shopId || null;
      const name = (clientId && clients.find(c => c.id === clientId)?.name)
        || s.customerInfo?.name
        || 'Walk-in';
      const key = clientId || `walkin_${name}`;
      if (!map[key]) map[key] = { _id: key, name, revenue: 0, count: 0 };
      map[key].revenue += Number(s.totalAmount || 0);
      map[key].count   += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 100)
      .map((c, i) => ({ ...c, _rank: i + 1 }));
  }, [sales, clients]);

  /* ══════════════════════════════════════════════════════════════════════
     TAB DEFINITIONS
     ══════════════════════════════════════════════════════════════════════ */

  /* ── Tab 1: Sales Overview ─────────────────────────────────────────── */
  const overviewTab = {
    id: 'SALES_OVERVIEW',
    label: 'Overview',
    icon: <TrendingUp size={15} />,
    data: sales,
    loading,
    totals: {
      totalAmount: overviewMetrics.totalRevenue,
      totalCogs: sales.reduce((s, x) => s + Number(x.totalCogs || 0), 0),
    },
    kpis: overviewMetrics.kpis,
    chartConfig: {
      title: 'Daily Revenue Trend',
      type: 'area',
      data: overviewMetrics.chartData,
      series: [
        { key: 'revenue', name: 'Revenue',  color: 'var(--color-accent-signature)' },
        { key: 'cogs',    name: 'COGS',     color: '#f59e0b' },
      ],
    },
    columns: [
      {
        key: 'date', label: 'Date', type: 'date', sortable: true, width: 130,
      },
      {
        key: 'id', label: 'Invoice #', sortable: false, width: 130,
        render: (val) => (
          <span className="tabular-nums text-[10px] bg-canvas px-2 py-0.5 rounded border border-border/60 uppercase font-semibold text-ink-secondary">
            #{(val || '').slice(-6).toUpperCase()}
          </span>
        ),
      },
      {
        key: 'customerInfo', label: 'Customer', width: 180,
        render: (val, row) => {
          const name = val?.name
            || (row.shopId && clients.find(c => c.id === row.shopId)?.name)
            || 'Walk-in';
          return (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-accent-signature/15 flex items-center justify-center text-[9px] font-semibold text-accent-signature shrink-0">
                {(name[0] || 'W').toUpperCase()}
              </div>
              <span className="font-semibold text-foreground truncate">{name}</span>
            </div>
          );
        },
      },
      {
        key: 'items', label: 'Items', width: 60, align: 'center',
        render: (val) => (
          <span className="tabular-nums font-semibold text-ink-secondary text-[11px]">
            {Array.isArray(val) ? val.length : '—'}
          </span>
        ),
      },
      { key: 'totalAmount', label: 'Amount',        type: 'currency', align: 'right', sortable: true, width: 140 },
      {
        key: 'paymentMethod', label: 'Method', width: 110, align: 'center',
        render: (val) => payBadge(val),
      },
      {
        key: 'paymentStatus', label: 'Status', width: 100, align: 'center',
        render: (val) => statusBadge(val),
      },
    ],
    detailFields: [
      { key: 'totalAmount', label: 'Sale Amount',     type: 'currency', isHero: true },
      { key: 'date',        label: 'Date',            type: 'date' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'paymentStatus', label: 'Status' },
      { key: 'note',        label: 'Note' },
    ],
  };

  /* ── Tab 2: Daily Breakdown ────────────────────────────────────────── */
  /* Per-date, per-product flat table */
  const dailyByDate = useMemo(() => {
    const map = {};
    dailyBreakdownRows.forEach(r => {
      if (!map[r.date]) map[r.date] = { date: r.date, revenue: 0, units: 0, txCount: 0 };
      map[r.date].revenue += r.lineTotal;
      map[r.date].units   += r.quantity;
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [dailyBreakdownRows]);

  const dailyTab = {
    id: 'DAILY_BREAKDOWN',
    label: 'Daily Breakdown',
    icon: <BarChart2 size={15} />,
    data: dailyBreakdownRows,
    loading,
    totals: {
      lineTotal: dailyBreakdownRows.reduce((s, r) => s + r.lineTotal, 0),
      quantity:  dailyBreakdownRows.reduce((s, r) => s + r.quantity, 0),
    },
    kpis: [
      {
        id: 'days',  label: 'Sales Days', value: dailyByDate.length,
        trend: 0, trendDir: 'none', color: 'indigo',
        chartData: dailyByDate.map(d => ({ value: d.revenue })),
      },
      {
        id: 'units', label: 'Units Sold', value: dailyBreakdownRows.reduce((s, r) => s + r.quantity, 0),
        trend: 0, trendDir: 'none', color: 'emerald',
        chartData: dailyByDate.map(d => ({ value: d.units })),
      },
      {
        id: 'avgday', label: 'Avg Daily Rev', value: dailyByDate.length
          ? dailyByDate.reduce((s, d) => s + d.revenue, 0) / dailyByDate.length
          : 0,
        trend: 0, trendDir: 'none', color: 'amber',
        chartData: dailyByDate.map(d => ({ value: d.revenue })),
      },
    ],
    chartConfig: {
      title: 'Daily Units Sold',
      type: 'bar',
      data: dailyByDate.map(d => ({ name: d.date, value: d.units })),
      series: [{ key: 'value', name: 'Units', color: '#10b981' }],
    },
    columns: [
      { key: 'date',          label: 'Date',    type: 'date', sortable: true, width: 130 },
      {
        key: 'saleRef', label: 'Sale #', width: 110,
        render: (val) => (
          <span className="tabular-nums text-[10px] text-ink-tertiary uppercase">
            #{(val || '').slice(-6).toUpperCase()}
          </span>
        ),
      },
      {
        key: 'productName', label: 'Product', sortable: true, width: 220,
        render: (val) => (
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-accent-signature/10 flex items-center justify-center shrink-0">
              <Package size={9} className="text-accent-signature" />
            </div>
            <span className="font-semibold text-foreground">{val}</span>
          </div>
        ),
      },
      { key: 'quantity',      label: 'Qty',     align: 'right', sortable: true, width: 80,
        render: (val) => <span className="tabular-nums font-semibold text-foreground">{val}</span> },
      { key: 'rate',          label: 'Rate',     type: 'currency', align: 'right', width: 110 },
      { key: 'lineTotal',     label: 'Amount',   type: 'currency', align: 'right', sortable: true, width: 130 },
      {
        key: 'paymentMethod', label: 'Method', width: 100, align: 'center',
        render: (val) => payBadge(val),
      },
    ],
  };

  /* ── Tab 3: Product Performance ──────────────────────────────────────── */
  const productTab = {
    id: 'PRODUCT_PERFORMANCE',
    label: 'Top Products',
    icon: <Package size={15} />,
    data: productPerformance,
    loading,
    totals: {
      totalRev: productPerformance.reduce((s, p) => s + p.totalRev, 0),
      totalQty: productPerformance.reduce((s, p) => s + p.totalQty, 0),
    },
    kpis: [
      {
        id: 'prods', label: 'Products Sold', value: productPerformance.length,
        trend: 0, trendDir: 'none', color: 'indigo',
        chartData: productPerformance.slice(0, 7).map(p => ({ value: p.totalRev })),
      },
      {
        id: 'top_rev', label: 'Top Product Revenue',
        value: productPerformance[0]?.totalRev || 0,
        trend: 0, trendDir: 'none', color: 'emerald',
        chartData: productPerformance.slice(0, 7).map(p => ({ value: p.totalRev })),
      },
      {
        id: 'top_qty', label: 'Highest Volume',
        value: [...productPerformance].sort((a, b) => b.totalQty - a.totalQty)[0]?.totalQty || 0,
        trend: 0, trendDir: 'none', color: 'amber',
        chartData: productPerformance.slice(0, 7).map(p => ({ value: p.totalQty })),
      },
    ],
    chartConfig: {
      title: 'Top 10 Products by Revenue',
      type: 'bar',
      data: productPerformance.slice(0, 10).map(p => ({ name: p.productName, value: p.totalRev })),
      series: [{ key: 'value', name: 'Revenue', color: 'var(--color-accent-signature)' }],
    },
    columns: [
      {
        key: '_rank', label: '#', width: 50, align: 'center',
        render: (val) => (
          <span className={`font-semibold tabular-nums text-sm ${
            val === 1 ? 'text-accent-signature' : val === 2 ? 'text-muted-foreground' : val === 3 ? 'text-accent-signature-hover' : 'text-ink-tertiary'
          }`}>
            {val}
          </span>
        ),
      },
      {
        key: 'productName', label: 'Product', sortable: true, width: 250,
        render: (val, row) => (
          <div className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              row._rank <= 3 ? 'bg-accent-signature/15' : 'bg-canvas'
            }`}>
              <ShoppingBag size={12} className={row._rank <= 3 ? 'text-accent-signature' : 'text-ink-tertiary'} />
            </div>
            <span className="font-semibold text-foreground">{val}</span>
          </div>
        ),
      },
      {
        key: 'totalQty', label: 'Units Sold', align: 'right', sortable: true, width: 120,
        render: (val) => <span className="tabular-nums font-semibold text-foreground tabular-nums">{val}</span>,
      },
      {
        key: 'txCount', label: 'Transactions', align: 'right', sortable: true, width: 130,
        render: (val) => <span className="tabular-nums text-ink-secondary">{val}</span>,
      },
      { key: 'avgRate', label: 'Avg. Rate',    type: 'currency', align: 'right', sortable: true, width: 120 },
      { key: 'totalRev', label: 'Total Revenue', type: 'currency', align: 'right', sortable: true, width: 150 },
      {
        key: '_share', label: 'Revenue Share', align: 'right', width: 140,
        render: (_, row) => {
          const pct = totalRevForShare > 0 ? (row.totalRev / totalRevForShare) * 100 : 0;
          return (
            <div className="flex items-center gap-2 justify-end">
              <div className="w-16 h-1.5 rounded-full bg-canvas overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-signature"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-accent-signature tabular-nums w-10 text-right">
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        },
      },
    ],
  };

  /* ── Tab 4: Client Board ─────────────────────────────────────────────── */
  const clientTab = {
    id: 'CLIENT_LEADERBOARD',
    label: 'Client Board',
    icon: <Award size={15} />,
    data: clientLeaderboard,
    loading,
    totals: { revenue: overviewMetrics.totalRevenue },
    kpis: [
      {
        id: 'accts', label: 'Unique Accounts', value: clientLeaderboard.length,
        trend: 0, trendDir: 'none', color: 'indigo',
        chartData: clientLeaderboard.slice(0, 7).map(c => ({ value: c.revenue })),
      },
      {
        id: 'top_acct', label: 'Top Account Rev', value: clientLeaderboard[0]?.revenue || 0,
        trend: 0, trendDir: 'none', color: 'emerald',
        chartData: clientLeaderboard.slice(0, 7).map(c => ({ value: c.revenue })),
      },
    ],
    chartConfig: {
      title: 'Revenue by Account',
      type: 'bar',
      data: clientLeaderboard.slice(0, 10).map(c => ({ name: c.name, value: c.revenue })),
      series: [{ key: 'value', name: 'Revenue', color: 'var(--color-accent-signature)' }],
    },
    columns: [
      {
        key: 'name', label: 'Client', sortable: true, width: 240,
        render: (val, row) => (
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 ${
              row._rank === 1 ? 'bg-accent-signature/15 text-accent-signature-hover'
              : row._rank === 2 ? 'bg-muted text-ink-secondary'
              : 'bg-accent-signature/15 text-accent-signature'
            }`}>
              {(val || 'W')[0].toUpperCase()}
            </div>
            <span className="font-semibold text-foreground">{val}</span>
          </div>
        ),
      },
      {
        key: 'count', label: 'Orders', align: 'right', sortable: true, width: 110,
        render: (val) => <span className="tabular-nums font-semibold text-ink-secondary">{val}</span>,
      },
      { key: 'revenue', label: 'Total Revenue', type: 'currency', align: 'right', sortable: true, width: 160 },
      {
        key: '_share', label: 'Share', align: 'right', width: 120,
        render: (_, row) => {
          const pct = totalRevForShare > 0 ? (row.revenue / totalRevForShare) * 100 : 0;
          return (
            <span className="text-[10px] font-semibold text-accent-signature">{pct.toFixed(1)}%</span>
          );
        },
      },
    ],
  };

  // ReportShell has no filter slot, so the window is surfaced above it —
  // otherwise the report would be silently filtered with no way to widen it.
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted-foreground">Showing {win.subtitle}</p>
        <div className="flex items-center bg-muted rounded-lg p-0.5 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => win.headerProps.onPreset(p.id)}
              className={`px-3 py-1.5 rounded-md text-[11px] transition-colors ${
                win.preset === p.id
                  ? 'bg-card text-foreground font-semibold shadow-sm'
                  : 'text-muted-foreground font-medium hover:text-foreground'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <ReportShell tabs={[overviewTab, dailyTab, productTab, clientTab]} />
    </div>
  );
};

export default SalesReport;
