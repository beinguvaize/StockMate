import React from 'react';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { initials } from '../../lib/payrollView';
import { Button } from '../ui/button';

/**
 * Small pieces the Payroll screens share (approved payroll mockups 01-33).
 * Presentation only.
 */

/** ₹12,000 · −₹500 · — for null. Whole rupees: pay lines are rounded by the run. */
export const inr = (n, { sign = false } = {}) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Math.round(Number(n));
  const body = `₹${Math.abs(v).toLocaleString('en-IN')}`;
  if (v < 0) return `−${body}`;
  return sign && v > 0 ? `+${body}` : body;
};

const AV = { a: 'bg-amber-soft text-amber-text', b: 'bg-info-soft text-info-text', g: 'bg-good-soft text-good-text', n: 'bg-tile text-ink-2' };
const avTone = (name) => ['a', 'b', 'n', 'g'][String(name || '').length % 4];

export const Avatar = ({ name, size = 'md', dim = false }) => (
  <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full font-tight font-semibold', AV[avTone(name)],
    size === 'xl' ? 'h-[60px] w-[60px] text-[19px]' : 'h-8 w-8 text-[11.5px]', dim && 'opacity-60')}>
    {initials(name)}
  </span>
);

const PILL = {
  good: 'bg-good-soft text-good-text', warn: 'bg-amber-soft text-amber-text', bad: 'bg-bad-soft text-bad-text',
  info: 'bg-info-soft text-info-text', neutral: 'bg-well text-body',
};
export const Pill = ({ tone = 'neutral', small = false, className, children }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-pill font-tight font-semibold', small ? 'px-2 py-px text-[11px]' : 'px-[9px] py-[3px] text-[11.5px]', PILL[tone], className)}>
    {children}
  </span>
);

export const statusPill = (status, small) => {
  const s = String(status || 'ACTIVE').toUpperCase();
  if (s === 'INACTIVE') return <Pill small={small}>Inactive</Pill>;
  if (s === 'ON_LEAVE') return <Pill tone="info" small={small}>On leave</Pill>;
  return <Pill tone="good" small={small}>Active</Pill>;
};

export const payTypeWords = (t) => {
  const s = String(t || '').toUpperCase();
  if (s === 'WEEKLY') return 'Weekly salary';
  if (s === 'DAILY' || s === 'HOURLY') return 'Day rate';
  return 'Monthly salary';
};

/** '₹15,000 a month' / '₹600 a day'. */
export const rateWords = (emp = {}) => {
  const t = String(emp.pay_type || emp.payType || '').toUpperCase();
  if (t === 'DAILY' || t === 'HOURLY') return `${inr(emp.daily_rate ?? emp.dailyRate)} a day`;
  return `${inr(emp.salary ?? emp.basePay)} a ${t === 'WEEKLY' ? 'week' : 'month'}`;
};

export const Eyebrow = ({ className, children }) => (
  <span className={cn('block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute', className)}>{children}</span>
);

export const Hint = ({ className, children }) => <span className={cn('text-[12px] text-mute', className)}>{children}</span>;

/** The ‹ November 2026 › stepper. */
export const MonthStep = ({ label, onPrev, onNext }) => (
  <div className="inline-flex items-center gap-0.5 rounded-pill p-[3px] shadow-[inset_0_0_0_1px_var(--color-line)]">
    <button type="button" onClick={onPrev} aria-label="Previous month" className="m-press grid h-7 w-7 place-items-center rounded-xl text-ink-2 hover:bg-tile"><ChevronLeft size={14} /></button>
    <span className="min-w-[118px] text-center font-tight text-[13px] font-semibold tabular-nums">{label}</span>
    <button type="button" onClick={onNext} aria-label="Next month" className="m-press grid h-7 w-7 place-items-center rounded-xl text-ink-2 hover:bg-tile"><ChevronRight size={14} /></button>
  </div>
);

/** A red bar with an optional action (19, 33). */
export const ErrorBar = ({ children, action, onAction }) => (
  <div role="alert" className="mb-3 flex items-start gap-2.5 rounded-xl bg-bad-soft px-3.5 py-[11px] text-[13px] text-bad-text">
    <AlertCircle size={17} className="mt-px shrink-0" />
    <span className="min-w-0 flex-1">{children}</span>
    {action && <Button variant="secondary" size="xs" onClick={onAction} className="ml-auto bg-surface">{action}</Button>}
  </div>
);

/** Dashed empty state (17, 18, 31). */
export const EmptyState = ({ icon: Icon, title, text, children, steps }) => (
  <div className="rounded-2xl border border-dashed border-[#D9DADC] bg-surface px-6 py-14 text-center">
    {Icon && <div className="mx-auto mb-3.5 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-body"><Icon size={22} strokeWidth={1.8} /></div>}
    <h3 className="font-tight text-[17px] font-semibold">{title}</h3>
    {text && <p className="mx-auto mt-1.5 mb-[18px] max-w-[440px] text-[13.5px] text-body">{text}</p>}
    {children}
    {steps && (
      <div className="mt-[22px] flex flex-wrap justify-center gap-2.5">
        {steps.map(([t, d]) => (
          <div key={t} className="w-[210px] rounded-xl bg-tile px-3.5 py-3 text-left text-[12.5px] text-body">
            <b className="mb-0.5 block font-tight text-[13px] font-semibold text-ink">{t}</b>{d}
          </div>
        ))}
      </div>
    )}
  </div>
);

/** One "label … value" line (panel facts, breakdowns). */
export const Fact = ({ label, value, note, tone, strong = false }) => (
  <div className="flex justify-between gap-3 border-b border-sep py-2.5 text-[13.5px]">
    <span className="text-body">{label}{note && <small className="block text-[12px] text-mute">{note}</small>}</span>
    <span className={cn('text-right font-tight font-semibold tabular-nums',
      strong ? 'text-[15px] text-ink' : 'text-[13.5px] text-ink',
      tone === 'good' && 'text-good-text', tone === 'warn' && 'text-amber-text', tone === 'bad' && 'text-bad-text', tone === 'mute' && 'text-mute')}>{value}</span>
  </div>
);

/** A white card with a heading row. */
export const Card = ({ title, aside, className, children }) => (
  <div className={cn('rounded-[14px] border border-line bg-surface px-[18px] py-4', className)}>
    {(title || aside) && (
      <div className="mb-2 flex items-center gap-2">
        {title && <h3 className="font-tight text-[14.5px] font-semibold">{title}</h3>}
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
    )}
    {children}
  </div>
);

/** An amber text button ("Open full profile →"). */
export const LinkButton = ({ onClick, children, className }) => (
  <button type="button" onClick={onClick} className={cn('font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-4', className)}>{children}</button>
);

/** Attendance mark chip colours (07, 21, 24). */
export const MARK = {
  PRESENT: { label: 'Present', icon: '✓', cell: 'bg-[#DDF3E5] text-good-text' },
  HALF_DAY: { label: 'Half day', icon: '½', cell: 'bg-amber-soft text-amber-text' },
  LEAVE: { label: 'Leave', icon: 'L', cell: 'bg-info-soft text-info-text' },
  SICK: { label: 'Sick', icon: 'S', cell: 'bg-[#FDF0CF] text-[#92650A]' },
  ABSENT: { label: 'Absent', icon: '✗', cell: 'bg-[#FDE7E7] text-bad' },
};
export const MARK_ORDER = ['PRESENT', 'HALF_DAY', 'LEAVE', 'SICK', 'ABSENT'];
export const markOf = (status) => MARK[String(status || '').toUpperCase() === 'OT' ? 'PRESENT' : String(status || '').toUpperCase()] || null;
