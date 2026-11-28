import React from 'react';
import { Badge } from '../ui/badge';
import { statusOf } from '../../lib/estimateView';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { money } from '../../lib/clientView';

/** Small shared pieces for the Estimates and Orders pages (web redesign). */

const nf2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "8,600.00" */
export const amt2 = (n) => nf2.format(Math.round((Number(n) || 0) * 100) / 100);
/** "₹28,038" (Indian grouping; paise only when there are any) */
export const rupees = (n, cur = '₹') => money(n, cur);
/** "₹28,038.00" */
export const rupees2 = (n, cur = '₹') => `${cur}${amt2(n)}`;

export const EstimateStatusPill = ({ estimate, className }) => {
  const s = statusOf(estimate);
  return <Badge tone={s.tone} className={className}>{s.label}</Badge>;
};

export const Eyebrow = ({ children, className = '' }) => (
  <span className={`font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute ${className}`}>{children}</span>
);

export const Tile = ({ label, value }) => (
  <div className="min-w-0 rounded-[10px] bg-tile px-3 py-[9px]">
    <Eyebrow>{label}</Eyebrow>
    <b className="mt-px block truncate font-tight text-[13.5px] font-semibold tabular-nums">{value}</b>
  </div>
);

export const Tots = ({ className = '', children }) => <div className={`rounded-xl bg-tile px-3.5 py-3 ${className}`}>{children}</div>;

export const TotRow = ({ label, value, strong = false }) => (
  <div className={strong
    ? 'mt-1.5 flex justify-between border-t border-line pt-[9px] font-tight text-[14.5px] font-semibold text-ink'
    : 'flex justify-between gap-3 py-[3px] text-[13px] text-body'}>
    <span>{label}</span><span className={`text-right tabular-nums ${strong ? '' : 'font-tight font-medium text-ink-2'}`}>{value}</span>
  </div>
);

export const SectionHead = ({ children }) => (
  <span className="mt-5 mb-2 block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">{children}</span>
);

/** One line for a toast after a failed write: the server's reason, or "may have saved". */
export function failWords(error, noun) {
  const f = classifyWriteFailure(error, { noun });
  return f.maySaved
    ? `${f.title}. It may have been saved: check the list before trying again. ${f.detail}`
    : `${f.title}: ${f.detail}`;
}

/** The round tinted icon in a confirm dialog's header. */
export const DialogIcon = ({ tone = 'neutral', children }) => {
  const t = { bad: 'bg-bad-soft text-bad-text', warn: 'bg-amber-soft text-amber-text', good: 'bg-good-soft text-good-text', neutral: 'bg-tile text-ink-2' }[tone];
  return <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t} [&_svg]:size-5`}>{children}</span>;
};

/** An info box (the grey one under a dialog's text). */
export const InfoBox = ({ children, className = '' }) => (
  <div className={`mt-3 rounded-xl bg-tile px-3.5 py-3 text-[13px] text-body [&_b]:font-semibold [&_b]:text-ink ${className}`}>{children}</div>
);
