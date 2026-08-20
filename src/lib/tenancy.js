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
      'estimates', 'manufacturing',
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
      'estimates', 'manufacturing',
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
export const isModuleAvailable = (plan, moduleKey) => {
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

/** True once even the grace period is used up and access should drop. */
export const isTrialLapsed = (tenant) => {
  const left = trialDaysLeft(tenant);
  return left !== null && left <= -TRIAL_GRACE_DAYS;
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
  if (left <= 0) return { kind: 'GRACE', daysLeft: left, graceLeft: TRIAL_GRACE_DAYS + left };
  if (left <= 7) return { kind: 'ENDING', daysLeft: left };
  return { kind: 'ACTIVE', daysLeft: left };
};

