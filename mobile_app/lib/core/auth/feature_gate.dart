// Plan hierarchy
const planOrder = {'STARTER': 0, 'PRO': 1, 'ENTERPRISE': 2};

// Features and minimum plan required
const featureMinPlan = {
  'dashboard': 'STARTER',
  'inventory': 'STARTER',
  'sales': 'STARTER',
  'pos': 'STARTER',
  'clients': 'STARTER',
  'expenses': 'STARTER',
  'daybook': 'STARTER',
  'invoices': 'STARTER',
  'purchases': 'PRO',
  'gstr': 'PRO',
  'reports': 'PRO',
  'hr': 'PRO',
  'logistics': 'ENTERPRISE',
  'users': 'ENTERPRISE',
  'audit_log': 'ENTERPRISE',
};

// Role access — STAFF cannot access these features
const staffBlocked = [
  'reports',
  'gstr',
  'hr',
  'users',
  'audit_log',
  'settings',
];

/// Returns true if the user can access the given feature based on their plan and roles.
/// First checks plan requirement, then role restrictions.
bool canAccess(
  String feature, {
  required List<String> roles,
  required String plan,
}) {
  // Check plan requirement
  final minPlan = featureMinPlan[feature] ?? 'STARTER';
  final userPlanLevel = planOrder[plan] ?? 0;
  final requiredPlanLevel = planOrder[minPlan] ?? 0;
  if (userPlanLevel < requiredPlanLevel) return false;

  // Check role restriction — if user is STAFF (and not OWNER), block staff-restricted features
  final isOwner = roles.contains('OWNER');
  if (!isOwner && roles.contains('STAFF')) {
    if (staffBlocked.contains(feature)) return false;
  }

  return true;
}

/// Returns true if the user's plan meets the feature's minimum plan requirement.
bool planMeetsRequirement(String feature, String plan) {
  final minPlan = featureMinPlan[feature] ?? 'STARTER';
  final userPlanLevel = planOrder[plan] ?? 0;
  final requiredPlanLevel = planOrder[minPlan] ?? 0;
  return userPlanLevel >= requiredPlanLevel;
}

/// Returns the minimum plan label for a feature, e.g. "PRO".
String requiredPlanFor(String feature) {
  return featureMinPlan[feature] ?? 'STARTER';
}

/// Alias for [requiredPlanFor] — used by desktop shell.
String requiredPlan(String feature) => requiredPlanFor(feature);
