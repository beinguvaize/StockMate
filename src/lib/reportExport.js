/**
 * Report export utilities — pure JS, no dependencies.
 *
 * Two paths:
 *   - exportToCSV(): serialize the active tab's columns + data to a downloadable .csv
 *   - exportToPDF(): trigger window.print() so the user saves as PDF via browser
 *                    (the app already uses .no-print classes so the layout is
 *                    print-ready by design)
 */

// --- CSV helpers ---

/**
 * Escape a cell for RFC 4180 CSV. Wrap in quotes if it contains comma, quote,
 * newline, or leading/trailing whitespace. Double any embedded quotes.
 */
const escapeCSV = (val) => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s === '') return '';
  const needsQuote = /[",\n\r]/.test(s) || /^\s|\s$/.test(s);
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Resolve a column value for CSV. Prefers raw data over rendered JSX since
 * `render()` returns React elements (not useful in a spreadsheet).
 */
const cellForCSV = (column, row) => {
  const raw = row?.[column.key];
  // Currency/numeric/date types: use the raw value; the spreadsheet app formats.
  if (column.type === 'currency' || column.type === 'number') return raw ?? '';
  if (column.type === 'date') return raw ?? '';
  // If there's a primitive raw value, use it directly.
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return raw;
  }
  // Objects / arrays → JSON so at least the value is inspectable.
  try { return JSON.stringify(raw); } catch { return String(raw); }
};

/**
 * Build a CSV string from columns + rows. Skips columns whose key begins with
 * '_' (convention for UI-only synthetic columns).
 */
export const buildCSV = ({ columns = [], data = [], totals = null }) => {
  const cols = columns.filter((c) => c.key && !String(c.key).startsWith('_'));
  const header = cols.map((c) => escapeCSV(c.label || c.key)).join(',');
  const rows = data.map((row) =>
    cols.map((col) => escapeCSV(cellForCSV(col, row))).join(',')
  );

  let footer = '';
  if (totals && typeof totals === 'object') {
    const totalsRow = cols
      .map((col, idx) => {
        if (idx === 0) return escapeCSV('TOTAL');
        const v = totals[col.key];
        return v === undefined ? '' : escapeCSV(v);
      })
      .join(',');
    footer = '\n' + totalsRow;
  }

  return [header, ...rows].join('\n') + footer + '\n';
};

/**
 * Trigger a browser download of a CSV blob.
 * Prepends a UTF-8 BOM so Excel opens it correctly with non-ASCII text (₹, etc.).
 */
export const downloadCSV = (filename, csvString) => {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release blob asynchronously — some browsers abort the download otherwise.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Convenience wrapper: build + download in one call.
 */
export const exportToCSV = ({ filename, columns, data, totals }) => {
  const csv = buildCSV({ columns, data, totals });
  downloadCSV(filename, csv);
};

// --- PDF helper (browser print → Save as PDF) ---

/**
 * Trigger the browser print dialog. Because the app uses .no-print classes on
 * navigation/controls and keeps the content grid print-visible, the output is
 * clean PDF-ready markup without extra deps.
 *
 * Optionally sets document.title before printing so the default PDF filename
 * matches the report.
 */
export const exportToPDF = ({ title } = {}) => {
  const prevTitle = document.title;
  if (title) document.title = title;
  try {
    // requestAnimationFrame gives the DOM a tick to stabilize before print()
    // fires a synchronous layout freeze.
    requestAnimationFrame(() => window.print());
  } finally {
    // Restore the title after a short delay (print() is synchronous in most
    // browsers, but Safari fires async).
    setTimeout(() => {
      document.title = prevTitle;
    }, 2000);
  }
};

/**
 * Sanitize a string for filename use. Replaces unsafe chars with '-'.
 */
export const safeFilename = (s) =>
  String(s || 'report')
    .trim()
    .replace(/[\/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_');

// --- Letterhead + Excel + framed-PDF (enterprise) ---------------------------

const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Build a letterhead object from the business profile / tenant. All optional. */
export const letterheadFrom = (profile = {}, tenant = {}) => ({
  name:    profile.businessName || profile.name || tenant.name || 'Company',
  gstin:   profile.gstin || profile.gst_number || profile.gstNumber || '',
  address: profile.address || profile.businessAddress || '',
  phone:   profile.phone || profile.contact || '',
  email:   profile.email || '',
});

/**
 * Open a print window with a company letterhead + the report HTML, styled for
 * A4. Vector text, real page margins — saves as a clean PDF from the browser
 * dialog. `html` is usually a cloned report node's innerHTML/outerHTML.
 */
export const printReport = ({ html = '', title = 'Report', subtitle = '', letterhead = {} }) => {
  const w = window.open('', '_blank', 'width=900,height=1200');
  if (!w) { alert('Pop-up blocked — allow pop-ups to export PDF.'); return; }
  const lh = letterhead;
  const now = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const metaLines = [lh.address, lh.gstin && ('GSTIN: ' + lh.gstin), [lh.phone, lh.email].filter(Boolean).join(' · ')]
    .filter(Boolean).map(esc).join('<br/>');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>
  @page{size:A4;margin:14mm 12mm}
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Inter',Segoe UI,sans-serif;color:#16151A;margin:0;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .lh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #16151A;padding-bottom:10px;margin-bottom:6px}
  .lh .co{font-size:18px;font-weight:800;letter-spacing:-.02em}
  .lh .meta{font-size:10px;color:#555;margin-top:3px;line-height:1.5}
  .title{font-size:15px;font-weight:800;margin:12px 0 2px}
  .sub{font-size:11px;color:#666;margin-bottom:12px}
  .genat{font-size:9px;color:#999;text-align:right}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #eee}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888;border-bottom:1.5px solid #ddd}
  td[align=right],th[align=right],.text-right{text-align:right}
  tfoot td,.total-row td,.total-row{font-weight:800;border-top:1.5px solid #16151A}
  .foot{margin-top:18px;border-top:1px solid #ddd;padding-top:6px;font-size:9px;color:#999;display:flex;justify-content:space-between}
  button,select,input,.no-print{display:none !important}
</style></head><body>
  <div class="lh"><div><div class="co">${esc(lh.name || 'Company')}</div><div class="meta">${metaLines}</div></div><div class="meta"><div class="genat">Generated ${esc(now)}</div></div></div>
  <div class="title">${esc(title)}</div>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  <div>${html}</div>
  <div class="foot"><span>${esc(lh.name || '')}</span><span>Confidential</span></div>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)};window.onafterprint=function(){window.close()}<\/script>
</body></html>`);
  w.document.close();
};

/**
 * Export one or more sheets to a real .xlsx file.
 * sheets: [{ name, columns:[{key,label,width}], rows:[{...}], total:{...} }]
 * If columns omitted, inferred from the first row's keys.
 */
export const exportExcel = async ({ filename = 'report', sheets = [] }) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  sheets.forEach((s, i) => {
    const cols = s.columns || (s.rows?.[0] ? Object.keys(s.rows[0]).map(k => ({ key: k, label: k })) : []);
    const aoa = [cols.map(c => c.label)];
    (s.rows || []).forEach(r => aoa.push(cols.map(c => r[c.key])));
    if (s.total) aoa.push(cols.map((c, idx) => s.total[c.key] ?? (idx === 0 ? 'TOTAL' : '')));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map(c => ({ wch: c.width || Math.max(12, String(c.label).length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, (s.name || `Sheet${i + 1}`).slice(0, 31));
  });
  XLSX.writeFile(wb, `${safeFilename(filename)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
};
