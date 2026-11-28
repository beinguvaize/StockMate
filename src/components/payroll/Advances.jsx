import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HandCoins, Pencil, XCircle } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Seg } from '../documents/DocParts';
import { RowMenu, MenuItem } from '../ui/RowMenu';
import ConfirmDialog from './ConfirmDialog';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { dayWords, methodLabel } from '../../lib/payrollView';
import { cn } from '../../lib/utils';
import { inr, Card, Pill, EmptyState, ErrorBar } from './parts';

/**
 * Staff advances on the employee profile (approved payroll-26, 27, 32).
 *
 * Every figure here is read from the server's views (staff_advance_balances,
 * staff_advance_status, staff_advance_entries) and every change is one of its
 * functions; the page adds nothing up. Shown only on a database that has
 * advances (lib/staffAdvances.detectAdvances).
 */

const TYPES = [['CASH', 'Cash'], ['UPI', 'UPI'], ['BANK', 'Bank']];

/** The account an advance is paid from (or paid back into), by its own type: UPI stays UPI. */
export function accountOfType(accounts = [], type) {
  const live = (accounts || []).filter((a) => !a.deleted_at && String(a.type).toUpperCase() !== 'LOAN');
  const t = String(type || '').toUpperCase();
  return live.find((a) => String(a.type).toUpperCase() === t && a.is_default)
    || live.find((a) => String(a.type).toUpperCase() === t) || null;
}
const typesOn = (accounts) => TYPES.filter(([t]) => accountOfType(accounts, t));

/** The words for a failed advance write. Never "not saved" when it may have saved. */
function failText(error, noun, again) {
  const f = classifyWriteFailure(error, { noun });
  return f.maySaved
    ? `Couldn't confirm this ${noun}: the connection dropped before the server answered. ${again}: if it did go through, nothing is entered twice. (${f.detail})`
    : f.detail;
}

const entryWords = { GIVEN: 'Advance given', RECOVERY: 'Taken back from pay', COLLECTION: 'Paid back', WRITE_OFF: 'Written off' };

/** The Advances page (26). */
export function AdvancesPage({ emp, adv, m = inr, accounts, onGive, onEdit, onSettle, inactive }) {
  const first = emp.name.split(' ')[0];
  const [cancelling, setCancelling] = useState(null);
  const accName = (id) => (accounts || []).find((a) => a.id === id)?.name || null;
  if (adv.error) return <ErrorBar>Advances could not be loaded: {adv.error.message}</ErrorBar>;
  if (!adv.loaded) return <p className="py-8 text-center text-mute">Loading advances…</p>;
  const outstanding = Number(adv.balance?.outstanding || 0);
  const list = [...(adv.advances || [])].reverse();
  return (
    <div className="m-rise">
      {list.length === 0 ? (
        <EmptyState icon={HandCoins} title="No advances" text={`Money given to ${first} ahead of pay shows here, with what each pay run takes back.`}>
          {!inactive && <Button onClick={onGive}>Give advance</Button>}
        </EmptyState>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-4">
            {inactive && outstanding > 0 && (
              <Card title="Final settlement" aside={<Pill tone="warn">Open</Pill>}>
                <Line k={`${first} owes the shop`} v={m(outstanding)} strong />
                <p className="mt-2 text-[12.5px] text-body">{first} is inactive, so no pay run will take this back. Record it as paid back into an account, or write it off (an expense).</p>
                <Button className="mt-3" onClick={onSettle}>Record settlement</Button>
              </Card>
            )}
            {list.map((a) => {
              const touched = Number(a.recovered) + Number(a.collected) + Number(a.written_off) > 0;
              return (
                <Card key={a.advance_id} title={`Advance of ${dayWords(a.given_on, { year: false })}`}
                  aside={(
                    <div className="flex items-center gap-2">
                      <Pill tone={Number(a.outstanding) > 0 ? 'warn' : 'good'}>{Number(a.outstanding) > 0 ? `${m(a.outstanding)} outstanding` : a.status === 'SETTLED' ? 'Settled' : 'Taken back'}</Pill>
                      <RowMenu label="Advance actions" trigger={({ ref, onClick, open }) => (
                        <Button ref={ref} size="xs" variant="outline" aria-label="Advance actions" aria-haspopup="menu" aria-expanded={open} onClick={onClick}>···</Button>
                      )}>
                        {(close) => (
                          <>
                            <MenuItem icon={Pencil} onClick={() => { close(); onEdit(a); }}>Change</MenuItem>
                            <MenuItem icon={XCircle} danger disabled={touched} title={touched ? 'Part of it has been taken back' : undefined}
                              hint={touched ? 'Part has been taken back' : undefined}
                              onClick={() => { close(); setCancelling(a); }}>Cancel advance</MenuItem>
                          </>
                        )}
                      </RowMenu>
                    </div>
                  )}>
                  <Line k="Given" note={[dayWords(a.given_on), methodLabel(a.method), accName(a.account_id), a.note].filter(Boolean).join(' · ')} v={m(a.amount)} />
                  <Line k="Taken back each pay run" note="never more than the pay" v={Number(a.recovery_per_run) > 0 ? `${m(a.recovery_per_run)} a run` : 'Not taken back'} />
                  <Line k="Taken back from pay so far" v={m(a.recovered)} />
                  {Number(a.collected) > 0 && <Line k="Paid back" v={m(a.collected)} />}
                  {Number(a.written_off) > 0 && <Line k="Written off" v={m(a.written_off)} />}
                  <Line k="Outstanding" v={m(a.outstanding)} strong />
                </Card>
              );
            })}
          </div>
          <div className="grid gap-4">
            <Card title="Next pay run">
              <Line k="Still owed" v={m(outstanding)} />
              <Line k="Next run takes back" note="the server works the exact figure out when the run is paid" v={inactive ? '—' : m(adv.balance?.due_per_run || 0)} strong />
              <p className="mt-2 text-[12px] text-mute">Skip it, or take everything owed, for one run on Run payroll.</p>
            </Card>
            <Card title="History">
              {(adv.entries || []).length === 0 ? <p className="text-[13px] text-body">Nothing yet.</p>
                : [...adv.entries].reverse().map((e) => (
                  <div key={e.id} className="flex items-center gap-2.5 border-b border-sep py-2.5 text-[13px] last:border-b-0">
                    <i className={cn('h-2 w-2 shrink-0 rounded-full', e.kind === 'GIVEN' ? 'bg-amber' : e.kind === 'WRITE_OFF' ? 'bg-bad' : 'bg-good')} />
                    <div className="min-w-0"><b className="block font-tight font-semibold">{entryWords[e.kind] || e.kind}</b>
                      <small className="text-[12px] text-mute">{[dayWords(e.on_date), e.kind === 'GIVEN' || e.kind === 'COLLECTION' ? accName(e.account_id) : null, e.note].filter(Boolean).join(' · ')}</small></div>
                    <span className="ml-auto font-tight font-semibold tabular-nums">{e.kind === 'GIVEN' ? m(e.amount) : m(-e.amount)}</span>
                  </div>
                ))}
            </Card>
            {!inactive && (
              <Card title={`If ${first} leaves`}>
                <p className="text-[12.5px] text-body">Anything still outstanding shows here as a final settlement: paid back into an account, or written off.</p>
              </Card>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog open={!!cancelling} onClose={() => setCancelling(null)} title="Cancel this advance?"
        text={cancelling ? `The ${inr(cancelling.amount)} given on ${dayWords(cancelling.given_on)} is removed, and the money goes back on the account it was paid from. Use this for an advance entered by mistake.` : ''}
        confirmLabel="Cancel advance" cancelLabel="Keep it"
        onConfirm={async () => {
          const res = await adv.cancel(cancelling.advance_id);
          return res.success ? null : failText(res.error, 'cancel', 'Press Cancel advance again');
        }} />
    </div>
  );
}

const Line = ({ k, v, note, strong }) => (
  <div className={cn('flex justify-between gap-3 border-b border-sep py-[9px] text-[13.5px] last:border-b-0', strong && 'font-tight text-[14.5px] font-semibold')}>
    <span className="text-ink-2">{k}{note && <small className="block font-sans text-[12px] font-normal text-mute">{note}</small>}</span>
    <span className="whitespace-nowrap font-tight tabular-nums">{v}</span>
  </div>
);

/**
 * Give advance (27), and Change for an existing one. One id per opening of
 * the dialog, reused on every press, so a retry after a lost reply cannot
 * give the advance twice.
 */
export function GiveAdvanceDialog({ open, onClose, emp, accounts, today, editing = null, earnedSoFar = null, adv, onDone }) {
  const first = emp?.name?.split(' ')[0] || '';
  const types = typesOn(accounts);
  const [amount, setAmount] = useState('');
  const [givenOn, setGivenOn] = useState(today);
  const [type, setType] = useState('CASH');
  const [back, setBack] = useState('PER_RUN');   // PER_RUN | ALL | NONE
  const [perRun, setPerRun] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const id = useRef(null);

  useEffect(() => {
    if (!open) return;
    id.current = editing?.advance_id || crypto.randomUUID();
    setMsg(null);
    setBusy(false);
    if (editing) {
      setAmount(String(Number(editing.amount)));
      setGivenOn(String(editing.given_on).slice(0, 10));
      const acc = (accounts || []).find((a) => a.id === editing.account_id);
      setType(String(acc?.type || editing.method || 'CASH').toUpperCase());
      const r = Number(editing.recovery_per_run);
      setBack(r <= 0 ? 'NONE' : r >= Number(editing.amount) ? 'ALL' : 'PER_RUN');
      setPerRun(r > 0 && r < Number(editing.amount) ? String(r) : '');
      setNote(editing.note || '');
    } else {
      setAmount(''); setGivenOn(today); setType(types[0]?.[0] || 'CASH'); setBack('PER_RUN'); setPerRun(''); setNote('');
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const amt = Number(amount);
  const per = back === 'NONE' ? 0 : back === 'ALL' ? amt : Number(perRun);
  const account = accountOfType(accounts, type);
  const locked = !!editing && Number(editing.recovered) + Number(editing.collected) + Number(editing.written_off) > 0;
  const problem = !(amt > 0) ? 'Enter the amount.' : !givenOn ? 'Choose the date.' : !account ? 'Add a cash, UPI or bank account first (Cash & Bank).'
    : back === 'PER_RUN' && !(Number(perRun) > 0) ? 'Enter how much each pay run takes back, or pick another option.' : null;
  const over = !editing && earnedSoFar != null && amt > Number(earnedSoFar);

  const go = async () => {
    if (busy || problem) return;
    setBusy(true);
    setMsg(null);
    const payload = { id: id.current, amount: amt, accountId: account.id, givenOn, recoveryPerRun: per, note: note.trim() };
    const res = editing ? await adv.update(payload) : await adv.give(payload);
    setBusy(false);
    if (res.success) { onDone?.(res, editing ? 'changed' : 'given'); onClose(); return; }
    setMsg(failText(res.error, editing ? 'change' : 'advance', editing ? 'Press Save again' : 'Press Give advance again'));
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} width={520}
      title={editing ? `Change ${first}’s advance` : `Give advance to ${emp?.name || ''}`}
      subtitle={`Money paid ahead of wages, taken back from ${first}’s pay runs`}>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col"><span className="mb-1 text-[12px] text-mute">Amount (₹)</span>
          <Input type="number" min="0" inputMode="decimal" value={amount} disabled={locked} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="flex flex-col"><span className="mb-1 text-[12px] text-mute">Date</span>
          <Input type="date" value={givenOn} max={today} disabled={locked} onChange={(e) => setGivenOn(e.target.value)} /></label>
        <div className="col-span-2"><span className="mb-1 block text-[12px] text-mute">Paid from</span>
          {types.length ? <Seg value={type} onChange={locked ? () => {} : setType} options={types} ariaLabel="Paid from" /> : <p className="text-[12.5px] text-bad-text">No cash, UPI or bank account yet.</p>}
          {account && <small className="mt-1 block text-[12px] text-mute">{account.name}</small>}
        </div>
        <div className="col-span-2"><span className="mb-1 block text-[12px] text-mute">Take it back</span>
          <Seg value={back} onChange={setBack} ariaLabel="Take it back"
            options={[['PER_RUN', 'An amount each run'], ['ALL', 'All from next run'], ['NONE', 'Don’t take back']]} />
          {back === 'PER_RUN' && (
            <label className="mt-2 flex items-center gap-2 text-[13px] text-body">₹
              <Input type="number" min="0" inputMode="decimal" className="w-[120px]" value={perRun} onChange={(e) => setPerRun(e.target.value)} aria-label="Taken back each pay run" /> each pay run, never more than the pay</label>
          )}
        </div>
        <label className="col-span-2 flex flex-col"><span className="mb-1 text-[12px] text-mute">Note, optional</span>
          <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {locked && <p className="mt-3 rounded-[10px] bg-tile px-3 py-2 text-[12.5px] text-body">Part of this advance has already been taken back, so its amount, account and date can no longer change. How much each run takes back, and the note, still can.</p>}
      {over && <p className="mt-3 rounded-[10px] bg-amber-soft px-3 py-2 text-[12.5px] text-amber-text">{inr(amt)} is more than the {inr(earnedSoFar)} {first} has earned so far this month. You can still give it; it is taken back over the coming pay runs.</p>}
      <p className="mt-3 rounded-[10px] bg-tile px-3 py-2 text-[12.5px] text-body">Leaves <b className="font-semibold text-ink">{account?.name || 'the account'}</b> as a staff advance. It is not an expense and does not touch profit; the salary does when it is earned.</p>
      {msg && <p role="alert" className="mt-3 rounded-[10px] bg-bad-soft px-3 py-2 text-[12.5px] text-bad-text break-words">{msg}</p>}
      <div className="mt-5 flex gap-2 [&>*]:flex-1">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={go} disabled={busy || !!problem} title={problem || undefined}>
          {busy ? 'Saving…' : editing ? 'Save' : `Give advance${amt > 0 ? ` · ${inr(amt)}` : ''}`}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Record settlement (32): an inactive employee's outstanding advance, paid
 * back into an account or written off. Asks once more, stating the amount and
 * that a write-off is an expense. One op id per opening, reused on retry.
 */
export function SettleDialog({ open, onClose, emp, accounts, today, outstanding, adv, onDone }) {
  const first = emp?.name?.split(' ')[0] || '';
  const types = typesOn(accounts);
  const [mode, setMode] = useState('COLLECT');
  const [type, setType] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [on, setOn] = useState(today);
  const [asking, setAsking] = useState(false);
  const opId = useRef(null);
  useEffect(() => {
    if (!open) return;
    opId.current = crypto.randomUUID();
    setMode('COLLECT'); setType(types[0]?.[0] || 'CASH'); setAmount(String(Number(outstanding) || '')); setOn(today); setAsking(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const amt = Number(amount);
  const account = accountOfType(accounts, type);
  const problem = !(amt > 0) ? 'Enter the amount.' : amt > Number(outstanding) ? `That is more than ${first} owes (${inr(outstanding)}).`
    : mode === 'COLLECT' && !account ? 'Choose the account the money came into.' : null;
  const words = useMemo(() => (mode === 'COLLECT'
    ? `${inr(amt)} paid back by ${first} into ${account?.name || 'the account'} on ${dayWords(on)}.`
    : `${inr(amt)} of ${first}’s advance written off on ${dayWords(on)}. A write-off counts as an expense: it lowers profit by ${inr(amt)}. No money moves.`),
  [mode, amt, first, account, on]);
  return (
    <>
      <Dialog open={open && !asking} onClose={onClose} width={480} title="Record settlement" subtitle={`${first} owes the shop ${inr(outstanding)} in advances`}>
        <Seg value={mode} onChange={setMode} ariaLabel="How it was settled" options={[['COLLECT', 'Paid back'], ['WRITE_OFF', 'Write off']]} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col"><span className="mb-1 text-[12px] text-mute">Amount (₹)</span>
            <Input type="number" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="flex flex-col"><span className="mb-1 text-[12px] text-mute">Date</span>
            <Input type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} /></label>
          {mode === 'COLLECT' && (
            <div className="col-span-2"><span className="mb-1 block text-[12px] text-mute">Paid into</span>
              <Seg value={type} onChange={setType} options={types} ariaLabel="Paid into" />
              {account && <small className="mt-1 block text-[12px] text-mute">{account.name}</small>}
            </div>
          )}
        </div>
        <div className="mt-5 flex gap-2 [&>*]:flex-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => setAsking(true)} disabled={!!problem} title={problem || undefined}>Continue</Button>
        </div>
      </Dialog>
      <ConfirmDialog open={open && asking} onClose={() => setAsking(false)} tone="warn"
        title={mode === 'COLLECT' ? `Record ${inr(amt)} paid back?` : `Write off ${inr(amt)}?`}
        text={words} confirmLabel={mode === 'COLLECT' ? 'Record payment' : 'Write off'}
        onConfirm={async () => {
          const res = await adv.settle({ opId: opId.current, mode, amount: amt, accountId: account?.id || null, on });
          if (res.success) { onDone?.(res, mode); onClose(); return null; }
          return failText(res.error, 'settlement', 'Press it again');
        }} />
    </>
  );
}
