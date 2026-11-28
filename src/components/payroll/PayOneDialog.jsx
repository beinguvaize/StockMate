import React, { useEffect, useRef, useState } from 'react';
import { Banknote, Smartphone, Landmark } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import OptionCard, { OptionGroup } from '../ui/OptionCard';
import { fetchPayRun } from '../../lib/payRunClient';
import { payOne, payFailureText } from '../../lib/payrollCommit';
import { monthBounds, monthWords } from '../../lib/payrollView';
import { inr } from './parts';
import { useAdvancesAvailable } from '../../hooks/useStaffAdvances';
import { advanceOptions, APP_UPDATE_TEXT, detectAdvances } from '../../lib/staffAdvances';
import { supabase } from '../../lib/supabase';

/**
 * Pay one person what they are still owed for a month: the employee panel's
 * "Pay ₹7,000" (mockup 03) and the profile's "Pay now" (21).
 *
 * The amount is the server's, worked out again at the moment of paying, and
 * only this person's line is saved -- what the phone's employee sheet does.
 */
const ICON = { CASH: <Banknote />, UPI: <Smartphone />, BANK: <Landmark /> };

export default function PayOneDialog({ open, onClose, tenantId, employee, month, amount, planned = 0, accountFor, processPayroll, onPaid }) {
  // Staff advances (only on a database that has them): the server takes
  // back what is due from this pay. `planned` is its preview of that.
  const advancesOn = useAdvancesAvailable() === true;
  const [recovery, setRecovery] = useState(Number(planned) || 0);
  const [method, setMethod] = useState('CASH');
  const [shown, setShown] = useState(amount);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);       // { tone, text }
  const runId = useRef(null);

  useEffect(() => {
    if (!open) return;
    setShown(amount);
    setRecovery(Number(planned) || 0);
    setMsg(null);
    setBusy(false);
    runId.current = crypto.randomUUID();
  }, [open, amount, planned, employee?.id, month]);

  const win = monthBounds(month);
  const go = async () => {
    if (busy || !win || !employee) return;
    setBusy(true);
    setMsg(null);
    const out = await payOne({
      cost: (ids) => fetchPayRun({ tenantId, from: win.from, to: win.to, includeOnLeave: ids }),
      save: processPayroll,
      runId: runId.current,
      method,
      employeeId: employee.id,
      shownAmount: shown,
      options: (await detectAdvances(supabase)) ? advanceOptions() : null,
    });
    setBusy(false);
    if (out.status === 'saved') { onPaid?.(out.line, method, out.result); onClose(); return; }
    if (out.status === 'nothing') { setMsg({ tone: 'info', text: `Nothing is left to pay ${employee.name} for ${monthWords(month)}.` }); return; }
    if (out.status === 'update-required') { setMsg({ tone: 'bad', text: APP_UPDATE_TEXT }); detectAdvances(supabase, { force: true }); return; }
    if (out.status === 'changed') {
      setShown(out.line.netPay);
      setRecovery(Number(out.line.advancePlanned) || 0);
      setMsg({ tone: 'warn', text: `The amount is now ${inr(out.line.netPay)}: attendance or a payment changed since this opened. Check it and press Pay again.` });
      return;
    }
    if (out.status === 'cost-failed') { setMsg({ tone: 'bad', text: `Nothing was paid: the pay figures could not be worked out. ${out.error?.message || ''}` }); return; }
    setMsg({ tone: out.failure.maySaved ? 'warn' : 'bad', text: payFailureText(out.failure, { again: 'Press Pay again' }) });
  };

  const acc = (m) => accountFor?.(m);
  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} width={460} title={`Pay ${employee?.name || ''}`}
      subtitle={`${inr(shown)} still to pay for ${monthWords(month)}`}>
      <span className="mb-2 block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Paid by</span>
      <OptionGroup cols={3} aria-label="Paid by">
        {['CASH', 'UPI', 'BANK'].map((m) => (
          <OptionCard key={m} selected={method === m} onClick={() => setMethod(m)} icon={ICON[m]}
            title={{ CASH: 'Cash', UPI: 'UPI', BANK: 'Bank' }[m]} hint={acc(m) || undefined} />
        ))}
      </OptionGroup>
      {advancesOn && recovery > 0 ? (
        <p className="mt-3 text-[12.5px] text-body">
          {inr(recovery)} of the {inr(shown)} earned is taken back against {employee?.name?.split(' ')[0] || 'their'}’s advance (the server works it out again as it saves), so about {inr(Math.max(0, shown - recovery))} leaves {acc(method) || 'the matching account'}. The salary expense stays {inr(shown)}.
        </p>
      ) : (
        <p className="mt-3 text-[12.5px] text-body">One salary expense of {inr(shown)} goes to DayBook, the P&amp;L and {acc(method) || 'the matching account'}.</p>
      )}
      {msg && (
        <p role="alert" className={`mt-3 rounded-[10px] px-3 py-2 text-[12.5px] break-words ${msg.tone === 'bad' ? 'bg-bad-soft text-bad-text' : msg.tone === 'warn' ? 'bg-amber-soft text-amber-text' : 'bg-tile text-ink-2'}`}>{msg.text}</p>
      )}
      <div className="mt-5 flex gap-2 [&>*]:flex-1">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={go} disabled={busy || !(Number(shown) > 0)}>{busy ? 'Paying…' : `Pay ${inr(shown)}`}</Button>
      </div>
    </Dialog>
  );
}
