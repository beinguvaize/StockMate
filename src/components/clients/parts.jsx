import React from 'react';
import { cn, formatShortDateTime } from '../../lib/utils';
import { money, initialsOf, ageTone, ageWords } from '../../lib/clientView';
import { Pill } from '../payroll/parts';

/**
 * Small pieces the Clients screens share (approved mockups clients-01 … 18).
 * Presentation only.
 */

const AV = ['bg-amber-soft text-amber-text', 'bg-info-soft text-info-text', 'bg-tile text-ink-2', 'bg-good-soft text-good-text'];

export const ClientAvatar = ({ name, size = 'sm' }) => (
  <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full font-tight font-semibold',
    AV[String(name || '').length % 4],
    size === 'lg' ? 'h-10 w-10 text-[13px]' : 'h-8 w-8 text-[11.5px]')}>
    {initialsOf(name)}
  </span>
);

/** "41 days" in amber, "68 days" in red, as the Oldest bill column. */
export const AgePill = ({ days }) => (days == null
  ? <span className="text-[12.5px] text-faint">none</span>
  : <Pill tone={ageTone(days)}>{ageWords(days) === 'today' ? 'today' : ageWords(days)}</Pill>);

/**
 * The client summary strip (approved mockups 17, 18; new, read-only):
 * total bought, bills, customer since (first bill), last visit.
 */
export function SummaryStrip({ summary, cur = '₹', className }) {
  if (!summary) return null;
  const s = summary;
  const cell = 'min-w-0 px-3 py-2.5 [&+&]:border-l [&+&]:border-sep';
  const lbl = 'block text-[12px] text-mute';
  const big = 'mt-0.5 block font-tight text-[16px] font-semibold tabular-nums text-ink whitespace-nowrap';
  const sm = 'block text-[11.5px] text-mute whitespace-nowrap';
  return (
    <div className={cn('rounded-[14px] bg-tile', className)} data-testid="client-summary">
      <span className="block px-3 pt-2.5 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Summary</span>
      {s.bills === 0 ? (
        <p className="px-3 pb-3 pt-1 text-[13px] text-body">No bills for this client yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <div className={cell}><span className={lbl}>Total bought</span><b className={big}>{money(s.total, cur)}</b><small className={sm}>all bills</small></div>
          <div className={cell}><span className={lbl}>Bills</span><b className={big}>{s.bills}</b><small className={sm}>avg {money(Math.round(s.avg), cur)}</small></div>
          <div className={cell}><span className={lbl}>Customer since</span><b className={big}>{s.since}</b><small className={sm}>{s.sinceSpan}</small></div>
          <div className={cell}><span className={lbl}>Last visit</span><b className={big}>{s.lastWords}</b><small className={sm}>{formatShortDateTime(s.lastAt || s.last)}</small></div>
        </div>
      )}
    </div>
  );
}

/** "Sale · 26 Nov, 5:12 pm" for the Last activity column. */
export const lastActivityWords = (row) => {
  if (!row?._last) return '';
  return `${row._lastKind} · ${formatShortDateTime(row._lastAt || row._last)}`;
};
