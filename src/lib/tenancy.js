/**
 * Multi-tenancy configuration & plan-based feature flags.
 * Module gating, plan definitions, and tenant utilities.
 */

// --- Plan Definitions ---
// Single source of truth, aligned 1:1 with the public pricing page at
// bookledger.in/pricing (website pricing wins — decided Jul 2026).
// Ladder: FREE < GROWTH < PRO < ENTERPRISE.
// maxInvoices: monthly invoice cap (-1 = unlimited)
// maxUsers:    seat cap (-1 = unlimited)
export const PLANS = {
  FREE: {
    label: 'Free',
    price: '₹0',
    modules: ['dashboard', 'inventory', 'sales', 'clients', 'expenses', 'daybook', 'invoices'],
    features: [],
    maxUsers: 1,
    maxInvoices: 100,
    color: 'bg-muted text-ink-secondary',
  },
  GROWTH: {
    label: 'Growth',
    price: '₹2,999/yr',
    modules: [
      'dashboard', 'inventory', 'sales', 'clients', 'expenses', 'daybook', 'invoices',
      'purchases', 'suppliers', 'payroll', 'reports', 'estimates',
    ],
    features: ['gstr_export'],
    maxUsers: 3,
    maxInvoices: 1000,
    color: 'bg-emerald-50 text-emerald-600',
  },
  PRO: {
    label: 'Pro',
    price: '₹5,999/yr',
    modules: [
      'dashboard', 'inventory', 'sales', 'clients', 'expenses', 'daybook', 'invoices',
      'purchases', 'suppliers', 'vehicles', 'orders', 'payroll', 'reports',
      'estimates', 'manufacturing', 'accounts',
    ],
    features: ['price_lists', 'wac_costing', 'gstr_export', 'multi_location_inventory'],
    maxUsers: 5,
    maxInvoices: -1,
    color: 'bg-blue-50 text-blue-600',
  },
  ENTERPRISE: {
    label: 'Enterprise',
    price: 'Custom',
    modules: [
      'dashboard', 'inventory', 'sales', 'clients', 'expenses', 'daybook', 'invoices',
      'purchases', 'suppliers', 'vehicles', 'orders', 'payroll', 'reports',
      'estimates', 'manufacturing', 'accounts',
      // Niche modules with no tier until now, so their routes were open to
      // every plan. Enterprise is the conservative home for them; move them
      // down if any are meant to be sold lower.
      'appointments', 'kds', 'labels',
      'users', 'settings', 'audit-log',
    ],
    features: ['price_lists', 'wac_costing', 'gstr_export', 'multi_location_inventory', 'api_access', 'white_label', 'priority_support'],
    maxUsers: -1,
    maxInvoices: -1,
    color: 'bg-purple-50 text-purple-600',
  },
  // Legacy alias — old tenants row may still say STARTER until the DB
  // migration runs; treat it as GROWTH (grandfathered) so nothing breaks.
  STARTER: null, // resolved below
};
PLANS.STARTER = PLANS.GROWTH;

// Ladder order for "minimum plan" comparisons.
export const PLAN_ORDER = { FREE: 0, STARTER: 1, GROWTH: 1, PRO: 2, ENTERPRISE: 3 };

/**
 * Returns the limits for a given plan.
 */
export const getPlanLimits = (plan) => {
  const p = PLANS[plan] || PLANS.STARTER;
  return { maxUsers: p.maxUsers, maxInvoices: p.maxInvoices };
};

/**
 * Check if a module is accessible under a given plan.
 * Admin-only modules (users, settings) always require ENTERPRISE or admin role.
 */
/**
 * Settings and Users are SELF-SERVICE, not premium.
 *
 * They were ENTERPRISE-only in the module lists, so a Free, Growth or Pro tenant
 * could not open Settings to enter their own GST number, bank details or
 * printing setup -- and could not open Users at all, while the pricing page sold
 * Growth on "3 users" and Pro on "5 users". Seat COUNTS are still enforced,
 * separately, by maxUsers; being able to reach the page is not the paid part.
 *
 * The audit log stays on Enterprise. That one genuinely is a premium feature
 * rather than a tenant managing its own shop.
 */
const SELF_SERVICE_MODULES = ['settings', 'users'];

export const isModuleAvailable = (plan, moduleKey) => {
  if (SELF_SERVICE_MODULES.includes(moduleKey)) return true;
  const planConfig = PLANS[plan] || PLANS.STARTER;
  return planConfig.modules.includes(moduleKey);
};

/**
 * Check if the plan supports a specific feature flag.
 */
export const hasFeature = (plan, featureKey) => {
  const planConfig = PLANS[plan] || PLANS.STARTER;
  return planConfig.features?.includes(featureKey) || false;
};

/**
 * Get the minimum plan required for a module.
 */
export const getRequiredPlan = (moduleKey) => {
  for (const [planName, config] of Object.entries(PLANS)) {
    if (config.modules.includes(moduleKey)) return planName;
  }
  return 'ENTERPRISE';
};

/**
 * Get plan badge styling.
 */
export const getPlanBadge = (plan) => {
  return PLANS[plan]?.color || PLANS.STARTER.color;
};

/**
 * Tenant status definitions.
 */
export const TENANT_STATUS = {
  ACTIVE: { label: 'Active', color: 'bg-green-50 text-green-600' },
  SUSPENDED: { label: 'Suspended', color: 'bg-red-50 text-red-600' },
  TRIAL: { label: 'Trial', color: 'bg-amber-50 text-amber-600' }
};

// ── Trial ────────────────────────────────────────────────────────────────────
//
// A trial GRANTS access; it is not merely a label. Until this existed, a new
// signup was written with status='TRIAL' and plan='FREE', so "Start free trial"
// on the website handed them the Free tier and they never saw a paid feature.
// Meanwhile nothing enforced the end date, so tenants whose signup happened to
// pass ENTERPRISE kept everything, for free, indefinitely.
//
// 60 days, decided 20 Aug 2026 -- the length the edge function already grants
// and the one existing trial_end_date values were written against, so nobody's
// trial is shortened by the decision. The landing copy said 30 and was wrong.

/** Days a trial runs. Must match create-tenant and the pricing page. */
export const TRIAL_DAYS = 60;

/** What a trial is worth while it lasts. */
export const TRIAL_PLAN = 'PRO';

/**
 * Days after expiry before access actually drops. Cutting a shop off mid-sale
 * with no warning reads as an outage, not a billing event; the banner counts
 * down through this window.
 */
export const TRIAL_GRACE_DAYS = 7;

/**
 * The day trial enforcement began.
 *
 * Grace is counted from the LATER of the trial's own end and this date, so a
 * tenant whose trial lapsed while nothing enforced it still gets the full
 * warning window from the moment enforcement shipped. Without it, the deploy
 * that turned enforcement on would have cut Aisha Store (39 days past) and
 * Shibily stores (11 days past) from their plans to FREE the instant it landed,
 * with no notice at all -- which is not a billing event to them, it is an
 * outage.
 *
 * It is a fixed date rather than "now" so the window closes on a real day and
 * does not slide forward on every page load.
 */
export const TRIAL_ENFORCEMENT_START = '2026-08-20T00:00:00Z';

const dayDiff = (a, b) => Math.ceil((a - b) / 86400000);

/** Days left before the trial ends. Negative once it has. */
export const trialDaysLeft = (tenant) => {
  if (tenant?.status !== 'TRIAL' || !tenant?.trial_end_date) return null;
  return dayDiff(new Date(tenant.trial_end_date), new Date());
};

/** True once the trial end date has passed, grace or not. */
export const isTrialExpired = (tenant) => {
  const left = trialDaysLeft(tenant);
  return left !== null && left <= 0;
};

/**
 * True once even the grace period is used up and access should drop.
 * Grace runs from the later of the trial end and TRIAL_ENFORCEMENT_START.
 */
export const isTrialLapsed = (tenant) => {
  if (trialDaysLeft(tenant) === null) return false;
  const ends = new Date(tenant.trial_end_date).getTime();
  const from = Math.max(ends, new Date(TRIAL_ENFORCEMENT_START).getTime());
  return Date.now() > from + TRIAL_GRACE_DAYS * 86400000;
};

/**
 * The plan a tenant should actually be gated on, which is not always the plan
 * stored on the row.
 *
 *  · Not on trial -> exactly what they pay for. A paying customer is never
 *    touched by any of this; FUTURE DISPO is status ACTIVE and unaffected.
 *  · On trial, still running -> the BETTER of their stored plan and the trial
 *    grant. Taking the better of the two matters: some early signups were
 *    written straight to ENTERPRISE, and resolving them down to PRO would be
 *    taking away access they already have.
 *  · On trial, lapsed past grace -> FREE. They keep every row of their data;
 *    only the modules close.
 */
export const effectivePlan = (tenant) => {
  const stored = String(tenant?.plan || 'FREE').toUpperCase();
  const known = PLANS[stored] ? stored : 'FREE';
  if (tenant?.status !== 'TRIAL' || !tenant?.trial_end_date) return known;

  if (isTrialLapsed(tenant)) return 'FREE';

  return (PLAN_ORDER[TRIAL_PLAN] ?? 0) > (PLAN_ORDER[known] ?? 0) ? TRIAL_PLAN : known;
};

/**
 * What the banner should say, or null when there is nothing to say. Returned as
 * data rather than a string so the wording lives with the UI.
 */
export const trialNotice = (tenant) => {
  const left = trialDaysLeft(tenant);
  if (left === null) return null;
  if (isTrialLapsed(tenant)) return { kind: 'LAPSED', daysLeft: left, plan: 'FREE' };
  if (left <= 0) {
    const ends = new Date(tenant.trial_end_date).getTime();
    const from = Math.max(ends, new Date(TRIAL_ENFORCEMENT_START).getTime());
    const graceLeft = Math.ceil((from + TRIAL_GRACE_DAYS * 86400000 - Date.now()) / 86400000);
    return { kind: 'GRACE', daysLeft: left, graceLeft };
  }
  if (left <= 7) return { kind: 'ENDING', daysLeft: left };
  return { kind: 'ACTIVE', daysLeft: left };
};

