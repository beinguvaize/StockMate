import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ChevronUp, ChevronDown, Columns, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, Share2, Copy, ExternalLink,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { filterRows, sortRows, nextSort, pageRows, pageCount, recordsLine } from '../../lib/reportsView';
import { ReportButton, EmptyBlock, LoadingRows } from './frame';

/**
 * The report table (web redesign, reports-08 and on): search, column toggle,
 * sortable and resizable heads, right-click menu, totals row and paging, as
 * before. Search / sort / paging live in lib/reportsView, moved unchanged.
 *
 * @param {Array} columns - [{ key, label, width, sortable, render, align, type, defaultHidden }]
 * @param {Array} data
 * @param {Boolean} loading
 * @param {Object} totalsRow
 * @param {Function} onRowClick
 * @param {Object} defaultSort - { key, dir }
 * @param {String} searchTerm - external search term
 */
const ReportTable = ({
  columns = [],
  data = [],
  loading = false,
  totalsRow = null,
  onRowClick = () => {},
  defaultSort = { key: '', dir: 'asc' },
  searchTerm: externalSearchTerm = '',
}) => {
  const [sort, setSort] = useState({ key: defaultSort.key, dir: defaultSort.dir });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [localSearch, setLocalSearch] = useState('');
  const [visibleColumns, setVisibleColumns] = useState(columns.filter((c) => !c.defaultHidden).map((c) => c.key));
  const [columnWidths, setColumnWidths] = useState(
    columns.reduce((acc, col) => ({ ...acc, [col.key]: col.width || 150 }), {}),
  );
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0, row: null });
  const resizerRef = useRef({ key: null, startX: 0, startWidth: 0 });

  useEffect(() => {
    if (externalSearchTerm !== undefined) setLocalSearch(externalSearchTerm);
  }, [externalSearchTerm]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showColumnToggle && !e.target.closest('.column-toggle-container')) setShowColumnToggle(false);
      if (contextMenu.show && !e.target.closest('.report-row-menu')) setContextMenu({ show: false, x: 0, y: 0, row: null });
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnToggle, contextMenu.show]);

  // Formatting, as before: zero / empty reads as a dash.
  const formatCurrency = (val) => {
    if (val === 0 || val === null || val === undefined) return '—';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
  };
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const formatNumber = (val) => {
    if (val === 0 || val === null || val === undefined) return '—';
    return new Intl.NumberFormat('en-IN').format(val);
  };

  const handleSort = (key) => {
    if (!columns.find((c) => c.key === key)?.sortable) return;
    setSort((s) => nextSort(s, key));
  };

  const filteredData = useMemo(() => filterRows(data, localSearch), [data, localSearch]);
  const sortedData = useMemo(() => sortRows(filteredData, sort.key, sort.dir), [filteredData, sort]);
  const paginatedData = useMemo(() => pageRows(sortedData, page, pageSize), [sortedData, page, pageSize]);
  const totalPages = pageCount(sortedData.length, pageSize);

  const onResizeMove = (e) => {
    const { key, startX, startWidth } = resizerRef.current;
    if (!key) return;
    setColumnWidths((prev) => ({ ...prev, [key]: Math.max(80, startWidth + (e.clientX - startX)) }));
  };
  const onResizeEnd = () => {
    resizerRef.current = { key: null, startX: 0, startWidth: 0 };
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
  };
  const onResizeStart = (e, key) => {
    e.preventDefault();
    e.stopPropagation();
    resizerRef.current = { key, startX: e.clientX, startWidth: columnWidths[key] };
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
  };

  // Search highlight, as before (the search text is used as a pattern).
  const highlightMatch = (text) => {
    if (!localSearch || !text) return text;
    const parts = String(text).split(new RegExp(`(${localSearch})`, 'gi'));
    return parts.map((part, i) => (part.toLowerCase() === localSearch.toLowerCase()
      ? <mark key={i} className="rounded-[3px] bg-amber-soft px-px text-ink">{part}</mark>
      : part));
  };

  const copyRowAsCSV = (row) => {
    const csv = visibleColumns.map((key) => `"${String(row[key] || '').replace(/"/g, '""')}"`).join(',');
    navigator.clipboard.writeText(csv);
  };

  // A render() that returns a bare number still goes through the type's
  // formatter, so derived values never show as 12593.600000000002.
  const renderCell = (row, col) => {
    if (col.render) {
      const out = col.render(row[col.key], row);
      if (typeof out === 'number') {
        if (col.type === 'currency') return formatCurrency(out);
        if (col.type === 'number') return formatNumber(out);
      }
      return out;
    }
    const val = row[col.key];
    if (col.type === 'currency') return formatCurrency(val);
    if (col.type === 'date') return formatDate(val);
    if (col.type === 'number') return formatNumber(val);
    return highlightMatch(val);
  };

  if (loading) return <LoadingRows rows={8} />;

  const shown = columns.filter((c) => visibleColumns.includes(c.key));
  const right = (col) => col.align === 'right';
  const from = sortedData.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, sortedData.length);
  const pgBtn = 'm-press grid h-[30px] w-[30px] place-items-center rounded-pill text-ink-2 hover:bg-tile disabled:opacity-30 disabled:pointer-events-none';

  return (
    <div className="flex w-full flex-col">
      {/* Search + columns */}
      <div className="no-print flex flex-wrap items-center gap-2.5 border-b border-line px-3.5 py-3">
        <label className="relative w-full max-w-[300px]">
          <Search size={14} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" aria-hidden="true" />
          <input type="text" value={localSearch} onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={`Search across ${sortedData.length} records…`}
            className="h-[34px] w-full rounded-pill bg-well pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
        </label>
        {localSearch && <span className="text-[12px] text-mute tabular-nums">{sortedData.length} results</span>}
        <div className="flex-1" />
        <div className="column-toggle-container relative">
          <ReportButton tone="ghost" icon={Columns} aria-expanded={showColumnToggle} onClick={() => setShowColumnToggle((v) => !v)}>
            Toggle columns
          </ReportButton>
          {showColumnToggle && (
            <div className="menu-pop absolute right-0 top-full z-[60] mt-2 w-60 rounded-[14px] bg-surface p-3 shadow-[0_0_0_1px_rgba(17,20,24,.06),0_18px_40px_-14px_rgba(17,20,24,.35)]">
              <p className="px-1 pb-2 font-tight text-[10.5px] font-semibold uppercase tracking-[0.07em] text-mute">Columns</p>
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {columns.map((col) => (
                  <label key={col.key} className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-1.5 py-1.5 text-[13px] text-ink hover:bg-tile">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--color-ink)]"
                      checked={visibleColumns.includes(col.key)}
                      onChange={() => setVisibleColumns(visibleColumns.includes(col.key)
                        ? visibleColumns.filter((k) => k !== col.key)
                        : [...visibleColumns, col.key])} />
                    {col.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative w-full overflow-auto">
        <table className="report-table w-full min-w-full border-collapse text-left text-[13.5px] text-ink">
          <thead className="sticky top-0 z-20">
            <tr>
              {shown.map((col, i) => {
                const sorted = sort.key === col.key && sort.dir;
                return (
                  <th key={col.key}
                    aria-sort={sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn('group relative select-none whitespace-nowrap border-b border-line bg-tile px-3.5 py-2.5 font-tight text-[12px] font-semibold text-mute',
                      i === 0 && 'sticky left-0 z-30',
                      col.sortable && 'cursor-pointer hover:text-ink',
                      right(col) && 'text-right')}
                    style={{ width: columnWidths[col.key], minWidth: columnWidths[col.key] }}
                    onClick={() => handleSort(col.key)}>
                    <span className={cn('inline-flex items-center gap-1', right(col) && 'flex-row-reverse')}>
                      {col.label}
                      {col.sortable && (
                        <span className={cn('transition-opacity duration-(--dur-hover)', sorted ? 'text-amber' : 'opacity-0 group-hover:opacity-100 text-faint')} aria-hidden="true">
                          {sorted ? (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ArrowUpDown size={11} />}
                        </span>
                      )}
                    </span>
                    <span onMouseDown={(e) => onResizeStart(e, col.key)} aria-hidden="true"
                      className="absolute right-0 top-1/2 h-1/2 w-1.5 -translate-y-1/2 cursor-col-resize border-r border-line hover:bg-amber/40" />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr><td colSpan={shown.length || 1}><EmptyBlock compact text="No matching records found" /></td></tr>
            ) : paginatedData.map((row, rowIndex) => (
              <tr key={rowIndex}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ show: true, x: e.clientX, y: e.clientY, row }); }}
                onClick={() => onRowClick(row)}
                className="group/row cursor-pointer [&>td]:transition-colors [&>td]:duration-(--dur-press) hover:[&>td]:bg-tile">
                {shown.map((col, colIndex) => (
                  <td key={col.key}
                    className={cn('whitespace-nowrap border-b border-sep bg-surface px-3.5 py-[11px] align-middle tabular-nums',
                      colIndex === 0 && 'sticky left-0 z-10 font-tight font-semibold',
                      right(col) && 'text-right font-tight font-medium')}>
                    {renderCell(row, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totalsRow && sortedData.length > 0 && (
            <tfoot className="sticky bottom-0 z-20">
              <tr>
                {shown.map((col, i) => (
                  <td key={col.key}
                    className={cn('whitespace-nowrap border-t border-line bg-tile px-3.5 py-[11px] font-tight text-[13.5px] font-semibold text-ink tabular-nums',
                      i === 0 && 'sticky left-0 z-30', right(col) && 'text-right')}>
                    {i === 0 ? 'Total' : renderCell(totalsRow, col)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>

        {contextMenu.show && (
          <div role="menu" className="report-row-menu menu-pop fixed z-[1000] w-52 rounded-[14px] bg-surface p-1.5 shadow-[0_0_0_1px_rgba(17,20,24,.06),0_18px_40px_-14px_rgba(17,20,24,.35)]"
            style={{ top: contextMenu.y, left: contextMenu.x, '--menu-origin': 'top left' }}>
            {[
              { label: 'View details', icon: ExternalLink, run: () => onRowClick(contextMenu.row) },
              { label: 'Copy row as CSV', icon: Copy, run: () => copyRowAsCSV(contextMenu.row) },
              { label: 'Share link', icon: Share2, run: () => {} },
            ].map(({ label, icon: Icon, run }) => (
              <button data-card key={label} type="button" role="menuitem"
                onClick={() => { run(); setContextMenu({ show: false, x: 0, y: 0, row: null }); }}
                className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left font-tight text-[13px] font-semibold text-ink hover:bg-tile">
                <Icon size={15} strokeWidth={1.9} className="text-ink-2" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Paging */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-line px-3.5 py-3 text-[13px] text-body">
        <span className="tabular-nums">
          {sortedData.length > 0 ? `${from}–${to} · ` : ''}{recordsLine(paginatedData.length, sortedData.length)}
        </span>
        <div className="flex items-center gap-1.5">
          <label className="mr-1.5 inline-flex items-center gap-1.5 rounded-pill px-3 py-1 font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
            <em className="not-italic font-medium text-mute">Rows</em>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="cursor-pointer bg-transparent outline-none tabular-nums">
              {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <button type="button" aria-label="First page" disabled={page === 1} onClick={() => setPage(1)} className={pgBtn}><ChevronsLeft size={16} /></button>
          <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(page - 1)} className={pgBtn}><ChevronLeft size={16} /></button>
          <span className="mx-1 inline-flex items-center gap-1.5 tabular-nums">
            Page
            <input type="number" aria-label="Page" value={page}
              onChange={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= totalPages) setPage(v); }}
              className="h-[30px] w-11 rounded-[8px] bg-surface text-center text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none" />
            of {totalPages || 1}
          </span>
          <button type="button" aria-label="Next page" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(page + 1)} className={pgBtn}><ChevronRight size={16} /></button>
          <button type="button" aria-label="Last page" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(totalPages)} className={pgBtn}><ChevronsRight size={16} /></button>
        </div>
      </div>
    </div>
  );
};

export default ReportTable;
