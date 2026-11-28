import React, { useState } from 'react';
import { Pencil, Repeat, Users } from 'lucide-react';
import SidePanel from '../ui/SidePanel';
import { Button } from '../ui/button';
import HoldButton from '../motion/HoldButton';
import WriteFailure from '../invoices/WriteFailure';
import { paymentLabel } from '../../lib/recurring';
import { dayMonth, fullDate, expenseDay, amountOf } from '../../lib/expenseList';
import { Pill, CategoryChip, rupeesPaise } from './parts';

/**
 * One expense (expenses-02): a side panel with the amount, how and where it
 * was paid, the GST it claims and whether it counts in profit. Edit and
 * Hold to delete come from `actions` (lib/expenseRowActions), the same rule
 * the row's menu uses. The page keys it by the expense's id, so a new
 * expense starts with no leftover error.
 */
export default function ExpenseDetail({ expense, actions, storeName, sym = '₹', onClose, onEdit, onDelete, onReread, onOpenRepeating, onOpenPayroll }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const e = expense || {};
  const day = expenseDay(e.date);
  const method = paymentLabel(e.payment_method);
  const gstOn = !!e.vendor_gstin || Number(e.gst_amount) > 0;
  const itc = parseFloat(e.gst_amount) || 0;
  const counted = !!e.vendor_gstin && itc > 0;

  const remove = async () => {
    setBusy(true); setError(null);
    let res;
    try { res = await onDelete?.(e); } catch (err) { res = { error: err }; }
    setBusy(false);
    if (res?.error) { console.error('[expenses] delete failed', res.error); setError(res.error); return; }
    onClose?.();
  };

  return (
    <SidePanel open={!!expense} onClose={onClose} width={452}
      eyebrow={(
        <span className="flex items-center gap-1.5 normal-case tracking-normal">
          <Pill><CategoryChip category={e.category} className="text-[11.5px] text-body" /></Pill>
          {counted && <Pill tone="good">GST claimed</Pill>}
        </span>
      )}
      title={e.note || e.category || 'Expense'}
      subtitle={`${dayMonth(day)} · paid ${method === 'Cash' ? 'in cash' : `by ${method}`}`}>
      {expense && (
        <>
          <div className="mt-0.5 mb-4 font-tight text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] tabular-nums">{rupeesPaise(amountOf(e), sym)}</div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Tile label="Date" value={fullDate(day)} />
            <Tile label="Paid via" value={method} />
            <Tile label="Category" value={e.category || 'Other'} />
            <Tile label="Paid from store" value={storeName || 'Business-wide'} />
          </div>

          {gstOn && (
            <>
              <span className="mt-1 mb-2 block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">GST, input tax credit</span>
              <Tots>
                <Row label="Amount, GST included" value={rupeesPaise(amountOf(e), sym)} />
                <Row label="GST rate" value={e.gst_rate != null && e.gst_rate !== '' ? `${Number(e.gst_rate)}%` : '—'} />
                <Row label="Vendor GSTIN" value={e.vendor_gstin || 'None'} />
                <div className="mt-1.5 flex justify-between border-t border-line pt-[9px] font-tight text-[14px] font-semibold text-good-text">
                  <span>GST to claim (ITC)</span>
                  <span className="tabular-nums">{counted ? rupeesPaise(itc, sym) : rupeesPaise(0, sym)}</span>
                </div>
                {!counted && itc > 0 && (
                  <p className="pt-1 text-[12px] text-mute">{rupeesPaise(itc, sym)} was entered, but it is not counted without a vendor GSTIN.</p>
                )}
              </Tots>
            </>
          )}

          <Tots className="mt-3.5">
            <Row label="Counts in profit" value={e.exclude_from_pl ? 'No, kept out of profit' : 'Yes'} />
          </Tots>

          {(e.recurring_template_id || e.payroll_id) && (
            <div className="mt-3.5 flex items-center gap-2.5 rounded-xl bg-tile px-3 py-[11px] text-[13px] text-ink-2">
              {e.payroll_id ? <Users size={16} className="shrink-0 text-body" /> : <Repeat size={16} className="shrink-0 text-body" />}
              {e.payroll_id ? 'Logged by a payroll run' : 'Logged by a repeating expense'}
              <button type="button" onClick={e.payroll_id ? onOpenPayroll : onOpenRepeating}
                className="ml-auto font-tight text-[12.5px] font-semibold text-amber-text hover:underline underline-offset-4">
                {e.payroll_id ? 'Open Payroll' : 'See repeating'}
              </button>
            </div>
          )}

          {actions?.readOnlyReason && <p className="mt-3 text-[12.5px] text-body">{actions.readOnlyReason}</p>}
          {(actions?.canEdit || actions?.canDelete) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {actions.canEdit && <Button variant="secondary" size="sm" onClick={() => onEdit?.(e)} disabled={busy}><Pencil /> Edit expense</Button>}
              {actions.canDelete && (
                <HoldButton onConfirm={remove} disabled={busy} title="Hold 1.5s to delete this expense"
                  className="m-press h-8 rounded-pill px-3.5 font-tight text-[13px] font-semibold text-bad-text shadow-[inset_0_0_0_1px_#F5C2C2] hover:bg-bad-soft disabled:opacity-50">
                  {busy ? 'Deleting…' : 'Hold to delete'}
                </HoldButton>
              )}
            </div>
          )}
          {error && <WriteFailure error={error} noun="delete" onReread={onReread} className="mt-3" />}
        </>
      )}
    </SidePanel>
  );
}

const Tile = ({ label, value }) => (
  <div className="rounded-[10px] bg-tile px-3 py-[9px]">
    <span className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">{label}</span>
    <b className="mt-px block truncate font-tight text-[13.5px] font-semibold">{value}</b>
  </div>
);
const Tots = ({ className = '', children }) => <div className={`rounded-xl bg-tile px-3.5 py-3 ${className}`}>{children}</div>;
const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3 py-[3px] text-[13px] text-body">
    <span>{label}</span><span className="text-right font-tight font-medium tabular-nums text-ink-2">{value}</span>
  </div>
);
