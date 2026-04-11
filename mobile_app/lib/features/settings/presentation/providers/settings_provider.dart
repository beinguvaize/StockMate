import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/settings/data/models/business_profile.dart';

final businessProfileProvider = FutureProvider<BusinessProfile?>((ref) async {
  final response = await supabase.from('business_profile').select().limit(1);
  if ((response as List).isEmpty) return null;
  return BusinessProfile.fromJson(response.first);
});
