import React from 'react';
import { Loader2, AlertTriangle, Inbox, RefreshCcw } from 'lucide-react';

/**
 * Shared UI state primitives — consistent loading / empty / error / spinner
 * surfaces across the app. Amber/mono per docs/DESIGN.md.
 */

/* ── Spinner ─────────────────────────────────────────────────────────────── */
export const Spinner = ({ size = 16, className = '' }) => (
  <Loader2 size={size} className={`animate-spin text-accent-signature ${className}`} />
);

/* ── Skeleton shimmer ────────────────────────────────────────────────────── */
export const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-black/[0.06] ${className}`} />
);

/** N skeleton rows — drop inside a table/list body while loading. */
export const SkeletonRows = ({ rows = 6, className = '' }) => (
  <div className={`p-4 space-y-3 ${className}`}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    ))}
  </div>
);

/** Grid of skeleton cards (KPI strips / card grids). */
export const SkeletonCards = ({ count = 4, className = '' }) => (
  <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-black/[0.07] bg-white p-5 space-y-2.5">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-6 w-28" />
      </div>
    ))}
  </div>
);

/* ── Loading block (centered) ────────────────────────────────────────────── */
export const LoadingBlock = ({ label = 'Loading…', className = '' }) => (
  <div className={`flex flex-col items-center justify-center gap-3 py-20 text-center ${className}`}>
    <Spinner size={24} />
    <p className="text-[13px] font-bold text-muted-foreground tracking-wide">{label}</p>
  </div>
);

/**
 * Full-page placeholder — header bar + KPI strip + table rows. Use in place of
 * a blocking spinner so the page's shape appears instantly while data loads.
 */
export const PageSkeleton = ({ cards = 4, rows = 8, className = '' }) => (
  <div className={`animate-fade-in ${className}`}>
    <div className="flex items-center justify-between mb-5">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-9 w-28 rounded-xl" />
    </div>
    {cards > 0 && <SkeletonCards count={cards} className="mb-5" />}
    <div className="rounded-2xl border border-black/[0.07] bg-white">
      <div className="flex items-center gap-3 p-4 border-b border-black/[0.05]">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20 ml-auto" />
      </div>
      <SkeletonRows rows={rows} />
    </div>
  </div>
);

/* ── Empty state ─────────────────────────────────────────────────────────── */
export const EmptyState = ({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  description,
  action,              // { label, onClick, icon }
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center text-center px-6 py-16 sm:py-20 ${className}`}>
    <div className="w-14 h-14 rounded-2xl bg-accent-signature/10 border border-accent-signature/15 flex items-center justify-center mb-4">
      <Icon size={26} className="text-accent-signature" strokeWidth={1.6} />
    </div>
    <p className="text-sm font-bold text-ink-primary">{title}</p>
    {description && <p className="text-[12px] font-medium text-muted-foreground mt-1 max-w-sm">{description}</p>}
    {action && (
      <button
        onClick={action.onClick}
        className="mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-accent-signature text-white text-xs font-bold hover:bg-accent-signature-hover shadow-md shadow-accent-signature/25 transition-colors"
      >
        {action.icon}{action.label}
      </button>
    )}
  </div>
);

/* ── Error state ─────────────────────────────────────────────────────────── */
export const ErrorState = ({
  title = 'Something went wrong',
  description = 'Could not load this data. Please try again.',
  onRetry,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center text-center px-6 py-16 ${className}`}>
    <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-4">
      <AlertTriangle size={26} className="text-rose-500" strokeWidth={1.6} />
    </div>
    <p className="text-sm font-bold text-ink-primary">{title}</p>
    <p className="text-[12px] font-medium text-muted-foreground mt-1 max-w-sm">{description}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-white border border-black/[0.08] text-ink-primary text-xs font-bold hover:bg-black/[0.03] transition-colors"
      >
        <RefreshCcw size={14} /> Retry
      </button>
    )}
  </div>
);

export default { Spinner, Skeleton, SkeletonRows, SkeletonCards, LoadingBlock, EmptyState, ErrorState };
