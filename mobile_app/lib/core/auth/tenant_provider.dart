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

  const UserProfile({
    required this.id,
    required this.email,
    required this.name,
    required this.roles,
    required this.tenantId,
  });

  factory UserProfile.fromMap(Map<String, dynamic> map) {
    return UserProfile(
      id: map['id'] as String,
      email: map['email'] as String? ?? '',
      name: map['name'] as String? ?? '',
      roles: List<String>.from(map['roles'] as List? ?? []),
      tenantId: map['tenant_id'] as String? ?? '',
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

  bool get isOwner => userProfile.roles.contains('OWNER');
  bool get isStaff => userProfile.roles.contains('STAFF');
  bool get isTrialExpired => tenant.isTrialExpired;
  int get trialDaysLeft => tenant.trialDaysLeft;
}

/// Type alias for desktop shell compatibility — same as [Tenant].
typedef TenantModel = Tenant;

// Provider
final tenantContextProvider = FutureProvider<TenantContext?>((ref) async {
  final user = ref.watch(userProvider);
  if (user == null) return null;

  // Load user profile
  final userProfileData = await supabase
      .from('users')
      .select()
      .eq('id', user.id)
      .maybeSingle();

  if (userProfileData == null) return null;

  final userProfile = UserProfile.fromMap(userProfileData);
  if (userProfile.tenantId.isEmpty) return null;

  // Load tenant
  final tenantData = await supabase
      .from('tenants')
      .select()
      .eq('id', userProfile.tenantId)
      .maybeSingle();

  if (tenantData == null) return null;

  final tenant = Tenant.fromMap(tenantData);

  return TenantContext(userProfile: userProfile, tenant: tenant);
});
