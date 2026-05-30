/**
 * ⚠️ STRICT VISUAL LOCK: PREMIUM GST INVOICE v2.0
 * -----------------------------------------------
 * This component replicates the exact professional GST layout.
 * Optimized for A4 precision and high-fidelity business branding.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer, Share2, ZoomIn, ZoomOut, Maximize2, X,
  Phone, Globe, Mail, MapPin, Landmark, QrCode
} from 'lucide-react';
import { formatINR, amountToWords } from '../../lib/gstEngine';
import { formatDate } from '../../lib/utils';
import { QRCodeSVG } from 'qrcode.react';

const Totals = ({ k, v, bold }) => (
  <div className={`flex justify-between items-center py-0.5 ${bold ? 'font-bold' : ''}`}>
    <span className="text-slate-500">{k}</span>
    <span className="font-semibold tabular-nums">{v}</span>
  </div>
);

const InvoiceTemplate = ({ invoice, businessProfile, client, onPrint, onShare, onClose, onToggleMode }) => {
  const [zoom, setZoom] = useState(100);

  // Inject print isolation CSS into <head> so it's guaranteed to apply
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'gst-invoice-print-css';
    style.textContent = `
      @media print {
        @page { size: A4; margin: 12mm 10mm; }
        html, body { background: white !important; margin: 0 !important; padding: 0 !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body > *:not(#invoice-template-portal) { display: none !important; }
        #invoice-template-portal { position: static !important; inset: auto !important;
          background: #fff !important; backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important; overflow: visible !important;
          padding: 0 !important; margin: 0 !important; display: block !important; height: auto !important; }
        #invoice-template-portal .print-hidden,
        #invoice-template-portal [class*="print:hidden"] { display: none !important; }
        #invoice-template-portal, #invoice-template-portal > div, #invoice-template-portal > div > div {
          flex: initial !important; display: block !important; overflow: visible !important;
          padding: 0 !important; margin: 0 !important; width: 100% !important;
          height: auto !important; max-height: none !important; }
        #invoice-print-area { transform: none !important; box-shadow: none !important;
          margin: 0 !important; width: 100% !important; min-height: 0 !important;
          height: auto !important; padding: 0 !important; }
        #invoice-template-portal .print-empty-row { display: none !important; }
        #invoice-print-area table { page-break-inside: auto; }
        #invoice-print-area tr { page-break-inside: avoid; page-break-after: auto; }
        #invoice-print-area thead { display: table-header-group; }
      }
    `;
    document.head.appendChild(style);
    return () => { const el = document.getElementById('gst-invoice-print-css'); if (el) el.remove(); };
  }, []);

  // Relaxed validation: Handle cases where businessProfile or client might be missing (e.g. Walk-in)
  if (!invoice) return null;
  
  const safeBusiness = businessProfile || {};
  const safeClient = client || { 
    name: invoice.client_name || 'Walk-in Customer', 
    address: '---', 
    contact: '---', 
    state: '' 
  };

  const handleZoom = (type) => {
    if (type === 'in' && zoom < 150) setZoom(zoom + 25);
    if (type === 'out' && zoom > 50) setZoom(zoom - 25);
    if (type === 'reset') setZoom(100);
  };

  // Purple Brand Color (Vibrant Purple from sample)
  const BRAND_COLOR = '#7c3aed';

  // Calculate row counts for filling up to 8 rows
  const minRows = 10;
  
  // Tax mode from business profile. INCLUSIVE = rate already includes GST.
  // EXCLUSIVE = GST added on top of rate. Default EXCLUSIVE for legacy.
  const taxMode = String(safeBusiness.tax_mode || invoice.tax_mode || 'EXCLUSIVE').toUpperCase();
  const isInclusive = taxMode === 'INCLUSIVE';

  // Map items to a consistent structure first (needed for fallback tax calc).
  // For INCLUSIVE mode the rate already contains tax; back it out.
  const items = (invoice.items || []).map(item => {
    const qty  = parseFloat(item.qty || item.quantity || 0);
    const rate = parseFloat(item.rate || item.price || item.sellingPrice || 0);
    const taxRate = parseFloat(item.taxRate ?? 0);
    const lineTotal = qty * rate;
    const taxAmount = isInclusive
      ? lineTotal - (lineTotal / (1 + taxRate / 100))
      : lineTotal * taxRate / 100;
    const taxable   = isInclusive
      ? lineTotal - taxAmount
      : lineTotal;
    return {
      name: item.name || 'Unnamed Product',
      sku: item.sku || item.hsn || '',
      hsn_code: item.hsn_code || item.hsn || '---',
      qty, unit: item.unit || 'PCS', rate, taxRate,
      taxAmount, taxable,
      total: isInclusive ? lineTotal : lineTotal + taxAmount,
    };
  });

  // Robust data mapping — fall back to recalculating from items when
  // stored tax fields are 0 (e.g. auto-created invoices from POS credit sales)
  const grandTotal    = parseFloat(invoice.grand_total ?? invoice.grandTotal ?? 0);
  const roundOff      = parseFloat(invoice.round_off ?? invoice.roundOff ?? 0);
  const paidAmount    = parseFloat(invoice.paid_amount ?? 0);
  const outstandingBalance = parseFloat(safeClient.outstanding_balance ?? safeClient.outstanding ?? 0);

  const derivedTaxable = items.reduce((s, i) => s + i.taxable,   0);
  const derivedTax     = items.reduce((s, i) => s + i.taxAmount, 0);
  const isInterstate   = invoice.is_interstate || invoice.isInterstate || false;

  const storedTaxable  = parseFloat(invoice.taxable_amount ?? invoice.taxable ?? 0);
  const storedTax      = parseFloat(invoice.tax_total ?? invoice.totalTax ?? 0);
  const storedCgst     = parseFloat(invoice.cgst_amount ?? invoice.cgst ?? 0);
  const storedSgst     = parseFloat(invoice.sgst_amount ?? invoice.sgst ?? 0);
  const storedIgst     = parseFloat(invoice.igst_amount ?? invoice.igst ?? 0);

  // Use stored values when non-zero; else derive from items
  const taxableAmount  = storedTaxable > 0 ? storedTaxable : derivedTaxable;
  const totalTax       = storedTax     > 0 ? storedTax     : derivedTax;
  const cgstAmount     = storedCgst    > 0 ? storedCgst    : (isInterstate ? 0 : derivedTax / 2);
  const sgstAmount     = storedSgst    > 0 ? storedSgst    : (isInterstate ? 0 : derivedTax / 2);
  const igstAmount     = storedIgst    > 0 ? storedIgst    : (isInterstate ? derivedTax : 0);

  const emptyRowsNeeded = Math.max(0, minRows - items.length);

  return createPortal(
    <div id="invoice-template-portal" className="fixed inset-0 z-[60] flex flex-col items-center bg-slate-900/90 backdrop-blur-2xl overflow-hidden animate-fade-in print:bg-white print:p-0">
      
      {/* Action Bar - Hidden in Print */}
      <div className="print-hidden w-full h-16 flex items-center justify-between px-6 bg-white/5 border-b border-white/10 print:hidden">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95"
          >
            <X size={20} />
          </button>
          <div className="flex flex-col">
            <h2 className="text-white font-bold text-sm tracking-tight uppercase">
              Draft Preview.
            </h2>
            <p className="text-white/40 text-[9px] uppercase tracking-widest font-black">
              GST Compliant Node v2.0
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/5 rounded-full p-1 border border-white/10 mr-4">
            <button onClick={() => handleZoom('out')} className="p-1.5 text-white/60 hover:text-white transition-colors"><ZoomOut size={16} /></button>
            <span className="text-white/80 text-[10px] font-black px-2 w-10 text-center">{zoom}%</span>
            <button onClick={() => handleZoom('in')} className="p-1.5 text-white/60 hover:text-white transition-colors"><ZoomIn size={16} /></button>
            <button onClick={() => handleZoom('reset')} className="p-1.5 text-white/60 hover:text-white border-l border-white/10 ml-1"><Maximize2 size={14} /></button>
          </div>

          {onToggleMode && (
            <button
              onClick={onToggleMode}
              className="flex items-center gap-2 px-6 py-2.5 bg-white/10 text-white border border-white/20 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-white/20 active:scale-95 transition-all"
            >
              POS Receipt
            </button>
          )}

          <button
            onClick={onPrint}
            className="flex items-center gap-2 px-6 py-2.5 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
          >
            <Printer size={16} /> PRINT INVOICE
          </button>

          <button 
            onClick={() => onShare('whatsapp')}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#25D366] text-white rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
          >
            <Share2 size={16} /> SHARE WHATSAPP
          </button>
        </div>
      </div>

      {/* Invoice Container */}
      <div className="flex-1 w-full overflow-y-auto p-12 flex justify-center print:p-0 print:overflow-visible no-scrollbar">
        <div 
          id="invoice-print-area"
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          className="w-[210mm] min-h-[297mm] bg-white shadow-2xl p-[12mm] flex flex-col text-slate-900 transition-all duration-300 print:shadow-none print:transform-none print:p-[10mm] print:w-full print:min-h-0"
        >
          
          {/* Standardized compact GST invoice */}
          <div className="border-2 border-slate-900">
            {/* Title */}
            <div className="text-center py-2 border-b-2 border-slate-900">
              <div className="text-[13px] font-bold tracking-[0.3em] uppercase">Tax Invoice</div>
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">Original for Recipient</div>
            </div>

            {/* Business + Invoice meta */}
            <div className="grid grid-cols-[1.6fr_1fr] border-b border-slate-900">
              <div className="p-3 border-r border-slate-900">
                <div className="flex items-start gap-3">
                  {safeBusiness.logo_url ? (
                    <img src={safeBusiness.logo_url} alt="" className="h-10 object-contain" />
                  ) : null}
                  <div className="flex-1">
                    <div className="text-[15px] font-bold uppercase leading-tight">{safeBusiness.name || 'Business Name'}</div>
                    {safeBusiness.address && <div className="text-[10px] text-slate-700 leading-snug mt-0.5">{safeBusiness.address}</div>}
                    <div className="text-[10px] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {safeBusiness.phone && <span><span className="text-slate-500">Ph:</span> {safeBusiness.phone}</span>}
                      {safeBusiness.email && <span><span className="text-slate-500">Email:</span> {safeBusiness.email}</span>}
                    </div>
                    <div className="text-[10px] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span><span className="text-slate-500">GSTIN:</span> <b>{safeBusiness.gst_no || 'URD'}</b></span>
                      {safeBusiness.state && <span><span className="text-slate-500">State:</span> <b>{safeBusiness.state}{safeBusiness.state_code ? ` (${safeBusiness.state_code})` : ''}</b></span>}
                      {safeBusiness.pan_no && <span><span className="text-slate-500">PAN:</span> <b>{safeBusiness.pan_no}</b></span>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-3 text-[10px] grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 self-center">
                <span className="text-slate-500">Invoice No</span><span className="font-bold text-right">#{invoice.invoice_number}</span>
                <span className="text-slate-500">Invoice Date</span><span className="font-bold text-right">{formatDate(invoice.invoice_date)}</span>
                <span className="text-slate-500">Due Date</span><span className="font-bold text-right">{formatDate(invoice.due_date || invoice.invoice_date)}</span>
                <span className="text-slate-500">Supply Type</span><span className="font-bold text-right">{(invoice.is_interstate || invoice.isInterstate) ? 'Inter-State' : 'Intra-State'}</span>
                {safeClient.state && <><span className="text-slate-500">Place of Supply</span><span className="font-bold text-right">{safeClient.state}</span></>}
              </div>
            </div>

            {/* Bill To + Ship To */}
            <div className="grid grid-cols-2 border-b border-slate-900">
              <div className="p-3 border-r border-slate-900">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">Bill To</div>
                <div className="text-[11px] font-bold">{safeClient.name}</div>
                {safeClient.address && <div className="text-[10px] text-slate-700 leading-snug mt-0.5">{safeClient.address}</div>}
                <div className="text-[10px] mt-1 space-y-0.5">
                  {(safeClient.contact || safeClient.phone) && <div><span className="text-slate-500">Ph:</span> {safeClient.contact || safeClient.phone}</div>}
                  {safeClient.state && <div><span className="text-slate-500">State:</span> <b>{safeClient.state}</b></div>}
                  <div><span className="text-slate-500">GSTIN:</span> <b>{safeClient.gst_no || safeClient.gstin || 'URD'}</b></div>
                </div>
              </div>
              <div className="p-3">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">Ship To</div>
                <div className="text-[11px] font-bold">{safeClient.name}</div>
                {safeClient.address && <div className="text-[10px] text-slate-700 leading-snug mt-0.5">{safeClient.address}</div>}
                {safeClient.state && <div className="text-[10px] mt-1"><span className="text-slate-500">State:</span> <b>{safeClient.state}</b></div>}
              </div>
            </div>

            {/* Line items */}
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-900">
                  <th className="py-1.5 px-1 border-r border-slate-900 text-center w-8">#</th>
                  <th className="py-1.5 px-2 border-r border-slate-900 text-left">Description</th>
                  <th className="py-1.5 px-1 border-r border-slate-900 text-center w-16">HSN/SAC</th>
                  <th className="py-1.5 px-1 border-r border-slate-900 text-right w-12">Qty</th>
                  <th className="py-1.5 px-1 border-r border-slate-900 text-right w-20">Rate</th>
                  <th className="py-1.5 px-1 border-r border-slate-900 text-right w-20">Taxable</th>
                  <th className="py-1.5 px-1 border-r border-slate-900 text-center w-10">GST%</th>
                  {(invoice.is_interstate || invoice.isInterstate) ? (
                    <th className="py-1.5 px-1 border-r border-slate-900 text-right w-20">IGST</th>
                  ) : (
                    <>
                      <th className="py-1.5 px-1 border-r border-slate-900 text-right w-20">CGST</th>
                      <th className="py-1.5 px-1 border-r border-slate-900 text-right w-20">SGST</th>
                    </>
                  )}
                  <th className="py-1.5 px-1 text-right w-24">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const qty = parseFloat(item.qty || 0);
                  const rate = parseFloat(item.rate || 0);
                  const taxable = parseFloat(item.taxable ?? qty * rate);
                  const totalTaxItem = parseFloat(item.taxAmount || 0);
                  const cgstI = (invoice.is_interstate || invoice.isInterstate) ? 0 : totalTaxItem / 2;
                  const sgstI = cgstI;
                  const igstI = (invoice.is_interstate || invoice.isInterstate) ? totalTaxItem : 0;
                  return (
                    <tr key={idx} className="border-b border-slate-200">
                      <td className="py-1 px-1 border-r border-slate-200 text-center">{idx + 1}</td>
                      <td className="py-1 px-2 border-r border-slate-200">
                        <div className="font-semibold">{item.name}</div>
                        {item.sku && <div className="text-[9px] text-slate-500">SKU: {item.sku}</div>}
                      </td>
                      <td className="py-1 px-1 border-r border-slate-200 text-center">{item.hsn_code || '—'}</td>
                      <td className="py-1 px-1 border-r border-slate-200 text-right">{qty}<span className="text-slate-400 text-[9px] ml-0.5">{item.unit?.toUpperCase() || 'PCS'}</span></td>
                      <td className="py-1 px-1 border-r border-slate-200 text-right">{rate.toFixed(2)}</td>
                      <td className="py-1 px-1 border-r border-slate-200 text-right">{taxable.toFixed(2)}</td>
                      <td className="py-1 px-1 border-r border-slate-200 text-center">{item.taxRate}%</td>
                      {(invoice.is_interstate || invoice.isInterstate) ? (
                        <td className="py-1 px-1 border-r border-slate-200 text-right">{igstI.toFixed(2)}</td>
                      ) : (
                        <>
                          <td className="py-1 px-1 border-r border-slate-200 text-right">{cgstI.toFixed(2)}</td>
                          <td className="py-1 px-1 border-r border-slate-200 text-right">{sgstI.toFixed(2)}</td>
                        </>
                      )}
                      <td className="py-1 px-1 text-right font-semibold">{parseFloat(item.total || 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
                {/* Empty spacers — screen only */}
                {Array.from({ length: emptyRowsNeeded }).map((_, i) => (
                  <tr key={`empty-${i}`} className="print-empty-row border-b border-slate-100">
                    <td className="py-3 px-1 border-r border-slate-100">&nbsp;</td>
                    <td colSpan={(invoice.is_interstate || invoice.isInterstate) ? 8 : 9}>&nbsp;</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-slate-50 border-t-2 border-slate-900 font-bold">
                  <td className="py-1.5 px-1 border-r border-slate-900 text-right" colSpan={5}>TOTAL</td>
                  <td className="py-1.5 px-1 border-r border-slate-900 text-right">{parseFloat(taxableAmount).toFixed(2)}</td>
                  <td className="py-1.5 px-1 border-r border-slate-900"></td>
                  {(invoice.is_interstate || invoice.isInterstate) ? (
                    <td className="py-1.5 px-1 border-r border-slate-900 text-right">{parseFloat(igstAmount).toFixed(2)}</td>
                  ) : (
                    <>
                      <td className="py-1.5 px-1 border-r border-slate-900 text-right">{parseFloat(cgstAmount).toFixed(2)}</td>
                      <td className="py-1.5 px-1 border-r border-slate-900 text-right">{parseFloat(sgstAmount).toFixed(2)}</td>
                    </>
                  )}
                  <td className="py-1.5 px-1 text-right">{parseFloat(grandTotal).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            {/* Amount in words + totals block */}
            <div className="grid grid-cols-[1.3fr_1fr] border-t border-slate-900">
              <div className="p-3 border-r border-slate-900 text-[10px]">
                <div className="mb-2">
                  <span className="text-slate-500 font-bold uppercase">Amount in Words: </span>
                  <span className="font-bold">{amountToWords(grandTotal)}</span>
                </div>
                {/* HSN tax summary */}
                {items.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">HSN / Tax Summary</div>
                    <table className="w-full text-[9px] border border-slate-400">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-1 py-0.5 border-r border-slate-400 text-left">HSN</th>
                          <th className="px-1 py-0.5 border-r border-slate-400 text-right">Taxable</th>
                          <th className="px-1 py-0.5 border-r border-slate-400 text-right">Rate</th>
                          {(invoice.is_interstate || invoice.isInterstate) ? (
                            <th className="px-1 py-0.5 text-right">IGST</th>
                          ) : (
                            <>
                              <th className="px-1 py-0.5 border-r border-slate-400 text-right">CGST</th>
                              <th className="px-1 py-0.5 text-right">SGST</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const groups = {};
                          items.forEach(it => {
                            const k = it.hsn_code || '—';
                            // HSN summary respects tax_mode — use the
                            // already-derived taxable (inclusive: backed
                            // out of rate; exclusive: qty*rate).
                            const tx = parseFloat(it.taxable || 0);
                            const tr = parseFloat(it.taxRate || 18);
                            if (!groups[k]) groups[k] = { hsn: k, taxable: 0, rate: tr, cgst: 0, sgst: 0, igst: 0 };
                            groups[k].taxable += tx;
                            if (invoice.is_interstate || invoice.isInterstate) {
                              groups[k].igst += tx * tr / 100;
                            } else {
                              groups[k].cgst += tx * tr / 200;
                              groups[k].sgst += tx * tr / 200;
                            }
                          });
                          return Object.values(groups).map((g, i) => (
                            <tr key={i} className="border-t border-slate-300">
                              <td className="px-1 py-0.5 border-r border-slate-400">{g.hsn}</td>
                              <td className="px-1 py-0.5 border-r border-slate-400 text-right">{g.taxable.toFixed(2)}</td>
                              <td className="px-1 py-0.5 border-r border-slate-400 text-right">{g.rate}%</td>
                              {(invoice.is_interstate || invoice.isInterstate) ? (
                                <td className="px-1 py-0.5 text-right">{g.igst.toFixed(2)}</td>
                              ) : (
                                <>
                                  <td className="px-1 py-0.5 border-r border-slate-400 text-right">{g.cgst.toFixed(2)}</td>
                                  <td className="px-1 py-0.5 text-right">{g.sgst.toFixed(2)}</td>
                                </>
                              )}
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="p-3 text-[11px]">
                <Totals k="Subtotal" v={`₹${parseFloat(taxableAmount).toFixed(2)}`} />
                {totalTax > 0 && (
                  (invoice.is_interstate || invoice.isInterstate) ? (
                    <Totals k={`IGST @${items[0]?.taxRate ?? 0}%`} v={`₹${parseFloat(igstAmount).toFixed(2)}`} />
                  ) : (
                    <>
                      <Totals k={`CGST @${(items[0]?.taxRate ?? 0) / 2}%`} v={`₹${parseFloat(cgstAmount).toFixed(2)}`} />
                      <Totals k={`SGST @${(items[0]?.taxRate ?? 0) / 2}%`} v={`₹${parseFloat(sgstAmount).toFixed(2)}`} />
                    </>
                  )
                )}
                {roundOff !== 0 && <Totals k="Round Off" v={`₹${parseFloat(roundOff).toFixed(2)}`} />}
                <div className="flex justify-between items-center mt-1 pt-1 border-t-2 border-slate-900">
                  <span className="text-[12px] font-bold uppercase">Grand Total</span>
                  <span className="text-[14px] font-black">₹{parseFloat(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {paidAmount > 0 && (
                  <>
                    <Totals k="Received" v={`₹${parseFloat(paidAmount).toFixed(2)}`} />
                    <Totals k="Balance Due" v={`₹${(parseFloat(grandTotal) - parseFloat(paidAmount)).toFixed(2)}`} bold />
                  </>
                )}
              </div>
            </div>

            {/* Bank / UPI + Terms + Signature */}
            <div className="grid grid-cols-[1.3fr_1fr] border-t border-slate-900">
              <div className="p-3 border-r border-slate-900 text-[10px]">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">Bank / UPI</div>
                    <div className="space-y-0.5">
                      {safeBusiness.bank_name && <div><span className="text-slate-500">Bank:</span> <b>{safeBusiness.bank_name}</b></div>}
                      {safeBusiness.account_no && <div><span className="text-slate-500">A/C:</span> <b>{safeBusiness.account_no}</b></div>}
                      {safeBusiness.ifsc_code && <div><span className="text-slate-500">IFSC:</span> <b className="uppercase">{safeBusiness.ifsc_code}</b></div>}
                      {safeBusiness.upi_id && <div><span className="text-slate-500">UPI:</span> <b>{safeBusiness.upi_id}</b></div>}
                    </div>
                  </div>
                  {safeBusiness.upi_id && (
                    <div className="shrink-0">
                      <QRCodeSVG
                        value={`upi://pay?pa=${safeBusiness.upi_id}&pn=${encodeURIComponent(safeBusiness.name || '')}&am=${grandTotal}&cu=INR&tn=Invoice ${encodeURIComponent(invoice.invoice_number)}`}
                        size={70}
                        level="M"
                        includeMargin={false}
                      />
                      <div className="text-[8px] text-center text-slate-500 mt-0.5">Scan to pay</div>
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">Terms & Conditions</div>
                  <ol className="list-decimal pl-4 space-y-0.5 text-[10px] text-slate-700">
                    {safeBusiness.invoice_terms ? (
                      safeBusiness.invoice_terms.split('\n').filter(t => t.trim()).slice(0, 4).map((term, i) => (
                        <li key={i}>{term}</li>
                      ))
                    ) : (
                      <>
                        <li>Goods once sold will not be taken back.</li>
                        <li>All disputes subject to {safeBusiness.state || 'local'} jurisdiction.</li>
                        <li>E. & O.E.</li>
                      </>
                    )}
                  </ol>
                </div>
              </div>
              <div className="p-3 flex flex-col justify-between text-[10px]">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">Declaration</div>
                  <div className="text-slate-700 leading-snug">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
                </div>
                <div className="text-right mt-8">
                  <div className="font-bold">For {safeBusiness.name || 'Business'}</div>
                  <div className="h-12" />
                  <div className="border-t border-slate-900 pt-1 inline-block min-w-[55mm] text-center">
                    <span className="text-[10px] font-bold">Authorised Signatory</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm 10mm; }
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Empty filler rows are screen-only; dynamic page at print */
          #invoice-template-portal .print-empty-row { display: none !important; }
          /* Keep logical blocks from splitting across pages */
          #invoice-print-area table { page-break-inside: auto; }
          #invoice-print-area tr { page-break-inside: avoid; page-break-after: auto; }
          #invoice-print-area thead { display: table-header-group; }
          #invoice-print-area tfoot { display: table-footer-group; }
          /* Kill app root + every other body child — only this portal prints */
          body > *:not(#invoice-template-portal) { display: none !important; }
          #invoice-template-portal {
            position: static !important;
            inset: auto !important;
            background: #fff !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            height: auto !important;
          }
          #invoice-template-portal .print\\:hidden,
          #invoice-template-portal .print-hidden {
            display: none !important;
          }
          /* Flatten flex shell so the sheet renders in normal flow */
          #invoice-template-portal,
          #invoice-template-portal > div,
          #invoice-template-portal > div > div {
            flex: initial !important;
            display: block !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
          }
          #invoice-print-area {
            transform: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
            padding: 0 !important;
          }
          div[style*="background: #7c3aed"],
          div[style*="background: rgb(124, 58, 237)"] {
             background-color: #7c3aed !important;
             color-adjust: exact;
          }
        }
        
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Hide scrollbars for the invoice viewer */
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>,
    document.body
  );
};

export default InvoiceTemplate;
