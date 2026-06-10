import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/reports/data/report_params.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/date_range_chip.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_kpi_tile.dart';
import 'package:mobile_app/features/reports/presentation/widgets/simple_pie_chart.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart';

// Distinct palette for pie slices — cycles if more categories than colors.
const _kSliceColors = [
  Color(0xFF059669),
  Color(0xFF2563EB),
  Color(0xFF7C3AED),
  Color(0xFFF59E0B),
  Color(0xFFDC2626),
  Color(0xFF0891B2),
  Color(0xFF065F46),
  Color(0xFF9333EA),
];

class ExpensesReportScreen extends ConsumerStatefulWidget {
  const ExpensesReportScreen({super.key});

  @override
  ConsumerState<ExpensesReportScreen> createState() => _ExpensesReportScreenState();
}

class _ExpensesReportScreenState extends ConsumerState<ExpensesReportScreen> {
  DateTimeRange _range = DateTimeRange(
    start: DateTime.now().subtract(const Duration(days: 30)),
    end: DateTime.now(),
  );

  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return tenantAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        body: Center(child: Text('Error: $e')),
      ),
      data: (ctx) {
        if (ctx == null) {
          return const Scaffold(
            body: Center(child: Text('No tenant context')),
          );
        }
        final params = ReportParams(
          tenantId: ctx.tenantId,
          from: _range.start,
          to: _range.end,
        );
        return _ExpensesView(
          params: params,
          range: _range,
          onRangeChanged: (r) => setState(() => _range = r),
        );
      },
    );
  }
}

class _ExpensesView extends ConsumerWidget {
  final ReportParams params;
  final DateTimeRange range;
  final ValueChanged<DateTimeRange> onRangeChanged;

  const _ExpensesView({
    required this.params,
    required this.range,
    required this.onRangeChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final expensesAsync = ref.watch(reportExpensesProvider(params));

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 16,
        title: Text(
          'Expenses',
          style: GoogleFonts.manrope(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: AppColors.inkPrimary,
          ),
        ),
        actions: [
          DateRangeChip(range: range, onChanged: onRangeChanged),
          const SizedBox(width: 12),
        ],
      ),
      body: expensesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text(
            'Failed to load expenses\n$e',
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(color: AppColors.danger, fontSize: 13),
          ),
        ),
        data: (expenses) => _ExpensesBody(expenses: expenses, range: range),
      ),
    );
  }
}

class _ExpensesBody extends StatelessWidget {
  final List<Map<String, dynamic>> expenses;
  final DateTimeRange range;

  const _ExpensesBody({required this.expenses, required this.range});

  @override
  Widget build(BuildContext context) {
    // ── Computations ──────────────────────────────────────────────────────────
    final total = expenses.fold(
        0.0, (s, e) => s + ((e['amount'] as num?)?.toDouble() ?? 0));
    final days = range.end.difference(range.start).inDays.clamp(1, 365);
    final dailyBurn = total / days;

    // By category
    final Map<String, double> byCat = {};
    for (final e in expenses) {
      final cat = (e['category'] as String?) ?? 'Other';
      byCat[cat] = (byCat[cat] ?? 0) + ((e['amount'] as num?)?.toDouble() ?? 0);
    }

    final topCat = byCat.entries.isEmpty
        ? '-'
        : (byCat.entries.toList()..sort((a, b) => b.value.compareTo(a.value))).first.key;

    // Sorted categories for breakdown cards
    final sortedCats = byCat.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final maxCatAmount = sortedCats.isEmpty ? 1.0 : sortedCats.first.value;

    // Count of entries per category
    final Map<String, int> catCount = {};
    for (final e in expenses) {
      final cat = (e['category'] as String?) ?? 'Other';
      catCount[cat] = (catCount[cat] ?? 0) + 1;
    }

    // Pie slices (one per category, assigned colors)
    final slices = sortedCats.asMap().entries.map((entry) {
      return PieSlice(
        label: entry.value.key,
        value: entry.value.value,
        color: _kSliceColors[entry.key % _kSliceColors.length],
      );
    }).toList();

    // Last 50 expense items sorted by date desc
    final displayExpenses = List<Map<String, dynamic>>.from(expenses)
      ..sort((a, b) {
        final da = (a['date'] as String?) ?? '';
        final db = (b['date'] as String?) ?? '';
        return db.compareTo(da);
      });
    final listExpenses = displayExpenses.take(50).toList();

    if (expenses.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.receipt,
                size: 48, color: AppColors.inkTertiary.withValues(alpha: 0.5)),
            const SizedBox(height: 16),
            Text(
              'No expenses in this period',
              style: GoogleFonts.manrope(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.inkSecondary,
              ),
            ),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        // ── 3 KPI tiles in a row ───────────────────────────────────────────────
        _SectionLabel('Overview'),
        const SizedBox(height: 10),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ReportKpiTile(
                  label: 'Total Burn',
                  value: compactINR(total),
                  icon: LucideIcons.flame,
                  color: const Color(0xFFDC2626),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ReportKpiTile(
                  label: 'Primary Sink',
                  value: topCat,
                  icon: LucideIcons.tag,
                  color: const Color(0xFFEA580C),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ReportKpiTile(
                  label: 'Daily Burn',
                  value: '₹${dailyBurn.toStringAsFixed(0)}/day',
                  icon: LucideIcons.trendingUp,
                  color: const Color(0xFFD97706),
                ),
              ),
            ],
          ),
        ),

        // ── Pie chart ─────────────────────────────────────────────────────────
        const SizedBox(height: 24),
        _SectionLabel('Spend by Category'),
        const SizedBox(height: 10),
        _ChartCard(
          child: Center(child: SimplePieChart(slices: slices, size: 160)),
        ),

        // ── Category breakdown cards ───────────────────────────────────────────
        const SizedBox(height: 24),
        _SectionLabel('Category Breakdown'),
        const SizedBox(height: 10),
        ...sortedCats.asMap().entries.map((entry) {
          final idx = entry.key;
          final cat = entry.value.key;
          final amount = entry.value.value;
          final count = catCount[cat] ?? 0;
          final ratio = maxCatAmount > 0 ? amount / maxCatAmount : 0.0;
          final barColor = _kSliceColors[idx % _kSliceColors.length];
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _CategoryCard(
              category: cat,
              amount: amount,
              count: count,
              ratio: ratio,
              barColor: barColor,
            ),
          );
        }),

        // ── Expense list (last 50) ─────────────────────────────────────────────
        const SizedBox(height: 16),
        _SectionLabel('Recent Expenses (${listExpenses.length})'),
        const SizedBox(height: 10),
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: listExpenses.length,
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            final exp = listExpenses[index];
            final date = (exp['date'] as String?) ?? '';
            final note = (exp['note'] as String?) ?? '';
            final category = (exp['category'] as String?) ?? 'Other';
            final amount = (exp['amount'] as num?)?.toDouble() ?? 0.0;
            // Determine pill color based on category position in sorted list
            final catIdx = sortedCats.indexWhere((e) => e.key == category);
            final pillColor =
                catIdx >= 0 ? _kSliceColors[catIdx % _kSliceColors.length] : _kSliceColors[0];

            return _ExpenseItem(
              date: date,
              note: note.isNotEmpty ? note : category,
              category: category,
              pillColor: pillColor,
              amount: amount,
            );
          },
        ),
      ],
    );
  }
}

// ── Category breakdown card ──────────────────────────────────────────────────

class _CategoryCard extends StatelessWidget {
  final String category;
  final double amount;
  final int count;
  final double ratio;
  final Color barColor;

  const _CategoryCard({
    required this.category,
    required this.amount,
    required this.count,
    required this.ratio,
    required this.barColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [AppColors.cardShadow],
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  category,
                  style: GoogleFonts.manrope(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkPrimary,
                  ),
                ),
              ),
              Text(
                compactINR(amount),
                style: GoogleFonts.manrope(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFFDC2626),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '$count entr${count == 1 ? 'y' : 'ies'}',
            style: GoogleFonts.manrope(
              fontSize: 11,
              color: AppColors.inkSecondary,
            ),
          ),
          const SizedBox(height: 8),
          LayoutBuilder(builder: (context, constraints) {
            return Stack(
              children: [
                Container(
                  height: 6,
                  width: constraints.maxWidth,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainer,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                Container(
                  height: 6,
                  width: constraints.maxWidth * ratio,
                  decoration: BoxDecoration(
                    color: barColor,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ],
            );
          }),
        ],
      ),
    );
  }
}

// ── Expense list item ────────────────────────────────────────────────────────

class _ExpenseItem extends StatelessWidget {
  final String date;
  final String note;
  final String category;
  final Color pillColor;
  final double amount;

  const _ExpenseItem({
    required this.date,
    required this.note,
    required this.category,
    required this.pillColor,
    required this.amount,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [AppColors.cardShadow],
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Row(
        children: [
          // Left: date + note
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  date,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 11,
                    color: AppColors.inkTertiary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  note,
                  style: GoogleFonts.manrope(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: AppColors.inkPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: pillColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    category,
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: pillColor,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Right: amount
          Text(
            compactINR(amount),
            style: GoogleFonts.manrope(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: const Color(0xFFDC2626),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: GoogleFonts.jetBrainsMono(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
        color: AppColors.inkTertiary,
      ),
    );
  }
}

class _ChartCard extends StatelessWidget {
  final Widget child;
  const _ChartCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [AppColors.cardShadow],
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: child,
    );
  }
}
