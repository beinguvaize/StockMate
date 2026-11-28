import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, MessageCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { CloseButton } from '../ui/SidePanel';
import { Seg } from '../documents/DocParts';
import { formatDate } from '../../lib/utils';
import { money, rangeStartFor, ledgerWindow, whatsappUrl } from '../../lib/clientView';

/**
 * Account Statement (approved mockup clients-12; new): the account page's
 * rows on a plain sheet to print, or a short summary to open in WhatsApp.
 * Every figure is the statement's own (lib/clientStatement): the brought
 * forward balance, the rows, billed and received in the period, and the
 * balance due, which is the closing balance across all history.
 *
 * Printing uses the browser's print dialog, which can also save a PDF.
 * The sheet's printed layout was not part of the redesign.
 */
export const RANGES = [['1M', 'Month'], ['3M', '3 months'], ['FY', 'This FY'], ['ALL', 'All']];

const PRINT_CSS = `@media print{
  @page{size:A4 portrait;margin:12mm;}
  html,body{background:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
  body > *:not(#client-statement-portal){display:none!important;}
  #client-statement-portal{position:static!important;background:#fff!important;overflow:visible!important;padding:0!important;}
  #client-statement-portal .print-hidden{display:none!important;}
  #client-statement-portal .st-paper{box-shadow:none!important;width:auto!important;max-width:none!important;padding:0!important;}
}`;

const n2 = (v) => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function statementShareText({ client, shopName, from, to, w, cur, upi }) {
  const period = from ? `${formatDate(from)} to ${formatDate(to)}` : `up to ${formatDate(to)}`;
  return [
    `Statement of account${shopName ? ` from ${shopName}` : ''}`,
    `${client.name} · ${period}`,
    '',
    ...(from ? [`Opening balance: ${money(w.opening, cur)}`] : []),
    `Billed: ${money(w.debit, cur)}`,
    `Received: ${money(w.credit, cur)}`,
    `Balance due: ${money(w.closing, cur)}`,
    ...(upi ? ['', `UPI: ${upi}`] : []),
  ].join('\n');
}

export default function StatementViewer({ open, client, business = {}, rows = [], today, initialRange = '1M', cur = '₹', onClose }) {
  const [range, setRange] = useState(initialRange);
  useEffect(() => { if (open) setRange(initialRange); }, [open, initialRange]);
  useEffect(() => {
    if (!open) return undefined;
    const el = document.createElement('style');
    el.textContent = PRINT_CSS;
    document.head.appendChild(el);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { el.remove(); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  const from = rangeStartFor(range, today);
  const w = useMemo(() => ledgerWindow(rows, from), [rows, from]);
  if (!open || !client) return null;

  const shopName = business?.businessName || business?.name || '';
  const shopGst = business?.gst_no || business?.gstin || '';
  const upi = business?.upi_id || '';
  const periodWords = from ? `${formatDate(from)} to ${formatDate(today)}` : `All entries to ${formatDate(today)}`;
  const share = () => window.open(whatsappUrl(client.phone, statementShareText({ client, shopName, from, to: today, w, cur, upi })), '_blank', 'noopener');
  const th = 'border-b border-[#E3E4E6] px-1.5 py-1.5 text-left text-[9.5px] font-semibold uppercase tracking-[0.04em] text-[#80868d]';
  const td = 'border-b border-[#F0F0F1] px-1.5 py-1.5 text-[11px]';

  return createPortal(
    <div id="client-statement-portal" role="dialog" aria-modal="true" aria-label="Account statement"
      className="fixed inset-0 z-[200] flex flex-col bg-[#E6E5E2]">
      <div className="print-hidden flex flex-wrap items-center gap-2.5 border-b border-sep bg-surface px-[18px] py-3">
        <CloseButton onClick={onClose} />
        <div className="min-w-0">
          <h3 className="font-tight text-[16px] font-semibold tracking-[-0.01em]">Account Statement</h3>
          <p className="text-[12px] text-mute">{client.name} · {periodWords}</p>
        </div>
        <div className="flex-1" />
        <Seg value={range} onChange={setRange} options={RANGES} ariaLabel="Period" />
        <Button variant="secondary" onClick={() => window.print()}><Printer /> Print or save PDF</Button>
        <Button className="bg-[#1FA855] hover:bg-[#178a45]" onClick={share}><MessageCircle /> Share on WhatsApp</Button>
      </div>
      <div className="flex-1 overflow-auto px-4 py-[26px]">
        <div className="st-paper mx-auto max-w-[640px] rounded-[3px] bg-white px-9 py-8 text-[11px] leading-[1.45] text-[#2b3036] shadow-[0_0_0_1px_rgba(17,20,24,0.06),0_14px_34px_-20px_rgba(17,20,24,0.4)]" data-testid="statement-paper">
          <div className="flex items-start justify-between border-b border-[#E3E4E6] pb-3">
            <div>
              <h4 className="font-tight text-[14px] font-semibold text-[#111418]">{shopName || 'Statement'}</h4>
              <div>{business?.address}</div>
              <div>{[shopGst ? `GSTIN ${shopGst}` : null, business?.phone].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="text-right font-tight text-[11px] font-semibold uppercase tracking-[0.08em] text-[#80868d]">
              Statement of account<br /><span className="normal-case tracking-normal font-medium">{periodWords}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 py-3">
            <div>
              <i className="mb-0.5 block not-italic font-tight text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#80868d]">Statement for</i>
              <b className="text-[#111418]">{client.name}</b>
              {client.address && <div>{client.address}</div>}
              {client.gstin && <div>GSTIN {client.gstin}</div>}
            </div>
            <div className="text-right">
              <i className="mb-0.5 block not-italic font-tight text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#80868d]">Balance due</i>
              <b className="font-tight text-[18px] font-semibold text-[#111418] tabular-nums">{money(w.closing, cur, { paise: 'always' })}</b>
            </div>
          </div>
          <table className="w-full border-collapse tabular-nums">
            <thead><tr><th className={th}>Date</th><th className={th}>Details</th><th className={`${th} text-right`}>Billed</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Balance</th></tr></thead>
            <tbody>
              {from && (
                <tr><td className={td}>{formatDate(from)}</td><td className={td}>Opening balance</td><td className={td} /><td className={td} /><td className={`${td} text-right`}>{n2(w.opening)}</td></tr>
              )}
              {w.inRange.length === 0 && (
                <tr><td colSpan={5} className={`${td} py-4 text-center text-[#80868d]`}>No bills or payments in this period.</td></tr>
              )}
              {w.inRange.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(r.date)}</td>
                  <td className={td}>{r.description}</td>
                  <td className={`${td} text-right`}>{r.debit > 0 ? n2(r.debit) : ''}</td>
                  <td className={`${td} text-right`}>{r.credit > 0 ? n2(r.credit) : ''}</td>
                  <td className={`${td} text-right font-medium`}>{n2(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto mt-2 w-[52%] tabular-nums">
            {from && <div className="flex justify-between py-0.5"><span>Opening balance</span><span>{n2(w.opening)}</span></div>}
            <div className="flex justify-between py-0.5"><span>Billed</span><span>{n2(w.debit)}</span></div>
            <div className="flex justify-between py-0.5"><span>Received</span><span>{n2(w.credit)}</span></div>
            <div className="mt-1 flex justify-between border-t border-[#E3E4E6] pt-1.5 font-tight text-[12.5px] font-semibold text-[#111418]"><span>Balance due</span><span>{money(w.closing, cur, { paise: 'always' })}</span></div>
          </div>
          <div className="mt-[22px] flex justify-between border-t border-[#F0F0F1] pt-2.5 text-[10px] text-[#80868d]">
            <span>{upi ? <>Pay by UPI to {upi}<br /></> : null}{shopName ? `For ${shopName}` : ''}</span>
            <span>Printed {formatDate(today)}</span>
          </div>
        </div>
        <p className="print-hidden mt-2.5 text-center text-[12px] text-mute">Plain sheet of the statement. Its printed layout is not part of this redesign.</p>
      </div>
    </div>,
    document.body,
  );
}
