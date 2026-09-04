import React from 'react';
import { Calendar, Download } from 'lucide-react';
import { PRESETS } from './reportUtils';

/**
 * ReportHeader — minimal shared report header: quiet title + period
 * subtitle, segmented preset control, optional custom range row, Export.
 * Theme tokens only. Replaces the loud per-file header (font-semibold title
 * with accent dot, bordered pill rows) across the preset-based reports.
 */
const seg = (active) =>
  `px-3 py-1.5 rounded-md text-[11px] transition-colors ${
    active
      ? 'bg-card text-foreground font-semibold shadow-sm'
      : 'text-muted-foreground font-medium hover:text-foreground'}`;

const ReportHeader = ({
  title,
  subtitle,
  preset,
  onPreset,
  showCustom = false,
  customStart = '',
  customEnd = '',
  setCustomStart,
  setCustomEnd,
  onApplyCustom,
  onExport,
  exportLabel = 'Export',
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-base font-semibold text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center bg-muted rounded-lg p-0.5">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => onPreset(p.id)} className={seg(preset === p.id)}>
              {p.label}
            </button>
          ))}
          <button onClick={() => onPreset('CUSTOM')} className={`flex items-center gap-1 ${seg(preset === 'CUSTOM')}`}>
            <Calendar size={11} /> Custom
          </button>
        </div>
        {onExport && (
          <button onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-[11px] font-medium text-foreground hover:bg-muted/60 transition-colors">
            <Download size={12} /> {exportLabel}
          </button>
        )}
      </div>
    </div>

    {showCustom && (
      <div className="flex items-center gap-2 flex-wrap">
        <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
        <span className="text-muted-foreground text-xs">to</span>
        <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
        <button onClick={onApplyCustom}
          className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
          Apply
        </button>
      </div>
    )}
  </div>
);

export default ReportHeader;
