/**
 * Multi-tenancy configuration & plan-based feature flags.
 * Module gating, plan definitions, and tenant utilities.
 */

// --- Plan Definitions ---
// maxInvoices: monthly invoice cap (-1 = unlimited)
// maxUsers:    seat cap (-1 = unlimited)
export const PLANS = {
  STARTER: {
    label: 'Starter',
    price: '₹499/mo',
    modules: ['dashboard', 'inventory', 'sales', 'clients', 'expenses', 'daybook', 'invoices'],
    features: [],
    maxUsers: 2,
    maxInvoices: 500,
    color: 'bg-gray-100 text-gray-600',
  },
  PRO: {
    label: 'Professional',
    price: '₹1,499/mo',
    modules: [
      'dashboard', 'inventory', 'sales', 'clients', 'expenses', 'daybook', 'invoices',
      'purchases', 'suppliers', 'vehicles', 'orders', 'payroll', 'reports',
    ],
    features: ['price_lists', 'wac_costing', 'gstr_export'],
    maxUsers: 10,
    maxInvoices: -1,
    color: 'bg-blue-50 text-blue-600',
  },
  ENTERPRISE: {
    label: 'Enterprise',
    price: '₹3,499/mo',
    modules: [
      'dashboard', 'inventory', 'sales', 'clients', 'expenses', 'daybook', 'invoices',
      'purchases', 'suppliers', 'vehicles', 'orders', 'payroll', 'reports',
      'users', 'settings', 'audit-log',
    ],
    features: ['price_lists', 'wac_costing', 'gstr_export', 'multi_location_inventory', 'api_access', 'white_label'],
    maxUsers: -1,
    maxInvoices: -1,
    color: 'bg-purple-50 text-purple-600',
  },
};

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

/**
 * Returns true if tenant is on trial and the 60-day period has expired.
 */
export const isTrialExpired = (tenant) => {
  if (tenant?.status !== 'TRIAL') return false;
  if (!tenant?.trial_end_date) return false;
  return new Date() > new Date(tenant.trial_end_date);
};

/**
 * Returns days remaining in trial (0 if expired or not on trial).
 */
export const trialDaysLeft = (tenant) => {
  if (tenant?.status !== 'TRIAL' || !tenant?.trial_end_date) return 0;
  const diff = new Date(tenant.trial_end_date) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};
