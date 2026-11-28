/**
 * Global search (Ctrl K / Cmd K): the pure half.
 *
 * The palette asks the database for up to GROUP_LIMIT rows per kind (an
 * `ilike` match, tenant-scoped, see useGlobalSearch) and the menu's own pages.
 * Everything here is what happens to those rows afterwards: cleaning what was
 * typed so it is safe inside a PostgREST `or=(...)` filter, ranking a match,
 * grouping by kind, moving the keyboard highlight and deciding where Enter
 * goes. No React, no network, so it is tested directly.
 */

export const MIN_QUERY = 2;
export const GROUP_LIMIT = 8;

export const GROUP_ORDER = ['page', 'product', 'client', 'supplier', 'sale', 'invoice'];
export const GROUP_LABEL = {
  page: 'Pages',
  product: 'Products',
  client: 'Clients',
  supplier: 'Suppliers',
  sale: 'Bills',
  invoice: 'Invoices',
};

/**
 * What was typed, made safe for an `ilike` inside `.or('a.ilike.%x%,b.ilike.%x%')`.
 *
 * A comma or a bracket ends the filter early (PostgREST reads them as list
 * syntax), `%` and `*` are wildcards (PostgREST accepts `*` for `%`), and a
 * quote or backslash changes how the value is parsed. None of them is
 * something a shop owner types to find a product, so they are dropped rather
 * than escaped. Runs of spaces collapse; the length is capped.
 */
export const cleanTerm = (raw) =>
  String(raw ?? '')
    .replace(/[,()"'\\%*:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

/** True when the cleaned term is long enough to send to the database. */
export const isSearchable = (raw) => cleanTerm(raw).length >= MIN_QUERY;

/**
 * How well `text` matches `q`, case-insensitive:
 * 4 exact, 3 starts with, 2 a word starts with, 1 contains, 0 not at all.
 */
export const matchScore = (text, q) => {
  const t = String(text ?? '').toLowerCase().trim();
  const s = String(q ?? '').toLowerCase().trim();
  if (!t || !s) return 0;
  if (t === s) return 4;
  if (t.startsWith(s)) return 3;
  if (t.split(/[\s\-_/.]+/).some(w => w && w.startsWith(s))) return 2;
  if (t.includes(s)) return 1;
  return 0;
};

/** The best score across several fields of one row. */
export const bestScore = (fields, q) =>
  fields.reduce((best, f) => Math.max(best, matchScore(f, q)), 0);

/**
 * Sort rows best match first, then by title, keeping the database's order
 * among equals. A row the server matched on a field not listed (a barcode
 * inside a longer code, say) scores 0 and sorts last rather than vanishing.
 */
export const rankRows = (rows, q, fieldsOf, titleOf = (r) => r?.name) =>
  (rows || [])
    .map((row, i) => ({ row, i, score: bestScore(fieldsOf(row), q) }))
    .sort((a, b) => b.score - a.score
      || String(titleOf(a.row) || '').localeCompare(String(titleOf(b.row) || ''))
      || a.i - b.i)
    .map(x => x.row);

/**
 * The menu's pages as results ("Go to Payroll"). `items` are the side menu's
 * own items, already through its gates: a hidden one (role, permission,
 * vertical module) is not offered, nor a locked one (plan), because the menu
 * itself would not open it. With nothing typed every page is offered, in
 * menu order, as a quick way to jump.
 */
export const pageResults = (items, raw) => {
  const q = cleanTerm(raw);
  const open = (items || []).filter(i => i && !i.hidden && !i.locked && i.path && i.label);
  const seen = new Set();
  const uniq = open.filter(i => (seen.has(i.path) ? false : (seen.add(i.path), true)));
  const toItem = (i) => ({ type: 'page', id: `page:${i.path}`, title: `Go to ${i.label}`, label: i.label, path: i.path });
  if (!q) return uniq.map(toItem);
  return uniq
    .map((i, n) => ({ i, n, score: matchScore(i.label, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.n - b.n)
    .slice(0, GROUP_LIMIT)
    .map(x => toItem(x.i));
};

const join = (parts) => parts.filter(Boolean).join(' · ');

/**
 * One database row as a result line. `fmt` supplies money and date
 * formatting so this file stays free of the app's locale state.
 */
export const toResult = (type, row, fmt = {}) => {
  const money = fmt.money || ((n) => String(n));
  const date = fmt.date || ((d) => String(d || ''));
  switch (type) {
    case 'product':
      return { type, id: `product:${row.id}`, recordId: row.id, title: row.name || 'Unnamed product',
        sub: join([row.sku && `SKU ${row.sku}`, row.barcode && `Barcode ${row.barcode}`]) };
    case 'client':
      return { type, id: `client:${row.id}`, recordId: row.id, title: row.name || 'Unnamed client',
        sub: join([row.phone, Number(row.outstanding_balance) > 0 && `Owes ${money(row.outstanding_balance)}`]) };
    case 'supplier':
      return { type, id: `supplier:${row.id}`, recordId: row.id, title: row.name || 'Unnamed supplier', sub: row.phone || '' };
    case 'sale': {
      const who = row.customerInfo?.name || 'Walk-in';
      return { type, id: `sale:${row.id}`, recordId: row.id, title: `Bill ${row.id}`,
        sub: join([who, date(row.created_at || row.date), row.totalAmount != null && money(row.totalAmount), row.voided_at && 'Voided']) };
    }
    case 'invoice':
      return { type, id: `invoice:${row.id}`, recordId: row.id, title: `Invoice ${row.invoice_number || row.id}`,
        sub: join([row.client_name, date(row.invoice_date || row.date), row.grand_total != null && money(row.grand_total)]) };
    default:
      return null;
  }
};

/** The fields each kind is ranked on, the same ones the query matches. */
export const RANK_FIELDS = {
  product: (r) => [r.name, r.sku, r.barcode],
  client: (r) => [r.name, r.phone],
  supplier: (r) => [r.name, r.phone],
  sale: (r) => [r.id, r.customerInfo?.name],
  invoice: (r) => [r.invoice_number, r.client_name],
};

/**
 * Groups in display order, each { key, label, items, error }. A group with
 * no rows and no error is left out; a group whose read failed stays, with
 * its error, so a failure is never shown as "nothing found".
 */
export const buildGroups = (byType) =>
  GROUP_ORDER
    .map(key => ({ key, label: GROUP_LABEL[key], items: byType?.[key]?.items || [], error: byType?.[key]?.error || null }))
    .filter(g => g.items.length > 0 || g.error);

/** Every selectable result in display order, for the arrow keys. */
export const flatten = (groups) => (groups || []).flatMap(g => g.items);

/** Next highlighted index, wrapping at both ends; -1 when there is nothing. */
export const moveActive = (index, delta, count) => {
  if (!count) return -1;
  if (index < 0) return delta > 0 ? 0 : count - 1;
  return (index + delta + count) % count;
};

/**
 * Where Enter takes a result. Each page is opened the way it can be today:
 *   client   -> that client's account (Settle Account, /clients/settle/:id)
 *   supplier -> that supplier's ledger (/suppliers/ledger/:id)
 *   product  -> Inventory (no way to open one item by link yet)
 *   sale     -> Sales (no way to open one bill by link yet)
 *   invoice  -> Invoices (no way to open one invoice by link yet)
 */
export const destinationFor = (item, basePath = '') => {
  if (!item) return null;
  switch (item.type) {
    case 'page': return item.path;
    case 'client': return `${basePath}/clients/settle/${encodeURIComponent(item.recordId)}`;
    case 'supplier': return `${basePath}/suppliers/ledger/${encodeURIComponent(item.recordId)}`;
    case 'product': return `${basePath}/inventory`;
    case 'sale': return `${basePath}/sales`;
    case 'invoice': return `${basePath}/invoices`;
    default: return null;
  }
};

/**
 * The palette's overall state, from the per-group reads:
 *   'short'   fewer than MIN_QUERY characters, nothing sent
 *   'loading' a read is still out and nothing is on screen yet
 *   'error'   every read failed
 *   'empty'   every read finished, none failed, nothing matched
 *   'results' something to show (possibly beside a failed group)
 */
export const paletteState = ({ query, groups, pending }) => {
  if (!isSearchable(query)) return (groups || []).length ? 'results' : 'short';
  const anyItems = (groups || []).some(g => g.items.length > 0);
  if (anyItems) return 'results';
  if (pending) return 'loading';
  const anyError = (groups || []).some(g => g.error);
  if (anyError) return 'error';
  return 'empty';
};

/** Ctrl K on Windows/Linux, Cmd K on a Mac; nothing else, not even with Shift or Alt. */
export const isPaletteShortcut = (e) =>
  !!e && !!(e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key || '').toLowerCase() === 'k';

/** "Ctrl K" or "⌘ K", for the hint in the top bar. */
export const shortcutLabel = (platform = typeof navigator !== 'undefined' ? navigator.platform : '') =>
  /mac|iphone|ipad/i.test(platform || '') ? '⌘ K' : 'Ctrl K';
