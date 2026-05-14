import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/logistics/presentation/providers/logistics_provider.dart';
import 'package:mobile_app/features/logistics/presentation/add_vehicle_screen.dart';

class LogisticsScreen extends ConsumerWidget {
  const LogisticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vehiclesAsync = ref.watch(vehiclesProvider);

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
      ),
      body: SafeArea(
        child: vehiclesAsync.when(
          data: (vehicles) {
            final activeCount = vehicles
                .where((v) =>
                    (v.status ?? '').toUpperCase() == 'ACTIVE')
                .length;
            final maintenanceCount = vehicles
                .where((v) =>
                    (v.status ?? '').toUpperCase() == 'MAINTENANCE')
                .length;

            return CustomScrollView(
              slivers: [
                // Stats row
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

                // Section header
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

                // Vehicle list or empty state
                if (vehicles.isEmpty)
                  SliverFillRemaining(
                    child: Center(
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
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
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
        onPressed: () {
          Navigator.push(
              context,
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
// Vehicle card widget
// ---------------------------------------------------------------------------
class _VehicleCard extends StatelessWidget {
  final dynamic vehicle;

  const _VehicleCard({required this.vehicle});

  @override
  Widget build(BuildContext context) {
    final name = vehicle.name ?? 'Unnamed';
    final plate = vehicle.plate ?? vehicle.plateNumber ?? '';
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

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
        boxShadow: [AppColors.cardShadow],
      ),
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
        ],
      ),
    );
  }
}
