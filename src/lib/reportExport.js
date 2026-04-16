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
