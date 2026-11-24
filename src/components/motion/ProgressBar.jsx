import React from 'react';

/** Linear bar driven by REAL progress (0..1) with a crossfading step label. */
export default function ProgressBar({ value = 0, label = '' }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="mt-3 w-full max-w-md" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label || 'Progress'}>
      <div className="h-1.5 rounded-pill bg-black/10 overflow-hidden">
        <div className="progress-fill h-full rounded-pill bg-accent-signature" style={{ width: `${pct}%` }} />
      </div>
      <p key={label} className="step-text mt-1.5 text-xs font-semibold text-muted-foreground tabular-nums">{label} {pct}%</p>
    </div>
  );
}
