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

/// Employee id → name, for showing who drives a route.
final fleetDriverNamesProvider =
    FutureProvider<Map<String, String>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return const {};
  final rows = await supabase
      .from('employees')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId)
      .isFilter('deleted_at', null);
  return {
    for (final r in rows as List)
      r['id'].toString(): (r['name'] ?? '').toString().trim(),
  };
});

/// Who drives each vehicle: the driver of its route that is out now, or
/// failing that its most recent route. Used when the vehicle has no usual
/// driver saved on it.
Map<String, String> driversByVehicle(
    List<LogisticRoute> routes, Map<String, String> names) {
  const live = {'IN_TRANSIT', 'ACTIVE', 'PLANNED'};
  final sorted = [...routes]..sort((a, b) {
      final al = live.contains((a.status ?? '').toUpperCase()) ? 1 : 0;
      final bl = live.contains((b.status ?? '').toUpperCase()) ? 1 : 0;
      return al != bl ? bl - al : (b.date ?? '').compareTo(a.date ?? '');
    });
  final out = <String, String>{};
  for (final r in sorted) {
    final v = r.vehicleId;
    final name = names[r.driverId] ?? '';
    if (v == null || name.isEmpty || out.containsKey(v)) continue;
    out[v] = name;
  }
  return out;
}
