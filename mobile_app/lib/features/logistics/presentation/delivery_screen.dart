import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/main.dart';
import 'package:drift/drift.dart' as drift;

class DeliveryScreen extends ConsumerStatefulWidget {
  const DeliveryScreen({super.key});

  @override
  ConsumerState<DeliveryScreen> createState() => _DeliveryScreenState();
}

class _DeliveryScreenState extends ConsumerState<DeliveryScreen> {
  final _odometerController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final db = ref.watch(databaseProvider);
    
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: const Text('Route Management', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.inkPrimary,
        elevation: 0,
      ),
      body: StreamBuilder(
        stream: db.select(db.routes).watch(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          
          final routes = snapshot.data!;
          if (routes.isEmpty) {
            return const Center(child: Text('No Assigned Routes', style: TextStyle(color: AppColors.inkSecondary)));
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: routes.length,
            itemBuilder: (context, index) {
              final route = routes[index];
              return Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Route #${route.id.substring(0, 8)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
                        _StatusBadge(status: route.status),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        const Icon(LucideIcons.mapPin, size: 16, color: AppColors.inkSecondary),
                        const SizedBox(width: 8),
                        Text(route.location ?? 'Global Route', style: const TextStyle(color: AppColors.inkSecondary)),
                      ],
                    ),
                    const Divider(height: 32),
                    if (route.status == 'PLANNED') 
                      ElevatedButton.icon(
                        onPressed: () => _updateStatus(route.id, 'IN_TRANSIT'),
                        icon: const Icon(LucideIcons.playCircle),
                        label: const Text('START TRANSIT'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.accentSignature,
                          minimumSize: const Size(double.infinity, 50),
                        ),
                      )
                    else if (route.status == 'IN_TRANSIT')
                      Column(
                        children: [
                          TextField(
                            controller: _odometerController,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Final Odometer Reading',
                              hintText: 'Enter KM',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton.icon(
                            onPressed: () => _completeRoute(route.id),
                            icon: const Icon(LucideIcons.checkCircle),
                            label: const Text('COMPLETE & RECONCILE'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.success,
                              minimumSize: const Size(double.infinity, 50),
                            ),
                          ),
                        ],
                      )
                    else
                      const Center(
                        child: Text('Route Closed & Reconciled', style: TextStyle(color: AppColors.success, fontWeight: FontWeight.bold)),
                      ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }

  void _updateStatus(String id, String status) async {
    final dbStore = ref.read(databaseProvider);
    await (dbStore.update(dbStore.routes)..where((t) => t.id.equals(id)))
        .write(RoutesCompanion(status: drift.Value(status)));
    
    // Sync to cloud
    ref.read(syncServiceProvider).queueMutation(
      targetTable: 'routes',
      action: 'upsert',
      payload: {'id': id, 'status': status},
    );
  }

  void _completeRoute(String id) async {
    if (_odometerController.text.isEmpty) return;
    
    final dbStore = ref.read(databaseProvider);
    final odo = double.tryParse(_odometerController.text) ?? 0;

    await (dbStore.update(dbStore.routes)..where((t) => t.id.equals(id)))
        .write(RoutesCompanion(
          status: const drift.Value('COMPLETED'),
          finalOdometer: drift.Value(odo),
        ));

    ref.read(syncServiceProvider).queueMutation(
      targetTable: 'routes',
      action: 'upsert',
      payload: {
        'id': id, 
        'status': 'COMPLETED',
        'final_odometer': odo,
        'reconciled_at': DateTime.now().toIso8601String(),
      },
    );

    _odometerController.clear();
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch(status) {
      case 'IN_TRANSIT': color = Colors.blue; break;
      case 'COMPLETED': color = AppColors.success; break;
      default: color = AppColors.inkSecondary;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Text(
        status, 
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w900)
      ),
    );
  }
}
