/**
 * Dashboard figure helpers (web redesign). Pure, so they can be tested.
 *
 * Nothing here works out money in a new way. The period sums use the rule the
 * Dashboard has always used (sum a row's amount when its YYYY-MM-DD date falls
 * in the window); this file only decides WHICH window, and which colour a
 * comparison pill is.
 *
 * Dates are the shop's business dates (YYYY-MM-DD in the app timezone, see
 * todayISOInAppTZ). All arithmetic is on calendar days, never on a local
 * Date's clock, so a browser in another timezone gets the same windows.
 */
import { priorRange, pctChange } from '../components/reports/reportUtils';

const pad = (n) => String(n).padStart(2, '0');
const ymdParts = (ymd) => ymd.split('-').map(Number);
// Calendar-day maths through UTC, which has no daylight-saving gaps.
const fromYMD = (ymd) => { const [y, m, d] = ymdParts(ymd); return new Date(Date.UTC(y, m - 1, d)); };
const toYMDUTC = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (ymd, n) => { const d = fromYMD(ymd); d.setUTCDate(d.getUTCDate() + n); return toYMDUTC(d); };

/** YYYY-MM-DD out of a row's date ("2026-05-15", "2026-05-15T10:00:00Z"). */
export const ymdOf = (v) => {
  if (!v) return '';
  if (typeof v === 'string') { const m = v.match(/^(\d{4}-\d{2}-\d{2})/); if (m) return m[1]; }
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * The window a Dashboard preset covers, as { start, end } business dates, or
 * null for "all time" (and for a custom range with a date missing, which the
 * Dashboard has always read as everything).
 *   Today        today
 *   This Week    Monday to today (Sunday is the last day of the week)
 *   This Month   the 1st to today
 *   Last Month   the whole of last month
 *   Custom Range the two dates picked
 */
export function periodRange(preset, today, custom = {}) {
  if (!today) return null;
  switch (preset) {
    case 'Today': return { start: today, end: today };
    case 'This Week': {
      const dow = fromYMD(today).getUTCDay() || 7;
      return { start: addDays(today, 1 - dow), end: today };
    }
    case 'This Month': return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'Last Month': {
      const [y, m] = ymdParts(today);
      const first = new Date(Date.UTC(y, m - 2, 1));
      const last = new Date(Date.UTC(y, m - 1, 0));
      return { start: toYMDUTC(first), end: toYMDUTC(last) };
    }
    case 'Custom Range': {
      const s = ymdOf(custom.start), e = ymdOf(custom.end);
      if (!s || !e) return null;
      return s <= e ? { start: s, end: e } : { start: e, end: s };
    }
    default: return null;
  }
}

/**
 * The period a figure is compared with: the one of EQUAL LENGTH immediately
 * before it (the same rule as the Reports' period-over-period arrows,
 * reportUtils.priorRange). Today compares with yesterday; this week so far
 * (Mon-Thu) with the four days before it. All time has nothing before it.
 */
export const comparisonRange = (range) => (range ? priorRange(range) : null);

export const inRange = (dateish, range) => {
  if (!range) return true;
  const d = ymdOf(dateish);
  return !!d && d >= range.start && d <= range.end;
};

/** Σ amountOf(row) over rows dated inside the window. */
export const sumInRange = (rows, range, amountOf) =>
  (rows || []).reduce((s, r) => (inRange(r?.date, range) ? s + (Number(amountOf(r)) || 0) : s), 0);

/** Percent change, null when there is nothing to compare with. */
export const deltaPct = (current, prior) => pctChange(current, prior);

/**
 * Pill colour for a comparison.
 *   'income'  (sales, profit): up is good (green), down is bad (red)
 *   'cost'    (expenses):      DOWN is good (green), up is bad (red)
 *   'neutral' (purchases):     always grey; buying stock is neither
 * No change, or nothing to compare with, is grey.
 */
export function deltaTone(kind, pct) {
  if (typeof pct !== 'number' || !Number.isFinite(pct) || Math.abs(pct) < 0.05) return 'neutral';
  if (kind === 'income') return pct > 0 ? 'good' : 'bad';
  if (kind === 'cost') return pct < 0 ? 'good' : 'bad';
  return 'neutral';
}

/** "+12.4%", "−8.0%", "0.0%"; "—" when there is nothing to compare with. */
export function formatDelta(pct) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return '—';
  if (Math.abs(pct) < 0.05) return '0.0%';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (ymd) => { const [, m, d] = ymdParts(ymd); return `${d} ${MONTHS[m - 1]}`; };
export const spanLabel = (r) => (r.start === r.end ? shortDate(r.start) : `${shortDate(r.start)} – ${shortDate(r.end)}`);

// ── Setup guide ──────────────────────────────────────────────────────────

/**
 * The five setup steps, each ticked from what the shop has actually done.
 *   products      at least one product
 *   stock         any product with stock above 0 (a stock row, or its stock)
 *   gst           the business profile has a GST number
 *   sale          at least one sale
 *   staff         a login besides the owner's (more than one user)
 * `next` is the first step not yet done.
 */
export function setupSteps({ products = [], inventoryBalances = [], businessProfile = null, salesCount = 0, usersCount = 0 } = {}) {
  const hasStock = (inventoryBalances || []).some(b => Number(b?.quantity) > 0)
    || (products || []).some(p => Number(p?.stock) > 0);
  const steps = [
    { key: 'products', label: 'Add your products', done: (products || []).length > 0, to: '/inventory' },
    { key: 'stock', label: 'Add opening stock', done: hasStock, to: '/inventory' },
    { key: 'gst', label: 'Add shop GST details', done: !!String(businessProfile?.gst_no || '').trim(), to: '/settings' },
    { key: 'sale', label: 'Make your first sale', done: salesCount > 0, to: '/sales' },
    { key: 'staff', label: 'Invite staff', done: usersCount > 1, to: '/users' },
  ];
  const nextIdx = steps.findIndex(s => !s.done);
  return {
    steps: steps.map((s, i) => ({ ...s, next: i === nextIdx })),
    done: steps.filter(s => s.done).length,
    total: steps.length,
    complete: nextIdx === -1,
  };
}

/**
 * A "new shop" for the setup guide: no sale yet, or the first sale was less
 * than NEW_SHOP_DAYS ago. After that the guide stops appearing even if a step
 * (GST, staff) was never done, since plenty of running shops have neither.
 */
export const NEW_SHOP_DAYS = 30;
export function isNewShop(sales = [], today) {
  let first = '';
  (sales || []).forEach(s => { const d = ymdOf(s?.date); if (d && (!first || d < first)) first = d; });
  if (!first) return true;
  return !!today && first > addDays(today, -NEW_SHOP_DAYS);
}
