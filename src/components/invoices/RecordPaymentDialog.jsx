import React, { useState } from 'react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { formatCurrency } from '../../lib/utils';
import { paymentCheck, STATUS_LABEL } from '../../lib/invoiceList';
import WriteFailure from './WriteFailure';

/**
 * Record payment on one invoice (approved mockup invoices-05).
 *
 * Only the look is new. The amount goes to `onRecord`, which is the Invoices
 * page's own settle step, unchanged: the full balance marks the invoice paid
 * (markInvoicePaid), anything less updates its paid amount. Whatever the
 * server says when it refuses is shown here in its own words.
 */
export default function RecordPaymentDialog({ invoice, clientName, onClose, onRecord, onReread }) {
  const [amount, setAmount] = useState(() => String(Math.max(0, (Number(invoice?.grand_total) || 0) - (Number(invoice?.paid_amount) || 0)) || ''));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  if (!invoice) return null;
  const check = paymentCheck(invoice, amount);
  const total = Number(invoice.grand_total) || 0;
  const paid = Number(invoice.paid_amount) || 0;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!check.ok || busy) return;
    setBusy(true);
    setFailure(null);
    const res = await onRecord(check.amount, check);
    setBusy(false);
    if (res?.error) { setFailure(res.error); return; }
    onClose();
  };

  return (
    <Dialog open onClose={onClose} width={440} title="Record payment"
      subtitle={`${invoice.invoice_number ? invoice.invoice_number : 'Invoice'} · ${clientName || 'Walk-in'}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!check.ok || busy}>
            {busy ? 'Saving…' : check.ok ? `Record ${formatCurrency(check.amount)}` : 'Record payment'}
          </Button>
        </>
      )}>
      <form onSubmit={submit}>
        <div className="space-y-1 text-[13px]">
          <Row label="Grand total" value={formatCurrency(total)} />
          <Row label="Paid" value={formatCurrency(paid)} tone="text-good-text" />
          <Row label="Balance due, this bill" value={formatCurrency(check.out)} tone="text-amber-text" bold />
        </div>
        <label htmlFor="rp-amount" className="mt-4 mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">Amount to collect</label>
        <div className="flex h-[52px] items-center gap-2 rounded-xl px-4 shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
          <span className="font-tight text-[20px] font-semibold text-mute">₹</span>
          <input id="rp-amount" type="number" min="0" step="0.01" inputMode="decimal" autoFocus
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-transparent font-tight text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-ink outline-none" />
        </div>
        <span className="mt-1.5 block text-[12px] text-mute">Up to {formatCurrency(check.out)}, the balance of this bill</span>
        {!check.ok && amount !== '' && <p className="mt-2 text-[12.5px] font-medium text-bad-text">{check.error}</p>}
        {check.ok && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-tile px-3.5 py-3 text-[13px] text-body">
            <span>After this payment</span>
            <b className="flex items-center gap-1.5 font-tight text-[14px] font-semibold text-ink">
              <Badge tone={check.full ? 'good' : 'warn'}>{STATUS_LABEL[check.statusAfter]}</Badge>
              {check.full ? 'Nothing left' : `${formatCurrency(check.left)} left`}
            </b>
          </div>
        )}
        <WriteFailure error={failure} noun="payment" onReread={onReread} className="mt-3" />
      </form>
    </Dialog>
  );
}

const Row = ({ label, value, tone = 'text-ink-2', bold }) => (
  <div className="flex items-center justify-between gap-3 py-[3px]">
    <span className={bold ? `font-tight font-semibold ${tone}` : 'text-body'}>{label}</span>
    <span className={`font-tight tabular-nums ${bold ? 'font-semibold' : 'font-medium'} ${tone}`}>{value}</span>
  </div>
);
