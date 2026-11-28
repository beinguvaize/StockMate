import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Small pieces shared by the Labels, Bulk add and Data tools pages (web
 * redesign, mockups labels-*, bulkadd-*, import-*).
 */

const TONES = {
  a: ['bg-amber-soft text-amber-text', AlertTriangle],
  g: ['bg-good-soft text-good-text', CheckCircle2],
  r: ['bg-bad-soft text-bad-text', XCircle],
  n: ['bg-tile text-body', Info],
};

/** Coloured note strip: tone a (amber) | g (green) | r (red) | n (grey). */
export function Note({ tone = 'n', children, className, role }) {
  const [cls, Icon] = TONES[tone] || TONES.n;
  return (
    <div role={role} className={cn('flex items-start gap-2.5 rounded-xl px-3.5 py-[11px] text-[12.5px] leading-[1.45] [&_b]:font-tight [&_b]:text-[13px] [&_b]:font-semibold', cls, className)}>
      <Icon size={16} className="mt-px shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Uppercase section label. */
export function Eyebrow({ children, className }) {
  return (
    <div className={cn('mb-2 flex items-center gap-1.5 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute', className)}>
      {children}
    </div>
  );
}

/** Dashed empty-state card. */
export function EmptyCard({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cn('rounded-[14px] border border-dashed border-[#E2E1DE] bg-surface px-5 py-[52px] text-center', className)}>
      {Icon && (
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-ink-2">
          <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
        </div>
      )}
      <h4 className="font-tight text-[15px] font-semibold text-ink">{title}</h4>
      {children && <p className="mx-auto mt-1 max-w-[48ch] text-[13px] text-body">{children}</p>}
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  );
}

/** Thin progress bar, green fill. */
export function ProgressBar({ value, max, label }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}
      className="h-1.5 overflow-hidden rounded-pill bg-well">
      <i className="block h-full rounded-pill bg-good transition-[width] duration-(--dur-press) ease-(--ease-out) motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Rounded icon tile. */
export function IconTile({ icon: Icon, className }) {
  return (
    <div className={cn('grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] bg-tile text-ink-2', className)}>
      <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
    </div>
  );
}

/** Save a list of rows as a CSV file in the browser (no server call). */
export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
