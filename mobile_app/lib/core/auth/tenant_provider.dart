import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
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

/// Trial policy. These three must match src/lib/tenancy.js and the database's
/// get_my_effective_plan(); a second, subtly different copy of this logic is
/// exactly the bug this fixes.
const kTrialPlan = 'PRO';
const kTrialGraceDays = 7;
final kTrialEnforcementStart = DateTime.utc(2026, 8, 20);

const _knownPlans = {'FREE', 'GROWTH', 'PRO', 'ENTERPRISE'};

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
      plan: map['plan'] as String? ?? 'FREE',
      status: map['status'] as String? ?? 'ACTIVE',
      trialEndDate: map['trial_end_date'] != null
          ? DateTime.tryParse(map['trial_end_date'] as String)
          : null,
    );
  }

  /// The plan name, or FREE if it is not one we recognise.
  ///
  /// Mirrors the web's `PLANS[stored] ? stored : 'FREE'`. The legacy STARTER
  /// value lands on FREE here, as it does on the web and in the database's
  /// plan gate. Mobile used to rank STARTER alongside GROWTH, which showed
  /// modules the server then refused to write.
  String get knownPlan {
    final p = plan.toUpperCase();
    return _knownPlans.contains(p) ? p : 'FREE';
  }

  /// True the moment the trial's end date passes, grace or not.
  bool get isTrialExpired {
    if (status != 'TRIAL') return false;
    if (trialEndDate == null) return false;
    return DateTime.now().isAfter(trialEndDate!);
  }

  /// True once even the grace window is used up and access should drop.
  ///
  /// Grace runs from the later of the trial's own end and the day enforcement
  /// began, so a trial that lapsed before there was anything to enforce it
  /// still gets the full warning window.
  bool get isTrialLapsed {
    if (status != 'TRIAL' || trialEndDate == null) return false;
    final ends = trialEndDate!.toUtc();
    final from = ends.isAfter(kTrialEnforcementStart) ? ends : kTrialEnforcementStart;
    return DateTime.now().toUtc().isAfter(
          from.add(const Duration(days: kTrialGraceDays)),
        );
  }

  /// The plan to gate on, which is not always the plan stored on the row.
  ///
  ///   not on trial            -> exactly what they pay for
  ///   trial running           -> the BETTER of the stored plan and the trial
  ///                              grant, so an early signup written straight
  ///                              to ENTERPRISE is not resolved DOWN to PRO
  ///   trial lapsed past grace -> FREE
  ///
  /// Mirrors effectivePlan() in src/lib/tenancy.js. Without it mobile passed
  /// the raw stored plan to canAccess, so a Growth trial was refused Pro-only
  /// features from its first day while the web app granted them.
  String get effectivePlan {
    final known = knownPlan;
    if (status != 'TRIAL' || trialEndDate == null) return known;
    if (isTrialLapsed) return 'FREE';
    return (planOrder[kTrialPlan] ?? 0) > (planOrder[known] ?? 0) ? kTrialPlan : known;
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
  /// The plan to gate on — trial grant and grace applied.
  String get plan => tenant.effectivePlan;
  /// The plan as stored on the row, for display and billing copy.
  String get storedPlan => tenant.plan;
  String get tenantId => tenant.id;

  /// Granular permissions map (from users.permissions jsonb). May be null.
  Map<dynamic, dynamic>? get permissions => userProfile.permissions;

  bool get isOwner => userProfile.roles.contains('OWNER');
  bool get isStaff => userProfile.roles.contains('STAFF');
  bool get isTrialExpired => tenant.isTrialExpired;
  bool get isTrialLapsed => tenant.isTrialLapsed;
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

  // Bypass the post-sign-in RLS race by calling a SECURITY DEFINER RPC
  // that returns both user profile and tenant in a single payload.
  // Falls back to direct table reads on older backends.
  Future<TenantContext?> attempt() async {
    try {
      final rpcRes = await supabase
          .rpc('get_my_tenant_context')
          .timeout(const Duration(seconds: 20));
      if (rpcRes != null) {
        final json = Map<String, dynamic>.from(rpcRes as Map);
        final userMap = json['user'] as Map?;
        final tenantMap = json['tenant'] as Map?;
        if (userMap == null) return null;
        final userProfile = UserProfile.fromMap(Map<String, dynamic>.from(userMap));
        if (tenantMap == null || userProfile.tenantId.isEmpty) return null;
        final tenant = Tenant.fromMap(Map<String, dynamic>.from(tenantMap));
        return TenantContext(userProfile: userProfile, tenant: tenant);
      }
    } catch (e) {
      // ignore: avoid_print
      print('[tenantContextProvider] RPC failed, falling back: $e');
    }

    // Fallback: legacy direct reads (RLS gated).
    final userProfileData = await supabase
        .from('users')
        .select()
        .eq('id', userId)
        .maybeSingle()
        .timeout(const Duration(seconds: 20));
    if (userProfileData == null) return null;

    final userProfile = UserProfile.fromMap(userProfileData);
    if (userProfile.tenantId.isEmpty) return null;

    final tenantData = await supabase
        .from('tenants')
        .select()
        .eq('id', userProfile.tenantId)
        .maybeSingle()
        .timeout(const Duration(seconds: 20));
    if (tenantData == null) return null;

    return TenantContext(userProfile: userProfile, tenant: Tenant.fromMap(tenantData));
  }

  try {
    for (var i = 0; i < 3; i++) {
      try {
        final ctx = await attempt();
        if (ctx != null) return ctx;
      } catch (e) {
        // ignore: avoid_print
        print('[tenantContextProvider] attempt ${i + 1} failed: $e');
        if (i == 2) rethrow;
      }
      await Future.delayed(Duration(milliseconds: 800 * (i + 1)));
    }
    return null;
  } catch (e, st) {
    // Network timeout or RLS error — return null so app shows ContactAdmin.
    // Log so the cause is visible in the device's debug console / Crashlytics.
    // ignore: avoid_print
    print('[tenantContextProvider] failed: $e\n$st');
    return null;
  }
});
