import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
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

final _reportSummaryProvider = FutureProvider.family<_ReportSummary, ({String tenantId, DateTimeRange range})>((ref, params) async {
  final start = params.range.start.toIso8601String();
  final end = params.range.end.toIso8601String();

  final salesData = await supabase
      .from('sales')
      .select('total_amount')
      .eq('tenant_id', params.tenantId)
      .gte('date', start)
      .lte('date', end);

  final expensesData = await supabase
      .from('expenses')
      .select('amount')
      .eq('tenant_id', params.tenantId)
      .gte('date', start)
      .lte('date', end);

  final purchasesData = await supabase
      .from('purchases')
      .select('total_amount')
      .eq('tenant_id', params.tenantId)
      .gte('date', start)
      .lte('date', end);

  double totalSales = 0;
  for (final row in salesData as List) {
    totalSales += (row['total_amount'] as num? ?? 0).toDouble();
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
    );
    if (picked != null) {
      setState(() => _dateRange = picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Reports', style: TextStyle(color: AppColors.inkPrimary, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
      ),
      body: tenantAsync.when(
        data: (ctx) {
          if (ctx == null) {
            return const Center(child: Text('No tenant context.'));
          }

          // Check plan gate
          if (!planMeetsRequirement('reports', ctx.plan)) {
            return _buildUpgradeBanner('PRO');
          }

          final params = (tenantId: ctx.tenantId, range: _dateRange);
          final summaryAsync = ref.watch(_reportSummaryProvider(params));

          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Date Range Picker
                GestureDetector(
                  onTap: _pickDateRange,
                  child: GlassPanel(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    borderRadius: 14,
                    child: Row(
                      children: [
                        const Icon(LucideIcons.calendar, color: AppColors.inkSecondary, size: 18),
                        const SizedBox(width: 10),
                        Text(
                          '${_formatDate(_dateRange.start)}  →  ${_formatDate(_dateRange.end)}',
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                        ),
                        const Spacer(),
                        const Icon(LucideIcons.chevronDown, color: AppColors.inkSecondary, size: 16),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                summaryAsync.when(
                  data: (summary) => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Summary', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 16),
                      _buildReportCard('Total Sales', summary.totalSales, Colors.green, LucideIcons.trendingUp),
                      _buildReportCard('Total Expenses', summary.totalExpenses, AppColors.danger, LucideIcons.trendingDown),
                      _buildReportCard('Total Purchases', summary.totalPurchases, Colors.purple, LucideIcons.shoppingBag),
                      _buildReportCard(
                        'Net Profit / Loss',
                        summary.netProfit,
                        summary.netProfit >= 0 ? Colors.green : AppColors.danger,
                        summary.netProfit >= 0 ? LucideIcons.thumbsUp : LucideIcons.thumbsDown,
                      ),
                      const SizedBox(height: 24),
                      const Text('GST Reports', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 16),
                      _buildGSTCard('GSTR-1', 'Outward Supplies Report'),
                      _buildGSTCard('GSTR-3B', 'Monthly Return Summary'),
                    ],
                  ),
                  loading: () => const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator())),
                  error: (e, _) => Center(child: Text('Error loading report: $e')),
                ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  Widget _buildReportCard(String title, double amount, Color color, IconData icon) {
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
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            ),
            Text(
              '₹${amount.toStringAsFixed(2)}',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: color),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGSTCard(String type, String subtitle) {
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
                color: AppColors.info.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(LucideIcons.fileText, color: AppColors.info, size: 20),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(type, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  Text(subtitle, style: const TextStyle(color: AppColors.inkSecondary, fontSize: 12)),
                ],
              ),
            ),
            const Icon(LucideIcons.download, color: AppColors.inkSecondary, size: 18),
          ],
        ),
      ),
    );
  }

  Widget _buildUpgradeBanner(String requiredPlan) {
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
            Text(
              'Reports are available on the $requiredPlan plan and above.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.inkSecondary, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }
}
