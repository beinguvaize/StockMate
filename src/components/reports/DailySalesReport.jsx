/**
 * DailySalesReport — the Business Report's per-day product/client breakdown,
 * lifted into its own report module. Same visual language (date presets,
 * clean header, expandable day cards) as BusinessReport.
 */
import React, { useState, useMemo } from 'react';
import { Calendar } from 'lucide-react';
import useReportData from './useReportData';
import { isCountableSale, PRESETS, presetRange } from './reportUtils';
import { DailySalesDetail } from './BusinessReport';

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-base font-semibold text-foreground tracking-tight">
            Daily Sales
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center bg-muted rounded-lg p-0.5 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-md text-[11px] transition-colors ${
                preset === p.id ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'
              }`}>{p.label}</button>
          ))}
          <button onClick={() => applyPreset('CUSTOM')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] transition-colors ${
              preset === 'CUSTOM' ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground font-medium hover:text-foreground'
            }`}>
            <Calendar size={11} /> Custom
          </button>
        </div>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={14} className="text-muted-foreground shrink-0" />
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
          <span className="text-muted-foreground text-xs font-semibold">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
          <button onClick={applyCustom}
            className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">Apply</button>
        </div>
      )}

      <DailySalesDetail sales={sales} clients={clients} vehicles={vehicles} users={users} loading={loading} />
    </div>
  );
};

export default DailySalesReport;
