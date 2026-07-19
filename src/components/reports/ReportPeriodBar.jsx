import React, { useMemo, useState } from 'react';

// Shared report period selector — preset pills (This Month / Last Month /
// This FY / This Year / All Time) + a from/to date range. Lifted from the
// P&L report so GST reports share the same theme + period scoping.
// Indian financial year runs Apr 1 → Mar 31.

const iso = (d) => d.toISOString().slice(0, 10);

export const buildReportPresets = () => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const fy = m >= 3 ? y : y - 1;
  return [
    { id: 'THIS_MONTH', label: 'This Month', from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) },
    { id: 'LAST_MONTH', label: 'Last Month', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { id: 'THIS_FY', label: 'This FY', from: `${fy}-04-01`, to: `${fy + 1}-03-31` },
    { id: 'THIS_YEAR', label: 'This Year', from: `${y}-01-01`, to: `${y}-12-31` },
    { id: 'ALL', label: 'All Time', from: '2000-01-01', to: '2100-01-01' },
  ];
};

// Hook: holds the active preset + {from,to} range. Defaults to the given
// preset (This Month suits GST monthly returns).
export const useReportPeriod = (defaultPreset = 'THIS_MONTH') => {
  const presets = useMemo(buildReportPresets, []);
  const [preset, setPreset] = useState(defaultPreset);
  const [range, setRange] = useState(() => {
    const p = presets.find((x) => x.id === defaultPreset) || presets[0];
    return { from: p.from, to: p.to };
  });
  const applyPreset = (id) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setPreset(id);
    setRange({ from: p.from, to: p.to });
  };
  return { presets, preset, setPreset, range, setRange, applyPreset };
};

const ReportPeriodBar = ({ presets, preset, range, setRange, setPreset, applyPreset }) => (
  <div className="flex flex-wrap items-center gap-2 no-print">
    <div className="flex gap-1 bg-canvas p-1 rounded-pill">
      {presets.map((pr) => (
        <button key={pr.id} onClick={() => applyPreset(pr.id)}
          className={`px-3 py-1.5 rounded-pill text-[11px] font-semibold transition-colors ${
            preset === pr.id ? 'bg-accent-signature text-button-text shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}>{pr.label}</button>
      ))}
    </div>
    <div className="flex items-center gap-1.5 ml-auto">
      <input type="date" value={range.from} onChange={(e) => { setPreset(''); setRange((r) => ({ ...r, from: e.target.value })); }}
        className="bg-card border border-black/10 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-accent-signature/40" />
      <span className="text-xs text-muted-foreground">→</span>
      <input type="date" value={range.to} onChange={(e) => { setPreset(''); setRange((r) => ({ ...r, to: e.target.value })); }}
        className="bg-card border border-black/10 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-accent-signature/40" />
    </div>
  </div>
);

export default ReportPeriodBar;
