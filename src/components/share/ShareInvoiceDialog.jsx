import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Mail, Share2, Link2, Download, XCircle, X, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { useDialogClose } from '../../hooks/useDialogClose';
import {
  buildShareMessage, buildEmailSubject, displayPhone, documentTitle, pdfFileName, pickClientPhone,
  pickClientEmail, whatsappUrl, mailtoUrl, isMobileBrowser, describeShareEvent, describeViews,
} from '../../lib/invoiceShare';
import {
  issueShareLink, stopSharing, logShareEvent, fetchShareStatus, reportShareError, downloadBlob,
  canShareFiles, shareFileWithSystem, openBlankTab, sendTabTo, openMailApp, copyText,
} from '../../lib/invoiceShareActions';

const errText = (e) => e?.message || String(e || 'Something went wrong');

const ShareRow = ({ id, icon: Icon, label, sub, onClick, show = true, tone, busy, disabled }) => (show ? (
  <Button type="button" variant="outline" onClick={onClick} disabled={disabled}
    className={`w-full justify-start h-auto py-2.5 ${tone === 'danger' ? 'text-destructive' : ''}`}>
    {busy === id ? <Loader2 className="animate-spin" /> : <Icon />}
    <span className="flex flex-col items-start text-left min-w-0">
      <span>{label}</span>
      {sub && <span className="text-xs font-normal text-muted-foreground truncate max-w-full">{sub}</span>}
    </span>
  </Button>
) : null);

/**
 * One "Share" control for an invoice: WhatsApp, email, the system share
 * menu (where the browser can share files), copy link, download PDF, and
 * stop sharing. The PDF is made from the invoice template the moment the
 * dialog opens, so the share actions can run inside the click that asked
 * for them.
 *
 * `linkable` is true for a saved row of the invoices table. A document that
 * is not (a manual bill) can still go out as a PDF, without a link and
 * without the share log.
 */
export default function ShareInvoiceDialog({ open, onClose, invoice, businessProfile, client, title: titleProp, linkable }) {
  useDialogClose(onClose, { enabled: open });

  const title = titleProp || documentTitle(invoice, businessProfile);
  const fileName = pdfFileName(invoice, title);
  const canLink = linkable ?? !!invoice?.id;
  const phone = pickClientPhone(client, invoice);
  const email = pickClientEmail(client, invoice);
  const mobile = useMemo(() => (typeof navigator !== 'undefined'
    ? isMobileBrowser(navigator.userAgent, navigator.maxTouchPoints) : false), []);
  const filesOk = useMemo(() => canShareFiles(), []);

  const [pdfState, setPdfState] = useState({ status: 'idle' });
  const [busy, setBusy] = useState(null);
  const [hint, setHint] = useState(null);       // { tone: 'info' | 'warn' | 'error', text }
  const [needsTap, setNeedsTap] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [status, setStatus] = useState({ lastEvent: null, link: null, error: null });

  const pdfRef = useRef(null);   // promise of { blob, pages, bytes }
  const linkRef = useRef(null);  // promise of { url }

  const ensurePdf = useCallback(() => {
    if (!pdfRef.current) {
      setPdfState({ status: 'making' });
      pdfRef.current = import('../../lib/invoicePdf')
        .then((m) => m.renderInvoicePdf({ invoice, businessProfile, client, title }))
        .then((r) => { setPdfState({ status: 'ready', ...r }); return r; })
        .catch((e) => {
          pdfRef.current = null;
          setPdfState({ status: 'error', error: errText(e) });
          reportShareError('make PDF', e);
          throw e;
        });
    }
    return pdfRef.current;
  }, [invoice, businessProfile, client, title]);

  const ensureLink = useCallback(() => {
    if (!canLink) return Promise.resolve(null);
    if (!linkRef.current) {
      linkRef.current = ensurePdf()
        .then((pdf) => issueShareLink(invoice.id, pdf.blob))
        .catch((e) => { linkRef.current = null; throw e; });
    }
    return linkRef.current;
  }, [canLink, ensurePdf, invoice?.id]);

  const refreshStatus = useCallback(async () => {
    if (!canLink || !invoice?.id) return;
    try {
      const s = await fetchShareStatus(invoice.id);
      setStatus({ ...s, error: null });
    } catch (e) {
      reportShareError('read share status', e);
      setStatus((s) => ({ ...s, error: errText(e) }));
    }
  }, [canLink, invoice?.id]);

  // Start the PDF as soon as the dialog opens; forget everything on close.
  useEffect(() => {
    if (!open) return;
    ensurePdf().catch(() => {});
    refreshStatus();
    return () => {
      pdfRef.current = null; linkRef.current = null;
      setPdfState({ status: 'idle' }); setHint(null); setBusy(null); setNeedsTap(false); setConfirmStop(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id, invoice?.invoice_number]);

  const log = useCallback(async (ev) => {
    if (!canLink) return;
    try {
      await logShareEvent({ invoiceId: invoice.id, ...ev });
    } catch (e) {
      reportShareError('record share', e);
      setHint((h) => ({ tone: 'warn', text: `${h?.text ? `${h.text} ` : ''}${errText(e)}.` }));
    }
    refreshStatus();
  }, [canLink, invoice?.id, refreshStatus]);

  // The link, or null with a warning: a failed link never blocks the PDF.
  const linkOrWarn = async () => {
    try {
      return (await ensureLink())?.url || null;
    } catch (e) {
      reportShareError('make link', e);
      return { failed: errText(e) };
    }
  };

  const message = (link) => buildShareMessage({ invoice, business: businessProfile, client, link, title });
  const subject = buildEmailSubject({ invoice, business: businessProfile, title });

  const fail = (action, channel, e) => {
    reportShareError(action, e);
    setHint({ tone: 'error', text: errText(e) });
    if (channel) log({ channel, status: 'failed', error: errText(e) });
  };

  // Hand the PDF to the system share menu. Returns false when the browser
  // wants one more tap (the click's permission ran out while we waited).
  const systemShare = async ({ channel, method, recipient, text }) => {
    const pdf = await ensurePdf();
    try {
      const r = await shareFileWithSystem({ blob: pdf.blob, fileName, title: subject, text });
      setNeedsTap(false);
      if (r === 'cancelled') { setHint({ tone: 'info', text: 'Share menu closed. Nothing was sent.' }); return true; }
      setHint({ tone: 'info', text: 'Handed to the share menu. Finish sending it in the app you picked.' });
      await log({ channel, method, recipient, status: 'opened' });
      return true;
    } catch (e) {
      if (e?.name === 'NotAllowedError') {
        setNeedsTap(true);
        setHint({ tone: 'info', text: 'The PDF is ready. Tap the button again to open the share menu.' });
        return false;
      }
      throw e;
    }
  };

  const onWhatsApp = async () => {
    setHint(null); setBusy('whatsapp');
    const useSheet = mobile && filesOk;
    // Opened now, inside the click, or the popup blocker stops it later.
    const tab = useSheet ? null : openBlankTab();
    try {
      const link = await linkOrWarn();
      const linkUrl = typeof link === 'string' ? link : null;
      const text = message(linkUrl);
      if (useSheet) {
        await systemShare({ channel: 'whatsapp', method: 'share_sheet', recipient: phone, text });
      } else {
        const pdf = await ensurePdf();
        downloadBlob(pdf.blob, fileName);
        const url = whatsappUrl({ phone, text, mobile });
        if (!sendTabTo(tab, url)) throw new Error('The browser blocked the WhatsApp tab. Allow pop-ups for this site and try again.');
        const notes = ['The PDF is in your downloads. Drop it into the chat.'];
        if (!phone) notes.push('This client has no phone number saved, so pick the chat in WhatsApp.');
        if (link?.failed) notes.push(`The message has no link: ${link.failed}.`);
        setHint({ tone: link?.failed || !phone ? 'warn' : 'info', text: notes.join(' ') });
        await log({ channel: 'whatsapp', method: mobile ? 'wa.me' : 'web.whatsapp.com', recipient: phone, status: 'opened' });
      }
    } catch (e) {
      if (tab && !tab.closed) tab.close();
      fail('WhatsApp', 'whatsapp', e);
    } finally {
      setBusy(null);
    }
  };

  const onEmail = async () => {
    setHint(null); setBusy('email');
    try {
      const link = await linkOrWarn();
      const linkUrl = typeof link === 'string' ? link : null;
      const text = message(linkUrl);
      if (mobile && filesOk) {
        await systemShare({ channel: 'email', method: 'share_sheet', recipient: email, text });
      } else {
        const pdf = await ensurePdf();
        downloadBlob(pdf.blob, fileName);
        openMailApp(mailtoUrl({ to: email, subject, body: text }));
        const notes = ['The PDF is in your downloads. Attach it to the email.'];
        if (!email) notes.push('This client has no email address saved, so type it in your mail app.');
        if (link?.failed) notes.push(`The message has no link: ${link.failed}.`);
        setHint({ tone: link?.failed || !email ? 'warn' : 'info', text: notes.join(' ') });
        await log({ channel: 'email', method: 'mailto', recipient: email, status: 'opened' });
      }
    } catch (e) {
      fail('email', 'email', e);
    } finally {
      setBusy(null);
    }
  };

  const onSendPdf = async () => {
    setHint(null); setBusy('sheet');
    try {
      const link = needsTap ? await linkRef.current?.catch(() => null) : await linkOrWarn();
      const linkUrl = typeof link === 'string' ? link : link?.url || null;
      await systemShare({ channel: 'share_sheet', method: 'navigator.share', text: message(linkUrl) });
    } catch (e) {
      fail('share menu', 'share_sheet', e);
    } finally {
      setBusy(null);
    }
  };

  const onCopyLink = async () => {
    setHint(null); setBusy('copy');
    try {
      const link = await ensureLink();
      await copyText(link.url);
      setHint({ tone: 'info', text: 'Link copied. It opens for 60 days unless you stop sharing.' });
      await log({ channel: 'link_copy', method: 'clipboard', status: 'copied' });
    } catch (e) {
      fail('copy link', 'link_copy', e);
    } finally {
      setBusy(null);
    }
  };

  const onDownload = async () => {
    setHint(null); setBusy('download');
    try {
      const pdf = await ensurePdf();
      downloadBlob(pdf.blob, fileName);
      setHint({ tone: 'info', text: `Saved ${fileName} to your downloads.` });
      await log({ channel: 'download', method: 'pdf', status: 'downloaded' });
    } catch (e) {
      fail('download PDF', null, e);
    } finally {
      setBusy(null);
    }
  };

  const onStop = async () => {
    if (!confirmStop) { setConfirmStop(true); return; }
    setHint(null); setBusy('stop');
    try {
      const n = await stopSharing(invoice.id);
      linkRef.current = null;
      setConfirmStop(false);
      setHint({ tone: 'info', text: n ? 'Sharing stopped. Links sent before no longer open.' : 'This invoice had no open link.' });
      refreshStatus();
    } catch (e) {
      fail('stop sharing', null, e);
    } finally {
      setBusy(null);
    }
  };

  if (!open || !invoice) return null;

  const making = pdfState.status === 'making';
  const pdfFailed = pdfState.status === 'error';
  const disabled = !!busy || pdfFailed;
  const number = invoice.invoice_number || '';

  const toneCls = {
    info: 'bg-muted text-foreground',
    warn: 'bg-amber-50 text-amber-800 border border-amber-200',
    error: 'bg-red-50 text-red-700 border border-red-200',
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-4 print:hidden"
      onClick={onClose} role="presentation">
      <Card role="dialog" aria-modal="true" aria-label={`Share ${title} ${number}`}
        className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Share {title.toLowerCase()} {number}</CardTitle>
            <CardDescription className="truncate">
              {making ? 'Getting the PDF ready' : pdfFailed ? 'The PDF could not be made'
                : pdfState.status === 'ready' ? `${fileName}, ${pdfState.pages} ${pdfState.pages === 1 ? 'page' : 'pages'}, ${Math.max(1, Math.round(pdfState.bytes / 1024))} KB` : ''}
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {pdfFailed && (
            <div className="rounded-md px-3 py-2 text-xs bg-red-50 text-red-700 border border-red-200">
              {pdfState.error}
              <button type="button" className="ml-2 underline" onClick={() => ensurePdf().catch(() => {})}>Try again</button>
            </div>
          )}
          <ShareRow busy={busy} disabled={disabled} id="whatsapp" icon={MessageCircle} label="WhatsApp"
            sub={phone ? `To ${displayPhone(phone)}` : 'No phone number saved for this client'} onClick={onWhatsApp} />
          <ShareRow busy={busy} disabled={disabled} id="email" icon={Mail} label="Email"
            sub={email || 'No email address saved for this client'} onClick={onEmail} />
          <ShareRow busy={busy} disabled={disabled} id="sheet" icon={Share2} label="Send PDF" sub="Pick an app on this device" show={filesOk} onClick={onSendPdf} />
          <ShareRow busy={busy} disabled={disabled} id="copy" icon={Link2} label="Copy link" sub="Opens without signing in, for 60 days" show={canLink} onClick={onCopyLink} />
          <ShareRow busy={busy} disabled={disabled} id="download" icon={Download} label="Download PDF" onClick={onDownload} />
          {canLink && status.link && (
            <ShareRow busy={busy} disabled={disabled} id="stop" icon={XCircle} tone="danger" label={confirmStop ? 'Yes, stop sharing' : 'Stop sharing'}
              sub={confirmStop ? 'Links already sent will stop opening' : null} onClick={onStop} />
          )}

          {hint && <div role="status" className={`rounded-md px-3 py-2 text-xs ${toneCls[hint.tone]}`}>{hint.text}</div>}

          {canLink && (status.lastEvent || status.link || status.error) && (
            <div className="pt-1 text-xs text-muted-foreground space-y-0.5">
              {status.lastEvent && <div>{describeShareEvent(status.lastEvent)}</div>}
              {status.link && <div>{describeViews(status.link)}</div>}
              {status.error && <div className="text-red-700">{status.error}</div>}
            </div>
          )}
          {!canLink && (
            <div className="pt-1 text-xs text-muted-foreground">Save it as an invoice to share a link the client can open.</div>
          )}
        </CardContent>
      </Card>
    </div>,
    document.body,
  );
}
