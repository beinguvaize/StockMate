import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/logistics/data/models/route.dart';
import 'package:mobile_app/features/logistics/data/models/vehicle.dart';
import 'package:mobile_app/features/logistics/presentation/add_vehicle_screen.dart';
import 'package:mobile_app/features/logistics/presentation/delivery_screen.dart';
import 'package:mobile_app/features/logistics/presentation/driver_route_screen.dart';
import 'package:mobile_app/features/logistics/presentation/providers/logistics_provider.dart';

class LogisticsScreen extends ConsumerWidget {
  const LogisticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vehiclesAsync = ref.watch(vehiclesProvider);
    final routesAsync = ref.watch(routesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Fleet',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'LOGISTICS MANAGEMENT',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.inkSecondary,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
        toolbarHeight: 0,
        actions: const [],
      ),
      body: SafeArea(
        child: vehiclesAsync.when(
          data: (vehicles) {
            final activeCount = vehicles
                .where((v) => (v.status ?? '').toUpperCase() == 'ACTIVE')
                .length;
            final maintenanceCount = vehicles
                .where((v) => (v.status ?? '').toUpperCase() == 'MAINTENANCE')
                .length;

            return CustomScrollView(
              slivers: [
                // ── Stats row ────────────────────────────────────────────────
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                    child: Row(
                      children: [
                        _StatCard(
                          label: 'VEHICLES',
                          value: '${vehicles.length}',
                          color: AppColors.primary,
                        ),
                        const SizedBox(width: 10),
                        _StatCard(
                          label: 'ACTIVE',
                          value: '$activeCount',
                          color: AppColors.success,
                        ),
                        const SizedBox(width: 10),
                        _StatCard(
                          label: 'MAINTENANCE',
                          value: '$maintenanceCount',
                          color: AppColors.warning,
                        ),
                      ],
                    ),
                  ),
                ),

                // ── Fleet section header ──────────────────────────────────────
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 28, 16, 12),
                    child: Row(
                      children: [
                        const Icon(LucideIcons.truck,
                            size: 14, color: AppColors.primary),
                        const SizedBox(width: 6),
                        Text(
                          'FLEET VEHICLES',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.5,
                            color: AppColors.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // ── Vehicle list or empty state ───────────────────────────────
                if (vehicles.isEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(LucideIcons.truck,
                              size: 48, color: AppColors.inkTertiary),
                          const SizedBox(height: 12),
                          Text(
                            'No vehicles in fleet',
                            style: GoogleFonts.inter(
                              fontSize: 15,
                              color: AppColors.inkSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          final v = vehicles[index];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _VehicleCard(vehicle: v),
                          );
                        },
                        childCount: vehicles.length,
                      ),
                    ),
                  ),

                // ── Routes section header ─────────────────────────────────────
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 28, 16, 12),
                    child: Row(
                      children: [
                        const Icon(LucideIcons.router,
                            size: 14, color: AppColors.secondary),
                        const SizedBox(width: 6),
                        Text(
                          'ROUTES',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.5,
                            color: AppColors.secondary,
                          ),
                        ),
                        const Spacer(),
                        GestureDetector(
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const DriverRouteScreen()),
                          ),
                          child: Text(
                            'VIEW ALL',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.2,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // ── Routes list ───────────────────────────────────────────────
                routesAsync.when(
                  data: (routes) {
                    if (routes.isEmpty) {
                      return SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                vertical: 24, horizontal: 16),
                            decoration: BoxDecoration(
                              color: AppColors.surface,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                  color: Colors.black.withValues(alpha: 0.06)),
                            ),
                            child: Column(
                              children: [
                                Icon(LucideIcons.router,
                                    size: 32, color: AppColors.inkTertiary),
                                const SizedBox(height: 8),
                                Text(
                                  'No routes yet',
                                  style: GoogleFonts.inter(
                                    fontSize: 14,
                                    color: AppColors.inkSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }
                    return SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) {
                            final route = routes[index];
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: _RouteCard(route: route),
                            );
                          },
                          childCount: routes.length,
                        ),
                      ),
                    );
                  },
                  loading: () => const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  ),
                  error: (e, _) => SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                      child: Text('Error loading routes: $e',
                          style: GoogleFonts.inter(color: AppColors.danger)),
                    ),
                  ),
                ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Text('Error: $e',
                style: GoogleFonts.inter(color: AppColors.danger)),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: null,
        onPressed: () {
          Navigator.push(context,
              MaterialPageRoute(builder: (_) => const AddVehicleScreen()));
        },
        backgroundColor: AppColors.primaryContainer,
        shape: const StadiumBorder(),
        child: const Icon(LucideIcons.plus, color: AppColors.inkPrimary),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Stat card widget
// ---------------------------------------------------------------------------
class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
                color: color,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: GoogleFonts.hankenGrotesk(
                fontSize: 24,
                fontWeight: FontWeight.w900,
                color: AppColors.inkPrimary,
                letterSpacing: -0.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Vehicle card widget — tappable, opens detail bottom sheet
// ---------------------------------------------------------------------------
class _VehicleCard extends ConsumerWidget {
  final Vehicle vehicle;

  const _VehicleCard({required this.vehicle});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = vehicle.name ?? 'Unnamed';
    final plate = vehicle.displayPlate;
    final status = vehicle.status ?? '';
    final driver = vehicle.driverName ?? '';

    Color statusBg;
    Color statusFg;
    String statusLabel;

    switch (status.toUpperCase()) {
      case 'ACTIVE':
        statusBg = AppColors.success.withValues(alpha: 0.12);
        statusFg = AppColors.success;
        statusLabel = 'ACTIVE';
        break;
      case 'MAINTENANCE':
        statusBg = AppColors.warning.withValues(alpha: 0.12);
        statusFg = AppColors.warning;
        statusLabel = 'MAINTENANCE';
        break;
      case 'OUT_OF_SERVICE':
        statusBg = AppColors.danger.withValues(alpha: 0.12);
        statusFg = AppColors.danger;
        statusLabel = 'OUT OF SERVICE';
        break;
      default:
        statusBg = AppColors.inkTertiary.withValues(alpha: 0.12);
        statusFg = AppColors.inkTertiary;
        statusLabel = status.isEmpty ? 'UNKNOWN' : status.toUpperCase();
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _showVehicleSheet(context, ref),
        child: Ink(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
            boxShadow: [AppColors.cardShadow],
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                // Truck icon circle
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer.withValues(alpha: 0.3),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: const Icon(LucideIcons.truck,
                      size: 20, color: AppColors.primary),
                ),
                const SizedBox(width: 14),

                // Name + plate + driver
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        plate.isNotEmpty ? plate : '—',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 12,
                          color: AppColors.inkSecondary,
                        ),
                      ),
                      if (driver.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          driver,
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: AppColors.inkSecondary,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),

                const SizedBox(width: 10),

                // Status badge pill
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusBg,
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Text(
                    statusLabel,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: statusFg,
                    ),
                  ),
                ),

                const SizedBox(width: 6),
                const Icon(LucideIcons.chevronRight,
                    size: 16, color: AppColors.inkTertiary),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showVehicleSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _VehicleDetailSheet(vehicle: vehicle, ref: ref),
    );
  }
}

// ---------------------------------------------------------------------------
// Vehicle detail bottom sheet
// ---------------------------------------------------------------------------
class _VehicleDetailSheet extends StatelessWidget {
  final Vehicle vehicle;
  final WidgetRef ref;

  const _VehicleDetailSheet({required this.vehicle, required this.ref});

  @override
  Widget build(BuildContext context) {
    final status = vehicle.status ?? '';

    Color statusFg;
    String statusLabel;

    switch (status.toUpperCase()) {
      case 'ACTIVE':
        statusFg = AppColors.success;
        statusLabel = 'ACTIVE';
        break;
      case 'MAINTENANCE':
        statusFg = AppColors.warning;
        statusLabel = 'MAINTENANCE';
        break;
      case 'OUT_OF_SERVICE':
        statusFg = AppColors.danger;
        statusLabel = 'OUT OF SERVICE';
        break;
      default:
        statusFg = AppColors.inkTertiary;
        statusLabel = status.isEmpty ? 'UNKNOWN' : status.toUpperCase();
    }

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),

            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer.withValues(alpha: 0.3),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(LucideIcons.truck,
                        size: 24, color: AppColors.primary),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          vehicle.name ?? 'Unnamed Vehicle',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          vehicle.displayPlate,
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 13,
                            color: AppColors.inkSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: statusFg.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      statusLabel,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: statusFg,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),
            Divider(height: 1, color: Colors.black.withValues(alpha: 0.06)),
            const SizedBox(height: 16),

            // Detail rows
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                children: [
                  if ((vehicle.driverName ?? '').isNotEmpty)
                    _DetailRow(
                      icon: LucideIcons.user,
                      label: 'Driver',
                      value: vehicle.driverName!,
                    ),
                  if ((vehicle.type ?? '').isNotEmpty)
                    _DetailRow(
                      icon: LucideIcons.truck,
                      label: 'Type',
                      value: vehicle.type!,
                    ),
                  if (vehicle.capacity != null)
                    _DetailRow(
                      icon: LucideIcons.package,
                      label: 'Capacity',
                      value: '${vehicle.capacity} kg',
                    ),
                  if ((vehicle.fuelType ?? '').isNotEmpty)
                    _DetailRow(
                      icon: LucideIcons.fuel,
                      label: 'Fuel Type',
                      value: vehicle.fuelType!,
                    ),
                  if (vehicle.year != null)
                    _DetailRow(
                      icon: LucideIcons.calendar,
                      label: 'Year',
                      value: '${vehicle.year}',
                    ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // Action buttons
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                children: [
                  // View Routes
                  _SheetButton(
                    icon: LucideIcons.router,
                    label: 'View Routes',
                    color: AppColors.primary,
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const DriverRouteScreen()),
                      );
                    },
                  ),
                  const SizedBox(height: 8),
                  // Deliveries
                  _SheetButton(
                    icon: LucideIcons.mapPin,
                    label: 'Deliveries',
                    color: AppColors.secondary,
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const DeliveryScreen()),
                      );
                    },
                  ),
                  const SizedBox(height: 8),
                  // Edit
                  _SheetButton(
                    icon: LucideIcons.pencil,
                    label: 'Edit Vehicle',
                    color: AppColors.inkSecondary,
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AddVehicleScreen(vehicle: vehicle),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 8),
                  // Delete
                  _SheetButton(
                    icon: LucideIcons.trash2,
                    label: 'Delete Vehicle',
                    color: AppColors.danger,
                    onTap: () => _confirmDelete(context),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          'Delete Vehicle?',
          style: GoogleFonts.hankenGrotesk(
            fontWeight: FontWeight.w800,
            fontSize: 18,
            color: AppColors.inkPrimary,
          ),
        ),
        content: Text(
          'This will permanently remove "${vehicle.name ?? vehicle.displayPlate}" from your fleet.',
          style: GoogleFonts.inter(
            fontSize: 14,
            color: AppColors.inkSecondary,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(
              'Cancel',
              style: GoogleFonts.inter(
                color: AppColors.inkSecondary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(dialogContext); // close dialog
              Navigator.pop(context); // close sheet
              try {
                await supabase
                    .from('vehicles')
                    .delete()
                    .eq('id', vehicle.id);
                ref.invalidate(vehiclesProvider);
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Delete failed: $e',
                          style: GoogleFonts.inter(color: Colors.white)),
                      backgroundColor: AppColors.danger,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  );
                }
              }
            },
            child: Text(
              'Delete',
              style: GoogleFonts.inter(
                color: AppColors.danger,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Detail row helper
// ---------------------------------------------------------------------------
class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _DetailRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 15, color: AppColors.inkTertiary),
          const SizedBox(width: 10),
          Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.inkSecondary,
              letterSpacing: 0.4,
            ),
          ),
          const Spacer(),
          Text(
            value,
            style: GoogleFonts.inter(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.inkPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Sheet action button helper
// ---------------------------------------------------------------------------
class _SheetButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _SheetButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
          child: Row(
            children: [
              Icon(icon, size: 17, color: color),
              const SizedBox(width: 12),
              Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
              const Spacer(),
              Icon(LucideIcons.chevronRight, size: 16, color: color.withValues(alpha: 0.5)),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Route card widget
// ---------------------------------------------------------------------------
class _RouteCard extends StatelessWidget {
  final LogisticRoute route;

  const _RouteCard({required this.route});

  @override
  Widget build(BuildContext context) {
    final status = route.status ?? '';

    Color statusBg;
    Color statusFg;
    String statusLabel;

    switch (status.toUpperCase()) {
      case 'PLANNED':
        statusBg = AppColors.inkSecondary.withValues(alpha: 0.1);
        statusFg = AppColors.inkSecondary;
        statusLabel = 'PLANNED';
        break;
      case 'IN_TRANSIT':
        statusBg = Colors.blue.withValues(alpha: 0.12);
        statusFg = Colors.blue;
        statusLabel = 'IN TRANSIT';
        break;
      case 'COMPLETED':
      case 'RECONCILED':
        statusBg = AppColors.success.withValues(alpha: 0.12);
        statusFg = AppColors.success;
        statusLabel = status.toUpperCase();
        break;
      case 'ACTIVE':
        statusBg = Colors.indigo.withValues(alpha: 0.12);
        statusFg = Colors.indigo;
        statusLabel = 'ACTIVE';
        break;
      default:
        statusBg = AppColors.inkTertiary.withValues(alpha: 0.1);
        statusFg = AppColors.inkTertiary;
        statusLabel = status.isEmpty ? 'UNKNOWN' : status.toUpperCase();
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => DeliveryScreen(routeId: route.id)),
        ),
        child: Ink(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
            boxShadow: [AppColors.cardShadow],
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                // Icon circle
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: statusFg.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Icon(LucideIcons.router, size: 20, color: statusFg),
                ),
                const SizedBox(width: 14),

                // Route info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        route.location ?? 'Route #${route.id.substring(0, 8)}',
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                        ),
                      ),
                      if ((route.date ?? '').isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          route.date!,
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 11,
                            color: AppColors.inkSecondary,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),

                const SizedBox(width: 10),

                // Status chip
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusBg,
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Text(
                    statusLabel,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: statusFg,
                    ),
                  ),
                ),

                const SizedBox(width: 6),
                const Icon(LucideIcons.chevronRight,
                    size: 16, color: AppColors.inkTertiary),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
