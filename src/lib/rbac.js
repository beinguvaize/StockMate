// The role matrix, in one place.
// ============================================================================
//
// Two callers used to carry their own copy of this logic and they disagreed:
// AuthContext's hasPermission() decides what the nav and every control render,
// while ProtectedRoute decided what a typed URL opens. The matrix is written in
// terms of the JOB someone does -- sales, inventory, daybook -- but the router
// asked it about PAGE names, which are how plans are sold ('labels' is its own
// Enterprise line item). It has no 'labels', so an INVENTORY-role user saw
// Labels in the nav and got "Security Restricted" on opening it.
//
// Both now import from here, and rbac.test.js pins the two tables against each
// other so they cannot drift apart again.

// Role templates. A template answers for a whole module, not per action: the
// INVENTORY template grants every inventory action, including delete.
export const ROLE_MODULES = {
  STAFF:     ['sales', 'clients', 'daybook'],
  SALES:     ['sales', 'clients', 'daybook'],
  INVENTORY: ['inventory', 'purchases', 'suppliers'],
  DRIVER:    ['vehicles', 'sales'],
};

// Which module the ROLE MATRIX should be asked about for a given route path,
// where that differs from the module the PLAN gate is asked about.
//
// Keep this in step with AppLayout's navItem() module argument: the nav decides
// whether someone is offered the link, so the router must judge the same page
// by the same key or the two disagree on screen.
//
// Do NOT fold these into tenancy.js module lists instead. `inventory` ships in
// every plan down to Free while `labels` is Enterprise-only, so pointing the
// plan gate at the role key would hand out paid pages.
export const RBAC_MODULE_MAP = {
  labels:        'inventory',   // Barcode & Labels is inventory work
  manufacturing: 'inventory',   // production orders consume stock
  invoices:      'sales',       // issuing an invoice is a sale
  estimates:     'sales',
  appointments:  'sales',       // booking a slot is the service sale
  kds:           'sales',       // the kitchen works the sales queue
  accounts:      'daybook',     // Cash & Bank is the day book's other face
};

/**
 * Does this user may-write/may-view `moduleKey`?
 *
 * @param user       the currentUser row: { roles, permissions }
 * @param moduleKey  a MODULE name from the matrix, never a page name
 * @param action     'view' | 'create' | 'edit' | 'delete'
 */
export const permits = (user, moduleKey, action = 'view') => {
  if (!user) return false;
  const roles = user.roles || [];
  if (roles.includes('GLOBAL_ADMIN')) return true;
  if (roles.includes('OWNER')) return true;
  // STAFF reads everything and writes only its own three modules.
  if (roles.includes('STAFF')) {
    if (action === 'view') return true;
    return ROLE_MODULES.STAFF.includes(moduleKey);
  }
  // The remaining templates are module-scoped for every action, view included
  // -- a SALES or INVENTORY user has no dashboard, by design (privacy).
  for (const role of ['SALES', 'INVENTORY', 'DRIVER']) {
    if (roles.includes(role)) return ROLE_MODULES[role].includes(moduleKey);
  }
  // CUSTOM (and any other role): the granular permissions object.
  const perms = user.permissions;
  if (perms && typeof perms === 'object') {
    const mod = perms[moduleKey];
    if (mod && typeof mod === 'object') return !!mod[action];
  }
  return false;
};
