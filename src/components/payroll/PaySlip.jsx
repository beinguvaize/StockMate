import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { buildPayslip } from '../../lib/payslip';
import { formatDate } from '../../lib/utils';

/**
 * A printable wage slip for one employee for one pay run.
 *
 * It computes nothing. `buildPayslip` turns the stored `payroll.items` entry
 * into the shape printed here, and it is tested; money arithmetic must not gain
 * a second implementation inside a component where nothing can call it. That is
 * how the receipt mapper came to carry tax figures nobody could verify.
 *
 * The print CSS follows POSReceipt.jsx: a keyed <style> injected on mount and
 * removed on unmount, hiding every sibling of the portal so the page around it
 * (nav, tabs, the pay-run table) does not print. Reused rather than reinvented
 * so there is one way this app puts ink on paper.
 *
 * A5 rather than 80mm: this is filed and signed, not torn off a till roll.
 */
const PaySlip = ({ run, item, employee, business, onClose }) => {
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'payslip-print-css';
    style.textContent = `
      @media print {
        @page { size: A5 portrait; margin: 10mm; }
        html, body {
          background: white !important;
          margin: 0 !important; padding: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body > *:not(#payslip-portal) { display: none !important; }
        #payslip-portal {
          position: static !important; background: white !important;
          overflow: visible !important; display: block !important;
          padding: 0 !important; margin: 0 !important; height: auto !important;
        }
        #payslip-portal .print-hidden { display: none !important; }
        #payslip-sheet {
          width: auto !important; max-width: none !important;
          box-shadow: none !important; border: 0 !important;
          margin: 0 !important; border-radius: 0 !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => { const el = document.getElementById('payslip-print-css'); if (el) el.remove(); };
  }, []);

  const slip = buildPayslip({ run, item, employee, business });
  if (!slip) return null;

  const cy = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

  return createPortal(
    <div
      id="payslip-portal"
      className="fixed inset-0 z-[200] bg-black/50 overflow-auto p-6 flex items-start justify-center"
    >
      <div className="w-full max-w-[460px]">
        {/* Controls never reach the paper */}
        <div className="print-hidden flex items-center justify-end gap-2 mb-3">
          <button
            onClick={() => window.print()}
            className="btn-signature !h-9 !px-4 !text-xs flex items-center gap-1.5"
          >
            <Printer size={13} /> Print
          </button>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-lg bg-white/90 flex items-center justify-center hover:bg-white"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div id="payslip-sheet" className="bg-white rounded-xl p-7 text-ink-primary">
          {/* Header */}
          <div className="text-center border-b border-black/15 pb-3">
            <div className="text-[15px] font-bold uppercase tracking-wide">{slip.business.name}</div>
            {slip.business.address && (
              <div className="text-[10px] text-muted-foreground mt-0.5">{slip.business.address}</div>
            )}
            <div className="text-[11px] font-semibold mt-2 tracking-[0.15em] uppercase">Salary Slip</div>
          </div>

          {/* Who and when */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-3 border-b border-black/10 text-[11px]">
            <Field label="Employee" value={slip.employeeName} strong />
            <Field label="Pay period" value={slip.period} strong />
            {slip.department && <Field label="Department" value={slip.department} />}
            <Field label="Paid on" value={slip.paidOn ? formatDate(slip.paidOn) : '—'} />
            {slip.designation && <Field label="Designation" value={slip.designation} />}
            {slip.reference && <Field label="Reference" value={slip.reference} />}
          </div>

          {slip.isNil ? (
            /* A zero slip must read as one, not as an ordinary payment. */
            <div className="py-6 text-center">
              <div className="text-[13px] font-bold uppercase tracking-wide">Nil — nothing payable</div>
              <div className="text-[11px] text-muted-foreground mt-1.5 px-4">{slip.nilReason}</div>
            </div>
          ) : (
            <>
              {/* Earnings */}
              <table className="w-full text-[11px] my-3">
                <thead>
                  <tr className="border-b border-black/10">
                    <th className="text-left py-1.5 font-semibold uppercase text-[9px] tracking-wider text-muted-foreground">Earnings</th>
                    <th className="text-right py-1.5 font-semibold uppercase text-[9px] tracking-wider text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {slip.earnings.map(e => (
                    <tr key={e.label}>
                      <td className="py-1.5 align-top">
                        {e.label}
                        {e.note && <div className="text-[9.5px] text-muted-foreground">{e.note}</div>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums align-top">{cy(e.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-black/10">
                    <td className="py-1.5 font-semibold">Gross earnings</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold">{cy(slip.grossEarnings)}</td>
                  </tr>
                  {slip.deductions > 0 && (
                    <tr>
                      <td className="py-1.5">Less: deductions</td>
                      <td className="py-1.5 text-right tabular-nums">− {cy(slip.deductions)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Net */}
              <div className="flex items-center justify-between border-t-2 border-black/70 border-b border-black/15 py-2.5">
                <span className="text-[12px] font-bold uppercase tracking-wide">Net pay</span>
                <span className="text-[17px] font-bold tabular-nums">{cy(slip.netPay)}</span>
              </div>
              <div className="text-[10px] italic text-muted-foreground pt-1.5">{slip.netPayInWords}</div>
            </>
          )}

          {/* A slip whose own lines disagree with the stored total says so. */}
          {slip.discrepancy != null && (
            <div className="mt-3 border border-black/25 px-3 py-2 text-[10px]">
              <b>Check this slip.</b> The lines above total {cy(slip.netPay)}, but the pay run
              recorded {cy(slip.discrepancy)} for this employee.
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-9 text-[10px]">
            {['Employee signature', 'For ' + slip.business.name].map(l => (
              <div key={l} className="border-t border-black/40 pt-1 text-center text-muted-foreground">{l}</div>
            ))}
          </div>

          <div className="text-center text-[8.5px] text-muted-foreground pt-4">
            Computer-generated salary slip.
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const Field = ({ label, value, strong }) => (
  <div>
    <div className="text-[8.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={strong ? 'font-semibold' : ''}>{value}</div>
  </div>
);

export default PaySlip;
