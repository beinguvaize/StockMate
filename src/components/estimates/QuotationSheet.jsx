import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '../ui/button';
import { useDialogClose } from '../../hooks/useDialogClose';
import { docTypeLabel, estimateDay, longDay, lineAmount } from '../../lib/estimateView';
import { amt2, rupees2 } from './parts';

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm 10mm; }
  html, body { background: #fff !important; }
  body > *:not(#estimate-print-portal) { display: none !important; }
  #estimate-print-portal { position: static !important; overflow: visible !important; background: #fff !important; }
  #estimate-print-portal .print-hidden { display: none !important; }
  #estimate-print-portal .sheet-scroll { overflow: visible !important; padding: 0 !important; }
  #estimate-print-sheet { box-shadow: none !important; margin: 0 !important; width: 100% !important; }
}`;

/**
 * Print view for an estimate (estimates-09): a plain A4 sheet titled by its
 * document type, printed with the browser. Display only; reads the stored
 * figures. The footer says plainly it is not a tax invoice.
 */
export default function QuotationSheet({ estimate, businessProfile = {}, onClose }) {
  useDialogClose(onClose, { enabled: !!estimate });
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'estimate-print-css';
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
  if (!estimate) return null;
  const e = estimate;
  const label = docTypeLabel(e);
  const b = businessProfile || {};
  const items = Array.isArray(e.items) ? e.items : [];
  const igst = Number(e.igst_amount) > 0;
  const round = Number(e.round_off) || 0;
  const party = e.doc_type === 'DELIVERY_CHALLAN' ? 'Ship to' : e.doc_type === 'PROFORMA' ? 'Bill to' : 'Quote to';

  return createPortal(
    <div id="estimate-print-portal" className="fixed inset-0 z-[180] flex flex-col bg-canvas">
      <div className="print-hidden flex items-center gap-2.5 border-b border-sep bg-surface px-[18px] py-3">
        <Button variant="secondary" size="icon-sm" onClick={onClose} aria-label="Back" title="Back"><ArrowLeft /></Button>
        <div className="min-w-0">
          <h2 className="truncate font-tight text-[16px] font-semibold tracking-[-0.01em]">{label} {e.estimate_number}</h2>
          <p className="truncate text-[12px] text-mute">A4 · print, or save as PDF from the print window</p>
        </div>
        <span className="flex-1" />
        <Button size="sm" onClick={() => window.print()}><Printer /> Print</Button>
      </div>
      <div className="sheet-scroll flex-1 overflow-auto px-4 py-6">
        <div id="estimate-print-sheet" className="mx-auto w-full max-w-[720px] bg-white p-8 text-[11.5px] leading-[1.5] text-[#1f2328] shadow-[0_10px_40px_-18px_rgba(17,20,24,0.35)]">
          <div className="flex items-start justify-between gap-6 border-b border-[#d8dade] pb-3">
            <div>
              <h4 className="font-tight text-[16px] font-semibold text-[#111418]">{b.name || ''}</h4>
              {b.address && <div className="whitespace-pre-line">{b.address}</div>}
              <div>{[b.gst_no ? `GSTIN ${b.gst_no}` : null, b.phone || null].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="text-right font-tight text-[13px] font-semibold uppercase tracking-[0.08em] text-[#5b6168]">
              {label}<br /><span className="text-[12px] normal-case tracking-normal text-[#111418] tabular-nums">{e.estimate_number}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 py-3">
            <div>
              <i className="block font-tight text-[9.5px] font-semibold not-italic uppercase tracking-[0.08em] text-[#8a9096]">{party}</i>
              <b className="text-[#111418]">{e.client_name || 'Walk-in'}</b>
              {e.client_gstin && <><br />GSTIN {e.client_gstin}</>}
              {e.client_address && <><br />{e.client_address}</>}
              {e.place_of_supply && <><br />{e.place_of_supply}</>}
            </div>
            <div>
              <i className="block font-tight text-[9.5px] font-semibold not-italic uppercase tracking-[0.08em] text-[#8a9096]">Details</i>
              Date {longDay(estimateDay(e))}
              {e.valid_until && <><br />Valid until {longDay(e.valid_until)}</>}
              {e.place_of_supply && <><br />Place of supply {e.place_of_supply}</>}
            </div>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-y border-[#d8dade] font-tight text-[10px] font-semibold uppercase tracking-[0.04em] text-[#5b6168]">
                <th className="py-1.5 pr-2 text-left">#</th><th className="py-1.5 pr-2 text-left">Item</th><th className="py-1.5 pr-2 text-left">HSN</th>
                <th className="py-1.5 pr-2 text-right">Qty</th><th className="py-1.5 pr-2 text-right">Rate</th><th className="py-1.5 pr-2 text-right">GST</th><th className="py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l, i) => {
                const hsn = l.hsn_code || (l.hsn && l.hsn !== 'N/A' ? l.hsn : '');
                return (
                  <tr key={i} className="border-b border-[#eceef0]">
                    <td className="py-1.5 pr-2">{i + 1}</td><td className="py-1.5 pr-2">{l.name}</td><td className="py-1.5 pr-2">{hsn}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{Number(l.qty) || 0}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{amt2(l.rate)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{Number(l.taxRate) || 0}%</td>
                    <td className="py-1.5 text-right tabular-nums">{amt2(lineAmount(l))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="ml-auto mt-3 w-[260px] [&>div]:flex [&>div]:justify-between [&>div]:py-0.5 [&_span:last-child]:tabular-nums">
            <div><span>Taxable value</span><span>{rupees2(e.taxable_amount)}</span></div>
            {igst ? <div><span>IGST</span><span>{rupees2(e.igst_amount)}</span></div> : (
              <>
                <div><span>CGST</span><span>{rupees2(e.cgst_amount)}</span></div>
                <div><span>SGST</span><span>{rupees2(e.sgst_amount)}</span></div>
              </>
            )}
            {round !== 0 && <div><span>Round off</span><span>{round > 0 ? '+' : '−'}{amt2(Math.abs(round))}</span></div>}
            <div className="mt-1 border-t border-[#d8dade] pt-1.5 font-tight text-[13px] font-semibold text-[#111418]"><span>Total</span><span>{rupees2(e.grand_total)}</span></div>
          </div>
          {e.notes && (
            <div className="mt-3.5 text-[10.5px]">
              <i className="mb-0.5 block font-tight text-[9.5px] font-semibold not-italic uppercase tracking-[0.08em] text-[#8a9096]">Notes</i>
              <span className="whitespace-pre-line">{e.notes}</span>
            </div>
          )}
          <div className="mt-8 flex items-end justify-between gap-6 text-[10.5px] text-[#5b6168]">
            <span>This is a {label.toLowerCase()}, not a tax invoice.</span>
            <span className="text-right">For {b.name || ''}<br /><br />Authorised signatory</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
