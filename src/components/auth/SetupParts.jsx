import React from 'react';
import { MessageCircle, ChevronLeft } from 'lucide-react';
import { cn } from '../../lib/utils';
import { LOGO_SRC } from './AuthParts';
import { supportWhatsAppLink, SUPPORT_NAME } from '../../lib/support';

/**
 * Frame of the first-time setup pages (approved setup-01 to 13): a white page
 * with the logo, the WhatsApp help link and Sign out across the top, one
 * column below it, the amber segment bar and "Step n of N".
 */

export function SetupFrame({ children, wide = false, onSignOut, onNexus, helpText }) {
  return (
    <div className="flex min-h-screen flex-col bg-white font-inter text-ink">
      <header className="flex items-center gap-3.5 border-b border-sep px-4 py-[22px] sm:px-10">
        <img src={LOGO_SRC} alt="bookledger" className="h-[26px] w-auto" />
        {onNexus && (
          <button type="button" onClick={onNexus}
            className="m-press inline-flex items-center gap-1 rounded-pill bg-well px-3 py-1.5 font-tight text-[12.5px] font-semibold text-ink hover:bg-[#E8E8E7]">
            <ChevronLeft size={14} aria-hidden="true" />Nexus HQ
          </button>
        )}
        <div className="flex-1" />
        {/* A signup that stalls is a customer lost in silence, and the person
            who can unstick them is one tap away. */}
        <a href={supportWhatsAppLink(helpText || `Hi ${SUPPORT_NAME}, I need help setting up my bookledger workspace.`)}
          target="_blank" rel="noopener noreferrer"
          className="hidden items-center gap-[7px] font-tight text-[13px] font-semibold text-body hover:text-ink sm:inline-flex">
          <MessageCircle size={16} aria-hidden="true" />Need a hand? WhatsApp support
        </a>
        {onSignOut && (
          <button type="button" onClick={onSignOut}
            className="m-press h-7 rounded-pill bg-well px-3 font-tight text-[12.5px] font-semibold text-ink hover:bg-[#E8E8E7]">
            Sign out
          </button>
        )}
      </header>
      <div className={cn('mx-auto w-full px-4 pb-10 pt-12 sm:px-0', wide ? 'max-w-[1000px] sm:px-6' : 'max-w-[600px]')}>
        {children}
      </div>
    </div>
  );
}

export function StepBar({ step, total, names }) {
  return (
    <>
      <div className="flex gap-[5px]" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step}
        aria-label={`Step ${step} of ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={cn('h-1 flex-1 rounded-[2px] transition-colors duration-[var(--dur-hover)]', i < step ? 'bg-amber' : 'bg-[#E9E8E6]')} />
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-[12.5px] font-medium text-[#7A8088]">
        <span><b className="font-semibold text-ink-2">Step {step} of {total}</b></span>
        <span className="hidden truncate sm:inline">{names.join(' · ')}</span>
      </div>
    </>
  );
}

export const StepQ = ({ title, sub, className }) => (
  <>
    <h1 className={cn('mb-1.5 mt-[22px] font-tight text-[30px] font-bold leading-[1.15] tracking-[-0.03em] text-ink', className)}>{title}</h1>
    {sub && <p className="mb-[22px] text-[14.5px] text-body">{sub}</p>}
  </>
);

/** Back / Skip on the left, the one primary action on the right. */
export const StepNav = ({ left, right, className }) => (
  <div className={cn('mt-7 flex items-center gap-2.5', className)}>
    {left}
    <div className="flex-1" />
    {right}
  </div>
);

export const navBtn = (kind = 'pri') => cn(
  'm-press inline-flex h-12 items-center justify-center gap-2 rounded-pill px-[26px] font-tight text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40',
  kind === 'pri' ? 'bg-amber text-white hover:bg-amber-hover' : 'bg-well text-ink hover:bg-[#E8E8E7]',
);

/** A big radio card (business type, state). */
export function BigOption({ selected, onClick, icon, title, sub, disabled }) {
  return (
    <button type="button" data-card role="radio" aria-checked={selected} onClick={onClick} disabled={disabled}
      className={cn('m-press flex w-full items-center gap-3.5 rounded-xl px-[18px] py-4 text-left disabled:opacity-60',
        selected ? 'bg-white shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
      {icon && (
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl [&_svg]:size-[19px]',
          selected ? 'bg-amber-soft text-amber-text' : 'bg-tile text-ink-2')}>
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <b className="block font-tight text-[15px] font-semibold text-ink">{title}</b>
        {sub && <small className="block text-[12px] text-mute">{sub}</small>}
      </span>
      <span className={cn('ml-auto h-5 w-5 shrink-0 rounded-full',
        selected ? 'shadow-[inset_0_0_0_6px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1.5px_var(--color-faint)]')} aria-hidden="true" />
    </button>
  );
}

/** The large single-question input box. */
export const bigBoxCls = 'flex min-h-[54px] items-center gap-2 rounded-xl bg-white px-3.5 text-[16px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)] transition-shadow duration-[var(--dur-hover)]';
