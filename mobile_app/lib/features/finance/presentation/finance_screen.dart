import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/finance/data/models/expense.dart';
import 'package:mobile_app/features/finance/presentation/add_expense_screen.dart';
import 'package:mobile_app/features/finance/presentation/providers/finance_provider.dart';

class FinanceScreen extends ConsumerWidget {
  const FinanceScreen({super.key});

  Color _categoryColor(String? category) {
    final cat = (category ?? '').toLowerCase();
    if (cat.contains('rent') || cat.contains('util')) return const Color(0xFF2196F3);
    if (cat.contains('inventory') || cat.contains('stock')) return AppColors.primary;
    if (cat.contains('health') || cat.contains('medical')) return AppColors.danger;
    if (cat.contains('food') || cat.contains('meal')) return AppColors.warning;
    return AppColors.inkSecondary;
  }

  IconData _categoryIcon(String? category) {
    final cat = (category ?? '').toLowerCase();
    if (cat.contains('rent') || cat.contains('util')) return LucideIcons.home;
    if (cat.contains('inventory') || cat.contains('stock')) return LucideIcons.package;
    if (cat.contains('health') || cat.contains('medical')) return LucideIcons.heartPulse;
    if (cat.contains('food') || cat.contains('meal')) return LucideIcons.utensils;
    return LucideIcons.receipt;
  }

  void _showExpenseSheet(BuildContext context, WidgetRef ref, Expense expense) {
    final color = _categoryColor(expense.category);
    final icon = _categoryIcon(expense.category);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        padding: EdgeInsets.fromLTRB(
          24, 12, 24, MediaQuery.of(context).viewInsets.bottom + 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: AppColors.inkTertiary.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(99),
              ),
            ),

            // Category icon + name
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color, size: 26),
            ),
            const SizedBox(height: 12),
            Text(
              expense.category ?? 'Uncategorized',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.inkPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '₹${expense.amount?.toStringAsFixed(0) ?? "0"}',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 32,
                fontWeight: FontWeight.w700,
                color: AppColors.danger,
                letterSpacing: -0.5,
              ),
            ),

            const SizedBox(height: 20),
            const Divider(height: 1),
            const SizedBox(height: 16),

            // Detail rows
            if (expense.note != null && expense.note!.isNotEmpty)
              _detailRow(LucideIcons.fileText, 'Description', expense.note!),
            if (expense.date != null)
              _detailRow(LucideIcons.calendar, 'Date', expense.date!),

            const SizedBox(height: 24),

            // Action buttons
            Row(
              children: [
                Expanded(
                  child: _actionButton(
                    icon: LucideIcons.pencil,
                    label: 'Edit',
                    color: AppColors.primary,
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AddExpenseScreen(expense: expense),
                        ),
                      ).then((_) => ref.invalidate(expensesProvider));
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _actionButton(
                    icon: LucideIcons.trash2,
                    label: 'Delete',
                    color: AppColors.danger,
                    onTap: () => _confirmDelete(context, ref, expense),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.inkTertiary),
          const SizedBox(width: 10),
          Text(
            '$label: ',
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.inkTertiary,
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.inkPrimary,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 8),
              Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context, WidgetRef ref, Expense expense) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          'Delete Expense',
          style: GoogleFonts.hankenGrotesk(
            fontWeight: FontWeight.w700,
            color: AppColors.inkPrimary,
          ),
        ),
        content: Text(
          'Remove ₹${expense.amount?.toStringAsFixed(0) ?? "0"} '
          '(${expense.category ?? "Uncategorized"}) from expenses? '
          'This cannot be undone.',
          style: GoogleFonts.inter(
            fontSize: 14,
            color: AppColors.inkSecondary,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(
              'Cancel',
              style: GoogleFonts.inter(
                color: AppColors.inkSecondary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx); // close dialog
              Navigator.pop(context); // close bottom sheet
              try {
                await supabase
                    .from('expenses')
                    .delete()
                    .eq('id', expense.id);
                ref.invalidate(expensesProvider);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Expense deleted'),
                      backgroundColor: AppColors.danger,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Failed to delete: $e'),
                      backgroundColor: AppColors.danger,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  );
                }
              }
            },
            child: Text(
              'Delete',
              style: GoogleFonts.inter(
                color: AppColors.danger,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final expensesAsync = ref.watch(expensesProvider);
    final now = DateTime.now();
    final monthLabel = _monthName(now.month);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        actions: const [SyncStatusPill()],
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: null,
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AddExpenseScreen()),
        ).then((_) => ref.invalidate(expensesProvider)),
        backgroundColor: AppColors.secondary,
        foregroundColor: AppColors.primaryContainer,
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        child: const Icon(LucideIcons.plus, size: 26),
      ),
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── Header ─────────────────────────────────────
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Text(
                            'Expenses Tracking',
                            style: GoogleFonts.hankenGrotesk(
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                              color: AppColors.inkPrimary,
                              letterSpacing: -0.3,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceContainer,
                            borderRadius: BorderRadius.circular(100),
                          ),
                          child: Text(
                            '$monthLabel ${now.year}',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 11,
                              color: AppColors.inkSecondary,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 20),

                    // ── Main stat card ──────────────────────────────
                    expensesAsync.maybeWhen(
                      data: (expenses) {
                        final total = expenses.fold(0.0, (sum, e) => sum + (e.amount ?? 0));
                        final categories = expenses.map((e) => e.category).toSet();

                        return Column(
                          children: [
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(24),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(24),
                                boxShadow: [AppColors.cardShadow],
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'TOTAL EXPENSES',
                                    style: GoogleFonts.jetBrainsMono(
                                      fontSize: 10,
                                      color: AppColors.inkTertiary,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    '-₹${total.toStringAsFixed(0)}',
                                    style: GoogleFonts.hankenGrotesk(
                                      fontSize: 36,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.danger,
                                      letterSpacing: -0.5,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      const Icon(LucideIcons.trendingDown, size: 14, color: AppColors.danger),
                                      const SizedBox(width: 6),
                                      Text(
                                        '${expenses.length} expenses this month',
                                        style: GoogleFonts.inter(
                                          fontSize: 12,
                                          color: AppColors.inkTertiary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),

                            const SizedBox(height: 12),

                            // ── Secondary stat cards ──────────────────
                            Row(
                              children: [
                                Expanded(
                                  child: Container(
                                    padding: const EdgeInsets.all(20),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(20),
                                      boxShadow: [AppColors.cardShadow],
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'BUDGET USED',
                                          style: GoogleFonts.jetBrainsMono(
                                            fontSize: 10,
                                            color: AppColors.inkTertiary,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                        const SizedBox(height: 8),
                                        ClipRRect(
                                          borderRadius: BorderRadius.circular(4),
                                          child: LinearProgressIndicator(
                                            value: (total / 100000).clamp(0.0, 1.0),
                                            backgroundColor: AppColors.surfaceContainer,
                                            valueColor: const AlwaysStoppedAnimation<Color>(AppColors.primaryContainer),
                                            minHeight: 6,
                                          ),
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          '${((total / 100000) * 100).clamp(0, 100).toStringAsFixed(0)}%',
                                          style: GoogleFonts.hankenGrotesk(
                                            fontSize: 20,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.inkPrimary,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Container(
                                    padding: const EdgeInsets.all(20),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(20),
                                      boxShadow: [AppColors.cardShadow],
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'ACTIVE CATEGORIES',
                                          style: GoogleFonts.jetBrainsMono(
                                            fontSize: 10,
                                            color: AppColors.inkTertiary,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          '${categories.length}',
                                          style: GoogleFonts.hankenGrotesk(
                                            fontSize: 28,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.inkPrimary,
                                            letterSpacing: -0.5,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        );
                      },
                      orElse: () => const SizedBox.shrink(),
                    ),

                    const SizedBox(height: 24),

                    // ── Recent Expenses header ──────────────────────
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Recent Expenses',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                        GestureDetector(
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => const AddExpenseScreen()),
                          ).then((_) => ref.invalidate(expensesProvider)),
                          child: Text(
                            'Manage ›',
                            style: GoogleFonts.inter(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),

            // ── Expenses list ──────────────────────────────────────
            expensesAsync.when(
              data: (expenses) {
                if (expenses.isEmpty) {
                  return const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(40),
                      child: Center(child: Text('No expenses recorded.')),
                    ),
                  );
                }

                return SliverPadding(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 100),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final item = expenses[index];
                        final tile = _buildExpenseItem(item, context, ref);
                        if (index < expenses.length - 1) {
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: tile,
                          );
                        }
                        return tile;
                      },
                      childCount: expenses.length,
                    ),
                  ),
                );
              },
              loading: () => const SliverToBoxAdapter(
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.all(40),
                    child: CircularProgressIndicator(color: AppColors.primary),
                  ),
                ),
              ),
              error: (err, stack) => SliverToBoxAdapter(
                child: Center(
                  child: Text('Error: $err', style: GoogleFonts.inter(color: AppColors.danger)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExpenseItem(Expense expense, BuildContext context, WidgetRef ref) {
    final color = _categoryColor(expense.category);
    final icon = _categoryIcon(expense.category);

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: () => _showExpenseSheet(context, ref, expense),
        borderRadius: BorderRadius.circular(20),
        child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          // Category icon circle
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 14),

          // Category name + note/date
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
                if (expense.date != null)
                  Text(
                    expense.date!,
                    style: GoogleFonts.jetBrainsMono(fontSize: 10, color: AppColors.inkTertiary),
                  ),
              ],
            ),
          ),

          // Amount
          Text(
            '₹${expense.amount?.toStringAsFixed(0) ?? "0"}',
            style: GoogleFonts.hankenGrotesk(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.danger,
            ),
          ),
        ],
      ),
        ),
      ),
    );
  }

  String _monthName(int month) {
    const months = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return months[month];
  }
}
