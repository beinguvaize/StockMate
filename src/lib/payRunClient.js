/**
 * Asks the `payroll-run` server function what everyone is owed.
 *
 * The web used to cost pay runs in the browser and send the lines to
 * process_payroll_run, which trusts them. The phone has always asked this
 * function, which runs the one shared calculation (src/lib/payRun.js, bundled
 * into the function). Web now asks it too, so a run, a single payment and
 * every Earned / Still to pay figure on screen come from the same place.
 *
 * Read-only: the function saves nothing. Saving is still process_payroll_run.
 *
 * A direct fetch, as askClient.js does: supabase.functions.invoke falls back
 * to the anon key under Electron's file://.
 */
import { supabase } from './supabase';

const TIMEOUT_MS = 25000;

export class PayRunError extends Error {
  /** kind: 'reason' (the server refused and said why) or 'connection' (no answer). */
  constructor(kind, message, reason = null) {
    super(message);
    this.kind = kind;
    this.reason = reason;
  }
}

/**
 * Cost a run for [from, to].
 *
 *   includeOnLeave  ids of on-leave staff switched into the run
 *   adjustments     { employeeId: { overtime, commission, bonus, deductions } }
 *
 * Resolves to { period, run: { from, to, items, held, totalNet, ... },
 * alreadyPaidRuns, mustConfirm }.
 */
export async function fetchPayRun({ tenantId, from, to, includeOnLeave = [], adjustments = {} }, { fetchImpl = fetch } = {}) {
  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session?.access_token) throw new PayRunError('reason', 'Sign in again to see pay figures.', 'not_signed_in');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payroll-run`, {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        tenant_id: tenantId, from, to,
        include_on_leave: [...(includeOnLeave || [])].map(String),
        adjustments: cleanAdjustments(adjustments),
      }),
    });
  } catch (e) {
    throw new PayRunError('connection', e?.name === 'AbortError'
      ? 'The server took too long to answer.'
      : 'Could not reach the server. Check the connection.');
  } finally {
    clearTimeout(timer);
  }
  return readReply(res);
}

/** The reply, or the server's own reason for refusing. Exported for tests. */
export async function readReply(res) {
  let json = null;
  try { json = await res.json(); } catch { /* a gateway error can have no JSON body */ }
  if (!res.ok || !json?.run) {
    const why = json?.message || (res.status === 401 ? 'Sign in again.' : `The server answered ${res.status}.`);
    throw new PayRunError('reason', why, json?.reason || null);
  }
  return {
    period: String(json.period),
    run: {
      ...json.run,
      items: json.run.items || [],
      held: json.run.held || [],
    },
    alreadyPaidRuns: json.already_paid_runs || [],
    mustConfirm: json.must_confirm_already_paid === true,
    // Newer servers decide per person; an older one sends no list (null).
    confirmEmployeeIds: Array.isArray(json.confirm_employee_ids) ? json.confirm_employee_ids.map(String) : null,
  };
}

/** Only numbers above zero go to the server; blank boxes are not adjustments. */
export function cleanAdjustments(adjustments = {}) {
  const out = {};
  for (const [id, adj] of Object.entries(adjustments || {})) {
    const row = {};
    for (const k of ['overtime', 'commission', 'bonus', 'deductions']) {
      const n = Number(adj?.[k]);
      if (Number.isFinite(n) && n > 0) row[k] = n;
    }
    if (Object.keys(row).length) out[id] = row;
  }
  return out;
}
