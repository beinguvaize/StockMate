/**
 * First-time setup, as steps (approved setup-01 to 13). Pure helpers only:
 * what each step needs before Continue, the state search, and the words the
 * plan cards and the welcome card show. Shop creation itself stays in
 * TenantSetup, exactly as it was.
 */
import { INDIAN_STATES } from './gstStates';

export const SETUP_STEPS = ['Plan', 'Type', 'Name', 'Phone', 'Address', 'State'];

/**
 * May the person leave this step? The same fields the old single form
 * required, one at a time: name, phone and address trimmed, a state picked.
 */
export const canContinue = (step, f) => {
  switch (step) {
    case 1: return !!f.plan;
    case 2: return !!f.businessType;
    case 3: return !!f.businessName?.trim();
    case 4: return !!f.businessPhone?.trim();
    case 5: return !!f.businessAddress?.trim();
    case 6: return !!f.businessState;
    default: return false;
  }
};

/** The old form's submit rule, unchanged: every field present. */
export const canCreate = (f) =>
  !!(f.businessName?.trim() && f.businessPhone?.trim() && f.businessAddress?.trim() && f.businessState);

/** States whose name matches what was typed (case and spaces ignored). */
export const filterStates = (query, list = INDIAN_STATES) => {
  const q = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return list;
  return list.filter((s) => s.name.toLowerCase().includes(q) || s.code === q);
};

/** Plan cards on step 1. Prices and limits match tenancy.js PLANS. */
export const SETUP_PLANS = [
  {
    id: 'FREE', label: 'Free', price: '₹0', per: '', tagline: 'Try everything a single shop needs.',
    features: ['Dashboard, inventory', 'Sales and counter', 'GST invoices', 'Clients, expenses', '100 invoices a month', '1 user'],
    locked: ['Purchases, suppliers', 'Reports, payroll'],
  },
  {
    id: 'GROWTH', label: 'Growth', price: '₹1,999', per: '/ year', tagline: 'For a shop finding its feet.', badge: 'Most popular',
    features: ['All Free features', 'Purchases and suppliers', 'Payroll, reports', 'GSTR export', '1,000 invoices a month', '3 users'],
    locked: ['Vehicles, manufacturing', 'Multi-location stock'],
  },
  {
    id: 'PRO', label: 'Pro', price: '₹2,999', per: '/ year', tagline: 'For growing teams.',
    features: ['All Growth features', 'Vehicles and routes', 'Estimates, manufacturing', 'Multi-location stock', 'Price lists, WAC costing', 'Unlimited invoices, 5 users'],
    locked: ['White label, API'],
  },
  {
    id: 'ENTERPRISE', label: 'Enterprise', price: '₹3,999', per: '/ year', tagline: 'For several locations.',
    features: ['All Pro features', 'User management', 'Audit log', 'API access, white label', 'Priority support', 'Unlimited users'],
    locked: [],
  },
];

export const planLabel = (id) =>
  (SETUP_PLANS.find((p) => p.id === String(id || '').toUpperCase()) || SETUP_PLANS[0]).label;

/**
 * "What is included" on the welcome card, by the plan the shop was created
 * on. STARTER is the old name for GROWTH.
 */
const INCLUDES = {
  FREE: {
    items: ['Dashboard', 'Inventory', 'Sales, counter and GST invoices', 'Clients', 'Expenses and Day Book', '100 invoices a month'],
    more: 'Purchases, suppliers, reports and payroll come with Growth.',
  },
  GROWTH: {
    items: ['Dashboard and reports', 'Inventory and purchases', 'Sales, counter and GST invoices', 'Clients and suppliers', 'Expenses and Day Book', 'Payroll', 'GSTR export', '1,000 invoices a month'],
    more: 'Vehicles, manufacturing and multi-location stock come with Pro.',
  },
  PRO: {
    items: ['Everything in Growth', 'Vehicles and routes', 'Estimates and manufacturing', 'Multi-location stock', 'Price lists and WAC costing', 'Unlimited invoices'],
    more: 'API access, white label and audit log come with Enterprise.',
  },
  ENTERPRISE: {
    items: ['Everything in Pro', 'User management', 'Audit log', 'API access and white label', 'Priority support', 'Unlimited users'],
    more: null,
  },
};

export const welcomeIncludes = (plan) => {
  const p = String(plan || '').toUpperCase();
  return INCLUDES[p === 'STARTER' ? 'GROWTH' : p] || INCLUDES.FREE;
};

/** The four first-day tasks after the shop exists. */
export const ONBOARD_STEPS = [
  { id: 'profile', title: 'Business profile', small: 'GSTIN, logo and bank details for invoices',
    q: 'Add your GST number, logo and bank details', qs: 'They print on every invoice. Takes about two minutes.',
    go: 'Open Settings, Business', path: '/settings' },
  { id: 'product', title: 'First product', small: 'With HSN code and GST rate',
    q: 'Add your first product', qs: 'Include the HSN code and GST rate so bills come out right.',
    go: 'Go to Inventory', path: '/inventory' },
  { id: 'client', title: 'First client', small: 'Save a customer for fast billing',
    q: 'Add your first client', qs: 'Add their GSTIN for B2B bills. Walk-in customers need nothing.',
    go: 'Go to Clients', path: '/clients' },
  { id: 'sale', title: 'First sale', small: 'A counter sale or a GST invoice',
    q: 'Make your first sale', qs: 'A quick counter sale, or a formal GST invoice.',
    go: 'Go to Sales', path: '/sales' },
];

/** Pill on each checklist row: done, the current one, skipped, or still to come. */
export const rowState = (i, current, completed, id) => {
  if (completed.has(id)) return 'done';
  if (i === current) return 'now';
  if (i < current) return 'skipped';
  return 'next';
};
