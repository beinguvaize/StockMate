import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
import 'package:lucide_icons/lucide_icons.dart';
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
        title: const Text('Logistics & Fleet', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.inkPrimary,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Fleet Vehicles', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              Expanded(
                child: vehiclesAsync.when(
                  data: (vehicles) {
                    if (vehicles.isEmpty) return const Center(child: Text('No vehicles found.'));
                    return ListView.builder(
                      itemCount: vehicles.length,
                      itemBuilder: (context, index) {
                        final v = vehicles[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: GlassPanel(
                            padding: const EdgeInsets.all(16),
                            borderRadius: 16,
                            child: Row(
                              children: [
                                const Icon(LucideIcons.truck, size: 24, color: AppColors.info),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(v.name ?? 'Unnamed', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                      Text(v.plate ?? 'No Plate', style: const TextStyle(color: AppColors.inkSecondary, fontSize: 12)),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: v.status == 'ACTIVE' ? AppColors.success.withValues(alpha: 0.2) : AppColors.inkSecondary.withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(v.status ?? 'UNKNOWN', style: TextStyle(fontSize: 10, color: v.status == 'ACTIVE' ? AppColors.success : AppColors.inkSecondary)),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    );
                  },
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Text('Error: $e'),
                ),
              ),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const AddVehicleScreen()));
        },
        backgroundColor: AppColors.info,
        child: const Icon(LucideIcons.plus, color: AppColors.surface),
      ),
    );
  }
}
