import React, { useRef, useState, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, Printer, ChevronDown } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { exportExcel, printReport, exportToCSV, letterheadFrom, safeFilename } from '../../lib/reportExport';

/**
 * Enterprise report frame: consistent header (title + period) + a letterhead-
 * aware export menu (Excel / PDF / CSV) wrapping any report body. The wrapped
 * body is captured for the PDF letterhead print.
 *
 * Props:
 *   title      — report name
 *   subtitle   — period / scope line
 *   filename   — base export filename (defaults from title)
 *   exportData — () => ({ columns:[{key,label,width}], rows:[...], total:{} })
 *                or () => ({ sheets:[{name,columns,rows,total}] })
 *   actions    — extra header nodes (filters, period tabs)
 *   children   — report body (captured for PDF)
 */
const ReportFrame = ({ title, subtitle, filename, exportData, actions, children }) => {
  const { businessProfile, currentTenant } = useTenant();
  const bodyRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const fname = safeFilename(filename || title || 'report');
  const lh = letterheadFrom(businessProfile || {}, currentTenant || {});

  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const resolve = () => {
    try { return (typeof exportData === 'function' ? exportData() : exportData) || {}; }
    catch { return {}; }
  };
  const doExcel = () => {
    const d = resolve();
    const sheets = d.sheets || [{ name: title, columns: d.columns, rows: d.rows, total: d.total }];
    exportExcel({ filename: fname, sheets });
    setOpen(false);
  };
  const doCSV = () => {
    const d = resolve();
    const first = d.sheets ? d.sheets[0] : d;
    exportToCSV({ filename: fname, columns: first.columns || [], data: first.rows || [], totals: first.total || null });
    setOpen(false);
  };
  const doPDF = () => {
    printReport({ html: bodyRef.current ? bodyRef.current.innerHTML : '', title, subtitle, letterhead: lh });
    setOpen(false);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap no-print">
        <div>
          <h1 className="text-2xl font-black font-sora text-ink-primary leading-none tracking-tight">
            {title}<span className="text-amber-500">.</span>
          </h1>
          {subtitle && <p className="text-[12px] font-medium text-gray-400 mt-1.5 font-mono">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {exportData && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setOpen(o => !o)}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 shadow-md shadow-amber-600/25 transition-colors"
              >
                <Download size={15} /> Export <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="absolute right-0 mt-2 w-44 rounded-xl bg-white border border-black/10 shadow-xl overflow-hidden z-30 py-1">
                  <button onClick={doExcel} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-ink-primary hover:bg-amber-50 transition-colors">
                    <FileSpreadsheet size={15} className="text-emerald-600" /> Excel (.xlsx)
                  </button>
                  <button onClick={doPDF} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-ink-primary hover:bg-amber-50 transition-colors">
                    <Printer size={15} className="text-amber-600" /> PDF / Print
                  </button>
                  <button onClick={doCSV} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-ink-primary hover:bg-amber-50 transition-colors">
                    <FileText size={15} className="text-gray-400" /> CSV
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div ref={bodyRef}>{children}</div>
    </div>
  );
};

export default ReportFrame;
