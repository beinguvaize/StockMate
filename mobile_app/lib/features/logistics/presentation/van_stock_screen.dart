import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/logistics/presentation/providers/driver_provider.dart';

class VanStockScreen extends ConsumerWidget {
  final String vehicleId;
  const VanStockScreen({super.key, required this.vehicleId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stockAsync = ref.watch(vanStockProvider(vehicleId));

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
              'Van Stock',
              style: GoogleFonts.hankenGrotesk(
                fontWeight: FontWeight.w800,
                fontSize: 17,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'INVENTORY ON BOARD',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.secondary,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
      ),
      body: stockAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text(
            'Error: $e',
            style: GoogleFonts.inter(color: AppColors.danger),
          ),
        ),
        data: (items) {
          if (items.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
                    ),
                    child: const Icon(LucideIcons.package, size: 32, color: AppColors.inkTertiary),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Van is empty',
                    style: GoogleFonts.hankenGrotesk(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      color: AppColors.inkPrimary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'No stock loaded on this van.',
                    style: GoogleFonts.inter(color: AppColors.inkTertiary, fontSize: 13),
                  ),
                ],
              ),
            );
          }

          final totalUnits = items.fold(0.0, (s, i) => s + i.quantity);

          return Column(
            children: [
              // ── Summary hero card ──────────────────────────────────────────
              Container(
                margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                padding: const EdgeInsets.all(22),
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
                      child: const Icon(LucideIcons.package, color: AppColors.inkPrimary, size: 24),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${totalUnits.toStringAsFixed(0)} units on board',
                            style: GoogleFonts.hankenGrotesk(
                              fontWeight: FontWeight.w900,
                              fontSize: 24,
                              color: AppColors.inkPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${items.length} product${items.length > 1 ? 's' : ''}',
                            style: GoogleFonts.inter(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: AppColors.secondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // ── Stock list ─────────────────────────────────────────────────
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: items.length,
                  itemBuilder: (context, i) {
                    final item = items[i];
                    final pct = totalUnits > 0 ? item.quantity / totalUnits : 0.0;
                    final isLow = item.quantity < 5;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
                        boxShadow: [AppColors.cardShadow],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              // Product name
                              Expanded(
                                child: Text(
                                  item.productName,
                                  style: GoogleFonts.hankenGrotesk(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14,
                                    color: AppColors.inkPrimary,
                                  ),
                                ),
                              ),
                              // Quantity badge
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withValues(alpha: 0.08),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: AppColors.primary.withValues(alpha: 0.18)),
                                ),
                                child: Text(
                                  item.quantity.toStringAsFixed(0),
                                  style: GoogleFonts.jetBrainsMono(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 15,
                                    color: AppColors.primary,
                                    fontFeatures: [const FontFeature.tabularFigures()],
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'units',
                                style: GoogleFonts.inter(
                                  fontSize: 11,
                                  color: AppColors.inkTertiary,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          // Progress bar
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: pct.clamp(0.0, 1.0),
                              backgroundColor: AppColors.canvas,
                              color: isLow ? AppColors.danger : AppColors.primary,
                              minHeight: 5,
                            ),
                          ),
                          // Low-stock warning pill
                          if (isLow)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: AppColors.danger.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(color: AppColors.danger.withValues(alpha: 0.25)),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(LucideIcons.alertTriangle, size: 11, color: AppColors.danger),
                                    const SizedBox(width: 4),
                                    Text(
                                      'Low stock',
                                      style: GoogleFonts.jetBrainsMono(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.danger,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
