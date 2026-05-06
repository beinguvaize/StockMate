import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { formatDate } from '../../lib/utils';

const LINE = '--------------------------------';
const DLINE = '================================';

const POSReceipt = ({ invoice, businessProfile, client, onClose }) => {
  const biz = businessProfile || {};
  const cli = client || { name: invoice?.client_name || 'Walk-in' };

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'pos-receipt-print-css';
    style.textContent = `
      @media print {
        @page { size: 80mm auto; margin: 0; }
        html, body {
          background: white !important;
          margin: 0 !important; padding: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body > *:not(#pos-receipt-portal) { display: none !important; }
        #pos-receipt-portal {
          position: static !important; background: white !important;
          overflow: visible !important; display: block !important;
          padding: 0 !important; margin: 0 !important; height: auto !important;
        }
        #pos-receipt-portal .print-hidden { display: none !important; }
        #pos-receipt-sheet {
          width: 80mm !important; transform: none !important;
          box-shadow: none !important; margin: 0 auto !important;
          padding: 4mm !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => { const el = document.getElementById('pos-receipt-print-css'); if (el) el.remove(); };
  }, []);

  if (!invoice) return null;

  const items = (invoice.items || []).map(i => ({
    name: i.name || 'Item',
    qty:  parseFloat(i.qty || i.quantity || 1),
    rate: parseFloat(i.rate || i.price || 0),
    taxRate: parseFloat(i.taxRate ?? 0),
  }));

  const taxable   = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const totalTax  = items.reduce((s, i) => s + i.qty * i.rate * i.taxRate / 100, 0);
  const grandTotal = parseFloat(invoice.grand_total ?? taxable + totalTax);
  const paidAmount = parseFloat(invoice.paid_amount ?? 0);
  const balance    = grandTotal - paidAmount;

  const fmt = (n) => n.toFixed(2);
  const rpad = (str, len) => String(str).substring(0, len).padEnd(len);
  const lpad = (str, len) => String(str).substring(0, len).padStart(len);

  const handlePrint = () => window.print();

  return createPortal(
    <div
      id="pos-receipt-portal"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm overflow-y-auto py-8"
    >
      {/* Toolbar */}
      <div className="print-hidden flex items-center gap-3 mb-6">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
        >
          <Printer size={16} /> PRINT RECEIPT
        </button>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-all"
        >
          <X size={18} />
        </button>
      </div>

      {/* Receipt Sheet */}
      <div
        id="pos-receipt-sheet"
        className="bg-white font-mono text-[11px] leading-tight w-[302px] px-3 py-4 shadow-2xl"
        style={{ fontFamily: "'Courier New', Courier, monospace" }}
      >
        {/* Header */}
        <div className="text-center mb-1">
          <div className="text-[14px] font-black uppercase tracking-wide">{biz.name || 'BUSINESS NAME'}</div>
          {biz.address && <div className="text-[10px] mt-0.5 whitespace-pre-wrap">{biz.address}</div>}
          {biz.phone && <div className="text-[10px]">Ph: {biz.phone}</div>}
          {biz.gst_no && <div className="text-[10px]">GSTIN: {biz.gst_no}</div>}
        </div>

        <div className="text-center text-[10px] my-1">{DLINE}</div>
        <div className="text-center text-[11px] font-bold uppercase tracking-widest">TAX INVOICE</div>
        <div className="text-center text-[10px]">{LINE}</div>

        {/* Invoice Meta */}
        <div className="text-[10px] flex justify-between">
          <span>#{invoice.invoice_number || invoice.id?.split('-').pop()}</span>
          <span>{formatDate(invoice.invoice_date || invoice.date)}</span>
        </div>
        {cli.name && cli.name !== 'Walk-in' && (
          <div className="text-[10px] mt-0.5">Bill To: <span className="font-bold">{cli.name}</span></div>
        )}
        {cli.phone && <div className="text-[10px]">Ph: {cli.phone}</div>}
        {cli.gstin && <div className="text-[10px]">GSTIN: {cli.gstin}</div>}

        <div className="text-[10px] my-1">{LINE}</div>

        {/* Column Headers */}
        <div className="text-[10px] flex">
          <span className="flex-1 font-bold">ITEM</span>
          <span className="w-6 text-right font-bold">QT</span>
          <span className="w-14 text-right font-bold">RATE</span>
          <span className="w-14 text-right font-bold">AMT</span>
        </div>
        <div className="text-[10px] mb-1">{LINE}</div>

        {/* Items */}
        {items.map((item, idx) => {
          const amt = item.qty * item.rate;
          return (
            <div key={idx} className="text-[10px]">
              <div className="font-semibold truncate">{item.name}</div>
              <div className="flex">
                <span className="flex-1 text-[9px] text-gray-500">
                  {item.taxRate > 0 ? `GST ${item.taxRate}%` : ''}
                </span>
                <span className="w-6 text-right">{item.qty}</span>
                <span className="w-14 text-right">{fmt(item.rate)}</span>
                <span className="w-14 text-right font-semibold">{fmt(amt)}</span>
              </div>
            </div>
          );
        })}

        <div className="text-[10px] mt-1">{LINE}</div>

        {/* Totals */}
        <div className="text-[10px] space-y-0.5">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{fmt(taxable)}</span>
          </div>
          {totalTax > 0 && (
            <>
              <div className="flex justify-between">
                <span>CGST</span>
                <span>{fmt(totalTax / 2)}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST</span>
                <span>{fmt(totalTax / 2)}</span>
              </div>
            </>
          )}
          {invoice.round_off !== 0 && invoice.round_off && (
            <div className="flex justify-between">
              <span>Round Off</span>
              <span>{fmt(parseFloat(invoice.round_off))}</span>
            </div>
          )}
        </div>

        <div className="text-[10px] my-1">{DLINE}</div>
        <div className="flex justify-between text-[13px] font-black">
          <span>TOTAL</span>
          <span>&#8377;{fmt(grandTotal)}</span>
        </div>

        {paidAmount > 0 && (
          <>
            <div className="text-[10px] my-0.5">{LINE}</div>
            <div className="text-[10px] space-y-0.5">
              <div className="flex justify-between">
                <span>Paid</span>
                <span>{fmt(paidAmount)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Balance Due</span>
                <span>{fmt(balance)}</span>
              </div>
            </div>
          </>
        )}

        <div className="text-[10px] my-1">{DLINE}</div>

        {/* Payment status */}
        <div className="text-center text-[10px] font-bold uppercase tracking-widest">
          {invoice.payment_status === 'PAID' ? '*** PAID ***' : '*** PAYMENT DUE ***'}
        </div>

        {/* Footer */}
        <div className="text-[10px] my-1">{LINE}</div>
        <div className="text-center text-[10px] space-y-0.5">
          <div className="font-bold">Thank You for Your Business!</div>
          <div className="text-[9px] text-gray-500">Visit Again</div>
          {biz.invoice_terms && (
            <div className="text-[9px] text-gray-500 mt-1 whitespace-pre-wrap">
              {biz.invoice_terms.split('\n').slice(0, 2).join('\n')}
            </div>
          )}
        </div>
        <div className="text-[10px] mt-1">{DLINE}</div>
      </div>
    </div>,
    document.body
  );
};

export default POSReceipt;
