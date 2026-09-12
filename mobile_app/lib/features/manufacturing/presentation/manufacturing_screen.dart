import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'providers/manufacturing_provider.dart';

class ManufacturingScreen extends ConsumerWidget {
  const ManufacturingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bomsAsync = ref.watch(bomsProvider);
    final ordersAsync = ref.watch(productionOrdersProvider);

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: AppColors.canvas,
        appBar: AppBar(
          backgroundColor: AppColors.canvas,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft, color: AppColors.inkPrimary),
            onPressed: () => Navigator.pop(context),
          ),
          title: Text(
            'Manufacturing',
            style: GoogleFonts.manrope(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.inkPrimary),
          ),
          bottom: TabBar(
            labelStyle: GoogleFonts.manrope(fontSize: 13, fontWeight: FontWeight.w600),
            unselectedLabelStyle: GoogleFonts.manrope(fontSize: 13),
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.inkTertiary,
            indicatorColor: AppColors.primary,
            tabs: const [Tab(text: 'Production Orders'), Tab(text: 'BOMs')],
          ),
        ),
        body: TabBarView(
          children: [
            // Production Orders tab
            ordersAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
              error: (e, _) => Center(child: Text('Error loading orders', style: GoogleFonts.manrope(color: AppColors.danger))),
              data: (orders) {
                if (orders.isEmpty) return const _EmptyState(label: 'No production orders yet', icon: LucideIcons.factory);
                return RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () async => ref.invalidate(productionOrdersProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: orders.length,
                    itemBuilder: (ctx, i) => _OrderCard(order: orders[i]),
                  ),
                );
              },
            ),
            // BOMs tab
            bomsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
              error: (e, _) => Center(child: Text('Error loading BOMs', style: GoogleFonts.manrope(color: AppColors.danger))),
              data: (boms) {
                if (boms.isEmpty) return const _EmptyState(label: 'No bill of materials yet', icon: LucideIcons.clipboardList);
                return RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () async => ref.invalidate(bomsProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: boms.length,
                    itemBuilder: (ctx, i) => _BomCard(bom: boms[i]),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String label;
  final IconData icon;
  const _EmptyState({required this.label, required this.icon});

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: AppColors.inkTertiary),
            const SizedBox(height: 16),
            Text(label, style: GoogleFonts.manrope(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.inkSecondary)),
          ],
        ),
      );
}

class _OrderCard extends StatelessWidget {
  final ProductionOrderModel order;
  const _OrderCard({required this.order});

  Color get _statusColor {
    switch (order.status) {
      case 'COMPLETED': return const Color(0xFF16A34A);
      case 'IN_PROGRESS': return const Color(0xFF2563EB);
      case 'CANCELLED': return AppColors.danger;
      default: return const Color(0xFFD97706);
    }
  }

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Row(
          children: [
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(
                color: _statusColor.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(LucideIcons.factory, size: 20, color: _statusColor),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    order.bomName ?? 'Production Order',
                    style: GoogleFonts.manrope(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.inkPrimary),
                  ),
                  Text(
                    'Qty: ${order.qty.toStringAsFixed(0)}${order.startDate != null ? ' · ${order.startDate}' : ''}',
                    style: GoogleFonts.manrope(fontSize: 12, color: AppColors.inkTertiary),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: _statusColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                order.status.replaceAll('_', ' '),
                style: GoogleFonts.manrope(fontSize: 10, fontWeight: FontWeight.w700, color: _statusColor),
              ),
            ),
          ],
        ),
      );
}

class _BomCard extends StatelessWidget {
  final BomModel bom;
  const _BomCard({required this.bom});

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Row(
          children: [
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(
                color: const Color(0xFF7C3AED).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(LucideIcons.clipboardList, size: 20, color: Color(0xFF7C3AED)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(bom.name, style: GoogleFonts.manrope(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.inkPrimary)),
                  Text('Output: ${bom.outputQty.toStringAsFixed(0)} units', style: GoogleFonts.manrope(fontSize: 12, color: AppColors.inkTertiary)),
                ],
              ),
            ),
            const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.inkTertiary),
          ],
        ),
      );
}
