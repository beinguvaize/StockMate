/**
 * DailySalesReport — the Business Report's per-day product/client breakdown,
 * lifted into its own report module. Same visual language (date presets,
 * clean header, expandable day cards) as BusinessReport.
 */
import React, { useState, useMemo } from 'react';
import {} from 'lucide-react';
import useReportData from './useReportData';
import ReportHeader from './ReportHeader';
import { isCountableSale, presetRange } from './reportUtils';
import DailySalesDetail from './DailySalesDetail';

const DailySalesReport = () => {
  const [preset, setPreset] = useState('TODAY');
  const [range, setRange] = useState(() => presetRange('TODAY'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const filters = useMemo(() => ({ dateRange: range }), [range]);

  const { data: salesRaw, loading } = useReportData({ table: 'sales', select: '*', dateColumn: 'date', filters });
  const sales = useMemo(() => salesRaw.filter(isCountableSale), [salesRaw]);
  const { data: clients } = useReportData({ table: 'clients', select: 'id, name' });
  const { data: vehicles } = useReportData({ table: 'vehicles', select: 'id, plateNumber, name' });
  const { data: users } = useReportData({ table: 'users', select: 'id, name, email' });

  const applyPreset = (id) => {
    setPreset(id);
    if (id !== 'CUSTOM') { setRange(presetRange(id)); setShowCustom(false); }
    else setShowCustom(true);
  };
  const applyCustom = () => {
    if (customStart && customEnd) { setRange({ start: customStart, end: customEnd }); setShowCustom(false); }
  };

  return (
    <div className="space-y-6 pb-16">
      <ReportHeader
        title="Daily Sales"
        subtitle={range.start === range.end ? range.start : `${range.start} → ${range.end}`}
        preset={preset}
        onPreset={applyPreset}
        showCustom={showCustom}
        customStart={customStart}
        customEnd={customEnd}
        setCustomStart={setCustomStart}
        setCustomEnd={setCustomEnd}
        onApplyCustom={applyCustom}
      />

      <DailySalesDetail sales={sales} clients={clients} vehicles={vehicles} users={users} loading={loading} />
    </div>
  );
};

export default DailySalesReport;
