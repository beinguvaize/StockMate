import React from 'react';

// Shared presentational bits for reports — minimal redesign. Theme tokens
// only, so amber / Zinc / dark themes all render correctly.

export const SectionHead = ({ title, sub }) => (
  <div className="flex items-baseline gap-3 mb-3">
    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
  </div>
);

/**
 * StatStrip — one bordered container of joined stat cells (the approved
 * replacement for individual colored KPI cards).
 *
 *   <StatStrip items={[
 *     { label: 'Revenue',      value: '₹1,71,554' },
 *     { label: 'Gross profit', value: '₹24,897', tone: 'pos' },  // pos | neg
 *   ]} loading={loading} />
 */
export const StatStrip = ({ items = [], loading = false }) => (
  <div className="grid border border-border rounded-[10px] bg-card overflow-hidden"
       style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
    {items.map((it, i) => (
      <div key={it.label} className={`px-4 py-3 ${i < items.length - 1 ? 'border-r border-border/60' : ''}`}>
        <div className="text-[11px] font-medium text-muted-foreground">{it.label}</div>
        {loading
          ? <div className="h-6 w-20 bg-muted animate-pulse rounded mt-1" />
          : <div className={`text-[19px] font-semibold tabular-nums tracking-tight mt-0.5 ${
              it.tone === 'pos' ? 'text-[color:var(--color-pos)]' : it.tone === 'neg' ? 'text-[color:var(--color-neg)]' : 'text-foreground'}`}>
              {it.value}
            </div>}
      </div>
    ))}
  </div>
);

/**
 * KPI — compatibility shim for existing call sites
 * (`<KPI label value icon color loading />`). Renders a single minimal stat
 * tile; icon/color props are accepted but no longer painted — the redesign
 * removed decorative icon chips. Prefer StatStrip in new code.
 */
export const KPI = ({ label, value, loading }) => (
  <div className="bg-card rounded-[10px] border border-border px-4 py-3">
    <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
    {loading
      ? <div className="h-6 w-20 bg-muted animate-pulse rounded mt-1" />
      : <div className="text-[19px] font-semibold tabular-nums tracking-tight mt-0.5 text-foreground">{value}</div>}
  </div>
);
