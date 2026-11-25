import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/location/location_service.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/logistics/data/models/route.dart';
import 'package:mobile_app/features/logistics/data/models/route_stop.dart';
import 'package:mobile_app/features/logistics/presentation/logistics_screen.dart'
    show fleetDate, fleetPill;
import 'package:mobile_app/features/logistics/presentation/providers/driver_provider.dart';
import 'package:mobile_app/features/logistics/presentation/providers/logistics_provider.dart';
import 'package:mobile_app/features/logistics/presentation/van_stock_screen.dart';
import 'package:mobile_app/features/logistics/presentation/widgets/vehicle_picture.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart';

const _grey = Color(0xFF7A8088);
const _green = Color(0xFF1E9E5A);
const _amberDeep = Color(0xFF8A5A00);

/// A failed stop is stored as NO_SALE (the status column has no FAILED) with
/// its reason in the notes behind this prefix, so the stop keeps the reason
/// and the screen can tell a failed delivery from a plain "no sale".
const failedStopPrefix = 'Failed: ';

/// The reason a stop failed, or null when it did not fail.
String? failedStopReason(RouteStop s) {
  final n = (s.notes ?? '').trim();
  final mark = failedStopPrefix.trim();
  if (s.status != 'NO_SALE' || !n.startsWith(mark)) return null;
  final reason = n.substring(mark.length).trim();
  return reason.isEmpty ? 'delivery failed' : reason;
}

String _time(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '$h:${d.minute.toString().padLeft(2, '0')} ${d.hour >= 12 ? 'pm' : 'am'}';
}

/// "My Route" (canvas): the driver's stops for the route they were sent on,
/// one at a time, with what happened at each.
class DriverRouteScreen extends ConsumerStatefulWidget {
  /// True when shown as a tab inside the shell, which draws the header.
  final bool embedded;
  const DriverRouteScreen({super.key, this.embedded = false});

  @override
  ConsumerState<DriverRouteScreen> createState() => _DriverRouteScreenState();
}

class _DriverRouteScreenState extends ConsumerState<DriverRouteScreen> {
  // The stop the driver chose to work on; the first pending one otherwise.
  String? _chosenStopId;

  Future<void> _quickSale(LogisticRoute route) async {
    final nav = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    String? locationId;
    try {
      // Look up van's inventory location, then open AddSaleScreen
      final locRes = await supabase
          .from('inventory_locations')
          .select('id').isFilter('deleted_at', null)
          .eq('type', 'VEHICLE')
          .eq('reference_id', route.vehicleId ?? '')
          .maybeSingle();
      locationId = locRes?['id'] as String?;
    } catch (e) {
      debugPrint('[my route] van location lookup failed: $e');
      messenger.showSnackBar(SnackBar(
        content: Text(
            'Could not find this van\'s stock. Check your internet and try again. ($e)'),
        behavior: SnackBarBehavior.floating,
      ));
      return;
    }
    if (!mounted) return;
    nav.push(MaterialPageRoute(
      builder: (_) => AddSaleScreen(
        vehicleId:  route.vehicleId,
        locationId: locationId,
        routeId:    route.id,
      ),
    ));
  }

  Widget _doneRow(RouteStop s) {
    final failed = failedStopReason(s);
    final (String label, Color tint, Color ink, String icon) = failed != null
        ? ('Failed', const Color(0xFFFFF1C9), _amberDeep, '<path d="M12 6v7M12 17v.500"/>')
        : switch (s.status) {
            'DELIVERED' => ('Delivered', const Color(0xFFE3F5EA), const Color(0xFF17663A), BlIcons.check),
            'PARTIAL' => ('Partial', const Color(0xFFE4EEFF), const Color(0xFF1D4E9E), BlIcons.minus),
            'NO_SALE' => ('No sale', const Color(0xFFFDE2E2), Bl.redDeep, BlIcons.close),
            _ => ('Closed', const Color(0xFFEFEEEC), Bl.body, BlIcons.check),
          };
    final dot = failed != null
        ? Bl.brand
        : s.status == 'DELIVERED'
            ? _green
            : ink;
    final time = _time(s.visitedAt);
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 10),
      child: Row(
        crossAxisAlignment: failed != null
            ? CrossAxisAlignment.start
            : CrossAxisAlignment.center,
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
            child: BlIcon(icon, size: 13, color: Bl.white, stroke: 3),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.clientName ?? 'Unknown client',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(14.5, w: FontWeight.w600)),
                if (failed != null) ...[
                  const SizedBox(height: 2),
                  Text('$failedStopPrefix$failed',
                      style: Bl.inter(12.5,
                          w: FontWeight.w500, c: _amberDeep)),
                ],
                const SizedBox(height: 1),
                Text(
                    [
                      if (s.cashCollected > 0) Money.inr(s.cashCollected),
                      if (time.isNotEmpty) time,
                      if (failed != null && s.invoiceId != null)
                        'back in queue for next dispatch',
                    ].join(' · '),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.inter(12, c: _grey)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          fleetPill((label, tint, ink)),
        ],
      ),
    );
  }

  Widget _waitingRow(RouteStop s, {required bool next}) => Semantics(
        button: true,
        label: '${s.clientName ?? 'Unknown client'}. Do this stop now',
        excludeSemantics: true,
        child: BlTap(
          onTap: () => setState(() => _chosenStopId = s.id),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 10),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                      color: Color(0xFFEFEEEC), shape: BoxShape.circle),
                  child: Text('${s.sequence}',
                      style: Bl.tight(12.5,
                          w: FontWeight.w700, ls: 0, c: Bl.body)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(s.clientName ?? 'Unknown client',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(14.5, w: FontWeight.w600)),
                ),
                if (next)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                        color: const Color(0xFFEFEEEC),
                        borderRadius: BorderRadius.circular(999)),
                    child: Text('Next',
                        style: Bl.tight(11,
                            w: FontWeight.w600, ls: 0, c: Bl.body)),
                  ),
              ],
            ),
          ),
        ),
      );

  Widget _routeBody(LogisticRoute route, List<RouteStop> stops) {
    final vehicle = ref
        .watch(vehiclesProvider)
        .valueOrNull
        ?.where((v) => v.id == route.vehicleId)
        .firstOrNull;
    final plate = vehicle == null || vehicle.displayPlate == '—'
        ? ''
        : vehicle.displayPlate;
    final pending = stops.where((s) => s.status == 'PENDING').toList();
    final current = pending.where((s) => s.id == _chosenStopId).firstOrNull ??
        pending.firstOrNull;
    final nextUp = pending.where((s) => s.id != current?.id).firstOrNull;
    final visited = stops.length - pending.length;
    final failed = stops.where((s) => failedStopReason(s) != null).length;
    final collected = stops.fold<double>(0, (t, s) => t + s.cashCollected);
    final place = (route.location ?? '').trim();

    void openVanStock() {
      if (route.vehicleId == null) return;
      Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => VanStockScreen(vehicleId: route.vehicleId!)));
    }

    return ListView(
      padding: EdgeInsets.only(bottom: widget.embedded ? 120 : 24),
      children: [
        Container(
          margin: const EdgeInsets.fromLTRB(14, 8, 14, 0),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
              color: Bl.tile, borderRadius: BorderRadius.circular(18)),
          child: Column(
            children: [
              Row(
                children: [
                  Semantics(
                    button: true,
                    label: 'See what is on the van',
                    excludeSemantics: true,
                    child: BlTap(
                      onTap: openVanStock,
                      child: Container(
                        width: 58,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                            color: Bl.white,
                            borderRadius: BorderRadius.circular(12)),
                        child: VehiclePicture(vehicleKindOf(vehicle?.type),
                            width: 52),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(place.isEmpty ? 'Active route' : place,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.tight(16,
                                w: FontWeight.w700, ls: -0.01)),
                        const SizedBox(height: 1),
                        Text(
                            [
                              fleetDate(route.date),
                              '${stops.length} stop${stops.length == 1 ? '' : 's'}',
                              plate,
                            ].where((s) => s.isNotEmpty).join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.inter(12, c: _grey)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  fleetPill((
                    'Active',
                    const Color(0xFFE3F5EA),
                    const Color(0xFF17663A)
                  )),
                ],
              ),
              if (stops.isNotEmpty) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    for (var i = 0; i < stops.length; i++)
                      Expanded(
                        child: Container(
                          height: 5,
                          margin: EdgeInsets.only(
                              right: i == stops.length - 1
                                  ? 0
                                  : (stops.length > 24 ? 1 : 4)),
                          decoration: BoxDecoration(
                              color: stops[i].status == 'PENDING'
                                  ? const Color(0xFFDDDCDA)
                                  : stops[i].status == 'DELIVERED' ||
                                          stops[i].status == 'PARTIAL'
                                      ? _green
                                      : Bl.brand,
                              borderRadius: BorderRadius.circular(3)),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 7),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                          failed > 0
                              ? '$visited of ${stops.length} stops visited · $failed failed'
                              : '$visited of ${stops.length} stop${stops.length == 1 ? '' : 's'} done',
                          style: Bl.inter(12,
                              w: FontWeight.w500, c: Bl.body)),
                    ),
                    Text('${Money.inr(collected)} collected',
                        style: Bl.tight(12.5, w: FontWeight.w600)),
                  ],
                ),
              ],
            ],
          ),
        ),
        if (stops.isEmpty)
          const BlEmpty(
            icon: BlIcons.truck,
            title: 'No delivery stops on this route',
            message: 'You can still sell from the van.',
          ),
        for (final s in stops)
          if (s.status != 'PENDING')
            _doneRow(s)
          else if (s.id == current?.id)
            _StopCard(
                key: ValueKey(s.id), stop: s, vehicleId: route.vehicleId)
          else
            _waitingRow(s, next: s.id == nextUp?.id),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
          child: BlButton('Quick sale',
              kind: BlButtonKind.soft,
              leading: const BlIcon(BlIcons.plus, size: 16, stroke: 2.2),
              onTap: () => _quickSale(route)),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final routeAsync = ref.watch(activeRouteProvider);
    final route = routeAsync.valueOrNull;

    final body = routeAsync.when(
      skipLoadingOnReload: true,
      loading: () => const Center(
          child: CircularProgressIndicator(color: Bl.amber, strokeWidth: 2)),
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
              'Could not load your route. Check your internet and try again. ($e)',
              textAlign: TextAlign.center,
              style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
        ),
      ),
      data: (route) {
        if (route == null) return const _NoRouteView();
        final stopsAsync = ref.watch(routeStopsProvider(route.id));
        return stopsAsync.when(
          skipLoadingOnReload: true,
          loading: () => const Center(
              child:
                  CircularProgressIndicator(color: Bl.amber, strokeWidth: 2)),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                  'Could not load the stops. Check your internet and try again. ($e)',
                  textAlign: TextAlign.center,
                  style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
            ),
          ),
          data: (stops) => _routeBody(route, stops),
        );
      },
    );

    if (widget.embedded) return ColoredBox(color: Bl.white, child: body);
    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(
              title: 'My Route',
              trailing: route?.vehicleId == null
                  ? null
                  : BlRoundButton(BlIcons.box,
                      label: 'Van stock',
                      onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => VanStockScreen(
                                  vehicleId: route!.vehicleId!)))),
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

// ── The stop being done now ──────────────────────────────────────────────────
class _StopCard extends ConsumerStatefulWidget {
  final RouteStop stop;
  final String? vehicleId;
  const _StopCard({super.key, required this.stop, this.vehicleId});

  @override
  ConsumerState<_StopCard> createState() => _StopCardState();
}

class _StopCardState extends ConsumerState<_StopCard> {
  static const _quickReasons = [
    'Customer unavailable',
    'Shop closed',
    'Refused goods',
  ];
  final _cashController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _cashController.dispose();
    super.dispose();
  }

  double get _cash => double.tryParse(_cashController.text) ?? 0;

  /// A failure here may still have reached the server, so it never claims
  /// the stop was left untouched.
  void _unsure(Object e) {
    debugPrint('[my route] stop update failed: $e');
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(
          'May not have saved. Check this stop before trying again. ($e)'),
      behavior: SnackBarBehavior.floating,
      duration: const Duration(seconds: 8),
    ));
  }

  Future<void> _markStatus(String status) async {
    setState(() => _loading = true);
    try {
      await updateStopStatus(
        widget.stop.id,
        status,
        cashCollected: _cash,
      );
    } catch (e) {
      _unsure(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Failed delivery — re-queue the invoice for a future dispatch and
  // record the reason (mirrors the web markFailedDelivery flow).
  Future<void> _markFailed() async {
    final reason = await _askFailReason();
    if (reason == null) return; // cancelled
    setState(() => _loading = true);
    try {
      final invId = widget.stop.invoiceId;
      final why = reason.isEmpty ? 'Delivery failed' : reason;
      if (invId != null) {
        await supabase.from('invoices').update({
          'delivery_status':        'PENDING',
          'failed_delivery_reason': why,
          'vehicle_route_id':       null,
        }).eq('id', invId);
      }
      // The reason is written on the stop as well. It used to go only on the
      // invoice, so the stop itself read as a plain "no sale" with no cause.
      await updateStopStatus(widget.stop.id, 'NO_SALE',
          cashCollected: 0,
          notes:
              '$failedStopPrefix${why[0].toLowerCase()}${why.substring(1)}');
      await _captureLocation();
    } catch (e) {
      _unsure(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _dialogHead(String icon, Color tint, Color ink, String title,
          String line, String sub) =>
      Column(
        children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: tint, shape: BoxShape.circle),
            child: BlIcon(icon, size: 22, color: ink, stroke: 2.2),
          ),
          const SizedBox(height: 10),
          Text(title,
              textAlign: TextAlign.center,
              style: Bl.tight(19, w: FontWeight.w700, ls: -0.02)),
          const SizedBox(height: 6),
          Text(line,
              textAlign: TextAlign.center,
              style: Bl.inter(13.5, w: FontWeight.w500, c: Bl.ink3)),
          if (sub.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(sub,
                textAlign: TextAlign.center,
                style: Bl.inter(12.5, c: _grey)),
          ],
        ],
      );

  Widget _dialogButtons(BuildContext ctx, VoidCallback onConfirm,
          {bool danger = false}) =>
      Padding(
        padding: const EdgeInsets.only(top: 14),
        child: Row(
          children: [
            Expanded(
              child: BlButton('Cancel',
                  kind: BlButtonKind.soft, onTap: () => Navigator.pop(ctx)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Confirm',
                  kind: danger ? BlButtonKind.danger : BlButtonKind.primary,
                  onTap: onConfirm),
            ),
          ],
        ),
      );

  Future<String?> _askFailReason() {
    final ctrl = TextEditingController();
    final name = widget.stop.clientName ?? 'this customer';
    return showBlCustomDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _dialogHead(
                '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.500"/>',
                const Color(0xFFFFF1C9),
                _amberDeep,
                'Delivery failed',
                'Why could you not deliver?',
                name),
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              alignment: WrapAlignment.center,
              children: [
                for (final r in _quickReasons)
                  Semantics(
                    button: true,
                    selected: ctrl.text == r,
                    label: r,
                    excludeSemantics: true,
                    child: BlTap(
                      onTap: () => setLocal(() => ctrl.text = r),
                      child: Container(
                        height: 32,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                            color: ctrl.text == r ? Bl.ink : Bl.wellSoft,
                            borderRadius: BorderRadius.circular(999)),
                        child: Text(r,
                            style: Bl.tight(12.5,
                                w: FontWeight.w600,
                                ls: 0,
                                c: ctrl.text == r ? Bl.white : Bl.ink3)),
                      ),
                    ),
                  ),
              ],
            ),
            BlField(
              label: 'Reason',
              hint: 'e.g. customer unavailable',
              controller: ctrl,
              capitalization: TextCapitalization.sentences,
              onChanged: (_) => setLocal(() {}),
            ),
            if (widget.stop.invoiceId != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                    'The bill goes back in the queue for the next dispatch.',
                    textAlign: TextAlign.center,
                    style: Bl.inter(12, c: _grey)),
              ),
            _dialogButtons(ctx, () => Navigator.pop(ctx, ctrl.text.trim())),
          ],
        ),
      ),
    );
  }

  // Best-effort last-known-location capture at a delivery event.
  Future<void> _captureLocation() async {
    final vid = widget.vehicleId;
    if (vid == null) return;
    final tenantId = ref.read(tenantContextProvider).value?.tenantId;
    if (tenantId == null) return;
    await recordVehicleLocation(tenantId: tenantId, vehicleId: vid);
  }

  // Mark a stop delivered, capturing optional proof of delivery on the invoice.
  Future<void> _markDelivered() async {
    final ctrl = TextEditingController();
    final cash = _cash;
    final proof = await showBlCustomDialog<String>(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _dialogHead(
              BlIcons.check,
              const Color(0xFFE3F5EA),
              const Color(0xFF17663A),
              'Proof of delivery',
              'Delivered to ${widget.stop.clientName ?? 'customer'}',
              cash > 0
                  ? '${Money.inr(cash)} cash collected'
                  : 'No cash collected'),
          BlField(
            label: 'Note (optional)',
            hint: 'e.g. received by Mr. Khan',
            controller: ctrl,
            capitalization: TextCapitalization.sentences,
          ),
          _dialogButtons(ctx, () => Navigator.pop(ctx, ctrl.text.trim())),
        ],
      ),
    );
    if (proof == null) return; // cancelled
    setState(() => _loading = true);
    try {
      final invId = widget.stop.invoiceId;
      if (invId != null) {
        await supabase.from('invoices').update({
          'delivery_status': 'DELIVERED',
          'delivery_proof': proof.isEmpty ? 'Confirmed by driver' : proof,
        }).eq('id', invId);
      }
      await updateStopStatus(widget.stop.id, 'DELIVERED', cashCollected: cash);
      await _captureLocation();
    } catch (e) {
      _unsure(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _action(String label, String icon, Color tint, Color ink,
          VoidCallback onTap) =>
      Expanded(
        child: Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: BlTap(
            onTap: _loading ? null : onTap,
            child: Column(
              children: [
                Container(
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                      color: tint, borderRadius: BorderRadius.circular(14)),
                  child: BlIcon(icon, size: 18, color: ink, stroke: 2.4),
                ),
                const SizedBox(height: 5),
                Text(label,
                    maxLines: 1,
                    style: Bl.tight(11.5,
                        w: FontWeight.w600, ls: 0, c: Bl.ink3)),
              ],
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final symbol = ref.watch(currencySymbolProvider).valueOrNull ?? '₹';
    return Container(
      margin: const EdgeInsets.fromLTRB(14, 4, 14, 4),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: Bl.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Bl.ink, width: 1.5)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                    color: Bl.ink, shape: BoxShape.circle),
                child: Text('${widget.stop.sequence}',
                    style: Bl.tight(12.5,
                        w: FontWeight.w700, ls: 0, c: Bl.white)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(widget.stop.clientName ?? 'Unknown client',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(15, w: FontWeight.w600)),
              ),
              Text('Now',
                  style: Bl.tight(11.5,
                      w: FontWeight.w600,
                      ls: 0,
                      c: const Color(0xFFB86A0A))),
            ],
          ),
          const SizedBox(height: 12),
          Text('Cash collected',
              style: Bl.inter(11.5, w: FontWeight.w500, c: _grey)),
          const SizedBox(height: 5),
          Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
                color: Bl.wellSoft, borderRadius: BorderRadius.circular(13)),
            child: Row(
              children: [
                Text(symbol,
                    style: Bl.tight(18,
                        w: FontWeight.w600, c: const Color(0xFFA8ADB4))),
                const SizedBox(width: 6),
                Expanded(
                  child: TextField(
                    controller: _cashController,
                    enabled: !_loading,
                    keyboardType: const TextInputType.numberWithOptions(
                        decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                          RegExp(r'^\d*\.?\d{0,2}')),
                    ],
                    cursorColor: Bl.brand,
                    style: Bl.tight(18, w: FontWeight.w700),
                    decoration: InputDecoration(
                      isCollapsed: true,
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      disabledBorder: InputBorder.none,
                      hintText: '0',
                      hintStyle: Bl.tight(18,
                          w: FontWeight.w700, c: const Color(0xFFA8ADB4)),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Opacity(
            opacity: _loading ? 0.5 : 1,
            child: Row(
              children: [
                _action('Delivered', BlIcons.check, const Color(0xFFE3F5EA),
                    _green, _markDelivered),
                const SizedBox(width: 6),
                _action('Partial', BlIcons.minus, const Color(0xFFE4EEFF),
                    const Color(0xFF1D4E9E), () => _markStatus('PARTIAL')),
                const SizedBox(width: 6),
                _action('No sale', BlIcons.close, const Color(0xFFFDE2E2),
                    Bl.redDeep, () => _markStatus('NO_SALE')),
                const SizedBox(width: 6),
                _action(
                    'Failed',
                    '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.500"/>',
                    const Color(0xFFFFF1C9),
                    _amberDeep,
                    _markFailed),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── No route ─────────────────────────────────────────────────────────────────
class _NoRouteView extends ConsumerWidget {
  const _NoRouteView();

  Future<void> _openVehiclePicker(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    void say(String msg) => messenger.showSnackBar(
        SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));

    final List<Map<String, dynamic>> vansWithStock = [];
    try {
      // Load VEHICLE-type inventory locations that have stock
      final locRows = await supabase
          .from('inventory_locations')
          .select('id, reference_id, name').isFilter('deleted_at', null)
          .eq('type', 'VEHICLE');

      if (!context.mounted) return;
      if (locRows.isEmpty) {
        say('No vans have stock loaded.');
        return;
      }

      // Check which have stock > 0
      for (final loc in locRows as List) {
        final bal = await supabase
            .from('inventory_balances')
            .select('quantity')
            .eq('location_id', loc['id'] as String)
            .gt('quantity', 0)
            .limit(1);
        if ((bal as List).isNotEmpty) {
          vansWithStock.add(loc as Map<String, dynamic>);
        }
      }
    } catch (e) {
      debugPrint('[my route] van lookup failed: $e');
      say('Could not check the vans. Check your internet and try again. ($e)');
      return;
    }

    if (!context.mounted) return;
    if (vansWithStock.isEmpty) {
      say('No vans have stock loaded. Load a van from Vehicles first.');
      return;
    }

    // If exactly one, go straight in
    if (vansWithStock.length == 1) {
      final vehicleId  = vansWithStock.first['reference_id'] as String;
      final locationId = vansWithStock.first['id'] as String;
      Navigator.push(context, MaterialPageRoute(
        builder: (_) => AddSaleScreen(vehicleId: vehicleId, locationId: locationId),
      ));
      return;
    }

    // Several vans: pick one by name.
    String label(Map<String, dynamic> loc) =>
        loc['name'] as String? ?? loc['reference_id'] as String;
    final picked = await showBlPicker(context,
        title: 'Select van',
        options: [for (final l in vansWithStock) label(l)]);
    if (picked == null || !context.mounted) return;
    final loc = vansWithStock.firstWhere((l) => label(l) == picked);
    Navigator.push(context, MaterialPageRoute(
      builder: (_) => AddSaleScreen(
        vehicleId:  loc['reference_id'] as String,
        locationId: loc['id'] as String,
      ),
    ));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(28, 24, 28, 120),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                    color: Bl.well, shape: BoxShape.circle),
                child: const BlIcon(BlIcons.truck, size: 28, color: Bl.ink3),
              ),
              const SizedBox(height: 14),
              Text('No active route',
                  style: Bl.tight(19, w: FontWeight.w700, ls: -0.02)),
              const SizedBox(height: 6),
              Text(
                  'Your manager has not dispatched a route to you yet. You can still sell from the van.',
                  textAlign: TextAlign.center,
                  style: Bl.inter(13.5, c: _grey, h: 1.45)),
              const SizedBox(height: 18),
              SizedBox(
                width: 200,
                child: BlButton('Make a sale',
                    onTap: () => _openVehiclePicker(context, ref)),
              ),
            ],
          ),
        ),
      );
}
