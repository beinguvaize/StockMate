// Pure helpers for sharing an invoice: the message, the WhatsApp and mail
// addresses, phone and email clean-up, the PDF file name, masking for the
// share log, the public link shape, and how a tall invoice is cut into A4
// pages. Nothing here touches the DOM or the network, so all of it is
// unit-tested (invoiceShare.test.js).

// ── people ──────────────────────────────────────────────────────────────────

// Digits only, with India's 91 added to a bare 10-digit mobile number.
// Returns null when what is left cannot be a phone number, so a caller never
// builds a chat address from junk.
export function normalisePhone(raw) {
  if (raw == null) return null;
  let d = String(raw).replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);                  // 0091 98765 43210
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1); // 098765 43210
  if (d.length === 10) return /^[6-9]/.test(d) ? `91${d}` : null;
  if (d.length >= 11 && d.length <= 15 && !d.startsWith('0')) return d;
  return null;
}

// "919876543210" -> "+91 98765 43210"; other numbers just get a plus.
export const displayPhone = (digits) => {
  const d = String(digits || '');
  if (/^91[6-9][0-9]{9}$/.test(d)) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return d ? `+${d}` : '';
};

// The client's number: phone first, then the older contact field, then what
// the invoice itself recorded.
export function pickClientPhone(client, invoice) {
  for (const v of [client?.phone, client?.contact, invoice?.client_phone]) {
    const n = normalisePhone(v);
    if (n) return n;
  }
  return null;
}

// A plain address only. Anything that could add headers or extra recipients
// to a mailto: link (?, &, %, commas, spaces, line breaks) is refused.
const EMAIL_RE = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
export function normaliseEmail(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 254 || !EMAIL_RE.test(s)) return null;
  return s;
}

export const pickClientEmail = (client, invoice) =>
  normaliseEmail(client?.email) || normaliseEmail(invoice?.client_email) || null;

// GSTIN may be stored as gstin (current) or gst_no (older rows).
export const clientGstin = (client, invoice) =>
  String(client?.gstin || client?.gst_no || invoice?.client_gstin || '').trim().toUpperCase() || null;

const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;
export const isGstin = (v) => GSTIN_RE.test(String(v || '').trim().toUpperCase());

// ── what the document is called ─────────────────────────────────────────────

// Never "GST invoice" unless it is one. A caller that knows the document's own
// title passes it; otherwise a registered seller's invoice is a tax invoice, a
// manual bill is a bill, and anything else is an invoice.
export function documentTitle(invoice, business) {
  const own = String(invoice?.doc_title || '').trim();
  if (own) return own.slice(0, 40);
  if (invoice?.doc_type === 'MANUAL_INVOICE' || /^MB-/.test(String(invoice?.invoice_number || ''))) return 'Bill';
  return isGstin(business?.gst_no || business?.gstin) ? 'Tax invoice' : 'Invoice';
}

// ── money and dates ─────────────────────────────────────────────────────────

export const formatRupees = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function balanceDue(invoice) {
  if (String(invoice?.payment_status || '').toUpperCase() === 'PAID') return 0;
  const total = Number(invoice?.grand_total) || 0;
  const paid = Number(invoice?.paid_amount) || 0;
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-11-22" (or a timestamp) -> "22 Nov 2026". A bare date is read as the
// calendar date it says, never shifted by a time zone.
export function formatDocDate(value, timeZone = 'Asia/Kolkata') {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (m) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', year: 'numeric' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}`;
}

// A moment, the way the app says it: "22 Nov, 4:10 pm".
export function formatShareWhen(value, timeZone = 'Asia/Kolkata') {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month}, ${p.hour}:${p.minute} ${String(p.dayPeriod || '').toLowerCase()}`;
}

// ── the message ─────────────────────────────────────────────────────────────

// One line, no control characters, bounded. A client or shop name cannot add
// lines to the message or push the link out of it.
const isControl = (c) => {
  const n = c.charCodeAt(0);
  return n < 32 || n === 127 || n === 0x2028 || n === 0x2029;
};
export const oneLine = (v, max = 80) =>
  Array.from(String(v ?? ''), (c) => (isControl(c) ? ' ' : c)).join('')
    .replace(/\s+/g, ' ').trim().slice(0, max);

const WALK_IN = /^(walk[\s-]*in|cash|guest)\b/i;

export function buildShareMessage({ invoice, business, client, link, title } = {}) {
  const shop = oneLine(business?.name, 80) || 'our shop';
  const docTitle = oneLine(title || documentTitle(invoice, business), 40);
  const number = oneLine(invoice?.invoice_number, 40);
  const name = oneLine(client?.name || invoice?.client_name, 60);
  const due = balanceDue(invoice);
  const lines = [];
  if (name && !WALK_IN.test(name)) lines.push(`Hello ${name},`, '');
  lines.push(`${docTitle}${number ? ` ${number}` : ''} from ${shop}`);
  const date = formatDocDate(invoice?.invoice_date || invoice?.date);
  if (date) lines.push(`Date: ${date}`);
  lines.push(`Total: ${formatRupees(invoice?.grand_total || 0)}`);
  lines.push(due > 0 ? `Balance due: ${formatRupees(due)}` : 'Paid in full');
  if (link) lines.push('', `View and download: ${link}`);
  lines.push('', 'Thank you');
  return lines.join('\n');
}

export const buildEmailSubject = ({ invoice, business, title } = {}) => {
  const docTitle = oneLine(title || documentTitle(invoice, business), 40);
  const number = oneLine(invoice?.invoice_number, 40);
  const shop = oneLine(business?.name, 80);
  return `${docTitle}${number ? ` ${number}` : ''}${shop ? ` from ${shop}` : ''}`;
};

// ── addresses that open WhatsApp or the mail app ────────────────────────────

export const MAX_TEXT = 1500;

// web.whatsapp.com on a computer (the owner's WhatsApp lives in the browser),
// wa.me on a phone (it hands over to the app). The number is digits only by
// construction, so nothing can be smuggled into the address.
export function whatsappUrl({ phone, text, mobile = false }) {
  const digits = phone && /^[0-9]{11,15}$/.test(phone) ? phone : '';
  const t = encodeURIComponent(String(text ?? '').slice(0, MAX_TEXT));
  if (mobile) return digits ? `https://wa.me/${digits}?text=${t}` : `https://wa.me/?text=${t}`;
  return digits
    ? `https://web.whatsapp.com/send?phone=${digits}&text=${t}`
    : `https://web.whatsapp.com/send?text=${t}`;
}

// Kept under 1,900 characters: some mail apps on Windows drop longer links.
export const MAX_MAILTO = 1900;

export function mailtoUrl({ to, subject, body }) {
  const addr = normaliseEmail(to);
  // The address is validated to [A-Za-z0-9._+-@], so only '+' needs encoding.
  const head = `mailto:${addr ? addr.replace(/\+/g, '%2B') : ''}`;
  const enc = (s) => encodeURIComponent(s).replace(/%0A/g, '%0D%0A');
  const subj = enc(oneLine(subject, 150));
  let text = String(body ?? '').replace(/\r\n?/g, '\n');
  const build = (b) => `${head}?subject=${subj}&body=${enc(b)}`;
  let url = build(text);
  // Too long: drop whole lines from the top of the message, but never the link.
  const lines = text.split('\n');
  while (url.length > MAX_MAILTO && lines.length > 1) {
    const i = lines.findIndex((l) => !/^View and download: /.test(l));
    if (i < 0) break;
    lines.splice(i, 1);
    text = lines.join('\n');
    url = build(text);
  }
  return url.length > MAX_MAILTO ? `${head}?subject=${subj}` : url;
}

// ── the PDF file name ───────────────────────────────────────────────────────

export function pdfFileName(invoice, title) {
  const prefix = /^bill$/i.test(String(title || '')) ? 'Bill' : 'Invoice';
  const safe = String(invoice?.invoice_number || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60);
  return safe ? `${prefix}-${safe}.pdf` : `${prefix}.pdf`;
}

// ── the share log ───────────────────────────────────────────────────────────

// What the log keeps of who it went to: enough to recognise, not to reuse.
export function maskRecipient(value) {
  if (!value) return null;
  const s = String(value);
  const at = s.indexOf('@');
  if (at > 0) return `${s[0]}***${s.slice(at)}`.slice(0, 64);
  const d = s.replace(/[^0-9]/g, '');
  if (d.length < 4) return null;
  return `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

const CHANNEL_NAMES = { whatsapp: 'WhatsApp', email: 'email', share_sheet: 'the share menu', link_copy: 'a copied link', download: 'download' };

// "Shared on 22 Nov, 4:10 pm via WhatsApp". The app only knows it handed the
// invoice over, never that it arrived, so the words stop there.
export function describeShareEvent(ev) {
  if (!ev) return '';
  const when = formatShareWhen(ev.created_at);
  if (ev.channel === 'download') return `PDF downloaded on ${when}`;
  if (ev.channel === 'link_copy') return `Link copied on ${when}`;
  return `Shared on ${when} via ${CHANNEL_NAMES[ev.channel] || ev.channel}`;
}

export function describeViews(link) {
  const n = Number(link?.view_count) || 0;
  if (!n) return 'Not opened yet';
  const times = n === 1 ? '1 time' : `${n} times`;
  return link.last_viewed_at ? `Viewed ${times}, last ${formatShareWhen(link.last_viewed_at)}` : `Viewed ${times}`;
}

// ── the public link ─────────────────────────────────────────────────────────

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// The one place the public link's shape is decided. Today it is the web app's
// static viewer with the token after '#', so the token never reaches a server
// log or a Referer header. A nicer route only has to change this function.
export function shareLinkUrl(token, origin) {
  if (!TOKEN_RE.test(String(token || ''))) throw new Error('The share link token is not valid');
  let o;
  try { o = new URL(String(origin || '')); } catch { throw new Error('The app address for share links is not set'); }
  if (o.protocol !== 'https:' && !(o.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(o.hostname))) {
    throw new Error('Share links need the app to be on an https address');
  }
  return `${o.origin}/i/#${token}`;
}

// ── devices ─────────────────────────────────────────────────────────────────

export function isMobileBrowser(ua, maxTouchPoints = 0) {
  const s = String(ua || '');
  if (/Android|iPhone|iPod|Mobile|Windows Phone/i.test(s)) return true;
  return /iPad/i.test(s) || (/Macintosh/i.test(s) && maxTouchPoints > 1);
}

// ── cutting a tall invoice into A4 pages ────────────────────────────────────

// contentHeight: the rendered sheet's height; pageHeight: one A4 page at the
// same scale; breaks: y positions where a cut is clean (bottoms of table rows
// and blocks). Each page ends at the lowest clean break that fits, provided
// the page is at least `minFill` full; otherwise it is cut at the page edge
// (one row taller than a page cannot be helped). Pages after the first leave
// `topMargin` free at the top.
export function planPdfPages({ contentHeight, pageHeight, breaks = [], topMargin = 0, minFill = 0.6 }) {
  const H = Math.max(0, Math.ceil(Number(contentHeight) || 0));
  const P = Math.floor(Number(pageHeight) || 0);
  if (!H || P <= 0) return [];
  const sorted = [...new Set(breaks.map((b) => Math.round(b)))].filter((b) => b > 0 && b < H).sort((a, b) => a - b);
  const pages = [];
  let start = 0;
  // Ignore slivers: the last 2 px are anti-aliasing, not content.
  while (start < H - 2) {
    const room = pages.length === 0 ? P : P - topMargin;
    if (room <= 0) break;
    const limit = start + room;
    if (limit >= H) { pages.push({ start, end: H }); break; }
    let end = limit;
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const b = sorted[i];
      if (b <= limit && b > start) {
        if (b - start >= room * minFill) end = b;
        break;
      }
    }
    pages.push({ start, end });
    start = end;
  }
  return pages;
}

// The index of the last pixel row in RGBA data that is not (near) white, or -1.
export function lastInkRow(data, width, height, threshold = 245) {
  for (let y = height - 1; y >= 0; y -= 1) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const i = rowStart + x * 4;
      if (data[i + 3] > 0 && (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold)) return y;
    }
  }
  return -1;
}
