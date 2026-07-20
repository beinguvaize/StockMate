/**
 * DailySalesReport — the Business Report's per-day product/client breakdown,
 * lifted into its own report module. Same visual language (date presets,
 * clean header, expandable day cards) as BusinessReport.
 */
import React, { useState, useMemo } from 'react';
import useReportData from './useReportData';
import ReportHeader from './ReportHeader';
import ReportFilterRow from './ReportFilterRow';
import { isCountableSale, presetRange } from './reportUtils';
import DailySalesDetail from './DailySalesDetail';

/** Counts per option value, so the dropdowns show how much is behind each. */
const tally = (rows, pick) => {
  const m = new Map();
  rows.forEach((r) => {
    const v = pick(r);
    if (v == null || v === '') return;
    m.set(v, (m.get(v) || 0) + 1);
  });
  return m;
};
const toOptions = (m, label = (k) => k) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, n]) => ({ value, label: `${label(value)} (${n})` }));

const DailySalesReport = () => {
  const [preset, setPreset] = useState('TODAY');
  const [range, setRange] = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  // Filters
  const [q, setQ]             = useState('');
  const [customer, setCustomer] = useState('ALL');
  const [method, setMethod]   = useState('ALL');
  const [status, setStatus]   = useState('ALL');
  const [source, setSource]   = useState('ALL');

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: salesRaw, loading } = useReportData({ table: 'sales', select: '*', dateColumn: 'date', filters });
  const sales = useMemo(() => salesRaw.filter(isCountableSale), [salesRaw]);
  const { data: clients } = useReportData({ table: 'clients', select: 'id, name' });
  const { data: vehicles } = useReportData({ table: 'vehicles', select: 'id, plateNumber, name' });
  const { data: users } = useReportData({ table: 'users', select: 'id, name, email' });

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };
  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  const nameOf = useMemo(() => {
    const byId = new Map(clients.map((c) => [c.id, c.name]));
    return (s) => {
      const cid = s.customerInfo?.id || s.shopId || null;
      return (cid && byId.get(cid)) || s.customerInfo?.name || 'Walk-in';
    };
  }, [clients]);

  // Van sales carry a vehicle/route rather than a distinct source_app value,
  // so they are surfaced as their own source option.
  const sourceOf = (s) =>
    (s.routeId || s.vehicleId || s.source_app === 'VAN') ? 'VAN' : (s.source_app || 'WEB');

  const options = useMemo(() => ({
    customers: toOptions(tally(sales, nameOf)),
    methods:   toOptions(tally(sales, (s) => (s.paymentMethod || 'CASH').toUpperCase())),
    statuses:  toOptions(tally(sales, (s) => (s.paymentStatus || s.status || '').toUpperCase())),
    sources:   toOptions(tally(sales, sourceOf)),
  }), [sales, nameOf]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sales.filter((s) => {
      if (customer !== 'ALL' && nameOf(s) !== customer) return false;
      if (method   !== 'ALL' && (s.paymentMethod || 'CASH').toUpperCase() !== method) return false;
      if (status   !== 'ALL' && (s.paymentStatus || s.status || '').toUpperCase() !== status) return false;
      if (source   !== 'ALL' && sourceOf(s) !== source) return false;
      if (!needle) return true;
      // Bill reference, customer, or any product on the bill.
      if ((s.id || '').toLowerCase().includes(needle)) return true;
      if (nameOf(s).toLowerCase().includes(needle)) return true;
      return (Array.isArray(s.items) ? s.items : [])
        .some((i) => (i.name || '').toLowerCase().includes(needle));
    });
  }, [sales, q, customer, method, status, source, nameOf]);

  const clearFilters = () => { setQ(''); setCustomer('ALL'); setMethod('ALL'); setStatus('ALL'); setSource('ALL'); };

  return (
    <div className="space-y-4 pb-16">
      <ReportHeader
        title="Daily Sales"
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

      <ReportFilterRow
        search={q}
        onSearch={setQ}
        searchPlaceholder="Bill no, customer or product"
        selects={[
          { key: 'customer', label: 'All customers', value: customer, onChange: setCustomer, options: options.customers },
          { key: 'method',   label: 'All payments',  value: method,   onChange: setMethod,   options: options.methods },
          { key: 'status',   label: 'All statuses',  value: status,   onChange: setStatus,   options: options.statuses },
          { key: 'source',   label: 'All sources',   value: source,   onChange: setSource,   options: options.sources },
        ]}
        resultCount={filtered.length}
        totalCount={sales.length}
        onClear={clearFilters}
      />

      {!loading && sales.length > 0 && filtered.length === 0 ? (
        <div className="bg-card rounded-[10px] border border-border/60 py-16 text-center">
          <p className="text-sm text-foreground">No sales match these filters</p>
          <button onClick={clearFilters} className="text-[11px] text-muted-foreground hover:text-foreground mt-1">
            Clear filters
          </button>
        </div>
      ) : (
        <DailySalesDetail sales={filtered} clients={clients} vehicles={vehicles} users={users} loading={loading} />
      )}
    </div>
  );
};

export default DailySalesReport;
