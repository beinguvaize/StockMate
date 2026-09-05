// Plan hierarchy — aligned with web tenancy.js + bookledger.in pricing.
// FREE < GROWTH < PRO < ENTERPRISE.
//
// STARTER is kept here only for a raw caller that has not been through
// Tenant.effectivePlan. That resolves any unrecognised plan — STARTER
// included — to FREE, matching the web and the database's plan gate. Mobile
// used to rank STARTER as GROWTH and offer modules the server then refused
// to write.
const planOrder = {
  'FREE': 0,
  'STARTER': 1, // legacy alias — treated as GROWTH
  'GROWTH': 1,
  'PRO': 2,
  'ENTERPRISE': 3,
};

// Features and minimum plan required
const featureMinPlan = {
  'dashboard': 'FREE',
  'inventory': 'FREE',
  'sales': 'FREE',
  'pos': 'FREE',
  'clients': 'FREE',
  'expenses': 'FREE',
  'daybook': 'FREE',
  'invoices': 'FREE',
  'purchases': 'GROWTH',
  'suppliers': 'GROWTH',
  'gstr': 'GROWTH',
  'reports': 'GROWTH',
  'payroll': 'GROWTH',
  'hr': 'GROWTH',       // alias — kept for backward compat with existing permission maps
  'estimates': 'GROWTH',
  'orders': 'PRO',
  'accounts': 'PRO',
  'manufacturing': 'PRO',
  'logistics': 'PRO',
  'users': 'ENTERPRISE',
  'audit_log': 'ENTERPRISE',
};

/// Mobile feature key → web module key alias map.
/// Keys that don't appear here map 1:1.
const _featureToModuleKey = <String, String>{
  'logistics': 'vehicles',
  'pos': 'sales',
  'hr': 'payroll',       // mobile legacy key → web module key
};

String _toModuleKey(String feature) => _featureToModuleKey[feature] ?? feature;

/// Faithful port of the web `hasPermission(moduleKey, action)` function.
/// No plan check — pure role/permission logic.
///
/// [moduleKey]   — the web module key (already aliased before calling)
/// [action]      — 'view' or 'edit'
/// [roles]       — list of role strings from the user record
/// [permissions] — optional granular permissions map: { moduleKey: { 'view': bool, 'edit': bool } }
bool hasModulePermission(
  String moduleKey,
  String action, {
  required List<String> roles,
  Map<dynamic, dynamic>? permissions,
}) {
  if (roles.contains('GLOBAL_ADMIN')) return true;
  if (roles.contains('OWNER')) return true;

  if (roles.contains('STAFF')) {
    if (action == 'view') return true;
    return ['sales', 'clients', 'daybook'].contains(moduleKey);
  }

  if (roles.contains('SALES')) {
    return ['sales', 'clients', 'daybook'].contains(moduleKey);
  }

  if (roles.contains('INVENTORY')) {
    return ['inventory', 'purchases', 'suppliers'].contains(moduleKey);
  }

  if (roles.contains('DRIVER')) {
    return ['vehicles', 'sales'].contains(moduleKey);
  }

  // CUSTOM / other roles — check granular permissions object
  if (permissions != null) {
    final modulePerms = permissions[moduleKey];
    if (modulePerms is Map) {
      final val = modulePerms[action];
      return val == true;
    }
  }

  return false;
}

/// Faithful port of the web `hasRole(role)` function.
/// GLOBAL_ADMIN always returns true; otherwise checks exact role membership.
bool hasRole(String role, List<String> roles) {
  if (roles.contains('GLOBAL_ADMIN')) return true;
  return roles.contains(role);
}

/// Returns true if the user can access [feature] for 'view' action AND edit if specified.
///
/// Checks plan gating first (unchanged), then applies the full web role matrix
/// for the 'view' action via [hasModulePermission].
bool canAccess(
  String feature, {
  required List<String> roles,
  required String plan,
  Map<dynamic, dynamic>? permissions,
}) {
  // Plan check — unchanged from original
  final minPlan = featureMinPlan[feature] ?? 'FREE';
  final userPlanLevel = planOrder[plan] ?? 0;
  final requiredPlanLevel = planOrder[minPlan] ?? 0;
  if (userPlanLevel < requiredPlanLevel) return false;

  // Role/permission check using web matrix (view action)
  final moduleKey = _toModuleKey(feature);
  return hasModulePermission(
    moduleKey,
    'view',
    roles: roles,
    permissions: permissions,
  );
}

/// Returns true if the user can edit [feature].
/// Uses the web role matrix with action='edit'.
/// No plan check (caller should use canAccess for plan gate).
bool canEdit(
  String feature, {
  required List<String> roles,
  Map<dynamic, dynamic>? permissions,
}) {
  final moduleKey = _toModuleKey(feature);
  return hasModulePermission(
    moduleKey,
    'edit',
    roles: roles,
    permissions: permissions,
  );
}

/// Returns true if the user's plan meets the feature's minimum plan requirement.
bool planMeetsRequirement(String feature, String plan) {
  final minPlan = featureMinPlan[feature] ?? 'FREE';
  final userPlanLevel = planOrder[plan] ?? 0;
  final requiredPlanLevel = planOrder[minPlan] ?? 0;
  return userPlanLevel >= requiredPlanLevel;
}

/// Returns the minimum plan label for a feature, e.g. "PRO".
String requiredPlanFor(String feature) {
  return featureMinPlan[feature] ?? 'FREE';
}

/// Alias for [requiredPlanFor] — used by desktop shell.
String requiredPlan(String feature) => requiredPlanFor(feature);
