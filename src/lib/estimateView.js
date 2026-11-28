/**
 * The Estimates page (web redesign, estimates-01 to 11). Pure, so it can be
 * tested.
 *
 * Nothing here works money out in a new way. Every figure is an estimate's
 * stored `grand_total` (or its stored tax split) added up over rows; the
 * estimate itself never touches stock, payments or the ledger. This file
 * decides which rows, and words them.
 *
 * Dates: `valid_until` is a plain date; "today" is the shop's day
 * (todayISOInAppTZ), passed in so tests do not depend on the clock.
 */
import { getAppTimezone } from './utils';

const num = (v) => Number(v) || 0;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Document types (stored in estimates.doc_type by the New document page) ──
export const DOC_TYPES = [
  { key: 'QUOTATION', label: 'Quotation' },
  { key: 'PROFORMA', label: 'Proforma' },
  { key: 'DELIVERY_CHALLAN', label: 'Delivery challan' },
  { key: 'MANUAL_INVOICE', label: 'Manual bill' },
];
/** A row with no doc_type is a quotation: the hook's own default. */
export const docTypeOf = (e) => (DOC_TYPES.some((t) => t.key === e?.doc_type) ? e.doc_type : 'QUOTATION');
export const docTypeLabel = (e) => DOC_TYPES.find((t) => t.key === docTypeOf(e)).label;

// ── Statuses (the table's check: DRAFT SENT ACCEPTED REJECTED EXPIRED CONVERTED) ──
// CONVERTED reads "Billed": it turned into a sale.
export const STATUSES = [
  { key: 'DRAFT', label: 'Draft', tone: 'neutral', dot: 'var(--color-faint)' },
  { key: 'SENT', label: 'Sent', tone: 'info', dot: '#2563EB' },
  { key: 'ACCEPTED', label: 'Accepted', tone: 'good', dot: '#16A34A' },
  { key: 'CONVERTED', label: 'Billed', tone: 'good', dot: '#16A34A' },
  { key: 'REJECTED', label: 'Rejected', tone: 'bad', dot: '#DC2626' },
  { key: 'EXPIRED', label: 'Expired', tone: 'warn', dot: 'var(--color-amber)' },
];
export const statusOf = (e) => STATUSES.find((s) => s.key === e?.status) || STATUSES[0];

/** The statuses a person can set by hand. Billed comes only from a saved sale. */
export const SETTABLE = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'];

// ── Row actions: today's rules, plus Mark rejected ──
export function estimateActions(e) {
  const st = e?.status || 'DRAFT';
  const billed = st === 'CONVERTED';
  return {
    convert: !billed,
    share: true,
    markSent: st === 'DRAFT',
    markAccepted: st === 'DRAFT' || st === 'SENT',
    markRejected: ['DRAFT', 'SENT', 'ACCEPTED'].includes(st),
    edit: !billed,
    setStatus: !billed,
    remove: true,
  };
}

// ── Figures strip ──
export function estimateFigures(rows = []) {
  const f = {
    sent: { amt: 0, n: 0 }, draft: { amt: 0, n: 0 }, accepted: { amt: 0, n: 0, manual: 0 }, billed: { amt: 0, n: 0 },
  };
  for (const e of rows) {
    const t = num(e.grand_total);
    if (e.status === 'SENT') { f.sent.amt += t; f.sent.n += 1; }
    else if ((e.status || 'DRAFT') === 'DRAFT') { f.draft.amt += t; f.draft.n += 1; }
    else if (e.status === 'ACCEPTED') {
      f.accepted.amt += t; f.accepted.n += 1;
      if (docTypeOf(e) === 'MANUAL_INVOICE') f.accepted.manual += 1;
    } else if (e.status === 'CONVERTED') { f.billed.amt += t; f.billed.n += 1; }
  }
  return f;
}

export const typeCounts = (rows = []) => {
  const c = { ALL: rows.length };
  DOC_TYPES.forEach((t) => { c[t.key] = 0; });
  rows.forEach((e) => { c[docTypeOf(e)] += 1; });
  return c;
};

export const statusCounts = (rows = []) => {
  const c = { ALL: rows.length };
  STATUSES.forEach((s) => { c[s.key] = 0; });
  rows.forEach((e) => { c[statusOf(e).key] += 1; });
  return c;
};

/** Type chip, then status, then the search over number and client. Order kept (newest first). */
export function filterEstimates(rows = [], { type = 'ALL', status = 'ALL', query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return rows.filter((e) => {
    if (type !== 'ALL' && docTypeOf(e) !== type) return false;
    if (status !== 'ALL' && statusOf(e).key !== status) return false;
    if (!q) return true;
    return String(e.estimate_number || '').toLowerCase().includes(q)
      || String(e.client_name || '').toLowerCase().includes(q);
  });
}

// ── Dates ──
export const shopDay = (v) => {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: getAppTimezone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
const utc = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };

/** The estimate's own day: estimate_date, else the day it was made (shop time). */
export const estimateDay = (e) => shopDay(e?.estimate_date) || shopDay(e?.created_at);

/** "26 Nov" and "26 Nov 2026" from a YYYY-MM-DD. */
export const shortDay = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]}` : '';
};
export const longDay = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}` : '';
};

/**
 * Valid-until words. `late` once the day has passed while the estimate is
 * still open (not billed or rejected). Display only: nothing is written.
 */
export function validity(e, today) {
  const vu = String(e?.valid_until || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vu)) return null;
  const days = Math.round((utc(vu) - utc(today)) / 86400000);
  const open = !['CONVERTED', 'REJECTED'].includes(e?.status);
  const late = open && days < 0;
  let left = '';
  if (open) {
    if (days > 1) left = `${days} days left`;
    else if (days === 1) left = '1 day left';
    else if (days === 0) left = 'last day';
    else left = 'passed';
  }
  return { date: longDay(vu), days, late, left };
}

// ── Phone ──
/** "98450 ••• 214": the middle of a number is never shown in full. */
export function maskPhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length < 8) return `••• ${d.slice(-3)}`;
  return `${d.slice(0, 5)} ••• ${d.slice(-3)}`;
}

/** wa.me digits: a bare 10-digit number gets 91 in front (today's rule). */
export const waDigits = (phone) => {
  const d = String(phone || '').replace(/[^0-9]/g, '');
  return d.length === 10 ? `91${d}` : d;
};

const inr0 = (n) => `₹${Math.round(num(n)).toLocaleString('en-IN')}`;

/**
 * The WhatsApp message: today's words, with a GST line added when the
 * estimate carries tax. Text only; nothing is sent from the app.
 */
export function whatsappText(e, shopName = '') {
  const label = docTypeLabel(e);
  const vu = longDay(e?.valid_until);
  const lines = (Array.isArray(e?.items) ? e.items : [])
    .map((i) => `• ${i.name} × ${i.qty} = ${inr0(num(i.qty) * num(i.rate))}`).join('\n');
  const gst = num(e?.tax_total) > 0 ? `\nGST: ${inr0(e.tax_total)}` : '';
  return `*${shopName || ''}*\n*${label}: ${e?.estimate_number || ''}*\n${vu ? `Valid until: ${vu}\n` : ''}\n${lines}${gst}\n\n*Total: ${inr0(e?.grand_total)}*\n\nReply to confirm. Thank you!`;
}

export const whatsappLink = (phone, text) => `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`;

/**
 * What the till is handed (sessionStorage 'estimate_cart'), same shape as
 * today. The estimate is NOT marked billed here: the Sales page does that
 * once the sale is saved (lib/convertHandoff).
 */
export const estimateHandoff = (e) => ({
  estimateId: e.id, clientId: e.client_id || null, items: Array.isArray(e.items) ? e.items : [],
});

/** Line amount as the editor and panel show it: qty × rate. */
export const lineAmount = (l) => num(l?.qty) * num(l?.rate);
