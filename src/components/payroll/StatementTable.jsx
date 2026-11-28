import React from 'react';
import { cn } from '../../lib/utils';
import { dayWords } from '../../lib/payrollView';
import { inr } from './parts';

/** The salary statement's table (mockups 22, 23): screen and A4 print. */
const DOT = { earned: 'bg-good', paid: 'bg-ink', deduction: 'bg-bad', adjust: 'bg-faint' };
export default function StatementTable({ st, rows = st.rows, print = false }) {
  const tdc = print ? 'px-1.5 py-1.5 border-b border-dotted border-[#E3E4E6] align-top' : 'px-3.5 py-[11px] border-b border-sep align-top text-[13.5px]';
  const r = 'text-right whitespace-nowrap font-tight tabular-nums';
  return (
    <div className={print ? '' : 'overflow-hidden rounded-[14px] border border-line bg-surface'}>
      <table className={cn('w-full border-collapse', print && 'table-fixed text-[11.5px]')}>
        <thead>
          <tr className={print ? '[&>th]:border-b [&>th]:border-[#1b1e22] [&>th]:px-1.5 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-tight [&>th]:text-[10px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.06em] [&>th]:text-[#80868d]'
            : '[&>th]:bg-tile [&>th]:px-3.5 [&>th]:py-[9px] [&>th]:text-left [&>th]:font-tight [&>th]:text-[11.5px] [&>th]:font-semibold [&>th]:text-mute'}>
            <th style={{ width: print ? 58 : 90 }}>Date</th><th>Entry</th><th className="!text-right">Earned</th><th className="!text-right">Paid out</th><th className="!text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.key}>
              <td className={tdc}>{x.type === 'earned' ? `${dayWords(x.date, { year: false })} – ${dayWords(x.dateTo, { year: false })}` : dayWords(x.date, { year: false })}</td>
              <td className={tdc}>
                <b className="flex items-center gap-1.5 font-semibold"><i className={cn('inline-block h-2 w-2 shrink-0 rounded-full', DOT[x.type])} />{x.title}</b>
                {x.note && <small className="mt-0.5 block text-[12px] text-mute">{x.note}</small>}
              </td>
              <td className={cn(tdc, r)}>{x.earned ? <span className={x.earned > 0 ? 'text-good-text' : 'text-bad-text'}>{inr(x.earned, { sign: true })}</span> : ''}</td>
              <td className={cn(tdc, r)}>{x.paid ? inr(-x.paid) : ''}</td>
              <td className={cn(tdc, r, 'font-semibold', x.balance < 0 && 'text-bad-text')}>{inr(x.balance)}</td>
            </tr>
          ))}
          <tr className="font-tight font-semibold">
            <td className={cn(tdc, 'border-t border-line')} /><td className={cn(tdc, 'border-t border-line')}>Totals for the period</td>
            <td className={cn(tdc, r, 'border-t border-line')}>{inr(st.totals.earned, { sign: true })}</td>
            <td className={cn(tdc, r, 'border-t border-line')}>{inr(-st.totals.paid)}</td><td className={cn(tdc, 'border-t border-line')} />
          </tr>
          <tr className={print ? '' : '[&>td]:bg-[#FBFBFA]'}>
            <td className={cn(tdc, 'border-b-0')}>{dayWords(st.asOf, { year: false })}</td>
            <td className={cn(tdc, 'border-b-0')}><b className="font-semibold">Closing balance</b>
              <small className="mt-0.5 block text-[12px] text-mute">{st.paidAhead ? `Paid ${inr(st.paidAhead)} ahead: nothing is due` : `${inr(st.stillToPay)} still to pay — the figure on the staff list`}</small></td>
            <td className={cn(tdc, 'border-b-0')} /><td className={cn(tdc, 'border-b-0')} />
            <td className={cn(tdc, r, 'border-b-0 text-[16px] font-semibold')}>{inr(st.closing)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}


/**
 * Year to date under the statement (22, 23): the financial year so far, read
 * from saved pay-run lines (lib/payslip.yearToDateLines). Days not yet paid
 * are not in it; they are this month's Still to pay, shown beside it.
 */
export function YtdBlock({ ytd, fyLabel, upTo, stillToPay, print = false }) {
  if (!ytd) return null;
  const cell = print ? 'px-3 py-2' : 'px-4 py-3';
  const k = cn('flex items-center gap-1 font-tight font-semibold uppercase tracking-[0.06em]', print ? 'text-[9.5px] text-[#80868d]' : 'text-[11px] text-mute');
  const v = cn('block font-tight font-semibold tabular-nums', print ? 'mt-0.5 text-[13px]' : 'mt-1 text-[19px]');
  const s = print ? 'text-[10px] text-[#80868d]' : 'text-[12px] text-body';
  const ded = ytd.deductions.map((d) => d.label).join(', ');
  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-1.5 font-tight font-semibold', print ? 'mt-2.5 text-[11px]' : 'mt-4 text-[13px]')}>
        Year to date · FY {fyLabel}
        <span className={cn('ml-1.5 font-sans font-medium', print ? 'text-[#80868d]' : 'text-mute')}>
          1 Apr to {dayWords(upTo, { year: false })} · {ytd.runs} pay run{ytd.runs === 1 ? '' : 's'}
        </span>
      </div>
      <div className={cn('mt-2.5 grid grid-cols-2 overflow-hidden border border-line bg-white md:grid-cols-4', print ? 'rounded-[6px]' : 'rounded-[14px]')}>
        <div className={cell}><span className={k}>Gross</span><b className={v}>{inr(ytd.gross)}</b><small className={s}>earnings on the payslips</small></div>
        <div className={cn(cell, 'border-l border-sep')}><span className={k}>Deductions</span><b className={v}>{inr(ytd.deductionsTotal)}</b><small className={s}>{ded || 'none'}</small></div>
        <div className={cn(cell, 'border-l border-sep')}><span className={k}>Paid</span><b className={v}>{inr(ytd.net)}</b><small className={s}>{inr(ytd.gross)} − {inr(ytd.deductionsTotal)}</small></div>
        <div className={cn(cell, 'border-l border-sep')}><span className={k}>Still to pay now</span><b className={v}>{inr(stillToPay)}</b><small className={s}>this month, not yet in a pay run</small></div>
      </div>
    </>
  );
}
