/**
 * What a subscription means to the person looking at Settings.
 *
 * Pure, so the rules can be tested rather than only observed by buying a
 * plan — the same reason itemForm.js and reportPeriods.js exist. Billing is
 * the worst possible place to find out a rule was wrong by trying it.
 *
 * The ENTITLEMENT decision is not here. That lives in
 * apply_subscription_event() in the database, because the client must never
 * be the thing that decides which plan someone is on. This file only decides
 * what to SAY about a state the server already settled.
 */

/** Plans a shop can buy without talking to anyone. */
export const SELF_SERVE_PLANS = ['GROWTH', 'PRO'];

/**
 * Razorpay's subscription states, in the terms a shopkeeper uses.
 *
 * `pending` deserves the care: a charge failed and Razorpay is still
 * retrying. It is NOT cancelled, the plan is NOT lost, and saying so wrongly
 * is how a failed card becomes a lost customer. The database agrees — it
 * refuses to downgrade on pending.
 */
export const SUBSCRIPTION_STATES = {
  created:       { label: 'Not started',      tone: 'muted',  active: false },
  authenticated: { label: 'Payment approved', tone: 'ok',     active: true  },
  active:        { label: 'Active',           tone: 'ok',     active: true  },
  pending:       { label: 'Payment retrying', tone: 'warn',   active: true  },
  halted:        { label: 'Payment failed',   tone: 'bad',    active: false },
  cancelled:     { label: 'Cancelled',        tone: 'muted',  active: false },
  completed:     { label: 'Finished',         tone: 'muted',  active: false },
  expired:       { label: 'Expired',          tone: 'muted',  active: false },
};

export const describeSubscription = (status) =>
  SUBSCRIPTION_STATES[String(status || '').toLowerCase()]
  ?? { label: 'Unknown', tone: 'muted', active: false };

/** True while the shop should still have what it paid for. */
export const isEntitled = (status) => describeSubscription(status).active;

/**
 * Can this person start a subscription?
 *
 * Buying a plan puts a recurring bill on the business, so it is an owner's
 * decision. The edge function enforces this too — this is only so the button
 * is not offered to someone who will be refused.
 */
export const canManageBilling = (role) => ['OWNER', 'ADMIN'].includes(String(role || '').toUpperCase());

/**
 * What the upgrade control should say.
 *
 * ENTERPRISE has no checkout on purpose: it is priced per customer, so a
 * "Buy" button would promise a number nobody has agreed.
 */
export function upgradeAction({ plan, currentPlan, role }) {
  if (!canManageBilling(role)) return { kind: 'hidden' };
  if (plan === currentPlan)     return { kind: 'current', label: 'Current plan' };
  if (plan === 'FREE')          return { kind: 'none' };
  if (plan === 'ENTERPRISE')    return { kind: 'contact', label: 'Contact sales' };
  return { kind: 'checkout', label: `Upgrade to ${plan[0]}${plan.slice(1).toLowerCase()}` };
}

/** Renewal date as a shopkeeper would read it, or null when there is none. */
export function renewalText(periodEnd) {
  if (!periodEnd) return null;
  const d = new Date(periodEnd);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
