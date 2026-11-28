import React, { useRef } from 'react';
import { ReportTitle, ExportMenu } from './frame';
import { useTenant } from '../../context/TenantContext';
import { exportExcel, printReport, exportToCSV, letterheadFrom, safeFilename } from '../../lib/reportExport';

/**
 * Report frame (web redesign, reports-07): consistent header (title + period) + a letterhead-
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
  const fname = safeFilename(filename || title || 'report');
  const lh = letterheadFrom(businessProfile || {}, currentTenant || {});

  const resolve = () => {
    try { return (typeof exportData === 'function' ? exportData() : exportData) || {}; }
    catch { return {}; }
  };
  const doExcel = () => {
    const d = resolve();
    const sheets = d.sheets || [{ name: title, columns: d.columns, rows: d.rows, total: d.total }];
    exportExcel({ filename: fname, sheets });
  };
  const doCSV = () => {
    const d = resolve();
    const first = d.sheets ? d.sheets[0] : d;
    exportToCSV({ filename: fname, columns: first.columns || [], data: first.rows || [], totals: first.total || null });
  };
  const doPDF = () => {
    printReport({ html: bodyRef.current ? bodyRef.current.innerHTML : '', title, subtitle, letterhead: lh });
  };

  return (
    <div>
      <ReportTitle
        title={title}
        subtitle={subtitle}
        actions={<>
          {actions}
          {exportData && <ExportMenu onExcel={doExcel} onPDF={doPDF} onCSV={doCSV} />}
        </>}
      />
      <div ref={bodyRef}>{children}</div>
    </div>
  );
};

export default ReportFrame;
