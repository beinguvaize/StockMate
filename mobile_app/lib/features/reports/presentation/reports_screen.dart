import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';

// Sub-report screens (built by parallel agents)
import 'package:mobile_app/features/reports/presentation/sales_summary_screen.dart';
import 'package:mobile_app/features/reports/presentation/ar_aging_screen.dart';
import 'package:mobile_app/features/reports/presentation/ap_aging_screen.dart';
import 'package:mobile_app/features/reports/presentation/inventory_report_screen.dart';
import 'package:mobile_app/features/reports/presentation/expenses_report_screen.dart';
import 'package:mobile_app/features/reports/presentation/purchases_report_screen.dart';
import 'package:mobile_app/features/reports/presentation/gstr1_screen.dart';
import 'package:mobile_app/features/reports/presentation/gstr3b_screen.dart';
import 'package:mobile_app/core/widgets/app_button.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/theme/dimens.dart';
import '../../../core/widgets/app_surfaces.dart';
import 'package:mobile_app/core/utils/money.dart';

// ---------------------------------------------------------------------------
// Internal summary provider (kept for overview KPIs)
// ---------------------------------------------------------------------------
class _ReportSummary {
  final double totalSales;
  final double totalCogs;
  final double totalExpenses;
  final double totalPurchases;
  final double totalReturns;
  final double netProfit;

  const _ReportSummary({
    required this.totalSales,
    required this.totalCogs,
    required this.totalExpenses,
    required this.totalPurchases,
    required this.totalReturns,
    required this.netProfit,
  });
}

final _reportSummaryProvider = FutureProvider.family<_ReportSummary,
    ({String tenantId, DateTimeRange range})>((ref, params) async {
  final start = params.range.start.toIso8601String().split('T').first;
  final end = params.range.end.toIso8601String().split('T').first;

  // Every one of these used to rely on RLS alone. params.tenantId was
  // accepted and then never used, so the filter that the rest of the app
  // applies everywhere was the one thing this screen left to the server.
  final tenantId = params.tenantId;

  final salesData = await supabase
      .from('sales')
      .select('totalAmount, totalCogs').isFilter('deleted_at', null)
      .eq('tenant_id', tenantId)
      .gte('date', start)
      .lte('date', end);

  final expensesData = await supabase
      .from('expenses')
      .select('amount').isFilter('deleted_at', null)
      .eq('tenant_id', tenantId)
      .gte('date', start)
      .lte('date', end);

  final purchasesData = await supabase
      .from('purchases')
      .select('total_amount').isFilter('deleted_at', null)
      .eq('tenant_id', tenantId)
      .gte('date', start)
      .lte('date', end);

  double totalReturns = 0;
  try {
    final returnsData = await supabase
        .from('sales_returns')
        .select('total_amount').isFilter('deleted_at', null)
        .eq('tenant_id', tenantId)
        .gte('date', start)
        .lte('date', end);
    for (final row in returnsData as List) {
      totalReturns += (row['total_amount'] as num? ?? 0).toDouble();
    }
  } catch (_) {
    // Shown as a line, never part of the headline, so a failure here must not
    // take the whole report down with it.
  }

  double totalSales = 0;
  double totalCogs = 0;
  for (final row in salesData as List) {
    totalSales += (row['totalAmount'] as num? ?? 0).toDouble();
    totalCogs += (row['totalCogs'] as num? ?? 0).toDouble();
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
    totalCogs: totalCogs,
    totalExpenses: totalExpenses,
    totalPurchases: totalPurchases,
    totalReturns: totalReturns,
    // Revenue less the cost of what was SOLD, less expenses.
    //
    // This subtracted PURCHASES, which is stock BOUGHT -- money that has left
    // the till but is still sitting on the shelf as an asset, not a cost. On
    // FUTURE DISPO this month that reported a ₹17,611 PROFIT for a month that
    // actually ran a ₹14,076 LOSS: wrong by ₹31,687 and, worse, wrong in SIGN.
    //
    // sales.totalCogs is the settled source of truth for cost of goods (batch
    // FIFO with a costPrice fallback) and is what the web P&L uses, so mobile
    // and web now answer the same question the same way.
    //
    // Returns are reported as a line but deliberately left OUT of this figure:
    // return COGS is a known open question in the GL/P&L reconciliation, and
    // folding an unsettled number into the headline would be trading one
    // wrong profit for another.
    netProfit: totalSales - totalCogs - totalExpenses,
  );
});

// ---------------------------------------------------------------------------
// Hub item model
// ---------------------------------------------------------------------------
class _HubItem {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final Widget Function() screenBuilder;

  const _HubItem(
    this.title,
    this.subtitle,
    this.icon,
    this.color,
    this.screenBuilder,
  );
}

final _reportHubItems = <_HubItem>[
  _HubItem('Sales Summary', 'Revenue, COGS, margin by day',
      LucideIcons.trendingUp, const Color(0xFF059669), () => const SalesSummaryScreen()),
  _HubItem('Money to Collect', 'Client dues by how overdue',
      LucideIcons.users, const Color(0xFF2563EB), () => const ArAgingScreen()),
  _HubItem('Money to Pay', 'Supplier dues by how overdue',
      LucideIcons.truck, const Color(0xFF7C3AED), () => const ApAgingScreen()),
  _HubItem('Inventory', 'Stock value + dead stock',
      LucideIcons.package, const Color(0xFFF59E0B), () => const InventoryReportScreen()),
  _HubItem('Expenses', 'Burn by category',
      LucideIcons.receipt, const Color(0xFFDC2626), () => const ExpensesReportScreen()),
  _HubItem('Purchases', 'Procurement by supplier',
      LucideIcons.shoppingBag, const Color(0xFF0891B2), () => const PurchasesReportScreen()),
  _HubItem('GSTR-1', 'Outward supplies',
      LucideIcons.fileText, const Color(0xFF065F46), () => const Gstr1Screen()),
  _HubItem('GSTR-3B', 'Monthly return summary',
      LucideIcons.fileCheck, const Color(0xFF1E3A5F), () => const Gstr3bScreen()),
];

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
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


  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return Scaffold(
      backgroundColor: AppColors.canvasWarm,
      appBar: AppBar(
        backgroundColor: AppColors.canvasWarm,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Just the title. The period is on the pill beside it and again
            // on the card below; printing it a third time here only made the
            // header wide enough to ellipsize the copy that was legible.
            Text('Reports', style: AppText.title),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: AppTappable(
   ripple: false,
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
                      style: AppText.label.copyWith(fontWeight: FontWeight.w700,
                        color: AppColors.primary),
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
                  // -------------------------------------------------------
                  // Net profit hero
                  // -------------------------------------------------------
                  // The card no longer changes colour with the result.
                  //
                  // It was amber when in profit and a red wash when not, so the
                  // surface itself passed judgement before the figure was read
                  // — and a loss arrived looking like an error state rather
                  // than a number. It is now the same dark ground every other
                  // headline figure uses, and only the FIGURE carries the
                  // sign: green in profit, red in loss. Contrast on the dark
                  // card is 8.52:1 green and 5.37:1 red, both past AA, which
                  // neither reading had on the amber tint.
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [AppColors.surfaceInverse, AppColors.surfaceInverseDeep],
                      ),
                      borderRadius: Radii.rLg,
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
                                  ? AppColors.successOnInverse
                                  : AppColors.errorOnInverse,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'NET PROFIT / LOSS',
                              style: AppText.label.copyWith(
                                letterSpacing: 0.6,
                                color: AppColors.onSurfaceInverseMuted,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          // _compact prints ₹-19062. The one figure the whole
                          // screen exists for was the only one not grouped.
                          // The sign leads, so it reads -₹19,062 rather than
                          // ₹-19,062.
                          '${summary.netProfit < 0 ? '-' : '+'}'
                          '${Money.inr(summary.netProfit.abs())}',
                          style: AppText.moneyHero.copyWith(
                            fontSize: 40,
                            letterSpacing: -2,
                            color: summary.netProfit >= 0
                                ? AppColors.successOnInverse
                                : AppColors.errorOnInverse,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${_fmt(_dateRange.start)} – ${_fmt(_dateRange.end)}',
                          style: AppText.caption
                              .copyWith(color: AppColors.onSurfaceInverseMuted),
                        ),

                        // The figures that MAKE the number above, on the same
                        // card as the number. They were three separate tiles
                        // below it, so the headline and its own arithmetic
                        // were different objects and the bars had nothing to
                        // be read against. Each bar is a share of revenue,
                        // which is what makes their lengths comparable.
                        const SizedBox(height: Gap.lg),
                        _PlBar(
                          label: 'Revenue',
                          value: summary.totalSales,
                          of: summary.totalSales,
                          tint: AppColors.successOnInverse,
                        ),
                        _PlBar(
                          label: 'COGS',
                          value: summary.totalCogs,
                          of: summary.totalSales,
                          tint: AppColors.brandFill,
                        ),
                        _PlBar(
                          label: 'Expenses',
                          value: summary.totalExpenses,
                          of: summary.totalSales,
                          tint: AppColors.errorOnInverse,
                        ),
                        _PlBar(
                          label: 'Returns',
                          value: summary.totalReturns,
                          of: summary.totalSales,
                          tint: AppColors.onSurfaceInverseMuted,
                        ),
                        // Stock BOUGHT, not stock sold. It is not part of the
                        // profit above and is labelled so it cannot be read
                        // as though it were -- subtracting it is exactly the
                        // bug this screen used to ship.
                        _PlBar(
                          label: 'Stock bought',
                          value: summary.totalPurchases,
                          of: summary.totalSales,
                          tint: AppColors.onSurfaceInverseMuted,
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 28),

                  // -------------------------------------------------------
                  // Report hub grid
                  // -------------------------------------------------------
                  SectionHeading('DETAILED REPORTS', icon: LucideIcons.layoutGrid),
                  const SizedBox(height: 12),

                  ..._reportHubItems.map((item) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _HubCard(
                          item: item,
                          tenantId: ctx.tenantId,
                          dateRange: _dateRange,
                        ),
                      )),
                ],
              ),
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(
              child: Text('Error: $e',
                  style: GoogleFonts.manrope(color: AppColors.danger)),
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Hub card widget
// ---------------------------------------------------------------------------
class _HubCard extends StatelessWidget {
  final _HubItem item;
  final String tenantId;
  final DateTimeRange dateRange;

  const _HubCard({
    required this.item,
    required this.tenantId,
    required this.dateRange,
  });

  @override
  Widget build(BuildContext context) {
    return AppTappable(
   ripple: false,
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => item.screenBuilder()),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: item.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(item.icon, color: item.color, size: 20),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    style: GoogleFonts.manrope(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: AppColors.inkPrimary,
                    ),
                  ),
                  Text(
                    item.subtitle,
                    style: AppText.caption.copyWith(color: AppColors.inkSecondary),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: item.color.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
              ),
              child:
                  Icon(LucideIcons.chevronRight, size: 16, color: item.color),
            ),
          ],
        ),
      ),
 );
  }
}

// ---------------------------------------------------------------------------
// Shared helper widgets
// ---------------------------------------------------------------------------


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
              style: AppText.title.copyWith(fontWeight: FontWeight.w900,
                letterSpacing: -0.5),
            ),
            const SizedBox(height: 8),
            Text(
              'Reports are available on PRO plan and above.',
              textAlign: TextAlign.center,
              style: GoogleFonts.manrope(
                  color: AppColors.inkSecondary, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// One line of the P&L, on the dark card
// ─────────────────────────────────────────────────────────────────────────────

class _PlBar extends StatelessWidget {
  final String label;
  final double value;

  /// Revenue. Every bar is drawn as a share of it, so their lengths can be
  /// compared to each other and to the top line.
  final double of;
  final Color tint;

  const _PlBar({
    required this.label,
    required this.value,
    required this.of,
    required this.tint,
  });

  @override
  Widget build(BuildContext context) {
    final frac = of <= 0 ? 0.0 : (value / of).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.only(top: Gap.sm),
      child: Row(
        children: [
          SizedBox(
            width: 86,
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.caption
                  .copyWith(color: AppColors.onSurfaceInverseMuted),
            ),
          ),
          Gap.w8,
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: SizedBox(
                height: 6,
                child: Stack(
                  children: [
                    const ColoredBox(
                      color: AppColors.outlineInverse,
                      child: SizedBox(width: double.infinity, height: 6),
                    ),
                    FractionallySizedBox(
                      widthFactor: frac,
                      child: ColoredBox(
                        color: tint,
                        child: const SizedBox(height: 6),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Gap.w8,
          SizedBox(
            width: 92,
            child: Text(
              Money.inr(value),
              textAlign: TextAlign.right,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.label
                  .copyWith(color: AppColors.onSurfaceInverse),
            ),
          ),
        ],
      ),
    );
  }
}
