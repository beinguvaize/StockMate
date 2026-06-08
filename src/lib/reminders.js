// Payment reminders via the send-payment-reminder edge function (Twilio).
// Builds a short due-amount message and sends SMS/WhatsApp (channel decided by
// the TWILIO_FROM secret server-side). Requires Twilio secrets configured in
// Supabase, else the function returns a clear "not configured" error.
import { supabase } from './supabase';
import { formatINR } from './gstEngine';

export function buildReminderMessage(invoice, client, businessProfile) {
  const due = invoice.balance_due ?? (Number(invoice.grand_total || 0) - Number(invoice.paid_amount || 0));
  const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
  const link = (origin && invoice.id) ? `\nView/Pay: ${origin}/embed/invoice/${invoice.id}` : '';
  const upi = businessProfile?.upi_id ? `\nUPI: ${businessProfile.upi_id}` : '';
  return (
    `${businessProfile?.name || ''}\n` +
    `Reminder: Invoice ${invoice.invoice_number} has ${formatINR(due)} due.\n` +
    `Dear ${client?.name || 'Customer'}, kindly clear the pending amount.` +
    upi + link
  ).trim();
}

// Returns { ok, error }. `error` is human-readable (e.g. Twilio not configured).
export async function sendPaymentReminder(invoice, client, businessProfile) {
  const to = client?.contact || invoice.client_phone;
  if (!to) return { ok: false, error: 'Client has no phone number' };
  const message = buildReminderMessage(invoice, client, businessProfile);
  try {
    const { data, error } = await supabase.functions.invoke('send-payment-reminder', {
      body: { to, message },
    });
    if (error) {
      // Edge function non-2xx → error.context holds the response.
      let detail = error.message;
      try { detail = (await error.context?.json())?.error || detail; } catch (_) {/* noop */}
      return { ok: false, error: detail };
    }
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true, channel: data?.channel };
  } catch (e) {
    return { ok: false, error: e.message || 'Send failed' };
  }
}
