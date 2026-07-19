import React, { useMemo } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import {
  Tag, Package, TrendingUp, TrendingDown, DollarSign,
  Percent, Award, AlertTriangle, Layers, ShoppingCart, Barcode,
} from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';

/**
 * Product Profitability Report
 * ----------------------------
 * Margin-by-SKU analysis. Joins products (cost/price master) with sales.items
 * (what was actually sold & at what price) to compute:
 *
 *   units_sold     = Σ quantity across all sales.items matching productId
 *   revenue        = Σ (quantity × price)            ← realized sale price
 *   cogs           = Σ (quantity × product.costPrice) ← using current cost as proxy
 *   gross_profit   = revenue − cogs
 *   margin_pct     = gross_profit / revenue × 100
 *   avg_sell_price = revenue / units_sold
 *
 * Caveats:
 *  - `costPrice` is the CURRENT product cost, not the historical cost at time
 *    of sale. For a more accurate COGS we'd need a purchase ledger / moving
 *    average. Sufficient for an operational profitability view.
 *  - Products never sold in the date range appear with zero revenue but still
 *    show in the "Unsold Inventory" tab so you can spot dead stock.
 */

const PCT = (n) => `${(Number(n) || 0).toFixed(1)}%`;

// Classify margin tier for visual cues
const marginTier = (pct) => {
  if (pct >= 40) return { label: 'HIGH', color: 'emerald', chart: '#10b981' };
  if (pct >= 20) return { label: 'HEALTHY', color: 'sky', chart: '#0ea5e9' };
  if (pct >= 5)  return { label: 'THIN', color: 'amber', chart: '#f59e0b' };
  if (pct >= 0)  return { label: 'BREAK-EVEN', color: 'orange', chart: '#f97316' };
  return { label: 'LOSS', color: 'rose', chart: '#ef4444' };
};

const ProductProfitabilityReport = () => {
  const { data: products, loading: productsLoading } = useReportData({
    table: 'products',
    select: '*',
    dateColumn: 'created_at',
  });

  const { data: sales, loading: salesLoading } = useReportData({
    table: 'sales',
    select: 'id, date, items, status',
    dateColumn: 'date',
  });

  const loading = productsLoading || salesLoading;

  // --- Aggregate sales per product ---
  const perProduct = useMemo(() => {
    if (!products?.length) return [];

    // Build product lookup
    const productById = new Map();
    const productBySku = new Map();
    const productByName = new Map();
    products.forEach((p) => {
      productById.set(p.id, p);
      if (p.sku)  productBySku.set(String(p.sku).toLowerCase(), p);
      if (p.name) productByName.set(String(p.name).toLowerCase(), p);
    });

    // Seed accumulator with every product (so dead stock shows up too)
    const acc = {};
    products.forEach((p) => {
      acc[p.id] = {
        id: p.id,
        name: p.name || '(unnamed)',
        sku: p.sku || '—',
        category: p.category || 'Uncategorized',
        stock: Number(p.stock || 0),
        cost_price: Number(p.costPrice || 0),
        selling_price: Number(p.sellingPrice || 0),
        list_margin_pct:
          Number(p.sellingPrice || 0) > 0
            ? ((Number(p.sellingPrice || 0) - Number(p.costPrice || 0)) /
                Number(p.sellingPrice || 0)) * 100
            : 0,
        units_sold: 0,
        revenue: 0,
        cogs: 0,
        num_orders: 0,
      };
    });

    // Walk sales.items
    (sales || []).forEach((s) => {
      const status = String(s.status || '').toUpperCase();
      if (status === 'CANCELLED' || status === 'VOIDED' || status === 'FAILED' || status === 'REFUNDED') return;
      const items = Array.isArray(s.items) ? s.items : [];
      items.forEach((it) => {
        const qty = Number(it?.quantity ?? it?.qty ?? 0);
        const unitPrice = Number(it?.rate ?? it?.price ?? it?.unitPrice ?? it?.sellingPrice ?? 0);
        if (qty <= 0) return;

        // Resolve product — sale items may store the product key as
        // `productId` (current POS) or `id` (legacy / van sales), then
        // fall back to SKU and name.
        let prod = it?.productId ? productById.get(it.productId) : null;
        if (!prod && it?.id)   prod = productById.get(it.id);
        if (!prod && it?.sku)  prod = productBySku.get(String(it.sku).toLowerCase());
        if (!prod && it?.name) prod = productByName.get(String(it.name).toLowerCase());
        if (!prod) return; // unknown product — skip

        const bucket = acc[prod.id];
        if (!bucket) return;

        bucket.units_sold += qty;
        bucket.revenue += qty * unitPrice;
        bucket.cogs += qty * Number(prod.costPrice || 0);
        bucket.num_orders += 1;
      });
    });

    // Finalize derived fields
    return Object.values(acc).map((r) => {
      const gross_profit = round2(r.revenue - r.cogs);
      const margin_pct = r.revenue > 0 ? (gross_profit / r.revenue) * 100 : 0;
      const avg_sell_price = r.units_sold > 0 ? r.revenue / r.units_sold : 0;
      const tier = marginTier(margin_pct);
      return {
        ...r,
        revenue: round2(r.revenue),
        cogs: round2(r.cogs),
        gross_profit,
        margin_pct: round2(margin_pct),
        avg_sell_price: round2(avg_sell_price),
        list_margin_pct: round2(r.list_margin_pct),
        tier_label: tier.label,
        tier_color: tier.color,
      };
    });
  }, [products, sales]);

  // --- Split: active sellers vs dead stock ---
  const activeRows = useMemo(
    () => perProduct.filter((r) => r.units_sold > 0).sort((a, b) => b.gross_profit - a.gross_profit),
    [perProduct]
  );

  const deadStockRows = useMemo(
    () =>
      perProduct
        .filter((r) => r.units_sold === 0 && r.stock > 0)
        .sort((a, b) => b.stock * b.cost_price - a.stock * a.cost_price),
    [perProduct]
  );

  // --- Totals ---
  const totals = useMemo(() => {
    const revenue = activeRows.reduce((s, r) => s + r.revenue, 0);
    const cogs = activeRows.reduce((s, r) => s + r.cogs, 0);
    const gp = revenue - cogs;
    const units = activeRows.reduce((s, r) => s + r.units_sold, 0);
    const lossMakers = activeRows.filter((r) => r.margin_pct < 0).length;
    const blockbusters = [...activeRows].sort((a, b) => b.gross_profit - a.gross_profit).slice(0, 3);
    const bleeders = [...activeRows].filter((r) => r.margin_pct < 0).sort((a, b) => a.gross_profit - b.gross_profit).slice(0, 3);
    const deadCapital = deadStockRows.reduce((s, r) => s + r.stock * r.cost_price, 0);

    return {
      revenue: round2(revenue),
      cogs: round2(cogs),
      gross_profit: round2(gp),
      margin_pct: revenue > 0 ? round2((gp / revenue) * 100) : 0,
      units,
      active_skus: activeRows.length,
      loss_skus: lossMakers,
      blockbusters,
      bleeders,
      dead_capital: round2(deadCapital),
      dead_skus: deadStockRows.length,
    };
  }, [activeRows, deadStockRows]);

  // --- KPIs ---
  const kpis = useMemo(() => {
    const sparkline = activeRows.slice(0, 12).map((r) => ({ value: r.gross_profit }));
    return [
      {
        id: 'gp',
        label: 'Gross Profit',
        value: totals.gross_profit,
        trend: totals.margin_pct,
        trendDir: totals.gross_profit >= 0 ? 'up' : 'down',
        color: 'emerald',
        chartData: sparkline,
      },
      {
        id: 'margin',
        label: 'Blended Margin',
        value: `${totals.margin_pct.toFixed(1)}%`,
        trend: 2.5,
        trendDir: totals.margin_pct >= 20 ? 'up' : 'down',
        color: totals.margin_pct >= 20 ? 'sky' : 'amber',
        chartData: sparkline,
      },
      {
        id: 'units',
        label: 'Units Sold',
        value: totals.units,
        trend: 4.8,
        trendDir: 'up',
        color: 'indigo',
        chartData: activeRows.slice(0, 12).map((r) => ({ value: r.units_sold })),
      },
      {
        id: 'loss',
        label: 'Loss-making SKUs',
        value: totals.loss_skus,
        trend: totals.loss_skus,
        trendDir: totals.loss_skus > 0 ? 'up' : 'down',
        color: totals.loss_skus > 0 ? 'rose' : 'emerald',
        chartData: sparkline.slice(0, 6),
      },
    ];
  }, [totals, activeRows]);

  // --- Category rollup (for bar chart) ---
  const categoryRollup = useMemo(() => {
    const byCat = {};
    activeRows.forEach((r) => {
      if (!byCat[r.category]) byCat[r.category] = { name: r.category, revenue: 0, gross_profit: 0 };
      byCat[r.category].revenue += r.revenue;
      byCat[r.category].gross_profit += r.gross_profit;
    });
    return Object.values(byCat).sort((a, b) => b.gross_profit - a.gross_profit);
  }, [activeRows]);

  // --- Margin tier cell renderer ---
  const renderTier = (label) => {
    const tierConfig = {
      HIGH:       { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: '#10b981' },
      HEALTHY:    { bg: 'bg-sky-50',     text: 'text-sky-600',     dot: '#0ea5e9' },
      THIN:       { bg: 'bg-accent-signature/10',   text: 'text-accent-signature',   dot: '#f59e0b' },
      'BREAK-EVEN': { bg: 'bg-orange-50', text: 'text-orange-600', dot: '#f97316' },
      LOSS:       { bg: 'bg-rose-50',    text: 'text-rose-600',    dot: '#ef4444' },
    };
    const c = tierConfig[label] || tierConfig.THIN;
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase ${c.bg} ${c.text}`}>
        <div className="w-1 h-1 rounded-full" style={{ backgroundColor: c.dot }} />
        {label}
      </div>
    );
  };

  // ---- Tab 1: SKU Profitability (active sellers) ----
  const profitabilityTab = {
    id: 'SKU_PROFITABILITY',
    label: 'SKU Margin',
    icon: <Tag size={18} />,
    data: activeRows,
    loading,
    totals: {
      units_sold: totals.units,
      revenue: totals.revenue,
      cogs: totals.cogs,
      gross_profit: totals.gross_profit,
    },
    columns: [
      {
        key: 'name',
        label: 'Product',
        sortable: true,
        width: 240,
        render: (val, row) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span>
            <span className="text-[9px] text-gray-400 font-mono">{row.sku}</span>
          </div>
        ),
      },
      {
        key: 'category',
        label: 'Category',
        sortable: true,
        width: 140,
        render: (val) => <span className="text-[10px] font-bold text-gray-500 uppercase">{val}</span>,
      },
      {
        key: 'units_sold',
        label: 'Units Sold',
        align: 'right',
        sortable: true,
        width: 110,
        render: (val) => <span className="font-black tabular-nums">{val.toLocaleString('en-IN')}</span>,
      },
      {
        key: 'avg_sell_price',
        label: 'Avg Price',
        align: 'right',
        sortable: true,
        width: 120,
        render: (val) => <span className="text-[10px] font-bold text-gray-500 tabular-nums">{formatINR(val)}</span>,
      },
      {
        key: 'cost_price',
        label: 'Unit Cost',
        align: 'right',
        sortable: true,
        width: 110,
        render: (val) => <span className="text-[10px] text-gray-400 tabular-nums">{formatINR(val)}</span>,
      },
      {
        key: 'revenue',
        label: 'Revenue',
        type: 'currency',
        align: 'right',
        sortable: true,
        width: 140,
        render: (val) => <span className="font-black text-ink-primary tabular-nums">{formatINR(val)}</span>,
      },
      {
        key: 'cogs',
        label: 'COGS',
        type: 'currency',
        align: 'right',
        sortable: true,
        width: 130,
        render: (val) => <span className="text-gray-500 tabular-nums">{formatINR(val)}</span>,
      },
      {
        key: 'gross_profit',
        label: 'Gross Profit',
        type: 'currency',
        align: 'right',
        sortable: true,
        width: 140,
        render: (val) => (
          <span className={`font-black tabular-nums ${val >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatINR(val)}
          </span>
        ),
      },
      {
        key: 'margin_pct',
        label: 'Margin',
        align: 'right',
        sortable: true,
        width: 100,
        render: (val) => (
          <span className={`font-black tabular-nums ${val >= 20 ? 'text-emerald-600' : val >= 5 ? 'text-accent-signature' : 'text-rose-600'}`}>
            {PCT(val)}
          </span>
        ),
      },
      {
        key: 'tier_label',
        label: 'Tier',
        width: 130,
        render: (val) => renderTier(val),
      },
    ],
    kpis,
    chartConfig: {
      title: 'Gross Profit by Category',
      type: 'bar',
      data: categoryRollup,
      series: [
        { key: 'gross_profit', name: 'Gross Profit', color: '#10b981' },
        { key: 'revenue', name: 'Revenue', color: 'var(--color-accent-signature)' },
      ],
    },
    detailFields: [
      { key: 'gross_profit', label: 'Gross Profit', type: 'currency', isHero: true },
      { key: 'name', label: 'Product', icon: <Package size={12} /> },
      { key: 'sku', label: 'SKU', icon: <Barcode size={12} /> },
      { key: 'category', label: 'Category', icon: <Layers size={12} /> },
      { key: 'units_sold', label: 'Units Sold', icon: <ShoppingCart size={12} /> },
      { key: 'avg_sell_price', label: 'Avg Sell Price', type: 'currency' },
      { key: 'cost_price', label: 'Current Cost', type: 'currency' },
      { key: 'selling_price', label: 'List Price', type: 'currency' },
      { key: 'revenue', label: 'Revenue', type: 'currency', icon: <DollarSign size={12} /> },
      { key: 'cogs', label: 'COGS', type: 'currency' },
      { key: 'margin_pct', label: 'Realized Margin %', icon: <Percent size={12} /> },
      { key: 'list_margin_pct', label: 'List Margin %' },
      { key: 'stock', label: 'Current Stock' },
    ],
  };

  // ---- Tab 2: Unsold Inventory ----
  const deadStockTab = {
    id: 'DEAD_STOCK',
    label: 'Dead Stock',
    icon: <AlertTriangle size={18} />,
    data: deadStockRows,
    loading,
    totals: {
      stock: deadStockRows.reduce((s, r) => s + r.stock, 0),
      capital_locked: totals.dead_capital,
    },
    columns: [
      {
        key: 'name',
        label: 'Product',
        sortable: true,
        width: 260,
        render: (val, row) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span>
            <span className="text-[9px] text-gray-400 font-mono">{row.sku}</span>
          </div>
        ),
      },
      { key: 'category', label: 'Category', sortable: true, width: 140 },
      { key: 'stock', label: 'On Hand', align: 'right', sortable: true, width: 100, render: (v) => <span className="font-black tabular-nums">{v}</span> },
      { key: 'cost_price', label: 'Unit Cost', type: 'currency', align: 'right', sortable: true, width: 120, render: (v) => formatINR(v) },
      {
        key: 'capital_locked',
        label: 'Capital Locked',
        align: 'right',
        sortable: true,
        width: 160,
        render: (_, row) => (
          <span className="font-black text-rose-600 tabular-nums">
            {formatINR(row.stock * row.cost_price)}
          </span>
        ),
      },
      {
        key: 'selling_price',
        label: 'List Price',
        type: 'currency',
        align: 'right',
        sortable: true,
        width: 120,
        render: (v) => <span className="text-gray-500 tabular-nums">{formatINR(v)}</span>,
      },
    ],
    kpis: [
      {
        id: 'capital',
        label: 'Capital Locked',
        value: totals.dead_capital,
        trend: totals.dead_skus,
        trendDir: 'up',
        color: 'rose',
        chartData: deadStockRows.slice(0, 10).map((r) => ({ value: r.stock * r.cost_price })),
      },
      {
        id: 'count',
        label: 'Dead SKUs',
        value: totals.dead_skus,
        trend: 0,
        trendDir: 'none',
        color: 'amber',
        chartData: [],
      },
    ],
    chartConfig: {
      title: 'Top Capital-Locked SKUs',
      type: 'bar',
      data: deadStockRows.slice(0, 10).map((r) => ({ name: r.name, value: round2(r.stock * r.cost_price) })),
      series: [{ key: 'value', name: 'Capital Locked', color: '#ef4444' }],
    },
    detailFields: [
      { key: 'name', label: 'Product', icon: <Package size={12} /> },
      { key: 'sku', label: 'SKU', icon: <Barcode size={12} /> },
      { key: 'category', label: 'Category' },
      { key: 'stock', label: 'Units On Hand' },
      { key: 'cost_price', label: 'Unit Cost', type: 'currency' },
      { key: 'selling_price', label: 'List Price', type: 'currency' },
    ],
  };

  // Only show dead stock tab if there is any
  const tabs = deadStockRows.length > 0 ? [profitabilityTab, deadStockTab] : [profitabilityTab];

  return <PremiumReportView title="Product Profitability" tabs={tabs} />;
};

export default ProductProfitabilityReport;
