import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { formatDate } from '../../../lib/utils';
import { Editable, DEFAULT_DOC_TEXTS } from '../../../components/invoice/invoiceLayouts';
import { useTenant } from '../../../context/TenantContext';

// 80mm thermal-style receipt for walk-in cash sales. No GST, no bill-to block.
// Portal'd to document.body so print CSS can isolate it from app chrome.
const money = (n, sym = '₹') => `${sym}${Number(n || 0).toFixed(2)}`;

const CashBillPrint = ({ sale, business = {}, onClose, currencySymbol = '₹', previewMode = false, paperOverride = null, receiptOverride = null, editable = false, onEditText = null, textsOverride = null }) => {
  const { currentTenantId } = useTenant();
  // Paper width from Settings → Print Settings (58/80mm; A4 falls back to 80).
  // Tenant-level prefs first (business.print_settings); localStorage fallback.
  const dbPrefs = (business && typeof business.print_settings === 'object' && business.print_settings) || null;
  let paper = paperOverride || dbPrefs?.paper === '58' && '58' || dbPrefs?.paper || '80';
  if (paper !== '58') paper = '80';
  try {
    const prefs = JSON.parse(localStorage.getItem(`print_settings_${currentTenantId || 'default'}`));
    if (!paperOverride && !dbPrefs && prefs?.paper === '58') paper = '58';
  } catch { /* defaults */ }
  const paperMm = `${paper}mm`;

  // Receipt design + customizable footer (Settings -> Printing designer).
  let rt = receiptOverride || dbPrefs?.receiptTemplate || 'classic';
  let docTexts = { ...DEFAULT_DOC_TEXTS, ...(dbPrefs?.docTexts || {}), ...(textsOverride || {}) };
  if (!dbPrefs) {
    try {
      const prefs = JSON.parse(localStorage.getItem(`print_settings_${currentTenantId || 'default'}`)) || {};
      if (!receiptOverride && prefs.receiptTemplate) rt = prefs.receiptTemplate;
      if (!textsOverride) docTexts = { ...DEFAULT_DOC_TEXTS, ...(prefs.docTexts || {}) };
    } catch { /* defaults */ }
  }
  // Variant styling: divider + header + total treatments.
  const div_ = rt === 'classic' ? 'border-dashed border-black/40' : rt === 'compact' ? 'border-solid border-black/30' : 'border-solid border-black';
  const headerCls = rt === 'bold' ? 'text-lg font-extrabold tracking-widest' : rt === 'compact' ? 'text-sm font-bold' : 'text-base font-bold tracking-wide';
  const totalCls = rt === 'bold' ? 'bg-black text-white px-1.5 py-1 -mx-1.5' : 'border-t border-black mt-1 pt-1';
  const items = Array.isArray(sale?.items) ? sale.items : [];
  const subtotal = items.reduce((s, i) => s + Number(i.price || i.sellingPrice || 0) * Number(i.quantity || 0), 0);
  const total = Number(sale?.totalAmount ?? sale?.total_amount ?? subtotal);
  const discount = Math.max(0, subtotal - total);
  const qty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const billNo = sale?.id ? String(sale.id).split('-').pop().toUpperCase() : '—';
  const date = formatDate(sale?.date);
  const pay = (sale?.paymentMethod || sale?.payment_method || 'CASH').toUpperCase();

  const handlePrint = () => window.print();

  const tree = (
    <div id={previewMode ? undefined : 'sale-print-portal'}
      className={previewMode
        ? 'relative flex justify-center'
        : 'fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4'}>
      {/* Toolbar */}
      {!previewMode && (
      <div className="print-chrome fixed top-4 right-4 flex gap-2 z-[110]">
        <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 rounded-pill bg-ink-primary text-white font-bold text-xs hover:opacity-90">
          <Printer size={14} /> PRINT
        </button>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white border border-black/10 flex items-center justify-center hover:bg-red-50 hover:text-red-500">
          <X size={16} />
        </button>
      </div>
      )}

      {/* Receipt sheet — thermal, width from print settings */}
      <div className={`print-sheet bg-white px-4 py-5 text-[11px] font-mono text-black leading-snug ${previewMode ? "shadow-sm mt-0 border border-gray-200" : "shadow-xl mt-20"}`} style={{ width: paperMm }}>
        <div className={`text-center border-b ${div_} pb-2 mb-2`}>
          <div className={`uppercase ${headerCls}`}>{business.name || 'BUSINESS'}</div>
          {business.address && <div className="text-[10px] leading-tight mt-0.5">{business.address}</div>}
          {business.phone && <div className="text-[10px]">Tel: {business.phone}</div>}
        </div>

        <div className="text-center font-bold uppercase text-xs mb-2">Cash Bill</div>

        <div className="flex justify-between text-[10px] mb-1">
          <span>Bill #{billNo}</span>
          <span>{date}</span>
        </div>
        <div className={`flex justify-between text-[10px] mb-2 pb-2 border-b ${div_}`}>
          <span>Cust: Walk-in</span>
          <span>Pay: {pay}</span>
        </div>

        <div className={`border-b ${div_} pb-1 mb-1`}>
          <div className="flex text-[10px] font-bold uppercase">
            <div className="flex-1">Item</div>
            <div className="w-8 text-right">Qty</div>
            <div className="w-14 text-right">Rate</div>
            <div className="w-16 text-right">Amt</div>
          </div>
        </div>
        <div className={`pb-1 mb-1 border-b ${div_}`}>
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
          <div className={`flex justify-between font-bold text-[13px] ${totalCls}`}>
            <span>TOTAL</span><span>{money(total, currencySymbol)}</span>
          </div>
        </div>

        <div className={`text-center text-[10px] mt-3 pt-2 border-t ${div_}`}>
          <div className="font-bold">
            <Editable on={previewMode && editable} value={docTexts.rcptFooter} onChange={v => onEditText?.('rcptFooter', v)} />
          </div>
          <div className="opacity-70 mt-0.5">This is a cash bill. Not a tax invoice.</div>
          {business.upi_id && <div className="mt-1">UPI: {business.upi_id}</div>}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: ${paperMm} auto; margin: 3mm; }
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
          #sale-print-portal .print-sheet { margin: 0 !important; box-shadow: none !important; width: ${paperMm} !important; padding: 0 !important; }
        }
      `}} />
    </div>
  );
  return previewMode ? tree : createPortal(tree, document.body);
};

export default CashBillPrint;
