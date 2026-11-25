import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/logistics/data/models/route.dart';
import 'package:mobile_app/features/logistics/data/models/route_stop.dart';
import 'package:mobile_app/features/logistics/presentation/driver_route_screen.dart';
import 'package:mobile_app/features/logistics/presentation/providers/logistics_provider.dart';
import 'package:mobile_app/features/logistics/presentation/widgets/vehicle_picture.dart';

RouteStop _stop(String status, String? notes) => RouteStop(
      id: 's1',
      routeId: 'r1',
      sequence: 1,
      status: status,
      cashCollected: 0,
      notes: notes,
    );

void main() {
  group('failedStopReason', () {
    test('a failed stop keeps its reason', () {
      expect(
          failedStopReason(_stop('NO_SALE', 'Failed: customer unavailable')),
          'customer unavailable');
    });

    test('a plain no-sale is not a failure', () {
      expect(failedStopReason(_stop('NO_SALE', null)), isNull);
      expect(failedStopReason(_stop('NO_SALE', 'Shop was busy')), isNull);
    });

    test('the prefix on a delivered stop does not make it failed', () {
      expect(failedStopReason(_stop('DELIVERED', 'Failed: wrong note')), isNull);
    });

    test('a failure with no reason still reads as one', () {
      expect(failedStopReason(_stop('NO_SALE', 'Failed: ')), 'delivery failed');
    });
  });

  group('vehicleKindOf', () {
    test('anything with truck in it is a mini truck', () {
      expect(vehicleKindOf('MINI_TRUCK'), VehicleKind.miniTruck);
      expect(vehicleKindOf('truck'), VehicleKind.miniTruck);
    });

    test('everything else, including nothing, is a van', () {
      expect(vehicleKindOf('VAN'), VehicleKind.van);
      expect(vehicleKindOf(null), VehicleKind.van);
      expect(vehicleKindOf(''), VehicleKind.van);
    });

    test('the saved value reads back as the same kind', () {
      for (final k in VehicleKind.values) {
        expect(vehicleKindOf(vehicleKindValue(k)), k);
      }
    });
  });

  group('driversByVehicle', () {
    const names = {'e1': 'Rahul More', 'e2': 'Suresh Patel'};
    LogisticRoute route(String id, String v, String d, String status, String date) =>
        LogisticRoute(id: id, vehicleId: v, driverId: d, status: status, date: date);

    test('the route that is out now wins over a newer closed one', () {
      final out = driversByVehicle([
        route('r1', 'v1', 'e2', 'RECONCILED', '2026-11-23'),
        route('r2', 'v1', 'e1', 'IN_TRANSIT', '2026-11-20'),
      ], names);
      expect(out['v1'], 'Rahul More');
    });

    test('with nothing out, the most recent route gives the driver', () {
      final out = driversByVehicle([
        route('r1', 'v1', 'e1', 'RECONCILED', '2026-11-10'),
        route('r2', 'v1', 'e2', 'RECONCILED', '2026-11-20'),
      ], names);
      expect(out['v1'], 'Suresh Patel');
    });

    test('a vehicle with no routes, or an unknown driver, has none', () {
      final out = driversByVehicle(
          [route('r1', 'v1', 'gone', 'IN_TRANSIT', '2026-11-20')], names);
      expect(out, isEmpty);
    });
  });
}
