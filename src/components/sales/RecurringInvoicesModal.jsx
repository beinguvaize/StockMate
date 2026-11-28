import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Play, Pause, X, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import WriteFailure from '../invoices/WriteFailure';
import { formatShortDateTime } from '../../lib/utils';

// Recurring invoices manager — templates auto-generate invoices nightly
// (generate_due_recurring_invoices RPC via the recurring cron workflow).
//
// Web redesign (approved invoices-13 and 14): same list, same form, same
// writes. Pause, resume, delete and the list read now show the server's
// answer when it refuses instead of carrying on as if nothing happened.

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyLine = () => ({ name: '', qty: 1, rate: 0, taxRate: 18 });
const initials = (name = '') => String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
const dayLong = (ymd) => {
  const d = formatShortDateTime(String(ymd || '').slice(0, 10));
  return d ? `${d} ${String(ymd).slice(0, 4)}` : ymd;
};

const selectCls = 'h-9 w-full appearance-none rounded-[10px] bg-surface px-3 pr-8 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]';
const Lbl = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">{children}</label>
);
const Select = ({ id, value, onChange, children, ariaLabel }) => (
  <div className="relative">
    <select id={id} value={value} onChange={onChange} aria-label={ariaLabel} className={selectCls}>{children}</select>
    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute" />
  </div>
);

const RecurringInvoicesModal = ({ tenantId, clients = [], onClose }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [creating, setCreating] = useState(false);
  const [rowErr, setRowErr] = useState(null);

  // create form
  const [clientId, setClientId] = useState('');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [nextRun, setNextRun] = useState(todayISO());
  const [lines, setLines] = useState([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('recurring_invoice_templates')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setLoadErr(error || null);
    setTemplates(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const taxable = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);
    const tax = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0) * Number(l.taxRate || 0) / 100, 0);
    return { taxable, tax, total: taxable + tax };
  }, [lines]);

  const saveTemplate = async () => {
    setErr('');
    const client = clients.find(c => c.id === clientId);
    const validLines = lines.filter(l => l.name.trim() && Number(l.qty) > 0 && Number(l.rate) > 0);
    if (!client) { setErr('Pick a client.'); return; }
    if (!validLines.length) { setErr('Add at least one line with name, qty and rate.'); return; }
    setBusy(true);
    const { error } = await supabase.from('recurring_invoice_templates').insert({
      tenant_id: tenantId,
      client_id: client.id,
      client_name: client.name,
      items: validLines.map(l => ({
        name: l.name.trim(), qty: Number(l.qty), rate: Number(l.rate),
        taxRate: Number(l.taxRate || 0), unit: 'PCS',
      })),
      frequency,
      next_run: nextRun,
      active: true,
    });
    setBusy(false);
    if (error) { setErr(error); return; }
    setCreating(false);
    setClientId(''); setLines([emptyLine()]); setNextRun(todayISO());
    load();
  };

  const toggleActive = async (t) => {
    setRowErr(null);
    const { error } = await supabase.from('recurring_invoice_templates')
      .update({ active: !t.active }).eq('id', t.id);
    if (error) setRowErr(error);
    load();
  };
  const removeTemplate = async (t) => {
    setRowErr(null);
    const { error } = await supabase.from('recurring_invoice_templates')
      .update({ deleted_at: new Date().toISOString(), active: false }).eq('id', t.id);
    if (error) setRowErr(error);
    load();
  };
  const tmplTotal = (t) => (t.items || []).reduce(
    (s, i) => s + Number(i.qty || 0) * Number(i.rate || 0) * (1 + Number(i.taxRate || 0) / 100), 0);

  const setLine = (i, patch) => setLines(ls => ls.map((x, j) => j === i ? { ...x, ...patch } : x));

  if (creating) {
    return (
      <Dialog open onClose={onClose} width={600} title="New Recurring Invoice" subtitle="Rent, AMCs, subscriptions and standing orders"
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setCreating(false); setErr(''); }}>Cancel</Button>
            <Button variant="dark" onClick={saveTemplate} disabled={busy}>{busy ? 'Saving…' : 'Save recurring invoice'}</Button>
          </>
        )}>
        <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <Lbl htmlFor="rec-client">Client</Lbl>
            <Select id="rec-client" value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Lbl htmlFor="rec-freq">Repeats</Lbl>
            <Select id="rec-freq" value={frequency} onChange={e => setFrequency(e.target.value)}>
              <option value="MONTHLY">Every month</option>
              <option value="WEEKLY">Every week</option>
            </Select>
          </div>
          <div>
            <Lbl htmlFor="rec-first">First invoice on</Lbl>
            <Input id="rec-first" type="date" value={nextRun} min={todayISO()} onChange={e => setNextRun(e.target.value)} />
          </div>
        </div>

        <span className="mt-4 mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">Line items</span>
        <div className="grid grid-cols-[1fr_58px_86px_70px_30px] items-center gap-2 font-tight text-[11.5px] font-semibold text-mute">
          <span>Item or service</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span>GST</span><span />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="mt-2 grid grid-cols-[1fr_58px_86px_70px_30px] items-center gap-2">
            <Input value={l.name} placeholder="Item or service" aria-label={`Line ${i + 1} item`} onChange={e => setLine(i, { name: e.target.value })} className="h-[34px] text-[13px]" />
            <Input type="number" value={l.qty} min="0" aria-label={`Line ${i + 1} quantity`} onChange={e => setLine(i, { qty: e.target.value })} className="h-[34px] text-right text-[13px]" />
            <Input type="number" value={l.rate} min="0" aria-label={`Line ${i + 1} rate`} onChange={e => setLine(i, { rate: e.target.value })} className="h-[34px] text-right text-[13px]" />
            <Select value={l.taxRate} ariaLabel={`Line ${i + 1} GST`} onChange={e => setLine(i, { taxRate: e.target.value })}>
              {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
            </Select>
            <button type="button" aria-label={`Remove line ${i + 1}`} title="Remove"
              onClick={() => setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}
              className="m-press grid h-[30px] w-[30px] place-items-center rounded-full text-mute hover:bg-bad-soft hover:text-bad-text">
              <X size={13} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setLines(ls => [...ls, emptyLine()])}
          className="mt-2.5 font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-4">Add line</button>

        <div className="mt-3 flex items-center justify-between rounded-xl bg-tile px-3.5 py-3 text-[13px] text-body">
          <span className="tabular-nums">Taxable {money(totals.taxable)} · GST {money(totals.tax)}</span>
          <b className="font-tight text-[14px] font-semibold tabular-nums text-ink">{money(totals.total)} a {frequency === 'WEEKLY' ? 'week' : 'month'}</b>
        </div>

        {err && (typeof err === 'string'
          ? <p className="mt-3 text-[12.5px] font-medium text-bad-text">{err}</p>
          : <WriteFailure error={err} noun="recurring invoice" onReread={() => { setCreating(false); load(); }} className="mt-3" />)}
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} width={600} title="Recurring Invoices" subtitle="Made automatically each night when they fall due">
      <button type="button" onClick={() => setCreating(true)}
        className="m-press mb-1.5 flex w-full items-center justify-center gap-1.5 rounded-pill py-[11px] font-tight text-[13.5px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
        <Plus size={15} /> New recurring invoice
      </button>

      <WriteFailure error={rowErr} noun="change" onReread={load} className="my-2" />
      {loadErr && (
        <div role="alert" className="my-2 rounded-[10px] bg-bad-soft px-3 py-2.5 text-[12.5px] text-bad-text">
          <b className="block font-tight font-semibold">Could not load recurring invoices</b>
          {loadErr.message || String(loadErr)}{' '}
          <button type="button" onClick={load} className="font-tight font-semibold underline underline-offset-2">Try again</button>
        </div>
      )}

      {loading ? (
        <p className="py-6 text-center text-[13px] text-mute">Loading…</p>
      ) : !loadErr && templates.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-mute">
          No recurring invoices yet. Good for AMCs, rent, subscriptions and standing orders.
        </p>
      ) : templates.map(t => (
        <div key={t.id} className="flex items-center gap-3 border-t border-sep py-3 first-of-type:border-t-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-soft font-tight text-[12.5px] font-semibold text-amber-text">{initials(t.client_name)}</span>
          <div className="min-w-0 flex-1">
            <b className="flex items-center gap-1.5 font-tight text-[14px] font-semibold text-ink">
              <span className="truncate">{t.client_name}</span>
              {!t.active && <Badge tone="warn">Paused</Badge>}
            </b>
            <small className="block truncate text-[12.5px] text-mute tabular-nums">
              {(t.items || []).length} item{(t.items || []).length === 1 ? '' : 's'} · {money(tmplTotal(t))} ·{' '}
              {t.frequency === 'WEEKLY' ? 'Every week' : 'Every month'} · next {dayLong(t.next_run)}
            </small>
          </div>
          <Button variant="secondary" size="icon-sm" onClick={() => toggleActive(t)} title={t.active ? 'Pause' : 'Resume'} aria-label={t.active ? 'Pause' : 'Resume'}>
            {t.active ? <Pause size={13} /> : <Play size={13} />}
          </Button>
          <Button variant="secondary" size="icon-sm" onClick={() => removeTemplate(t)} title="Delete" aria-label="Delete"
            className="bg-bad-soft text-bad-text hover:bg-bad-soft">
            <Trash2 size={13} />
          </Button>
        </div>
      ))}

      <div className="-mx-[22px] -mb-4 mt-3 rounded-b-[18px] bg-tile px-[22px] py-[11px] text-[12px] text-body">
        Invoices are made automatically each night when due, marked Pending, and added to the client's account.
      </div>
    </Dialog>
  );
};

export default RecurringInvoicesModal;
