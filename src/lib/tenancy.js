/**
 * Multi-tenancy configuration & plan-based feature flags.
 * Module gating, plan definitions, and tenant utilities.
 */

// --- Plan Definitions ---
export const PLANS = {
  STARTER: {
    label: 'Starter',
    modules: ['dashboard', 'inventory', 'sales', 'clients', 'expenses', 'daybook', 'invoices'],
    maxUsers: 3,
    color: 'bg-gray-100 text-gray-600'
  },
  PRO: {
    label: 'Pro',
    modules: [
      'dashboard', 'inventory', 'sales', 'clients', 'expenses', 'daybook', 'invoices',
      'purchases', 'suppliers', 'vehicles', 'orders', 'payroll', 'reports'
    ],
    maxUsers: 25,
    color: 'bg-blue-50 text-blue-600'
  },
  ENTERPRISE: {
    label: 'Enterprise',
    modules: [
      'dashboard', 'inventory', 'sales', 'clients', 'expenses', 'daybook', 'invoices',
      'purchases', 'suppliers', 'vehicles', 'orders', 'payroll', 'reports',
      'users', 'settings', 'audit-log'
    ],
    features: ['multi_location_inventory', 'api_access', 'white_label'],
    maxUsers: -1, // Unlimited
    color: 'bg-purple-50 text-purple-600'
  }
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
