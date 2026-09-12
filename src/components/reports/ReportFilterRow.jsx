import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * Compact filter row for reports — a search box plus a set of small selects,
 * styled to match ReportHeader. Options are built by the caller from the rows
 * actually loaded, so a filter never offers a value that returns nothing.
 *
 *   <ReportFilterRow
 *     search={q} onSearch={setQ} searchPlaceholder="Bill no, customer or product"
 *     selects={[{ key:'method', label:'All payments', value:m, onChange:setM,
 *                 options:[{value:'CASH', label:'Cash (380)'}] }]}
 *     resultCount={12} totalCount={436} onClear={reset} />
 */
const ReportFilterRow = ({
  search = '', onSearch, searchPlaceholder = 'Search…',
  selects = [], resultCount = null, totalCount = null, onClear,
}) => {
  const active = (search && search.trim() !== '') || selects.some((s) => s.value && s.value !== 'ALL');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {onSearch && (
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="bg-card border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground
                       placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring w-56"
          />
        </div>
      )}

      {selects.map((s) => (
        <select
          key={s.key}
          value={s.value}
          onChange={(e) => s.onChange(e.target.value)}
          className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground
                     outline-none focus:ring-1 focus:ring-ring max-w-[190px]"
        >
          <option value="ALL">{s.label}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}

      {active && onClear && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
                     text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={12} /> Clear
        </button>
      )}

      {resultCount != null && totalCount != null && (
        <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
          {active ? `${resultCount} of ${totalCount}` : `${totalCount}`} sale{totalCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
};

export default ReportFilterRow;
