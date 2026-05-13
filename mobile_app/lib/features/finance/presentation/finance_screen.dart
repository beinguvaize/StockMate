import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/finance/presentation/add_expense_screen.dart';
import 'package:mobile_app/features/finance/presentation/providers/finance_provider.dart';

class FinanceScreen extends ConsumerWidget {
  const FinanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final expensesAsync = ref.watch(expensesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Expenses',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: AppColors.inkPrimary,
          ),
        ),
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: GestureDetector(
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AddExpenseScreen()),
              ),
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(LucideIcons.plus, size: 20, color: AppColors.primary),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // ── Summary card ──────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [AppColors.cardShadow],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'TOTAL THIS MONTH',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 10,
                            color: AppColors.inkTertiary,
                            letterSpacing: 0.06,
                          ),
                        ),
                        const SizedBox(height: 4),
                        expensesAsync.maybeWhen(
                          data: (expenses) {
                            final total = expenses.fold(0.0, (sum, exp) => sum + (exp.amount ?? 0));
                            return Text(
                              '₹${total.toStringAsFixed(0)}',
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 32,
                                fontWeight: FontWeight.w700,
                                color: AppColors.danger,
                                letterSpacing: -0.5,
                              ),
                            );
                          },
                          orElse: () => Text(
                            '₹ …',
                            style: GoogleFonts.hankenGrotesk(
                              fontSize: 32,
                              fontWeight: FontWeight.w700,
                              color: AppColors.inkPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.danger.withValues(alpha: 0.08),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(LucideIcons.trendingDown, color: AppColors.danger, size: 26),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 20),

            // ── Expense list ──────────────────────────────────────
            Expanded(
              child: expensesAsync.when(
                data: (expenses) {
                  if (expenses.isEmpty) {
                    return Center(
                      child: Text(
                        'No expenses recorded.',
                        style: GoogleFonts.inter(color: AppColors.inkTertiary),
                      ),
                    );
                  }

                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
                    itemCount: expenses.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final expense = expenses[index];

                      return Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [AppColors.cardShadow],
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: AppColors.danger.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(LucideIcons.receipt, color: AppColors.danger, size: 20),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    expense.category ?? 'Uncategorized',
                                    style: GoogleFonts.hankenGrotesk(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.inkPrimary,
                                    ),
                                  ),
                                  if (expense.note != null && expense.note!.isNotEmpty)
                                    Text(
                                      expense.note!,
                                      style: GoogleFonts.inter(fontSize: 12, color: AppColors.inkTertiary),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  Text(
                                    expense.date ?? '',
                                    style: GoogleFonts.jetBrainsMono(
                                      fontSize: 10,
                                      color: AppColors.inkTertiary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              '₹${expense.amount?.toStringAsFixed(0) ?? "0"}',
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: AppColors.danger,
                              ),
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
