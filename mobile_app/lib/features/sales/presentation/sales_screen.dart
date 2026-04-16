import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart';

class SalesScreen extends ConsumerWidget {
  const SalesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final salesAsync = ref.watch(recentSalesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Sales & Orders',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -1,
                        ),
                      ),
                      Text(
                        'Recent Transactions',
                        style: TextStyle(
                          color: AppColors.inkSecondary,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                  GestureDetector(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AddSaleScreen())),
                    child: GlassPanel(
                      padding: const EdgeInsets.all(10),
                      borderRadius: 12,
                      child: const Icon(LucideIcons.plus, size: 24),
                    ),
                  ),
                ],
              ),
            ),
            
            const SizedBox(height: 10),
            
            // Sales List
            Expanded(
              child: salesAsync.when(
                data: (sales) {
                  if (sales.isEmpty) {
                    return const Center(
                      child: Text('No recent sales found.', style: TextStyle(color: AppColors.inkSecondary)),
                    );
                  }
                  
                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
                    itemCount: sales.length,
                    itemBuilder: (context, index) {
                      final sale = sales[index];
                      final customerName = sale.customerInfo?['name'] ?? 'Walk-in Customer';
                      
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: GlassPanel(
                          padding: const EdgeInsets.all(16),
                          borderRadius: 20,
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: AppColors.canvas,
                                  borderRadius: BorderRadius.circular(15),
                                ),
                                child: Icon(
                                  sale.status == 'COMPLETED' ? LucideIcons.checkCircle : LucideIcons.clock,
                                  color: sale.status == 'COMPLETED' ? AppColors.success : AppColors.warning,
                                  size: 24,
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      customerName,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16,
                                      ),
                                    ),
                                    Text(
                                      'Order: #${sale.id.substring(0, 8).toUpperCase()}',
                                      style: const TextStyle(
                                        color: AppColors.inkSecondary,
                                        fontSize: 12,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          '₹${sale.totalAmount?.toStringAsFixed(2) ?? "0.00"}',
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w900,
                                            color: AppColors.inkPrimary,
                                          ),
                                        ),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: sale.paymentStatus == 'PAID' 
                                                ? AppColors.success.withOpacity(0.2)
                                                : AppColors.danger.withOpacity(0.2),
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          child: Text(
                                            sale.paymentStatus ?? 'UNPAID',
                                            style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.bold,
                                              color: sale.paymentStatus == 'PAID' ? AppColors.success : AppColors.danger,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, stack) => Center(child: Text('Error: $err')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
