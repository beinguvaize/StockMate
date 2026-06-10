import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/logistics/data/models/route.dart';
import 'package:mobile_app/features/logistics/data/models/vehicle.dart';

final routesProvider = FutureProvider<List<LogisticRoute>>((ref) async {
  final response = await supabase.from('routes').select();
  return (response as List).map((data) => LogisticRoute.fromJson(data)).toList();
});

final vehiclesProvider = FutureProvider<List<Vehicle>>((ref) async {
  final response = await supabase.from('vehicles').select().isFilter('deleted_at', null);
  return (response as List).map((data) => Vehicle.fromJson(data)).toList();
});
