import React from 'react';
import { Banknote, Landmark, Smartphone } from 'lucide-react';
import Dialog from '../../../components/ui/Dialog';
import OptionCard, { OptionGroup } from '../../../components/ui/OptionCard';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { formatCurrency, formatDate } from '../../../lib/utils';

const METHODS = [
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'BANK', label: 'Bank', icon: Landmark },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
];
const whole = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * Record payment (mockup purchases-05). Presentational: the page owns the
 * amount, method and date, and its submitPay is the only thing that pays.
 */
export default function PayBillsDialog({
  target, due, overdue, voucherNoOf, amount, setAmount, method, setMethod, date, setDate,
  submitting, onSubmit, onClose,
}) {
  const open = !!target;
  const bills = target?.bills || [];
  const many = bills.length > 1;
  const amt = Number(amount);
  const subtitle = target
    ? `${many ? `${bills.length} bills` : (bills[0]?.bill_no || voucherNoOf(bills[0] || target))} · ${target.supplier_name || ''}`
    : '';
  const lbl = 'mt-3.5 mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2';
  const kv = 'flex justify-between py-1 text-[13px] text-body';
  const kvv = 'font-tight text-[13.5px] font-semibold text-ink tabular-nums text-right';

  return (
    <Dialog open={open} onClose={onClose} title="Record payment" subtitle={subtitle} width={440}
      footer={target && (
        <>
          <Button variant="secondary" className="!flex-none px-[18px]" onClick={onClose}>Cancel</Button>
          <Button onClick={onSubmit} disabled={submitting || !(amt > 0)}>
            {submitting ? 'Recording…' : `Record payment${amt > 0 ? ` · ${whole(amt)}` : ''}`}
          </Button>
        </>
      )}>
      {target && (
        <div data-testid="pay-dialog">
          {many && (
            <div className="mb-3 rounded-xl shadow-[inset_0_0_0_1px_var(--color-line)]">
              {bills.map((b) => (
                <div key={b.id} className="flex justify-between gap-3 border-t border-sep px-3.5 py-[9px] text-[13px] first:border-t-0">
                  <span className="truncate"><b className="font-tight font-semibold">{b.bill_no || voucherNoOf(b)}</b>
                    <span className="text-mute"> · {formatDate(b.date)}</span></span>
                  <b className={`font-tight font-semibold tabular-nums ${b.state === 'over' ? 'text-bad-text' : ''}`}>{formatCurrency(b.due).slice(1)}</b>
                </div>
              ))}
              <p className="border-t border-sep px-3.5 pb-2.5 pt-2 text-[12px] text-mute">A part payment settles the oldest bill first.</p>
            </div>
          )}
          <div className={kv}><span>{many ? 'Bills total' : 'Bill total'}</span><span className={kvv}>{formatCurrency(target.total_amount)}</span></div>
          <div className={kv}><span>Already paid</span><span className={kvv}>{formatCurrency(target.paid_amount || 0)}</span></div>
          <div className={`${kv} mt-1.5 border-t border-line pt-[9px] font-semibold text-ink`}>
            <span>Due</span>
            <span className={kvv}>
              {formatCurrency(due)}
              {overdue > 0.005 && <small className="block font-tight text-[12px] font-semibold text-bad-text">{Math.abs(overdue - due) < 0.005 ? 'all overdue' : `${formatCurrency(overdue)} overdue`}</small>}
            </span>
          </div>

          <label className={lbl} htmlFor="pay-amount">Amount</label>
          <Input id="pay-amount" type="number" min="0" step="0.01" value={amount} autoFocus
            onChange={(e) => setAmount(e.target.value)} className="h-11 font-tight text-[16px] font-semibold" />

          <span className={lbl}>Method</span>
          <OptionGroup cols={3} aria-label="Method">
            {METHODS.map((m) => (
              <OptionCard key={m.value} selected={method === m.value} onClick={() => setMethod(m.value)}
                icon={<m.icon />} title={m.label} className="justify-center" />
            ))}
          </OptionGroup>

          <label className={lbl} htmlFor="pay-date">Date</label>
          <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      )}
    </Dialog>
  );
}
