import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/settings/data/models/business_profile.dart';

final businessProfileProvider = FutureProvider<BusinessProfile?>((ref) async {
  final tenantCtx = ref.watch(tenantContextProvider).valueOrNull;
  final tenantId = tenantCtx?.tenantId;

  try {
    final query = supabase.from('business_profile').select();
    final response = tenantId != null
        ? await query.eq('tenant_id', tenantId).maybeSingle()
        : await query.limit(1).maybeSingle();

    if (response == null) return null;
    return BusinessProfile.fromJson(response);
  } catch (e) {
    return null;
  }
});
