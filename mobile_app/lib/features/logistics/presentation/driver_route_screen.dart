import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/logistics/data/models/route_stop.dart';
import 'package:mobile_app/features/logistics/presentation/providers/driver_provider.dart';
import 'package:mobile_app/features/logistics/presentation/van_stock_screen.dart';
import 'package:mobile_app/features/logistics/presentation/van_sale_screen.dart';

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
              style: GoogleFonts.hankenGrotesk(
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
            style: GoogleFonts.inter(color: AppColors.danger),
          ),
        ),
        data: (route) {
          if (route == null) {
            return _NoRouteView(
              onMakeSale: () => Navigator.push(context, MaterialPageRoute(
                builder: (_) => const VanSaleScreen(),
              )),
            );
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
                      style: GoogleFonts.inter(color: AppColors.danger),
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
                onPressed: () => Navigator.push(context, MaterialPageRoute(
                  builder: (_) => VanSaleScreen(
                    vehicleId: route.vehicleId,
                    routeId:   route.id,
                  ),
                )),
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
                  style: GoogleFonts.hankenGrotesk(
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
                      style: GoogleFonts.inter(
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
  const _StopCard({required this.stop, required this.isExpanded, required this.onTap});

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
                          style: GoogleFonts.hankenGrotesk(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                        if (widget.stop.cashCollected > 0)
                          Text(
                            'Collected: ${widget.stop.cashCollected.toStringAsFixed(0)}',
                            style: GoogleFonts.inter(
                              fontSize: 11,
                              color: AppColors.success,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        if (widget.stop.visitedAt != null)
                          Text(
                            _formatTime(widget.stop.visitedAt!),
                            style: GoogleFonts.inter(
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
                        prefixText: '\$ ',
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
                            onTap: () => _markStatus('DELIVERED'),
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
class _NoRouteView extends StatelessWidget {
  final VoidCallback onMakeSale;
  const _NoRouteView({required this.onMakeSale});

  @override
  Widget build(BuildContext context) => Center(
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
            style: GoogleFonts.hankenGrotesk(
              fontWeight: FontWeight.w900,
              fontSize: 20,
              color: AppColors.inkPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'You have no dispatched route.\nManager must dispatch you from the web app.',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(color: AppColors.inkTertiary, fontSize: 13),
          ),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            onPressed: onMakeSale,
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
          style: GoogleFonts.hankenGrotesk(
            fontWeight: FontWeight.w700,
            fontSize: 15,
            color: AppColors.inkSecondary,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'You can still make walk-in van sales.',
          style: GoogleFonts.inter(fontSize: 12, color: AppColors.inkTertiary),
        ),
      ],
    ),
  );
}
