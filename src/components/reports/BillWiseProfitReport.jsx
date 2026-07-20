/**
 * BillWiseProfitReport — one row per sale: revenue, cost, profit, margin.
 * Item revenue = qty * rate (fallback sellingPrice). Item cost = qty * costPrice.
 */
import React, { useState, useMemo } from 'react';
import useReportData from './useReportData';
import { StatStrip } from './ReportBits';
import ReportHeader from './ReportHeader';
import ReportFilterRow from './ReportFilterRow';
import PLTieOut from './PLTieOut';
import { isCountableSale, presetRange } from './reportUtils';
import { formatCurrency } from '../../lib/utils';
import DataTable, { inr, pct, signedColour } from '../ui/DataTable';

function calcItemRevenue(item) {
  const qty  = Number(item.quantity || 0);
  const rate = Number(item.rate || item.sellingPrice || 0);
  return qty * rate;
}

function calcItemCost(item, costById) {
  const qty = Number(item.quantity || 0);
  // Sale items rarely store costPrice — resolve from the products table.
  const unit = Number(item.costPrice) ||
    costById[item.id] || costById[item.productId] || 0;
  return qty * unit;
}

const BillWiseProfitReport = () => {
  const [preset, setPreset]       = useState('TODAY');
  const [range,  setRange]        = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);
  const [q,           setQ]           = useState('');
  const [customer,    setCustomer]    = useState('ALL');
  const [outcome,     setOutcome]     = useState('ALL');

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: salesRaw, loading } = useReportData({
    table: 'sales', select: 'id, date, totalAmount, totalCogs, customerInfo, shopId, items, status, paymentStatus, voided_at',
    dateColumn: 'date', filters,
  });
  // Voided / cancelled sales owe nothing — keep them out of profit rows.
  const sales = useMemo(() => salesRaw.filter(isCountableSale), [salesRaw]);
  const { data: products } = useReportData({ table: 'products', select: 'id, costPrice' });
  // FIFO actual costs from batch consumption (where available). Per-sale
  // COGS uses these first, falls back to products.costPrice otherwise.
  const { data: consumption } = useReportData({
    table: 'sale_batch_consumption', select: 'sale_id, qty_taken, unit_cost',
  });

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };

  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  const { allRows } = useMemo(() => {
    const costById = {};
    products.forEach(p => { costById[p.id] = Number(p.costPrice || 0); });
    // sale_id → actual FIFO COGS from batch consumption rows.
    const fifoBySale = {};
    (consumption || []).forEach(c => {
      const v = Number(c.qty_taken || 0) * Number(c.unit_cost || 0);
      fifoBySale[c.sale_id] = (fifoBySale[c.sale_id] || 0) + v;
    });
    const rows = sales.map(s => {
      const items   = Array.isArray(s.items) ? s.items : [];
      // totalAmount is the post-discount amount actually billed — summing
      // qty×rate overstated revenue (and profit) by every bill discount.
      const revenue = Number(s.totalAmount)
        || items.reduce((acc, it) => acc + calcItemRevenue(it), 0);
      // sales.totalCogs is the source of truth (process_sale computes it,
      // including the cost-price fallback for unbatched stock). The batch
      // rows alone undercount when only part of a sale had batch coverage.
      const stored = Number(s.totalCogs);
      const cost = Number.isFinite(stored) && stored > 0
        ? stored
        : fifoBySale[s.id] != null
          ? fifoBySale[s.id]
          : items.reduce((acc, it) => acc + calcItemCost(it, costById), 0);
      const profit  = revenue - cost;
      const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;
      const customer = s.customerInfo?.name || 'Walk-in';
      const ref      = (s.id || '').toUpperCase(); // id already SAL-prefixed — no double wrap / truncation
      return { date: s.date || '', ref, customer, revenue, cost, profit, margin };
    }).sort((a, b) => b.date.localeCompare(a.date));

    return { allRows: rows };
  }, [sales, products, consumption]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allRows.filter(r => {
      if (customer !== 'ALL' && r.customer !== customer) return false;
      if (outcome === 'LOSS'   && r.profit >= 0) return false;
      if (outcome === 'PROFIT' && r.profit < 0)  return false;
      if (!needle) return true;
      return r.ref.toLowerCase().includes(needle) || r.customer.toLowerCase().includes(needle);
    });
  }, [allRows, q, customer, outcome]);

  // Totals reflect the filtered set: filtering to loss-making bills should
  // total those bills, not the whole period.
  const totals = useMemo(() => {
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalCost    = rows.reduce((s, r) => s + r.cost, 0);
    const totalProfit  = totalRevenue - totalCost;
    return { totalRevenue, totalCost, totalProfit,
             blendedMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0 };
  }, [rows]);

  const customerOptions = useMemo(() => {
    const m = new Map();
    allRows.forEach(r => m.set(r.customer, (m.get(r.customer) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1])
      .map(([value, n]) => ({ value, label: `${value} (${n})` }));
  }, [allRows]);

  const lossCount = useMemo(() => allRows.filter(r => r.profit < 0).length, [allRows]);
  const clearFilters = () => { setQ(''); setCustomer('ALL'); setOutcome('ALL'); };

  const exportCSV = () => {
    const r = [
      ['Date','Reference','Customer','Revenue','Cost','Profit','Margin %'],
      ...rows.map(r => [r.date, r.ref, r.customer, r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(1)+'%']),
    ];
    const csv  = r.map(row => row.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `billwise_profit_${range.start}_${range.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pb-16">
      <ReportHeader
        title="Bill-wise Profit"
        subtitle={`${range.start === range.end ? range.start : `${range.start} → ${range.end}`}${loading ? '' : ` · ${rows.length} bill${rows.length === 1 ? '' : 's'}`}`}
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

      <ReportFilterRow
        search={q}
        onSearch={setQ}
        searchPlaceholder="Bill number or customer"
        selects={[
          { key: 'customer', label: 'All customers', value: customer, onChange: setCustomer, options: customerOptions },
          { key: 'outcome',  label: 'All bills',     value: outcome,  onChange: setOutcome,
            options: [
              { value: 'LOSS',   label: `Sold at a loss${lossCount ? ` (${lossCount})` : ''}` },
              { value: 'PROFIT', label: 'Profitable' },
            ] },
        ]}
        resultCount={rows.length}
        totalCount={allRows.length}
        onClear={clearFilters}
      />

      <StatStrip loading={loading} items={[
        { label: 'Revenue',       value: formatCurrency(totals.totalRevenue) },
        { label: 'Cost of goods', value: formatCurrency(totals.totalCost) },
        { label: 'Gross profit',  value: formatCurrency(totals.totalProfit), tone: totals.totalProfit >= 0 ? 'pos' : 'neg' },
        { label: 'Margin',        value: `${totals.blendedMargin.toFixed(1)}%` },
      ]} />

      <DataTable
        emptyMessage={loading ? 'Loading bills…' : 'No bills in this period.'}
        columns={[
          { key: 'date',     label: 'Date',      align: 'left'  },
          { key: 'ref',      label: 'Reference', align: 'left'  },
          { key: 'customer', label: 'Customer',  align: 'left'  },
          { key: 'revenue',  label: 'Revenue',   align: 'right', numeric: true, fmt: inr },
          { key: 'cost',     label: 'COGS',      align: 'right', numeric: true, fmt: inr },
          { key: 'profit',   label: 'Gross Profit', align: 'right', numeric: true,
            fmt: inr, className: signedColour },
          { key: 'margin',   label: 'Margin',    align: 'right', numeric: true,
            fmt: pct, className: signedColour },
        ]}
        rows={rows}
        getRowKey={(r) => r.ref}
        totalsRow={{ date: 'Totals', revenue: totals.totalRevenue, cost: totals.totalCost, profit: totals.totalProfit, margin: totals.blendedMargin }}
      />
      <PLTieOut from={range.start} to={range.end} revenue={totals.totalRevenue} cogs={totals.totalCost}
        note="Differences are usually sales returns in the period." />
    </div>
  );
};

export default BillWiseProfitReport;
