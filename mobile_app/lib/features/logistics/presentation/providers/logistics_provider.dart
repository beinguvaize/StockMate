import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/offline_reads.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/logistics/data/models/route.dart';
import 'package:mobile_app/features/logistics/data/models/vehicle.dart';
import 'package:mobile_app/main.dart' show databaseProvider;

final routesProvider = FutureProvider<List<LogisticRoute>>((ref) async {
  final response = await supabase.from('routes').select();
  return (response as List).map((data) => LogisticRoute.fromJson(data)).toList();
});

final vehiclesProvider = FutureProvider<List<Vehicle>>((ref) async {
  try {
    final response = await supabase.from('vehicles').select().isFilter('deleted_at', null);
    return (response as List).map((data) => Vehicle.fromJson(data)).toList();
  } catch (e) {
    debugPrint('[vehiclesProvider] online failed, using Drift cache: $e');
    final ctx = await ref.read(tenantContextProvider.future);
    if (ctx == null) return [];
    final rows = await cachedVehicles(ref.read(databaseProvider), ctx.tenantId);
    return rows.map(Vehicle.fromJson).toList();
  }
});
