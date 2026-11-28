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
    <div className="no-print mb-3.5 flex flex-wrap items-center gap-2.5">
      {onSearch && (
        <label className="relative">
          <Search size={14} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-[34px] w-[260px] rounded-pill bg-well pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]"
          />
        </label>
      )}

      {selects.map((s) => (
        <select
          key={s.key}
          value={s.value}
          aria-label={s.label}
          onChange={(e) => s.onChange(e.target.value)}
          className="h-[34px] max-w-[200px] cursor-pointer rounded-pill bg-surface pl-3.5 pr-2 font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-amber)]"
        >
          <option value="ALL">{s.label}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}

      {active && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="m-press inline-flex items-center gap-1 rounded-pill px-2 py-1.5 font-tight text-[13px] font-semibold text-amber-text hover:underline"
        >
          <X size={13} aria-hidden="true" /> Clear
        </button>
      )}

      {resultCount != null && totalCount != null && (
        <span className="ml-auto text-[12.5px] text-mute tabular-nums">
          {active ? `${resultCount} of ${totalCount}` : `${totalCount}`} sale{totalCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
};

export default ReportFilterRow;
