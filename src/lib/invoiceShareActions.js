// Side-effecting half of invoice sharing: the database calls (link, log,
// stop sharing), the PDF upload, and handing things to the browser
// (download, system share, WhatsApp, mail app, clipboard).
//
// Every failure is thrown with its real reason; the caller shows it and logs
// it (see reportShareError). Nothing here decides wording for the shop owner
// beyond the error text itself.

import { supabase } from './supabase';
import { logError } from './errorLogger';
import { shareLinkUrl, maskRecipient } from './invoiceShare';

export const SHARE_BUCKET = 'invoice-shares';

const reason = (e) => e?.message || e?.error_description || e?.details || String(e || 'Unknown error');

// The address clients open. VITE_PUBLIC_APP_URL wins (the desktop app and
// previews do not run on the public address); otherwise the page's own origin.
export function publicAppOrigin() {
  const env = import.meta.env?.VITE_PUBLIC_APP_URL;
  if (env) return env;
  if (typeof window !== 'undefined' && /^https?:$/.test(window.location?.protocol)) return window.location.origin;
  return '';
}

// A link the client can open without signing in, plus the shared PDF behind
// it. Returns { url, expiresAt }. Uploads the PDF to the shop's private
// folder (replacing the last one) so the link always offers the latest copy.
export async function issueShareLink(invoiceId, pdfBlob) {
  if (!invoiceId) throw new Error('Save the invoice before sharing a link to it');
  const { data, error } = await supabase.rpc('invoice_share_link_issue', { p_invoice_id: invoiceId });
  if (error) throw new Error(`Could not make the link: ${reason(error)}`);
  if (!data?.token || !data?.pdf_path) throw new Error('Could not make the link: the server sent no token');

  if (pdfBlob) {
    const { error: upErr } = await supabase.storage.from(SHARE_BUCKET)
      .upload(data.pdf_path, pdfBlob, { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
    if (upErr) throw new Error(`Could not upload the PDF for the link: ${reason(upErr)}`);
  }
  return { url: shareLinkUrl(data.token, publicAppOrigin()), expiresAt: data.expires_at };
}

export async function stopSharing(invoiceId) {
  const { data, error } = await supabase.rpc('invoice_share_link_revoke', { p_invoice_id: invoiceId });
  if (error) throw new Error(`Could not stop sharing: ${reason(error)}`);
  return Number(data) || 0;
}

// The share log. The recipient is masked before it leaves the browser.
export async function logShareEvent({ invoiceId, channel, status, method = null, recipient = null, error = null }) {
  if (!invoiceId) return null;
  const { data, error: rpcErr } = await supabase.rpc('invoice_share_event_log', {
    p_invoice_id: invoiceId, p_channel: channel, p_status: status,
    p_method: method, p_recipient: maskRecipient(recipient), p_error: error ? String(error).slice(0, 500) : null,
  });
  if (rpcErr) throw new Error(`Could not record the share: ${reason(rpcErr)}`);
  return data;
}

// Last share and the live link's views, for the line under the invoice.
export async function fetchShareStatus(invoiceId) {
  if (!invoiceId) return { lastEvent: null, link: null };
  const [ev, ln] = await Promise.all([
    supabase.from('invoice_share_events').select('channel, status, created_at')
      .eq('invoice_id', invoiceId).neq('status', 'failed').neq('status', 'cancelled')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('invoice_share_links').select('view_count, last_viewed_at, expires_at, created_at')
      .eq('invoice_id', invoiceId).is('revoked_at', null).gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ]);
  if (ev.error) throw new Error(`Could not read the share log: ${reason(ev.error)}`);
  if (ln.error) throw new Error(`Could not read the link: ${reason(ln.error)}`);
  return { lastEvent: ev.data || null, link: ln.data || null };
}

export function reportShareError(action, e) {
  console.error(`[invoice share] ${action}:`, e);
  logError({ module: 'Invoices', action: `Share: ${action}`, error_code: e?.code || 'SHARE_ERR', error_message: reason(e), severity: 'Low', stack_trace: e?.stack })
    .catch((le) => console.error('[invoice share] could not log the error:', le));
}

// ── handing things to the browser ───────────────────────────────────────────

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before the address goes.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Feature-detected at run time: can this browser hand a PDF file to the
// system share sheet?
export function canShareFiles() {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
    const probe = new File([new Blob(['%PDF-1.4'], { type: 'application/pdf' })], 'probe.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [probe] }) === true;
  } catch {
    return false;
  }
}

// Returns 'shared' | 'cancelled'. Throws on any other failure (including
// NotAllowedError when the click's permission ran out; the caller asks for
// one more tap).
export async function shareFileWithSystem({ blob, fileName, title, text }) {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const payload = { files: [file], title, text };
  if (!navigator.canShare?.(payload)) throw new Error('This browser cannot share the PDF file');
  try {
    await navigator.share(payload);
    return 'shared';
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
    throw e;
  }
}

// Opened at the click itself, so popup blockers allow it; pointed at the chat
// once the link is ready. opener is cut so the new tab cannot reach this one.
export function openBlankTab() {
  const w = window.open('', '_blank');
  if (w) { try { w.opener = null; } catch { /* cross-origin already */ } }
  return w;
}

export function sendTabTo(tab, url) {
  if (tab && !tab.closed) { tab.location.href = url; return true; }
  const w = window.open(url, '_blank', 'noopener');
  return !!w;
}

export function openMailApp(mailto) {
  // A mailto: address never leaves the page, so a plain navigation is fine.
  window.location.href = mailto;
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('This browser did not allow copying');
}
