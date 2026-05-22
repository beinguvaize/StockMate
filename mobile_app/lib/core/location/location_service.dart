import 'package:geolocator/geolocator.dart';
import 'package:mobile_app/core/supabase/client.dart';

/// Last-known-location capture. Best-effort: records the device's GPS
/// position to `vehicle_locations` when a delivery event happens
/// (dispatch, stop completed, reconcile). Never throws — a failed
/// location capture must not block the delivery action.
Future<void> recordVehicleLocation({
  required String tenantId,
  required String vehicleId,
  String? driverId,
}) async {
  try {
    // Location services on?
    if (!await Geolocator.isLocationServiceEnabled()) return;

    // Permission
    LocationPermission perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied ||
        perm == LocationPermission.deniedForever) {
      return;
    }

    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    );

    await supabase.from('vehicle_locations').insert({
      'tenant_id': tenantId,
      'vehicle_id': vehicleId,
      'driver_id': driverId,
      'lat': pos.latitude,
      'lng': pos.longitude,
      'speed': pos.speed,
      'heading': pos.heading,
      'accuracy': pos.accuracy,
    });
  } catch (_) {
    // Best-effort — swallow all errors.
  }
}
