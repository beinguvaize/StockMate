import React, { useMemo, useState } from 'react';
import { useLinkedRange } from '../../lib/linkedRange';
import { Seg, DateField } from './frame';

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
  // A link that names its period wins over the default preset.
  const linked = useLinkedRange();
  const [preset, setPreset] = useState(linked ? '' : defaultPreset);
  const [range, setRange] = useState(() => {
    if (linked) return { from: linked.from, to: linked.to };
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

// Drawn as on reports-19 to 28: preset pills left, from → to dates right.
const ReportPeriodBar = ({ presets, preset, range, setRange, setPreset, applyPreset }) => (
  <div className="no-print mb-3.5 flex flex-wrap items-center gap-2.5">
    <Seg ariaLabel="Period" value={preset} onChange={applyPreset}
      items={presets.map((pr) => ({ id: pr.id, label: pr.label }))} />
    <div className="ml-auto flex items-center gap-2">
      <DateField label="From" value={range.from} onChange={(v) => { setPreset(''); setRange((r) => ({ ...r, from: v })); }} />
      <span className="text-[13px] text-mute">→</span>
      <DateField label="To" value={range.to} onChange={(v) => { setPreset(''); setRange((r) => ({ ...r, to: v })); }} />
    </div>
  </div>
);

export default ReportPeriodBar;
