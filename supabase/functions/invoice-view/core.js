// Pure parts of the public invoice page: token checks, hashing, escaping and
// the HTML itself. No Deno or network here, so the web app's unit tests run
// this exact file (src/lib/invoiceViewCore.test.js).

// 32 random bytes, base64url, no padding: exactly 43 characters.
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const isValidToken = (t) => typeof t === 'string' && TOKEN_RE.test(t);

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);

// Link-preview fetchers (WhatsApp, mail scanners, chat apps) open the link
// before any person does. Their visits are not counted as views.
const BOT_RE = /(whatsapp|facebookexternalhit|facebot|telegrambot|slackbot|discordbot|twitterbot|linkedinbot|skypeuripreview|googlebot|bingbot|applebot|bot\b|crawler|spider|preview|curl|wget|python-requests|go-http-client|microsoft office|outlook|safelinks|proofpoint|mimecast|barracuda)/i;
export const isPreviewBot = (ua) => !ua || BOT_RE.test(ua);

// The caller's address, for rate limiting only. Hashed with a per-deploy salt
// so raw addresses are never stored.
export function clientAddress(headers) {
  const get = (k) => (headers && typeof headers.get === 'function' ? headers.get(k) : headers?.[k]) || '';
  const cf = get('cf-connecting-ip').trim();
  if (cf) return cf;
  const xff = get('x-forwarded-for').split(',')[0].trim();
  if (xff) return xff;
  return get('x-real-ip').trim() || 'unknown';
}

export const formatRupees = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "2026-11-22" -> "22 Nov 2026". Anything else is shown as given (escaped).
export const formatInvoiceDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return String(s || '');
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return String(s);
  return `${Number(m[3])} ${MONTHS[mi]} ${m[1]}`;
};

// Downloaded file name, safe for a Content-Disposition value.
export const pdfFileName = (number) => {
  const safe = String(number || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60);
  return safe ? `Invoice-${safe}.pdf` : 'Invoice.pdf';
};

// What the public page may say about an invoice, and nothing else.
export const publicView = (row) => ({
  shopName: String(row.shop_name || 'Shop').slice(0, 120),
  shopGstin: row.shop_gstin ? String(row.shop_gstin).slice(0, 15) : null,
  title: row.title === 'Tax invoice' ? 'Tax invoice' : 'Invoice',
  number: String(row.invoice_number || '').slice(0, 60),
  date: formatInvoiceDate(row.invoice_date),
  total: formatRupees(row.grand_total),
  balanceDue: formatRupees(row.balance_due),
  isPaid: Number(row.balance_due) <= 0,
  fileName: pdfFileName(row.invoice_number),
});

export const SECURITY_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'Pragma': 'no-cache',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

// No scripts at all; the one style block is allowed by its nonce.
export const pageCsp = (nonce) =>
  `default-src 'none'; style-src 'nonce-${nonce}'; img-src 'none'; script-src 'none'; ` +
  `base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

const STYLE = `
body{margin:0;background:#f5f5f4;color:#1c1917;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:420px;margin:0 auto;padding:32px 16px}
.card{background:#fff;border:1px solid #e7e5e4;border-radius:16px;padding:24px}
h1{font-size:20px;margin:0 0 4px}
.muted{color:#78716c;font-size:14px;margin:0}
dl{margin:20px 0;display:grid;grid-template-columns:auto 1fr;gap:8px 16px}
dt{color:#78716c}dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.due{font-weight:700}
a.btn{display:block;text-align:center;background:#1c1917;color:#fff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600}
.foot{color:#a8a29e;font-size:12px;text-align:center;margin-top:16px}
`;

export function renderInvoicePage(view, { nonce, downloadHref }) {
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${e(view.title)} from ${e(view.shopName)}</title>
<style nonce="${e(nonce)}">${STYLE}</style></head>
<body><main><div class="card">
<h1>${e(view.shopName)}</h1>
${view.shopGstin ? `<p class="muted">GSTIN ${e(view.shopGstin)}</p>` : ''}
<dl>
<dt>${e(view.title)}</dt><dd>${e(view.number)}</dd>
<dt>Date</dt><dd>${e(view.date)}</dd>
<dt>Total</dt><dd>${e(view.total)}</dd>
<dt>Balance due</dt><dd class="due">${view.isPaid ? 'Paid in full' : e(view.balanceDue)}</dd>
</dl>
<a class="btn" href="${e(downloadHref)}" rel="nofollow noopener">Download PDF</a>
</div><p class="foot">Shared with you by ${e(view.shopName)}</p></main></body></html>`;
}

export function renderGonePage({ nonce, rateLimited = false }) {
  const msg = rateLimited
    ? 'Too many tries. Please wait a few minutes and open the link again.'
    : 'This link is no longer available. Please ask the shop to send it again.';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Link not available</title>
<style nonce="${escapeHtml(nonce)}">${STYLE}</style></head>
<body><main><div class="card"><h1>Link not available</h1><p class="muted">${msg}</p></div></main></body></html>`;
}
