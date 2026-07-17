import React, { useMemo } from 'react';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { calculateGST, formatINR, amountToWords } from '../../../lib/gstEngine';
import { formatDate } from '../../../lib/utils';

// A4 GST tax invoice for registered clients.
// CGST/SGST on intra-state, IGST on inter-state (business state vs client state).
const GSTInvoicePrint = ({ sale, client = {}, business = {}, onClose }) => {
  useDialogClose(onClose);
  const items = Array.isArray(sale?.items) ? sale.items : [];

  const gst = useMemo(
    () => calculateGST(items, business.state || '', client.state || ''),
    [items, business.state, client.state]
  );

  const invoiceNo = sale?.id ? String(sale.id).split('-').pop().toUpperCase() : '—';
  const invoiceDate = formatDate(sale?.date);
  const pay = (sale?.paymentMethod || sale?.payment_method || 'CASH').toUpperCase();
  const status = (sale?.paymentStatus || sale?.payment_status || 'PAID').toUpperCase();
  const paid = Number(sale?.paidAmount ?? sale?.paid_amount ?? 0);
  const due = Math.max(0, gst.grandTotal - paid);

  const handlePrint = () => window.print();

  return createPortal(
    <div id="sale-print-portal" className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
      {/* Toolbar */}
      <div className="print-chrome fixed top-4 right-4 flex gap-2 z-[110]">
        <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 rounded-pill bg-ink-primary text-white font-bold text-xs hover:opacity-90">
          <Printer size={14} /> PRINT
        </button>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white border border-black/10 flex items-center justify-center hover:bg-red-50 hover:text-red-500">
          <X size={16} />
        </button>
      </div>

      {/* A4 sheet */}
      <div className="print-sheet bg-white shadow-xl my-8 w-[210mm] min-h-[297mm] p-10 text-[12px] text-black">
        {/* Title band */}
        <div className="text-center border-2 border-black py-2 mb-4">
          <div className="text-xs font-bold tracking-widest">TAX INVOICE</div>
          <div className="text-[10px] opacity-70">ORIGINAL FOR RECIPIENT</div>
        </div>

        {/* Business + Invoice meta */}
        <div className="grid grid-cols-2 border border-black">
          <div className="p-3 border-r border-black">
            <div className="text-lg font-bold uppercase">{business.name || 'BUSINESS NAME'}</div>
            <div className="text-[11px] leading-snug mt-1">{business.address || '—'}</div>
            <div className="text-[11px] mt-1">
              {business.phone && <span>Ph: {business.phone}  </span>}
              {business.email && <span>· {business.email}</span>}
            </div>
            <div className="text-[11px] mt-1">
              <span className="font-bold">GSTIN:</span> {business.gst_no || '—'}
              {business.state && <span>   <span className="font-bold">State:</span> {business.state}{business.state_code ? ` (${business.state_code})` : ''}</span>}
            </div>
            {business.pan_no && <div className="text-[11px]"><span className="font-bold">PAN:</span> {business.pan_no}</div>}
          </div>
          <div className="p-3 text-[11px]">
            <Row k="Invoice No" v={invoiceNo} />
            <Row k="Invoice Date" v={invoiceDate} />
            <Row k="Payment Mode" v={pay} />
            <Row k="Status" v={status} />
            <Row k="Supply Type" v={gst.isInterstate ? 'Inter-State' : 'Intra-State'} />
          </div>
        </div>

        {/* Bill to */}
        <div className="grid grid-cols-2 border border-black border-t-0">
          <div className="p-3 border-r border-black">
            <div className="text-[10px] font-bold uppercase opacity-60 mb-1">Bill To</div>
            <div className="text-sm font-bold">{client.name || 'Customer'}</div>
            {client.address && <div className="text-[11px] leading-snug mt-1">{client.address}</div>}
            <div className="text-[11px] mt-1">
              {client.contact && <span>Ph: {client.contact}  </span>}
            </div>
            <div className="text-[11px] mt-1">
              <span className="font-bold">GSTIN:</span> {client.gstin || client.gst_no || 'URD'}
              {client.state && <span>   <span className="font-bold">State:</span> {client.state}</span>}
            </div>
          </div>
          <div className="p-3">
            <div className="text-[10px] font-bold uppercase opacity-60 mb-1">Ship To</div>
            <div className="text-sm font-bold">{client.name || 'Customer'}</div>
            {client.address && <div className="text-[11px] leading-snug mt-1">{client.address}</div>}
          </div>
        </div>

        {/* Items table */}
        <table className="w-full border-collapse border border-black border-t-0 text-[11px]">
          <thead>
            <tr className="bg-zinc-100">
              <th className="border border-black px-1 py-1 text-center w-8">#</th>
              <th className="border border-black px-2 py-1 text-left">Description</th>
              <th className="border border-black px-1 py-1 text-center w-16">HSN</th>
              <th className="border border-black px-1 py-1 text-right w-12">Qty</th>
              <th className="border border-black px-1 py-1 text-right w-20">Rate</th>
              <th className="border border-black px-1 py-1 text-right w-20">Taxable</th>
              <th className="border border-black px-1 py-1 text-center w-10">GST%</th>
              {gst.isInterstate ? (
                <th className="border border-black px-1 py-1 text-right w-20">IGST</th>
              ) : (
                <>
                  <th className="border border-black px-1 py-1 text-right w-20">CGST</th>
                  <th className="border border-black px-1 py-1 text-right w-20">SGST</th>
                </>
              )}
              <th className="border border-black px-1 py-1 text-right w-24">Amount</th>
            </tr>
          </thead>
          <tbody>
            {gst.items.map((it, i) => (
              <tr key={i}>
                <td className="border border-black px-1 py-1 text-center">{i + 1}</td>
                <td className="border border-black px-2 py-1">{it.name || it.productName || 'Item'}</td>
                <td className="border border-black px-1 py-1 text-center">{it.hsn || '—'}</td>
                <td className="border border-black px-1 py-1 text-right">{it.qty}</td>
                <td className="border border-black px-1 py-1 text-right">{Number(it.rate).toFixed(2)}</td>
                <td className="border border-black px-1 py-1 text-right">{Number(it.taxable).toFixed(2)}</td>
                <td className="border border-black px-1 py-1 text-center">{it.taxRate}%</td>
                {gst.isInterstate ? (
                  <td className="border border-black px-1 py-1 text-right">{Number(it.igst).toFixed(2)}</td>
                ) : (
                  <>
                    <td className="border border-black px-1 py-1 text-right">{Number(it.cgst).toFixed(2)}</td>
                    <td className="border border-black px-1 py-1 text-right">{Number(it.sgst).toFixed(2)}</td>
                  </>
                )}
                <td className="border border-black px-1 py-1 text-right font-semibold">{Number(it.total).toFixed(2)}</td>
              </tr>
            ))}
            {/* Totals row */}
            <tr className="font-bold bg-zinc-50">
              <td className="border border-black px-1 py-1 text-right" colSpan={5}>TOTAL</td>
              <td className="border border-black px-1 py-1 text-right">{gst.taxable.toFixed(2)}</td>
              <td className="border border-black px-1 py-1"></td>
              {gst.isInterstate ? (
                <td className="border border-black px-1 py-1 text-right">{gst.igst.toFixed(2)}</td>
              ) : (
                <>
                  <td className="border border-black px-1 py-1 text-right">{gst.cgst.toFixed(2)}</td>
                  <td className="border border-black px-1 py-1 text-right">{gst.sgst.toFixed(2)}</td>
                </>
              )}
              <td className="border border-black px-1 py-1 text-right">{(gst.taxable + gst.totalTax).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        {/* HSN tax summary + grand totals */}
        <div className="grid grid-cols-2 gap-0 mt-0">
          <div className="border border-black border-t-0 p-0">
            <div className="text-[10px] font-bold uppercase px-2 py-1 bg-zinc-100 border-b border-black">Tax Summary (HSN-wise)</div>
            <table className="w-full text-[10px]">
              <thead>
                <tr>
                  <th className="border-b border-r border-black px-1 py-1 text-left">HSN</th>
                  <th className="border-b border-r border-black px-1 py-1 text-right">Taxable</th>
                  {gst.isInterstate ? (
                    <th className="border-b border-black px-1 py-1 text-right">IGST</th>
                  ) : (
                    <>
                      <th className="border-b border-r border-black px-1 py-1 text-right">CGST</th>
                      <th className="border-b border-black px-1 py-1 text-right">SGST</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {gst.taxSummary.map((t, i) => (
                  <tr key={i}>
                    <td className="border-r border-black px-1 py-1">{t.hsn}</td>
                    <td className="border-r border-black px-1 py-1 text-right">{t.taxable.toFixed(2)}</td>
                    {gst.isInterstate ? (
                      <td className="px-1 py-1 text-right">{t.igst.toFixed(2)}</td>
                    ) : (
                      <>
                        <td className="border-r border-black px-1 py-1 text-right">{t.cgst.toFixed(2)}</td>
                        <td className="px-1 py-1 text-right">{t.sgst.toFixed(2)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border border-black border-t-0 border-l-0 p-3">
            <Total k="Subtotal" v={formatINR(gst.subtotal)} />
            {gst.discount > 0 && <Total k="Discount" v={`- ${formatINR(gst.discount)}`} />}
            <Total k="Taxable Value" v={formatINR(gst.taxable)} />
            {gst.isInterstate ? (
              <Total k="IGST" v={formatINR(gst.igst)} />
            ) : (
              <>
                <Total k="CGST" v={formatINR(gst.cgst)} />
                <Total k="SGST" v={formatINR(gst.sgst)} />
              </>
            )}
            {gst.roundOff !== 0 && <Total k="Round Off" v={formatINR(gst.roundOff)} />}
            <div className="flex justify-between items-center mt-2 pt-2 border-t-2 border-black">
              <span className="font-bold">GRAND TOTAL</span>
              <span className="text-lg font-black">{formatINR(gst.grandTotal)}</span>
            </div>
            {paid > 0 && (
              <>
                <Total k="Paid" v={formatINR(paid)} />
                <Total k="Balance Due" v={formatINR(due)} bold />
              </>
            )}
          </div>
        </div>

        {/* Words + declaration + bank + signature */}
        <div className="border border-black border-t-0 p-3 text-[11px]">
          <div><span className="font-bold">Amount in Words: </span>{amountToWords(gst.grandTotal)}</div>
        </div>

        <div className="grid grid-cols-2 border border-black border-t-0">
          <div className="p-3 border-r border-black text-[10px] leading-snug">
            <div className="font-bold uppercase mb-1">Bank / UPI</div>
            {business.bank_name && <div>Bank: {business.bank_name}</div>}
            {business.account_no && <div>A/C: {business.account_no}</div>}
            {business.ifsc_code && <div>IFSC: {business.ifsc_code}</div>}
            {business.upi_id && <div>UPI: {business.upi_id}</div>}

            <div className="font-bold uppercase mt-3 mb-1">Terms</div>
            <div className="opacity-80">
              {business.invoice_terms || 'Goods once sold will not be taken back. Subject to local jurisdiction. E. & O.E.'}
            </div>
          </div>
          <div className="p-3 flex flex-col justify-between">
            <div className="text-[10px] leading-snug">
              <div className="font-bold uppercase mb-1">Declaration</div>
              <div className="opacity-80">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
            </div>
            <div className="text-right mt-8">
              <div className="border-t border-black pt-1 inline-block min-w-[60mm] text-center text-[11px]">
                <div className="font-bold">For {business.name || 'Business'}</div>
                <div className="opacity-70 text-[10px] mt-0.5">Authorised Signatory</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 12mm 10mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          #sale-print-portal table { page-break-inside: auto; }
          #sale-print-portal tr { page-break-inside: avoid; page-break-after: auto; }
          #sale-print-portal thead { display: table-header-group; }
          body > *:not(#sale-print-portal) { display: none !important; }
          #sale-print-portal { position: static !important; inset: auto !important; padding: 0 !important; margin: 0 !important; background: #fff !important; backdrop-filter: none !important; display: block !important; overflow: visible !important; }
          #sale-print-portal .print-chrome { display: none !important; }
          #sale-print-portal, #sale-print-portal > * {
            display: block !important;
            flex: initial !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }
          #sale-print-portal .print-sheet { margin: 0 !important; box-shadow: none !important; width: 100% !important; min-height: 0 !important; height: auto !important; padding: 0 !important; }
        }
      `}} />
    </div>,
    document.body
  );
};

const Row = ({ k, v }) => (
  <div className="flex justify-between py-0.5">
    <span className="opacity-60">{k}</span>
    <span className="font-semibold">{v}</span>
  </div>
);

const Total = ({ k, v, bold }) => (
  <div className={`flex justify-between py-0.5 ${bold ? 'font-bold' : ''}`}>
    <span className="opacity-70">{k}</span>
    <span className="tabular-nums">{v}</span>
  </div>
);

export default GSTInvoicePrint;
