// The page a client opens from a shared invoice link: /i/#<token>.
//
// A tiny stand-alone bundle (no React, no app code, no sign-in). The token
// sits after '#', so it never reaches a server log or a Referer header; this
// script reads it and asks the invoice-view Edge Function, which checks it.
// Everything shown is set with textContent, so no value can become markup.

import './viewer.css';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/invoice-view`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const GONE = 'This link is no longer available. Please ask the shop to send it again.';
const RATE = 'Too many tries. Please wait a few minutes and open the link again.';

const app = document.getElementById('app');

const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  if (text != null) n.textContent = String(text);
  return n;
};

function showMessage(title, text) {
  app.replaceChildren();
  const card = el('div', { class: 'card' });
  card.append(el('h1', {}, title), el('p', { class: 'muted' }, text));
  app.append(card);
  document.title = title;
}

async function call(body) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ANON_KEY ? { apikey: ANON_KEY } : {}) },
    body: JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
  let data = null;
  try { data = await res.json(); } catch { /* not JSON: treated as a failure below */ }
  return { status: res.status, data };
}

function showInvoice(token, v) {
  app.replaceChildren();
  const card = el('div', { class: 'card' });
  card.append(el('h1', {}, v.shopName));
  if (v.shopGstin) card.append(el('p', { class: 'muted' }, `GSTIN ${v.shopGstin}`));

  const dl = el('dl');
  const row = (k, val, cls) => { dl.append(el('dt', {}, k)); dl.append(el('dd', cls ? { class: cls } : {}, val)); };
  row(v.title, v.number);
  row('Date', v.date);
  row('Total', v.total);
  row('Balance due', v.isPaid ? 'Paid in full' : v.balanceDue, 'due');
  card.append(dl);

  const btn = el('button', { type: 'button' }, 'Download PDF');
  const err = el('p', { class: 'err', role: 'alert', hidden: '' });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Getting the PDF';
    err.hidden = true;
    try {
      const { status, data } = await call({ t: token, download: true });
      const url = data?.ok && typeof data.url === 'string' ? new URL(data.url) : null;
      // Only ever go to this project's own storage address.
      if (!url || url.origin !== new URL(FN_URL).origin || !url.pathname.startsWith('/storage/v1/object/sign/')) {
        throw new Error(status === 429 ? RATE : data?.pdfMissing
          ? 'The PDF is not available yet. Please ask the shop to share it again.' : GONE);
      }
      window.location.assign(url.href);
    } catch (e) {
      err.textContent = e?.message && e.message !== 'Failed to fetch' ? e.message : 'Could not reach the server. Check the internet connection and try again.';
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Download PDF';
    }
  });
  card.append(btn, err);
  app.append(card, el('p', { class: 'foot' }, `Shared with you by ${v.shopName}`));
  document.title = `${v.title} from ${v.shopName}`;
}

async function start() {
  const token = decodeURIComponent(window.location.hash.slice(1));
  if (!TOKEN_RE.test(token) || !FN_URL.startsWith('https://')) {
    showMessage('Link not available', GONE);
    return;
  }
  try {
    const { status, data } = await call({ t: token });
    if (status === 429 || data?.rate) { showMessage('Link not available', RATE); return; }
    if (!data?.ok || !data.view) { showMessage('Link not available', GONE); return; }
    showInvoice(token, data.view);
  } catch {
    showMessage('Could not open the invoice', 'Could not reach the server. Check the internet connection and reload this page.');
  }
}

start();
