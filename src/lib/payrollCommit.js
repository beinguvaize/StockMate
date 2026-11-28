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
 *
 * Outcomes:
 *   { status: 'saved', result, data }
 *   { status: 'nothing', data }            nothing is owed for these dates
 *   { status: 'confirm', data }            dates already paid: must be ticked first
 *   { status: 'changed', data }            the figures moved since they were shown
 *   { status: 'cost-failed', error }       could not ask the server; nothing was saved
 *   { status: 'failed', failure, data }    the save failed; `failure.maySaved`
 *                                          says whether it may have gone through
 */
export async function payRun({ cost, save, runId, method, shownTotal, acknowledged = false }) {
  let data;
  try {
    data = await cost();
  } catch (error) {
    return { status: 'cost-failed', error };
  }
  const total = num(data?.run?.totalNet);
  if (total <= 0) return { status: 'nothing', data };
  if (shownTotal != null && Math.round(total) !== Math.round(num(shownTotal))) return { status: 'changed', data };
  if (data.mustConfirm && !acknowledged) return { status: 'confirm', data };

  const result = await save({
    period: data.period,
    paymentMethod: method,
    items: data.run.items,
    processedAt: new Date().toISOString(),
  }, runId);
  if (result?.success) return { status: 'saved', result, data };
  return { status: 'failed', data, failure: classifyWriteFailure(result?.error, { noun: 'pay run' }) };
}

/**
 * Pay one person what the server says they are owed for a window: the
 * panel's "Pay ₹7,000" and the profile's "Pay now". The person is switched
 * into the run even when on leave -- pressing Pay is the decision to pay them.
 * Only their line is saved.
 */
export async function payOne({ cost, save, runId, method, employeeId, shownAmount }) {
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
  }, runId);
  if (result?.success) return { status: 'saved', result, data, line };
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
