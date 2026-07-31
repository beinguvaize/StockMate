import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../ui/States';
import { formatCurrency } from '../../lib/utils';
import {
  Search, Plus, Phone, Mail, MapPin, Edit3, Trash2, Truck,
} from 'lucide-react';

/**
 * Suppliers, mirroring ClientWorkspace.
 *
 * Same skeleton as Clients, reflected: there it is money owed to you, here it
 * is money you owe. Learn one screen and you know the other — which the old
 * pair did not offer, one being a two-tab list and the other a three-tab one.
 *
 * The tabs are gone for the same reason: paying a supplier meant crossing from
 * the list to a separate payments tab and losing your place.
 */

const DAY = 86400000;
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : null);

const amtOf = (p) => Number(p.total_amount ?? p.total_cost ?? 0);
const paidOf = (p) => Number(p.paid_amount ?? 0);

// Defined at module scope: a component created inside render is a new type on
// every pass, so React remounts it and any DOM state inside is lost.
const Kpi = ({ label, value, sub, tone }) => (
  <div className="px-4 py-3">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`text-[20px] font-bold tabular-nums mt-1 leading-none ${tone || 'text-foreground'}`}>{value}</div>
    {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
  </div>
);

const FILTERS = [
  { id: 'OWING', label: 'Owing' },
  { id: 'ALL',   label: 'All' },
];

const SupplierWorkspace = ({
  suppliers = [], purchases = [], supplierPayments = [],
  businessProfile, openAdd, openEdit, handleDelete, hasPermission,
}) => {
  const navigate = useNavigate();
  const cur = businessProfile?.currencySymbol || '₹';
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('OWING');
  const [selectedId, setSelectedId] = useState(null);
  const [panelTab, setPanelTab] = useState('BILLS');

  const facts = useMemo(() => {
    const by = {};
    (suppliers || []).forEach(s => {
      by[s.id] = { bills: [], payments: [], payable: 0, billCount: 0, lastBill: null, oldestUnpaid: null, purchased: 0 };
    });

    (purchases || []).forEach(p => {
      // Older rows carry only supplier_name, so match on either.
      const sup = (suppliers || []).find(s => s.id === p.supplier_id || s.name === p.supplier_name);
      if (!sup) return;
      const f = by[sup.id];
      const total = amtOf(p);
      const due = Math.max(0, total - paidOf(p));
      f.bills.push({ ...p, _total: total, _due: due });
      f.billCount += 1;
      f.payable += due;
      f.purchased += total;
      if (!f.lastBill || String(p.date) > String(f.lastBill)) f.lastBill = p.date;
      if (due > 0.01 && (!f.oldestUnpaid || String(p.date) < String(f.oldestUnpaid))) f.oldestUnpaid = p.date;
    });

    (supplierPayments || []).forEach(pay => {
      const f = by[pay.supplier_id];
      if (f) f.payments.push(pay);
    });

    Object.values(by).forEach(f => {
      f.bills.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      f.payments.sort((a, b) => String(b.date ?? b.created_at).localeCompare(String(a.date ?? a.created_at)));
    });
    return by;
  }, [suppliers, purchases, supplierPayments]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (suppliers || [])
      .map(s => ({ ...s, _f: facts[s.id] || {}, _payable: facts[s.id]?.payable || 0 }))
      .filter(s => {
        if (filter === 'OWING' && s._payable <= 0.01) return false;
        if (!term) return true;
        return [s.name, s.contact_person, s.phone, s.gstin]
          .some(v => String(v || '').toLowerCase().includes(term));
      })
      .sort((a, b) => b._payable - a._payable);
  }, [suppliers, facts, q, filter]);

  const kpis = useMemo(() => {
    let payable = 0, owing = 0;
    Object.values(facts).forEach(f => { payable += f.payable; if (f.payable > 0.01) owing += 1; });

    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const paidThisMonth = (supplierPayments || [])
      .filter(p => new Date(p.date ?? p.created_at) >= monthStart)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const purchasedThisMonth = (purchases || [])
      .filter(p => new Date(p.date) >= monthStart)
      .reduce((s, p) => s + amtOf(p), 0);
    const billsThisMonth = (purchases || []).filter(p => new Date(p.date) >= monthStart).length;

    // Oldest unpaid bill across every supplier — the equivalent of the client
    // ageing signal, expressed as the thing that has been owed longest.
    let oldest = null, oldestName = '';
    (suppliers || []).forEach(s => {
      const age = daysSince(facts[s.id]?.oldestUnpaid);
      if (age != null && (oldest == null || age > oldest)) { oldest = age; oldestName = s.name; }
    });

    return { payable, owing, paidThisMonth, purchasedThisMonth, billsThisMonth, oldest, oldestName };
  }, [facts, suppliers, purchases, supplierPayments]);

  const selected = rows.find(r => r.id === selectedId) || rows[0] || null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
          <Kpi label="Payable" value={formatCurrency(kpis.payable, cur)}
               tone={kpis.payable > 0 ? 'text-red-600' : undefined}
               sub={`${kpis.owing} of ${suppliers.length} suppliers`} />
          <Kpi label="Oldest unpaid"
               value={kpis.oldest != null ? <>{kpis.oldest} <span className="text-[12px] font-semibold text-muted-foreground">days</span></> : '—'}
               sub={kpis.oldestName || 'nothing outstanding'} />
          <Kpi label="Paid this month" value={formatCurrency(kpis.paidThisMonth, cur)}
               tone="text-emerald-600" sub={`${(supplierPayments || []).length} payments recorded`} />
          <Kpi label="Purchased this month" value={formatCurrency(kpis.purchasedThisMonth, cur)}
               sub={`${kpis.billsThisMonth} bills`} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 border-b border-border">
            <div className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search supplier, contact, phone…"
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
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={Truck} title="No suppliers here"
              description={filter === 'ALL' ? 'Add a supplier to get started.' : 'Nothing owed in this filter.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Last bill</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Payable</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Bills</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="text-[13px]">
                  {rows.map(s => {
                    const on = selected?.id === s.id;
                    return (
                      <tr key={s.id} onClick={() => { setSelectedId(s.id); setPanelTab('BILLS'); }}
                        className={`border-b border-border last:border-0 cursor-pointer transition-colors ${
                          on ? 'bg-accent-signature/[0.06] shadow-[inset_3px_0_0_var(--color-accent-signature)]' : 'hover:bg-muted/60'}`}>
                        <td className="px-4 py-3">
                          <div className="font-bold text-foreground truncate max-w-[240px]">{s.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                            {[s.contact_person, s.phone].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground hidden md:table-cell">
                          {s._f.lastBill
                            ? new Date(s._f.lastBill).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums">
                          {s._payable > 0.01
                            ? <span className="text-red-600">{formatCurrency(s._payable, cur)}</span>
                            : <span className="text-emerald-600 font-semibold">Settled</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[12px] text-muted-foreground">
                          {s._f.billCount || 0}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/suppliers/ledger/${s.id}`); }}
                            className={`h-8 px-3 rounded-lg text-[12px] font-bold transition-colors ${
                              s._payable > 0.01
                                ? (on ? 'bg-accent-signature text-white hover:bg-accent-signature-hover'
                                      : 'border border-border text-ink-secondary hover:bg-muted')
                                : 'border border-border text-ink-secondary hover:bg-muted font-semibold'}`}>
                            {s._payable > 0.01 ? 'Pay' : 'Ledger'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected ? (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[15px] font-extrabold text-foreground leading-tight truncate">{selected.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {[selected.contact_person, selected.phone].filter(Boolean).join(' · ') || 'No contact on file'}
                </div>
              </div>
              {selected._payable > 0.01 && (
                <span className="shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-semibold text-red-600 bg-red-50 border-red-200">Owing</span>
              )}
            </div>

            <div className="rounded-xl bg-muted p-3 mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payable</div>
              <div className="text-[24px] font-extrabold tabular-nums text-foreground leading-none mt-1">
                {formatCurrency(selected._payable, cur)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Across {selected._f.billCount || 0} bills
                {selected._f.oldestUnpaid && ` · oldest ${new Date(selected._f.oldestUnpaid).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
                {Number(selected.credit_days) > 0 && ` · ${selected.credit_days}d terms`}
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button onClick={() => navigate(`/suppliers/ledger/${selected.id}`)}
                className="flex-1 h-9 rounded-lg bg-accent-signature hover:bg-accent-signature-hover text-white text-[13px] font-bold transition-colors">
                {selected._payable > 0.01 ? 'Record payment' : 'Open ledger'}
              </button>
              <button onClick={() => navigate('/purchases')}
                className="h-9 px-3 rounded-lg border border-border text-[13px] font-semibold text-ink-secondary hover:bg-muted transition-colors">
                New bill
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
                selected._f.bills?.length ? selected._f.bills.slice(0, 30).map(b => (
                  <div key={b.id} className="flex justify-between py-2 border-b border-border last:border-0">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-foreground truncate">{b.id}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[12px] font-bold tabular-nums">{formatCurrency(b._due > 0.01 ? b._due : b._total, cur)}</div>
                      <div className={`text-[10px] font-semibold ${
                        b._due <= 0.01 ? 'text-emerald-600' : paidOf(b) > 0 ? 'text-accent-signature-hover' : 'text-red-600'}`}>
                        {b._due <= 0.01 ? 'paid' : paidOf(b) > 0 ? 'part-paid' : 'unpaid'}
                      </div>
                    </div>
                  </div>
                )) : <div className="text-[12px] text-muted-foreground py-4 text-center">No bills recorded.</div>
              )}

              {panelTab === 'PAYMENTS' && (
                selected._f.payments?.length ? selected._f.payments.slice(0, 25).map(p => (
                  <div key={p.id} className="flex justify-between py-2 border-b border-border last:border-0">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-foreground">
                        {new Date(p.date ?? p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{p.method || p.payment_method || 'CASH'}</div>
                    </div>
                    <div className="text-[12px] font-bold tabular-nums text-emerald-600 shrink-0">
                      {formatCurrency(p.amount, cur)}
                    </div>
                  </div>
                )) : <div className="text-[12px] text-muted-foreground py-4 text-center">No payments recorded.</div>
              )}

              {panelTab === 'DETAILS' && (
                <div className="space-y-2 py-1 text-[12px]">
                  {[[Phone, selected.phone], [Mail, selected.email], [MapPin, selected.address]]
                    .filter(([, v]) => v).map(([Icon, v], i) => (
                      <div key={i} className="flex items-start gap-2 text-ink-secondary">
                        <Icon size={13} className="mt-0.5 text-muted-foreground shrink-0" />
                        <span className="break-words">{v}</span>
                      </div>
                    ))}
                  <div className="flex items-center gap-2 pt-2">
                    {hasPermission?.('suppliers', 'edit') && (
                      <button onClick={() => openEdit?.(selected)}
                        className="h-8 px-3 rounded-lg border border-border text-[12px] font-semibold text-ink-secondary hover:bg-muted inline-flex items-center gap-1.5">
                        <Edit3 size={12} /> Edit
                      </button>
                    )}
                    {hasPermission?.('suppliers', 'delete') && (
                      <button onClick={() => handleDelete?.(selected)}
                        className="h-8 px-3 rounded-lg border border-red-200 text-[12px] font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5">
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground pt-1">
                    {selected._f.billCount || 0} bills · {formatCurrency(selected._f.purchased || 0, cur)} purchased
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <div className="text-[13px] font-semibold text-foreground">No supplier selected</div>
            <div className="text-[12px] text-muted-foreground mt-1">Pick one from the list to see its bills and payments.</div>
            {hasPermission?.('suppliers', 'create') && (
              <button onClick={openAdd}
                className="mt-3 h-9 px-4 rounded-lg bg-accent-signature hover:bg-accent-signature-hover text-white text-[13px] font-bold inline-flex items-center gap-1.5">
                <Plus size={14} /> Add supplier
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SupplierWorkspace;
