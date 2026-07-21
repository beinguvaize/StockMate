import { useState, useMemo } from 'react';
import { presetRange } from './reportUtils';

/**
 * Date-window state for a report: preset, resolved range, and custom-range
 * plumbing, in the shape ReportHeader already expects.
 *
 * Exists because several reports had no date state at all — they passed
 * `dateColumn` to useReportData without `filters`, which makes the date column
 * inert and reads the entire table on every load. That was one of the drivers
 * behind the Supabase Disk IO warning.
 *
 *   const w = useDateWindow('YEAR');
 *   useReportData({ table: 'sales', dateColumn: 'date', filters: w.filters });
 *   <ReportHeader {...w.headerProps} title="…" />
 */
export default function useDateWindow(initialPreset = 'YEAR') {
  const [preset, setPreset] = useState(initialPreset);
  const [range, setRange] = useState(() => presetRange(initialPreset));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };

  const applyCustom = () => {
    if (customStart && customEnd) {
      setRange({ start: customStart, end: customEnd });
      setShowCustom(false);
    }
  };

  // Memoised: useReportData keys its fetch off JSON.stringify(filters), so a
  // fresh object each render would refetch on every render.
  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const subtitle = range.start === range.end
    ? range.start
    : `${range.start} → ${range.end}`;

  return {
    preset, range, filters, subtitle,
    headerProps: {
      preset,
      onPreset: applyPreset,
      showCustom,
      customStart,
      customEnd,
      setCustomStart,
      setCustomEnd,
      onApplyCustom: applyCustom,
      subtitle,
    },
  };
}
