import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { amountInWords } from '../../lib/payslip';
import { formatDate } from '../../lib/utils';
import { maskSensitive, rangeWords, dayWords, monthBounds } from '../../lib/payrollView';
import StatementTable from './StatementTable';
import { inr, payTypeWords, rateWords } from './parts';

/**
 * The salary statement on A4 portrait (approved mockup 23): the same rows as
 * the Salary statement tab, nothing recomputed. `ytd` (optional) is the
 * year-to-date block, read from saved pay-run lines.
 */
const PRINT_CSS = `@media print{
  @page{size:A4 portrait;margin:12mm;}
  html,body{background:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
  body > *:not(#statement-portal){display:none!important;}
  #statement-portal{position:static!important;background:#fff!important;overflow:visible!important;padding:0!important;}
  #statement-portal .print-hidden{display:none!important;}
  #statement-portal .st-paper{box-shadow:none!important;width:auto!important;padding:0!important;}
}`;

export default function StatementPrint({ st, emp, business = {}, month, today, ytd, onClose }) {
  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'statement-print-css';
    el.textContent = PRINT_CSS;
    document.head.appendChild(el);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { el.remove(); window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const b = monthBounds(month);
  const dl = 'grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-[5px] text-[11.5px] [&>dt]:text-[#80868d] [&>dd]:m-0 [&>dd]:font-medium';
  return createPortal(
    <div id="statement-portal" className="fixed inset-0 z-[200] overflow-auto bg-[rgba(17,20,24,0.55)] px-4 py-[22px]">
      <div className="print-hidden mx-auto mb-3 flex max-w-[794px] items-center gap-2 font-tight text-[13px] font-semibold text-white">
        <span>Salary statement · {emp.name} · {rangeWords(b.from, b.to)}</span>
        <div className="flex-1" />
        <button type="button" onClick={() => window.print()} className="m-press inline-flex h-9 items-center gap-1.5 rounded-pill bg-amber px-4 text-white"><Printer size={14} /> Print</button>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink"><X size={15} /></button>
      </div>
      <div className="st-paper mx-auto max-w-[794px] rounded-[4px] bg-white px-[34px] py-[30px] text-[12.5px] text-[#1b1e22] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex items-end justify-between border-b-2 border-[#1b1e22] pb-3">
          <div>
            <div className="font-tight text-[18px] font-bold">{business?.businessName || business?.name || 'Business'}</div>
            <div className="mt-0.5 text-[11.5px] text-[#5d636a]">{[business?.address, (business?.gst_no || business?.gstin) ? `GSTIN ${business?.gst_no || business?.gstin}` : null].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="text-right">
            <b className="block font-tight text-[13px] font-bold uppercase tracking-[0.08em]">Salary statement</b>
            <span className="text-[12px] text-[#5d636a]">{rangeWords(b.from, b.to)}{st.asOf < st.to ? ` · as on ${dayWords(st.asOf, { year: false })}` : ''}</span>
          </div>
        </div>
        <div className="mt-3.5 mb-3 grid grid-cols-2 gap-x-[30px] gap-y-1.5">
          <dl className={dl}>
            <dt>Employee</dt><dd><b>{emp.name}</b>{emp.employee_code ? ` · ${emp.employee_code}` : ''}</dd>
            <dt>Role</dt><dd>{[emp.position, emp.department].filter(Boolean).join(' · ') || '—'}</dd>
            {emp.joining_date && <><dt>Joined</dt><dd>{formatDate(emp.joining_date)}</dd></>}
          </dl>
          <dl className={dl}>
            <dt>Pay basis</dt><dd>{payTypeWords(emp.pay_type)} · {rateWords(emp)}</dd>
            {emp.pan && <><dt>PAN</dt><dd>{maskSensitive(emp.pan)}</dd></>}
            {emp.bank_account && <><dt>Bank</dt><dd>{maskSensitive(emp.bank_account)}</dd></>}
          </dl>
        </div>
        <StatementTable st={st} print />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[['Earned', st.totals.earned, null], ['Paid out', st.totals.paid, null], ['Closing balance', st.closing, amountInWords(Math.max(0, st.closing))]].map(([k, v, w]) => (
            <div key={k}>
              <span className="block font-tight text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#80868d]">{k}</span>
              <b className="block font-tight text-[13px] font-semibold tabular-nums">{inr(v)}</b>
              {w && <small className="text-[10px] text-[#80868d]">{w}</small>}
            </div>
          ))}
        </div>
        {ytd}
        <div className="mt-[22px] flex items-end justify-between border-t border-[#E3E4E6] pt-2.5 text-[10.5px] text-[#80868d]">
          <span>Computer-generated statement · printed {dayWords(today)}</span>
          <div className="flex gap-10">
            <div className="min-w-[130px] border-t border-[#1b1e22] pt-1 text-center text-[#1b1e22]">Employee signature</div>
            <div className="min-w-[130px] border-t border-[#1b1e22] pt-1 text-center text-[#1b1e22]">For {business?.businessName || business?.name || 'the business'}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
