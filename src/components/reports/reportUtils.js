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
