import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/auth/data/auth_provider.dart';

// Models
class UserProfile {
  final String id;
  final String email;
  final String name;
  final List<String> roles;
  final String tenantId;
  /// Granular permissions map from the `permissions` jsonb column on the users table.
  /// Shape: { moduleKey: { 'view': bool, 'edit': bool } }
  /// Null when the column is absent or the value is null/not a map.
  final Map<dynamic, dynamic>? permissions;

  const UserProfile({
    required this.id,
    required this.email,
    required this.name,
    required this.roles,
    required this.tenantId,
    this.permissions,
  });

  factory UserProfile.fromMap(Map<String, dynamic> map) {
    final rawPerms = map['permissions'];
    return UserProfile(
      id: map['id'] as String,
      email: map['email'] as String? ?? '',
      name: map['name'] as String? ?? '',
      roles: List<String>.from(map['roles'] as List? ?? []),
      tenantId: map['tenant_id'] as String? ?? '',
      permissions: rawPerms is Map ? rawPerms : null,
    );
  }
}

class Tenant {
  final String id;
  final String name;
  final String slug;
  final String plan;
  final String status;
  final DateTime? trialEndDate;

  const Tenant({
    required this.id,
    required this.name,
    required this.slug,
    required this.plan,
    required this.status,
    this.trialEndDate,
  });

  factory Tenant.fromMap(Map<String, dynamic> map) {
    return Tenant(
      id: map['id'] as String,
      name: map['name'] as String? ?? '',
      slug: map['slug'] as String? ?? '',
      plan: map['plan'] as String? ?? 'STARTER',
      status: map['status'] as String? ?? 'ACTIVE',
      trialEndDate: map['trial_end_date'] != null
          ? DateTime.tryParse(map['trial_end_date'] as String)
          : null,
    );
  }

  bool get isTrialExpired {
    if (status != 'TRIAL') return false;
    if (trialEndDate == null) return false;
    return DateTime.now().isAfter(trialEndDate!);
  }

  int get trialDaysLeft {
    if (trialEndDate == null) return 0;
    final diff = trialEndDate!.difference(DateTime.now()).inDays;
    return diff < 0 ? 0 : diff;
  }
}

class TenantContext {
  final UserProfile userProfile;
  final Tenant tenant;

  const TenantContext({required this.userProfile, required this.tenant});

  List<String> get userRoles => userProfile.roles;
  // Alias for desktop shell compatibility
  List<String> get roles => userProfile.roles;
  String get plan => tenant.plan;
  String get tenantId => tenant.id;

  /// Granular permissions map (from users.permissions jsonb). May be null.
  Map<dynamic, dynamic>? get permissions => userProfile.permissions;

  bool get isOwner => userProfile.roles.contains('OWNER');
  bool get isStaff => userProfile.roles.contains('STAFF');
  bool get isTrialExpired => tenant.isTrialExpired;
  int get trialDaysLeft => tenant.trialDaysLeft;
}

/// Type alias for desktop shell compatibility — same as [Tenant].
typedef TenantModel = Tenant;

// Provider
final tenantContextProvider = FutureProvider<TenantContext?>((ref) async {
  // Watch only the user ID (stable string) — not the full User object.
  // This prevents re-running the Supabase fetch on every token-refresh
  // event that emits a new Session/User object with the same user ID.
  final userId = ref.watch(userIdProvider);
  if (userId == null) return null;

  try {
    // Load user profile — 8s timeout so emulator network never hangs forever
    final userProfileData = await supabase
        .from('users')
        .select()
        .eq('id', userId)
        .maybeSingle()
        .timeout(const Duration(seconds: 20));

    if (userProfileData == null) return null;

    final userProfile = UserProfile.fromMap(userProfileData);
    if (userProfile.tenantId.isEmpty) return null;

    // Load tenant
    final tenantData = await supabase
        .from('tenants')
        .select()
        .eq('id', userProfile.tenantId)
        .maybeSingle()
        .timeout(const Duration(seconds: 20));

    if (tenantData == null) return null;

    final tenant = Tenant.fromMap(tenantData);

    return TenantContext(userProfile: userProfile, tenant: tenant);
  } catch (e, st) {
    // Network timeout or RLS error — return null so app shows ContactAdmin.
    // Log so the cause is visible in the device's debug console / Crashlytics.
    // ignore: avoid_print
    print('[tenantContextProvider] failed: $e\n$st');
    return null;
  }
});
