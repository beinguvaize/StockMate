import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { buildPayslip, money } from '../../lib/payslip';
import { accountForMethod } from '../../hooks/useAccounts';
import { formatDate } from '../../lib/utils';
import { SLIP_CSS } from './paySlipStyles';

/**
 * Printable wage slips: A5 landscape, two to an A4 sheet, cut across the middle.
 *
 * It computes nothing. `buildPayslip` turns a stored `payroll.items` entry into
 * the shape printed here and is tested; money arithmetic must not gain a second
 * implementation inside a component where nothing can call it. That is how the
 * receipt mapper came to carry tax figures nobody could verify.
 *
 * Takes an ARRAY of items so one slip and a whole run go through the same path
 * -- a single slip is a batch of one. A second "print them all" component would
 * be this same document written twice, and the two would drift the way the
 * sale-to-invoice mappers did.
 *
 * Layout is detail-left, summary-rail-right. The rail carries net pay, how it
 * was paid, and the month around the slip: daily wages are paid in many small
 * runs here, so "900" alone tells the worker nothing.
 */
const PaySlip = ({ run, items = [], employees = [], business, records = [],
                   paymentMethods = {}, accounts = [], onClose }) => {
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'payslip-print-css';
    style.textContent = SLIP_CSS.print;
    document.head.appendChild(style);
    return () => { const el = document.getElementById('payslip-print-css'); if (el) el.remove(); };
  }, []);

  // How this run was paid. The payroll row records nothing about it -- the
  // method lives on the salary expense the run created -- so it is resolved
  // here and passed in rather than guessed at inside the mapper.
  const mode = paymentMethods[run?.id] || null;
  const payment = mode
    ? { mode, accountName: accounts.find(a => a.id === accountForMethod(accounts, mode))?.name || null }
    : null;

  const list = Array.isArray(items) ? items : [items];
  const slips = list
    .map(it => ({
      key: it?.employeeId || it?.employeeName,
      slip: buildPayslip({
        run, item: it, business, records, payment,
        employee: employees.find(e => e.id === it?.employeeId),
      }),
    }))
    .filter(x => x.slip);
  if (slips.length === 0) return null;

  const nilCount = slips.filter(x => x.slip.isNil).length;

  return createPortal(
    <div id="payslip-portal" className="fixed inset-0 z-[200] bg-black/55 overflow-auto p-6">
      <style>{SLIP_CSS.screen}</style>

      <div className="mx-auto" style={{ maxWidth: '210mm' }}>
        {/* Controls never reach the paper */}
        <div className="print-hidden flex items-center gap-2 mb-3">
          <span className="text-[11px] font-semibold text-white/90">
            {slips.length === 1
              ? slips[0].slip.employeeName
              : `${slips.length} slips · ${Math.ceil(slips.length / 4)} A4 sheet${slips.length > 4 ? 's' : ''}`}
            {nilCount > 0 && slips.length > 1 && (
              <span className="font-normal text-white/70"> · {nilCount} nil</span>
            )}
          </span>
          <button onClick={() => window.print()}
            className="btn-signature !h-9 !px-4 !text-xs flex items-center gap-1.5 ml-auto">
            <Printer size={13} /> Print{slips.length > 1 ? ` all ${slips.length}` : ''}
          </button>
          <button onClick={onClose}
            className="h-9 w-9 rounded-lg bg-white/90 flex items-center justify-center hover:bg-white"
            aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {slips.map(({ key, slip }) => <Slip key={key} s={slip} />)}
      </div>
    </div>,
    document.body
  );
};

/** One slip. Presentation only -- every figure arrives already computed. */
export const Slip = ({ s }) => (
  <div className="payslip-sheet">
    {/* masthead */}
    <div className="ps-mast">
      <div>
        <div className="ps-co">{s.business.name}</div>
        <div className="ps-co-sub">
          {s.business.address}
          {s.business.gstin && <> · GSTIN {s.business.gstin}</>}
        </div>
      </div>
      <div className="ps-doc">
        <div className="ps-doc-t">Salary Slip</div>
        <div className="ps-doc-p">{s.period}</div>
      </div>
    </div>
    <div className="ps-hr" />

    <div className="ps-body">
      {/* who */}
      <div>
        <div className="ps-nmrow">
          <span className="ps-nm">{s.employeeName}</span>
          {s.employeeCode && <span className="ps-code">{s.employeeCode}</span>}
        </div>
        <div className="ps-rl">
          {[s.designation, s.department, s.employmentType === 'FULL_TIME' ? 'Full time' : null]
            .filter(Boolean).join(' · ')}
        </div>
        <dl className="ps-ids">
          <dt>Pay basis</dt><dd>{s.payBasis}</dd>
          <dt>Paid on</dt><dd>{s.paidOn ? formatDate(s.paidOn) : '—'}</dd>
          {s.reference && <><dt>Reference</dt><dd className="ps-mono">{s.reference}</dd></>}
          {s.joinedOn && <><dt>Joined</dt><dd>{formatDate(s.joinedOn)}</dd></>}
          {s.deposit?.modeLabel && <><dt>Paid by</dt><dd>{s.deposit.modeLabel.replace(/^Paid (in|by) /, '')}</dd></>}
          {s.deposit?.fromAccount && <><dt>From</dt><dd>{s.deposit.fromAccount}</dd></>}
          {s.deposit?.toAccount && <><dt>Deposited to</dt><dd className="ps-mono">{s.deposit.toAccount}</dd></>}
          {s.statutory.map(x => (
            <React.Fragment key={x.label}>
              <dt>{x.label}</dt><dd className="ps-mono">{x.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>

      {s.isNil ? (
        /* A zero slip must read as one, not as an ordinary payment. */
        <div className="ps-nil">
          <div className="ps-nil-h">Nil — nothing payable</div>
          <p>{s.nilReason}</p>
        </div>
      ) : (
        <>
          {/* the money */}
          <div className="ps-col-sep">
            <Section title="Earnings" lines={s.earnings}
                     total={['Gross earnings', s.grossEarnings]} />
            <Section title="Deductions" lines={s.deductionLines}
                     total={['Total deductions', s.deductions]} emptyLabel="None" />
          </div>

          {/* totals rail */}
          <div className="ps-rail ps-col-sep">
            <div className="ps-net">
              <div className="ps-net-k">Net pay</div>
              <div className="ps-net-a">{money(s.netPay)}</div>
              <div className="ps-net-w">{s.netPayInWords}</div>
            </div>

            {/* The handovers that made up the month. A monthly slip on a daily
                wage summarises several payments, and the worker needs to see
                which days each one covered. */}
            {s.payments && s.payments.length > 1 && (
              <div className="ps-plist-blk">
                <div className="ps-mtd-k">Paid in {s.payments.length} instalments</div>
                <div className="ps-plist">
                  {s.payments.map(p => (
                    <div className="ps-pln" key={p.id}>
                      <span>{p.label}</span>
                      <span className="ps-a">{money(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* This month beside the financial year, the pairing every payslip
                uses. The year runs April to March -- the window every payroll
                return is measured against, not the calendar year. */}
            {(s.monthToDate || s.yearToDate) && (
              <div className="ps-totals">
                {s.monthToDate && (
                  <div className="ps-tot">
                    <div className="ps-mtd-k">Month to date</div>
                    <div className="ps-tot-a">{money(s.monthToDate.totalAmount)}</div>
                    <div className="ps-tot-d">{s.monthToDate.totalDays} days</div>
                  </div>
                )}
                {s.yearToDate && (
                  <div className="ps-tot">
                    <div className="ps-mtd-k">Year to date</div>
                    <div className="ps-tot-a">{money(s.yearToDate.totalAmount)}</div>
                    <div className="ps-tot-d">FY {s.yearToDate.year} · {s.yearToDate.totalDays} days</div>
                  </div>
                )}
              </div>
            )}

            {s.attendance && (
              <div className="ps-mtd">
                <div className="ps-mtd-k">Attendance</div>
                <div className="ps-mtd-row">
                  <span className="ps-mtd-big">{s.attendance.paidDays}</span>
                  <span className="ps-mtd-d">of {s.attendance.periodDays} days paid</span>
                </div>
                {s.attendance.lopDays > 0 && (
                  <div className="ps-mtd-n">{s.attendance.lopDays} days absent</div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>

    {/* A slip whose own lines disagree with the stored total says so. */}
    {s.discrepancy != null && (
      <div className="ps-warn">
        <b>Check this slip.</b> The lines total {money(s.netPay)}, but the run
        recorded {money(s.discrepancy)}.
      </div>
    )}

    <div className="ps-foot">
      <div className="ps-gen">Computer-generated salary slip{s.reference && <> · Ref {s.reference}</>}</div>
      <div className="ps-sigs">
        <div>Received by</div>
        <div>For {s.business.name}</div>
      </div>
    </div>
  </div>
);

const Fact = ({ k, v, mono }) => (
  <div className="ps-fact">
    <div className="ps-fact-k">{k}</div>
    <div className={`ps-fact-v${mono ? ' ps-mono' : ''}`}>{v}</div>
  </div>
);

const Section = ({ title, lines = [], total, emptyLabel }) => (
  <div className="ps-sec">
    <div className="ps-sec-h">{title}</div>
    {lines.length === 0 ? (
      <div className="ps-ln ps-none"><span>{emptyLabel || 'None'}</span><span className="ps-a">—</span></div>
    ) : lines.map(l => (
      <div className="ps-ln" key={l.label}>
        <span>{l.label}{l.note && <div className="ps-d">{l.note}</div>}</span>
        <span className="ps-a">{money(l.amount)}</span>
      </div>
    ))}
    <div className="ps-ln ps-sum"><span>{total[0]}</span><span className="ps-a">{money(total[1])}</span></div>
  </div>
);

export default PaySlip;
