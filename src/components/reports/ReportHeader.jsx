import React from 'react';
import { Download } from 'lucide-react';
import { PRESETS } from './reportUtils';
import { ReportTitle, ReportRow, Seg, DateField, ReportButton, CustomIcon } from './frame';

/**
 * ReportHeader: the light report header (web redesign, reports-04, 15, 16):
 * title + period line, Today · This Week · This Month · Quarter · This Year ·
 * Custom, Export. Custom opens a from / to row with Apply, as before.
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
}) => (
  <div>
    <ReportTitle
      title={title}
      subtitle={subtitle}
      actions={<>
        <Seg ariaLabel="Period" value={preset} onChange={onPreset}
          items={[...PRESETS.map((p) => ({ id: p.id, label: p.label })), { id: 'CUSTOM', label: 'Custom', icon: CustomIcon }]} />
        {actions}
        {onExport && <ReportButton tone="ghost" icon={Download} onClick={onExport}>{exportLabel}</ReportButton>}
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
  </div>
);

export default ReportHeader;
