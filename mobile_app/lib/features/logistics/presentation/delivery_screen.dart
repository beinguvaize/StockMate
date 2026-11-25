import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/logistics/presentation/logistics_screen.dart'
    show fleetDate, fleetPill, fleetRouteIcon, routeStatusLook;
import 'package:mobile_app/features/logistics/presentation/providers/driver_provider.dart'
    show driverEmployeeIdProvider;
import 'package:mobile_app/features/logistics/presentation/providers/logistics_provider.dart';

/// "Route Management" (canvas): each route with where it is in its life
/// (planned, in transit, reconciled) and the one thing to do next.
class DeliveryScreen extends ConsumerStatefulWidget {
  /// When provided, shows only this route. When null, shows all routes for
  /// the current user that are in PLANNED or IN_TRANSIT state.
  final String? routeId;
  const DeliveryScreen({super.key, this.routeId});

  @override
  ConsumerState<DeliveryScreen> createState() => _DeliveryScreenState();
}

class _DeliveryScreenState extends ConsumerState<DeliveryScreen> {
  // One pair of fields per route. A single shared pair meant two routes in
  // transit showed, and could be closed with, each other's figures.
  final Map<String, TextEditingController> _odometer = {};
  final Map<String, TextEditingController> _cash = {};
  List<Map<String, dynamic>> _routes = [];
  bool _loading = true;
  String? _error;
  String? _busyId;

  TextEditingController _odo(String id) =>
      _odometer.putIfAbsent(id, TextEditingController.new);
  TextEditingController _cashFor(String id) =>
      _cash.putIfAbsent(id, TextEditingController.new);

  @override
  void initState() {
    super.initState();
    _loadRoutes();
  }

  @override
  void dispose() {
    for (final c in [..._odometer.values, ..._cash.values]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadRoutes() async {
    setState(() { _loading = true; _error = null; });
    try {
      final userId = supabase.auth.currentUser?.id;
      var query = supabase.from('routes').select('*');

      if (widget.routeId != null) {
        query = query.eq('id', widget.routeId!);
      } else if (userId != null) {
        // Show routes for this driver that are not yet reconciled
        // routes has driverId only. Naming driver_id as well made Postgres
        // reject the read (42703), so this list never loaded. A driver is
        // recorded by login id or by employee id, so both are matched.
        final empId = await ref.read(driverEmployeeIdProvider.future);
        query = query
            .inFilter('driverId', [userId, if (empId != null) empId])
            .inFilter('status', ['PLANNED', 'IN_TRANSIT', 'ACTIVE']);
      }

      final res = await query.order('created_at', ascending: false);
      if (mounted) setState(() { _routes = List<Map<String, dynamic>>.from(res); _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _say(String msg, {bool long = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      behavior: SnackBarBehavior.floating,
      duration: Duration(seconds: long ? 8 : 4),
    ));
  }

  Future<void> _updateStatus(String id, String status) async {
    if (_busyId != null) return;
    setState(() => _busyId = id);
    try {
      await supabase.from('routes').update({'status': status}).eq('id', id);
      ref.invalidate(routesProvider);
      await _loadRoutes();
    } catch (e) {
      debugPrint('[fleet] route status update failed: $e');
      _say('May not have started. Check the route before trying again. ($e)',
          long: true);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _completeRoute(String id) async {
    if (_busyId != null) return;
    if (_odo(id).text.isEmpty) {
      _say('Enter the final odometer reading first.');
      return;
    }
    final odo = double.tryParse(_odo(id).text) ?? 0;
    setState(() => _busyId = id);

    // Resolve tenantId
    final session = supabase.auth.currentSession;
    String? tenantId = session?.user.userMetadata?['tenant_id'] as String?;
    if (tenantId == null || tenantId.isEmpty) {
      final uid = supabase.auth.currentUser?.id;
      if (uid != null) {
        final row = await supabase.from('users').select('tenant_id').eq('id', uid).maybeSingle();
        tenantId = row?['tenant_id'] as String?;
      }
    }

    try {
      await supabase.rpc('reconcile_vehicle_route', params: {
        'p_route_id':       id,
        'p_final_odometer': odo,
        'p_returned_stock': <dynamic>[],  // stock stays on van by default
        'p_actual_cash':    double.tryParse(_cashFor(id).text) ?? 0,
        'p_tenant_id':      tenantId,
      });
      _odo(id).clear();
      _cashFor(id).clear();
      ref.invalidate(routesProvider);
      await _loadRoutes();
    } catch (e) {
      debugPrint('[fleet] route reconcile failed: $e');
      _say(
          'May not have closed. Check the route before trying again. ($e)',
          long: true);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  /// Planned → In transit → Reconciled, with the steps reached filled in.
  Widget _tracker(int reached) {
    const labels = ['Planned', 'In transit', 'Reconciled'];
    Widget dot(int i) => Container(
          width: 20,
          height: 20,
          alignment: Alignment.center,
          decoration: BoxDecoration(
              color: i <= reached ? Bl.ink : Bl.white,
              shape: BoxShape.circle,
              border: i <= reached
                  ? null
                  : Border.all(color: const Color(0xFFCFCFCF), width: 1.5)),
          child: i <= reached
              ? const BlIcon(BlIcons.check,
                  size: 11, color: Bl.white, stroke: 3)
              : null,
        );
    Widget bar(int i) => Expanded(
          child: Container(
              height: 2,
              color: i < reached ? Bl.ink : const Color(0xFFE6E5E3)),
        );
    return Semantics(
      label: 'Stage: ${labels[reached]}',
      excludeSemantics: true,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(children: [dot(0), bar(0), dot(1), bar(1), dot(2)]),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              for (var i = 0; i < 3; i++)
                Expanded(
                  child: Text(labels[i],
                      textAlign: i == 0
                          ? TextAlign.left
                          : i == 2
                              ? TextAlign.right
                              : TextAlign.center,
                      style: Bl.inter(11.5,
                          w: i == reached ? FontWeight.w600 : FontWeight.w500,
                          c: i <= reached
                              ? Bl.ink
                              : const Color(0xFF8A9099))),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _routeCard(Map<String, dynamic> route, Map<String, String> vans) {
    final id = route['id'] as String? ?? '';
    final status = ((route['status'] as String?) ?? 'PLANNED').toUpperCase();
    final place = ((route['location'] as String?) ?? '').trim();
    final van = vans[(route['vehicleId'] ?? route['vehicle_id'])?.toString()] ?? '';
    final look = routeStatusLook(status);
    final reached = status == 'IN_TRANSIT'
        ? 1
        : (status == 'PLANNED' || status == 'ACTIVE')
            ? 0
            : 2;
    final busy = _busyId == id;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: Bl.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE6E5E3))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
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
                    Text(
                        place.isEmpty
                            ? 'Route #${id.length >= 8 ? id.substring(0, 8) : id}'
                            : place,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(15, w: FontWeight.w600)),
                    const SizedBox(height: 1),
                    Text(
                        [fleetDate(route['date'] as String?), van]
                            .where((s) => s.isNotEmpty)
                            .join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            Bl.inter(12, c: const Color(0xFF7A8088))),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              fleetPill(look),
            ],
          ),
          const SizedBox(height: 14),
          _tracker(reached),
          if (reached == 0) ...[
            const SizedBox(height: 14),
            BlButton('Start transit',
                kind: BlButtonKind.soft,
                loading: busy,
                onTap: _busyId != null
                    ? null
                    : () => _updateStatus(id, 'IN_TRANSIT')),
          ] else if (reached == 1) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: BlField(
                    label: 'Final odometer',
                    hint: '0',
                    controller: _odo(id),
                    keyboardType: const TextInputType.numberWithOptions(
                        decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                          RegExp(r'^\d*\.?\d{0,1}')),
                    ],
                    trailing: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Text('km',
                          style: Bl.inter(13,
                              w: FontWeight.w500,
                              c: const Color(0xFF7A8088))),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: BlField(
                    label: 'Cash collected',
                    hint: '0',
                    prefix: '₹',
                    controller: _cashFor(id),
                    keyboardType: const TextInputType.numberWithOptions(
                        decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                          RegExp(r'^\d*\.?\d{0,2}')),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            BlSlide('Slide to complete and reconcile',
                enabled: _busyId == null,
                onConfirmed: () => _completeRoute(id)),
          ] else ...[
            const SizedBox(height: 14),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              decoration: BoxDecoration(
                  color: const Color(0xFFE3F5EA),
                  borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  const BlIcon(BlIcons.check,
                      size: 18, color: Color(0xFF17663A), stroke: 2.6),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                        route['actual_cash'] == null
                            ? 'Route closed and reconciled'
                            : 'Route closed and reconciled · ${Money.inr((route['actual_cash'] as num?) ?? 0)} cash',
                        style: Bl.tight(13.5,
                            w: FontWeight.w600,
                            c: const Color(0xFF17663A))),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final vans = <String, String>{
      for (final v in ref.watch(vehiclesProvider).valueOrNull ?? const [])
        v.id: (v.name ?? '').trim(),
    };
    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Route Management'),
            Expanded(
              child: _loading && _routes.isEmpty
                  ? const Center(
                      child: CircularProgressIndicator(
                          color: Bl.amber, strokeWidth: 2))
                  : _error != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                                'Could not load routes. Check your internet and try again. ($_error)',
                                textAlign: TextAlign.center,
                                style:
                                    Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                          ),
                        )
                      : RefreshIndicator(
                          color: Bl.amber,
                          onRefresh: _loadRoutes,
                          child: ListView(
                            padding: const EdgeInsets.only(bottom: 24),
                            children: [
                              if (_routes.isEmpty)
                                const BlEmpty(
                                  icon: fleetRouteIcon,
                                  title: 'No routes to manage',
                                  message:
                                      'Routes you are driving, or one you open from Vehicles, show here.',
                                ),
                              for (final r in _routes) _routeCard(r, vans),
                            ],
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
