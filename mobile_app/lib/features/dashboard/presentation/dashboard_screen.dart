import 'package:flutter/material.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
import 'package:mobile_app/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile_app/features/sales/presentation/sales_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/menu/presentation/menu_screen.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _selectedIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Content
          IndexedStack(
            index: _selectedIndex,
            children: const [
              DashboardHome(),
              InventoryScreen(),
              SalesScreen(),
              CRMScreen(),
              MenuScreen(),
            ],
          ),
          
          // Bottom Navigation (Glassmorphism)
          Positioned(
            left: 20,
            right: 20,
            bottom: 30,
            child: GlassPanel(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
              borderRadius: 30,
              opacity: 0.9,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _buildNavItem(LucideIcons.layoutDashboard, 0),
                  _buildNavItem(LucideIcons.package, 1),
                  _buildNavItem(LucideIcons.shoppingCart, 2),
                  _buildNavItem(LucideIcons.users, 3),
                  _buildNavItem(LucideIcons.menu, 4),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem(IconData icon, int index) {
    final isSelected = _selectedIndex == index;
    return GestureDetector(
      onTap: () => setState(() => _selectedIndex = index),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.accentSignature : Colors.transparent,
          borderRadius: BorderRadius.circular(15),
        ),
        child: Icon(
          icon,
          color: isSelected ? Colors.black : AppColors.inkSecondary,
          size: 24,
        ),
      ),
    );
  }
}

class DashboardHome extends ConsumerWidget {
  const DashboardHome({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final telemetryAsync = ref.watch(telemetryProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 80, 20, 120),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'COMMAND',
            style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: -1.5, height: 0.9),
          ),
          RichText(
            text: const TextSpan(
              text: 'CENTER',
              style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: -1.5, color: AppColors.inkPrimary, fontFamily: 'sans-serif'),
              children: [
                TextSpan(text: '.', style: TextStyle(color: AppColors.accentSignature)),
              ],
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Operational intelligence and real-time asset synchronization.',
            style: TextStyle(color: AppColors.inkSecondary, fontWeight: FontWeight.w600, fontSize: 12),
          ),
          const SizedBox(height: 32),
          
          telemetryAsync.when(
            data: (metrics) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Financial Overview', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 16),
                  
                  // KPI Grid (6 metrics)
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    mainAxisSpacing: 16,
                    crossAxisSpacing: 16,
                    childAspectRatio: 1.1,
                    children: [
                      _buildPremiumStatCard('Today Sales', '₹${metrics.todaySales.toStringAsFixed(0)}', Colors.green, LucideIcons.banknote),
                      _buildPremiumStatCard('Today Expenses', '₹${metrics.todayExpenses.toStringAsFixed(0)}', Colors.red, LucideIcons.trendingDown),
                      _buildPremiumStatCard('Current Cash Balance', '₹${metrics.currentCashBalance.toStringAsFixed(0)}', Colors.blue, LucideIcons.dollarSign),
                      _buildPremiumStatCard('Outstanding Collections', '₹${metrics.outstandingCollections.toStringAsFixed(0)}', Colors.orange, LucideIcons.activity),
                      _buildPremiumStatCard('Today Purchases', '₹${metrics.todayPurchases.toStringAsFixed(0)}', Colors.purple, LucideIcons.shoppingBag),
                      _buildPremiumStatCard('Salary Pending', '₹${metrics.salariesPending.toStringAsFixed(0)}', Colors.amber, LucideIcons.users),
                    ],
                  ),
                  
                  const SizedBox(height: 32),
                  const Text('Operations', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 16),
                  
                  // Operations List
                  _buildOperationRow('Total Products', '${metrics.totalProducts}', LucideIcons.package, AppColors.info),
                  const SizedBox(height: 12),
                  _buildOperationRow('Active Trips', '${metrics.activeTrips}', LucideIcons.truck, AppColors.success),
                  const SizedBox(height: 12),
                  _buildOperationRow('Low Stock Items', '${metrics.lowStockItems}', LucideIcons.alertCircle, AppColors.danger),
                  const SizedBox(height: 12),
                  _buildOperationRow('System Status', 'Dynamic', LucideIcons.layoutDashboard, AppColors.inkPrimary),
                ],
              );
            },
            loading: () => const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator())),
            error: (e, _) => Center(child: Text('Telemetry Sync Error: $e')),
          ),
        ],
      ),
    );
  }

  Widget _buildPremiumStatCard(String title, String value, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 20,
            offset: const Offset(0, 10),
          )
        ]
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, color: color.withValues(alpha: 0.7), size: 24),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title.toUpperCase(),
                style: const TextStyle(fontSize: 9, color: AppColors.inkSecondary, fontWeight: FontWeight.w900, letterSpacing: 0.5),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.5),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildOperationRow(String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 16),
          Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14))),
          const SizedBox(width: 8),
          Flexible(child: Text(value, style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: color), overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }
}
