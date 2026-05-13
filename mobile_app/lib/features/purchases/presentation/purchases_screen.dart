import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
import 'package:lucide_icons/lucide_icons.dart';

class Purchase {
  final String id;
  final String? supplierName;
  final double totalAmount;
  final String? paymentMethod;
  final String? date;

  const Purchase({
    required this.id,
    this.supplierName,
    required this.totalAmount,
    this.paymentMethod,
    this.date,
  });

  factory Purchase.fromMap(Map<String, dynamic> map) {
    return Purchase(
      id: map['id'] as String,
      supplierName: map['supplier_name'] as String?,
      totalAmount: (map['total_amount'] as num? ?? 0).toDouble(),
      paymentMethod: map['payment_method'] as String?,
      date: map['date'] as String?,
    );
  }
}

final purchasesProvider = FutureProvider.family<List<Purchase>, String>((ref, tenantId) async {
  final data = await supabase
      .from('purchases')
      .select('id, supplier_name, total_amount, payment_method, date')
      .eq('tenant_id', tenantId)
      .order('date', ascending: false);

  return (data as List).map((row) => Purchase.fromMap(row as Map<String, dynamic>)).toList();
});

class PurchasesScreen extends ConsumerWidget {
  const PurchasesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Purchases', style: TextStyle(color: AppColors.inkPrimary, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
      ),
      body: tenantAsync.when(
        data: (ctx) {
          if (ctx == null) return const Center(child: Text('No tenant context.'));

          if (!planMeetsRequirement('purchases', ctx.plan)) {
            return _buildUpgradeBanner();
          }

          final purchasesAsync = ref.watch(purchasesProvider(ctx.tenantId));

          return purchasesAsync.when(
            data: (purchases) {
              if (purchases.isEmpty) {
                return const Center(
                  child: Text('No purchases recorded.', style: TextStyle(color: AppColors.inkSecondary)),
                );
              }

              return ListView.builder(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 100),
                itemCount: purchases.length,
                itemBuilder: (context, index) {
                  final p = purchases[index];
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
                              color: Colors.purple.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: const Icon(LucideIcons.shoppingBag, color: Colors.purple, size: 20),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  p.supplierName ?? 'Unknown Supplier',
                                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                                ),
                                if (p.paymentMethod != null)
                                  Text(
                                    p.paymentMethod!,
                                    style: const TextStyle(color: AppColors.inkSecondary, fontSize: 12),
                                  ),
                                if (p.date != null)
                                  Text(
                                    p.date!,
                                    style: const TextStyle(color: AppColors.inkSecondary, fontSize: 11),
                                  ),
                              ],
                            ),
                          ),
                          Text(
                            '₹${p.totalAmount.toStringAsFixed(2)}',
                            style: const TextStyle(fontWeight: FontWeight.w900, color: Colors.purple, fontSize: 16),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error: $e')),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
      floatingActionButton: tenantAsync.maybeWhen(
        data: (ctx) {
          if (ctx == null) return null;
          if (!planMeetsRequirement('purchases', ctx.plan)) return null;
          return FloatingActionButton(
            onPressed: () => _showAddPurchaseSheet(context, ref, ctx.tenantId),
            backgroundColor: Colors.purple,
            child: const Icon(LucideIcons.plus, color: Colors.white),
          );
        },
        orElse: () => null,
      ),
    );
  }

  Widget _buildUpgradeBanner() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(LucideIcons.lock, color: AppColors.warning, size: 40),
            ),
            const SizedBox(height: 20),
            const Text(
              'Upgrade to PRO',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.5),
            ),
            const SizedBox(height: 8),
            const Text(
              'Purchases are available on the PRO plan and above.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.inkSecondary, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  void _showAddPurchaseSheet(BuildContext context, WidgetRef ref, String tenantId) {
    final supplierController = TextEditingController();
    final amountController = TextEditingController();
    final paymentController = TextEditingController();
    final dateController = TextEditingController(
      text: DateTime.now().toIso8601String().split('T').first,
    );

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(context).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Add Purchase', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              const SizedBox(height: 20),
              _buildField(supplierController, 'Supplier Name', LucideIcons.user),
              const SizedBox(height: 16),
              _buildField(amountController, 'Total Amount (₹)', LucideIcons.indianRupee,
                  keyboardType: TextInputType.number),
              const SizedBox(height: 16),
              _buildField(paymentController, 'Payment Method (cash/upi/card)', LucideIcons.creditCard),
              const SizedBox(height: 16),
              _buildField(dateController, 'Date (YYYY-MM-DD)', LucideIcons.calendar),
              const SizedBox(height: 24),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.purple,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () async {
                  try {
                    await supabase.from('purchases').insert({
                      'supplier_name': supplierController.text.trim(),
                      'total_amount': double.tryParse(amountController.text.trim()) ?? 0,
                      'payment_method': paymentController.text.trim(),
                      'date': dateController.text.trim(),
                      'tenant_id': tenantId,
                    });
                    if (context.mounted) {
                      Navigator.pop(context);
                      ref.invalidate(purchasesProvider(tenantId));
                    }
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
                      );
                    }
                  }
                },
                child: const Text('Save Purchase', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildField(TextEditingController controller, String hint, IconData icon,
      {TextInputType? keyboardType}) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.canvas,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.inkTertiary.withValues(alpha: 0.15)),
      ),
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        decoration: InputDecoration(
          prefixIcon: Icon(icon, size: 18, color: AppColors.inkSecondary),
          hintText: hint,
          hintStyle: const TextStyle(color: AppColors.inkSecondary, fontSize: 14),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
      ),
    );
  }
}
