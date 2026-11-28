import { useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { sendPaymentReminder } from '../../lib/reminders';
import { formatCurrency } from '../../lib/utils';
import { invoiceOutstanding } from '../../lib/invoiceList';
import { classifyWriteFailure } from '../../lib/writeOutcome';

/**
 * The Invoices page's own actions, shared by the list and the detail page so
 * both run exactly one copy.
 *
 * recordPayment is the settle step the page has always had, unchanged: the
 * full balance goes through markInvoicePaid; less than that writes the
 * invoice's paid amount and PARTIAL directly. That second write posts no
 * ledger entry. It is a known gap, kept as it is here on purpose (not fixed,
 * not widened). The one change is that the server's answer is now read and
 * returned, so a refusal is shown instead of the dialog closing as if it
 * worked.
 */
export function useInvoiceActions({ markInvoicePaid, enqueueIrn, refetch, businessProfile, notify }) {
  const say = useCallback((msg, type) => notify?.(msg, type), [notify]);

  const recordPayment = useCallback(async (inv, amt) => {
    const out = invoiceOutstanding(inv);
    if (amt >= out) {
      const res = await markInvoicePaid(inv.id);
      if (res?.error) return { error: res.error };
    } else {
      const { error } = await supabase.from('invoices')
        .update({ paid_amount: (inv.paid_amount || 0) + amt, payment_status: 'PARTIAL' })
        .eq('id', inv.id);
      if (error) return { error };
      refetch?.();
    }
    say(`Payment of ${formatCurrency(amt)} recorded on ${inv.invoice_number || 'the invoice'}`, 'success');
    return { ok: true };
  }, [markInvoicePaid, refetch, say]);

  // Delivery flag on or off: the same update as before; a refusal is shown.
  const toggleDelivery = useCallback(async (inv) => {
    const newRequired = !inv.delivery_required;
    const { error } = await supabase.from('invoices')
      .update({ delivery_required: newRequired, delivery_status: newRequired ? 'PENDING' : null })
      .eq('id', inv.id);
    if (error) {
      const f = classifyWriteFailure(error, { noun: 'delivery change' });
      say(`${f.title}: ${f.detail}`, 'error');
    }
    refetch?.();
    return error ? { error } : { ok: true };
  }, [refetch, say]);

  const remind = useCallback(async (inv, cli) => {
    say('Sending reminder…', 'info');
    const { ok, error, channel } = await sendPaymentReminder(inv, cli, businessProfile);
    say(ok ? `Reminder sent via ${channel || 'message'}` : `Reminder failed: ${error}`, ok ? 'success' : 'error');
  }, [businessProfile, say]);

  const generateIrn = useCallback(async (inv) => {
    const r = await enqueueIrn(inv.id);
    if (r?.error) { say(`Enqueue failed: ${r.error.message}`, 'error'); return r; }
    say(r?.already_existed ? 'Already queued' : 'IRN request queued', 'success');
    refetch?.();
    return r;
  }, [enqueueIrn, refetch, say]);

  return { recordPayment, toggleDelivery, remind, generateIrn };
}

export default useInvoiceActions;
