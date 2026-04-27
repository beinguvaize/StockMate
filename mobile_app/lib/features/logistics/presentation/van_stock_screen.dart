import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
        title: const Text('VAN STOCK', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: -0.5)),
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.inkPrimary,
        elevation: 0,
      ),
      body: stockAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: AppColors.danger))),
        data: (items) {
          if (items.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 72, height: 72,
                    decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20)),
                    child: const Icon(LucideIcons.package, size: 32, color: AppColors.inkTertiary),
                  ),
                  const SizedBox(height: 16),
                  const Text('Van is empty', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  const SizedBox(height: 6),
                  const Text('No stock loaded on this van.', style: TextStyle(color: AppColors.inkTertiary, fontSize: 13)),
                ],
              ),
            );
          }

          final totalUnits = items.fold(0.0, (s, i) => s + i.quantity);

          return Column(
            children: [
              // Summary card
              Container(
                margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.inkPrimary,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.package, color: AppColors.accentSignature, size: 28),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${totalUnits.toStringAsFixed(0)} units on board',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18),
                          ),
                          Text(
                            '${items.length} product${items.length > 1 ? 's' : ''}',
                            style: const TextStyle(color: Colors.white54, fontSize: 12, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // Stock list
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: items.length,
                  itemBuilder: (context, i) {
                    final item = items[i];
                    final pct = totalUnits > 0 ? item.quantity / totalUnits : 0.0;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(item.productName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                              ),
                              Text(
                                item.quantity.toStringAsFixed(0),
                                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 22, fontFeatures: [FontFeature.tabularFigures()]),
                              ),
                              const SizedBox(width: 4),
                              const Text('units', style: TextStyle(fontSize: 11, color: AppColors.inkTertiary)),
                            ],
                          ),
                          const SizedBox(height: 10),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: pct.clamp(0.0, 1.0),
                              backgroundColor: AppColors.canvas,
                              color: item.quantity < 5 ? AppColors.danger : AppColors.accentSignature,
                              minHeight: 4,
                            ),
                          ),
                          if (item.quantity < 5)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Row(
                                children: [
                                  const Icon(LucideIcons.alertTriangle, size: 11, color: AppColors.warning),
                                  const SizedBox(width: 4),
                                  const Text('Low stock', style: TextStyle(fontSize: 10, color: AppColors.warning, fontWeight: FontWeight.w700)),
                                ],
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
