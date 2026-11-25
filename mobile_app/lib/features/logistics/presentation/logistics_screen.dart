import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/logistics/data/models/route.dart';
import 'package:mobile_app/features/logistics/data/models/vehicle.dart';
import 'package:mobile_app/features/logistics/presentation/add_vehicle_screen.dart';
import 'package:mobile_app/features/logistics/presentation/delivery_screen.dart';
import 'package:mobile_app/features/logistics/presentation/dispatch_route_screen.dart';
import 'package:mobile_app/features/logistics/presentation/driver_route_screen.dart';
import 'package:mobile_app/features/logistics/presentation/fleet_map_screen.dart';
import 'package:mobile_app/features/logistics/presentation/fleet_stock_screen.dart';
import 'package:mobile_app/features/logistics/presentation/load_van_screen.dart';
import 'package:mobile_app/features/logistics/presentation/providers/logistics_provider.dart';
import 'package:mobile_app/features/logistics/presentation/widgets/vehicle_picture.dart';

const _grey = Color(0xFF7A8088);
const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fleetRouteIcon =
    '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3 3 0 000-6H9a3 3 0 010-6h6.800"/>';
const _pinIcon =
    '<path d="M12 21s7-6.200 7-11a7 7 0 10-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.500"/>';

/// A vehicle's status as the owner reads it: label, pill background, text.
(String, Color, Color) vehicleStatusLook(String? status) =>
    switch ((status ?? '').toUpperCase()) {
      'ACTIVE' => ('Active', const Color(0xFFE3F5EA), const Color(0xFF17663A)),
      'MAINTENANCE' => ('Maintenance', const Color(0xFFFFF1C9), const Color(0xFF8A5A00)),
      'OUT_OF_SERVICE' => ('Out of service', const Color(0xFFFDE2E2), Bl.redDeep),
      '' => ('Unknown', const Color(0xFFEFEEEC), Bl.body),
      final s => (
          '${s[0]}${s.substring(1).toLowerCase().replaceAll('_', ' ')}',
          const Color(0xFFEFEEEC),
          Bl.body,
        ),
    };

/// A route's status as the owner reads it: label, tint, ink.
(String, Color, Color) routeStatusLook(String? status) =>
    switch ((status ?? '').toUpperCase()) {
      'PLANNED' => ('Planned', const Color(0xFFEFEEEC), Bl.body),
      'IN_TRANSIT' => ('In transit', const Color(0xFFE4EEFF), const Color(0xFF1D4E9E)),
      'ACTIVE' => ('Active', const Color(0xFFE4EEFF), const Color(0xFF1D4E9E)),
      'COMPLETED' => ('Completed', const Color(0xFFE3F5EA), const Color(0xFF17663A)),
      'RECONCILED' => ('Reconciled', const Color(0xFFE3F5EA), const Color(0xFF17663A)),
      '' => ('Unknown', const Color(0xFFEFEEEC), Bl.body),
      final s => (
          '${s[0]}${s.substring(1).toLowerCase().replaceAll('_', ' ')}',
          const Color(0xFFEFEEEC),
          Bl.body,
        ),
    };

Widget fleetPill((String, Color, Color) look) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
          color: look.$2, borderRadius: BorderRadius.circular(999)),
      child: Text(look.$1,
          style: Bl.tight(11, w: FontWeight.w600, ls: 0, c: look.$3)),
    );

String fleetDate(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso);
  if (d == null) return '';
  return '${d.day} ${_mon[d.month - 1]}${d.year == DateTime.now().year ? '' : ' ${d.year}'}';
}

String _vehicleLine(Vehicle v) => [
      if ((v.name ?? '').trim().isNotEmpty) v.name!.trim(),
      vehicleKindLabel(vehicleKindOf(v.type)),
    ].join(' · ');

/// "Vehicles" (canvas): the fleet, each vehicle's state, and recent routes.
class LogisticsScreen extends ConsumerStatefulWidget {
  const LogisticsScreen({super.key});

  @override
  ConsumerState<LogisticsScreen> createState() => _LogisticsScreenState();
}

class _LogisticsScreenState extends ConsumerState<LogisticsScreen> {
  static const _routesShown = 5;
  bool _allRoutes = false;

  void _open(Widget screen) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  Widget _shortcut(String icon, String title, String sub, Widget screen) =>
      Expanded(
        child: Semantics(
          button: true,
          label: '$title. $sub',
          excludeSemantics: true,
          child: BlTap(
            onTap: () => _open(screen),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                  color: Bl.tile, borderRadius: BorderRadius.circular(16)),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                        color: Bl.white, shape: BoxShape.circle),
                    child: BlIcon(icon, size: 17, color: Bl.ink3),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: Bl.tight(14, w: FontWeight.w600)),
                        const SizedBox(height: 1),
                        Text(sub,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.inter(11.5, c: _grey)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

  Widget _vehicleCard(Vehicle v, String driver) {
    final kind = vehicleKindOf(v.type);
    final active = (v.status ?? '').toUpperCase() == 'ACTIVE';
    return Semantics(
      button: true,
      label:
          '${v.displayPlate}, ${_vehicleLine(v)}, ${driver.isEmpty ? 'no driver' : driver}, ${vehicleStatusLook(v.status).$1}',
      excludeSemantics: true,
      child: BlTap(
        onTap: () => showBlSheet<void>(
          context: context,
          builder: (_) => _VehicleDetailSheet(vehicle: v, driver: driver),
        ),
        child: Container(
          margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
          decoration: BoxDecoration(
              color: Bl.tile, borderRadius: BorderRadius.circular(18)),
          child: Row(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child:
                        VehiclePicture(kind, opacity: active ? 1 : 0.55),
                  ),
                  Positioned(
                    left: -4,
                    bottom: -6,
                    child: driver.isEmpty
                        ? Container(
                            width: 30,
                            height: 30,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                                color: Bl.white,
                                shape: BoxShape.circle,
                                border: Border.all(
                                    color: const Color(0xFFB8BCC2),
                                    width: 1.5)),
                            child: const BlIcon(BlIcons.plus,
                                size: 12, color: Bl.mute),
                          )
                        : Container(
                            decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border:
                                    Border.all(color: Bl.tile, width: 2.5)),
                            child: BlTintAvatar(driver, size: 25),
                          ),
                  ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(v.displayPlate,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(17, w: FontWeight.w700, ls: 0.01)),
                    const SizedBox(height: 2),
                    Text(_vehicleLine(v),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            Bl.inter(12.5, w: FontWeight.w500, c: Bl.body)),
                    const SizedBox(height: 1),
                    Text(driver.isEmpty ? 'No driver' : driver,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.inter(12, c: _grey)),
                    const SizedBox(height: 7),
                    fleetPill(vehicleStatusLook(v.status)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _routeRow(LogisticRoute r, Map<String, Vehicle> vehicles) {
    final look = routeStatusLook(r.status);
    final place = (r.location ?? '').trim();
    final title = place.isEmpty
        ? 'Route #${r.id.length > 8 ? r.id.substring(0, 8) : r.id}'
        : place;
    final van = vehicles[r.vehicleId]?.name?.trim() ?? '';
    return Semantics(
      button: true,
      label: '$title, ${look.$1}. Open',
      excludeSemantics: true,
      child: BlTap(
        onTap: () => _open(DeliveryScreen(routeId: r.id)),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Bl.sep))),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                    color: look.$2, borderRadius: BorderRadius.circular(12)),
                child: BlIcon(fleetRouteIcon, size: 18, color: look.$3),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(14.5, w: FontWeight.w600)),
                    const SizedBox(height: 1),
                    Text(
                        [fleetDate(r.date), van]
                            .where((s) => s.isNotEmpty)
                            .join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.inter(12, c: _grey)),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              fleetPill(look),
              const SizedBox(width: 6),
              const BlIcon(BlIcons.chevronRight,
                  size: 16, color: Color(0xFFB8BCC2)),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final vehiclesAsync = ref.watch(vehiclesProvider);
    final routesAsync = ref.watch(routesProvider);
    final vehicles = vehiclesAsync.valueOrNull ?? const <Vehicle>[];
    final byId = {for (final v in vehicles) v.id: v};
    final active = vehicles
        .where((v) => (v.status ?? '').toUpperCase() == 'ACTIVE')
        .length;
    final maintenance = vehicles
        .where((v) => (v.status ?? '').toUpperCase() == 'MAINTENANCE')
        .length;
    final routes = [...(routesAsync.valueOrNull ?? const <LogisticRoute>[])]
      ..sort((a, b) => (b.date ?? '').compareTo(a.date ?? ''));
    final shownRoutes =
        _allRoutes ? routes : routes.take(_routesShown).toList();
    final drivers = driversByVehicle(
        routes, ref.watch(fleetDriverNamesProvider).valueOrNull ?? const {});

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Vehicles'),
            Expanded(
              child: RefreshIndicator(
                color: Bl.amber,
                onRefresh: () async {
                  ref.invalidate(vehiclesProvider);
                  ref.invalidate(routesProvider);
                  ref.invalidate(fleetDriverNamesProvider);
                },
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 20),
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                      child: Row(
                        children: [
                          _shortcut(_pinIcon, 'Fleet map',
                              'Last seen places', const FleetMapScreen()),
                          const SizedBox(width: 8),
                          _shortcut(BlIcons.box, 'Van stock',
                              'Stock on board',
                              const FleetStockScreen()),
                        ],
                      ),
                    ),
                    BlGroupHeader(
                        [
                          'Vehicles',
                          if (vehicles.isNotEmpty)
                            [
                              '$active active',
                              if (maintenance > 0)
                                '$maintenance in maintenance',
                            ].join(', '),
                        ].join(' · '),
                        trailing: '${vehicles.length}'),
                    if (vehiclesAsync.hasError && !vehiclesAsync.hasValue)
                      Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                            'Could not load vehicles. Check your internet and try again. (${vehiclesAsync.error})',
                            textAlign: TextAlign.center,
                            style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                      )
                    else if (!vehiclesAsync.hasValue)
                      const SizedBox(
                        height: 140,
                        child: Center(
                            child: CircularProgressIndicator(
                                color: Bl.amber, strokeWidth: 2)),
                      )
                    else if (vehicles.isEmpty)
                      const BlEmpty(
                        icon: BlIcons.truck,
                        title: 'No vehicles yet',
                        message: 'Tap Add vehicle to put your first one in.',
                      ),
                    for (final v in vehicles)
                      _vehicleCard(v, drivers[v.id] ?? ''),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
                      child: Row(
                        children: [
                          Expanded(child: Text('ROUTES', style: Bl.eyebrow)),
                          if (routes.length > _routesShown)
                            BlTap(
                              onTap: () =>
                                  setState(() => _allRoutes = !_allRoutes),
                              child: Text(
                                  _allRoutes ? 'Show fewer' : 'View all',
                                  style: Bl.tight(12.5,
                                      w: FontWeight.w600,
                                      ls: 0,
                                      c: const Color(0xFFB86A0A))),
                            ),
                        ],
                      ),
                    ),
                    if (routesAsync.hasError && !routesAsync.hasValue)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
                        child: Text(
                            'Could not load routes. (${routesAsync.error})',
                            style: Bl.inter(13, c: Bl.redDeep, h: 1.5)),
                      )
                    else if (routesAsync.hasValue && routes.isEmpty)
                      const BlEmpty(
                        icon: fleetRouteIcon,
                        title: 'No routes yet',
                        message:
                            'Open a vehicle and tap Dispatch to start one.',
                      ),
                    for (final r in shownRoutes) _routeRow(r, byId),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: BlButton('Add vehicle',
                  leading: const BlIcon(BlIcons.plus,
                      size: 18, color: Bl.white, stroke: 2.2),
                  onTap: () => _open(const AddVehicleScreen())),
            ),
          ],
        ),
      ),
    );
  }
}

/// The sheet behind a vehicle card (canvas "Vehicle detail"): what it is, who
/// drives it, and what can be done with it.
class _VehicleDetailSheet extends ConsumerWidget {
  final Vehicle vehicle;
  final String driver;
  const _VehicleDetailSheet({required this.vehicle, required this.driver});

  Widget _fact(String label, String value) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
              color: Bl.tile, borderRadius: BorderRadius.circular(12)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: Bl.inter(11.5, w: FontWeight.w500, c: _grey)),
              const SizedBox(height: 2),
              Text(value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Bl.tight(14, w: FontWeight.w600)),
            ],
          ),
        ),
      );

  Widget _action(String icon, String label, VoidCallback onTap,
          {bool primary = false}) =>
      Expanded(
        child: Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: BlTap(
            onTap: onTap,
            child: Column(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                      color: primary ? Bl.brand : Bl.wellSoft,
                      borderRadius: BorderRadius.circular(16)),
                  child: BlIcon(icon,
                      size: 20, color: primary ? Bl.white : Bl.ink3),
                ),
                const SizedBox(height: 6),
                Text(label,
                    maxLines: 1,
                    style: Bl.tight(11.5,
                        w: FontWeight.w600, ls: 0, c: Bl.ink3)),
              ],
            ),
          ),
        ),
      );

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showBlDialog<bool>(
      context: context,
      title: 'Delete this vehicle?',
      message:
          '${vehicle.displayPlate} will be removed from your fleet. Its past routes stay.',
      actions: (ctx) => [
        Row(
          children: [
            Expanded(
              child: BlButton('Cancel',
                  kind: BlButtonKind.soft,
                  onTap: () => Navigator.pop(ctx, false)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Delete',
                  kind: BlButtonKind.danger,
                  onTap: () => Navigator.pop(ctx, true)),
            ),
          ],
        ),
      ],
    );
    if (ok != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    Navigator.pop(context); // close sheet
    try {
      await supabase // soft delete
          .from('vehicles')
          .update({'deleted_at': DateTime.now().toUtc().toIso8601String()})
          .eq('id', vehicle.id);
      ref.invalidate(vehiclesProvider);
    } catch (e) {
      debugPrint('[fleet] vehicle delete failed: $e');
      ref.invalidate(vehiclesProvider);
      messenger.showSnackBar(SnackBar(
        content: Text(
            'May not have been deleted. Check the list before trying again. ($e)'),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 8),
      ));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kind = vehicleKindOf(vehicle.type);
    final capacity = vehicle.capacity;
    final fuel = (vehicle.fuelType ?? '').trim();

    void go(Widget screen) {
      final nav = Navigator.of(context);
      nav.pop();
      nav.push(MaterialPageRoute(builder: (_) => screen));
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 2),
        Center(child: VehiclePictureArrive(kind)),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(vehicle.displayPlate,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(22, w: FontWeight.w700, ls: 0.01)),
                  const SizedBox(height: 2),
                  Text(_vehicleLine(vehicle),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.inter(13, w: FontWeight.w500, c: Bl.body)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            fleetPill(vehicleStatusLook(vehicle.status)),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            _fact('Driver', driver.isEmpty ? 'No driver' : driver),
            const SizedBox(width: 6),
            _fact('Type', vehicleKindLabel(kind)),
            const SizedBox(width: 6),
            _fact(
                'Capacity',
                capacity == null || capacity <= 0
                    ? '—'
                    : '${capacity == capacity.roundToDouble() ? capacity.toStringAsFixed(0) : capacity} kg'),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            _fact(
                'Fuel',
                fuel.isEmpty
                    ? '—'
                    : '${fuel[0].toUpperCase()}${fuel.substring(1).toLowerCase()}'),
            const SizedBox(width: 6),
            _fact('Year', vehicle.year == null ? '—' : '${vehicle.year}'),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            _action(
                BlIcons.box,
                kind == VehicleKind.van ? 'Load van' : 'Load truck',
                () => go(LoadVanScreen(
                    vehicleId: vehicle.id,
                    vehicleName: vehicle.name ?? 'Vehicle')),
                primary: true),
            const SizedBox(width: 6),
            _action(
                fleetRouteIcon,
                'Dispatch',
                () => go(DispatchRouteScreen(
                    vehicleId: vehicle.id,
                    vehicleName: vehicle.name ?? 'Vehicle'))),
            const SizedBox(width: 6),
            _action('<path d="M4 6h16M4 12h16M4 18h10"/>', 'Routes',
                () => go(const DriverRouteScreen())),
            const SizedBox(width: 6),
            _action(BlIcons.check, 'Deliveries',
                () => go(const DeliveryScreen())),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: BlButton('Edit',
                  kind: BlButtonKind.soft,
                  onTap: () => go(AddVehicleScreen(vehicle: vehicle))),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Delete',
                  kind: BlButtonKind.danger,
                  onTap: () => _delete(context, ref)),
            ),
          ],
        ),
      ],
    );
  }
}
