/**
 * AllTransactionsReport — unified chronological ledger.
 * Sources: sales (money in), client_payments (money in), purchases (money out), expenses (money out).
 * Expenses columns: id, date, amount, category, note (falls back gracefully if columns differ).
 */
import React, { useState, useMemo } from 'react';
import {
  ArrowDownLeft, ArrowUpRight,
  TrendingUp, TrendingDown, Activity, Hash,
} from 'lucide-react';
import useReportData from './useReportData';
import ReportHeader from './ReportHeader';
import ReportFilterRow from './ReportFilterRow';
import { KPI, SectionHead } from './ReportBits';
import { isCountableSale, presetRange } from './reportUtils';
import { formatCurrency } from '../../lib/utils';

const TYPE_FILTERS = ['ALL', 'Sale', 'Payment', 'Purchase', 'Expense'];

const TYPE_STYLE = {
  Sale:     { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  Payment:  { bg: 'bg-accent-signature/10',  text: 'text-accent-signature-hover' },
  Purchase: { bg: 'bg-blue-50',    text: 'text-blue-700' },
  Expense:  { bg: 'bg-red-50',     text: 'text-red-600' },
};

const AllTransactionsReport = () => {
  const [preset, setPreset]           = useState('TODAY');
  const [range,  setRange]            = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);
  const [typeFilter,  setTypeFilter]  = useState('ALL');
  const [q,           setQ]           = useState('');
  const [dirFilter,   setDirFilter]   = useState('ALL');

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: salesRaw,    loading: sLoading } = useReportData({ table: 'sales',           select: 'id, date, totalAmount, paymentMethod, customerInfo, shopId, status, paymentStatus, voided_at', dateColumn: 'date', filters });
  const sales = useMemo(() => salesRaw.filter(isCountableSale), [salesRaw]);
  const { data: payments, loading: pLoading } = useReportData({ table: 'client_payments', select: 'id, date, amount, client_id, payment_method',               dateColumn: 'date', filters });
  const { data: purchases,loading: puLoading} = useReportData({ table: 'purchases',       select: 'id, date, total_amount, supplier_name',                      dateColumn: 'date', filters });
  const { data: expenses, loading: eLoading } = useReportData({ table: 'expenses',        select: '*',                                                          dateColumn: 'date', filters });
  const { data: clients }                     = useReportData({ table: 'clients',          select: 'id, name' });

  const loading = sLoading || pLoading || puLoading || eLoading;

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

  const { allRows } = useMemo(() => {
    const rows = [];

    sales.forEach(s => {
      const cid  = s.customerInfo?.id || s.shopId || null;
      const name = (cid && clientMap[cid]) || s.customerInfo?.name || 'Walk-in';
      rows.push({
        date:   s.date || '',
        type:   'Sale',
        party:  name,
        dir:    'in',
        amount: Number(s.totalAmount || 0),
        ref:    (s.id || '').toUpperCase(), // id already carries the SAL- prefix — no double wrap / truncation
      });
    });

    payments.forEach(p => {
      const name = (p.client_id && clientMap[p.client_id]) || 'Client';
      rows.push({
        date:   p.date || '',
        type:   'Payment',
        party:  name,
        dir:    'in',
        amount: Number(p.amount || 0),
        ref:    `PMT-${(p.id || '').slice(0,8).toUpperCase()}`,
      });
    });

    purchases.forEach(p => {
      rows.push({
        date:   p.date || '',
        type:   'Purchase',
        party:  p.supplier_name || 'Supplier',
        dir:    'out',
        amount: Number(p.total_amount || 0),
        ref:    `PUR-${(p.id || '').slice(0,8).toUpperCase()}`,
      });
    });

    expenses.forEach(e => {
      // Gracefully handle both note and description columns
      const desc = e.description || e.note || e.category || 'Expense';
      rows.push({
        date:   e.date || '',
        type:   'Expense',
        party:  desc,
        dir:    'out',
        amount: Number(e.amount || 0),
        ref:    `EXP-${(e.id || '').slice(0,8).toUpperCase()}`,
      });
    });

    // Sort newest first
    rows.sort((a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref));

    return { allRows: rows };
  }, [sales, payments, purchases, expenses, clientMap]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allRows.filter(r => {
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false;
      if (dirFilter  !== 'ALL' && r.dir  !== dirFilter)  return false;
      if (!needle) return true;
      return (r.party || '').toLowerCase().includes(needle)
          || (r.ref   || '').toLowerCase().includes(needle);
    });
  }, [allRows, typeFilter, dirFilter, q]);

  // Counts per option, so each dropdown shows what is behind it.
  const typeCounts = useMemo(() => {
    const m = new Map();
    allRows.forEach(r => m.set(r.type, (m.get(r.type) || 0) + 1));
    return m;
  }, [allRows]);

  const clearFilters = () => { setQ(''); setTypeFilter('ALL'); setDirFilter('ALL'); };

  const kpis = useMemo(() => {
    const totalIn  = filteredRows.filter(r => r.dir === 'in').reduce((s, r) => s + r.amount, 0);
    const totalOut = filteredRows.filter(r => r.dir === 'out').reduce((s, r) => s + r.amount, 0);
    return { totalIn, totalOut, net: totalIn - totalOut, count: filteredRows.length };
  }, [filteredRows]);

  const exportCSV = () => {
    const csvRows = [
      ['Date', 'Type', 'Party / Description', 'Direction', 'Amount', 'Reference'],
      ...filteredRows.map(r => [r.date, r.type, r.party, r.dir === 'in' ? 'Money In' : 'Money Out', r.amount.toFixed(2), r.ref]),
    ];
    const csv  = csvRows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `all_transactions_${range.start}_${range.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pb-16">
      <ReportHeader
        title="All Transactions"
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
        <KPI label="Money In"    loading={loading} value={formatCurrency(kpis.totalIn)}  icon={ArrowDownLeft}  color="#10b981" />
        <KPI label="Money Out"   loading={loading} value={formatCurrency(kpis.totalOut)} icon={ArrowUpRight}   color="#ef4444" />
        <KPI label="Net Flow"    loading={loading} value={formatCurrency(kpis.net)}      icon={kpis.net >= 0 ? TrendingUp : TrendingDown} color={kpis.net >= 0 ? 'var(--color-accent-signature)' : '#f59e0b'} />
        <KPI label="Transactions" loading={loading} value={kpis.count}                  icon={Hash}           color="#8b5cf6" />
      </div>

      <ReportFilterRow
        search={q}
        onSearch={setQ}
        searchPlaceholder="Party, description or reference"
        selects={[
          { key: 'type', label: 'All types', value: typeFilter, onChange: setTypeFilter,
            options: TYPE_FILTERS.filter(t => t !== 'ALL')
              .map(t => ({ value: t, label: `${t}${typeCounts.get(t) ? ` (${typeCounts.get(t)})` : ''}` })) },
          { key: 'dir', label: 'In and out', value: dirFilter, onChange: setDirFilter,
            options: [{ value: 'in', label: 'Money in' }, { value: 'out', label: 'Money out' }] },
        ]}
        resultCount={filteredRows.length}
        totalCount={allRows.length}
        onClear={clearFilters}
      />

      {/* Ledger Table */}
      <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border/60">
          <SectionHead title="Transaction Ledger" sub="newest first" />
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No transactions for selected period</div>
        ) : (
          <div>
            <div className="grid grid-cols-[90px_90px_1fr_90px_130px] gap-4 px-6 py-2 bg-canvas/50 border-b border-border/60">
              {['Date', 'Type', 'Party / Description', 'Flow', 'Amount'].map(h => (
                <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">{h}</span>
              ))}
            </div>
            {filteredRows.map((row, i) => {
              const ts = TYPE_STYLE[row.type] || { bg: 'bg-gray-100', text: 'text-gray-600' };
              return (
                <div key={`${row.ref}-${i}`}
                  className="grid grid-cols-[90px_90px_1fr_90px_130px] gap-4 px-6 py-3.5 items-center border-b border-border/60 last:border-0 hover:bg-canvas/40 transition-colors">
                  <span className="text-xs font-semibold text-ink-secondary tabular-nums">{row.date}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-semibold w-fit ${ts.bg} ${ts.text}`}>
                    {row.type}
                  </span>
                  <span className="text-xs font-semibold text-foreground truncate">{row.party}</span>
                  <div className={`flex items-center gap-1 text-[10px] font-semibold ${row.dir === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {row.dir === 'in'
                      ? <ArrowDownLeft size={12} />
                      : <ArrowUpRight size={12} />
                    }
                    {row.dir === 'in' ? 'In' : 'Out'}
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${row.dir === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {row.dir === 'in' ? '+' : '-'}{formatCurrency(row.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AllTransactionsReport;
