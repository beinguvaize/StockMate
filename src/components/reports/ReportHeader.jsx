import React from 'react';
import { Download } from 'lucide-react';
import { PRESETS } from './reportUtils';
import { cn } from '../../lib/utils';
import { ReportTitle, ReportRow, Seg, DateField, ReportButton, CustomIcon, ErrorBlock } from './frame';

/**
 * ReportHeader: the light report header (web redesign, reports-04, 15, 16):
 * title + period line, Today · This Week · This Month · Quarter · This Year ·
 * Custom, Export. Custom opens a from / to row with Apply, as before.
 *
 * `error`: a load failed. The header stays (so the period can be changed),
 * the error state shows under it, and everything after the header in the
 * report is hidden, so no figure of a failed load is ever on screen.
 */
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
  actions = null,
  error = null,
  onRetry = null,
}) => (
  <div className={cn(error && '[&~*]:!hidden')} data-report-failed={error ? 'true' : undefined}>
    <ReportTitle
      title={title}
      subtitle={subtitle}
      actions={<>
        <Seg ariaLabel="Period" value={preset} onChange={onPreset}
          items={[...PRESETS.map((p) => ({ id: p.id, label: p.label })), { id: 'CUSTOM', label: 'Custom', icon: CustomIcon }]} />
        {actions}
        {onExport && !error && <ReportButton tone="ghost" icon={Download} onClick={onExport}>{exportLabel}</ReportButton>}
      </>}
    />
    {showCustom && (
      <ReportRow>
        <DateField label="From" value={customStart} onChange={setCustomStart} />
        <span className="text-[13px] text-mute">to</span>
        <DateField label="To" value={customEnd} onChange={setCustomEnd} />
        <ReportButton tone="primary" onClick={onApplyCustom}>Apply</ReportButton>
      </ReportRow>
    )}
    {error && <ErrorBlock title={`${title} could not load`} message={String(error)} onRetry={onRetry} />}
  </div>
);

export default ReportHeader;
