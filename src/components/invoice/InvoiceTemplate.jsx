/**
 * ⚠️ STRICT VISUAL LOCK: PREMIUM GST INVOICE v2.0
 * -----------------------------------------------
 * This component replicates the exact professional GST layout.
 * Optimized for A4 precision and high-fidelity business branding.
 */

import React, { useState } from 'react';
import { 
  Printer, Share2, ZoomIn, ZoomOut, Maximize2, X,
  Phone, Globe, Mail, MapPin, Landmark, QrCode
} from 'lucide-react';
import { formatINR, amountToWords } from '../../lib/gstEngine';
import { QRCodeSVG } from 'qrcode.react';

const InvoiceTemplate = ({ invoice, businessProfile, client, onPrint, onShare, onClose }) => {
  const [zoom, setZoom] = useState(100);

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
  
  // Robust data mapping to handle both Database (snake_case) and UI (camelCase)
  const grandTotal = invoice.grand_total ?? invoice.grandTotal ?? 0;
  const totalTax = invoice.tax_total ?? invoice.totalTax ?? 0;
  const taxableAmount = invoice.taxable_amount ?? invoice.taxable ?? 0;
  const cgstAmount = invoice.cgst_amount ?? invoice.cgst ?? 0;
  const sgstAmount = invoice.sgst_amount ?? invoice.sgst ?? 0;
  const igstAmount = invoice.igst_amount ?? invoice.igst ?? 0;
  const roundOff = invoice.round_off ?? invoice.roundOff ?? 0;
  const paidAmount = invoice.paid_amount ?? 0;
  const outstandingBalance = safeClient.outstanding_balance ?? safeClient.outstanding ?? 0;

  // Map items to a consistent structure
  const items = (invoice.items || []).map(item => ({
    name: item.name || 'Unnamed Product',
    sku: item.sku || item.hsn || '',
    hsn_code: item.hsn_code || item.hsn || '---',
    qty: item.qty || item.quantity || 0,
    unit: item.unit || 'PCS',
    rate: item.rate || item.price || item.sellingPrice || 0,
    taxRate: item.taxRate || 18,
    taxAmount: item.totalTax || item.tax_amount || ((item.qty * item.rate * (item.taxRate || 18)) / 100),
    total: item.total || item.total_amount || ((item.qty * item.rate) * (1 + (item.taxRate || 18)/100))
  }));

  const emptyRowsNeeded = Math.max(0, minRows - items.length);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center bg-slate-900/90 backdrop-blur-2xl overflow-hidden animate-fade-in print:bg-white print:p-0">
      
      {/* Action Bar - Hidden in Print */}
      <div className="w-full h-16 flex items-center justify-between px-6 bg-white/5 border-b border-white/10 print:hidden">
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
          
          {/* SECTION 1: TOP BAR */}
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-black uppercase tracking-widest" style={{ fontVariant: 'small-caps' }}>Tax Invoice</span>
              <div className="px-3 py-1 border border-slate-300 rounded text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                Original for Recipient
              </div>
            </div>
            <div className="text-[10px] font-bold text-slate-900 italic text-right max-w-[300px]">
              {safeBusiness.tagline || 'One place for any electronic item purchase'}
            </div>
          </div>
          <div className="h-[1px] w-full mb-6" style={{ background: BRAND_COLOR }}></div>

          {/* SECTION 2: BUSINESS HEADER */}
          <div className="grid grid-cols-[1fr_3fr_1fr] gap-6 mb-4">
            <div className="flex items-start">
              {safeBusiness.logo_url ? (
                <img src={safeBusiness.logo_url} alt="Logo" className="max-h-[60px] object-contain" />
              ) : (
                <div className="w-16 h-16 bg-slate-100 flex items-center justify-center rounded border border-slate-200 text-slate-400 font-black text-xl">
                  {safeBusiness.name?.charAt(0) || 'L'}
                </div>
              )}
            </div>
            <div className="text-center flex flex-col items-center">
              <h1 className="text-[28px] font-black leading-none mb-2" style={{ color: BRAND_COLOR }}>
                {safeBusiness.name || 'Ramesh Electronics'}
              </h1>
              <p className="text-[11px] font-medium text-slate-600 max-w-[500px]">
                {safeBusiness.address || 'Gopal Nagar, 743262, West Bengal, India'}
              </p>
              <div className="flex gap-4 mt-2 text-[11px] font-black text-slate-500 uppercase tracking-tight">
                <span>Mobile : <span className="text-slate-900">{safeBusiness.phone || '9999999999'}</span></span>
                <span>GSTIN : <span className="text-slate-900">{safeBusiness.gst_no || 'URD'}</span></span>
                <span>PAN Number : <span className="text-slate-900">{safeBusiness.pan_no || 'NOT PROVIDED'}</span></span>
              </div>
              <p className="text-[11px] font-black text-slate-500 mt-1 uppercase tracking-tighter">
                Email : <span className="text-slate-900 lowercase font-bold">{safeBusiness.email || 'info@ledgr.erp'}</span>
              </p>
            </div>
            <div></div>
          </div>
          <div className="h-[2px] w-full mb-6" style={{ background: BRAND_COLOR }}></div>

          {/* SECTION 3: INVOICE META BAR */}
          <div className="bg-[#F5F5F5] rounded-lg px-5 py-4 flex justify-between items-center mb-6">
            <div className="text-[12px] flex gap-2">
              <span className="font-black text-slate-500 uppercase">Invoice No.:</span>
              <span className="font-black text-slate-900 italic">#{invoice.invoice_number}</span>
            </div>
            <div className="text-[12px] flex gap-2">
              <span className="font-black text-slate-500 uppercase">Invoice Date:</span>
              <span className="font-black text-slate-900 italic">
                {new Date(invoice.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
            <div className="text-[12px] flex gap-2">
              <span className="font-black text-slate-500 uppercase">Due Date:</span>
              <span className="font-black text-slate-900 italic">
                {new Date(invoice.due_date || invoice.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* SECTION 4: BILL TO / SHIP TO */}
          <div className="grid grid-cols-2 gap-12 mb-8 px-2">
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">Bill To</h4>
              <div className="text-slate-900">
                <h3 className="text-[14px] font-black uppercase mb-1">{safeClient.name}</h3>
                <p className="text-[11px] font-medium text-slate-600 leading-relaxed mb-1">
                  {safeClient.address}
                </p>
                <div className="text-[11px] font-black space-y-0.5">
                  <p>Mobile: <span className="font-bold">{safeClient.contact || safeClient.phone}</span></p>
                  <p>State: <span className="font-bold">{safeClient.state}</span></p>
                  {safeClient.gst_no && <p>GSTIN: <span className="font-bold text-slate-900">{safeClient.gst_no}</span></p>}
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">Ship To</h4>
              <div className="text-slate-900 opacity-90">
                <h3 className="text-[14px] font-black uppercase mb-1">{safeClient.name}</h3>
                <p className="text-[11px] font-medium text-slate-600 leading-relaxed mb-1">
                  {safeClient.address}
                </p>
                <div className="text-[11px] font-black space-y-0.5">
                  <p>Mobile: <span className="font-bold">{safeClient.contact || safeClient.phone}</span></p>
                  <p>State: <span className="font-bold">{safeClient.state}</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 5: LINE ITEMS TABLE */}
          <div className="flex-1 flex flex-col mb-8">
            <table className="w-full text-left border-collapse border-b border-slate-200">
              <thead>
                <tr className="bg-[#F5F5F5] uppercase border-y border-slate-200">
                  <th className="py-2.5 px-4 text-[10px] font-black text-slate-600 tracking-widest w-[40%]">Items</th>
                  <th className="py-2.5 px-2 text-[10px] font-black text-slate-600 tracking-widest text-center w-[15%]">HSN</th>
                  <th className="py-2.5 px-2 text-[10px] font-black text-slate-600 tracking-widest text-center w-[10%]">Qty.</th>
                  <th className="py-2.5 px-2 text-[10px] font-black text-slate-600 tracking-widest text-right w-[12%]">Rate</th>
                  <th className="py-2.5 px-2 text-[10px] font-black text-slate-600 tracking-widest text-right w-[12%]">Tax</th>
                  <th className="py-2.5 px-4 text-[10px] font-black text-slate-600 tracking-widest text-right w-[11%]">Amount</th>
                </tr>
              </thead>
              <tbody className="text-[11px]">
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-50 last:border-b-2 last:border-slate-300">
                    <td className="py-3 px-4 flex flex-col text-left">
                      <span className="font-black text-slate-900 uppercase">{item.name}</span>
                      {item.sku && <span className="text-[10px] font-medium text-slate-400 mt-0.5 uppercase tracking-tighter">{item.sku}</span>}
                    </td>
                    <td className="py-3 px-2 text-center font-black text-slate-600">{item.hsn_code || '---'}</td>
                    <td className="py-3 px-2 text-center font-black text-slate-900">{item.qty} {item.unit?.toUpperCase() || 'PCS'}</td>
                    <td className="py-3 px-2 text-right font-bold text-slate-600">{parseFloat(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-3 px-2 text-right flex flex-col items-end">
                      <span className="font-black text-slate-900">{parseFloat(item.taxAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span className="text-[9px] font-black text-slate-400 italic">({item.taxRate}%)</span>
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-900">{parseFloat(item.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}</td>
                  </tr>
                ))}
                
                {/* Empty Rows Spacers */}
                {Array.from({ length: emptyRowsNeeded }).map((_, i) => (
                  <tr key={`empty-${i}`} className="border-b border-slate-50 opacity-10">
                    <td className="py-5 px-4">&nbsp;</td>
                    <td className="py-5 px-2">&nbsp;</td>
                    <td className="py-5 px-2">&nbsp;</td>
                    <td className="py-5 px-2">&nbsp;</td>
                    <td className="py-5 px-2">&nbsp;</td>
                    <td className="py-5 px-4">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* SECTION 6: SUBTOTAL ROW */}
            <div className="bg-[#F5F5F5] border-b-2 border-slate-300 py-3 px-4 flex items-center mb-8">
              <div className="w-[40%] text-[11px] font-black uppercase text-slate-900 tracking-widest italic">Subtotal</div>
              <div className="w-[15%] text-center text-[11px] font-black text-slate-900"></div>
              <div className="w-[10%] text-center text-[11px] font-black text-slate-900">{items.length} Items</div>
              <div className="w-[12%]"></div>
              <div className="w-[12%] text-right text-[11px] font-black text-slate-900">₹{parseFloat(totalTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              <div className="w-[11%] text-right text-[12px] font-black text-slate-900">₹{parseFloat(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 0 })}</div>
            </div>

            {/* SECTION 7: BOTTOM SECTION */}
            <div className="grid grid-cols-[1.5fr_1fr] gap-12 px-2">
              <div className="flex flex-col gap-8">
                <div>
                  <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 italic">Bank Details</h4>
                  <div className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-1 text-[11px] font-bold">
                    <span className="text-slate-400">Name:</span>
                    <span className="font-black text-slate-800">{safeBusiness.bank_name || 'Ramesh Electronics'}</span>
                    <span className="text-slate-400">IFSC Code:</span>
                    <span className="font-black text-slate-800 uppercase italic">{safeBusiness.ifsc_code || 'HDFC000000'}</span>
                    <span className="text-slate-400">Account No:</span>
                    <span className="font-black text-slate-800">{safeBusiness.account_no || '000000000000'}</span>
                    <span className="text-slate-400">Bank:</span>
                    <span className="font-black text-slate-800 uppercase">{safeBusiness.bank_name || 'HDFC Bank'}</span>
                  </div>
                </div>

                <div className="flex gap-8 items-start">
                  <div className="flex flex-col gap-3">
                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Payment QR Code</h4>
                    <div className="p-2 border border-slate-100 rounded-xl bg-white shadow-sm inline-block">
                    <QRCodeSVG 
                        value={`upi://pay?pa=${safeBusiness.upi_id}&pn=${encodeURIComponent(safeBusiness.name || '')}&am=${grandTotal}&cu=INR&tn=Invoice ${encodeURIComponent(invoice.invoice_number)}`}
                        size={100}
                        level="H"
                        includeMargin={false}
                      />
                    </div>
                    <div className="text-[9px] flex flex-col">
                       <span className="text-slate-400 uppercase font-black">UPI ID</span>
                       <span className="font-black text-slate-900 italic">{safeBusiness.upi_id}</span>
                    </div>
                    <div className="flex gap-2 opacity-50 grayscale hover:grayscale-0 transition-all">
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 uppercase">PhonePe</span>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100 uppercase">GPay</span>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-blue-600 text-white uppercase">Paytm</span>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-slate-900 text-white uppercase italic">UPI</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end pt-2">
                <div className="w-full space-y-2.5 mb-6 text-right">
                  <div className="grid grid-cols-[1fr_100px] gap-4">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-tight">Taxable Amount</span>
                    <span className="text-[11px] font-black text-slate-800 italic">₹{parseFloat(taxableAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {(invoice.is_interstate || invoice.isInterstate) ? (
                    <div className="grid grid-cols-[1fr_100px] gap-4">
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-tight">IGST @{items[0]?.taxRate || 18}%</span>
                      <span className="text-[11px] font-black text-slate-800 italic text-right">₹{parseFloat(igstAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-[1fr_100px] gap-4">
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-tight text-right">CGST @{(items[0]?.taxRate || 18)/2}%</span>
                        <span className="text-[11px] font-black text-slate-800 italic text-right">₹{parseFloat(cgstAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="grid grid-cols-[1fr_100px] gap-4">
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-tight text-right">SGST @{(items[0]?.taxRate || 18)/2}%</span>
                        <span className="text-[11px] font-black text-slate-800 italic text-right">₹{parseFloat(sgstAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  )}
                  <div className="h-[1px] w-full bg-slate-200"></div>
                  <div className="grid grid-cols-[1fr_120px] gap-4 py-1">
                    <span className="text-[14px] font-black text-slate-900 uppercase tracking-tighter">Total Amount</span>
                    <span className="text-[14px] font-black text-slate-900 italic">₹{parseFloat(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                  </div>
                  <div className="h-[2px] w-full" style={{ background: BRAND_COLOR, opacity: 0.3 }}></div>
                  <div className="grid grid-cols-[1fr_100px] gap-4 opacity-70">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Received Amount</span>
                    <span className="text-[10px] font-black text-slate-800 italic text-right">₹{parseFloat(paidAmount).toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_100px] gap-4 opacity-70">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Previous Balance</span>
                    <span className="text-[10px] font-black text-slate-800 italic text-right">₹{parseFloat(outstandingBalance).toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_100px] gap-4">
                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest underline decoration-accent-signature underline-offset-2 text-right">Current Balance</span>
                    <span className="text-[10px] font-black text-slate-900 italic underline decoration-accent-signature underline-offset-2 text-right">
                       ₹{(parseFloat(outstandingBalance) + parseFloat(grandTotal) - parseFloat(paidAmount)).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>

                <div className="text-right mt-6">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 italic">Total Amount (in words)</p>
                  <p className="text-[12px] font-black text-slate-900 leading-tight italic">
                    {amountToWords(grandTotal)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 8: TERMS & CONDITIONS */}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 italic">Terms and Conditions</h4>
            <div className="text-[9px] text-slate-500 font-bold space-y-1 pl-4 list-decimal">
              {safeBusiness.invoice_terms ? (
                safeBusiness.invoice_terms.split('\n').filter(t => t.trim()).slice(0, 5).map((term, i) => (
                  <p key={i} className="flex gap-2 leading-relaxed text-left">
                    <span>{i+1}.</span> <span>{term}</span>
                  </p>
                ))
              ) : (
                <>
                  <p className="flex gap-2 leading-relaxed text-left"><span>1.</span> <span>Goods once sold will not be taken back or exchanged.</span></p>
                  <p className="flex gap-2 leading-relaxed text-left"><span>2.</span> <span>All disputes are subject to {safeBusiness.state || 'Local'} jurisdiction only.</span></p>
                </>
              )}
            </div>
          </div>

          {/* SECTION 9: SIGNATURE ROW */}
          <div className="mt-16 flex justify-between items-end pb-4 font-black">
             <div className="flex flex-col items-center">
                <div className="w-48 border-b-2 border-slate-200 mb-2"></div>
                <span className="text-[9px] text-slate-400 uppercase tracking-widest">Customer Signature</span>
             </div>
             <div className="flex flex-col items-center">
                <div className="w-48 border-b-2 border-slate-900 mb-2"></div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-slate-900 uppercase tracking-tight mb-1">Authorized Signatory</span>
                  <span className="text-[8px] text-slate-400 uppercase italic leading-none">{safeBusiness.name}</span>
                </div>
             </div>
          </div>

        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            background: white !important;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print:hidden, .print-hidden {
            display: none !important;
          }
          #invoice-print-area {
            transform: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            width: 100% !important;
            min-height: auto !important;
            padding: 10mm !important;
          }
          /* Force colors to print */
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
    </div>
  );
};

export default InvoiceTemplate;
