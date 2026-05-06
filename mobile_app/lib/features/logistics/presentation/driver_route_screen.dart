import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
        title: const Text('MY ROUTE', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: -0.5)),
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.inkPrimary,
        elevation: 0,
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
        error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: AppColors.danger))),
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
                  error: (e, _) => Center(child: Text('Error: $e')),
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
                backgroundColor: AppColors.accentSignature,
                foregroundColor: AppColors.inkPrimary,
                icon: const Icon(LucideIcons.shoppingCart, size: 18),
                label: const Text('QUICK SALE', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
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
        color: AppColors.inkPrimary,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        children: [
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              color: AppColors.accentSignature,
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
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    const Icon(LucideIcons.mapPin, size: 12, color: Colors.white54),
                    const SizedBox(width: 4),
                    Text(
                      route.date ?? '',
                      style: const TextStyle(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppColors.accentSignature,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Text('ACTIVE', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: AppColors.inkPrimary)),
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
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: done ? _statusColor.withValues(alpha: 0.3) : Colors.black.withValues(alpha: 0.05),
            width: done ? 1.5 : 1,
          ),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(
          children: [
            // Main row
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  // Sequence circle
                  Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      color: done ? _statusColor.withValues(alpha: 0.12) : AppColors.canvas,
                      shape: BoxShape.circle,
                      border: Border.all(color: done ? _statusColor : Colors.black12),
                    ),
                    child: done
                        ? Icon(_statusIcon, size: 16, color: _statusColor)
                        : Center(child: Text('${widget.stop.sequence}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13))),
                  ),
                  const SizedBox(width: 14),
                  // Client info
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.stop.clientName ?? 'Unknown Client',
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                        ),
                        if (widget.stop.cashCollected > 0)
                          Text(
                            'Collected: ${widget.stop.cashCollected.toStringAsFixed(0)}',
                            style: TextStyle(fontSize: 11, color: AppColors.success, fontWeight: FontWeight.w700),
                          ),
                        if (widget.stop.visitedAt != null)
                          Text(
                            _formatTime(widget.stop.visitedAt!),
                            style: const TextStyle(fontSize: 10, color: AppColors.inkTertiary),
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
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: _statusColor.withValues(alpha: 0.2)),
                      ),
                      child: Text(
                        widget.stop.status,
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: _statusColor),
                      ),
                    )
                  else
                    Icon(
                      widget.isExpanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                      size: 18, color: AppColors.inkTertiary,
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
                    const Text('CASH COLLECTED', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: AppColors.inkTertiary, letterSpacing: 1)),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _cashController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d.]'))],
                      decoration: InputDecoration(
                        hintText: '0.00',
                        prefixText: '\$ ',
                        filled: true,
                        fillColor: AppColors.canvas,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(color: AppColors.accentSignature, width: 2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (_loading)
                      const Center(child: CircularProgressIndicator())
                    else
                      Row(
                        children: [
                          _ActionBtn(label: 'DELIVERED', color: AppColors.success, icon: LucideIcons.checkCircle2,
                            onTap: () => _markStatus('DELIVERED')),
                          const SizedBox(width: 8),
                          _ActionBtn(label: 'PARTIAL', color: AppColors.info, icon: LucideIcons.minusCircle,
                            onTap: () => _markStatus('PARTIAL')),
                          const SizedBox(width: 8),
                          _ActionBtn(label: 'NO SALE', color: AppColors.danger, icon: LucideIcons.xCircle,
                            onTap: () => _markStatus('NO_SALE')),
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
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(height: 3),
            Text(label, style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, color: color)),
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
            width: 80, height: 80,
            decoration: BoxDecoration(color: AppColors.canvas, borderRadius: BorderRadius.circular(24)),
            child: const Icon(LucideIcons.truck, size: 36, color: AppColors.inkTertiary),
          ),
          const SizedBox(height: 20),
          const Text('No Active Route', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20)),
          const SizedBox(height: 8),
          const Text('You have no dispatched route.\nManager must dispatch you from the web app.',
              textAlign: TextAlign.center, style: TextStyle(color: AppColors.inkTertiary, fontSize: 13)),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            onPressed: onMakeSale,
            icon: const Icon(LucideIcons.shoppingCart, size: 16),
            label: const Text('MAKE A SALE'),
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
        const Icon(LucideIcons.mapPin, size: 40, color: AppColors.inkTertiary),
        const SizedBox(height: 12),
        const Text('No delivery stops assigned', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.inkTertiary)),
        const SizedBox(height: 6),
        const Text('You can still make walk-in van sales.', style: TextStyle(fontSize: 12, color: AppColors.inkTertiary)),
      ],
    ),
  );
}
