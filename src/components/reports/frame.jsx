import React, { useEffect, useRef, useState } from 'react';
import {
  Download, ChevronDown, FileSpreadsheet, Printer, FileText, Calendar,
  AlertTriangle, BarChart3, RefreshCcw, Info,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Eyebrow } from '../ui/FigureStrip';

/**
 * The shared report frame (web redesign, mockups reports-01 to 29): page
 * title, period control, export menu, figure tiles, boxes, and the loading,
 * empty and error states. Every report page is built from these parts, so
 * they all read as one page. Presentation only: no figure is worked out here.
 */

/* ── Page title row ───────────────────────────────────────────────────────── */
export function ReportTitle({ title, subtitle, actions, className }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start gap-3', className)}>
      <div className="min-w-0">
        <h1 className="font-tight text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{title}</h1>
        {subtitle && <p className="mt-[3px] text-[13px] text-body tabular-nums">{subtitle}</p>}
      </div>
      <div className="flex-1" />
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A row of controls (period, filters, dates) under the title. */
export const ReportRow = ({ className, children }) => (
  <div className={cn('no-print mb-3.5 flex flex-wrap items-center gap-2.5', className)}>{children}</div>
);

/* ── Segmented control ────────────────────────────────────────────────────── */
/**
 * items: [{ id, label, icon? }]. Dark pill on the chosen one; `light` gives
 * the white-on-grey variant the mockups use for in-report views.
 */
export function Seg({ items, value, onChange, light = false, ariaLabel, className }) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn('inline-flex flex-wrap rounded-pill bg-well p-[3px]', className)}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button key={it.id} type="button" aria-pressed={on} onClick={() => onChange?.(it.id)}
            className={cn('m-press inline-flex items-center gap-[5px] whitespace-nowrap rounded-pill px-[13px] py-1.5 font-tight text-[12.5px] font-semibold',
              on ? (light ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(17,20,24,.12)]' : 'bg-ink text-white') : 'text-body hover:text-ink')}>
            {it.icon}{it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Date field ───────────────────────────────────────────────────────────── */
export const DateField = ({ value, onChange, label, className }) => (
  <input type="date" aria-label={label} value={value || ''} onChange={(e) => onChange?.(e.target.value)}
    className={cn('h-[34px] rounded-[10px] bg-surface px-3 font-sans text-[13px] font-medium text-ink tabular-nums shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-(--dur-press) focus-visible:shadow-[inset_0_0_0_2px_var(--color-amber)]', className)} />
);

/** Calendar icon used on the Custom preset. */
export const CustomIcon = <Calendar size={13} strokeWidth={2} aria-hidden="true" />;

/* ── Buttons ──────────────────────────────────────────────────────────────── */
const BTN = {
  primary: 'bg-amber text-white hover:bg-amber-hover',
  ghost: 'bg-surface text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile',
  dark: 'bg-ink text-white hover:bg-[#2A2F35]',
};
export const ReportButton = React.forwardRef(({ tone = 'ghost', icon: Icon, className, children, ...props }, ref) => (
  <button ref={ref} type="button"
    className={cn('m-press inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 font-tight text-[13px] font-semibold disabled:pointer-events-none disabled:opacity-45', BTN[tone], className)}
    {...props}>
    {Icon && <Icon size={15} strokeWidth={2} aria-hidden="true" />}{children}
  </button>
));
ReportButton.displayName = 'ReportButton';

/* ── Export menu ──────────────────────────────────────────────────────────── */
/**
 * Excel / PDF / CSV, as each report offered before. Pass only the ones the
 * report has; one handler alone renders a plain button.
 */
export function ExportMenu({ onExcel, onPDF, onCSV, label = 'Export', tone = 'primary' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const items = [
    onExcel && { key: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet, run: onExcel },
    onPDF && { key: 'pdf', label: 'PDF / Print', icon: Printer, run: onPDF },
    onCSV && { key: 'csv', label: 'CSV', icon: FileText, run: onCSV },
  ].filter(Boolean);
  if (items.length === 0) return null;
  if (items.length === 1 && !onExcel && !onPDF) {
    return <ReportButton tone={tone} icon={Download} onClick={items[0].run}>{label}</ReportButton>;
  }
  return (
    <div className="no-print relative" ref={ref}>
      <ReportButton tone={tone} icon={Download} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
        <ChevronDown size={13} strokeWidth={2} aria-hidden="true" className={cn('chevron-turn', open && 'rotate-180')} />
      </ReportButton>
      {open && (
        <div role="menu" className="menu-pop absolute right-0 z-40 mt-2 w-[200px] rounded-[14px] bg-surface p-1.5 shadow-[0_0_0_1px_rgba(17,20,24,.06),0_18px_40px_-14px_rgba(17,20,24,.35)]">
          {items.map(({ key, label: l, icon: Icon, run }) => (
            <button key={key} type="button" role="menuitem" onClick={() => { setOpen(false); run(); }}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left font-tight text-[13px] font-semibold text-ink transition-colors duration-(--dur-press) hover:bg-tile">
              <Icon size={16} strokeWidth={1.9} className="text-ink-2" aria-hidden="true" />{l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Figures ──────────────────────────────────────────────────────────────── */
const GRID = {
  2: 'grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
};
export const Figures = ({ cols = 4, className, children }) => (
  <div className={cn('mb-4 grid gap-3', GRID[cols] || GRID[4], className)}>{children}</div>
);

const TILE_TONE = { pos: '[&_b]:text-good-text', neg: '[&_b]:text-bad-text', amber: '[&_b]:text-amber-text' };

/** Grey figure tile (kt): eyebrow label, big figure, optional line. */
export function FigureTile({ label, value, sub, tone, loading }) {
  return (
    <div className={cn('min-w-0 rounded-[14px] bg-tile px-4 py-3.5', TILE_TONE[tone])}>
      <Eyebrow>{label}</Eyebrow>
      {loading
        ? <span className="mt-2 mb-1 block h-6 w-24 animate-pulse rounded-md bg-black/[0.06]" />
        : <b className="mt-1.5 mb-[3px] block truncate whitespace-nowrap font-tight text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink tabular-nums">{value}</b>}
      {sub && <small className="block text-[12.5px] text-body">{sub}</small>}
    </div>
  );
}

/** Tiny line under a KPI card, from the card's own chartData. */
function Spark({ data }) {
  if (!data || data.length < 2) return <div className="h-7" aria-hidden="true" />;
  const vals = data.map((d) => Number(d.value) || 0);
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${28 - ((v - min) / span) * 26 - 1}`).join(' ');
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-1.5 block h-7 w-full" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--color-amber)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** White KPI card (kc): amber dot, optional trend, figure, label, sparkline. */
export function KpiCard({ label, value, trend, trendDir, chartData, loading }) {
  const dn = trendDir === 'down';
  return (
    <div className="min-w-0 rounded-[14px] border border-line bg-surface px-4 pt-3.5 pb-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-amber-soft" aria-hidden="true">
          <i className="h-2 w-2 rounded-full bg-amber" />
        </span>
        {trendDir && (
          <span className={cn('font-tight text-[11.5px] font-semibold tabular-nums', dn ? 'text-bad-text' : trendDir === 'up' ? 'text-good-text' : 'text-mute')}>
            {trendDir === 'none' ? '—' : `${dn ? '↓' : '↑'} ${Math.abs(Number(trend) || 0)}%`}
          </span>
        )}
      </div>
      {loading
        ? <span className="block h-6 w-24 animate-pulse rounded-md bg-black/[0.06]" />
        : <b className={cn('block truncate whitespace-nowrap font-tight font-semibold leading-[1.15] tracking-[-0.02em] text-ink tabular-nums',
            String(value).length > 12 ? 'text-[18px]' : 'text-[22px]')}>{value}</b>}
      <small className="mt-[3px] block text-[12px] text-body">{label}</small>
      <Spark data={chartData} />
    </div>
  );
}

/* ── Box ──────────────────────────────────────────────────────────────────── */
/** A bordered card with a heading row; `flush` drops the body padding. */
export function ReportBox({ title, sub, right, children, flush = false, className, bodyClassName }) {
  return (
    <section className={cn('mb-4 overflow-hidden rounded-[14px] border border-line bg-surface', className)}>
      {(title || right) && (
        <div className="flex flex-wrap items-baseline gap-2.5 px-4 pt-3.5 pb-3">
          {title && <h3 className="font-tight text-[15px] font-semibold text-ink">{title}</h3>}
          {sub && <small className="text-[12.5px] text-mute">{sub}</small>}
          <div className="flex-1" />
          {right}
        </div>
      )}
      {flush ? children : <div className={cn('px-4 pt-1 pb-4', bodyClassName)}>{children}</div>}
    </section>
  );
}

/** A small section heading between groups of tiles. */
export const SectionTitle = ({ title, sub, right }) => (
  <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
    <h3 className="font-tight text-[15px] font-semibold text-ink">{title}</h3>
    {sub && <small className="text-[12.5px] text-mute">{sub}</small>}
    {right && <><div className="flex-1" />{right}</>}
  </div>
);

/** The quiet line under a row of tiles. */
export const Note = ({ tone, className, children }) => (
  <p className={cn('-mt-1.5 mb-4 text-[12.5px]', tone === 'good' ? 'text-good-text' : tone === 'bad' ? 'text-bad-text' : 'text-body', className)}>{children}</p>
);

/* ── Banners ──────────────────────────────────────────────────────────────── */
const BANNER = {
  amber: 'bg-amber-soft text-amber-text',
  bad: 'bg-bad-soft text-bad-text',
  info: 'bg-info-soft text-info-text',
  good: 'bg-good-soft text-good-text',
  neutral: 'bg-tile text-body border border-line',
};
export const Banner = ({ tone = 'amber', icon: Icon = Info, className, children, role }) => (
  <div role={role} className={cn('mb-3.5 flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-[1.45]', BANNER[tone], className)}>
    {Icon && <Icon size={17} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />}
    <div className="min-w-0">{children}</div>
  </div>
);

/* ── States ───────────────────────────────────────────────────────────────── */
export function EmptyBlock({ title, text, icon: Icon = BarChart3, compact = false, children }) {
  if (compact) {
    return <div className="px-5 py-10 text-center text-[13px] text-body">{text || title}</div>;
  }
  return (
    <div className="px-5 py-14 text-center text-body">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-mute" aria-hidden="true">
        <Icon size={22} strokeWidth={1.8} />
      </span>
      {title && <h3 className="font-tight text-[16px] font-semibold text-ink">{title}</h3>}
      {text && <p className="mt-1 text-[13px]">{text}</p>}
      {children}
    </div>
  );
}

/**
 * A report that failed to load (reports-11). Shown instead of the figures,
 * so a failed load never reads as ₹0.
 */
export function ErrorBlock({ title = 'This report could not load', message, hint = 'Nothing here is a figure yet. Try again in a moment.', onRetry, className }) {
  return (
    <section role="alert" className={cn('mb-4 rounded-[14px] border border-line bg-surface px-[30px] py-7', className)}>
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-bad-soft text-bad-text" aria-hidden="true">
        <AlertTriangle size={22} strokeWidth={1.8} />
      </span>
      <h3 className="font-tight text-[16px] font-semibold text-ink">{title}</h3>
      {message && <p className="mt-1 text-[13px] text-ink-2">{message}</p>}
      {hint && <p className="mt-1 text-[13px] text-body">{hint}</p>}
      {onRetry && (
        <ReportButton tone="ghost" icon={RefreshCcw} className="mt-3.5" onClick={onRetry}>Retry</ReportButton>
      )}
    </section>
  );
}

/** Placeholder rows while a box loads. */
export const LoadingRows = ({ rows = 5 }) => (
  <div className="space-y-2.5 px-4 py-4" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-9 animate-pulse rounded-[10px] bg-tile" />
    ))}
  </div>
);
