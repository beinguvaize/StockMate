import React, { useEffect, useMemo, useState } from 'react';
import { useDialogClose } from '../../hooks/useDialogClose';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Repeat, Play, Pause } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Recurring invoices manager — templates auto-generate invoices nightly
// (generate_due_recurring_invoices RPC via the recurring cron workflow).

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyLine = () => ({ name: '', qty: 1, rate: 0, taxRate: 18 });

const RecurringInvoicesModal = ({ tenantId, clients = [], onClose }) => {
  useDialogClose(onClose);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // create form
  const [clientId, setClientId] = useState('');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [nextRun, setNextRun] = useState(todayISO());
  const [lines, setLines] = useState([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('recurring_invoice_templates')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
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
    if (error) { setErr(error.message); return; }
    setCreating(false);
    setClientId(''); setLines([emptyLine()]); setNextRun(todayISO());
    load();
  };

  const toggleActive = async (t) => {
    await supabase.from('recurring_invoice_templates')
      .update({ active: !t.active }).eq('id', t.id);
    load();
  };
  const removeTemplate = async (t) => {
    await supabase.from('recurring_invoice_templates')
      .update({ deleted_at: new Date().toISOString(), active: false }).eq('id', t.id);
    load();
  };
  const tmplTotal = (t) => (t.items || []).reduce(
    (s, i) => s + Number(i.qty || 0) * Number(i.rate || 0) * (1 + Number(i.taxRate || 0) / 100), 0);

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat size={17} className="text-accent-signature" />
            <h2 className="text-[15px] font-black text-ink-primary">Recurring Invoices</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!creating && (
            <>
              <button onClick={() => setCreating(true)}
                className="w-full py-2.5 rounded-xl border border-dashed border-accent-signature/50 text-accent-signature text-[12px] font-black hover:bg-accent-signature/5 flex items-center justify-center gap-1.5">
                <Plus size={14} /> New recurring invoice
              </button>

              {loading ? (
                <p className="text-center text-[12px] text-gray-400 py-6">Loading…</p>
              ) : templates.length === 0 ? (
                <p className="text-center text-[12px] text-gray-400 py-6">
                  No recurring invoices yet. Perfect for AMCs, rent, subscriptions and standing orders.
                </p>
              ) : templates.map(t => (
                <div key={t.id} className="border border-black/5 rounded-xl p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-ink-primary truncate">{t.client_name}</div>
                    <div className="text-[11px] text-gray-500">
                      {(t.items || []).length} item{(t.items || []).length === 1 ? '' : 's'} · {money(tmplTotal(t))} ·{' '}
                      {t.frequency === 'WEEKLY' ? 'Every week' : 'Every month'} · next {t.next_run}
                      {!t.active && <span className="ml-2 text-accent-signature font-bold">PAUSED</span>}
                    </div>
                  </div>
                  <button onClick={() => toggleActive(t)} title={t.active ? 'Pause' : 'Resume'}
                    className="w-8 h-8 rounded-lg border border-black/10 flex items-center justify-center hover:bg-gray-50">
                    {t.active ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button onClick={() => removeTemplate(t)} title="Delete"
                    className="w-8 h-8 rounded-lg border border-black/10 flex items-center justify-center text-red-500 hover:bg-red-50">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </>
          )}

          {creating && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Client</label>
                  <select value={clientId} onChange={e => setClientId(e.target.value)}
                    className="w-full border border-black/10 rounded-lg px-2.5 py-2 text-[13px]">
                    <option value="">Select client…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Repeats</label>
                  <select value={frequency} onChange={e => setFrequency(e.target.value)}
                    className="w-full border border-black/10 rounded-lg px-2.5 py-2 text-[13px]">
                    <option value="MONTHLY">Every month</option>
                    <option value="WEEKLY">Every week</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">First invoice on</label>
                  <input type="date" value={nextRun} min={todayISO()}
                    onChange={e => setNextRun(e.target.value)}
                    className="w-full border border-black/10 rounded-lg px-2.5 py-2 text-[13px]" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1.5">Line items</label>
                <div className="space-y-2">
                  {lines.map((l, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={l.name} placeholder="Item / service"
                        onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        className="flex-1 border border-black/10 rounded-lg px-2.5 py-2 text-[13px]" />
                      <input type="number" value={l.qty} min="0" placeholder="Qty"
                        onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                        className="w-16 border border-black/10 rounded-lg px-2 py-2 text-[13px] text-right" />
                      <input type="number" value={l.rate} min="0" placeholder="Rate"
                        onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))}
                        className="w-24 border border-black/10 rounded-lg px-2 py-2 text-[13px] text-right" />
                      <select value={l.taxRate}
                        onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, taxRate: e.target.value } : x))}
                        className="w-20 border border-black/10 rounded-lg px-1.5 py-2 text-[12px]">
                        {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                      </select>
                      <button onClick={() => setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}
                        className="w-8 h-8 shrink-0 rounded-lg border border-black/10 text-gray-400 hover:text-red-500 flex items-center justify-center">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setLines(ls => [...ls, emptyLine()])}
                    className="text-[12px] font-bold text-accent-signature hover:underline">+ Add line</button>
                </div>
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 text-[12px]">
                <span className="text-gray-500">Taxable {money(totals.taxable)} · GST {money(totals.tax)}</span>
                <span className="font-black text-ink-primary text-[14px]">{money(totals.total)} / {frequency === 'WEEKLY' ? 'week' : 'month'}</span>
              </div>

              {err && <p className="text-[12px] font-semibold text-red-600">{err}</p>}

              <div className="flex gap-2 justify-end">
                <button onClick={() => { setCreating(false); setErr(''); }}
                  className="px-4 py-2 rounded-lg border border-black/10 text-[12px] font-bold text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={saveTemplate} disabled={busy}
                  className="px-4 py-2 rounded-lg bg-ink-primary text-white text-[12px] font-black disabled:opacity-50">
                  {busy ? 'Saving…' : 'Save recurring invoice'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-black/5 text-[11px] text-gray-400">
          Invoices generate automatically every night when due, marked UNPAID, and appear in this list’s client account.
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RecurringInvoicesModal;
