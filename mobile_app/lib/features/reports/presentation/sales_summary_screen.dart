import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_widgets.dart';

String _method(String m) => switch (m.toUpperCase()) {
      'CASH' => 'Cash',
      'UPI' => 'UPI',
      'BANK' => 'Bank',
      'CARD' => 'Card',
      'CREDIT' => 'Credit',
      '' => '',
      _ => '${m[0].toUpperCase()}${m.substring(1).toLowerCase()}',
    };

/// "Sales Summary" (canvas): revenue for a period, by day, and each sale.
class SalesSummaryScreen extends ConsumerStatefulWidget {
  const SalesSummaryScreen({super.key});

  @override
  ConsumerState<SalesSummaryScreen> createState() => _SalesSummaryScreenState();
}

class _SalesSummaryScreenState extends ConsumerState<SalesSummaryScreen> {
  DateTimeRange _range = reportLastDays(30);

  @override
  Widget build(BuildContext context) {
    return ReportPage(
      title: 'Sales Summary',
      range: _range,
      builder: (context, params) {
        final salesAsync = ref.watch(reportSalesProvider(params));
        return salesAsync.when(
          loading: () => const ReportLoading(),
          error: (e, _) => ReportError(e),
          data: (sales) {
            // ── Computations ────────────────────────────────────────────
            final totalRevenue = sales.fold(
                0.0, (s, e) => s + ((e['totalAmount'] as num?)?.toDouble() ?? 0));
            final totalCogs = sales.fold(
                0.0, (s, e) => s + ((e['totalCogs'] as num?)?.toDouble() ?? 0));
            final totalOrders = sales.length;
            final aov = totalOrders > 0 ? totalRevenue / totalOrders : 0.0;
            final profit = totalRevenue - totalCogs;
            final marginPct =
                totalRevenue > 0 ? profit / totalRevenue * 100 : 0.0;

            final Map<String, double> byDate = {};
            for (final s in sales) {
              final d = ((s['date'] as String?) ?? '').split('T').first;
              byDate[d] = (byDate[d] ?? 0) +
                  ((s['totalAmount'] as num?)?.toDouble() ?? 0);
            }
            final list = [...sales]..sort((a, b) =>
                ((b['date'] as String?) ?? '')
                    .compareTo((a['date'] as String?) ?? ''));
            final shown = list.take(50).toList();

            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                ReportRangeBar(
                    range: _range,
                    onChanged: (r) => setState(() => _range = r)),
                ReportHero(
                  label: 'Revenue',
                  value: Money.inr(totalRevenue),
                  stats: [
                    ReportStat('$totalOrders',
                        totalOrders == 1 ? 'Order' : 'Orders'),
                    ReportStat(Money.inr(aov), 'Avg order'),
                    ReportStat('${marginPct.toStringAsFixed(1)}%',
                        'Gross margin',
                        color: marginPct < 0 ? Bl.redDeep : reportGreen),
                  ],
                ),
                const BlGroupHeader('Revenue by day',
                    trailing: 'LAST 7 DAYS'),
                ReportDayBars(byDate: byDate, range: _range),
                BlGroupHeader('Sales', trailing: '$totalOrders'),
                if (sales.isEmpty)
                  const BlEmpty(
                    icon: BlIcons.receipt,
                    title: 'No sales in these dates',
                    message: 'Pick a wider range to see older sales.',
                  ),
                for (final sale in shown)
                  Builder(builder: (context) {
                    final info = sale['customerInfo'] is Map
                        ? sale['customerInfo'] as Map
                        : const {};
                    final name = ((info['name'] as String?) ??
                            (info['customerName'] as String?) ??
                            '')
                        .trim();
                    final items = sale['items'];
                    final count = items is List ? items.length : 0;
                    final voided =
                        (sale['status'] as String? ?? '').toUpperCase() ==
                            'VOIDED';
                    return ReportEntryRow(
                      leading: BlPartyAvatar(name, size: 40),
                      name: name.isEmpty ? 'Walk-in' : name,
                      sub: [
                        reportDate((sale['date'] as String?) ?? ''),
                        _method((sale['paymentMethod'] as String?) ?? ''),
                        if (count > 0) '$count item${count == 1 ? '' : 's'}',
                        if (voided) 'voided',
                      ].where((s) => s.isNotEmpty).join(' · '),
                      amount: Money.inr(
                          (sale['totalAmount'] as num?)?.toDouble() ?? 0),
                    );
                  }),
                if (list.length > shown.length)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
                    child: Text(
                        'Showing the latest ${shown.length} of ${list.length} sales.',
                        style: Bl.inter(12, c: reportGrey)),
                  ),
              ],
            );
          },
        );
      },
    );
  }
}
