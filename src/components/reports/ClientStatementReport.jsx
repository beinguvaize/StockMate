/**
 * ClientStatementReport — per-client chronological ledger:
 * sales + invoices + payments with running balance.
 */
import React, { useState, useMemo } from 'react';
import {
  UserCircle, Calendar, TrendingUp, DollarSign, Clock, Search,
  Download, ArrowUpRight, ArrowDownRight,
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

const TYPE_STYLE = {
  SALE:    { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Sale' },
  INVOICE: { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Invoice' },
  PAYMENT: { bg: 'bg-violet-50',  text: 'text-violet-700',  label: 'Payment' },
};

const ClientStatementReport = () => {
  const [preset, setPreset]       = useState('MONTH');
  const [range,  setRange]        = useState(() => presetRange('MONTH'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);
  const [clientId, setClientId]   = useState('');
  const [search,   setSearch]     = useState('');

  const dateFilters = useMemo(() => ({ dateRange: range }), [range]);

  // Data fetching
  const { data: clients,  loading: cLoading }  = useReportData({ table: 'clients',         select: 'id, name, phone, outstanding_balance' });
  const { data: sales,    loading: sLoading }  = useReportData({ table: 'sales',            select: 'id, date, totalAmount, paymentMethod, customerInfo, shopId', dateColumn: 'date', filters: dateFilters });
  const { data: invoices, loading: iLoading }  = useReportData({ table: 'invoices',         select: 'id, client_id, client_name, grand_total, paid_amount, payment_status, date, sale_id', dateColumn: 'date', filters: dateFilters });
  const { data: payments, loading: pLoading }  = useReportData({ table: 'client_payments',  select: 'id, client_id, amount, date, payment_method', dateColumn: 'date', filters: dateFilters });

  const loading = cLoading || sLoading || iLoading || pLoading;

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };

  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  // Filter clients by search
  const filteredClients = useMemo(() =>
    clients.filter(c => c.name?.toLowerCase().includes(search.toLowerCase())),
    [clients, search]
  );

  const selectedClient = useMemo(() =>
    clients.find(c => c.id === clientId) || null,
    [clients, clientId]
  );

  // Build ledger rows for selected client
  const { ledgerRows, kpis } = useMemo(() => {
    if (!clientId) return { ledgerRows: [], kpis: { billed: 0, paid: 0, outstanding: 0 } };

    const rows = [];

    // Sales that already have an invoice (credit/delivery sales auto-create
    // one) — skip the sale row so billed amount is not double-counted.
    const invoicedSaleIds = new Set(
      invoices.map(inv => inv.sale_id).filter(Boolean)
    );

    // Sales: match by customerInfo.id or shopId
    sales.forEach(s => {
      const cid = s.customerInfo?.id || s.shopId;
      if (cid === clientId && !invoicedSaleIds.has(s.id)) {
        rows.push({
          date:      s.date || '',
          type:      'SALE',
          ref:       `SALE-${(s.id || '').slice(0,8).toUpperCase()}`,
          debit:     Number(s.totalAmount || 0),
          credit:    0,
          raw:       s,
        });
      }
    });

    // Invoices: match by client_id
    invoices.forEach(inv => {
      if (inv.client_id === clientId) {
        rows.push({
          date:      inv.date || '',
          type:      'INVOICE',
          ref:       `INV-${(inv.id || '').slice(0,8).toUpperCase()}`,
          debit:     Number(inv.grand_total || 0),
          credit:    0,
          raw:       inv,
        });
      }
    });

    // Payments: match by client_id
    payments.forEach(p => {
      if (p.client_id === clientId) {
        rows.push({
          date:      p.date || '',
          type:      'PAYMENT',
          ref:       `PMT-${(p.id || '').slice(0,8).toUpperCase()}`,
          debit:     0,
          credit:    Number(p.amount || 0),
          raw:       p,
        });
      }
    });

    // Sort chronologically
    rows.sort((a, b) => a.date.localeCompare(b.date));

    // Running balance
    let balance = 0;
    rows.forEach(r => {
      balance += r.debit - r.credit;
      r.balance = balance;
    });

    const totalBilled = rows.filter(r => r.type !== 'PAYMENT').reduce((s, r) => s + r.debit, 0);
    const totalPaid   = rows.filter(r => r.type === 'PAYMENT').reduce((s, r) => s + r.credit, 0);
    const outstanding = totalBilled - totalPaid;

    return { ledgerRows: rows, kpis: { billed: totalBilled, paid: totalPaid, outstanding } };
  }, [clientId, sales, invoices, payments]);

  const exportCSV = () => {
    const name = selectedClient?.name || 'client';
    const rows = [
      ['Date','Type','Reference','Debit','Credit','Balance'],
      ...ledgerRows.map(r => [r.date, r.type, r.ref, r.debit || '', r.credit || '', r.balance]),
    ];
    const csv  = rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `statement_${name.replace(/\s+/g,'_')}_${range.start}_${range.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-primary leading-none">
            Client Statement<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-1">
            {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
          </p>
        </div>
        <div className="flex-1" />
        {/* Date presets */}
        <div className="flex items-center gap-1 bg-white border border-gray-300 shadow-sm rounded-xl p-1 flex-wrap">
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
        {selectedClient && (
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-black/8 bg-white text-xs font-black text-ink-primary hover:border-black/20 hover:shadow-sm transition-all">
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-black/5 shadow-sm">
          <Calendar size={14} className="text-gray-400 shrink-0" />
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20" />
          <span className="text-gray-400 text-xs font-bold">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20" />
          <button onClick={applyCustom}
            className="px-4 py-2 rounded-xl bg-ink-primary text-white text-xs font-black hover:bg-ink-primary/90 transition-all">
            Apply
          </button>
        </div>
      )}

      {/* Client Picker */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6">
        <SectionHead title="Select Client" sub="search by name" />
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-300 shadow-sm rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-accent-signature/20"
          />
        </div>
        {search && (
          <div className="mt-2 bg-white border border-black/8 rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {cLoading
              ? <div className="p-4 text-xs text-gray-400">Loading...</div>
              : filteredClients.length === 0
              ? <div className="p-4 text-xs text-gray-400">No clients found</div>
              : filteredClients.map(c => (
                <button key={c.id} onClick={() => { setClientId(c.id); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-canvas/60 transition-colors text-left border-b border-black/5 last:border-0 ${clientId === c.id ? 'bg-accent-signature/5' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-accent-signature/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-accent-signature">{(c.name?.[0] || '?').toUpperCase()}</span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-ink-primary">{c.name}</div>
                    {c.phone && <div className="text-[10px] text-gray-400">{c.phone}</div>}
                  </div>
                  <div className="ml-auto text-xs font-black text-red-500 tabular-nums">
                    {formatCurrency(c.outstanding_balance || 0)}
                  </div>
                </button>
              ))
            }
          </div>
        )}
        {selectedClient && !search && (
          <div className="mt-3 flex items-center gap-3 p-3 bg-accent-signature/5 rounded-xl border border-accent-signature/10">
            <div className="w-9 h-9 rounded-full bg-accent-signature/15 flex items-center justify-center shrink-0">
              <span className="text-[11px] font-black text-accent-signature">{(selectedClient.name?.[0] || '?').toUpperCase()}</span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-black text-ink-primary">{selectedClient.name}</div>
              {selectedClient.phone && <div className="text-[10px] text-gray-400">{selectedClient.phone}</div>}
            </div>
            <button onClick={() => setClientId('')}
              className="text-[10px] font-black text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
              Change
            </button>
          </div>
        )}
      </div>

      {/* KPIs — only after client selected */}
      {selectedClient && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPI label="Total Billed"    loading={loading} value={formatCurrency(kpis.billed)}      icon={TrendingUp}   color="#6366f1" />
            <KPI label="Total Paid"      loading={loading} value={formatCurrency(kpis.paid)}        icon={DollarSign}   color="#10b981" />
            <KPI label="Outstanding"     loading={loading} value={formatCurrency(kpis.outstanding)}  icon={Clock}        color="#ef4444" />
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-center justify-between">
              <SectionHead title={`${selectedClient.name} — Ledger`} sub={`${ledgerRows.length} entries`} />
            </div>

            {loading ? (
              <div className="p-6 space-y-3">
                {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
              </div>
            ) : ledgerRows.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">No data for selected period</div>
            ) : (
              <div>
                {/* Table header */}
                <div className="grid grid-cols-[90px_80px_1fr_110px_110px_120px] gap-4 px-6 py-2 bg-canvas/50 border-b border-black/5">
                  {['Date','Type','Reference','Debit','Credit','Balance'].map(h => (
                    <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
                  ))}
                </div>
                {ledgerRows.map((row, i) => {
                  const ts = TYPE_STYLE[row.type] || TYPE_STYLE.SALE;
                  return (
                    <div key={i} className="grid grid-cols-[90px_80px_1fr_110px_110px_120px] gap-4 px-6 py-3.5 items-center border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors">
                      <span className="text-xs font-bold text-ink-secondary tabular-nums">{row.date}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black w-fit ${ts.bg} ${ts.text}`}>{ts.label}</span>
                      <span className="text-xs font-bold text-ink-primary truncate font-mono">{row.ref}</span>
                      <span className={`text-xs font-black tabular-nums ${row.debit > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                        {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                      </span>
                      <span className={`text-xs font-black tabular-nums ${row.credit > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                        {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                      </span>
                      <span className={`text-xs font-black tabular-nums ${row.balance > 0 ? 'text-red-500' : row.balance < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {formatCurrency(Math.abs(row.balance))}{row.balance < 0 ? ' Cr' : row.balance > 0 ? ' Dr' : ''}
                      </span>
                    </div>
                  );
                })}
                {/* Closing balance */}
                <div className="flex justify-end gap-8 px-6 py-3.5 border-t border-black/5 bg-canvas/30">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Closing Balance</span>
                  {ledgerRows.length > 0 && (
                    <span className={`text-sm font-black tabular-nums ${ledgerRows[ledgerRows.length-1].balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {formatCurrency(Math.abs(ledgerRows[ledgerRows.length-1].balance))}
                      {ledgerRows[ledgerRows.length-1].balance > 0 ? ' Dr' : ' Cr'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!selectedClient && !cLoading && (
        <div className="py-20 text-center text-sm text-gray-400 bg-white rounded-2xl border border-black/5 shadow-sm">
          <UserCircle size={32} className="mx-auto mb-3 text-gray-300" />
          Select a client above to view their statement
        </div>
      )}
    </div>
  );
};

export default ClientStatementReport;
