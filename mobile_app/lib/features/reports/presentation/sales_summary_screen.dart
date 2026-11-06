import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/app_states.dart';
import 'package:mobile_app/features/reports/data/profit_loss.dart';
import 'package:mobile_app/features/reports/data/profit_loss_provider.dart';
import 'package:mobile_app/features/reports/data/report_params.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/date_range_chip.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_kpi_tile.dart';
import 'package:mobile_app/features/reports/presentation/widgets/simple_bar_chart.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart';
import 'package:mobile_app/core/theme/typography.dart';

class SalesSummaryScreen extends ConsumerStatefulWidget {
  const SalesSummaryScreen({super.key});

  @override
  ConsumerState<SalesSummaryScreen> createState() => _SalesSummaryScreenState();
}

class _SalesSummaryScreenState extends ConsumerState<SalesSummaryScreen> {
  DateTimeRange _range = defaultPlRange();

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
        return _SalesSummaryView(
          params: params,
          range: _range,
          onRangeChanged: (r) => setState(() => _range = r),
        );
      },
    );
  }
}

class _SalesSummaryView extends ConsumerWidget {
  final ReportParams params;
  final DateTimeRange range;
  final ValueChanged<DateTimeRange> onRangeChanged;

  const _SalesSummaryView({
    required this.params,
    required this.range,
    required this.onRangeChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final salesAsync = ref.watch(reportSalesProvider(params));

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 16,
        title: Text(
          'Sales Summary',
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
      body: salesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => isConnectionError(e)
            ? AppEmptyState(
                icon: LucideIcons.wifiOff,
                title: 'Needs internet',
                message: 'Sales and margin come from the server, so they match the web.',
                actionLabel: 'Try again',
                onAction: () => ref.invalidate(reportSalesProvider(params)),
              )
            : Center(
                child: Text(
                  'Failed to load sales\n$e',
                  textAlign: TextAlign.center,
                  style: AppText.caption.copyWith(color: AppColors.danger),
                ),
              ),
        data: (sales) => _SalesBody(
          sales: sales,
          query: (tenantId: params.tenantId, from: params.fromIso, to: params.toIso),
        ),
      ),
    );
  }
}

class _SalesBody extends ConsumerWidget {
  final List<Map<String, dynamic>> sales;
  final PlQuery query;

  const _SalesBody({required this.sales, required this.query});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // ── Computations ──────────────────────────────────────────────────────────
    final totalRevenue = sales.fold(
        0.0, (s, e) => s + ((e['totalAmount'] as num?)?.toDouble() ?? 0));
    final totalOrders = sales.length;
    final aov = totalOrders > 0 ? totalRevenue / totalOrders : 0.0;
    // Net sales and margin are the server's, the same call as the Reports hub
    // and the web's Financial report. The bills below them are as billed, with
    // GST, which is why their total is not labelled as revenue or profit.
    final plAsync = ref.watch(profitLossProvider(query));
    final pl = plAsync.valueOrNull;
    final plNote = plAsync.isLoading
        ? 'Loading'
        : plAsync.error is ProfitOffline
            ? 'Needs internet'
            : plAsync.hasError
                ? 'Could not load'
                : null;

    // Group by date for bar chart
    final Map<String, double> byDate = {};
    for (final s in sales) {
      final d = (s['date'] as String?) ?? '';
      byDate[d] = (byDate[d] ?? 0) + ((s['totalAmount'] as num?)?.toDouble() ?? 0);
    }
    final sortedDates = byDate.keys.toList()..sort();

    // Last 14 bars max
    final chartDates =
        sortedDates.length > 14 ? sortedDates.sublist(sortedDates.length - 14) : sortedDates;

    final bars = chartDates.map((d) {
      // Shorten label: show day/month only (e.g. "15/05")
      final parts = d.split('-');
      final label = parts.length >= 3 ? '${parts[2]}/${parts[1]}' : d;
      return BarData(
        label: label,
        value: byDate[d]!,
        color: const Color(0xFF16A34A),
      );
    }).toList();

    if (sales.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.trendingUp,
                size: 48, color: AppColors.inkTertiary.withValues(alpha: 0.5)),
            const SizedBox(height: 16),
            Text(
              'No sales in this period',
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
        // ── KPI grid 2×2 ──────────────────────────────────────────────────────
        _SectionLabel('Key Metrics'),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: ReportKpiTile(
                label: 'Net sales',
                value: pl == null ? '—' : compactINR(pl.netSales),
                subtitle: plNote ?? 'after GST and returns',
                icon: LucideIcons.indianRupee,
                color: const Color(0xFF16A34A),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ReportKpiTile(
                label: 'Gross margin',
                value: pl == null
                    ? '—'
                    : pl.grossMarginPct == null
                        ? 'No sales'
                        : '${pl.grossMarginPct!.toStringAsFixed(1)}%',
                subtitle: plNote ?? 'of net sales',
                icon: LucideIcons.percent,
                color: const Color(0xFF0D9488),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: ReportKpiTile(
                label: 'Billed',
                value: compactINR(totalRevenue),
                subtitle: 'with GST',
                icon: LucideIcons.receipt,
                color: const Color(0xFF2563EB),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ReportKpiTile(
                label: 'Bills',
                value: '$totalOrders',
                subtitle: 'average ${compactINR(aov)}',
                icon: LucideIcons.shoppingCart,
                color: const Color(0xFF7C3AED),
              ),
            ),
          ],
        ),

        // ── Bar chart ─────────────────────────────────────────────────────────
        const SizedBox(height: 24),
        _SectionLabel('Billed by day, with GST'),
        const SizedBox(height: 10),
        _ChartCard(
          child: SimpleBarChart(bars: bars, height: 24.0 * chartDates.length.clamp(4, 14) + 8),
        ),

        // ── Sales list ────────────────────────────────────────────────────────
        const SizedBox(height: 24),
        _SectionLabel('Sales (${sales.length})'),
        const SizedBox(height: 10),
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: sales.length,
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            final sale = sales[index];
            final date = (sale['date'] as String?) ?? '';
            final customerInfo =
                sale['customerInfo'] is Map ? sale['customerInfo'] as Map : <String, dynamic>{};
            final customerName = (customerInfo['name'] as String?) ??
                (customerInfo['customerName'] as String?) ??
                'Walk-in';
            final items = sale['items'];
            final itemCount = (items is List) ? items.length : 0;
            final paymentMethod = (sale['paymentMethod'] as String?) ?? '';
            final totalAmount = (sale['totalAmount'] as num?)?.toDouble() ?? 0.0;
            final status = sale['status'] as String?;

            return _SaleCard(
              date: date,
              customerName: customerName,
              itemCount: itemCount,
              paymentMethod: paymentMethod,
              totalAmount: totalAmount,
              status: status,
            );
          },
        ),
      ],
    );
  }
}

// ── Sale card ───────────────────────────────────────────────────────────────

class _SaleCard extends StatelessWidget {
  final String date;
  final String customerName;
  final int itemCount;
  final String paymentMethod;
  final double totalAmount;
  final String? status;

  const _SaleCard({
    required this.date,
    required this.customerName,
    required this.itemCount,
    required this.paymentMethod,
    required this.totalAmount,
    this.status,
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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Left: date + customer + items
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  date,
                  style: AppText.caption.copyWith(color: AppColors.inkTertiary),
                ),
                const SizedBox(height: 2),
                Text(
                  customerName,
                  style: GoogleFonts.manrope(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  '$itemCount item${itemCount == 1 ? '' : 's'}',
                  style: AppText.caption.copyWith(color: AppColors.inkSecondary),
                ),
              ],
            ),
          ),

          // Right: amount + pills
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                compactINR(totalAmount),
                style: AppText.bodyStrong.copyWith(fontWeight: FontWeight.w700,
                  color: const Color(0xFF16A34A)),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  if (paymentMethod.isNotEmpty)
                    _Pill(
                      label: paymentMethod,
                      background: AppColors.surfaceContainer,
                      foreground: AppColors.inkSecondary,
                    ),
                  if (status != null) ...[
                    const SizedBox(width: 6),
                    _Pill(
                      label: status!,
                      background: _statusBg(status!),
                      foreground: _statusFg(status!),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  static Color _statusBg(String status) => switch (status.toLowerCase()) {
        'completed' || 'paid' => const Color(0xFFDCFCE7),
        'pending' => const Color(0xFFFEF9C3),
        'cancelled' || 'refunded' => const Color(0xFFFFE4E6),
        _ => AppColors.surfaceContainer,
      };

  static Color _statusFg(String status) => switch (status.toLowerCase()) {
        'completed' || 'paid' => const Color(0xFF15803D),
        'pending' => const Color(0xFF854D0E),
        'cancelled' || 'refunded' => const Color(0xFF9F1239),
        _ => AppColors.inkSecondary,
      };
}

// ── Shared helpers ───────────────────────────────────────────────────────────

class _Pill extends StatelessWidget {
  final String label;
  final Color background;
  final Color foreground;

  const _Pill({
    required this.label,
    required this.background,
    required this.foreground,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: AppText.label.copyWith(color: foreground),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: AppText.label.copyWith(fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
        color: AppColors.inkTertiary),
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
