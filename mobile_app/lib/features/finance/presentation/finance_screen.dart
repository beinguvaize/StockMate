import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/features/finance/presentation/providers/finance_provider.dart';
import 'package:mobile_app/features/finance/presentation/add_expense_screen.dart';


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
        title: const Text('Expenses & Finance', style: TextStyle(color: AppColors.inkPrimary, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // KPI Summary (Mocked for now)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: GlassPanel(
                padding: const EdgeInsets.all(20),
                borderRadius: 24,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Total Expenses', style: TextStyle(color: AppColors.inkSecondary, fontSize: 14)),
                        const SizedBox(height: 4),
                        expensesAsync.maybeWhen(
                          data: (expenses) {
                            final total = expenses.fold(0.0, (sum, exp) => sum + (exp.amount ?? 0));
                            return Text(
                              '₹${total.toStringAsFixed(2)}',
                              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: AppColors.danger),
                            );
                          },
                          orElse: () => const Text('...', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.danger.withValues(alpha: 0.1),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(LucideIcons.trendingDown, color: AppColors.danger, size: 28),
                    ),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 20),
            
            // Expense List
            Expanded(
              child: expensesAsync.when(
                data: (expenses) {
                  if (expenses.isEmpty) {
                    return const Center(child: Text('No expenses recorded.', style: TextStyle(color: AppColors.inkSecondary)));
                  }
                  
                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
                    itemCount: expenses.length,
                    itemBuilder: (context, index) {
                      final expense = expenses[index];
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
                                child: const Icon(LucideIcons.receipt, color: AppColors.inkSecondary),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(expense.category ?? 'Uncategorized', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                    if (expense.note != null && expense.note!.isNotEmpty)
                                      Text(expense.note!, style: const TextStyle(color: AppColors.inkSecondary, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                                    const SizedBox(height: 4),
                                    Text(expense.date ?? 'Unknown Date', style: const TextStyle(color: AppColors.inkSecondary, fontSize: 10)),
                                  ],
                                ),
                              ),
                              Text(
                                '₹${expense.amount?.toStringAsFixed(2) ?? "0.00"}',
                                style: const TextStyle(fontWeight: FontWeight.w900, color: AppColors.danger),
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
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const AddExpenseScreen()));
        },
        backgroundColor: AppColors.danger,
        child: const Icon(LucideIcons.plus, color: AppColors.surface),
      ),
    );
  }
}
