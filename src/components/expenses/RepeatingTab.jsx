import React, { useState } from 'react';
import { Repeat, X, Plus } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';
import WriteFailure from '../invoices/WriteFailure';
import { describeRecurring, paymentLabel } from '../../lib/recurring';
import { cn } from '../../lib/utils';
import { Pill, rupees } from './parts';

/**
 * Repeating expenses (expenses-06, 07): the templates the nightly job logs
 * from. Pause / Resume and Remove are the page's old actions, now with their
 * failures said out loud instead of dropped.
 */
export default function RepeatingTab({ templates = [], sym = '₹', canAdd, onNew, setRecurringActive, deleteRecurringTemplate, onReread }) {
  const [busyId, setBusyId] = useState(null);
  const [failure, setFailure] = useState(null);     // { error, noun }
  const [removing, setRemoving] = useState(null);
  const onCount = templates.filter((t) => t.active).length;

  const toggle = async (t) => {
    setBusyId(t.id); setFailure(null);
    let res;
    try { res = await setRecurringActive(t.id, !t.active); } catch (e) { res = { error: e }; }
    setBusyId(null);
    if (res?.error) { console.error('[expenses] pause/resume failed', res.error); setFailure({ error: res.error, noun: t.active ? 'pause' : 'resume' }); }
  };

  return (
    <>
      <div className="m-rise mb-3.5 flex flex-wrap items-center gap-2.5 rounded-xl bg-tile px-3.5 py-[11px] text-[13px] text-ink-2" style={{ '--i': 1 }}>
        <Repeat size={16} className="shrink-0 text-body" />
        <span className="min-w-0 flex-1">Each one is logged by itself every night on its days. To add one, turn on Repeat when you log a new expense.</span>
        {canAdd && <Button size="sm" onClick={onNew}><Plus /> New expense</Button>}
      </div>

      {failure && <WriteFailure error={failure.error} noun={failure.noun} onReread={onReread} className="mb-3" />}

      {templates.length === 0 ? (
        <div className="m-rise rounded-[14px] border border-dashed border-[#E2E2E0] px-5 py-14 text-center" style={{ '--i': 2 }}>
          <div className="mx-auto mb-3.5 grid h-[52px] w-[52px] place-items-center rounded-2xl bg-tile text-body"><Repeat size={24} strokeWidth={1.7} /></div>
          <h3 className="font-tight text-[17px] font-semibold">No repeating expenses</h3>
          <p className="mt-1 text-[13.5px] text-body">Rent, salaries or tea every day: turn on Repeat when you log one and it is logged by itself.</p>
        </div>
      ) : (
        <>
          <div className="m-rise" style={{ '--i': 2 }} data-testid="recurring-list">
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Expense</TableHead>
                  <TableHead>Repeats</TableHead>
                  <TableHead>Paid via</TableHead>
                  <TableHead numeric>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[150px]"><span className="sr-only">Actions</span></TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id} data-testid="recurring-item">
                    <TableCell>
                      <span className={cn('block font-tight text-[14px] font-semibold', !t.active && 'text-body')}>{t.note || t.category}</span>
                      <small className="text-[12px] text-mute">{t.category || 'Other'}</small>
                      {t.last_error && (
                        <span className="mt-[3px] block text-[12px] text-bad-text" title={t.last_error}>
                          Couldn’t log{t.last_error_at ? ` on ${new Date(t.last_error_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}: {t.last_error.slice(0, 120)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{describeRecurring(t)}</TableCell>
                    <TableCell className="whitespace-nowrap">{paymentLabel(t.payment_method)}</TableCell>
                    <TableCell numeric className={cn('whitespace-nowrap', !t.active && 'text-body')}>{rupees(t.amount, sym)}</TableCell>
                    <TableCell>
                      {!t.active ? <Pill>Paused</Pill> : t.last_error ? <Pill tone="bad">Couldn’t log</Pill> : <Pill tone="good">On</Pill>}
                    </TableCell>
                    <TableCell numeric>
                      <span className="inline-flex items-center gap-1.5">
                        <Button variant="secondary" size="xs" onClick={() => toggle(t)} disabled={busyId === t.id}>
                          {busyId === t.id ? '…' : t.active ? 'Pause' : 'Resume'}
                        </Button>
                        <button type="button" aria-label={`Remove ${t.note || t.category}`} title="Remove" onClick={() => setRemoving(t)}
                          className="m-press grid h-[30px] w-[30px] place-items-center rounded-full text-mute hover:bg-bad-soft hover:text-bad-text">
                          <X size={14} />
                        </button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center px-1 pt-3.5 text-[13px] text-body">
            {templates.length} repeating {templates.length === 1 ? 'expense' : 'expenses'} · {onCount} on, {templates.length - onCount} paused
          </div>
        </>
      )}

      <RemoveDialog template={removing} sym={sym} onClose={() => setRemoving(null)} onReread={onReread}
        onRemove={(t) => deleteRecurringTemplate(t.id)} />
    </>
  );
}

function RemoveDialog({ template, sym, onClose, onRemove, onReread }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const t = template;
  const close = () => { if (!busy) { setError(null); onClose(); } };
  const go = async () => {
    setBusy(true); setError(null);
    let res;
    try { res = await onRemove(t); } catch (e) { res = { error: e }; }
    setBusy(false);
    if (res?.error) { console.error('[expenses] remove repeat failed', res.error); setError(res.error); return; }
    onClose();
  };
  return (
    <Dialog open={!!t} onClose={close} width={440} label="Remove repeating expense"
      title="Remove this repeating expense?"
      subtitle={t ? `${t.note || t.category} · ${rupees(t.amount, sym)} · ${describeRecurring(t).replace(/^Every/, 'every').replace(/^Monthly/, 'monthly')}` : ''}
      footer={(
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={go} disabled={busy}>{busy ? 'Removing…' : error ? 'Try again' : 'Remove'}</Button>
        </>
      )}>
      <p className="text-[14px] text-ink-2">It stops being logged from tonight. Expenses it already logged stay in the list. To stop it for a while instead, use Pause.</p>
      {error && <WriteFailure error={error} noun="removal" onReread={() => { onReread?.(); onClose(); }} className="mt-3" />}
    </Dialog>
  );
}
