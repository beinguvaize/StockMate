import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/location/location_service.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/logistics/data/models/route_stop.dart';
import 'package:mobile_app/features/logistics/presentation/providers/driver_provider.dart';
import 'package:mobile_app/features/logistics/presentation/van_stock_screen.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart';

class DriverRouteScreen extends ConsumerStatefulWidget {
  const DriverRouteScreen({super.key});

  @override
  ConsumerState<DriverRouteScreen> createState() => _DriverRouteScreenState();
}

class _DriverRouteScreenState extends ConsumerState<DriverRouteScreen> {
  // Which stop has the action panel open
  String? _expandedStopId;

  @override
  Widget build(BuildContext context) {
    final routeAsync = ref.watch(activeRouteProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'My Route',
              style: GoogleFonts.manrope(
                fontWeight: FontWeight.w800,
                fontSize: 17,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'DRIVER CONSOLE',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.secondary,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
        actions: [
          // Quick stock view
          IconButton(
            icon: const Icon(LucideIcons.package, size: 20),
            tooltip: 'Van Stock',
            onPressed: () => routeAsync.whenData((route) {
              if (route?.vehicleId != null) {
                Navigator.push(context, MaterialPageRoute(
                  builder: (_) => VanStockScreen(vehicleId: route!.vehicleId!),
                ));
              }
            }),
          ),
        ],
      ),
      body: routeAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text(
            'Error: $e',
            style: GoogleFonts.manrope(color: AppColors.danger),
          ),
        ),
        data: (route) {
          if (route == null) {
            return const _NoRouteView();
          }

          return Column(
            children: [
              // Route header card
              _RouteHeader(route: route),

              // Stops list
              Expanded(
                child: ref.watch(routeStopsProvider(route.id)).when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Center(
                    child: Text(
                      'Error: $e',
                      style: GoogleFonts.manrope(color: AppColors.danger),
                    ),
                  ),
                  data: (stops) {
                    if (stops.isEmpty) {
                      return _EmptyStops(
                        vehicleId: route.vehicleId,
                        routeId: route.id,
                      );
                    }
                    return ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                      itemCount: stops.length,
                      itemBuilder: (context, i) => _StopCard(
                        stop: stops[i],
                        vehicleId: route.vehicleId,
                        isExpanded: _expandedStopId == stops[i].id,
                        onTap: () => setState(() {
                          _expandedStopId = _expandedStopId == stops[i].id ? null : stops[i].id;
                        }),
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),

      // Floating "Quick Sale" button
      floatingActionButton: routeAsync.whenOrNull(
        data: (route) => route != null
            ? FloatingActionButton.extended(
                onPressed: () async {
                  // Look up van's inventory location, then open AddSaleScreen
                  final locRes = await supabase
                      .from('inventory_locations')
                      .select('id')
                      .eq('type', 'VEHICLE')
                      .eq('reference_id', route.vehicleId ?? '')
                      .maybeSingle();
                  if (!context.mounted) return;
                  Navigator.push(context, MaterialPageRoute(
                    builder: (_) => AddSaleScreen(
                      vehicleId:  route.vehicleId,
                      locationId: locRes?['id'] as String?,
                      routeId:    route.id,
                    ),
                  ));
                },
                backgroundColor: AppColors.primaryContainer,
                foregroundColor: AppColors.inkPrimary,
                shape: const StadiumBorder(),
                icon: const Icon(LucideIcons.shoppingCart, size: 18),
                label: Text(
                  'QUICK SALE',
                  style: GoogleFonts.jetBrainsMono(
                    fontWeight: FontWeight.w900,
                    fontSize: 12,
                  ),
                ),
              )
            : null,
      ),
    );
  }
}

// ── Route header ──────────────────────────────────────────────────────────────
class _RouteHeader extends StatelessWidget {
  final dynamic route;
  const _RouteHeader({required this.route});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.primaryContainer,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(LucideIcons.truck, color: AppColors.inkPrimary, size: 22),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  route.location ?? 'Active Route',
                  style: GoogleFonts.manrope(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: AppColors.inkPrimary,
                  ),
                ),
                const SizedBox(height: 3),
                Row(
                  children: [
                    const Icon(LucideIcons.mapPin, size: 12, color: AppColors.secondary),
                    const SizedBox(width: 4),
                    Text(
                      route.date ?? '',
                      style: GoogleFonts.manrope(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.secondary,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          // ACTIVE badge — primary text on white bg pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              'ACTIVE',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
                letterSpacing: 1.2,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Stop card ─────────────────────────────────────────────────────────────────
class _StopCard extends ConsumerStatefulWidget {
  final RouteStop stop;
  final bool isExpanded;
  final VoidCallback onTap;
  final String? vehicleId;
  const _StopCard({
    required this.stop,
    required this.isExpanded,
    required this.onTap,
    this.vehicleId,
  });

  @override
  ConsumerState<_StopCard> createState() => _StopCardState();
}

class _StopCardState extends ConsumerState<_StopCard> {
  final _cashController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _cashController.dispose();
    super.dispose();
  }

  Color get _statusColor {
    switch (widget.stop.status) {
      case 'DELIVERED': return AppColors.success;
      case 'NO_SALE':   return AppColors.danger;
      case 'PARTIAL':   return AppColors.info;
      default:          return AppColors.inkTertiary;
    }
  }

  IconData get _statusIcon {
    switch (widget.stop.status) {
      case 'DELIVERED': return LucideIcons.checkCircle2;
      case 'NO_SALE':   return LucideIcons.xCircle;
      case 'PARTIAL':   return LucideIcons.minusCircle;
      default:          return LucideIcons.clock;
    }
  }

  Future<void> _markStatus(String status) async {
    setState(() => _loading = true);
    final cash = double.tryParse(_cashController.text) ?? 0;
    try {
      await updateStopStatus(
        widget.stop.id,
        status,
        cashCollected: cash,
      );
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
      if (invId != null) {
        await supabase.from('invoices').update({
          'delivery_status':        'PENDING',
          'failed_delivery_reason': reason.isEmpty ? 'Delivery failed' : reason,
          'vehicle_route_id':       null,
        }).eq('id', invId);
      }
      await updateStopStatus(widget.stop.id, 'NO_SALE', cashCollected: 0);
      await _captureLocation();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not mark failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<String?> _askFailReason() =>
      _askText('Delivery Failed', 'Reason (e.g. customer unavailable)');

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
    final proof = await _askText(
      'Proof of Delivery',
      'Note — e.g. received by Mr. Khan (optional)',
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
      final cash = double.tryParse(_cashController.text) ?? 0;
      await updateStopStatus(widget.stop.id, 'DELIVERED', cashCollected: cash);
      await _captureLocation();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not mark delivered: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<String?> _askText(String title, String hint) {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(hintText: hint),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final done = widget.stop.status != 'PENDING';

    return GestureDetector(
      onTap: done ? null : widget.onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: done
                ? _statusColor.withValues(alpha: 0.3)
                : Colors.black.withValues(alpha: 0.06),
            width: done ? 1.5 : 1,
          ),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Column(
          children: [
            // Main row
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  // Sequence circle or status icon
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: done
                          ? _statusColor.withValues(alpha: 0.12)
                          : AppColors.primaryContainer.withValues(alpha: 0.3),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: done ? _statusColor : AppColors.primary.withValues(alpha: 0.3),
                      ),
                    ),
                    child: done
                        ? Icon(_statusIcon, size: 16, color: _statusColor)
                        : Center(
                            child: Text(
                              '${widget.stop.sequence}',
                              style: GoogleFonts.jetBrainsMono(
                                fontWeight: FontWeight.w900,
                                fontSize: 13,
                                color: AppColors.primary,
                              ),
                            ),
                          ),
                  ),
                  const SizedBox(width: 14),
                  // Client info
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.stop.clientName ?? 'Unknown Client',
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                        if (widget.stop.cashCollected > 0)
                          Text(
                            'Collected: ${widget.stop.cashCollected.toStringAsFixed(0)}',
                            style: GoogleFonts.manrope(
                              fontSize: 11,
                              color: AppColors.success,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        if (widget.stop.visitedAt != null)
                          Text(
                            _formatTime(widget.stop.visitedAt!),
                            style: GoogleFonts.manrope(
                              fontSize: 10,
                              color: AppColors.inkTertiary,
                            ),
                          ),
                      ],
                    ),
                  ),
                  // Status badge / chevron
                  if (done)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: _statusColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: _statusColor.withValues(alpha: 0.25)),
                      ),
                      child: Text(
                        widget.stop.status,
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: _statusColor,
                        ),
                      ),
                    )
                  else
                    Icon(
                      widget.isExpanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                      size: 18,
                      color: AppColors.inkTertiary,
                    ),
                ],
              ),
            ),

            // Action panel (expandable, only for PENDING)
            if (widget.isExpanded && !done) ...[
              Divider(height: 1, color: Colors.black.withValues(alpha: 0.05)),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Section header
                    Row(
                      children: [
                        Container(
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer.withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(5),
                          ),
                          child: const Icon(LucideIcons.dollarSign, size: 11, color: AppColors.primary),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'CASH COLLECTED',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.5,
                            color: AppColors.primary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _cashController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d.]'))],
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                      ),
                      decoration: InputDecoration(
                        hintText: '0.00',
                        hintStyle: GoogleFonts.jetBrainsMono(
                          fontSize: 15,
                          color: AppColors.inkTertiary,
                        ),
                        prefixText: '${ref.watch(currencySymbolProvider).valueOrNull ?? ''} ',
                        prefixStyle: GoogleFonts.jetBrainsMono(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                        ),
                        filled: true,
                        fillColor: AppColors.canvas,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(color: AppColors.primary, width: 2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (_loading)
                      const Center(child: CircularProgressIndicator())
                    else
                      Row(
                        children: [
                          _ActionBtn(
                            label: 'DELIVERED',
                            color: AppColors.success,
                            icon: LucideIcons.checkCircle2,
                            onTap: _markDelivered,
                          ),
                          const SizedBox(width: 8),
                          _ActionBtn(
                            label: 'PARTIAL',
                            color: AppColors.info,
                            icon: LucideIcons.minusCircle,
                            onTap: () => _markStatus('PARTIAL'),
                          ),
                          const SizedBox(width: 8),
                          _ActionBtn(
                            label: 'NO SALE',
                            color: AppColors.danger,
                            icon: LucideIcons.xCircle,
                            onTap: () => _markStatus('NO_SALE'),
                          ),
                          const SizedBox(width: 8),
                          _ActionBtn(
                            label: 'FAILED',
                            color: AppColors.warning,
                            icon: LucideIcons.alertTriangle,
                            onTap: _markFailed,
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final h = dt.hour.toString().padLeft(2, '0');
      final m = dt.minute.toString().padLeft(2, '0');
      return 'Visited $h:$m';
    } catch (_) { return ''; }
  }
}

class _ActionBtn extends StatelessWidget {
  final String label;
  final Color color;
  final IconData icon;
  final VoidCallback onTap;
  const _ActionBtn({required this.label, required this.color, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) => Expanded(
    child: GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Column(
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(height: 3),
            Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 8,
                fontWeight: FontWeight.w900,
                color: color,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

// ── Empty / no-route states ───────────────────────────────────────────────────
class _NoRouteView extends ConsumerWidget {
  const _NoRouteView();

  Future<void> _openVehiclePicker(BuildContext context, WidgetRef ref) async {
    // Load VEHICLE-type inventory locations that have stock
    final locRows = await supabase
        .from('inventory_locations')
        .select('id, reference_id, name')
        .eq('type', 'VEHICLE');

    if (!context.mounted) return;
    if (locRows.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No vans have stock loaded.')),
      );
      return;
    }

    // Check which have stock > 0
    final List<Map<String, dynamic>> vansWithStock = [];
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

    if (!context.mounted) return;
    if (vansWithStock.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No vans have stock loaded. Load stock from web.')),
      );
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

    // Multiple vans — show picker sheet; return Map with vehicleId + locationId
    final picked = await showModalBottomSheet<Map<String, String>>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 16),
            Text('Select Van',
              style: GoogleFonts.manrope(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 8),
            ...vansWithStock.map((loc) => ListTile(
              leading: const Icon(LucideIcons.truck),
              title: Text(loc['name'] as String? ?? loc['reference_id'] as String),
              onTap: () => Navigator.pop(ctx, {
                'vehicleId':  loc['reference_id'] as String,
                'locationId': loc['id'] as String,
              }),
            )),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (picked != null && context.mounted) {
      Navigator.push(context, MaterialPageRoute(
        builder: (_) => AddSaleScreen(
          vehicleId:  picked['vehicleId'],
          locationId: picked['locationId'],
        ),
      ));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
            ),
            child: const Icon(LucideIcons.truck, size: 36, color: AppColors.inkTertiary),
          ),
          const SizedBox(height: 20),
          Text(
            'No Active Route',
            style: GoogleFonts.manrope(
              fontWeight: FontWeight.w900,
              fontSize: 20,
              color: AppColors.inkPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'You have no dispatched route.\nManager must dispatch you from the web app.',
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(color: AppColors.inkTertiary, fontSize: 13),
          ),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            onPressed: () => _openVehiclePicker(context, ref),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryContainer,
              foregroundColor: AppColors.inkPrimary,
              shape: const StadiumBorder(),
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
            ),
            icon: const Icon(LucideIcons.shoppingCart, size: 16),
            label: Text(
              'MAKE A SALE',
              style: GoogleFonts.jetBrainsMono(
                fontWeight: FontWeight.w900,
                fontSize: 12,
                letterSpacing: 1.2,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _EmptyStops extends StatelessWidget {
  final String? vehicleId;
  final String routeId;
  const _EmptyStops({this.vehicleId, required this.routeId});

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 60,
          height: 60,
          decoration: BoxDecoration(
            color: AppColors.primaryContainer.withValues(alpha: 0.3),
            shape: BoxShape.circle,
          ),
          child: const Icon(LucideIcons.mapPin, size: 28, color: AppColors.primary),
        ),
        const SizedBox(height: 14),
        Text(
          'No delivery stops assigned',
          style: GoogleFonts.manrope(
            fontWeight: FontWeight.w700,
            fontSize: 15,
            color: AppColors.inkSecondary,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'You can still make walk-in van sales.',
          style: GoogleFonts.manrope(fontSize: 12, color: AppColors.inkTertiary),
        ),
      ],
    ),
  );
}
