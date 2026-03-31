import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ChevronUp, ChevronDown, MoreVertical, Columns, Search, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, 
  ArrowUpDown, Filter, Download, Info, AlertTriangle, User,
  Share2, Copy, ExternalLink
} from 'lucide-react';

/**
 * Premium ReportTable Component
 * 
 * Props:
 * @param {Array} columns - [{ key, label, width, sortable, render, align, type }]
 * @param {Array} data - The raw data array
 * @param {Boolean} loading - Shimmer skeleton state
 * @param {Object} totalsRow - Summary data for the bottom row
 * @param {Function} onRowClick - Click handler for side panel
 * @param {Object} defaultSort - { key, dir }
 * @param {String} searchTerm - External search term for highlighting
 */

const ReportTable = ({ 
  columns = [], 
  data = [], 
  loading = false, 
  totalsRow = null, 
  onRowClick = () => {}, 
  defaultSort = { key: '', dir: 'asc' },
  searchTerm: externalSearchTerm = ''
}) => {
  // State
  const [sortKey, setSortKey] = useState(defaultSort.key);
  const [sortDir, setSortDir] = useState(defaultSort.dir);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [localSearch, setLocalSearch] = useState('');
  const [visibleColumns, setVisibleColumns] = useState(columns.map(c => c.key));
  const [columnWidths, setColumnWidths] = useState(
    columns.reduce((acc, col) => ({ ...acc, [col.key]: col.width || 150 }), {})
  );
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0, row: null });

  const tableRef = useRef(null);
  const resizerRef = useRef({ key: null, startX: 0, startWidth: 0 });

  // Sync internal search with external if provided
  useEffect(() => {
    if (externalSearchTerm !== undefined) {
      setLocalSearch(externalSearchTerm);
    }
  }, [externalSearchTerm]);

  // Handle Outside Click for Column Toggle
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showColumnToggle && !e.target.closest('.column-toggle-container')) {
        setShowColumnToggle(false);
      }
      if (contextMenu.show) {
        setContextMenu({ show: false, x: 0, y: 0, row: null });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnToggle, contextMenu.show]);

  // Formatting Helpers (Rule 3)
  const formatCurrency = (val) => {
    if (val === 0 || val === null || val === undefined) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(val);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }); // Result: 15 Mar 2026
  };

  const formatNumber = (val) => {
    if (val === 0 || val === null || val === undefined) return '—';
    return new Intl.NumberFormat('en-IN').format(val);
  };

  // Sorting Logic
  const handleSort = (key) => {
    if (!columns.find(c => c.key === key)?.sortable) return;
    if (sortKey === key) {
      setSortDir(sortKey === key && sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc');
      if (sortDir === 'desc') setSortKey('');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Filter, Sort, Paginate (Rule 10)
  const filteredData = useMemo(() => {
    if (!localSearch) return data;
    const lowerSearch = localSearch.toLowerCase();
    return data.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(lowerSearch)
      )
    );
  }, [data, localSearch]);

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      const res = aVal > bVal ? 1 : -1;
      return sortDir === 'asc' ? res : -res;
    });
  }, [filteredData, sortKey, sortDir]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // Column Resizing Logic
  const onResizeStart = (e, key) => {
    e.preventDefault();
    resizerRef.current = {
      key,
      startX: e.clientX,
      startWidth: columnWidths[key]
    };
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
  };

  const onResizeMove = (e) => {
    const { key, startX, startWidth } = resizerRef.current;
    if (!key) return;
    const diff = e.clientX - startX;
    const newWidth = Math.max(80, startWidth + diff);
    setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
  };

  const onResizeEnd = () => {
    resizerRef.current = { key: null, startX: 0, startWidth: 0 };
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
  };

  // Highlight helper for Search (Rule 10)
  const highlightMatch = (text) => {
    if (!localSearch || !text) return text;
    const parts = String(text).split(new RegExp(`(${localSearch})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === localSearch.toLowerCase() 
        ? <span key={i} className="bg-accent-signature/30 font-bold">{part}</span> 
        : part
    );
  };

  // Right-Click Context Menu
  const handleContextMenu = (e, row) => {
    e.preventDefault();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      row
    });
  };

  const copyRowAsCSV = (row) => {
    const csv = visibleColumns.map(key => `"${String(row[key] || '').replace(/"/g, '""')}"`).join(',');
    navigator.clipboard.writeText(csv);
  };

  // Render Cell content based on type
  const renderCell = (row, col) => {
    if (col.render) return col.render(row[col.key], row);
    const val = row[col.key];
    
    if (col.type === 'currency') return formatCurrency(val);
    if (col.type === 'date') return formatDate(val);
    if (col.type === 'number') return formatNumber(val);
    
    return highlightMatch(val);
  };

  if (loading) {
    return (
      <div className="w-full bg-white rounded-bento border border-black/5 overflow-hidden shadow-premium animate-pulse">
        <div className="h-12 bg-canvas/50 border-b border-black/5" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-16 border-b border-black/5 flex items-center px-6 gap-4">
            <div className="h-4 w-24 bg-canvas rounded" />
            <div className="h-4 flex-1 bg-canvas rounded" />
            <div className="h-4 w-32 bg-canvas rounded" />
            <div className="h-4 w-12 bg-canvas rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full h-full">
      {/* Table Controls (Search + Column Toggle) */}
      <div className="flex justify-between items-center no-print">
        <div className="relative group w-full max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-accent-signature transition-colors" size={16} />
          <input 
            type="text" 
            placeholder={`Search across ${sortedData.length} records...`}
            className="w-full bg-white border border-black/5 rounded-xl py-3 pl-12 pr-4 text-xs font-bold focus:ring-4 focus:ring-accent-signature/10 transition-all outline-none"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
          {localSearch && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 pointer-events-none uppercase">
              {sortedData.length} Results
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 relative column-toggle-container">
          <button 
            onClick={() => setShowColumnToggle(!showColumnToggle)}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-black/5 rounded-pill text-xs font-black text-ink-primary hover:bg-canvas transition-all shadow-sm"
          >
            <Columns size={14} className="text-accent-signature" />
            COLUMNS
          </button>

          {showColumnToggle && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl border border-black/10 shadow-hover z-[100] p-4 animate-in fade-in zoom-in-95 duration-200">
              <h4 className="text-[10px] font-black uppercase text-gray-400 mb-3 tracking-widest">Toggle Columns</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {columns.map(col => (
                  <label key={col.key} className="flex items-center gap-3 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-ink-primary focus:ring-accent-signature"
                      checked={visibleColumns.includes(col.key)}
                      onChange={() => {
                        if (visibleColumns.includes(col.key)) {
                          setVisibleColumns(visibleColumns.filter(k => k !== col.key));
                        } else {
                          setVisibleColumns([...visibleColumns, col.key]);
                        }
                      }}
                    />
                    <span className="text-xs font-bold text-ink-primary group-hover:text-ink-secondary transition-colors uppercase tracking-tight">
                      {col.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Table Container */}
      <div 
        ref={tableRef}
        className="relative flex-1 bg-white rounded-[2rem] border border-black/5 shadow-premium overflow-auto custom-scrollbar group/table"
      >
        <table className="w-full border-separate border-spacing-0 text-left min-w-full">
          {/* Sticky Header */}
          <thead className="sticky top-0 z-30 bg-white/80 backdrop-blur-3xl shadow-sm border-b border-black/5">
            <tr>
              {columns.filter(c => visibleColumns.includes(c.key)).map((col, i) => (
                <th 
                  key={col.key}
                  className={`
                    group px-6 py-5 text-[10px] font-black uppercase text-gray-500 tracking-widest cursor-default relative select-none
                    ${i === 0 ? 'sticky left-0 z-40 bg-white/95 border-r border-black/[0.03]' : ''}
                    ${col.sortable ? 'cursor-pointer hover:text-ink-primary' : ''}
                  `}
                  style={{ width: columnWidths[col.key], minWidth: columnWidths[col.key] }}
                  onClick={() => handleSort(col.key)}
                >
                  <div className={`flex items-center gap-2 ${col.align === 'right' ? 'justify-end' : ''}`}>
                    {col.label}
                    {col.sortable && (
                      <div className={`transition-all ${sortKey === col.key ? 'text-accent-signature scale-110' : 'opacity-0 group-hover:opacity-100 text-gray-300'}`}>
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? <ChevronUp size={14} /> : sortDir === 'desc' ? <ChevronDown size={14} /> : <ArrowUpDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} />
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Column Resizer */}
                  <div 
                    onMouseDown={(e) => onResizeStart(e, col.key)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 cursor-col-resize hover:bg-accent-signature/50 transition-colors z-50 border-r border-black/5"
                  />
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-black/[0.03]">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="py-32 text-center">
                  <div className="flex flex-col items-center justify-center opacity-20 group-hover:opacity-40 transition-opacity">
                    <Info size={48} strokeWidth={1.5} className="mb-4" />
                    <p className="text-sm font-bold uppercase tracking-widest">No matching records found</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <tr 
                  key={rowIndex}
                  onContextMenu={(e) => handleContextMenu(e, row)}
                  onClick={() => onRowClick(row)}
                  className={`
                    group/row transition-all cursor-pointer select-none
                    ${rowIndex % 2 === 1 ? 'bg-canvas/[0.02]' : 'bg-transparent'}
                    hover:bg-accent-signature/[0.04] active:bg-accent-signature/[0.08]
                  `}
                >
                  {columns.filter(c => visibleColumns.includes(c.key)).map((col, colIndex) => (
                    <td 
                      key={col.key}
                      className={`
                        px-6 py-4.5 text-[12px] font-bold text-ink-primary whitespace-nowrap border-x border-transparent
                        ${colIndex === 0 ? 'sticky left-0 z-20 bg-white group-hover/row:bg-[#FAF9F5] transition-colors border-r border-black/[0.03]' : ''}
                        ${col.align === 'right' ? 'text-right tabular-nums' : ''}
                      `}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>

          {/* Totals Row */}
          {totalsRow && sortedData.length > 0 && (
            <tfoot className="sticky bottom-0 z-30 bg-ink-primary text-white shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
              <tr>
                {columns.filter(c => visibleColumns.includes(c.key)).map((col, i) => (
                  <td 
                    key={col.key}
                    className={`
                      px-6 py-5 text-[12px] font-black uppercase tracking-tight
                      ${i === 0 ? 'sticky left-0 z-40 bg-ink-primary' : ''}
                      ${col.align === 'right' ? 'text-right tabular-nums' : ''}
                    `}
                  >
                    {i === 0 ? 'TOTALS' : renderCell(totalsRow, col)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>

        {/* Context Menu */}
        {contextMenu.show && (
          <div 
            className="fixed bg-ink-primary text-white rounded-2xl shadow-2xl z-[1000] p-1.5 w-48 border border-white/10 animate-in fade-in zoom-in-95 duration-150"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button 
              onClick={() => {
                onRowClick(contextMenu.row);
                setContextMenu({ ...contextMenu, show: false });
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-[10px] font-black hover:bg-white/10 transition-colors uppercase"
            >
              <ExternalLink size={14} className="text-accent-signature" />
              View Details
            </button>
            <button 
              onClick={() => {
                copyRowAsCSV(contextMenu.row);
                setContextMenu({ ...contextMenu, show: false });
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-[10px] font-black hover:bg-white/10 transition-colors uppercase"
            >
              <Copy size={14} className="text-blue-400" />
              Copy row as CSV
            </button>
            <div className="h-px bg-white/10 my-1 mx-2" />
            <button 
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-[10px] font-black hover:bg-white/10 transition-colors uppercase"
            >
              <Share2 size={14} className="text-purple-400" />
              Share Link
            </button>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white px-8 py-5 rounded-[2rem] border border-black/5 shadow-sm no-print gap-4">
        <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
          Showing <span className="text-ink-primary">{(page - 1) * pageSize + 1}</span>–<span className="text-ink-primary">{Math.min(page * pageSize, sortedData.length)}</span> of <span className="text-ink-primary">{sortedData.length}</span> records
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Rows:</span>
            <select 
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-canvas border border-black/5 rounded-lg px-2 py-1 text-[10px] font-black text-ink-primary outline-none cursor-pointer"
            >
              {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button 
              disabled={page === 1}
              onClick={() => setPage(1)}
              className="p-2 rounded-full hover:bg-canvas disabled:opacity-20 transition-all text-ink-primary"
            >
              <ChevronsLeft size={16} />
            </button>
            <button 
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="p-2 rounded-full hover:bg-canvas disabled:opacity-20 transition-all text-ink-primary"
            >
              <ChevronLeft size={16} />
            </button>
            
            <div className="flex items-center gap-2">
              <input 
                type="number"
                value={page}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 1 && val <= totalPages) setPage(val);
                }}
                className="w-10 text-center bg-canvas border border-black/5 rounded-lg py-1.5 text-[10px] font-black text-ink-primary outline-none font-mono"
              />
              <span className="text-[10px] font-bold text-gray-400 uppercase whitespace-nowrap">of {totalPages || 1}</span>
            </div>

            <button 
              disabled={page === totalPages || totalPages === 0}
              onClick={() => setPage(page + 1)}
              className="p-2 rounded-full hover:bg-canvas disabled:opacity-20 transition-all text-ink-primary"
            >
              <ChevronRight size={16} />
            </button>
            <button 
              disabled={page === totalPages || totalPages === 0}
              onClick={() => setPage(totalPages)}
              className="p-2 rounded-full hover:bg-canvas disabled:opacity-20 transition-all text-ink-primary"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportTable;
