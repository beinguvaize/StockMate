import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../ui/States';
import { formatCurrency } from '../../lib/utils';
import {
  Search, Plus, Phone, Mail, MapPin, Edit3, Trash2,
  ShieldCheck, Upload, Users,
} from 'lucide-react';

/**
 * Clients, as one work surface.
 *
 * The screen used to be three top-level tabs — Directory, Aging, Payment
 * History — so chasing a debt meant crossing between them and losing your place
 * in the list. Aging in particular was a whole separate destination, when the
 * age of a debt is the single fact that decides who you ring first.
 *
 * Now: list on the left, everything about the selected client on the right. You
 * work straight down the list without navigating away, and age is a column.
 */

const DAY = 86400000;
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : null);

// Age bands. Colour carries the urgency so a glance down the column is enough.
const ageTone = (n) => {
  if (n == null) return 'text-muted-foreground bg-muted border-border';
  if (n >= 60) return 'text-red-600 bg-red-50 border-red-200';
  if (n >= 30) return 'text-accent-signature-hover bg-accent-signature/10 border-accent-signature/25';
  if (n >= 15) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-muted-foreground bg-muted border-border';
};

const FILTERS = [
  { id: 'OWING',   label: 'Owing' },
  { id: 'OVERDUE', label: 'Overdue' },
  { id: 'ALL',     label: 'All' },
];

// Defined at module scope: a component created inside render is a new type on
// every pass, so React remounts it and any DOM state inside is lost.
const Kpi = ({ label, value, sub, tone }) => (
  <div className="px-4 py-3">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`text-[20px] font-bold tabular-nums mt-1 leading-none ${tone || 'text-foreground'}`}>{value}</div>
    {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
  </div>
);

const ClientWorkspace = ({
  clients = [], clientStats = {}, sales = [], clientPayments = [],
  businessProfile, openAdd, openEdit, handleDelete, hasPermission,
}) => {
  const navigate = useNavigate();
  const cur = businessProfile?.currencySymbol || '₹';
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('OWING');
  const [selectedId, setSelectedId] = useState(null);
  const [panelTab, setPanelTab] = useState('BILLS');

  // Per-client money facts, derived once. The age of the oldest bill that is
  // not fully paid is what makes a debt worth chasing — an outstanding balance
  // on its own says nothing about urgency.
  const facts = useMemo(() => {
    const byClient = {};
    (clients || []).forEach(c => {
      byClient[c.id] = { unpaid: [], payments: [], oldestUnpaid: null, lastActivity: null, lastKind: '' };
    });

    (sales || []).forEach(s => {
      const f = byClient[s.shopId];
      if (!f) return;
      const total = Number(s.totalAmount) || 0;
      const paid  = Number(s.paidAmount) || 0;
      const due   = Math.max(0, total - paid);
      if (due > 0.01) {
        f.unpaid.push({ id: s.id, date: s.date, total, paid, due });
        if (!f.oldestUnpaid || String(s.date) < String(f.oldestUnpaid)) f.oldestUnpaid = s.date;
      }
      if (!f.lastActivity || String(s.date) > String(f.lastActivity)) {
        f.lastActivity = s.date; f.lastKind = 'Invoice';
      }
    });

    (clientPayments || []).forEach(p => {
      const f = byClient[p.client_id];
      if (!f) return;
      f.payments.push(p);
      if (!f.lastActivity || String(p.date) > String(f.lastActivity)) {
        f.lastActivity = p.date; f.lastKind = 'Payment';
      }
    });

    Object.values(byClient).forEach(f => {
      f.unpaid.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      f.payments.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    });
    return byClient;
  }, [clients, sales, clientPayments]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (clients || [])
      .map(c => {
        const f = facts[c.id] || {};
        const outstanding = Number(c.outstanding_balance) || 0;
        return {
          ...c,
          _out: outstanding,
          _age: outstanding > 0 ? daysSince(f.oldestUnpaid) : null,
          _last: f.lastActivity,
          _lastKind: f.lastKind,
          _facts: f,
        };
      })
      .filter(c => {
        if (filter === 'OWING'   && c._out <= 0) return false;
        if (filter === 'OVERDUE' && !(c._out > 0 && (c._age ?? 0) >= 30)) return false;
        if (!term) return true;
        return [c.name, c.contact, c.phone, c.gstin]
          .some(v => String(v || '').toLowerCase().includes(term));
      })
      // Biggest, oldest debts first — the order you would actually work in.
      .sort((a, b) => (b._out - a._out) || ((b._age ?? 0) - (a._age ?? 0)));
  }, [clients, facts, q, filter]);

  const kpis = useMemo(() => {
    let receivable = 0, overdue = 0, owingCount = 0, oldest = null, oldestName = '';
    (clients || []).forEach(c => {
      const out = Number(c.outstanding_balance) || 0;
      if (out <= 0) return;
      receivable += out; owingCount += 1;
      const age = daysSince(facts[c.id]?.oldestUnpaid);
      if (age != null && age >= 30) overdue += out;
      if (age != null && (oldest == null || age > oldest)) { oldest = age; oldestName = c.name; }
    });
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const collected = (clientPayments || [])
      .filter(p => new Date(p.date) >= monthStart)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const receipts = (clientPayments || []).filter(p => new Date(p.date) >= monthStart).length;
    return { receivable, overdue, owingCount, oldest, oldestName, collected, receipts };
  }, [clients, facts, clientPayments]);

  const selected = rows.find(r => r.id === selectedId) || rows[0] || null;

  return (
    <div className="space-y-4">
      {/* One joined strip — same shape as Inventory and the reports, so this is
          not a third visual dialect. Receivable leads because that is the job. */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
          <Kpi label="Owed to you" value={formatCurrency(kpis.receivable, cur)}
               sub={`${kpis.owingCount} of ${clients.length} clients`} />
          <Kpi label="Overdue 30+ days" value={formatCurrency(kpis.overdue, cur)}
               tone={kpis.overdue > 0 ? 'text-red-600' : undefined}
               sub={kpis.overdue > 0 ? 'chase these first' : 'nothing overdue'} />
          <Kpi label="Collected this month" value={formatCurrency(kpis.collected, cur)}
               tone="text-emerald-600" sub={`${kpis.receipts} receipts`} />
          <Kpi label="Oldest unpaid"
               value={kpis.oldest != null ? <>{kpis.oldest} <span className="text-[12px] font-semibold text-muted-foreground">days</span></> : '—'}
               sub={kpis.oldestName || 'nothing outstanding'} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
        {/* ── list ─────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 border-b border-border">
            <div className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search name, contact, phone, GSTIN…"
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted text-[13px] outline-none focus:ring-2 focus:ring-accent-signature/20" />
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted shrink-0">
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                    filter === f.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <button onClick={() => navigate('/bulk-add?type=clients')}
              className="h-9 px-3 rounded-lg border border-border text-[12px] font-semibold text-ink-secondary hover:bg-muted transition-colors inline-flex items-center gap-1.5 shrink-0">
              <Upload size={13} /> Import
            </button>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={Users} title="No clients here"
              description={filter === 'ALL' ? 'Add a client to get started.' : 'Nothing outstanding in this filter.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Client</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Last activity</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Due</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Age</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="text-[13px]">
                  {rows.map(c => {
                    const on = selected?.id === c.id;
                    return (
                      <tr key={c.id} onClick={() => { setSelectedId(c.id); setPanelTab('BILLS'); }}
                        className={`border-b border-border last:border-0 cursor-pointer transition-colors ${
                          on ? 'bg-accent-signature/[0.06] shadow-[inset_3px_0_0_var(--color-accent-signature)]' : 'hover:bg-muted/60'}`}>
                        <td className="px-4 py-3">
                          <div className="font-bold text-foreground truncate max-w-[220px]">{c.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                            {[c.contact, c.phone].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground hidden md:table-cell">
                          {c._last ? `${c._lastKind} · ${new Date(c._last).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums">
                          {c._out > 0
                            ? formatCurrency(c._out, cur)
                            : <span className="text-emerald-600 font-semibold">Settled</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c._age != null
                            ? <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold tabular-nums ${ageTone(c._age)}`}>{c._age}d</span>
                            : <span className="text-[11px] text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c._out > 0 ? (
                            <button onClick={(e) => { e.stopPropagation(); navigate(`/clients/settle/${c.id}`); }}
                              className={`h-8 px-3 rounded-lg text-[12px] font-bold transition-colors ${
                                on ? 'bg-accent-signature text-white hover:bg-accent-signature-hover'
                                   : 'border border-border text-ink-secondary hover:bg-muted'}`}>
                              Collect
                            </button>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); navigate('/sales'); }}
                              className="h-8 px-3 rounded-lg border border-border text-[12px] font-semibold text-ink-secondary hover:bg-muted transition-colors">
                              New sale
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── detail: what used to be two separate tabs ─────────────────── */}
        {selected ? (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[15px] font-extrabold text-foreground leading-tight truncate">{selected.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {[selected.contact, selected.phone].filter(Boolean).join(' · ') || 'No contact on file'}
                </div>
              </div>
              {selected._out > 0 && (selected._age ?? 0) >= 30 && (
                <span className="shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-semibold text-red-600 bg-red-50 border-red-200">Overdue</span>
              )}
            </div>

            <div className="rounded-xl bg-muted p-3 mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Owes you</div>
              <div className="text-[24px] font-extrabold tabular-nums text-foreground leading-none mt-1">
                {formatCurrency(selected._out, cur)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {selected._age != null ? `Oldest bill ${selected._age} days` : 'Nothing outstanding'}
                {Number(selected.credit_limit) > 0 && ` · limit ${formatCurrency(selected.credit_limit, cur)}`}
                {Number(selected.credit_days) > 0 && ` · ${selected.credit_days}d terms`}
              </div>
              {Number(selected.credit_limit) > 0 && (
                <div className="h-1.5 rounded-full bg-black/10 mt-2.5 overflow-hidden">
                  <div className={`h-full rounded-full ${selected._out > selected.credit_limit ? 'bg-red-500' : 'bg-accent-signature'}`}
                       style={{ width: `${Math.min(100, (selected._out / selected.credit_limit) * 100)}%` }} />
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-3">
              {selected._out > 0 && hasPermission?.('clients', 'edit') && (
                <button onClick={() => navigate(`/clients/settle/${selected.id}`)}
                  className="flex-1 h-9 rounded-lg bg-accent-signature hover:bg-accent-signature-hover text-white text-[13px] font-bold transition-colors">
                  Collect payment
                </button>
              )}
              <button onClick={() => navigate(`/clients/settle/${selected.id}`)}
                className="h-9 px-3 rounded-lg border border-border text-[13px] font-semibold text-ink-secondary hover:bg-muted transition-colors">
                Statement
              </button>
            </div>

            <div className="flex gap-4 mt-4 border-b border-border">
              {[['BILLS', 'Bills'], ['PAYMENTS', 'Payments'], ['DETAILS', 'Details']].map(([id, label]) => (
                <button key={id} onClick={() => setPanelTab(id)}
                  className={`text-[13px] font-bold pb-2 -mb-px border-b-2 transition-colors ${
                    panelTab === id ? 'text-foreground border-accent-signature' : 'text-muted-foreground border-transparent hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-2 max-h-[320px] overflow-y-auto">
              {panelTab === 'BILLS' && (
                selected._facts?.unpaid?.length ? selected._facts.unpaid.map(b => (
                  <div key={b.id} className="flex justify-between py-2 border-b border-border last:border-0">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-foreground truncate">{b.id}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[12px] font-bold tabular-nums">{formatCurrency(b.due, cur)}</div>
                      <div className={`text-[10px] font-semibold ${b.paid > 0 ? 'text-accent-signature-hover' : 'text-red-600'}`}>
                        {b.paid > 0 ? 'part-paid' : 'unpaid'}
                      </div>
                    </div>
                  </div>
                )) : <div className="text-[12px] text-muted-foreground py-4 text-center">No unpaid bills.</div>
              )}

              {panelTab === 'PAYMENTS' && (
                selected._facts?.payments?.length ? selected._facts.payments.slice(0, 25).map(p => (
                  <div key={p.id} className="flex justify-between py-2 border-b border-border last:border-0">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-foreground">
                        {new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{p.payment_method || 'CASH'}{p.notes ? ` · ${p.notes}` : ''}</div>
                    </div>
                    <div className="text-[12px] font-bold tabular-nums text-emerald-600 shrink-0">
                      {formatCurrency(p.amount, cur)}
                    </div>
                  </div>
                )) : <div className="text-[12px] text-muted-foreground py-4 text-center">No payments recorded.</div>
              )}

              {panelTab === 'DETAILS' && (
                <div className="space-y-2 py-1 text-[12px]">
                  {[
                    [Phone, selected.phone], [Mail, selected.email], [MapPin, selected.address],
                    [ShieldCheck, selected.gstin],
                  ].filter(([, v]) => v).map(([Icon, v], i) => (
                    <div key={i} className="flex items-start gap-2 text-ink-secondary">
                      <Icon size={13} className="mt-0.5 text-muted-foreground shrink-0" />
                      <span className="break-words">{v}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-2">
                    {hasPermission?.('clients', 'edit') && (
                      <button onClick={() => openEdit?.(selected)}
                        className="h-8 px-3 rounded-lg border border-border text-[12px] font-semibold text-ink-secondary hover:bg-muted inline-flex items-center gap-1.5">
                        <Edit3 size={12} /> Edit
                      </button>
                    )}
                    {/* handleDelete takes an ID. This passed the whole client object,
                        so the request went out as id=[object Object] and matched
                        nothing -- the delete that "did not work" for weeks. It also
                        had no confirm, unlike the row button, so a misclick went
                        straight through. */}
                    {hasPermission?.('clients', 'delete') && (
                      <button onClick={() => {
                        if (window.confirm(`Delete ${selected.name}?`)) handleDelete?.(selected.id);
                      }}
                        className="h-8 px-3 rounded-lg border border-red-200 text-[12px] font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5">
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground pt-1">
                    {clientStats?.[selected.id]?.orderCount || 0} orders ·{' '}
                    {formatCurrency(clientStats?.[selected.id]?.totalSales || 0, cur)} lifetime
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <div className="text-[13px] font-semibold text-foreground">No client selected</div>
            <div className="text-[12px] text-muted-foreground mt-1">Pick one from the list to see its bills and payments.</div>
            {hasPermission?.('clients', 'create') && (
              <button onClick={openAdd}
                className="mt-3 h-9 px-4 rounded-lg bg-accent-signature hover:bg-accent-signature-hover text-white text-[13px] font-bold inline-flex items-center gap-1.5">
                <Plus size={14} /> Add client
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientWorkspace;
