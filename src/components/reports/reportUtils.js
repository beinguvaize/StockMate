import { todayISOInAppTZ } from '../../lib/utils';

// Shared report helpers.
//
// isCountableSale — the single definition of "does this sale count as
// revenue". Voided / failed / cancelled / refunded sales owe nothing and
// must not appear in any revenue, profit or statement figure. Before this
// existed, each report hand-rolled the check (or skipped it): two reports
// tested the literal 'VOID' while the DB writes 'VOIDED', so their
// exclusion never matched. Matches the server-side rule in get_pl_ranged
// (status NOT IN VOIDED/CANCELLED) plus the voided_at column and the
// payment-status variants POSReceipt treats as void.
const VOID_STATUSES = new Set(['VOIDED', 'VOID', 'CANCELLED', 'FAILED', 'REFUNDED']);

export const isCountableSale = (s) => {
  if (!s) return false;
  if (s.voided_at) return false;
  if (VOID_STATUSES.has(String(s.status ?? '').toUpperCase())) return false;
  if (VOID_STATUSES.has(String(s.paymentStatus ?? s.payment_status ?? '').toUpperCase())) return false;
  return true;
};

// ── Shared period presets ───────────────────────────────────────────────────
// One implementation instead of 11 copies — the Sunday week-start bug lived
// in every copy precisely because this was duplicated per report.

export const PRESETS = [
  { id: 'TODAY',   label: 'Today' },
  { id: 'WEEK',    label: 'This Week' },
  { id: 'MONTH',   label: 'This Month' },
  { id: 'QUARTER', label: 'Quarter' },
  { id: 'YEAR',    label: 'This Year' },
];

export function presetRange(id) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = todayISOInAppTZ();
  switch (id) {
    case 'TODAY': return { start: today, end: today };
    case 'WEEK': {
      const dow = now.getDay() || 7; // Sunday counts as end of the week, not its start
      const mon = new Date(now); mon.setDate(now.getDate() - dow + 1);
      return { start: fmt(mon), end: today };
    }
    case 'MONTH':
      return { start: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, end: today };
    case 'QUARTER': {
      const q = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return { start: fmt(q), end: today };
    }
    case 'YEAR':
      return { start: `${now.getFullYear()}-01-01`, end: today };
    default: return { start: today, end: today };
  }
}
