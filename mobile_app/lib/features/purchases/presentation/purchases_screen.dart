import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
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

final purchasesProvider =
    FutureProvider.family<List<Purchase>, String>((ref, tenantId) async {
  final data = await supabase
      .from('purchases')
      .select('id, supplier_name, total_amount, payment_method, date')
      .eq('tenant_id', tenantId)
      .order('date', ascending: false);

  return (data as List)
      .map((row) => Purchase.fromMap(row as Map<String, dynamic>))
      .toList();
});

class PurchasesScreen extends ConsumerWidget {
  const PurchasesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenantAsync = ref.watch(tenantContextProvider);

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
              'Purchases',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'PROCUREMENT',
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
      body: tenantAsync.when(
        data: (ctx) {
          if (ctx == null) return const Center(child: Text('No tenant context.'));

          if (!planMeetsRequirement('purchases', ctx.plan)) {
            return _UpgradeBanner(feature: 'Purchases');
          }

          final purchasesAsync = ref.watch(purchasesProvider(ctx.tenantId));

          return purchasesAsync.when(
            data: (purchases) {
              final totalSpent =
                  purchases.fold<double>(0, (s, p) => s + p.totalAmount);

              return CustomScrollView(
                slivers: [
                  // Stats
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                      child: Row(
                        children: [
                          Expanded(
                            flex: 2,
                            child: Container(
                              padding: const EdgeInsets.all(18),
                              decoration: BoxDecoration(
                                color: AppColors.primaryContainer,
                                borderRadius: BorderRadius.circular(18),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'TOTAL SPENT',
                                    style: GoogleFonts.jetBrainsMono(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 1.2,
                                      color: AppColors.inkPrimary
                                          .withValues(alpha: 0.6),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '₹${_formatCompact(totalSpent)}',
                                    style: GoogleFonts.hankenGrotesk(
                                      fontSize: 28,
                                      fontWeight: FontWeight.w900,
                                      color: AppColors.inkPrimary,
                                      letterSpacing: -1,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Container(
                              padding: const EdgeInsets.all(18),
                              decoration: BoxDecoration(
                                color: AppColors.surface,
                                borderRadius: BorderRadius.circular(18),
                                border: Border.all(
                                    color:
                                        Colors.black.withValues(alpha: 0.06)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'ORDERS',
                                    style: GoogleFonts.jetBrainsMono(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 1.2,
                                      color: AppColors.inkSecondary,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${purchases.length}',
                                    style: GoogleFonts.hankenGrotesk(
                                      fontSize: 28,
                                      fontWeight: FontWeight.w900,
                                      color: AppColors.secondary,
                                      letterSpacing: -1,
                                    ),
                                  ),
                                ],
                              ),
                            ),
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
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer
                                  .withValues(alpha: 0.3),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Icon(LucideIcons.shoppingBag,
                                size: 14, color: AppColors.primary),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            'PURCHASE HISTORY',
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

                  if (purchases.isEmpty)
                    SliverFillRemaining(
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(20),
                              decoration: BoxDecoration(
                                color: AppColors.surface,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(LucideIcons.shoppingBag,
                                  size: 36, color: AppColors.inkSecondary),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'No purchases yet',
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: AppColors.inkPrimary,
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
                            final p = purchases[index];
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: _PurchaseCard(purchase: p),
                            );
                          },
                          childCount: purchases.length,
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
            backgroundColor: AppColors.primaryContainer,
            shape: const StadiumBorder(),
            child: const Icon(LucideIcons.plus, color: AppColors.inkPrimary),
          );
        },
        orElse: () => null,
      ),
    );
  }

  void _showAddPurchaseSheet(
      BuildContext context, WidgetRef ref, String tenantId) {
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
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.fromLTRB(
              24, 24, 24, MediaQuery.of(context).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.inkSecondary.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'New Purchase',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              Text(
                'PROCUREMENT',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  color: AppColors.secondary,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 20),
              _SheetField(controller: supplierController,
                  label: 'Supplier Name', icon: LucideIcons.building2),
              const SizedBox(height: 12),
              _SheetField(controller: amountController,
                  label: 'Total Amount (₹)', icon: LucideIcons.indianRupee,
                  keyboardType: TextInputType.number),
              const SizedBox(height: 12),
              _SheetField(controller: paymentController,
                  label: 'Payment Method', icon: LucideIcons.creditCard),
              const SizedBox(height: 12),
              _SheetField(controller: dateController,
                  label: 'Date (YYYY-MM-DD)', icon: LucideIcons.calendar),
              const SizedBox(height: 24),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryContainer,
                  foregroundColor: AppColors.inkPrimary,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: const StadiumBorder(),
                  textStyle: GoogleFonts.jetBrainsMono(
                      fontWeight: FontWeight.w700, fontSize: 13,
                      letterSpacing: 1),
                ),
                onPressed: () async {
                  try {
                    await supabase.from('purchases').insert({
                      'supplier_name': supplierController.text.trim(),
                      'total_amount':
                          double.tryParse(amountController.text.trim()) ?? 0,
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
                        SnackBar(
                            content: Text('Error: $e'),
                            backgroundColor: AppColors.danger),
                      );
                    }
                  }
                },
                child: const Text('SAVE PURCHASE'),
              ),
            ],
          ),
        );
      },
    );
  }

  static String _formatCompact(double value) {
    if (value >= 10000000) return '${(value / 10000000).toStringAsFixed(1)}Cr';
    if (value >= 100000) return '${(value / 100000).toStringAsFixed(1)}L';
    if (value >= 1000) return '${(value / 1000).toStringAsFixed(1)}K';
    return value.toStringAsFixed(0);
  }
}

class _PurchaseCard extends StatelessWidget {
  final Purchase purchase;
  const _PurchaseCard({required this.purchase});

  @override
  Widget build(BuildContext context) {
    final initial = (purchase.supplierName?.isNotEmpty == true)
        ? purchase.supplierName![0].toUpperCase()
        : 'S';

    final payMethod = (purchase.paymentMethod ?? '').toLowerCase();
    final Color methodColor;
    if (payMethod.contains('cash')) {
      methodColor = AppColors.success;
    } else if (payMethod.contains('credit')) {
      methodColor = AppColors.danger;
    } else {
      methodColor = AppColors.info;
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.surfaceContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: Text(
                initial,
                style: GoogleFonts.hankenGrotesk(
                  color: AppColors.inkSecondary,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  purchase.supplierName ?? 'Unknown Supplier',
                  style: GoogleFonts.hankenGrotesk(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: AppColors.inkPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    if (purchase.paymentMethod != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: methodColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          purchase.paymentMethod!.toUpperCase(),
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: methodColor,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                    ],
                    if (purchase.date != null)
                      Text(
                        purchase.date!,
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 10,
                          color: AppColors.inkSecondary,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          Text(
            '₹${purchase.totalAmount.toStringAsFixed(2)}',
            style: GoogleFonts.hankenGrotesk(
              fontWeight: FontWeight.w900,
              fontSize: 16,
              color: AppColors.inkPrimary,
              letterSpacing: -0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _SheetField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final TextInputType? keyboardType;

  const _SheetField({
    required this.controller,
    required this.label,
    required this.icon,
    this.keyboardType,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.canvas,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
      ),
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        style: GoogleFonts.inter(fontSize: 14, color: AppColors.inkPrimary),
        decoration: InputDecoration(
          prefixIcon: Icon(icon, size: 18, color: AppColors.inkSecondary),
          hintText: label,
          hintStyle: GoogleFonts.inter(
              color: AppColors.inkSecondary.withValues(alpha: 0.5),
              fontSize: 14),
          border: InputBorder.none,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide:
                const BorderSide(color: AppColors.primaryContainer, width: 1.5),
          ),
          enabledBorder: InputBorder.none,
        ),
      ),
    );
  }
}

class _UpgradeBanner extends StatelessWidget {
  final String feature;
  const _UpgradeBanner({required this.feature});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.primaryContainer.withValues(alpha: 0.2),
                shape: BoxShape.circle,
              ),
              child: const Icon(LucideIcons.lock,
                  color: AppColors.primary, size: 40),
            ),
            const SizedBox(height: 20),
            Text(
              'Upgrade Required',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '$feature requires PRO plan or above.',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                  color: AppColors.inkSecondary, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}
