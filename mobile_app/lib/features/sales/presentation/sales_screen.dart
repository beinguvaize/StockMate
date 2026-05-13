import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';

class SalesScreen extends ConsumerWidget {
  const SalesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final salesAsync = ref.watch(recentSalesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AddSaleScreen()),
        ),
        backgroundColor: AppColors.primaryContainer,
        foregroundColor: AppColors.primary,
        elevation: 0,
        child: const Icon(LucideIcons.plus, size: 24),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Sales',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary,
                      letterSpacing: -0.3,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [AppColors.cardShadow],
                    ),
                    child: Row(
                      children: [
                        const Icon(LucideIcons.calendar, size: 14, color: AppColors.inkTertiary),
                        const SizedBox(width: 6),
                        Text(
                          'Today',
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.inkSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // ── Summary bar ───────────────────────────────────────
            salesAsync.maybeWhen(
              data: (sales) {
                final total = sales.fold(0.0, (sum, s) => sum + (s.totalAmount ?? 0));
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'TOTAL TODAY',
                                style: GoogleFonts.jetBrainsMono(
                                  fontSize: 10,
                                  color: Colors.white60,
                                  letterSpacing: 0.06,
                                ),
                              ),
                              Text(
                                '₹${total.toStringAsFixed(0)}',
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          width: 1,
                          height: 40,
                          color: Colors.white24,
                          margin: const EdgeInsets.symmetric(horizontal: 16),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              'COUNT',
                              style: GoogleFonts.jetBrainsMono(
                                fontSize: 10,
                                color: Colors.white60,
                                letterSpacing: 0.06,
                              ),
                            ),
                            Text(
                              '${sales.length} sales',
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
              orElse: () => const SizedBox.shrink(),
            ),

            const SizedBox(height: 20),

            // ── Sales list ────────────────────────────────────────
            Expanded(
              child: salesAsync.when(
                data: (sales) {
                  if (sales.isEmpty) {
                    return Center(
                      child: Text(
                        'No recent sales found.',
                        style: GoogleFonts.inter(color: AppColors.inkTertiary),
                      ),
                    );
                  }

                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 100),
                    itemCount: sales.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final sale = sales[index];
                      final customerName = sale.customerInfo?['name'] as String? ?? 'Walk-in Customer';
                      final isPaid = sale.paymentStatus == 'PAID';

                      return Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [AppColors.cardShadow],
                        ),
                        child: Row(
                          children: [
                            // Status icon
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: AppColors.primaryContainer.withValues(alpha: 0.3),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(
                                sale.status == 'COMPLETED' ? LucideIcons.checkCircle2 : LucideIcons.clock,
                                color: sale.status == 'COMPLETED' ? AppColors.success : AppColors.warning,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 14),

                            // Name + invoice
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    customerName,
                                    style: GoogleFonts.hankenGrotesk(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.inkPrimary,
                                    ),
                                  ),
                                  Text(
                                    '#${sale.id.substring(0, 8).toUpperCase()}',
                                    style: GoogleFonts.jetBrainsMono(
                                      fontSize: 11,
                                      color: AppColors.inkTertiary,
                                    ),
                                  ),
                                ],
                              ),
                            ),

                            // Amount + status
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  '₹${sale.totalAmount?.toStringAsFixed(0) ?? "0"}',
                                  style: GoogleFonts.hankenGrotesk(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.success,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: isPaid
                                        ? AppColors.success.withValues(alpha: 0.1)
                                        : AppColors.warning.withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    isPaid ? 'Paid' : 'Credit',
                                    style: GoogleFonts.inter(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      color: isPaid ? AppColors.success : AppColors.warning,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: GoogleFonts.inter(color: AppColors.danger)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
