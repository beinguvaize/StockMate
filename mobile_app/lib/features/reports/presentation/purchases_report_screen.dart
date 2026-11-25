import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_widgets.dart';

String _qty(double v) => Money.plain(v == v.roundToDouble() ? v : v.round());

/// "Purchases" report (canvas): what was bought in a period, by supplier.
class PurchasesReportScreen extends ConsumerStatefulWidget {
  const PurchasesReportScreen({super.key});

  @override
  ConsumerState<PurchasesReportScreen> createState() =>
      _PurchasesReportScreenState();
}

class _PurchasesReportScreenState extends ConsumerState<PurchasesReportScreen> {
  DateTimeRange _range = reportLastDays(30);

  @override
  Widget build(BuildContext context) {
    return ReportPage(
      title: 'Purchases',
      range: _range,
      builder: (context, params) {
        final async = ref.watch(reportPurchasesProvider(params));
        return async.when(
          loading: () => const ReportLoading(),
          error: (e, _) => ReportError(e),
          data: (purchases) {
            double amt(Map<String, dynamic> p) =>
                (p['total_amount'] as num?)?.toDouble() ?? 0;
            String sup(Map<String, dynamic> p) =>
                (p['supplier_name'] as String?) ?? 'Unknown';
            final total = purchases.fold(0.0, (s, p) => s + amt(p));
            final totalQty = purchases.fold(
                0.0, (s, p) => s + ((p['quantity'] as num?)?.toDouble() ?? 0));
            final bySupplier = <String, (double, int)>{};
            for (final p in purchases) {
              final cur = bySupplier[sup(p)] ?? (0.0, 0);
              bySupplier[sup(p)] = (cur.$1 + amt(p), cur.$2 + 1);
            }
            final shares = reportTopShares(bySupplier);
            final list = [...purchases]..sort((a, b) =>
                ((b['date'] as String?) ?? '')
                    .compareTo((a['date'] as String?) ?? ''));
            final shown = list.take(50).toList();

            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                ReportRangeBar(
                    range: _range,
                    onChanged: (r) => setState(() => _range = r)),
                ReportDonut(
                  values: [for (final s in shares) s.value],
                  total: Money.inr(total),
                  label: 'Bought',
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
                  child: Row(
                    children: [
                      ReportStat('${bySupplier.length}',
                          bySupplier.length == 1 ? 'Supplier' : 'Suppliers',
                          center: true),
                      const SizedBox(width: 10),
                      ReportStat(_qty(totalQty), 'Items', center: true),
                      const SizedBox(width: 10),
                      ReportStat('${purchases.length}',
                          purchases.length == 1 ? 'Order' : 'Orders',
                          center: true),
                    ],
                  ),
                ),
                BlGroupHeader('By supplier',
                    trailing: '${bySupplier.length}'),
                if (purchases.isEmpty)
                  const BlEmpty(
                    icon: BlIcons.cart,
                    title: 'Nothing bought in these dates',
                    message: 'Pick a wider range to see older purchases.',
                  ),
                for (var i = 0; i < shares.length; i++)
                  ReportShareRow(
                    color: reportShareColors[i],
                    name: shares[i].name,
                    sub:
                        '${shares[i].count} order${shares[i].count == 1 ? '' : 's'}',
                    amount: shares[i].value,
                    total: total,
                  ),
                if (shown.isNotEmpty)
                  BlGroupHeader('Recent purchases',
                      trailing: '${purchases.length}'),
                for (final p in shown)
                  ReportEntryRow(
                    name: sup(p),
                    sub: [
                      reportDate((p['date'] as String?) ?? '', year: true),
                      if (((p['payment_type'] as String?) ?? '').isNotEmpty)
                        '${(p['payment_type'] as String)[0].toUpperCase()}${(p['payment_type'] as String).substring(1).toLowerCase()}',
                    ].join(' · '),
                    amount: Money.inr(amt(p)),
                  ),
                if (list.length > shown.length)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
                    child: Text(
                        'Showing the latest ${shown.length} of ${list.length} purchases.',
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
