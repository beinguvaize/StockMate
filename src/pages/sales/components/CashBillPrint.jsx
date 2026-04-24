import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { formatDate } from '../../../lib/utils';

// 80mm thermal-style receipt for walk-in cash sales. No GST, no bill-to block.
// Portal'd to document.body so print CSS can isolate it from app chrome.
const money = (n, sym = '₹') => `${sym}${Number(n || 0).toFixed(2)}`;

const CashBillPrint = ({ sale, business = {}, onClose, currencySymbol = '₹' }) => {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  const subtotal = items.reduce((s, i) => s + Number(i.price || i.sellingPrice || 0) * Number(i.quantity || 0), 0);
  const total = Number(sale?.totalAmount ?? sale?.total_amount ?? subtotal);
  const discount = Math.max(0, subtotal - total);
  const qty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const billNo = sale?.id ? String(sale.id).split('-').pop().toUpperCase() : '—';
  const date = formatDate(sale?.date);
  const pay = (sale?.paymentMethod || sale?.payment_method || 'CASH').toUpperCase();

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

      {/* Receipt sheet — 80mm thermal */}
      <div className="print-sheet bg-white shadow-xl mt-20 w-[80mm] px-4 py-5 text-[11px] font-mono text-black leading-snug">
        <div className="text-center border-b border-dashed border-black/40 pb-2 mb-2">
          <div className="text-base font-bold uppercase tracking-wide">{business.name || 'BUSINESS'}</div>
          {business.address && <div className="text-[10px] leading-tight mt-0.5">{business.address}</div>}
          {business.phone && <div className="text-[10px]">Tel: {business.phone}</div>}
        </div>

        <div className="text-center font-bold uppercase text-xs mb-2">Cash Bill</div>

        <div className="flex justify-between text-[10px] mb-1">
          <span>Bill #{billNo}</span>
          <span>{date}</span>
        </div>
        <div className="flex justify-between text-[10px] mb-2 pb-2 border-b border-dashed border-black/40">
          <span>Cust: Walk-in</span>
          <span>Pay: {pay}</span>
        </div>

        <div className="border-b border-dashed border-black/40 pb-1 mb-1">
          <div className="flex text-[10px] font-bold uppercase">
            <div className="flex-1">Item</div>
            <div className="w-8 text-right">Qty</div>
            <div className="w-14 text-right">Rate</div>
            <div className="w-16 text-right">Amt</div>
          </div>
        </div>
        <div className="pb-1 mb-1 border-b border-dashed border-black/40">
          {items.map((it, i) => {
            const rate = Number(it.price || it.sellingPrice || 0);
            const q = Number(it.quantity || 0);
            return (
              <div key={i} className="text-[10px] py-0.5">
                <div className="truncate">{it.name || 'Item'}</div>
                <div className="flex">
                  <div className="flex-1" />
                  <div className="w-8 text-right">{q}</div>
                  <div className="w-14 text-right">{rate.toFixed(2)}</div>
                  <div className="w-16 text-right">{(rate * q).toFixed(2)}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-[11px] space-y-0.5">
          <div className="flex justify-between"><span>Items / Qty</span><span>{items.length} / {qty}</span></div>
          <div className="flex justify-between"><span>Subtotal</span><span>{money(subtotal, currencySymbol)}</span></div>
          {discount > 0 && (
            <div className="flex justify-between"><span>Discount</span><span>- {money(discount, currencySymbol)}</span></div>
          )}
          <div className="flex justify-between font-bold text-[13px] border-t border-black mt-1 pt-1">
            <span>TOTAL</span><span>{money(total, currencySymbol)}</span>
          </div>
        </div>

        <div className="text-center text-[10px] mt-3 pt-2 border-t border-dashed border-black/40">
          <div className="font-bold">THANK YOU • VISIT AGAIN</div>
          <div className="opacity-70 mt-0.5">This is a cash bill. Not a tax invoice.</div>
          {business.upi_id && <div className="mt-1">UPI: {business.upi_id}</div>}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: 80mm auto; margin: 3mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
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
          #sale-print-portal .print-sheet { margin: 0 !important; box-shadow: none !important; width: 80mm !important; padding: 0 !important; }
        }
      `}} />
    </div>,
    document.body
  );
};

export default CashBillPrint;
