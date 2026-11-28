/**
 * What the payroll-run server function needs from the shared payroll rules.
 *
 * `npm run build:payroll-fn` bundles this file into
 * supabase/functions/payroll-run/payRun.bundle.js. The phone asks that function
 * to cost a run, so web and phone pay from one set of rules instead of two that
 * drift. payRunServer.test.js fails when the bundle is older than these sources.
 */
export { buildPayRun, netOf, planAdvanceRecovery, planAdvanceSplit, ATTENDANCE_MARKS } from './payRun.js';
export { findOverlapping, needsOverlapConfirmation, overlapConfirmations, parsePeriod, paidForWindow } from './payrollPeriods.js';
