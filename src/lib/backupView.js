/**
 * What the Backup and restore page shows, kept out of the page so it can be
 * tested without a database. Nothing here reads or writes the server, and
 * nothing here decides whether a file can be restored: that is
 * lib/backupFile.inspectBackup and, after it, the server.
 */

/**
 * Groups for "Replaced with the file's copy". Matched in THIS order (so
 * client_payments is a payment, sale_batch_consumption a sale line), shown in
 * DISPLAY_ORDER. A table that matches none is counted under "other tables".
 */
const GROUPS = [
  ['payments',  'Payments',              /payment|receipt|settlement/],
  ['sales',     'Sales and sale lines',  /^sales?(_|$)/],
  ['invoices',  'Invoices',              /invoice/],
  ['purchases', 'Purchases',             /purchase/],
  ['expenses',  'Expenses',              /expense/],
  ['payroll',   'Payroll',               /payroll|attendance|staff|employee|salar|advance/],
  ['ledger',    'Ledger and accounts',   /ledger|^gl_|^accounts?(_|$)|transaction|day_book|reconcil/],
  ['stock',     'Products and stock',    /product|inventory|stock|batch|serial|categor|^bom/],
  ['parties',   'Clients and suppliers', /^clients?(_|$)|^suppliers?(_|$)|part(y|ies)/],
];
const DISPLAY_ORDER = ['sales', 'invoices', 'payments', 'ledger', 'stock', 'parties', 'purchases', 'expenses', 'payroll'];

export function groupOf(table) {
  const t = String(table || '').toLowerCase();
  const hit = GROUPS.find(([, , re]) => re.test(t));
  return hit ? hit[0] : null;
}

/**
 * Rows the restore will write back, grouped for a person to read.
 *
 * Counts come from the file (its `counts`, else the table's own length).
 * Tables the server keeps as they are (manifest mode PRESERVE, the GST
 * portal's e-invoice records) are left out: they are not replaced.
 */
export function replacedGroups(parsed) {
  const tables = parsed?.tables || {};
  const counts = parsed?.counts || {};
  const preserved = new Set((parsed?.manifest || []).filter((m) => m.mode === 'PRESERVE').map((m) => m.table));
  const sums = {};
  let otherTables = 0;
  let otherRows = 0;
  let totalTables = 0;
  let totalRows = 0;
  for (const name of Object.keys(tables)) {
    if (preserved.has(name)) continue;
    const n = Number(counts[name] ?? (Array.isArray(tables[name]) ? tables[name].length : 0)) || 0;
    totalTables += 1;
    totalRows += n;
    const g = groupOf(name);
    if (g) sums[g] = (sums[g] || 0) + n;
    else { otherTables += 1; otherRows += n; }
  }
  const label = Object.fromEntries(GROUPS.map(([k, l]) => [k, l]));
  const groups = DISPLAY_ORDER.filter((k) => k in sums).map((k) => ({ key: k, label: label[k], rows: sums[k] }));
  if (otherTables) {
    groups.push({ key: 'other', label: `${otherTables} other table${otherTables === 1 ? '' : 's'}`, rows: otherRows });
  }
  return { groups, totalTables, totalRows };
}

/**
 * The four steps of a restore and where the page is in them.
 * phase: 'upload' | 'apply'. The server checks every table inside the same
 * call that restores, so the last two steps finish together.
 */
export function restoreSteps(phase, parts) {
  const s = (label, state) => ({ label, state }); // state: 'done' | 'now' | 'todo'
  return [
    s('File checked', 'done'),
    s(`Uploading the file to the server${parts ? `, in ${parts} part${parts === 1 ? '' : 's'}` : ''}`, phase === 'upload' ? 'now' : 'done'),
    s('Restoring, replaces the shop in one step', phase === 'apply' ? 'now' : 'todo'),
    s('Checking every table matches the file', 'todo'),
  ];
}

/**
 * A check message split into its lead (shown bold) and the rest. The
 * messages themselves come from inspectBackup unchanged.
 */
export function splitLead(msg) {
  const text = String(msg || '');
  const paren = text.indexOf(' (');
  const stop = text.search(/[.:]\s/);
  const cut = [paren, stop === -1 ? -1 : stop + 1].filter((i) => i > 0).sort((a, b) => a - b)[0];
  if (!cut) return { lead: text, rest: '' };
  return { lead: text.slice(0, cut), rest: text.slice(cut) };
}

export const fmtSize = (n) => {
  const b = Number(n) || 0;
  return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
};

export const fmtWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const fmtDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** The small line under a picked file's name. */
export function pickedLine({ size, source, parsed }) {
  const bits = [];
  if (size) bits.push(fmtSize(size));
  if (parsed && typeof parsed === 'object' && parsed.format === 1) {
    bits.push(`format 1${parsed.takenAt && fmtDay(parsed.takenAt) ? `, made ${fmtDay(parsed.takenAt)}` : ''}`);
  } else {
    bits.push(source === 'drive' ? 'from Google Drive' : 'picked from this computer');
  }
  return bits.join(' · ');
}

export const pctOf = (v) => Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 100);
