/**
 * Paying staff from the web, the way the phone does it.
 *
 * Both steps go to the server: `payroll-run` costs the run at the moment of
 * paying (another device may have marked attendance or paid someone since the
 * screen opened), and process_payroll_run saves exactly the lines it returned.
 * The browser adds nothing up. The run id is made once per run on screen and
 * sent with every try, so pressing again after a lost reply returns the run
 * already saved instead of paying twice.
 *
 * `cost` and `save` are passed in so this can be tested without a network.
 */
import { classifyWriteFailure } from './writeOutcome.js';
import { isAppUpdateRequired } from './staffAdvances.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Pay a run.
 *
 *   cost()            -> the server's answer for the run on screen (fresh)
 *   save(record, id)  -> usePayroll.processPayroll
 *   shownTotal        the total the person agreed to on screen
 *   acknowledged      they ticked "pay these dates again anyway"
 *   selected          ids ticked to pay (null: everyone in the run)
 *   options           process_payroll_run p_options (only on a database with
 *                     staff advances; null otherwise)
 *
 * Outcomes:
 *   { status: 'saved', result, data }
 *   { status: 'nothing', data }            nothing is owed for these dates
 *   { status: 'confirm', data }            dates already paid: must be ticked first
 *   { status: 'changed', data }            the figures moved since they were shown
 *   { status: 'cost-failed', error }       could not ask the server; nothing was saved
 *   { status: 'update-required', data }    the server wants an advance-aware app
 *   { status: 'failed', failure, data }    the save failed; `failure.maySaved`
 *                                          says whether it may have gone through
 */
export async function payRun({ cost, save, runId, method, shownTotal, acknowledged = false, selected = null, options = null }) {
  let data;
  try {
    data = await cost();
  } catch (error) {
    return { status: 'cost-failed', error };
  }
  const chosen = chosenLines(data, selected);
  const total = chosen.reduce((t, i) => t + num(i.netPay), 0);
  if (total <= 0) return { status: 'nothing', data };
  if (shownTotal != null && Math.round(total) !== Math.round(num(shownTotal))) return { status: 'changed', data };
  if (needsConfirming(data, chosen) && !acknowledged) return { status: 'confirm', data };

  const result = await save({
    period: data.period,
    paymentMethod: method,
    items: chosen,
    processedAt: new Date().toISOString(),
  }, runId, options);
  if (result?.success) return { status: 'saved', result, data };
  if (isAppUpdateRequired(result?.error)) return { status: 'update-required', data };
  return { status: 'failed', data, failure: classifyWriteFailure(result?.error, { noun: 'pay run' }) };
}

/** The lines to pay: the ticked ones (all, when nothing is chosen). */
export function chosenLines(data, selected = null) {
  const items = data?.run?.items || [];
  if (!selected) return items;
  const ids = new Set([...selected].map(String));
  return items.filter((i) => ids.has(String(i.employeeId)));
}

/**
 * Do the chosen lines need "pay these dates again"? A server that decides per
 * person sends confirmEmployeeIds (and needsConfirmation on each line): only
 * the chosen people count. An older server only says yes or no for the whole
 * run, which is then the answer.
 */
export function needsConfirming(data, chosen = data?.run?.items || []) {
  if (Array.isArray(data?.confirmEmployeeIds)) {
    const ids = new Set(data.confirmEmployeeIds.map(String));
    return chosen.some((i) => i.needsConfirmation === true || ids.has(String(i.employeeId)));
  }
  return !!data?.mustConfirm;
}

/**
 * Pay one person what the server says they are owed for a window: the
 * panel's "Pay ₹7,000" and the profile's "Pay now". The person is switched
 * into the run even when on leave -- pressing Pay is the decision to pay them.
 * Only their line is saved.
 */
export async function payOne({ cost, save, runId, method, employeeId, shownAmount, options = null }) {
  let data;
  try {
    data = await cost([employeeId]);
  } catch (error) {
    return { status: 'cost-failed', error };
  }
  const line = (data?.run?.items || []).find((i) => String(i.employeeId) === String(employeeId));
  if (!line || num(line.netPay) <= 0) return { status: 'nothing', data, line: line || null };
  if (shownAmount != null && Math.round(num(line.netPay)) !== Math.round(num(shownAmount))) {
    return { status: 'changed', data, line };
  }
  const result = await save({
    period: data.period,
    paymentMethod: method,
    items: [line],
    processedAt: new Date().toISOString(),
  }, runId, options);
  if (result?.success) return { status: 'saved', result, data, line };
  if (isAppUpdateRequired(result?.error)) return { status: 'update-required', data, line };
  return { status: 'failed', data, line, failure: classifyWriteFailure(result?.error, { noun: 'payment' }) };
}

/** The sentence under a failed pay. Never "Not saved" when it may have saved. */
export function payFailureText(failure, { again = 'Press Confirm again' } = {}) {
  if (!failure) return '';
  if (failure.maySaved) {
    return `This may already be saved: the connection dropped before the server answered. ${again}: if it did go through, nobody is paid twice. (${failure.detail})`;
  }
  return `Not saved. ${failure.detail}`;
}
