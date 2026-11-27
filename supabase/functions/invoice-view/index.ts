// invoice-view: the public side of a shared invoice link.
//
// A shop shares an invoice; the client gets a link carrying a random token.
// This function is the only way that token turns into anything. It never
// trusts an invoice id from the caller: it hashes the token, and
// public.invoice_share_resolve (service role only) finds the link by that
// hash, checks revoke / expiry / the invoice still existing, counts the view
// and returns the handful of fields the page shows. Every failure looks the
// same to the caller.
//
// DEPLOY (Director):
//   supabase functions deploy invoice-view --no-verify-jwt
//   The client has no account, so JWT verification must be OFF. The function
//   does its own check (the token). Optional secret INVOICE_VIEW_IP_SALT: any
//   long random string, mixed into the hash of the caller's address that the
//   rate limiter stores.
//
// TWO WAYS IN
//
//   POST {"t": token}                  -> JSON for the app's static viewer page
//   POST {"t": token, "download": true} -> JSON {url} of a 60-second signed PDF address
//   GET  ?t=token                       -> a minimal HTML page
//   GET  ?t=token&dl=1                  -> 302 to a 60-second signed PDF address
//
// Supabase rewrites text/html from functions to text/plain unless the project
// has a custom domain, so the link the app sends today points at the static
// viewer (/i/#token on the web app), which uses the POST form. The GET page is
// ready for when a custom domain is added; src/lib/invoiceShare.js
// (shareLinkUrl) is the one place the link shape is decided.

import {
  isValidToken, sha256Hex, isPreviewBot, clientAddress, publicView,
  renderInvoicePage, renderGonePage, pageCsp, SECURITY_HEADERS,
} from './core.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  ?? (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; } })()
  ?? '';
const IP_SALT = Deno.env.get('INVOICE_VIEW_IP_SALT') ?? '';
const BUCKET = 'invoice-shares';
const SIGNED_URL_SECONDS = 60;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '600',
};

// A cheap first line in front of the database limiter, per worker.
const burst = new Map<string, { n: number; reset: number }>();
function burstAllowed(key: string): boolean {
  const now = Date.now();
  const b = burst.get(key);
  if (!b || b.reset < now) {
    if (burst.size > 5000) burst.clear();
    burst.set(key, { n: 1, reset: now + 60_000 });
    return true;
  }
  b.n += 1;
  return b.n <= 30;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...CORS, 'Content-Type': 'application/json; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" },
  });

function html(body: string, nonce: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': pageCsp(nonce) },
  });
}

const newNonce = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/[^A-Za-z0-9]/g, '');

type Resolved = { ok: boolean; rate?: boolean; pdf_path?: string; [k: string]: unknown };

async function resolve(token: string, clientKey: string, countView: boolean): Promise<Resolved> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/invoice_share_resolve`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token_hash: await sha256Hex(token), p_client_key: clientKey, p_count_view: countView }),
  });
  if (!res.ok) {
    // Log the database's reason (never the token) and fail closed.
    console.error('invoice-view: resolve failed', res.status, (await res.text()).slice(0, 500));
    throw new Error('resolve failed');
  }
  return await res.json();
}

async function signedPdfUrl(path: string, fileName: string): Promise<string | null> {
  const enc = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${enc}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
  });
  if (!res.ok) {
    console.error('invoice-view: sign failed', res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const body = await res.json();
  const signed = body?.signedURL || body?.signedUrl;
  if (typeof signed !== 'string' || !signed.startsWith('/')) return null;
  const sep = signed.includes('?') ? '&' : '?';
  return `${SUPABASE_URL}/storage/v1${signed}${sep}download=${encodeURIComponent(fileName)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ ok: false }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('invoice-view: SUPABASE_URL or service key missing');
    return json({ ok: false }, 500);
  }

  const isPost = req.method === 'POST';
  const url = new URL(req.url);
  let token = '';
  let download = false;
  if (isPost) {
    try {
      const body = await req.json();
      token = typeof body?.t === 'string' ? body.t : '';
      download = body?.download === true;
    } catch { /* bad body: treated as an unknown link below */ }
  } else {
    token = url.searchParams.get('t') ?? '';
    download = url.searchParams.get('dl') === '1';
  }

  const nonce = newNonce();
  const gone = (rateLimited = false) => isPost
    ? json({ ok: false, rate: rateLimited || undefined }, rateLimited ? 429 : 404)
    : html(renderGonePage({ nonce, rateLimited }), nonce, rateLimited ? 429 : 404);

  const addr = clientAddress(req.headers);
  if (!burstAllowed(addr)) return gone(true);
  if (!isValidToken(token)) return gone();

  try {
    const clientKey = await sha256Hex(IP_SALT + '|' + addr);
    const countView = !download && !isPreviewBot(req.headers.get('user-agent'));
    const row = await resolve(token, clientKey, countView);
    if (!row?.ok) return gone(!!row?.rate);
    const view = publicView(row);

    if (download) {
      const signed = await signedPdfUrl(String(row.pdf_path || ''), view.fileName);
      if (!signed) {
        return isPost
          ? json({ ok: false, pdfMissing: true }, 404)
          : html(renderGonePage({ nonce }), nonce, 404);
      }
      return isPost
        ? json({ ok: true, url: signed })
        : new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: signed } });
    }

    if (isPost) return json({ ok: true, view });
    const self = new URL(req.url);
    const downloadHref = `${self.pathname}?t=${encodeURIComponent(token)}&dl=1`;
    return html(renderInvoicePage(view, { nonce, downloadHref }), nonce);
  } catch (e) {
    console.error('invoice-view: failed', e instanceof Error ? e.message : String(e));
    return gone();
  }
});
