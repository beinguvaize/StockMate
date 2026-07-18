import React, { useEffect } from 'react';
import { useDialogClose } from '../../hooks/useDialogClose';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { formatDate } from '../../lib/utils';

const LINE  = '--------------------------------';
const DLINE = '================================';

/** Merge tenant bill_settings with safe defaults so all keys are always defined. */
const resolveSettings = (raw) => { raw = raw ?? {}; return ({
  show_business_name:  raw.show_business_name  ?? true,
  show_address:        raw.show_address        ?? true,
  show_phone:          raw.show_phone          ?? true,
  show_gstin:          raw.show_gstin          ?? true,
  show_customer_name:  raw.show_customer_name  ?? true,
  show_customer_gstin: raw.show_customer_gstin ?? true,
  show_tax_breakdown:  raw.show_tax_breakdown  ?? true,
  show_upi:            raw.show_upi            ?? true,
  // Separate toggle so business can put a QR on the GST invoice but not
  // on every thermal POS slip (or vice versa).
  show_upi_invoice:    raw.show_upi_invoice    ?? true,
  show_discount:       raw.show_discount       ?? true,
  show_party_balance:  raw.show_party_balance  ?? true,
  // Every field is independently toggleable.
  show_bill_no:        raw.show_bill_no        ?? true,
  show_date:           raw.show_date           ?? true,
  show_customer_phone: raw.show_customer_phone ?? true,
  show_payment_status: raw.show_payment_status ?? true,
  show_footer:         raw.show_footer         ?? true,
  show_terms:          raw.show_terms          ?? true,
  // Thermal paper width: '80' (302px) or '58' (219px). Drives the print @page.
  paper_width:         raw.paper_width         || '80',
  bill_title:          raw.bill_title          || 'TAX INVOICE',
  footer_message:      raw.footer_message      || 'Thank You for Your Business!',
  // Editable prefix labels (fall back to defaults when blank).
  labels:              raw.labels              || {},
}); };

// Prefix-label resolver — tenant override or the default text.
const lbl = (labels, key, def) => {
  const v = labels?.[key];
  return (typeof v === 'string' && v.trim() !== '') ? v : def;
};

// tendered: optional transient value (number) — when set + > grand total,
// receipt renders "Tendered / Change" rows. Lost after print since cash
// tendered isn't stored on the sale row.
const POSReceipt = ({ invoice, businessProfile, client, onClose, tendered = null, bare = false }) => {
  useDialogClose(onClose, { enabled: !bare }); // bare renders inline, not as an overlay
  const biz = businessProfile || {};
  const cli = client || { name: invoice?.client_name || 'Walk-in' };
  const s   = resolveSettings(biz.bill_settings);
  const L   = (k, def) => lbl(s.labels, k, def);
  // Thermal paper geometry — 58mm or 80mm, no distortion.
  const pwMM = s.paper_width === '58' ? 58 : 80;
  const pwPx = s.paper_width === '58' ? 219 : 302;

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'pos-receipt-print-css';
    style.textContent = `
      @media print {
        @page { size: ${pwMM}mm auto; margin: 0; }
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
          width: ${pwMM}mm !important; transform: none !important;
          box-shadow: none !important; margin: 0 auto !important;
          padding: ${pwMM === 58 ? '2mm' : '4mm'} !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => { const el = document.getElementById('pos-receipt-print-css'); if (el) el.remove(); };
  }, [pwMM]);

  if (!invoice) return null;

  // Tax-mode aware line math. In INCLUSIVE mode the printed rate IS
  // gross (customer pays exactly rate * qty); taxable is backed out per
  // line so the subtotal + CGST + SGST add up to grand_total. In
  // EXCLUSIVE mode the rate is net and tax is added on top.
  const taxMode = (biz.tax_mode || 'EXCLUSIVE').toUpperCase();
  const inclusive = taxMode === 'INCLUSIVE';
  const noGst     = taxMode === 'NONE'; // not filing GST — no tax split

  const items = (invoice.items || []).map(i => ({
    name:    i.name || 'Item',
    qty:     parseFloat(i.qty || i.quantity || 1),
    rate:    parseFloat(i.rate || i.price || 0),
    taxRate: parseFloat(i.taxRate ?? 0),
    imeis:   Array.isArray(i.imeis) ? i.imeis.filter(Boolean) : [],
  }));

  const taxable = items.reduce((s, i) => {
    const gross = i.qty * i.rate;
    return s + (inclusive ? gross / (1 + i.taxRate / 100) : gross);
  }, 0);
  const totalTax = noGst ? 0 : items.reduce((s, i) => {
    const gross = i.qty * i.rate;
    return s + (inclusive
      ? gross - gross / (1 + i.taxRate / 100)
      : gross * i.taxRate / 100);
  }, 0);
  const grandTotal = parseFloat(invoice.grand_total ?? ((inclusive || noGst)
    ? items.reduce((s, i) => s + i.qty * i.rate, 0)
    : taxable + totalTax));
  const paidAmount = parseFloat(invoice.paid_amount ?? 0);
  const balance    = grandTotal - paidAmount;
  // Actual amount the customer handed over. Prefer the stored value (works on
  // reprint); fall back to the transient `tendered` prop right after a sale.
  const receivedRaw = invoice.amount_received != null
    ? parseFloat(invoice.amount_received)
    : (tendered != null ? parseFloat(tendered) : null);
  const received = Number.isFinite(receivedRaw) && receivedRaw > 0 ? receivedRaw : null;
  // Client's balance after this sale (negative = advance). Drives both the
  // money summary and whether the "payment due" terms line is worth printing.
  const totalOutstanding = Number(cli?.outstanding_balance ?? cli?.outstanding ?? 0);
  const owesNothing = balance <= 0.001 && totalOutstanding <= 0.001;
  // A voided / failed / cancelled sale owes nothing — its receipt must
  // not show "PAYMENT DUE", a balance, or a scan-to-pay QR.
  const status  = String(invoice.payment_status ?? '').toUpperCase();
  const isVoid  = status === 'VOIDED' || status === 'FAILED' || status === 'CANCELLED';
  const isPaid  = status === 'PAID';
  // Read discount straight off the sale/invoice row. Old code derived
  // it from a tax-vs-total delta which double-counted on inclusive
  // sales and showed a phantom "Discount -41.40" against an equal
  // CGST+SGST 41.40, producing a meaningless cancel-out on the slip.
  const discount = Math.max(0, parseFloat(
    invoice.discount_total ?? invoice.discountTotal ?? invoice.discount ?? 0
  ));

  const fmt  = (n) => n.toFixed(2);

  // The actual receipt body — same markup in both modes.
  const sheet = (
    <div
      id="pos-receipt-sheet"
      className={bare
        ? 'bg-white font-mono text-[11px] leading-tight px-3 py-4'
        : 'bg-white font-mono text-[11px] leading-tight px-3 py-4 shadow-2xl'}
      style={{ fontFamily: "'Courier New', Courier, monospace", width: `${pwPx}px` }}
    >
        {/* ── Business Header ─────────────────────────────── */}
        <div className="text-center mb-1">
          {s.show_business_name && <div className="text-[14px] font-black uppercase tracking-wide">{biz.name || 'BUSINESS NAME'}</div>}
          {s.show_address  && biz.address && <div className="text-[10px] mt-0.5 whitespace-pre-wrap">{biz.address}</div>}
          {s.show_phone    && biz.phone   && <div className="text-[10px]">{L('phone', 'Ph:')} {biz.phone}</div>}
          {s.show_gstin    && biz.gst_no  && <div className="text-[10px]">{L('gstin', 'GSTIN:')} {biz.gst_no}</div>}
        </div>

        <div className="text-center text-[10px] my-1">{DLINE}</div>
        <div className="text-center text-[11px] font-bold uppercase tracking-widest">{s.bill_title}</div>
        <div className="text-center text-[10px]">{LINE}</div>

        {/* ── Invoice Meta ─────────────────────────────────── */}
        {(s.show_bill_no || s.show_date) && (
          <div className="text-[10px] flex justify-between">
            <span>{s.show_bill_no ? `#${invoice.invoice_number || invoice.id?.split('-').pop()}` : ''}</span>
            <span>{s.show_date ? formatDate(invoice.invoice_date || invoice.date) : ''}</span>
          </div>
        )}

        {/* ── Customer ─────────────────────────────────────── */}
        {s.show_customer_name && cli.name && cli.name !== 'Walk-in' && (
          <div className="text-[10px] mt-0.5">{L('billTo', 'Bill To:')} <span className="font-bold">{cli.name}</span></div>
        )}
        {s.show_customer_phone && cli.phone && <div className="text-[10px]">{L('phone', 'Ph:')} {cli.phone}</div>}
        {s.show_customer_gstin && cli.gstin && <div className="text-[10px]">{L('gstin', 'GSTIN:')} {cli.gstin}</div>}

        <div className="text-[10px] my-1">{LINE}</div>

        {/* ── Column Headers ───────────────────────────────── */}
        <div className="text-[10px] flex">
          <span className="flex-1 font-bold">ITEM</span>
          <span className="w-6 text-right font-bold">QT</span>
          <span className="w-14 text-right font-bold">RATE</span>
          <span className="w-14 text-right font-bold">AMT</span>
        </div>
        <div className="text-[10px] mb-1">{LINE}</div>

        {/* ── Items ────────────────────────────────────────── */}
        {items.map((item, idx) => {
          const amt = item.qty * item.rate;
          return (
            <div key={idx} className="text-[10px]">
              <div className="font-semibold truncate">{item.name}</div>
              <div className="flex">
                {/* No per-line GST label when the business isn't charging or
                    filing GST (tax mode NONE) — the totals already show no
                    CGST/SGST, so printing "GST 18%" per item was misleading. */}
                <span className="flex-1 text-[9px] text-gray-500">
                  {!noGst && item.taxRate > 0 ? `GST ${item.taxRate}%` : ''}
                </span>
                <span className="w-6 text-right">{item.qty}</span>
                <span className="w-14 text-right">{fmt(item.rate)}</span>
                <span className="w-14 text-right font-semibold">{fmt(amt)}</span>
              </div>
              {item.imeis.length > 0 && (
                <div className="text-[8px] text-gray-500 leading-tight">
                  {item.imeis.map((sn, j) => <div key={j}>IMEI: {sn}</div>)}
                </div>
              )}
            </div>
          );
        })}

        <div className="text-[10px] mt-1">{LINE}</div>

        {/* ── Totals ───────────────────────────────────────── */}
        {/* Subtotal must tie with TOTAL on the slip. When the CGST/SGST
            breakdown is shown, subtotal is the taxable base (base + taxes
            = total). When the breakdown is HIDDEN, printing the base made
            the receipt look wrong (e.g. Subtotal 4894.07 → TOTAL 5775 with
            nothing in between) — show the gross sum instead. */}
        <div className="text-[10px] space-y-0.5">
          <div className="flex justify-between">
            <span>{L('subtotal', 'Subtotal')}</span>
            <span>{fmt(s.show_tax_breakdown && totalTax > 0 ? taxable : taxable + totalTax)}</span>
          </div>
          {s.show_discount && discount > 0 && (
            <div className="flex justify-between">
              <span>Discount</span>
              <span>- {fmt(discount)}</span>
            </div>
          )}
          {s.show_tax_breakdown && totalTax > 0 && (
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
          <span>{L('total', 'TOTAL')}</span>
          <span>&#8377;{fmt(grandTotal)}</span>
        </div>

        {/* ── Money summary ────────────────────────────────────
            One plain-language block so the customer can read, in order:
            what this bill was, what they handed over, what's left on this
            bill, what older bills still owe, and the single bottom-line
            figure. Printed even when nothing was paid (credit sale) —
            that's exactly when they need to see what they owe. */}
        {!isVoid && (() => {
          const totalOut  = totalOutstanding;     // balance after this sale
          const olderDue  = totalOut - balance;   // unpaid from earlier bills
          const excess    = received != null ? received - grandTotal : 0;
          // Account lines apply to any registered client — including one who
          // just cleared everything, who should still see "YOU OWE NOW 0.00"
          // as proof. Keying this off a non-zero balance hid the summary at
          // exactly that moment and mislabelled the extra as change.
          const isRegistered = !!(cli?.id || invoice?.client_id);
          const showAccount  = s.show_party_balance && isRegistered;
          return (
            <>
              <div className="text-[10px] my-0.5">{LINE}</div>
              <div className="text-[10px] space-y-0.5">
                <div className="flex justify-between">
                  <span>Bill amount</span>
                  <span>{fmt(grandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid on this bill</span>
                  <span>{fmt(paidAmount)}</span>
                </div>
                {balance > 0.001 && (
                  <div className="flex justify-between font-bold">
                    <span>Still due on this bill</span>
                    <span>{fmt(balance)}</span>
                  </div>
                )}

                {/* What the customer actually handed over, when it differs. */}
                {received != null && received > paidAmount + 0.01 && (
                  <>
                    <div className="flex justify-between border-t border-dashed border-black/30 mt-1 pt-1">
                      <span>Cash received</span>
                      <span>{fmt(received)}</span>
                    </div>
                    {excess > 0.01 && (
                      <div className="flex justify-between">
                        {/* For a registered client the surplus may have gone to
                            dues, been returned as change, or split between the
                            two — the receipt only sees the final balance, so
                            don't claim it all went "to account". The YOU OWE NOW
                            line below is the authoritative figure. */}
                        <span>{showAccount ? 'Extra received' : 'Change returned'}</span>
                        <span>{fmt(excess)}</span>
                      </div>
                    )}
                  </>
                )}

                {showAccount && (
                  <>
                    {olderDue > 0.001 && (
                      <div className="flex justify-between border-t border-dashed border-black/30 mt-1 pt-1">
                        <span>Older bills still due</span>
                        <span>{fmt(olderDue)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-black text-[11px] border-t border-black/40 mt-1 pt-1">
                      <span>{totalOut < -0.001 ? 'ADVANCE WITH US' : 'YOU OWE NOW'}</span>
                      <span>{fmt(Math.abs(totalOut))}</span>
                    </div>
                    {totalOut < -0.001 && (
                      <div className="text-[9px] text-center">(we will use it on your next bill)</div>
                    )}
                  </>
                )}
              </div>
            </>
          );
        })()}

        <div className="text-[10px] my-1">{DLINE}</div>

        {/* ── Payment status ───────────────────────────────── */}
        {s.show_payment_status && (
          <div className="text-center text-[10px] font-bold uppercase tracking-widest">
            {isVoid ? '*** VOIDED ***' : isPaid ? '*** PAID ***' : '*** PAYMENT DUE ***'}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────── */}
        <div className="text-[10px] my-1">{LINE}</div>
        <div className="text-center text-[10px] space-y-0.5">
          {s.show_footer && s.footer_message && <div className="font-bold">{s.footer_message}</div>}
          {s.show_upi && biz.upi_id && (() => {
            // Only render a "Scan to pay" QR when something is actually
            // owed — paid sales hide the QR entirely (avoids confused
            // re-payments) and the QR amount is the outstanding balance,
            // not the gross bill, so partial-paid sales don't trigger
            // an overpayment.
            const total = Number(invoice?.grand_total || invoice?.totalAmount || 0);
            const paid  = Number(invoice?.paid_amount  || invoice?.paidAmount   || 0);
            const due   = Math.max(0, +(total - paid).toFixed(2));
            if (isVoid || isPaid || due <= 0) {
              // Voided or settled → show UPI ID footer only, never a QR.
              return <div className="mt-0.5">{L('upi', 'UPI:')} {biz.upi_id}</div>;
            }
            const note = `Sale ${invoice?.invoice_number || invoice?.id || ''} (Bal Due)`;
            const upiUri =
              `upi://pay?pa=${biz.upi_id}` +
              `&pn=${encodeURIComponent(biz.businessName || biz.name || 'Merchant')}` +
              `&am=${due.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
            return (
              <>
                <div className="mt-0.5">UPI: {biz.upi_id}</div>
                <div className="text-[10px] mt-0.5">
                  Balance Due: <b>₹{due.toFixed(2)}</b>
                </div>
                <div className="flex justify-center my-2">
                  <QRCodeSVG value={upiUri} size={96} level="M" includeMargin={false} />
                </div>
                <div className="text-center text-[10px] opacity-80">
                  Scan to pay ₹{due.toFixed(2)}
                </div>
              </>
            );
          })()}
          {s.show_terms && biz.invoice_terms && (() => {
            // Drop the "payment due within N days" sentence when there is
            // nothing left to pay — it read oddly under *** PAID ***. The
            // rest of the terms (return policy, jurisdiction) still print.
            const raw = biz.invoice_terms.split('\n').slice(0, 2).join('\n');
            if (!owesNothing) {
              return (
                <div className="text-[9px] text-gray-500 mt-1 whitespace-pre-wrap">{raw}</div>
              );
            }
            const kept = raw.split('.').map(x => x.trim()).filter(Boolean)
              .filter(sn => !/payment\s+due/i.test(sn));
            if (!kept.length) return null;
            return (
              <div className="text-[9px] text-gray-500 mt-1 whitespace-pre-wrap">
                {kept.join('. ') + '.'}
              </div>
            );
          })()}
        </div>
        <div className="text-[10px] mt-1">{DLINE}</div>
      </div>
  );

  // Bare mode (mobile WebPrint embed): render inline on a white page,
  // no portal, no toolbar, no backdrop. html2canvas would otherwise
  // capture the dark backdrop + "PRINT RECEIPT" button into the PDF.
  if (bare) {
    return sheet;
  }

  return createPortal(
    <div
      id="pos-receipt-portal"
      className="fixed inset-0 z-[70] flex flex-col items-center bg-black/80 backdrop-blur-sm overflow-y-auto pb-8"
    >
      {/* Toolbar — sticky so Print/Close stay reachable on long receipts */}
      <div className="print-hidden sticky top-0 z-10 w-full flex items-center justify-center gap-3 py-4 mb-2 bg-black/60 backdrop-blur-md">
        <button
          onClick={() => window.print()}
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
      {sheet}
    </div>,
    document.body
  );
};

export default POSReceipt;
