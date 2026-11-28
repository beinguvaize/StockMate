import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { pctOf, splitLead } from '../../lib/backupView';

/**
 * Pieces of the Backup and restore page (approved backup-01 to 13): the
 * Settings-style card with header / body / footer, label-left rows, notes,
 * the progress bar and the restore steps. Same look as the Settings panels.
 */

export const PanelHead = ({ title, sub }) => (
  <div className="mb-4">
    <h3 className="font-tight text-[20px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
    {sub && <p className="mt-[3px] max-w-[62ch] text-[13.5px] text-body">{sub}</p>}
  </div>
);

export function SCard({ title, sub, footer, pad = false, children, className, testId }) {
  return (
    <section className={cn('overflow-hidden rounded-[14px] border border-line bg-surface', className)} data-testid={testId}>
      {(title || sub) && (
        <div className="border-b border-sep px-5 pb-3.5 pt-4">
          <h4 className="font-tight text-[15px] font-semibold text-ink">{title}</h4>
          {sub && <p className="mt-0.5 text-[13px] text-body">{sub}</p>}
        </div>
      )}
      {children != null && children !== false && <div className={pad ? 'px-5 py-4' : 'px-5 py-1'}>{children}</div>}
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-sep bg-tile px-5 py-3">{footer}</div>
      )}
    </section>
  );
}

export const FormRow = ({ label, hint, children }) => (
  <div className="grid items-start gap-1.5 border-t border-sep py-3.5 first:border-t-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6">
    <div>
      <b className="block font-tight text-[13.5px] font-semibold text-ink">{label}</b>
      {hint && <small className="mt-0.5 block text-[12px] leading-[1.4] text-mute">{hint}</small>}
    </div>
    <div className="min-w-0 pt-0.5 text-[13.5px] text-ink-2">{children}</div>
  </div>
);

const NOTE = {
  am: 'bg-amber-soft text-[#7c3d06]',
  rd: 'bg-bad-soft text-[#991b1b]',
  gr: 'bg-good-soft text-[#0f6b31]',
};
export const Note = ({ tone = 'gr', icon: Icon, children, className, testId, role }) => (
  <div role={role} data-testid={testId} className={cn('flex items-start gap-2.5 rounded-xl px-3.5 py-[11px] text-[13px] leading-[1.45]', NOTE[tone], className)}>
    {Icon && <Icon size={17} className="mt-px shrink-0" aria-hidden="true" />}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

/** One message from the file check, its lead in bold. */
export const CheckNote = ({ tone, icon, msg }) => {
  const { lead, rest } = splitLead(msg);
  return <Note tone={tone} icon={icon} className="px-3 py-[9px]"><b className="font-semibold">{lead}</b>{rest}</Note>;
};

/** Real progress (0..1) with its label on the left and the percent on the right. */
export const Progress = ({ value, label }) => {
  const pct = pctOf(value);
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label || 'Progress'}>
      <div className="mb-1.5 flex justify-between text-[13px] text-ink-2">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-pill bg-well">
        <i className="block h-full rounded-pill bg-amber transition-[width] duration-[var(--dur-enter)] ease-[var(--ease-out)] motion-reduce:transition-none"
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export const Steps = ({ steps }) => (
  <div className="mt-3 grid gap-2" data-testid="restore-steps">
    {steps.map((s) => (
      <div key={s.label} className={cn('flex items-center gap-2.5 text-[13px]', s.state === 'now' ? 'font-semibold text-ink' : 'text-ink-2')}>
        <i className={cn('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full',
          s.state === 'done' ? 'bg-good' : s.state === 'now' ? 'bg-amber shadow-[0_0_0_4px_var(--color-amber-soft)]' : 'bg-well')}>
          {s.state === 'done' && <Check size={11} strokeWidth={3} className="text-white" aria-hidden="true" />}
        </i>
        {s.label}
      </div>
    ))}
  </div>
);

export const KV = ({ k, v, total = false }) => (
  <div className={cn('flex justify-between py-1 text-[13px]',
    total ? 'mt-1 border-t border-line pt-[7px] font-semibold text-ink' : 'border-t border-sep text-ink-2 first:border-t-0')}>
    <span>{k}</span>
    <span className="font-tight font-semibold tabular-nums">{v}</span>
  </div>
);

export const SubHead = ({ children, className }) => (
  <h6 className={cn('mb-1.5 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute', className)}>{children}</h6>
);

export const Bullets = ({ items }) => (
  <ul className="m-0 list-disc pl-[18px] text-[13px] text-ink-2">
    {items.map((t) => <li key={t} className="my-[3px]">{t}</li>)}
  </ul>
);

export const fieldCls = 'h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)] disabled:opacity-50';

/** Outline button in red, for Disconnect. */
export const redOutline = 'bg-surface text-bad-text shadow-[inset_0_0_0_1px_#F5C2C2] hover:bg-bad-soft';
