import React, { useState, useMemo } from 'react';
import { 
  Calendar, ChevronDown, X, Filter, Download, 
  Check, ArrowRight, RotateCcw, Share2, FileText
} from 'lucide-react';

/**
 * ReportFilterBar Component
 * 
 * Props:
 * @param {Object} filters - Current state of all filters
 * @param {Function} setFilters - State setter for filters
 * @param {Array} config - Configuration for dynamic filter chips [{ key, label, options: [{ value, label }] }]
 * @param {Function} onExport - Callback for CSV export
 * @param {string} lastUpdated - Timestamp of last data sync
 */

const ReportFilterBar = ({ 
  filters = {}, 
  setFilters = () => {}, 
  config = [], 
  onExport = () => {},
  lastUpdated = null
}) => {
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);

  // Date Presets Logic (Rule 5)
  const datePresets = [
    { label: 'Today', id: 'TODAY' },
    { label: 'This Week', id: 'WEEK' },
    { label: 'This Month', id: 'MONTH' },
    { label: 'This Quarter', id: 'QUARTER' },
    { label: 'This Year', id: 'YEAR' },
    { label: 'Custom', id: 'CUSTOM' }
  ];

  const handleDatePreset = (presetId) => {
    if (presetId === 'CUSTOM') {
      setShowCustomDate(true);
      return;
    }
    
    setShowCustomDate(false);
    const now = new Date();
    let start = new Date();
    let end = new Date();

    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    if (presetId === 'WEEK') {
      const day = now.getDay() || 7; 
      start.setDate(now.getDate() - day + 1);
      end.setDate(start.getDate() + 6);
    } else if (presetId === 'MONTH') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (presetId === 'QUARTER') {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      end = new Date(now.getFullYear(), (q + 1) * 3, 0);
    } else if (presetId === 'YEAR') {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
    }

    setFilters(prev => ({ 
      ...prev, 
      datePreset: presetId,
      dateRange: { 
        start: start.toISOString().split('T')[0], 
        end: end.toISOString().split('T')[0] 
      } 
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      datePreset: 'MONTH',
      dateRange: filters.dateRange, // Keep current date range by default
    });
  };

  const activeFilterCount = useMemo(() => {
    const internalKeys = ['datePreset', 'dateRange'];
    return Object.entries(filters).filter(([key, val]) => 
      !internalKeys.includes(key) && val !== 'ALL' && val !== undefined
    ).length;
  }, [filters]);

  return (
    <div className="flex flex-col gap-4 no-print">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/60 backdrop-blur-xl p-3 border border-white/20 rounded-[2.5rem] shadow-glass">
        
        {/* Left: Date Presets (Rule 5) */}
        <div className="flex items-center gap-1.5 p-1 bg-canvas border border-black/5 rounded-pill overflow-x-auto no-scrollbar max-w-full">
          {datePresets.map(preset => {
            const isActive = filters.datePreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handleDatePreset(preset.id)}
                className={`
                  px-6 py-2.5 rounded-full text-[10px] font-black tracking-widest uppercase transition-all whitespace-nowrap
                  ${isActive ? 'bg-ink-primary text-white shadow-xl scale-[1.02]' : 'text-gray-500 hover:text-ink-primary hover:bg-white/40'}
                `}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Right: Export & Last Updated (Rule 5) */}
        <div className="flex items-center gap-4 px-2">
          {lastUpdated && (
            <div className="hidden md:flex flex-col items-end opacity-40">
              <span className="text-[8px] font-black uppercase tracking-tighter">Last Synchronized</span>
              <span className="text-[10px] font-bold text-ink-primary">
                {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}

          <div className="h-10 w-px bg-black/5 mx-2" />

          <button 
            onClick={onExport}
            className="btn-signature !h-11 !px-8 !text-[10px] !rounded-pill shadow-xl hover:shadow-accent-signature/20 flex items-center gap-3 transition-all active:scale-95"
          >
            <span>EXPORT MATRIX</span>
            <div className="icon-nest !w-7 !h-7 bg-ink-primary/20 backdrop-blur-md">
              <Download size={14} className="text-ink-primary" />
            </div>
          </button>
        </div>
      </div>

      {/* Dynamic Filter Chips & Custom Date (Rule 5) */}
      {(showCustomDate || config.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 bg-white/40 backdrop-blur-md p-4 rounded-[2rem] border border-black/5 shadow-sm animate-in slide-in-from-top-4 duration-300">
          
          {/* Custom Date Range Pickers (Rule 5) */}
          {showCustomDate && (
            <div className="flex items-center gap-3 pr-4 border-r border-black/5">
              <div className="flex items-center gap-2 bg-white border border-black/5 px-4 py-2.5 rounded-pill shadow-sm">
                <Calendar size={14} className="text-accent-signature" />
                <input 
                  type="date" 
                  value={filters.dateRange?.start || ''} 
                  onChange={e => setFilters(prev => ({ ...prev, dateRange: { ...prev.dateRange, start: e.target.value } }))}
                  className="bg-transparent border-none text-[10px] font-black text-ink-primary outline-none uppercase font-mono"
                />
                <span className="text-gray-300 font-black px-2">/</span>
                <input 
                  type="date" 
                  value={filters.dateRange?.end || ''} 
                  onChange={e => setFilters(prev => ({ ...prev, dateRange: { ...prev.dateRange, end: e.target.value } }))}
                  className="bg-transparent border-none text-[10px] font-black text-ink-primary outline-none uppercase font-mono"
                />
              </div>
            </div>
          )}

          {/* Dynamic Filter Chips (Rule 5) */}
          <div className="flex flex-wrap items-center gap-2">
            {config.map(item => (
              <div key={item.key} className="relative">
                <button 
                  onClick={() => setActiveDropdown(activeDropdown === item.key ? null : item.key)}
                  className={`
                    flex items-center gap-3 px-6 py-2.5 rounded-pill border transition-all text-[10px] font-black tracking-widest uppercase
                    ${filters[item.key] && filters[item.key] !== 'ALL' 
                      ? 'bg-ink-primary text-white border-ink-primary shadow-lg' 
                      : 'bg-white border-black/5 text-gray-500 hover:border-black/10 hover:shadow-premium'}
                  `}
                >
                  {item.label}
                  {filters[item.key] && filters[item.key] !== 'ALL' ? (
                    <span className="ml-2 w-4 h-4 rounded-full bg-accent-signature text-ink-primary flex items-center justify-center text-[8px] font-black translate-x-1">
                      1
                    </span>
                  ) : <ChevronDown size={14} className="text-accent-signature" />}
                </button>

                {activeDropdown === item.key && (
                  <div className="absolute top-full left-0 mt-3 w-64 bg-white rounded-2xl border border-black/10 shadow-hover z-[100] p-4 animate-in fade-in zoom-in-95 duration-200">
                    <h4 className="text-[10px] font-black uppercase text-gray-400 mb-3 tracking-widest">Select {item.label}</h4>
                    <div className="space-y-1 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                      <button 
                        onClick={() => {
                          setFilters(prev => ({ ...prev, [item.key]: 'ALL' }));
                          setActiveDropdown(null);
                        }}
                        className="flex items-center justify-between w-full p-3 rounded-xl text-[10px] font-black uppercase hover:bg-canvas transition-all"
                      >
                        ALL {item.label}S
                        {filters[item.key] === 'ALL' && <Check size={14} className="text-accent-signature" />}
                      </button>
                      {item.options.map(opt => (
                        <button 
                          key={opt.value}
                          onClick={() => {
                            setFilters(prev => ({ ...prev, [item.key]: opt.value }));
                            setActiveDropdown(null);
                          }}
                          className={`
                            flex items-center justify-between w-full p-3 rounded-xl text-[10px] font-black uppercase hover:bg-canvas transition-all
                            ${filters[item.key] === opt.value ? 'bg-canvas text-ink-primary' : 'text-gray-500'}
                          `}
                        >
                          {opt.label}
                          {filters[item.key] === opt.value && <Check size={14} className="text-accent-signature" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Active Filter Pills (Rule 5) */}
          {activeFilterCount > 0 && (
            <>
              <div className="h-6 w-px bg-black/5 mx-2" />
              <button 
                onClick={clearAllFilters}
                className="flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest group"
              >
                <RotateCcw size={12} className="group-hover:rotate-[-90deg] transition-transform duration-500" />
                Reset Perspective
              </button>
            </>
          )}
        </div>
      )}

      {/* Backdrop for Dropdowns */}
      {activeDropdown && (
        <div 
          className="fixed inset-0 z-40 bg-transparent" 
          onClick={() => setActiveDropdown(null)}
        />
      )}
    </div>
  );
};

export default ReportFilterBar;
