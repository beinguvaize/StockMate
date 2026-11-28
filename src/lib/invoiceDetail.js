/**
 * What the invoice detail page shows about one invoice, from what is stored.
 *
 * The activity timeline lists ONLY events the database already keeps:
 *   - the invoice being created          invoices.created_at
 *   - money received or paid back        account_transactions (ref_type SALE,
 *                                         ref_id = the invoice's sale)
 *   - items returned against it          sales_returns (sale_id / invoice_id)
 *   - the e-invoice IRN being generated  invoices.ack_date (with ack_no)
 * Nothing else is recorded with a time today (a reminder sent, a WhatsApp
 * share, the e-Way bill number being saved, a delivery status change), so
 * nothing else appears. No event is logged from here.
 *
 * No money is computed for the books here. The figures are the invoice's own
 * stored ones; the sums below only describe the listed receipts.
 */
import { formatShortDateTime } from './utils';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const MODE = { CASH: 'Cash', UPI: 'UPI', BANK: 'Bank', CARD: 'Card', CREDIT: 'Credit', CHEQUE: 'Cheque' };
export const modeLabel = (m) => MODE[String(m || '').toUpperCase()] || (m ? String(m) : 'Payment');

/** When a stored row happened: its created_at, else its date (date only). */
const whenOf = (row) => row?.created_at || row?.date || null;

/** "26 Nov, 4:12 pm", or "26 Nov" when only a date is stored. */
export const whenWords = (v) => {
  if (!v) return '';
  return formatShortDateTime(v) || '';
};

/**
 * The receipts listed under Payments, newest first, with what they add up to.
 * `recordedOnly` is the part of the invoice's paid amount that has no receipt
 * row: the Invoices page has long recorded a part payment on the invoice alone
 * (a known gap, left as it is), and the page says so rather than hiding it.
 */
export function paymentsSummary(rows = [], invoice = {}) {
  const list = (rows || [])
    .filter((r) => r && num(r.amount) > 0)
    .map((r) => ({
      id: r.id,
      in: String(r.direction || 'IN').toUpperCase() !== 'OUT',
      amount: num(r.amount),
      mode: modeLabel(r.mode),
      note: r.note || '',
      when: whenOf(r),
      date: r.date || null,
    }))
    .sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')));
  const received = list.reduce((s, p) => s + (p.in ? p.amount : -p.amount), 0);
  const paid = num(invoice?.paid_amount);
  const recordedOnly = paid - received > 0.5 ? +(paid - received).toFixed(2) : 0;
  const last = list.find((p) => p.in) || null;
  return { list, count: list.filter((p) => p.in).length, received, recordedOnly, last };
}

/** Activity, newest first: [{ key, kind, tone, title, detail, when }]. */
export function buildTimeline({ invoice = {}, payments = [], returns = [], money = (n) => String(n) } = {}) {
  const ev = [];
  const items = Array.isArray(invoice.items) ? invoice.items.length : 0;
  if (invoice.created_at || invoice.invoice_date) {
    ev.push({
      key: 'created', kind: 'created', tone: 'n',
      title: 'Invoice created',
      detail: [items ? `${items} item${items === 1 ? '' : 's'}` : null, money(num(invoice.grand_total))].filter(Boolean).join(' · '),
      when: invoice.created_at || invoice.invoice_date,
    });
  }
  for (const p of paymentsSummary(payments, invoice).list) {
    ev.push({
      key: `pay-${p.id}`, kind: 'payment', tone: p.in ? 'g' : 'n',
      title: p.in ? `Payment received · ${p.mode}` : `Money paid back · ${p.mode}`,
      detail: [money(p.amount), p.note].filter(Boolean).join(' · '),
      when: p.when,
    });
  }
  for (const r of returns || []) {
    if (!r) continue;
    const amt = num(r.total_amount ?? r.totalAmount);
    ev.push({
      key: `ret-${r.id}`, kind: 'return', tone: 'n',
      title: 'Items returned',
      detail: [amt ? `${money(amt)} credited` : null, r.reason || null].filter(Boolean).join(' · '),
      when: r.created_at || r.date,
    });
  }
  if (String(invoice.irn_status || '').toUpperCase() === 'SUCCESS' && (invoice.ack_date || invoice.ack_no)) {
    ev.push({
      key: 'irn', kind: 'irn', tone: 'n',
      title: 'e-Invoice IRN generated',
      detail: invoice.ack_no ? `Ack ${invoice.ack_no}` : '',
      when: invoice.ack_date || null,
    });
  }
  return ev.sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')));
}

/** Event kinds the page would like to show but that are not stored today. */
export const NOT_STORED_EVENTS = [
  'payment reminder sent',
  'shared on WhatsApp',
  'e-Way bill number saved',
  'delivery status changed',
  'who made each change (only the creator, where stored)',
];

/** Days between invoice date and due date, as credit terms. */
export function creditTermsDays(invoice = {}) {
  const a = String(invoice.invoice_date || '').slice(0, 10);
  const b = String(invoice.due_date || '').slice(0, 10);
  if (!a || !b) return null;
  const d = Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
  return Number.isFinite(d) && d >= 0 ? d : null;
}

/** "46%": how much of the total is paid, for the Collected bar. */
export function collectedShare(invoice = {}) {
  const total = num(invoice.grand_total);
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, (num(invoice.paid_amount) / total) * 100));
}

