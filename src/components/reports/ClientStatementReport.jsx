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
import { KPI, SectionHead } from './ReportBits';
import { isCountableSale, PRESETS, presetRange } from './reportUtils';
import { formatCurrency } from '../../lib/utils';

const TYPE_STYLE = {
  SALE:    { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Sale' },
  INVOICE: { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Invoice' },
  PAYMENT: { bg: 'bg-accent-signature/10',  text: 'text-accent-signature-hover',  label: 'Payment' },
};

const ClientStatementReport = () => {
  const [preset, setPreset]       = useState('TODAY');
  const [range,  setRange]        = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [showCustom,  setShowCustom]  = useState(false);
  const [clientId, setClientId]   = useState('');
  const [search,   setSearch]     = useState('');

  const dateFilters = useMemo(() => ({ dateRange: range }), [range]);

  // Data fetching
  const { data: clients,  loading: cLoading }  = useReportData({ table: 'clients',         select: 'id, name, phone, outstanding_balance' });
  const { data: salesRaw,    loading: sLoading }  = useReportData({ table: 'sales',            select: 'id, date, totalAmount, paidAmount, paymentMethod, customerInfo, shopId, status, paymentStatus, voided_at', dateColumn: 'date', filters: dateFilters });
  const sales = useMemo(() => salesRaw.filter(isCountableSale), [salesRaw]);
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

    // Display helpers — IDs already carry a type prefix (e.g. "INV-XXXX",
    // "SAL-XXXX"), so the table just shows them verbatim. Dates are stored
    // either as YYYY-MM-DD or as full timestamps; show only the date part.
    const refOf  = (id, fallback) => (id ? String(id).toUpperCase() : fallback);
    const dateOf = (d) => (d ? String(d).slice(0, 10) : '');

    // Sales: match by customerInfo.id or shopId
    sales.forEach(s => {
      const cid = s.customerInfo?.id || s.shopId;
      if (cid === clientId && !invoicedSaleIds.has(s.id)) {
        rows.push({
          date:      dateOf(s.date),
          type:      'SALE',
          ref:       refOf(s.id, 'SALE'),
          debit:     Number(s.totalAmount || 0),
          credit:    0,
          raw:       s,
        });
        // Money paid at the time of sale (cash/UPI at counter) is a credit too —
        // otherwise the running balance overstates what the client still owes.
        const atSale = Number(s.paidAmount || 0);
        if (atSale > 0) rows.push({ date: dateOf(s.date), type: 'PAYMENT', ref: `Paid · ${refOf(s.id, 'SALE')}`, debit: 0, credit: atSale, raw: s });
      }
    });

    // Invoices: match by client_id
    invoices.forEach(inv => {
      if (inv.client_id === clientId) {
        rows.push({
          date:      dateOf(inv.date),
          type:      'INVOICE',
          ref:       refOf(inv.id, 'INV'),
          debit:     Number(inv.grand_total || 0),
          credit:    0,
          raw:       inv,
        });
        const atBill = Number(inv.paid_amount || 0);
        if (atBill > 0) rows.push({ date: dateOf(inv.date), type: 'PAYMENT', ref: `Paid · ${refOf(inv.id, 'INV')}`, debit: 0, credit: atBill, raw: inv });
      }
    });

    // NOTE: client_payments are NOT credited separately — settlement receipts
    // are already folded into each bill's paidAmount (credited above), so
    // adding them here would double-count. This keeps the closing balance
    // equal to the client's outstanding_balance (Σ bill − Σ paidAmount).

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
    <div className="space-y-4 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-base font-semibold text-foreground tracking-tight">
            Client Statement
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
          </p>
        </div>
        <div className="flex-1" />
        {/* Date presets */}
        <div className="flex items-center bg-muted rounded-lg p-0.5 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-md text-[11px] transition-colors ${
                preset === p.id ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'
              }`}>{p.label}</button>
          ))}
          <button onClick={() => applyPreset('CUSTOM')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] transition-colors ${
              preset === 'CUSTOM' ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'
            }`}>
            <Calendar size={11} /> Custom
          </button>
        </div>
        {selectedClient && (
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-[11px] font-medium text-foreground hover:bg-muted/60 transition-colors">
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={14} className="text-muted-foreground shrink-0" />
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
          <span className="text-muted-foreground text-xs font-semibold">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
          <button onClick={applyCustom}
            className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
            Apply
          </button>
        </div>
      )}

      {/* Client Picker */}
      <div className="bg-card rounded-[10px] border border-border/60 shadow-sm p-6">
        <SectionHead title="Select Client" sub="search by name" />
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border shadow-sm rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-accent-signature/20"
          />
        </div>
        {!selectedClient && (
          <div className="mt-2 bg-card border border-border shadow-sm rounded-xl max-h-64 overflow-y-auto">
            {cLoading
              ? <div className="p-4 text-xs text-muted-foreground">Loading...</div>
              : clients.length === 0
              ? <div className="p-4 text-xs text-muted-foreground">No clients yet</div>
              : filteredClients.length === 0
              ? <div className="p-4 text-xs text-muted-foreground">No clients match "{search}"</div>
              : filteredClients.map(c => (
                <button key={c.id} onClick={() => { setClientId(c.id); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-canvas/60 transition-colors text-left border-b border-border/60 last:border-0 ${clientId === c.id ? 'bg-accent-signature/5' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-accent-signature/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-semibold text-accent-signature">{(c.name?.[0] || '?').toUpperCase()}</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{c.name}</div>
                    {c.phone && <div className="text-[10px] text-muted-foreground">{c.phone}</div>}
                  </div>
                  <div className="ml-auto text-xs font-semibold text-red-500 tabular-nums">
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
              <span className="text-[11px] font-semibold text-accent-signature">{(selectedClient.name?.[0] || '?').toUpperCase()}</span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground">{selectedClient.name}</div>
              {selectedClient.phone && <div className="text-[10px] text-muted-foreground">{selectedClient.phone}</div>}
            </div>
            <button onClick={() => setClientId('')}
              className="text-[10px] font-semibold text-muted-foreground hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
              Change
            </button>
          </div>
        )}
      </div>

      {/* KPIs — only after client selected */}
      {selectedClient && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPI label="Total Billed"    loading={loading} value={formatCurrency(kpis.billed)}      icon={TrendingUp}   color="var(--color-accent-signature)" />
            <KPI label="Total Paid"      loading={loading} value={formatCurrency(kpis.paid)}        icon={DollarSign}   color="#10b981" />
            <KPI label="Outstanding"     loading={loading} value={formatCurrency(kpis.outstanding)}  icon={Clock}        color="#ef4444" />
          </div>

          {/* Ledger Table */}
          <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-border/60 flex items-center justify-between">
              <SectionHead title={`${selectedClient.name} — Ledger`} sub={`${ledgerRows.length} entries`} />
            </div>

            {loading ? (
              <div className="p-6 space-y-3">
                {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-canvas animate-pulse rounded-xl" />)}
              </div>
            ) : ledgerRows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No data for selected period</div>
            ) : (
              <div>
                {/* Table header */}
                <div className="grid grid-cols-[90px_80px_1fr_110px_110px_120px] gap-4 px-6 py-2 bg-canvas/50 border-b border-border/60">
                  {['Date','Type','Reference','Debit','Credit','Balance'].map(h => (
                    <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">{h}</span>
                  ))}
                </div>
                {ledgerRows.map((row, i) => {
                  const ts = TYPE_STYLE[row.type] || TYPE_STYLE.SALE;
                  return (
                    <div key={i} className="grid grid-cols-[90px_80px_1fr_110px_110px_120px] gap-4 px-6 py-3.5 items-center border-b border-border/60 last:border-0 hover:bg-canvas/40 transition-colors">
                      <span className="text-xs font-semibold text-ink-secondary tabular-nums">{row.date}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-semibold w-fit ${ts.bg} ${ts.text}`}>{ts.label}</span>
                      <span className="text-xs font-semibold text-foreground truncate tabular-nums">{row.ref}</span>
                      <span className={`text-xs font-semibold tabular-nums ${row.debit > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                        {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                      </span>
                      <span className={`text-xs font-semibold tabular-nums ${row.credit > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                        {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                      </span>
                      <span className={`text-xs font-semibold tabular-nums ${row.balance > 0 ? 'text-red-500' : row.balance < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {formatCurrency(Math.abs(row.balance))}{row.balance < 0 ? ' Cr' : row.balance > 0 ? ' Dr' : ''}
                      </span>
                    </div>
                  );
                })}
                {/* Closing balance */}
                <div className="flex justify-end gap-8 px-6 py-3.5 border-t border-border/60 bg-canvas/30">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Closing Balance</span>
                  {ledgerRows.length > 0 && (
                    <span className={`text-sm font-semibold tabular-nums ${ledgerRows[ledgerRows.length-1].balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
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
        <div className="py-20 text-center text-sm text-muted-foreground bg-card rounded-[10px] border border-border/60 shadow-sm">
          <UserCircle size={32} className="mx-auto mb-3 text-gray-300" />
          Select a client above to view their statement
        </div>
      )}
    </div>
  );
};

export default ClientStatementReport;
