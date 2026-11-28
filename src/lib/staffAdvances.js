/**
 * Staff advances on the web: feature detection and the small rules shared by
 * every screen that shows them. No pay maths: what a run takes back is always
 * the server's figure (payroll-run's advancePlanned, process_payroll_run's
 * advanceRecovered).
 *
 * Not every database has advances yet. The preview site and production point
 * at one without the advances tables, delete_payroll_run or the p_options
 * parameter. So the web asks once per session -- a cheap read of
 * staff_advance_balances -- and when that read fails it behaves exactly as it
 * did before advances: no advances UI, no p_options, the old delete path, and
 * no error on screen.
 */

let detected = null;   // Promise<boolean> for this session

/**
 * Does this database have staff advances? Asked once per session; the answer
 * is shared by every caller. A failed read means "no" (logged, not shown).
 */
export function detectAdvances(client, { force = false } = {}) {
  if (detected && !force) return detected;
  detected = (async () => {
    try {
      const { error } = await client.from('staff_advance_balances').select('employee_id').limit(1);
      if (error) {
        console.info('[advances] not on this database:', error.message || error);
        return false;
      }
      return true;
    } catch (e) {
      console.info('[advances] not on this database:', e?.message || e);
      return false;
    }
  })();
  return detected;
}

/** Tests only: forget the session's answer. */
export function resetAdvancesDetection() { detected = null; }

/**
 * process_payroll_run's p_options for a run on a database WITH advances.
 * netPay is sent as earned; the server works out and takes the recovery.
 */
export function advanceOptions({ skip = [], recoverAll = [] } = {}) {
  return {
    advance_aware: true,
    skip_advance: [...new Set((skip || []).map(String))],
    recover_all: [...new Set((recoverAll || []).map(String))],
  };
}

/** The server refused because the app cannot show a recovery that is due. */
export const isAppUpdateRequired = (error) =>
  /APP_UPDATE_REQUIRED/.test(String(error?.message || error?.details || error || ''));

export const APP_UPDATE_TEXT =
  'Nothing was paid: someone in this run has a staff advance to take back, and this page is out of date. Reload the page and run it again.';

// ── Expenses with method ADVANCE ───────────────────────────────────────────
// PAYADV-<run>-<employee>: the part of a salary taken back against an advance.
// ADVWO-<op>: an advance written off. Both are real expenses (they count in
// expense and P&L figures) but move NO cash: the money left the till when the
// advance was given.

const up = (v) => String(v || '').toUpperCase();
export const expenseMethod = (e) => up(e?.payment_method ?? e?.paymentMethod ?? e?.method);
export const isAdvanceExpense = (e) => expenseMethod(e) === 'ADVANCE';

/** 'recovered' | 'written-off' | null */
export function advanceExpenseKind(e) {
  if (!isAdvanceExpense(e)) return null;
  const id = String(e?.id || '');
  if (id.startsWith('ADVWO-')) return 'written-off';
  return 'recovered';
}

export const advanceExpenseLabel = (e) =>
  ({ recovered: 'Advance recovered', 'written-off': 'Advance written off' })[advanceExpenseKind(e)] || null;

/** The employee a PAYADV expense belongs to (its id ends with the employee id), else null. */
export function advanceExpenseEmployee(e) {
  const id = String(e?.id || '');
  const run = e?.payroll_id ?? e?.payrollId;
  if (run && id.startsWith(`PAYADV-${run}-`)) return id.slice(`PAYADV-${run}-`.length) || null;
  return null;
}

/**
 * Expense methods that move NO cash or bank money:
 *   ADVANCE     pay kept against a staff advance, or an advance written off
 *   ADJUSTMENT  a stock write-off (write_off_batch): goods lost, not money
 * They are real expenses (expense totals and the P&L count them); cash,
 * bank and money-in/out figures must not.
 */
export const NON_CASH_METHODS = ['ADVANCE', 'ADJUSTMENT'];
export const isNonCashExpense = (e) => NON_CASH_METHODS.includes(expenseMethod(e));

/** Expenses that moved cash: everything except the non-cash methods. */
export const cashExpenses = (rows = []) => (rows || []).filter((e) => !isNonCashExpense(e));

/** Account-transaction ref for advances given (OUT) and paid back (IN). */
export const STAFF_ADVANCE_REF = 'STAFF_ADVANCE';
export const isStaffAdvanceTxn = (t) => up(t?.ref_type ?? t?.refType) === STAFF_ADVANCE_REF;
/** 'Staff advance given' / 'Staff advance paid back' for a STAFF_ADVANCE transaction. */
export function staffAdvanceTxnLabel(t) {
  if (!isStaffAdvanceTxn(t)) return null;
  return up(t?.direction) === 'IN' ? 'Staff advance paid back' : 'Staff advance given';
}

// ── General ledger report (components/reports/GeneralLedgerReport.jsx) ──────

/**
 * The account an expense is credited to, as the database's gl_post_expenses
 * posts it: ADVANCE → 1300 Staff Advances, ADJUSTMENT (stock write-off) →
 * 1200 Inventory, anything else → 1000 Cash & Bank.
 */
export function expenseCreditAccount(e) {
  const m = expenseMethod(e);
  if (m === 'ADVANCE') return { account: 'Staff Advances', accountCode: '1300' };
  if (m === 'ADJUSTMENT') return { account: 'Inventory', accountCode: '1200' };
  return { account: 'Cash & Bank', accountCode: '1000' };
}

/**
 * A staff advance account transaction as its two ledger lines: given (OUT)
 * Dr 1300 / Cr 1000; paid back (IN) Dr 1000 / Cr 1300.
 */
export function staffAdvanceLedgerLines(t) {
  if (!isStaffAdvanceTxn(t)) return [];
  const amount = Number(t.amount) || 0;
  const inn = up(t.direction) === 'IN';
  const base = { date: String(t.date || '').slice(0, 10), reference: `ADV-${String(t.ref_id || t.id || '').slice(0, 8).toUpperCase()}`,
    description: staffAdvanceTxnLabel(t), type: 'STAFF_ADVANCE' };
  const adv = { account: 'Staff Advances', accountCode: '1300' };
  const cash = { account: 'Cash & Bank', accountCode: '1000' };
  return [
    { ...base, ...(inn ? cash : adv), debit: amount, credit: 0 },
    { ...base, ...(inn ? adv : cash), debit: 0, credit: amount },
  ];
}

/** A readable name for an account transaction's ref_type (Cash & Bank list). */
const REF_WORDS = {
  SALE: 'Sale', EXPENSE: 'Expense', PURCHASE: 'Purchase', SUPPLIER_PAYMENT: 'Supplier payment',
  CLIENT_PAYMENT: 'Client payment', TRANSFER: 'Transfer', DAY_CLOSE_VARIANCE: 'Day close difference',
};
export function refTypeLabel(t) {
  if (isStaffAdvanceTxn(t)) return staffAdvanceTxnLabel(t);
  const r = String(t?.ref_type ?? t?.refType ?? '');
  return REF_WORDS[r.toUpperCase()] || r;
}

/**
 * An expense the Expenses page must show read-only: the server wrote it for a
 * staff advance and owns it (deleting or editing it would unbalance the
 * advance). Returns { label, href } or null. href is the employee's Advances
 * page when the row names the employee (PAYADV), else Payroll.
 */
export function lockedAdvanceExpense(e) {
  if (!isAdvanceExpense(e)) return null;
  const emp = advanceExpenseEmployee(e);
  return {
    label: advanceExpenseLabel(e),
    href: emp ? `/payroll/employee/${encodeURIComponent(emp)}?tab=advances` : '/payroll',
  };
}
