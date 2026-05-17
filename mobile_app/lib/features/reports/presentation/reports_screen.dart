import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:lucide_icons/lucide_icons.dart';

class _ReportSummary {
  final double totalSales;
  final double totalExpenses;
  final double totalPurchases;
  final double netProfit;

  const _ReportSummary({
    required this.totalSales,
    required this.totalExpenses,
    required this.totalPurchases,
    required this.netProfit,
  });
}

final _reportSummaryProvider = FutureProvider.family<_ReportSummary,
    ({String tenantId, DateTimeRange range})>((ref, params) async {
  final start = params.range.start.toIso8601String().split('T').first;
  final end = params.range.end.toIso8601String().split('T').first;

  final salesData = await supabase
      .from('sales')
      .select('totalAmount')
      .gte('date', start)
      .lte('date', end);

  final expensesData = await supabase
      .from('expenses')
      .select('amount')
      .gte('date', start)
      .lte('date', end);

  final purchasesData = await supabase
      .from('purchases')
      .select('total_amount')
      .gte('date', start)
      .lte('date', end);

  double totalSales = 0;
  for (final row in salesData as List) {
    totalSales += (row['totalAmount'] as num? ?? 0).toDouble();
  }
  double totalExpenses = 0;
  for (final row in expensesData as List) {
    totalExpenses += (row['amount'] as num? ?? 0).toDouble();
  }
  double totalPurchases = 0;
  for (final row in purchasesData as List) {
    totalPurchases += (row['total_amount'] as num? ?? 0).toDouble();
  }

  return _ReportSummary(
    totalSales: totalSales,
    totalExpenses: totalExpenses,
    totalPurchases: totalPurchases,
    netProfit: totalSales - totalExpenses - totalPurchases,
  );
});

class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  DateTimeRange _dateRange = DateTimeRange(
    start: DateTime.now().subtract(const Duration(days: 30)),
    end: DateTime.now(),
  );

  Future<void> _pickDateRange() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      initialDateRange: _dateRange,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
            primary: AppColors.primary,
            onPrimary: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _dateRange = picked);
  }

  String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  String _compact(double v) {
    if (v >= 10000000) return '₹${(v / 10000000).toStringAsFixed(1)}Cr';
    if (v >= 100000) return '₹${(v / 100000).toStringAsFixed(1)}L';
    if (v >= 1000) return '₹${(v / 1000).toStringAsFixed(1)}K';
    return '₹${v.toStringAsFixed(0)}';
  }

  @override
  Widget build(BuildContext context) {
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
              'Reports',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'BUSINESS ANALYTICS',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.secondary,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: GestureDetector(
              onTap: _pickDateRange,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.primaryContainer),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(LucideIcons.calendar,
                        size: 12, color: AppColors.primary),
                    const SizedBox(width: 6),
                    Text(
                      '${_fmt(_dateRange.start)} – ${_fmt(_dateRange.end)}',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      body: tenantAsync.when(
        data: (ctx) {
          if (ctx == null) {
            return const Center(child: Text('No tenant context.'));
          }
          if (!planMeetsRequirement('reports', ctx.plan)) {
            return _UpgradeBanner();
          }

          final params = (tenantId: ctx.tenantId, range: _dateRange);
          final summaryAsync = ref.watch(_reportSummaryProvider(params));

          return summaryAsync.when(
            data: (summary) => SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Net profit hero
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: summary.netProfit >= 0
                          ? AppColors.primaryContainer
                          : AppColors.danger.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              summary.netProfit >= 0
                                  ? LucideIcons.trendingUp
                                  : LucideIcons.trendingDown,
                              size: 16,
                              color: summary.netProfit >= 0
                                  ? AppColors.inkPrimary
                                  : AppColors.danger,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'NET PROFIT / LOSS',
                              style: GoogleFonts.jetBrainsMono(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1.5,
                                color: summary.netProfit >= 0
                                    ? AppColors.inkPrimary.withValues(alpha: 0.6)
                                    : AppColors.danger,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${summary.netProfit >= 0 ? '+' : ''}${_compact(summary.netProfit)}',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 40,
                            fontWeight: FontWeight.w900,
                            color: summary.netProfit >= 0
                                ? AppColors.inkPrimary
                                : AppColors.danger,
                            letterSpacing: -2,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${_fmt(_dateRange.start)} – ${_fmt(_dateRange.end)}',
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: summary.netProfit >= 0
                                ? AppColors.inkPrimary.withValues(alpha: 0.5)
                                : AppColors.danger.withValues(alpha: 0.7),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Section header
                  _SectionHeader(title: 'BREAKDOWN', icon: LucideIcons.barChart2),
                  const SizedBox(height: 12),

                  _MetricCard(
                    label: 'Total Sales',
                    value: _compact(summary.totalSales),
                    icon: LucideIcons.shoppingCart,
                    color: AppColors.success,
                    subtitle: 'Revenue from all sales',
                  ),
                  const SizedBox(height: 10),
                  _MetricCard(
                    label: 'Total Expenses',
                    value: _compact(summary.totalExpenses),
                    icon: LucideIcons.receipt,
                    color: AppColors.danger,
                    subtitle: 'Operational costs',
                  ),
                  const SizedBox(height: 10),
                  _MetricCard(
                    label: 'Total Purchases',
                    value: _compact(summary.totalPurchases),
                    icon: LucideIcons.shoppingBag,
                    color: AppColors.warning,
                    subtitle: 'Procurement spend',
                  ),

                  const SizedBox(height: 28),

                  // GST section
                  _SectionHeader(title: 'GST REPORTS', icon: LucideIcons.fileText),
                  const SizedBox(height: 12),
                  _GSTCard(
                    type: 'GSTR-1',
                    subtitle: 'Outward Supplies Report',
                    color: AppColors.info,
                  ),
                  const SizedBox(height: 10),
                  _GSTCard(
                    type: 'GSTR-3B',
                    subtitle: 'Monthly Return Summary',
                    color: AppColors.secondary,
                  ),
                ],
              ),
            ),
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
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final String subtitle;

  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.hankenGrotesk(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: AppColors.inkPrimary,
                  ),
                ),
                Text(
                  subtitle,
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    color: AppColors.inkSecondary,
                  ),
                ),
              ],
            ),
          ),
          Text(
            value,
            style: GoogleFonts.hankenGrotesk(
              fontWeight: FontWeight.w900,
              fontSize: 20,
              color: color,
              letterSpacing: -0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _GSTCard extends StatelessWidget {
  final String type;
  final String subtitle;
  final Color color;

  const _GSTCard({
    required this.type,
    required this.subtitle,
    required this.color,
  });

  void _showGstrComingSoon(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('GSTR Export'),
        content: const Text(
          'GSTR export will be available in the next update. '
          'For now, please use the web dashboard to download your GST reports.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _showGstrComingSoon(context),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(LucideIcons.fileText, color: color, size: 20),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    type,
                    style: GoogleFonts.hankenGrotesk(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: AppColors.inkPrimary,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      color: AppColors.inkSecondary,
                    ),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.primaryContainer.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(LucideIcons.download,
                  size: 16, color: AppColors.primary),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final IconData icon;
  const _SectionHeader({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: AppColors.primaryContainer.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 14, color: AppColors.primary),
        ),
        const SizedBox(width: 10),
        Text(
          title,
          style: GoogleFonts.jetBrainsMono(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
            color: AppColors.primary,
          ),
        ),
      ],
    );
  }
}

class _UpgradeBanner extends StatelessWidget {
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
              'Reports are available on PRO plan and above.',
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
