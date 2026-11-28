import React from 'react';
import { Truck, Bike, Car, Package, ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/utils';
import { statusOf } from '../../lib/vehiclesView';

/** Small shared pieces for the Vehicles section (web redesign, vehicles.css). */

export const VehicleIcon = ({ type, size = 'md', className }) => {
  const Icon = type === 'BIKE' ? Bike : type === 'CAR' ? Car : type === 'OTHER' ? Package : Truck;
  const box = { sm: 'h-[38px] w-[38px] rounded-[11px] [&_svg]:size-[19px]', md: 'h-[52px] w-[52px] rounded-[14px] [&_svg]:size-[26px]', lg: 'h-16 w-16 rounded-2xl [&_svg]:size-8' }[size];
  return <span className={cn('grid shrink-0 place-items-center bg-tile text-ink-2', box, className)} aria-hidden="true"><Icon strokeWidth={1.6} /></span>;
};

export const Plate = ({ children, className }) => (children ? (
  <span className={cn('whitespace-nowrap rounded-md bg-surface px-[7px] py-0.5 font-tight text-[11.5px] font-semibold tracking-[0.06em] text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]', className)}>{children}</span>
) : null);

const TONE = {
  good: 'bg-good-soft text-good-text', info: 'bg-info-soft text-info-text', warn: 'bg-amber-soft text-amber-text',
  bad: 'bg-bad-soft text-bad-text', dark: 'bg-ink text-white', neutral: 'bg-well text-body',
};
const DOT = { good: 'bg-good', info: 'bg-info-text', warn: 'bg-amber', bad: 'bg-bad', dark: 'bg-amber', neutral: 'bg-faint' };

/** Status pill with a dot (.st). */
export const DotPill = ({ tone = 'neutral', children, className }) => (
  <span className={cn('inline-flex items-center gap-[5px] whitespace-nowrap rounded-pill px-[9px] py-[3px] font-tight text-[11.5px] font-semibold', TONE[tone], className)}>
    <i className={cn('h-1.5 w-1.5 rounded-full', DOT[tone])} aria-hidden="true" />{children}
  </span>
);

export const StatusPill = ({ status }) => { const s = statusOf(status); return <DotPill tone={s.tone}>{s.label}</DotPill>; };

/** Soft pill without a dot (.pill). */
export const Pill = ({ tone = 'neutral', children, className }) => (
  <span className={cn('inline-flex items-center whitespace-nowrap rounded-pill px-[9px] py-[3px] font-tight text-[11.5px] font-semibold', TONE[tone], className)}>{children}</span>
);

/** Grey zone / date tag in a delivery row (.zp). */
export const Zp = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-1 rounded-pill bg-well px-2 py-0.5 font-tight text-[11.5px] font-semibold text-body">
    {Icon && <Icon size={11} strokeWidth={2.2} aria-hidden="true" />}{children}
  </span>
);

/** Coloured note (.nt). */
export const Note = ({ tone = 'neutral', icon: Icon, children, className }) => (
  <div role={tone === 'bad' ? 'alert' : undefined}
    className={cn('flex items-start gap-2.5 rounded-xl px-3.5 py-[11px] text-[12.5px] leading-[1.45] [&_b]:font-tight [&_b]:font-semibold',
      { warn: 'bg-amber-soft text-amber-text', good: 'bg-good-soft text-good-text', bad: 'bg-bad-soft text-bad-text', neutral: 'bg-tile text-body' }[tone], className)}>
    {Icon && <Icon size={16} className="mt-px shrink-0" aria-hidden="true" />}<div className="min-w-0">{children}</div>
  </div>
);

export const Eyebrow = ({ children, className }) => (
  <span className={cn('font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute', className)}>{children}</span>
);

/** Section heading inside a card or panel (.sec2). */
export const Sec = ({ children, className }) => (
  <div className={cn('mt-[18px] mb-2 flex items-center gap-1.5 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute first:mt-0', className)}>{children}</div>
);

/** The plain four-figure strip (.vstrip). */
export const Strip = ({ items, className, style }) => (
  <div className={cn('mb-[18px] grid grid-cols-2 gap-y-3 md:grid-cols-4', className)} style={style}>
    {items.map((it, i) => (
      <div key={it.label} className={cn('min-w-0 px-[22px] py-0.5 md:border-l md:border-sep', i === 0 && 'pl-0 md:border-l-0', i === 2 && 'max-md:pl-0')}>
        <Eyebrow>{it.label}</Eyebrow>
        <b className={cn('mt-1.5 mb-1 block font-tight text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] tabular-nums', it.tone === 'warn' && 'text-amber-text', it.tone === 'bad' && 'text-bad-text')}>{it.value}</b>
        <small className="block truncate text-[12.5px] text-body">{it.sub}</small>
      </div>
    ))}
  </div>
);

/** Dashed empty card (.empty). */
export const Empty = ({ icon: Icon = Package, title, children, action, className }) => (
  <div className={cn('rounded-[14px] border border-dashed border-[#E2E1DE] bg-surface px-5 py-[52px] text-center', className)}>
    <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-ink-2"><Icon size={22} strokeWidth={1.8} aria-hidden="true" /></span>
    <h4 className="font-tight text-[15px] font-semibold">{title}</h4>
    {children && <p className="mx-auto mt-1 max-w-[48ch] text-[13px] text-body">{children}</p>}
    {action && <div className="mt-3.5">{action}</div>}
  </div>
);

/** The line under a list (.foot). */
export const Foot = ({ children, actions }) => (
  <div className="mt-3.5 flex flex-wrap items-center gap-3 px-1 text-[13px] text-body">
    <span className="min-w-0 flex-1">{children}</span>
    {actions && <div className="flex items-center gap-2.5">{actions}</div>}
  </div>
);

/** "← Vehicles" back link at the top of a full-page flow. */
export const BackLink = ({ onClick, children = 'Vehicles' }) => (
  <button type="button" onClick={onClick}
    className="m-press mb-4 inline-flex items-center gap-1.5 rounded-pill font-tight text-[13px] font-semibold text-body hover:text-ink">
    <ArrowLeft size={15} aria-hidden="true" />{children}
  </button>
);

/** Round grey icon button (.ibtn). */
export const IconBtn = ({ label, onClick, danger = false, className, children, ...rest }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} {...rest}
    className={cn('m-press grid h-8 w-8 shrink-0 place-items-center rounded-xl text-ink-2 disabled:opacity-40 [&_svg]:size-3.5',
      danger ? 'bg-bad-soft text-bad-text hover:bg-[#FBDADA]' : 'bg-well hover:bg-[#E8E8E7]', className)}>
    {children}
  </button>
);

/** Thin progress bar (.bar). */
export const Bar = ({ pct, tone = 'amber', className }) => (
  <div className={cn('h-1.5 overflow-hidden rounded-pill bg-well', className)}>
    <i className={cn('block h-full rounded-pill', tone === 'good' ? 'bg-good' : 'bg-amber')} style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%` }} />
  </div>
);

/** Number stepper with a typed value (.stp). */
export const Stepper = ({ value, onMinus, onPlus, onType, label }) => (
  <div className="inline-flex h-[30px] items-center rounded-pill bg-well">
    <button type="button" aria-label={`Less ${label || ''}`} onClick={onMinus} className="m-press grid h-[30px] w-[30px] place-items-center font-tight text-[15px] font-semibold text-ink-2">−</button>
    <input type="number" min="1" inputMode="numeric" aria-label={`Quantity ${label || ''}`} value={value} onChange={(e) => onType(e.target.value)}
      className="w-[42px] bg-transparent text-center font-tight text-[13px] font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
    <button type="button" aria-label={`More ${label || ''}`} onClick={onPlus} className="m-press grid h-[30px] w-[30px] place-items-center font-tight text-[15px] font-semibold text-ink-2">+</button>
  </div>
);

/** A label + control block in a form (.fld). */
export const Field = ({ label, req, hint, children, className }) => (
  <label className={cn('block', className)}>
    <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">{label}{req && <span className="text-bad-text"> *</span>}</span>
    {children}
    {hint && <span className="mt-1 block text-[12px] text-mute">{hint}</span>}
  </label>
);

export const inputCls = (bad = false) => cn(
  'h-10 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink outline-none placeholder:text-mute shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]',
  bad && 'bg-bad-soft shadow-[inset_0_0_0_1.5px_#F5B5B5]',
);

/** Product initials tile (.th). */
export const Initials = ({ name }) => (
  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-tile font-tight text-[11px] font-semibold uppercase text-body" aria-hidden="true">
    {String(name || '?').trim().slice(0, 2)}
  </span>
);
